package dev.marulabs.noodlemap.og

import dev.marulabs.noodlemap.common.BitmapWorkGate
import dev.marulabs.noodlemap.common.JST
import dev.marulabs.noodlemap.common.retrySoon
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.shops.ShopHandler
import dev.marulabs.noodlemap.shops.ShopRecord
import dev.marulabs.noodlemap.mealrecords.MealRecordImageStore
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.withCharset
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondRedirect
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.head
import io.ktor.util.escapeHTML
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import org.slf4j.LoggerFactory

private const val OG_SHOPS_PATH = "/api/v1/og/shops/"
private const val SEARCH_PATH = "/search"
private const val IMMUTABLE = "public, max-age=31536000, immutable"

private val log = LoggerFactory.getLogger("Og")

fun Route.ogRoutes(og: OgHandler) {
    get("$OG_SHOPS_PATH{id}") { og.meta(call) }
    get("$OG_SHOPS_PATH{id}/{hash}.png") { og.image(call, head = false) }
    head("$OG_SHOPS_PATH{id}/{hash}.png") { og.image(call, head = true) }
}

/** The headers of a GET response without its body, for HEAD (crawlers probe with it). */
private class HeadOnly(override val contentType: ContentType) : OutgoingContent.NoContent()

/**
 * A rendered image. [fallback]: the card has a 代表写真 that would not decode, so the text card was drawn
 * instead; it is served uncached and never stored under the photo card's hash.
 */
private class Rendered(val png: ByteArray, val fallback: Boolean)

/** A rendered image and whether it is now in the store. */
private class Produced(val rendered: Rendered, val stored: Boolean)

/**
 * A card whose 代表写真 failed recently, until [until] (epoch millis): [fallback] is the text card drawn for a
 * cover that would not decode; null means the cover could not be read, which answers 503.
 */
private class CoverFailure(val fallback: ByteArray?, val until: Long)

private val COVER_READ_TIMEOUT = 5.seconds
private const val MAX_COVER_FAILURES = 64

