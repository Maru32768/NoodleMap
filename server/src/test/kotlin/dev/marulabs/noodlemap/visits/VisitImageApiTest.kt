package dev.marulabs.noodlemap.visits

import dev.marulabs.noodlemap.FakeS3
import dev.marulabs.noodlemap.PUBLIC_BASE_URL
import dev.marulabs.noodlemap.addShopRequest
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.deleteWithSession
import dev.marulabs.noodlemap.encode
import dev.marulabs.noodlemap.errors.ErrorBody
import dev.marulabs.noodlemap.errors.ErrorType
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.models.ReorderVisitImagesRequest
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.generated.models.UpdateVisitImageRequest
import dev.marulabs.noodlemap.generated.models.VisitImage
import dev.marulabs.noodlemap.generated.models.VisitImagesResponse
import dev.marulabs.noodlemap.generated.models.VisitLog
import dev.marulabs.noodlemap.generated.models.VisitLogInput
import dev.marulabs.noodlemap.generated.models.VisitLogsResponse
import dev.marulabs.noodlemap.postJson
import dev.marulabs.noodlemap.putJson
import dev.marulabs.noodlemap.session
import dev.marulabs.noodlemap.shops.shops
import dev.marulabs.noodlemap.testApp
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeLessThan
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldStartWith
import io.ktor.client.HttpClient
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
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
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.UUID
import java.util.zip.CRC32
import javax.imageio.ImageIO
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test

class VisitImageApiTest {

    private val s3 = FakeS3()
    private val r2 = R2VisitImageStore(s3.r2Config("images", "https://images.example"))

    @AfterEach
    fun tearDown() {
        r2.close()
        s3.stop()
    }

