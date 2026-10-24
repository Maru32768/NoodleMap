package dev.marulabs.noodlemap.places

import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthGooglePlacesAutocompleteController
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthGooglePlacesDetailsController
import dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall
import dev.marulabs.noodlemap.generated.models.PlaceDetails
import dev.marulabs.noodlemap.generated.models.PlaceSuggestion
import dev.marulabs.noodlemap.generated.models.PlaceSuggestionsResponse
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.future.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.slf4j.LoggerFactory

/**
 * Admin-only proxy to Google Places API (New), so the Places key stays on the server.
 * [baseUrl] is injectable so tests can point it at a local fake.
 */
class PlacesHandler(
    private val sessions: SessionService,
    private val apiKey: String,
    private val baseUrl: String = "https://places.googleapis.com",
    private val http: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build(),
) : ApiV1AuthGooglePlacesAutocompleteController, ApiV1AuthGooglePlacesDetailsController {

    override suspend fun googlePlacesAutocomplete(
        q: String,
        sessionToken: String,
        lat: Double?,
        lng: Double?,
        call: TypedApplicationCall<PlaceSuggestionsResponse>,
    ) {
        sessions.requireAdmin(call)
        requireKey()
        requireSessionToken(sessionToken)
        val near = if (lat != null && lng != null) lat to lng else null
        if (near != null && (near.first !in -90.0..90.0 || near.second !in -180.0..180.0)) {
            throw DomainException.InvalidRequest("invalid location")
        }
        val input = q.trim()
        if (input.isEmpty()) {
            call.respondTyped(PlaceSuggestionsResponse(emptyList()))
            return
        }

        val body = buildJsonObject {
            put("input", input)
            put("sessionToken", sessionToken)
            put("languageCode", "ja")
            put("regionCode", "JP")
            putJsonArray("includedRegionCodes") { add("jp") }
            if (near != null) {
                putJsonObject("locationBias") {
                    putJsonObject("circle") {
                        putJsonObject("center") {
                            put("latitude", near.first)
                            put("longitude", near.second)
                        }
                        put("radius", LOCATION_BIAS_RADIUS_M)
                    }
                }
            }
        }
        val request = request("/v1/places:autocomplete", AUTOCOMPLETE_FIELDS)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
        val res = send<AutocompleteResponse>(request)

        call.respondTyped(
            PlaceSuggestionsResponse(
                res.suggestions.mapNotNull { it.placePrediction }.map {
                    PlaceSuggestion(
                        placeId = it.placeId,
                        mainText = it.structuredFormat?.mainText?.text?.ifEmpty { null } ?: it.text?.text.orEmpty(),
                        secondaryText = it.structuredFormat?.secondaryText?.text?.ifEmpty { null },
                    )
                }.filter { it.mainText.isNotEmpty() },
            ),
        )
    }

    override suspend fun googlePlacesDetails(placeId: String, sessionToken: String, call: TypedApplicationCall<PlaceDetails>) {
        sessions.requireAdmin(call)
        requireKey()
        requireSessionToken(sessionToken)
        // The id becomes a URL path segment; reject anything that is not a Place ID shape.
        if (!PLACE_ID.matches(placeId)) throw DomainException.InvalidRequest("invalid place id")

        val query = "sessionToken=${URLEncoder.encode(sessionToken, Charsets.UTF_8)}&languageCode=ja&regionCode=JP"
        val place = send<Place>(request("/v1/places/$placeId?$query", DETAILS_FIELDS).GET(), notFoundIsClientError = true)

        call.respondTyped(
            PlaceDetails(
                placeId = place.id,
                name = place.displayName?.text.orEmpty(),
                postalCode = place.addressComponents.firstOrNull { "postal_code" in it.types }?.shortText.orEmpty(),
                address = normalizeAddress(place.formattedAddress.orEmpty()),
                lat = place.location.latitude,
                lng = place.location.longitude,
                closed = place.businessStatus == "CLOSED_PERMANENTLY",
            ),
        )
    }

    private fun requireKey() {
        if (apiKey.isBlank()) throw DomainException.GooglePlacesNotConfigured()
    }

    private fun requireSessionToken(token: String) {
        if (!SESSION_TOKEN.matches(token)) throw DomainException.InvalidRequest("invalid session token")
    }

    private fun request(path: String, fieldMask: String): HttpRequest.Builder =
        HttpRequest.newBuilder(URI.create(baseUrl + path))
            .timeout(Duration.ofSeconds(10))
            .header("X-Goog-Api-Key", apiKey)
            .header("X-Goog-FieldMask", fieldMask)

    private suspend inline fun <reified T> send(request: HttpRequest.Builder, notFoundIsClientError: Boolean = false): T {
        val res = try {
            http.sendAsync(request.build(), HttpResponse.BodyHandlers.ofString()).await()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            throw DomainException.GooglePlacesFailed(e)
        }
        val status = res.statusCode()
        if (status !in 200..299) {
            // Google's error body never echoes the key, so it is safe to log.
            log.warn("Google Places HTTP {}: {}", status, res.body().take(500))
            if (isClientError(status, res.body(), notFoundIsClientError)) {
                throw DomainException.InvalidRequest("google places rejected the request")
            }
            throw DomainException.GooglePlacesFailed(IllegalStateException("Google Places HTTP $status"))
        }
        return try {
            json.decodeFromString<T>(res.body())
        } catch (e: Exception) {
            throw DomainException.GooglePlacesFailed(e)
        }
    }

    companion object {
        private val log = LoggerFactory.getLogger(PlacesHandler::class.java)
        private val json = Json { ignoreUnknownKeys = true }
        private val PLACE_ID = Regex("^[A-Za-z0-9_-]{1,512}$")
        private val SESSION_TOKEN = Regex("^[A-Za-z0-9_-]{1,36}$")
        // A bias, not a restriction: a shop the admin names outright still shows when it is farther.
        private const val LOCATION_BIAS_RADIUS_M = 300.0
        private const val AUTOCOMPLETE_FIELDS =
            "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat"
        private const val DETAILS_FIELDS = "id,displayName,formattedAddress,addressComponents,location,businessStatus"
        // Not \S: in Java that also matches the full-width space U+3000.
        private val LEADING_POSTAL_CODE = Regex("^〒[0-9０-９\\-－]+[\\s　]+")

        /**
         * Bad input (an unknown place id, a malformed argument) is the caller's error; key, quota
         * and permission problems such as 400 API_KEY_INVALID or 403 are ours and stay 502.
         */
        private fun isClientError(status: Int, body: String, notFoundIsClientError: Boolean): Boolean =
            (status == 404 && notFoundIsClientError) ||
                (status == 400 && "INVALID_ARGUMENT" in body && "API_KEY" !in body)

        /** Drops the leading "日本、" and "〒123-4567 " that Places prepends to Japanese addresses. */
        fun normalizeAddress(formatted: String): String =
            formatted.trim().removePrefix("日本、").replace(LEADING_POSTAL_CODE, "")
    }
}

@Serializable
private data class AutocompleteResponse(val suggestions: List<Suggestion> = emptyList())

@Serializable
private data class Suggestion(val placePrediction: PlacePrediction? = null)

@Serializable
private data class PlacePrediction(
    val placeId: String,
    val text: LocalizedText? = null,
    val structuredFormat: StructuredFormat? = null,
)

@Serializable
private data class StructuredFormat(val mainText: LocalizedText? = null, val secondaryText: LocalizedText? = null)

@Serializable
private data class LocalizedText(val text: String = "")

@Serializable
private data class Place(
    val id: String,
    val displayName: LocalizedText? = null,
    val formattedAddress: String? = null,
    val addressComponents: List<AddressComponent> = emptyList(),
    val location: LatLng,
    val businessStatus: String? = null,
)

@Serializable
private data class AddressComponent(val shortText: String? = null, val types: List<String> = emptyList())

@Serializable
private data class LatLng(val latitude: Double, val longitude: Double)
