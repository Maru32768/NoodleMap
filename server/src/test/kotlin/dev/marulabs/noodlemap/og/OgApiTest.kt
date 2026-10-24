package dev.marulabs.noodlemap.og

import dev.marulabs.noodlemap.FakeS3
import dev.marulabs.noodlemap.PUBLIC_BASE_URL
import dev.marulabs.noodlemap.addShopRequest
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.encode
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.generated.models.VisitImage
import dev.marulabs.noodlemap.generated.models.VisitLog
import dev.marulabs.noodlemap.postJson
import dev.marulabs.noodlemap.putJson
import dev.marulabs.noodlemap.session
import dev.marulabs.noodlemap.shops.MISO
import dev.marulabs.noodlemap.shops.SHOYU
import dev.marulabs.noodlemap.testApp
import dev.marulabs.noodlemap.toUpdate
import dev.marulabs.noodlemap.visits.R2VisitImageStore
import dev.marulabs.noodlemap.visits.VISIT_IMAGE_MAX_BYTES
import dev.marulabs.noodlemap.visits.jpeg
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.ints.shouldBeLessThan
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import io.ktor.client.HttpClient
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.get
import io.ktor.client.request.head
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import kotlin.math.abs
import kotlin.time.Duration
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test

private val PHOTO = Color(40, 120, 200)
private val TEXT_CARD_BG = Color(0xf4ede0)

class OgApiTest {

