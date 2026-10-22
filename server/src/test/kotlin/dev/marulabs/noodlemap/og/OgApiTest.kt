package dev.marulabs.noodlemap.og

import dev.marulabs.noodlemap.PUBLIC_BASE_URL
import dev.marulabs.noodlemap.addShopRequest
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.encode
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.postJson
import dev.marulabs.noodlemap.shops.MISO
import dev.marulabs.noodlemap.shops.SHOYU
import dev.marulabs.noodlemap.testApp
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import org.junit.jupiter.api.Test

class OgApiTest {

    private fun ApplicationTestBuilder.noRedirects(): HttpClient = createClient { followRedirects = false }

    private suspend fun ApplicationTestBuilder.addShop(name: String, admin: String): Shop =
        client.postJson(
            "/api/v1/auth/shops",
            encode(addShopRequest(tagIds = listOf(SHOYU, MISO)).copy(name = name, address = "東京都新宿区西新宿2-8-1")),
            admin,
        ).body<Shop>()

    /** The og:image path the share page points at, relative to [PUBLIC_BASE_URL]. */
    private suspend fun HttpClient.imagePath(id: String): String {
        val html = get("/r/$id").bodyAsText()
        val url = Regex("""og:image" content="([^"]+)"""").find(html)!!.groupValues[1]
        return url.removePrefix(PUBLIC_BASE_URL)
    }

    @Test
    fun `share page carries escaped OGP meta with absolute URLs and redirects to the shop`() = testApp { t ->
        val shop = addShop("""<script>"麺&'屋""", t.adminToken())
        val res = noRedirects().get("/r/${shop.id}")

        res.status shouldBe HttpStatusCode.OK
        res.contentType()?.withoutParameters() shouldBe ContentType.Text.Html
        val html = res.bodyAsText()
        html shouldNotContain "<script>\""
        html shouldContain """<meta property="og:title" content="&lt;script&gt;&quot;麺&amp;&#39;屋">"""
        html shouldContain """<title>&lt;script&gt;&quot;麺&amp;&#39;屋 | NoodleMap</title>"""
        html shouldContain """<meta property="og:description" content="ラーメン・"""
        html shouldContain "気になる・東京都新宿区"
        html shouldContain """<meta property="og:url" content="$PUBLIC_BASE_URL/r/${shop.id}">"""
        html shouldContain """<meta property="og:image" content="$PUBLIC_BASE_URL/api/v1/og/shops/${shop.id}/"""
        html shouldContain """<meta property="og:type" content="website">"""
        html shouldContain """<meta name="twitter:card" content="summary_large_image">"""
        html shouldContain """<meta http-equiv="refresh" content="0;url=/search?shop=${shop.id}">"""
        html shouldContain """location.replace("/search?shop=${shop.id}")"""
    }

    @Test
    fun `unknown or malformed share ids redirect to search`() = testApp {
        for (id in listOf("00000000-0000-4000-8000-000000000000", "not-a-uuid")) {
            val res = noRedirects().get("/r/$id")
            res.status shouldBe HttpStatusCode.Found
            res.headers[HttpHeaders.Location] shouldBe "/search"
        }
    }

    @Test
    fun `image renders a cacheable 1200x630 PNG without R2`() = testApp { t ->
        val shop = addShop("中華そば 麺屋", t.adminToken())
        val res = client.get(client.imagePath(shop.id))

        res.status shouldBe HttpStatusCode.OK
        res.contentType() shouldBe ContentType.Image.PNG
        res.headers.getAll(HttpHeaders.CacheControl) shouldBe listOf("public, max-age=31536000, immutable")
        val img = ImageIO.read(ByteArrayInputStream(res.readRawBytes()))
        img.width shouldBe 1200
        img.height shouldBe 630
    }

    @Test
    fun `stale image hash redirects to the current image and unknown shops 404`() = testApp { t ->
        val shop = addShop("つけ麺", t.adminToken())
        val current = client.imagePath(shop.id)

        noRedirects().get("/api/v1/og/shops/${shop.id}/0000000000000000.png").let {
            it.status shouldBe HttpStatusCode.Found
            it.headers[HttpHeaders.Location] shouldBe current
        }
        client.get("/api/v1/og/shops/00000000-0000-4000-8000-000000000000/0000000000000000.png").status shouldBe HttpStatusCode.NotFound
    }

    /** In-memory stand-in for the R2 bucket boundary, counting renders. */
    private class MemoryStore : OgImageStore {
        val objects = HashMap<String, ByteArray>()
        var renders = 0
        override suspend fun publicUrl(key: String, render: suspend () -> ByteArray): String {
            if (key !in objects) objects[key] = render().also { renders++ }
            return "https://og.example/$key"
        }
    }

    @Test
    fun `with a store the image is rendered once, stored, and redirected to`() {
        val store = MemoryStore()
        testApp(ogStore = store) { t ->
            val shop = addShop("うどん処", t.adminToken())
            val path = client.imagePath(shop.id)
            val key = "og/shops/${shop.id}/${path.substringAfterLast('/')}"

            repeat(2) {
                val res = noRedirects().get(path)
                res.status shouldBe HttpStatusCode.Found
                res.headers[HttpHeaders.Location] shouldBe "https://og.example/$key"
            }
            store.renders shouldBe 1
            ImageIO.read(ByteArrayInputStream(store.objects.getValue(key))).width shouldBe 1200
        }
    }

    @Test
    fun `a store that already has the image is not rendered again`() {
        val store = MemoryStore()
        testApp(ogStore = store) { t ->
            val shop = addShop("家系", t.adminToken())
            val path = client.imagePath(shop.id)
            store.objects["og/shops/${shop.id}/${path.substringAfterLast('/')}"] = byteArrayOf(1)

            noRedirects().get(path).status shouldBe HttpStatusCode.Found
            store.renders shouldBe 0
        }
    }

    @Test
    fun `store failures fall back to direct rendering`() = testApp(ogStore = { _, _ -> error("R2 down") }) { t ->
        val shop = addShop("味噌", t.adminToken())
        val res = noRedirects().get(client.imagePath(shop.id))
        res.status shouldBe HttpStatusCode.OK
        res.contentType() shouldBe ContentType.Image.PNG
    }

    @Test
    fun `share page itself is not cached`() = testApp { t ->
        val shop = addShop("塩", t.adminToken())
        noRedirects().get("/r/${shop.id}").headers[HttpHeaders.CacheControl] shouldBe "no-store"
    }
}