    private suspend fun ApplicationTestBuilder.addVisit(admin: String, visitedOn: String? = null, shopId: String? = null): Pair<String, String> {
        val shop = shopId ?: client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = null)), admin).body<Shop>().id
        val visit = client.postJson("/api/v1/auth/shops/$shop/visits", encode(VisitLogInput(visitedOn = visitedOn, isLimitedMenu = false)), admin)
            .body<VisitLog>().id
        return shop to visit
    }

    private suspend fun HttpClient.upload(visitId: String, bytes: ByteArray, token: String?, name: String = "file"): HttpResponse =
        submitFormWithBinaryData(
            "/api/v1/auth/visits/$visitId/images",
            formData {
                append(name, bytes, Headers.build {
                    append(HttpHeaders.ContentType, "application/octet-stream")
                    append(HttpHeaders.ContentDisposition, "filename=\"photo\"")
                })
            },
        ) { token?.let { session(it) } }

    private suspend fun HttpClient.uploadOk(visitId: String, bytes: ByteArray, admin: String): VisitImage =
        upload(visitId, bytes, admin).also { it.status shouldBe HttpStatusCode.OK }.body()

    private suspend fun HttpClient.visitImages(shopId: String): List<List<VisitImage>> =
        get("/api/v1/shops/$shopId/visits").body<VisitLogsResponse>().visits.map { it.images }

    /** The stored JPEG behind a local-disk URL, through the public route. */
    private suspend fun HttpClient.stored(url: String): HttpResponse = get(url.removePrefix(PUBLIC_BASE_URL))

    private fun fileError(type: FieldErrorType, message: String) =
        ErrorBody(ErrorType.INVALID_REQUEST, message, listOf(FieldError("file", type)))

    @Test
    fun `a JPEG is stored upright, scaled to a 2048 px long edge and without its EXIF`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, visitId) = addVisit(admin)
        // Left half red, right half blue; orientation 6 means the camera was turned 90 degrees clockwise.
        val source = withExifOrientation(jpeg(halves(3000, 1000)), 6)
        exifOrientation(source) shouldBe 6

        val image = client.uploadOk(visitId, source, admin)

        image.width shouldBe 683
        image.height shouldBe 2048
        image.caption shouldBe null
        image.url shouldBe "$PUBLIC_BASE_URL/api/v1/visit-images/visits/$visitId/${image.id}.jpg"
        val res = client.stored(image.url)
        res.status shouldBe HttpStatusCode.OK
        res.contentType()?.withoutParameters() shouldBe ContentType.Image.JPEG
        res.headers[HttpHeaders.CacheControl] shouldBe "public, max-age=31536000, immutable"
        val bytes = res.readRawBytes()
        exifOrientation(bytes) shouldBe 1
        String(bytes, Charsets.ISO_8859_1).contains("Exif") shouldBe false
        val stored = ImageIO.read(ByteArrayInputStream(bytes))
        stored.width shouldBe 683
        stored.height shouldBe 2048
        // Rotated clockwise: the left (red) half is now on top.
        Color(stored.getRGB(341, 200)).let { it.red shouldBeGreaterThan 200; it.blue shouldBeLessThan 60 }
        Color(stored.getRGB(341, 1848)).let { it.blue shouldBeGreaterThan 200; it.red shouldBeLessThan 60 }

        client.visitImages(shopId) shouldBe listOf(listOf(image))
    }

    @Test
    fun `a small PNG with transparency becomes a JPEG of the same size`() = testApp { t ->
        val admin = t.adminToken()
        val (_, visitId) = addVisit(admin)
        val png = ByteArrayOutputStream().also { ImageIO.write(BufferedImage(120, 80, BufferedImage.TYPE_INT_ARGB), "png", it) }.toByteArray()

        val image = client.uploadOk(visitId, png, admin)

        image.width shouldBe 120
        image.height shouldBe 80
        val stored = client.stored(image.url).readRawBytes()
        ImageIO.getImageReaders(ImageIO.createImageInputStream(ByteArrayInputStream(stored))).next().formatName shouldBe "JPEG"
        // Transparent pixels turn white.
        Color(ImageIO.read(ByteArrayInputStream(stored)).getRGB(60, 40)).red shouldBeGreaterThan 240
    }

    @Test
    fun `other formats, broken images, oversized sources and missing parts are refused with a file error`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, visitId) = addVisit(admin)
        val gif = ByteArrayOutputStream().also { ImageIO.write(BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB), "gif", it) }.toByteArray()
        val truncatedJpeg = jpeg(halves(200, 100)).copyOf(300)

        for (bytes in listOf("not an image".toByteArray(), gif, truncatedJpeg)) {
            client.upload(visitId, bytes, admin).let {
                it.status shouldBe HttpStatusCode.BadRequest
                it.body<ErrorBody>() shouldBe fileError(FieldErrorType.INVALID_FORMAT, "unsupported image")
            }
        }
        // 8000 x 8000 = 64 MP, refused from the header before anything is decoded.
        client.upload(visitId, pngHeaderOnly(8000, 8000), admin).body<ErrorBody>() shouldBe
            fileError(FieldErrorType.OUT_OF_RANGE, "unsupported image")
        client.upload(visitId, jpeg(halves(20, 10)), admin, name = "other").body<ErrorBody>() shouldBe
            fileError(FieldErrorType.REQUIRED, "file part required")
        client.post("/api/v1/auth/visits/$visitId/images") {
            session(admin)
            contentType(ContentType.Image.JPEG)
            setBody(jpeg(halves(20, 10)))
        }.body<ErrorBody>() shouldBe fileError(FieldErrorType.REQUIRED, "multipart file required")

        client.visitImages(shopId) shouldBe listOf(emptyList())
    }

    @Test
    fun `an upload over 15 MB is refused`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, visitId) = addVisit(admin)
        val tooLarge = jpeg(halves(20, 10)).copyOf((VISIT_IMAGE_MAX_BYTES + 1).toInt())

        client.upload(visitId, tooLarge, admin).let {
            it.status shouldBe HttpStatusCode.BadRequest
            it.body<ErrorBody>() shouldBe fileError(FieldErrorType.TOO_LONG, "image larger than 15 MB")
        }
        client.visitImages(shopId) shouldBe listOf(emptyList())
    }

    @Test
    fun `a visit log holds at most 10 images`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, visitId) = addVisit(admin)
        val small = jpeg(halves(16, 8))
        repeat(VISIT_IMAGES_PER_VISIT_MAX) { client.uploadOk(visitId, small, admin) }

        client.upload(visitId, small, admin).let {
            it.status shouldBe HttpStatusCode.Conflict
            it.body<ErrorBody>().type shouldBe ErrorType.VISIT_IMAGE_LIMIT_REACHED
        }
        client.visitImages(shopId).single().size shouldBe VISIT_IMAGES_PER_VISIT_MAX
    }

    @Test
    fun `uploads beyond the processing cap get 503`() = testApp(visitImageMaxPendingUploads = 0) { t ->
        val admin = t.adminToken()
        val (_, visitId) = addVisit(admin)

        client.upload(visitId, jpeg(halves(16, 8)), admin).let {
            it.status shouldBe HttpStatusCode.ServiceUnavailable
            it.headers[HttpHeaders.RetryAfter] shouldBe "5"
            it.body<ErrorBody>().type shouldBe ErrorType.VISIT_IMAGE_PROCESSING_BUSY
        }
    }

    @Test
    fun `images append in order and the admin captions, reorders and deletes them`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, visitId) = addVisit(admin)
        val (a, b, c) = List(3) { client.uploadOk(visitId, jpeg(halves(16, 8)), admin) }
        client.visitImages(shopId) shouldBe listOf(listOf(a, b, c))

        val captioned = client.putJson("/api/v1/auth/visit-images/${b.id}", encode(UpdateVisitImageRequest(caption = "  特製  ")), admin)
            .body<VisitImage>()
        captioned shouldBe b.copy(caption = "特製")
        client.putJson("/api/v1/auth/visit-images/${b.id}", encode(UpdateVisitImageRequest(caption = "あ".repeat(101))), admin).let {
            it.status shouldBe HttpStatusCode.BadRequest
            it.body<ErrorBody>().fieldErrors shouldBe listOf(FieldError("caption", FieldErrorType.TOO_LONG))
        }
        client.putJson("/api/v1/auth/visit-images/${b.id}", encode(UpdateVisitImageRequest(caption = "あ".repeat(100))), admin)
            .body<VisitImage>().caption shouldBe "あ".repeat(100)
        // Code points, not UTF-16 units: 100 emoji fit.
        client.putJson("/api/v1/auth/visit-images/${b.id}", encode(UpdateVisitImageRequest(caption = "🍜".repeat(100))), admin)
            .body<VisitImage>().caption shouldBe "🍜".repeat(100)
        client.putJson("/api/v1/auth/visit-images/${b.id}", encode(UpdateVisitImageRequest(caption = "   ")), admin)
            .body<VisitImage>().caption shouldBe null

        suspend fun reorder(vararg ids: String) =
            client.putJson("/api/v1/auth/visits/$visitId/images/order", encode(ReorderVisitImagesRequest(ids.toList())), admin)
        reorder(c.id, a.id, b.id).body<VisitImagesResponse>().images.map { it.id } shouldContainExactly listOf(c.id, a.id, b.id)
        client.visitImages(shopId).single().map { it.id } shouldContainExactly listOf(c.id, a.id, b.id)
        // The list must name every image exactly once.
        for ((ids, type) in listOf(
            listOf(c.id, a.id) to FieldErrorType.UNKNOWN,
            listOf(c.id, a.id, b.id, UUID.randomUUID().toString()) to FieldErrorType.UNKNOWN,
            listOf(c.id, a.id, a.id) to FieldErrorType.DUPLICATE,
            listOf(c.id, a.id, "nope") to FieldErrorType.UNKNOWN,
        )) {
            reorder(*ids.toTypedArray()).let {
                it.status shouldBe HttpStatusCode.BadRequest
                it.body<ErrorBody>().fieldErrors shouldBe listOf(FieldError("imageIds", type))
            }
        }
        client.visitImages(shopId).single().map { it.id } shouldContainExactly listOf(c.id, a.id, b.id)

        client.deleteWithSession("/api/v1/auth/visit-images/${a.id}", admin).status shouldBe HttpStatusCode.NoContent
        client.stored(a.url).status shouldBe HttpStatusCode.NotFound
        client.visitImages(shopId).single().map { it.id } shouldContainExactly listOf(c.id, b.id)
        client.deleteWithSession("/api/v1/auth/visit-images/${a.id}", admin).status shouldBe HttpStatusCode.NotFound
        // A new image goes after the remaining ones.
        val d = client.uploadOk(visitId, jpeg(halves(16, 8)), admin)
        client.visitImages(shopId).single().map { it.id } shouldContainExactly listOf(c.id, b.id, d.id)
    }

    @Test
    fun `deleting a visit log deletes its images`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, visitId) = addVisit(admin)
        val images = List(2) { client.uploadOk(visitId, jpeg(halves(16, 8)), admin) }

        client.deleteWithSession("/api/v1/auth/visits/$visitId", admin).status shouldBe HttpStatusCode.NoContent

        images.forEach { client.stored(it.url).status shouldBe HttpStatusCode.NotFound }
        client.visitImages(shopId).shouldBeEmpty()
        client.shops().single().coverPhotoUrl shouldBe null
        t.dataSource.connection.use { c ->
            c.createStatement().executeQuery("SELECT count(*) FROM visit_images").use { it.getLong(1) } shouldBe 0
        }
    }

    @Test
    fun `the cover photo is the first image of the latest visit log that has images`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, older) = addVisit(admin, visitedOn = "2023-05-01")
        val (_, newer) = addVisit(admin, visitedOn = "2024-01-01", shopId = shopId)
        val (_, undated) = addVisit(admin, shopId = shopId)
        val (otherShop, _) = addVisit(admin)
        fun cover(shops: List<Shop>, id: String) = shops.single { it.id == id }.coverPhotoUrl

        cover(client.shops(), shopId) shouldBe null
        client.uploadOk(undated, jpeg(halves(16, 8)), admin)
        val olderFirst = client.uploadOk(older, jpeg(halves(16, 8)), admin)
        val olderSecond = client.uploadOk(older, jpeg(halves(16, 8)), admin)
        // The newest visit has no images and an undated one counts as the oldest.
        cover(client.shops(), shopId) shouldBe olderFirst.url
        cover(client.shops(), otherShop) shouldBe null

        client.putJson("/api/v1/auth/visits/$older/images/order", encode(ReorderVisitImagesRequest(listOf(olderSecond.id, olderFirst.id))), admin)
        cover(client.shops(), shopId) shouldBe olderSecond.url

        val newerFirst = client.uploadOk(newer, jpeg(halves(16, 8)), admin)
        cover(client.shops(), shopId) shouldBe newerFirst.url
        client.deleteWithSession("/api/v1/auth/visit-images/${newerFirst.id}", admin)
        cover(client.shops(), shopId) shouldBe olderSecond.url
    }

    @Test
    fun `image writes need the admin`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, visitId) = addVisit(admin)
        val image = client.uploadOk(visitId, jpeg(halves(16, 8)), admin)

        for ((token, status, type) in listOf(
            Triple(null, HttpStatusCode.Unauthorized, ErrorType.AUTHENTICATION_REQUIRED),
            Triple(t.userToken(), HttpStatusCode.Forbidden, ErrorType.PERMISSION_DENIED),
        )) {
            listOf(
                client.upload(visitId, jpeg(halves(16, 8)), token),
                client.putJson("/api/v1/auth/visit-images/${image.id}", encode(UpdateVisitImageRequest(caption = "x")), token),
                client.putJson("/api/v1/auth/visits/$visitId/images/order", encode(ReorderVisitImagesRequest(listOf(image.id))), token),
                client.deleteWithSession("/api/v1/auth/visit-images/${image.id}", token),
            ).forEach {
                it.status shouldBe status
                it.body<ErrorBody>().type shouldBe type
            }
        }
        client.visitImages(shopId) shouldBe listOf(listOf(image))
    }

    @Test
    fun `unknown visit logs and images are not found, and the local route serves only stored keys`() = testApp { t ->
        val admin = t.adminToken()
        val unknown = UUID.randomUUID().toString()
        for (id in listOf(unknown, "not-a-uuid")) {
            client.upload(id, jpeg(halves(16, 8)), admin).status shouldBe HttpStatusCode.NotFound
            client.putJson("/api/v1/auth/visits/$id/images/order", encode(ReorderVisitImagesRequest(emptyList())), admin).status shouldBe
                HttpStatusCode.NotFound
            client.putJson("/api/v1/auth/visit-images/$id", encode(UpdateVisitImageRequest()), admin).status shouldBe HttpStatusCode.NotFound
            client.deleteWithSession("/api/v1/auth/visit-images/$id", admin).status shouldBe HttpStatusCode.NotFound
        }
        for (path in listOf("visits/$unknown/$unknown.jpg", "../test.db", "visits/..%2F..%2Ftest.db")) {
            client.get("/api/v1/visit-images/$path").status shouldBe HttpStatusCode.NotFound
        }
    }

    @Test
    fun `with R2 the JPEG goes to the bucket under the visit and is deleted with the image and the visit`() =
        testApp(visitImageStore = r2) { t ->
            val admin = t.adminToken()
            val (shopId, visitId) = addVisit(admin)
            val (first, second) = List(2) { client.uploadOk(visitId, withExifOrientation(jpeg(halves(300, 100)), 6), admin) }
            val firstPath = "/images/visits/$visitId/${first.id}.jpg"
            val secondPath = "/images/visits/$visitId/${second.id}.jpg"

            first.url shouldBe "https://images.example/visits/$visitId/${first.id}.jpg"
            s3.contentTypes[firstPath] shouldStartWith "image/jpeg"
            ImageIO.read(ByteArrayInputStream(s3.objects.getValue(firstPath))).let {
                it.width shouldBe 100
                it.height shouldBe 300
            }
            client.shops().single().coverPhotoUrl shouldBe first.url
            // Nothing is served locally when the images live in R2.
            client.get("/api/v1/visit-images/visits/$visitId/${first.id}.jpg").status shouldBe HttpStatusCode.NotFound

            client.deleteWithSession("/api/v1/auth/visit-images/${first.id}", admin).status shouldBe HttpStatusCode.NoContent
            s3.objects.keys shouldBe setOf(secondPath)
            client.deleteWithSession("/api/v1/auth/visits/$visitId", admin).status shouldBe HttpStatusCode.NoContent
            s3.objects.keys.shouldBeEmpty()
            s3.requests.filter { it.startsWith("DELETE") } shouldContainExactly listOf("DELETE $firstPath", "DELETE $secondPath")
            client.visitImages(shopId).shouldBeEmpty()
        }

    @Test
    fun `a failed object delete still deletes the image`() = testApp(visitImageStore = r2) { t ->
        val admin = t.adminToken()
        val (shopId, visitId) = addVisit(admin)
        val image = client.uploadOk(visitId, jpeg(halves(16, 8)), admin)
        s3.fail = true

        client.deleteWithSession("/api/v1/auth/visit-images/${image.id}", admin).status shouldBe HttpStatusCode.NoContent
        client.visitImages(shopId) shouldBe listOf(emptyList())
    }

    /** A PNG signature and IHDR claiming [width] x [height], without pixel data. */
    private fun pngHeaderOnly(width: Int, height: Int): ByteArray {
        val ihdr = ByteBuffer.allocate(17).put("IHDR".toByteArray()).putInt(width).putInt(height)
            .put(8).put(2).put(0).put(0).put(0).array()
        val crc = CRC32().apply { update(ihdr) }.value.toInt()
        val signature = byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte(), 13, 10, 26, 10)
        return signature + ByteBuffer.allocate(4).putInt(13).array() + ihdr + ByteBuffer.allocate(4).putInt(crc).array()
    }
}
