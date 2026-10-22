package dev.marulabs.noodlemap.places

import com.sun.net.httpserver.HttpServer
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.errors.ErrorBody
import dev.marulabs.noodlemap.errors.ErrorType
import dev.marulabs.noodlemap.generated.models.PlaceDetails
import dev.marulabs.noodlemap.generated.models.PlaceSuggestion
import dev.marulabs.noodlemap.generated.models.PlaceSuggestionsResponse
import dev.marulabs.noodlemap.session
import dev.marulabs.noodlemap.testApp
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import java.net.InetSocketAddress
import org.junit.jupiter.api.Test

class PlacesApiTest {

    private data class Recorded(val method: String, val uri: String, val headers: Map<String, String?>, val body: String)

    /** A local stand-in for places.googleapis.com that answers every request with [status]/[body]. */
    private class FakeGoogle(status: Int, body: String) : AutoCloseable {
        val requests = mutableListOf<Recorded>()
        private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/") { ex ->
                requests += Recorded(
                    ex.requestMethod,
                    ex.requestURI.toString(),
                    ex.requestHeaders.mapValues { it.value.firstOrNull() }.mapKeys { it.key.lowercase() },
                    ex.requestBody.readBytes().decodeToString(),
                )
                val bytes = body.encodeToByteArray()
                ex.sendResponseHeaders(status, bytes.size.toLong())
                ex.responseBody.use { it.write(bytes) }
            }
            start()
        }
        val url = "http://127.0.0.1:${server.address.port}"
        override fun close() = server.stop(0)
    }

    private val autocompletePath = "/api/v1/auth/google-places/autocomplete?q=%E3%83%A9%E3%83%BC%E3%83%A1%E3%83%B3&sessionToken=tok-1"
    private val detailsPath = "/api/v1/auth/google-places/details?placeId=ChIJ_abc-1&sessionToken=tok-1"

    @Test
    fun `guests get 401 and non-admins get 403`() = testApp(placesApiKey = "key") { t ->
        for (path in listOf(autocompletePath, detailsPath)) {
            client.get(path).status shouldBe HttpStatusCode.Unauthorized
            client.get(path) { session(t.userToken()) }.status shouldBe HttpStatusCode.Forbidden
        }
    }

    @Test
    fun `missing api key returns 503 google_places_not_configured`() = testApp { t ->
        val admin = t.adminToken()
        for (path in listOf(autocompletePath, detailsPath)) {
            val res = client.get(path) { session(admin) }
            res.status shouldBe HttpStatusCode.ServiceUnavailable
            res.body<ErrorBody>().type shouldBe ErrorType.GOOGLE_PLACES_NOT_CONFIGURED
        }
    }

    @Test
    fun `autocomplete proxies to Places API (New) and maps suggestions`() = FakeGoogle(
        200,
        """
        {"suggestions":[
          {"placePrediction":{"placeId":"p1","text":{"text":"ラーメン太郎 新宿"},
            "structuredFormat":{"mainText":{"text":"ラーメン太郎"},"secondaryText":{"text":"東京都新宿区"}}}},
          {"queryPrediction":{"text":{"text":"ラーメン 近く"}}},
          {"placePrediction":{"placeId":"p2","text":{"text":"麺屋"}}},
          {"placePrediction":{"placeId":"p3","text":{}}}
        ]}
        """,
    ).use { google ->
        testApp(placesApiKey = "secret", placesBaseUrl = google.url) { t ->
            val res = client.get(autocompletePath) { session(t.adminToken()) }

            res.status shouldBe HttpStatusCode.OK
            res.body<PlaceSuggestionsResponse>().suggestions shouldBe listOf(
                PlaceSuggestion("p1", "ラーメン太郎", "東京都新宿区"),
                PlaceSuggestion("p2", "麺屋", null),
                PlaceSuggestion("p3", "", null),
            )
            val req = google.requests.single()
            req.method shouldBe "POST"
            req.uri shouldBe "/v1/places:autocomplete"
            req.headers["x-goog-api-key"] shouldBe "secret"
            req.headers["x-goog-fieldmask"]!! shouldContain "suggestions.placePrediction.placeId"
            req.body shouldContain "\"input\":\"ラーメン\""
            req.body shouldContain "\"sessionToken\":\"tok-1\""
            req.body shouldContain "\"includedRegionCodes\":[\"jp\"]"
        }
    }

    @Test
    fun `blank query returns no suggestions without calling Google`() = FakeGoogle(500, "").use { google ->
        testApp(placesApiKey = "secret", placesBaseUrl = google.url) { t ->
            val res = client.get("/api/v1/auth/google-places/autocomplete?q=%20&sessionToken=tok") { session(t.adminToken()) }

            res.body<PlaceSuggestionsResponse>().suggestions shouldBe emptyList()
            google.requests shouldBe emptyList()
        }
    }

    @Test
    fun `details maps the place and normalizes the address`() = FakeGoogle(
        200,
        """
        {"id":"ChIJ_abc-1","displayName":{"text":"ラーメン太郎","languageCode":"ja"},
         "formattedAddress":"日本、〒160-0022 東京都新宿区新宿３丁目１−１",
         "addressComponents":[{"longText":"東京都","shortText":"東京都","types":["administrative_area_level_1"]},
                              {"longText":"160-0022","shortText":"160-0022","types":["postal_code"]}],
         "location":{"latitude":35.69,"longitude":139.70},"businessStatus":"CLOSED_PERMANENTLY"}
        """,
    ).use { google ->
        testApp(placesApiKey = "secret", placesBaseUrl = google.url) { t ->
            val res = client.get(detailsPath) { session(t.adminToken()) }

            res.status shouldBe HttpStatusCode.OK
            res.body<PlaceDetails>() shouldBe PlaceDetails(
                placeId = "ChIJ_abc-1", name = "ラーメン太郎", postalCode = "160-0022",
                address = "東京都新宿区新宿３丁目１−１", lat = 35.69, lng = 139.70, closed = true,
            )
            val req = google.requests.single()
            req.method shouldBe "GET"
            req.uri shouldBe "/v1/places/ChIJ_abc-1?sessionToken=tok-1&languageCode=ja&regionCode=JP"
            req.headers["x-goog-fieldmask"] shouldBe "id,displayName,formattedAddress,addressComponents,location,businessStatus"
        }
    }

    @Test
    fun `Google errors and unusable responses become 502 google_places_failed`() {
        for ((status, body) in listOf(403 to """{"error":{"status":"PERMISSION_DENIED"}}""", 200 to "not json", 200 to "{}")) {
            FakeGoogle(status, body).use { google ->
                testApp(placesApiKey = "secret", placesBaseUrl = google.url) { t ->
                    val res = client.get(detailsPath) { session(t.adminToken()) }

                    res.status shouldBe HttpStatusCode.BadGateway
                    res.body<ErrorBody>() shouldBe ErrorBody(ErrorType.GOOGLE_PLACES_FAILED, "google places request failed")
                }
            }
        }
    }

    @Test
    fun `Google rejecting the input becomes 400 invalid_request`() {
        for (status in listOf(400, 404)) {
            FakeGoogle(status, """{"error":{"status":"NOT_FOUND"}}""").use { google ->
                testApp(placesApiKey = "secret", placesBaseUrl = google.url) { t ->
                    val res = client.get(detailsPath) { session(t.adminToken()) }

                    res.status shouldBe HttpStatusCode.BadRequest
                    res.body<ErrorBody>().type shouldBe ErrorType.INVALID_REQUEST
                }
            }
        }
    }

    @Test
    fun `session tokens that are not short URL-safe strings are rejected before calling Google`() = FakeGoogle(200, "{}").use { google ->
        testApp(placesApiKey = "secret", placesBaseUrl = google.url) { t ->
            val admin = t.adminToken()
            for (token in listOf("a%26b", "x".repeat(37), "")) {
                val res = client.get("/api/v1/auth/google-places/autocomplete?q=a&sessionToken=$token") { session(admin) }
                res.status shouldBe HttpStatusCode.BadRequest
            }
            google.requests shouldBe emptyList()
        }
    }

    @Test
    fun `unreachable Google becomes 502`() = testApp(placesApiKey = "secret") { t ->
        val res = client.get(autocompletePath) { session(t.adminToken()) }

        res.status shouldBe HttpStatusCode.BadGateway
        res.body<ErrorBody>().type shouldBe ErrorType.GOOGLE_PLACES_FAILED
    }

    @Test
    fun `place ids that are not path-safe are rejected before calling Google`() = testApp(placesApiKey = "secret") { t ->
        val res = client.get("/api/v1/auth/google-places/details?placeId=..%2Fother&sessionToken=tok") { session(t.adminToken()) }

        res.status shouldBe HttpStatusCode.BadRequest
        res.body<ErrorBody>().type shouldBe ErrorType.INVALID_REQUEST
    }

    @Test
    fun `address normalization keeps addresses without a country or postal prefix`() {
        PlacesHandler.normalizeAddress("〒100-0005 東京都千代田区丸の内１丁目") shouldBe "東京都千代田区丸の内１丁目"
        PlacesHandler.normalizeAddress("日本、東京都千代田区") shouldBe "東京都千代田区"
        PlacesHandler.normalizeAddress("東京都千代田区") shouldBe "東京都千代田区"
        PlacesHandler.normalizeAddress("〒160-0022\u3000ABC\u3000DEF") shouldBe "ABC\u3000DEF"
    }
}