    @Test
    fun `a pending cover read refuses distinct covers before storage and frees admission afterwards`() =
        testApp(visitImageStore = images, maxPendingBitmapWork = 1) { t ->
            val admin = t.adminToken()
            val first = addShop("First", admin)
            val second = client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = "second")), admin).body<Shop>()
            val firstKey = addCover(first.id, admin).url.removePrefix("https://images.example/")
            val secondKey = addCover(second.id, admin).url.removePrefix("https://images.example/")
            val firstPath = client.imagePath(first.id)
            val secondPath = client.imagePath(second.id)
            val started = java.util.concurrent.CountDownLatch(1)
            val release = java.util.concurrent.CountDownLatch(1)
            s3.getStarted = started
            s3.releaseGet = release
            coroutineScope {
                val pending = async { client.get(firstPath) }
                try {
                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                        started.await(5, java.util.concurrent.TimeUnit.SECONDS)
                    } shouldBe true
                    client.get(secondPath).let {
                        it.status shouldBe HttpStatusCode.ServiceUnavailable
                        it.headers[HttpHeaders.RetryAfter] shouldBe "5"
                    }
                    s3.requests.count { it == "GET /images/$secondKey" } shouldBe 0
                } finally {
                    release.countDown()
                }
                pending.await().status shouldBe HttpStatusCode.OK
            }
            client.get(secondPath).status shouldBe HttpStatusCode.OK
            s3.requests.count { it == "GET /images/$firstKey" } shouldBe 1
            s3.requests.count { it == "GET /images/$secondKey" } shouldBe 1
        }

    private val s3 = FakeS3()
    private val store = R2OgImageStore(s3.r2Config("og", "https://og.example"))
    private val images = R2VisitImageStore(s3.r2Config("images", "https://images.example"))

    @AfterEach
    fun tearDown() {
        store.close()
        images.close()
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

    /** Logs a rated visit with one solid [PHOTO]-colored image, which becomes the shop's 代表写真. */
    private suspend fun ApplicationTestBuilder.addCover(shopId: String, admin: String): VisitImage {
        val visit = client.postJson("/api/v1/auth/shops/$shopId/visits", """{"rate":90}""", admin).body<VisitLog>()
        val photo = BufferedImage(64, 32, BufferedImage.TYPE_INT_RGB).apply {
            createGraphics().run { color = PHOTO; fillRect(0, 0, width, height); dispose() }
        }
        val res = client.submitFormWithBinaryData(
            "/api/v1/auth/visits/${visit.id}/images",
            formData {
                append("file", jpeg(photo), Headers.build {
                    append(HttpHeaders.ContentType, "image/jpeg")
                    append(HttpHeaders.ContentDisposition, "filename=\"photo.jpg\"")
                })
            },
        ) {
            session(admin)
            header(HttpHeaders.Origin, PUBLIC_BASE_URL)
        }
        res.status shouldBe HttpStatusCode.OK
        return res.body()
    }

    /** The top of a photo card is the photo itself (the scrim starts lower), give or take JPEG noise. */
    private fun BufferedImage.shouldShowPhotoOnTop() {
        for (x in listOf(5, OG_WIDTH - 6)) {
            val c = Color(getRGB(x, 5))
            listOf(c.red - PHOTO.red, c.green - PHOTO.green, c.blue - PHOTO.blue).all { abs(it) <= 8 } shouldBe true
        }
    }

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
            // Without a 代表写真: the text card on its paper background.
            Color(it.getRGB(5, 5)) shouldBe TEXT_CARD_BG
        }
    }

    @Test
    fun `a cover photo becomes the full-bleed background`() = testApp { t ->
        val admin = t.adminToken()
        val shop = addShop("写真の店", admin)
        val textPath = client.imagePath(shop.id)

        addCover(shop.id, admin)

        val photoPath = client.imagePath(shop.id)
        photoPath shouldNotBe textPath
        val res = client.get(photoPath)
        res.status shouldBe HttpStatusCode.OK
        res.headers.getAll(HttpHeaders.CacheControl) shouldBe listOf("public, max-age=31536000, immutable")
        png(res.readRawBytes()).let {
            it.width shouldBe 1200
            it.height shouldBe 630
            it.shouldShowPhotoOnTop()
            // The scrim darkens the photo under the text.
            Color(it.getRGB(5, 625)).blue shouldBeLessThan PHOTO.blue / 2
        }
    }

    @Test
    fun `a cover that will not decode gets the text card, uncached, unstored and remembered`() =
        testApp(ogStore = store, visitImageStore = images) { t ->
            val admin = t.adminToken()
            val shop = addShop("壊れた写真", admin)
            val key = addCover(shop.id, admin).url.removePrefix("https://images.example/")
            s3.objects["/images/$key"] = byteArrayOf(1, 2, 3)
            val path = client.imagePath(shop.id)

            repeat(2) {
                val res = noRedirects().get(path)
                res.status shouldBe HttpStatusCode.OK
                res.headers.getAll(HttpHeaders.CacheControl) shouldBe listOf("no-store")
                Color(png(res.readRawBytes()).getRGB(5, 5)) shouldBe TEXT_CARD_BG
            }
            // The second answer came from memory: storage was read once, and nothing was uploaded.
            s3.requests.count { it == "GET /images/$key" } shouldBe 1
            s3.requests.none { it.startsWith("PUT /og/") } shouldBe true
        }

    @Test
    fun `a cover that cannot be read answers 503 and is not read again for a while`() =
        testApp(ogStore = store, visitImageStore = images) { t ->
            val admin = t.adminToken()
            val shop = addShop("消えた写真", admin)
            val key = addCover(shop.id, admin).url.removePrefix("https://images.example/")
            s3.objects.remove("/images/$key")
            val path = client.imagePath(shop.id)

            repeat(2) {
                client.get(path).let {
                    it.status shouldBe HttpStatusCode.ServiceUnavailable
                    it.headers[HttpHeaders.RetryAfter] shouldBe "5"
                }
            }
            s3.requests.count { it == "GET /images/$key" } shouldBe 1
            s3.requests.none { it.startsWith("PUT /og/") } shouldBe true
        }

    @Test
    fun `an oversized cover object is refused, and the photo card follows once the cover reads`() =
        testApp(ogStore = store, visitImageStore = images, ogCoverFailureTtl = Duration.ZERO) { t ->
            val admin = t.adminToken()
            val shop = addShop("巨大な写真", admin)
            val key = addCover(shop.id, admin).url.removePrefix("https://images.example/")
            val jpeg = s3.objects.getValue("/images/$key")
            val path = client.imagePath(shop.id)
            val ogKey = "og/shops/${shop.id}/${path.substringAfterLast('/')}"

            s3.objects["/images/$key"] = ByteArray(VISIT_IMAGE_MAX_BYTES.toInt() + 1)
            client.get(path).status shouldBe HttpStatusCode.ServiceUnavailable

            s3.objects["/images/$key"] = jpeg
            noRedirects().get(path).headers[HttpHeaders.Location] shouldBe "https://og.example/$ogKey"
            png(s3.objects.getValue("/og/$ogKey")).shouldShowPhotoOnTop()
        }

    @Test
    fun `the cover is read from R2 by its storage key`() = testApp(ogStore = store, visitImageStore = images) { t ->
        val admin = t.adminToken()
        val shop = addShop("R2の店", admin)
        val key = addCover(shop.id, admin).url.removePrefix("https://images.example/")
        val path = client.imagePath(shop.id)
        val ogKey = "og/shops/${shop.id}/${path.substringAfterLast('/')}"

        noRedirects().get(path).headers[HttpHeaders.Location] shouldBe "https://og.example/$ogKey"
        s3.requests shouldContain "GET /images/$key"
        png(s3.objects.getValue("/og/$ogKey")).shouldShowPhotoOnTop()
    }

    @Test
    fun `visit logs and the wish level change the share text and the image`() = testApp { t ->
        val admin = t.adminToken()
        val shop = addShop("煮干し", admin)
        client.putJson(
            "/api/v1/auth/shops/${shop.id}",
            encode(addShopRequest(tagIds = listOf(SHOYU, MISO)).copy(name = "煮干し", address = "東京都新宿区西新宿2-8-1").toUpdate().copy(wishLevel = "high")),
            admin,
        ).status shouldBe HttpStatusCode.OK
        val wishPath = client.imagePath(shop.id)
        client.get("/r/${shop.id}").bodyAsText().let {
            it shouldContain "絶対行きたい"
            it shouldNotContain "気になる"
        }
        client.get(wishPath).status shouldBe HttpStatusCode.OK

        client.postJson("/api/v1/auth/shops/${shop.id}/visits", """{"rate":90}""", admin).status shouldBe HttpStatusCode.OK

        val eatenPath = client.imagePath(shop.id)
        eatenPath shouldNotBe wishPath
        client.get("/r/${shop.id}").bodyAsText().let {
            it shouldContain "食べた・1回訪問"
            it shouldNotContain "絶対行きたい"
        }
        png(client.get(eatenPath).readRawBytes()).width shouldBe 1200
    }

    @Test
    fun `share page and image answer HEAD, and image HEAD never renders`() = testApp(maxPendingBitmapWork = 0) { t ->
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
        testApp(ogStore = store, maxPendingBitmapWork = 1) { t ->
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
    fun `saturated renders get 503 with Retry-After`() = testApp(maxPendingBitmapWork = 0) { t ->
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
