package dev.marulabs.noodlemap.og

import com.sun.net.httpserver.HttpServer
import dev.marulabs.noodlemap.Config
import dev.marulabs.noodlemap.PUBLIC_BASE_URL
import dev.marulabs.noodlemap.addShopRequest
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.encode
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.postJson
import dev.marulabs.noodlemap.shops.MISO
import dev.marulabs.noodlemap.shops.SHOYU
import dev.marulabs.noodlemap.testApp
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.head
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import java.io.ByteArrayInputStream
import java.net.InetSocketAddress
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import javax.imageio.ImageIO
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test

class OgApiTest {

    /** A local stand-in for R2's S3 API: HEAD answers from [objects], PUT stores; [fail] makes every call 500. */
    private class FakeS3 {
        val objects = ConcurrentHashMap<String, ByteArray>()
        val requests = CopyOnWriteArrayList<String>()
        @Volatile var fail = false
        @Volatile var headDelayMs = 0L

        private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            executor = Executors.newCachedThreadPool()
            createContext("/") { ex ->
                val path = ex.requestURI.path
                requests += "${ex.requestMethod} $path"
                if (ex.requestMethod == "HEAD") Thread.sleep(headDelayMs)
                val body = ex.requestBody.readBytes()
                val status = when {
                    fail -> 500
                    ex.requestMethod == "PUT" -> 200.also { objects[path] = body }
                    ex.requestMethod == "HEAD" -> if (objects.containsKey(path)) 200 else 404
                    else -> 405
                }
                ex.sendResponseHeaders(status, -1)
                ex.close()
            }
            start()
        }

        fun store() = R2OgImageStore(
            Config.OgR2Config(
                bucket = "og", endpoint = "http://127.0.0.1:${server.address.port}",
                accessKeyId = "kid", secretAccessKey = "secret", publicBaseUrl = "https://og.example",
            ),
        )