/** A shop's OGP tags, which the edge Worker (`edge/og-worker.js`) puts into `/search?shop=`, and the image they point at. Public, no auth. */
class OgHandler(
    private val shops: ShopHandler,
    private val publicBaseUrl: String,
    /** Null renders the image on every request (local dev, tests). */
    private val store: R2OgImageStore?,
    /** Where the 代表写真 drawn behind the card is read from, by storage key (never over HTTP). */
    private val mealRecordImages: MealRecordImageStore,
    /** Shared with mealRecord image processing; a full gate answers 503, bounding unauthenticated render work. */
    private val bitmapWork: BitmapWorkGate,
    /** How long a cover that failed to read or decode is not tried again. */
    private val coverFailureTtl: Duration = 5.minutes,
) {
    private val inFlight = ConcurrentHashMap<String, CompletableDeferred<Produced?>>()

    // By image key; small and cleared when full, like R2OgImageStore's known keys.
    private val coverFailures = ConcurrentHashMap<String, CoverFailure>()

    /** The `<head>` tags for the shop's page on the search page, as an HTML fragment. */
    suspend fun meta(call: ApplicationCall) {
        val record = findShop(call) ?: throw DomainException.NotFound()
        val shop = record.shop
        val card = cardOf(record)
        val html = ogMetaHtml(
            card = card,
            pageUrl = "$publicBaseUrl$SEARCH_PATH?shop=${shop.id}",
            imageUrl = "$publicBaseUrl${imagePath(shop.id, card.hash())}",
        )
        call.respondText(html, ContentType.Text.Html.withCharset(Charsets.UTF_8))
    }

    /** HEAD never renders: it redirects to a stored image or answers with the headers a render would get. */
    suspend fun image(call: ApplicationCall, head: Boolean) {
        val record = findShop(call) ?: throw DomainException.NotFound()
        val shop = record.shop
        val card = cardOf(record)
        val hash = card.hash()
        // An old hash (the shop changed since the page was shared) gets the current image.
        if (call.parameters["hash"] != hash) return call.respondRedirect(imagePath(shop.id, hash))

        val key = "og/shops/${shop.id}/$hash.png"
        if (store != null && storageOrNull("lookup") { store.exists(key) } == true) return call.respondRedirect(store.publicUrl(key))
        if (head) {
            call.response.header(HttpHeaders.CacheControl, IMMUTABLE)
            return call.respond(HeadOnly(ContentType.Image.PNG))
        }

        val produced = produce(key, card) ?: run {
            call.retrySoon()
            return call.respond(HttpStatusCode.ServiceUnavailable)
        }
        if (store != null && produced.stored) return call.respondRedirect(store.publicUrl(key))

        // A fallback keeps the default no-store, so the photo card can replace it once the cover is fixed.
        if (!produced.rendered.fallback) call.response.header(HttpHeaders.CacheControl, IMMUTABLE)
        call.respondBytes(produced.rendered.png, ContentType.Image.PNG)
    }

    /**
     * Renders (and stores) the image for [key] once; concurrent requests for the same key wait for that
     * work instead of queueing renders of their own. Null (503) when too many renders are pending or the
     * cover cannot be read.
     */
    private suspend fun produce(key: String, card: OgCard): Produced? {
        val mine = CompletableDeferred<Produced?>()
        inFlight.putIfAbsent(key, mine)?.let { return it.await() }
        try {
            val produced = produceOnce(key, card)
            mine.complete(produced)
            return produced
        } catch (e: Throwable) {
            mine.completeExceptionally(e)
            throw e
        } finally {
            inFlight.remove(key, mine)
        }
    }

    private suspend fun produceOnce(key: String, card: OgCard): Produced? {
        recentCoverFailure(key)?.let { failure ->
            return failure.fallback?.let { Produced(Rendered(it, fallback = true), stored = false) }
        }
        val rendered = bitmapWork.withSlotOrNull {
            val jpeg = card.coverPhotoKey?.let {
                readCover(it) ?: return@withSlotOrNull null.also { rememberCoverFailure(key, null) }
            }
            render(card, jpeg)
        } ?: return null
        if (rendered.fallback) rememberCoverFailure(key, rendered.png)
        val stored = store != null && !rendered.fallback && storageOrNull("upload") { store.put(key, rendered.png) } != null
        return Produced(rendered, stored)
    }

    /** The stored cover's bytes, or null when storage fails or is slower than [COVER_READ_TIMEOUT]. */
    private suspend fun readCover(coverKey: String): ByteArray? = try {
        withTimeout(COVER_READ_TIMEOUT) { mealRecordImages.read(coverKey) }
    } catch (e: TimeoutCancellationException) {
        log.warn("og: cover read timed out for {}; answering 503", coverKey)
        null
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        log.warn("og: cover read failed for {}; answering 503", coverKey, e)
        null
    }

    /**
     * The cover is decoded inside the exclusive section,
     * so no bitmap outlives a render; one that will not decode gets the text card.
     */
    private suspend fun render(card: OgCard, jpeg: ByteArray?): Rendered = bitmapWork.exclusive {
        val cover = jpeg?.let { bytes ->
            try {
                decodeCover(bytes)
            } catch (e: Exception) {
                log.warn("og: cover decode failed for {}; drawing the text card", card.coverPhotoKey, e)
                null
            }
        }
        Rendered(renderOgImage(card, cover), fallback = jpeg != null && cover == null)
    }

    private fun recentCoverFailure(key: String): CoverFailure? {
        val failure = coverFailures[key] ?: return null
        if (failure.until > System.currentTimeMillis()) return failure
        coverFailures.remove(key, failure)
        return null
    }

    private fun rememberCoverFailure(key: String, fallback: ByteArray?) {
        if (coverFailures.size >= MAX_COVER_FAILURES) coverFailures.clear()
        coverFailures[key] = CoverFailure(fallback, System.currentTimeMillis() + coverFailureTtl.inWholeMilliseconds)
    }

    /** Runs one storage call; a failure is logged and gives null, and the image is then served directly. */
    private suspend fun <T> storageOrNull(action: String, block: suspend () -> T): T? = try {
        block()
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        log.warn("og: image store {} failed; serving the image directly", action, e)
        null
    }

    private fun findShop(call: ApplicationCall): ShopRecord? =
        call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }?.let(shops::findShop)

    private fun cardOf(record: ShopRecord) = OgCard.of(record.shop, record.coverPhotoKey, LocalDate.now(JST))

    private fun imagePath(id: String, hash: String) = "$OG_SHOPS_PATH$id/$hash.png"
}

internal fun ogMetaHtml(card: OgCard, pageUrl: String, imageUrl: String): String {
    val title = card.name.escapeHTML()
    val description = card.description().escapeHTML()
    val url = pageUrl.escapeHTML()
    return """<title>$title | NoodleMap</title>
<meta name="description" content="$description">
<meta property="og:type" content="website">
<meta property="og:site_name" content="NoodleMap">
<meta property="og:title" content="$title">
<meta property="og:description" content="$description">
<meta property="og:url" content="$url">
<meta property="og:image" content="${imageUrl.escapeHTML()}">
<meta property="og:image:width" content="$OG_WIDTH">
<meta property="og:image:height" content="$OG_HEIGHT">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="$url">
"""
}
