package dev.marulabs.noodlemap.og

import dev.marulabs.noodlemap.common.JST
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.shops.ShopHandler
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
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive
import org.slf4j.LoggerFactory

private const val OG_IMAGE_PATH = "/api/v1/og/shops/"
private const val SEARCH_PATH = "/search"
private const val IMMUTABLE = "public, max-age=31536000, immutable"

private val log = LoggerFactory.getLogger("Og")

fun Route.ogRoutes(og: OgHandler) {
    get("/r/{id}") { og.sharePage(call, head = false) }
    head("/r/{id}") { og.sharePage(call, head = true) }
    get("$OG_IMAGE_PATH{id}/{hash}.png") { og.image(call, head = false) }
    head("$OG_IMAGE_PATH{id}/{hash}.png") { og.image(call, head = true) }
}

/** The headers of a GET response without its body, for HEAD (crawlers probe with it). */
private class HeadOnly(override val contentType: ContentType, override val contentLength: Long? = null) : OutgoingContent.NoContent()

/** A rendered image and whether it is now in the store. */
private class Produced(val png: ByteArray, val stored: Boolean)

/** Share pages (`/r/{id}`) carrying OGP tags, and the OGP images they point at. Public, no auth. */
class OgHandler(
    private val shops: ShopHandler,
    private val publicBaseUrl: String,
    /** Null renders the image on every request (local dev, tests). */
    private val store: R2OgImageStore?,
    /** Renders running or waiting before new ones get 503; bounds unauthenticated render work. */
    private val maxPendingRenders: Int = 4,
) {
    // One 1200x630 bitmap at a time keeps memory flat on the 512 MB instance.
    private val renderLock = Mutex()
    private val pendingRenders = AtomicInteger()
    private val inFlight = ConcurrentHashMap<String, CompletableDeferred<Produced?>>()

    /**
     * Same response for crawlers and browsers: OGP meta plus a script redirect to the shop on the
     * search page (headers only for HEAD). An unknown shop redirects to the search page directly.
     */
    suspend fun sharePage(call: ApplicationCall, head: Boolean) {
        val shop = findShop(call) ?: return call.respondRedirect(SEARCH_PATH)
        val card = OgCard.of(shop, LocalDate.now(JST))
        val html = sharePageHtml(
            card = card,
            shareUrl = "$publicBaseUrl/r/${shop.id}",
            imageUrl = "$publicBaseUrl${imagePath(shop.id, card.hash())}",
            target = "$SEARCH_PATH?shop=${shop.id}",
        )
        val type = ContentType.Text.Html.withCharset(Charsets.UTF_8)
        if (head) return call.respond(HeadOnly(type, html.toByteArray().size.toLong()))
        call.respondText(html, type)
    }

    /** HEAD never renders: it redirects to a stored image or answers with the headers a render would get. */
    suspend fun image(call: ApplicationCall, head: Boolean) {
        val shop = findShop(call) ?: throw DomainException.NotFound()
        val card = OgCard.of(shop, LocalDate.now(JST))
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
            call.response.header(HttpHeaders.RetryAfter, "5")
            return call.respond(HttpStatusCode.ServiceUnavailable)
        }
        if (store != null && produced.stored) return call.respondRedirect(store.publicUrl(key))

        call.response.header(HttpHeaders.CacheControl, IMMUTABLE)
        call.respondBytes(produced.png, ContentType.Image.PNG)
    }

    /**
     * Renders (and stores) the image for [key] once; concurrent requests for the same key wait for that
     * work instead of queueing renders of their own. Null when too many renders are pending.
     */
    private suspend fun produce(key: String, card: OgCard): Produced? {
        val mine = CompletableDeferred<Produced?>()
        inFlight.putIfAbsent(key, mine)?.let { return it.await() }
        try {
            val produced = renderOrNull(card)?.let { png ->
                Produced(png, stored = store != null && storageOrNull("upload") { store.put(key, png) } != null)
            }
            mine.complete(produced)
            return produced
        } catch (e: Throwable) {
            mine.completeExceptionally(e)
            throw e
        } finally {
            inFlight.remove(key, mine)
        }
    }

    /** The PNG, or null when [maxPendingRenders] renders are already running or queued. */
    private suspend fun renderOrNull(card: OgCard): ByteArray? {
        try {
            if (pendingRenders.incrementAndGet() > maxPendingRenders) return null
            return renderLock.withLock { withContext(Dispatchers.Default) { renderOgImage(card) } }
        } finally {
            pendingRenders.decrementAndGet()
        }
    }

    /** Runs one storage call; a failure is logged and gives null, and the image is then served directly. */
    private suspend fun <T> storageOrNull(action: String, block: suspend () -> T): T? = try {
        block()
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        log.warn("og: image store {} failed; serving the image directly", action, e)
        null
    }

    private fun findShop(call: ApplicationCall): Shop? =
        call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }?.let(shops::findShop)

    private fun imagePath(id: String, hash: String) = "$OG_IMAGE_PATH$id/$hash.png"
}

/**
 * No meta refresh: scrapers that follow it (Facebook) would land on the SPA, which has no OGP tags.
 * Browsers leave via the script; the link covers the rest.
 */
internal fun sharePageHtml(card: OgCard, shareUrl: String, imageUrl: String, target: String): String {
    val title = card.name.escapeHTML()
    val description = card.description().escapeHTML()
    // JSON string literal for the script; `<` escaped so the value can never close the tag.
    val targetJs = JsonPrimitive(target).toString().replace("<", "\\u003c")
    return """<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>$title | NoodleMap</title>
<meta name="description" content="$description">
<meta property="og:type" content="website">
<meta property="og:site_name" content="NoodleMap">
<meta property="og:title" content="$title">
<meta property="og:description" content="$description">
<meta property="og:url" content="${shareUrl.escapeHTML()}">
<meta property="og:image" content="${imageUrl.escapeHTML()}">
<meta property="og:image:width" content="$OG_WIDTH">
<meta property="og:image:height" content="$OG_HEIGHT">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${shareUrl.escapeHTML()}">
<script>location.replace($targetJs)</script>
</head>
<body><a href="${target.escapeHTML()}">$title</a></body>
</html>
"""
}
