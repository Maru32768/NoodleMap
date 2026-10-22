package dev.marulabs.noodlemap.og

import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.shops.ShopHandler
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.withCharset
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.header
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondRedirect
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive
import org.slf4j.LoggerFactory

const val OG_IMAGE_PATH = "/api/v1/og/shops/"
private const val SEARCH_PATH = "/search"
private const val IMMUTABLE = "public, max-age=31536000, immutable"

// Statuses like 新店/閉店 follow the web, which judges them by the viewer's (Japanese) calendar day.
private val JST = ZoneId.of("Asia/Tokyo")
private val log = LoggerFactory.getLogger("Og")

fun Route.ogRoutes(og: OgHandler) {
    get("/r/{id}") { og.sharePage(call) }
    get("$OG_IMAGE_PATH{id}/{hash}.png") { og.image(call) }
}

/** Share pages (`/r/{id}`) carrying OGP tags, and the OGP images they point at. Public, no auth. */
class OgHandler(
    private val shops: ShopHandler,
    private val publicBaseUrl: String,
    /** Null renders the image on every request (local dev, tests). */
    private val store: OgImageStore?,
) {
    // One 1200x630 bitmap at a time keeps memory flat on the 512 MB instance.
    private val renderLock = Mutex()

    /** Same response for crawlers and browsers: OGP meta plus an immediate redirect to the search page. */
    suspend fun sharePage(call: ApplicationCall) {
        val shop = findShop(call) ?: return call.respondRedirect(SEARCH_PATH)
        val card = OgCard.of(shop, LocalDate.now(JST))
        val html = sharePageHtml(
            card = card,
            shareUrl = "$publicBaseUrl/r/${shop.id}",
            imageUrl = "$publicBaseUrl${imagePath(shop.id, card.hash())}",
            target = "$SEARCH_PATH?shop=${shop.id}",
        )
        call.respondText(html, ContentType.Text.Html.withCharset(Charsets.UTF_8))
    }

    suspend fun image(call: ApplicationCall) {
        val shop = findShop(call) ?: throw DomainException.NotFound()
        val card = OgCard.of(shop, LocalDate.now(JST))
        val hash = card.hash()
        // An old hash (the shop changed since the page was shared) gets the current image.
        if (call.parameters["hash"] != hash) return call.respondRedirect(imagePath(shop.id, hash))

        val render = suspend { renderLock.withLock { withContext(Dispatchers.Default) { renderOgImage(card) } } }
        if (store != null) {
            val url = try {
                store.publicUrl("og/shops/${shop.id}/$hash.png", render)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                log.warn("og: image store failed, rendering directly", e)
                null
            }
            if (url != null) return call.respondRedirect(url)
        }
        call.response.header(HttpHeaders.CacheControl, IMMUTABLE)
        call.respondBytes(render(), ContentType.Image.PNG)
    }

    private fun findShop(call: ApplicationCall): Shop? =
        call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }?.let(shops::findShop)

    private fun imagePath(id: String, hash: String) = "$OG_IMAGE_PATH$id/$hash.png"
}

internal fun sharePageHtml(card: OgCard, shareUrl: String, imageUrl: String, target: String): String {
    val title = esc(card.name)
    val description = esc(card.description())
    // JSON string literal for the script; `<` escaped so the value can never close the tag.
    val targetJs = JsonPrimitive(target).toString().replace("<", "\\u003c")
    return """
        |<!doctype html>
        |<html lang="ja">
        |<head>
        |<meta charset="utf-8">
        |<title>$title | NoodleMap</title>
        |<meta name="description" content="$description">
        |<meta property="og:type" content="website">
        |<meta property="og:site_name" content="NoodleMap">
        |<meta property="og:title" content="$title">
        |<meta property="og:description" content="$description">
        |<meta property="og:url" content="${esc(shareUrl)}">
        |<meta property="og:image" content="${esc(imageUrl)}">
        |<meta property="og:image:width" content="$OG_WIDTH">
        |<meta property="og:image:height" content="$OG_HEIGHT">
        |<meta name="twitter:card" content="summary_large_image">
        |<link rel="canonical" href="${esc(shareUrl)}">
        |<meta http-equiv="refresh" content="0;url=${esc(target)}">
        |<script>location.replace($targetJs)</script>
        |</head>
        |<body><a href="${esc(target)}">$title</a></body>
        |</html>
        |
    """.trimMargin()
}

private fun esc(s: String): String = buildString {
    for (c in s) {
        when (c) {
            '&' -> append("&amp;")
            '<' -> append("&lt;")
            '>' -> append("&gt;")
            '"' -> append("&quot;")
            '\'' -> append("&#39;")
            else -> append(c)
        }
    }
}