        fun stop() {
            server.stop(0)
            (server.executor as ExecutorService).shutdownNow()
        }
    }

    private val s3 = FakeS3()
    private val store = s3.store()

    @AfterEach
    fun tearDown() {
        store.close()
        s3.stop()
    }

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

    private fun png(bytes: ByteArray) = ImageIO.read(ByteArrayInputStream(bytes))

    @Test
    fun `share page carries escaped OGP meta with absolute URLs and redirects by script`() = testApp { t ->
        val shop = addShop("""<script>"麺&'屋""", t.adminToken())
        val res = noRedirects().get("/r/${shop.id}")

        res.status shouldBe HttpStatusCode.OK
        res.contentType()?.withoutParameters() shouldBe ContentType.Text.Html
        res.headers[HttpHeaders.CacheControl] shouldBe "no-store"
        val html = res.bodyAsText()
        html shouldNotContain "<script>\""
        html shouldContain """<meta property="og:title" content="&lt;script&gt;&quot;麺&amp;&#x27;屋">"""
        html shouldContain """<title>&lt;script&gt;&quot;麺&amp;&#x27;屋 | NoodleMap</title>"""
        html shouldContain """<meta property="og:description" content="ラーメン・"""
        html shouldContain "気になる・東京都新宿区"
        html shouldContain """<meta property="og:url" content="$PUBLIC_BASE_URL/r/${shop.id}">"""
        html shouldContain """<meta property="og:image" content="$PUBLIC_BASE_URL/api/v1/og/shops/${shop.id}/"""
        html shouldContain """<meta property="og:type" content="website">"""
        html shouldContain """<meta name="twitter:card" content="summary_large_image">"""
        html shouldContain """location.replace("/search?shop=${shop.id}")"""
        html shouldContain """<a href="/search?shop=${shop.id}">"""
        // Scrapers that follow meta refresh would leave the OGP page for the SPA.
        html shouldNotContain "http-equiv=\"refresh\""
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
        res.headers[HttpHeaders.Pragma] shouldBe null
        png(res.readRawBytes()).let {
            it.width shouldBe 1200
            it.height shouldBe 630
        }
    }

    @Test
    fun `share page and image answer HEAD, and image HEAD never renders`() = testApp(ogMaxPendingRenders = 0) { t ->
        val shop = addShop("醤油", t.adminToken())
        noRedirects().head("/r/${shop.id}").let {
            it.status shouldBe HttpStatusCode.OK
            it.contentType()?.withoutParameters() shouldBe ContentType.Text.Html
            it.headers[HttpHeaders.ContentLength]!!.toLong() shouldBe client.get("/r/${shop.id}").readRawBytes().size.toLong()
        }
        noRedirects().head("/r/not-a-uuid").headers[HttpHeaders.Location] shouldBe "/search"
        // A render here would answer 503 (no render slots).
        client.head(client.imagePath(shop.id)).let {
            it.status shouldBe HttpStatusCode.OK
            it.contentType() shouldBe ContentType.Image.PNG
            it.headers.getAll(HttpHeaders.CacheControl) shouldBe listOf("public, max-age=31536000, immutable")
        }
    }

    @Test
    fun `image HEAD with R2 redirects to a stored image and otherwise does not upload`() = testApp(ogStore = store) { t ->
        val shop = addShop("塩", t.adminToken())
        val path = client.imagePath(shop.id)
        val key = "og/shops/${shop.id}/${path.substringAfterLast('/')}"

        noRedirects().head(path).status shouldBe HttpStatusCode.OK
        s3.requests shouldContainExactly listOf("HEAD /og/$key")

        s3.objects["/og/$key"] = byteArrayOf(1)
        noRedirects().head(path).headers[HttpHeaders.Location] shouldBe "https://og.example/$key"
    }

    @Test
    fun `concurrent requests for a new image share one render and one upload`() =
        testApp(ogStore = store, ogMaxPendingRenders = 1) { t ->
            val shop = addShop("行列", t.adminToken())
            val path = client.imagePath(shop.id)
            val key = "og/shops/${shop.id}/${path.substringAfterLast('/')}"
            // Slow lookups make every request miss together and reach the render at once.
            s3.headDelayMs = 300

            val client = noRedirects()
            val responses = coroutineScope { List(5) { async { client.get(path) } }.awaitAll() }

            responses.map { it.status } shouldBe List(5) { HttpStatusCode.Found }
            s3.requests.count { it == "PUT /og/$key" } shouldBe 1
        }

    @Test
    fun `stale image hash redirects to the current image and errors are not cached`() = testApp { t ->
        val shop = addShop("つけ麺", t.adminToken())
        val current = client.imagePath(shop.id)

        noRedirects().get("/api/v1/og/shops/${shop.id}/0000000000000000.png").let {
            it.status shouldBe HttpStatusCode.Found
            it.headers[HttpHeaders.Location] shouldBe current
        }
        client.get("/api/v1/og/shops/00000000-0000-4000-8000-000000000000/0000000000000000.png").let {
            it.status shouldBe HttpStatusCode.NotFound
            it.headers.getAll(HttpHeaders.CacheControl) shouldBe listOf("no-store")
        }
    }

    @Test
    fun `saturated renders get 503 with Retry-After`() = testApp(ogMaxPendingRenders = 0) { t ->
        val shop = addShop("混雑", t.adminToken())
        client.get(client.imagePath(shop.id)).let {
            it.status shouldBe HttpStatusCode.ServiceUnavailable
            it.headers[HttpHeaders.RetryAfter] shouldBe "5"
            it.headers.getAll(HttpHeaders.CacheControl) shouldBe listOf("no-store")
        }
    }

    @Test
    fun `R2 miss renders, uploads and redirects, and later hits skip the HEAD and the render`() = testApp(ogStore = store) { t ->
        val shop = addShop("うどん処", t.adminToken())
        val path = client.imagePath(shop.id)
        val key = "og/shops/${shop.id}/${path.substringAfterLast('/')}"

        repeat(2) {
            val res = noRedirects().get(path)
            res.status shouldBe HttpStatusCode.Found
            res.headers[HttpHeaders.Location] shouldBe "https://og.example/$key"
        }
        s3.requests shouldContainExactly listOf("HEAD /og/$key", "PUT /og/$key")
        png(s3.objects.getValue("/og/$key")).width shouldBe 1200
    }

    @Test
    fun `R2 hit redirects without rendering or uploading`() = testApp(ogStore = store) { t ->
        val shop = addShop("家系", t.adminToken())
        val path = client.imagePath(shop.id)
        val key = "og/shops/${shop.id}/${path.substringAfterLast('/')}"
        s3.objects["/og/$key"] = byteArrayOf(1)

        noRedirects().get(path).headers[HttpHeaders.Location] shouldBe "https://og.example/$key"
        s3.requests shouldContainExactly listOf("HEAD /og/$key")
    }

    @Test
    fun `R2 failures fall back to direct rendering`() = testApp(ogStore = store) { t ->
        s3.fail = true
        val shop = addShop("味噌", t.adminToken())
        val res = noRedirects().get(client.imagePath(shop.id))
        res.status shouldBe HttpStatusCode.OK
        res.contentType() shouldBe ContentType.Image.PNG
    }
}
