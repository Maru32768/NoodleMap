package dev.marulabs.noodlemap.mealrecords

import dev.marulabs.noodlemap.Config
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
import dev.marulabs.noodlemap.generated.models.ReorderMealRecordImagesRequest
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.generated.models.UpdateMealRecordImageRequest
import dev.marulabs.noodlemap.generated.models.MealRecordImage
import dev.marulabs.noodlemap.generated.models.MealRecordImagesResponse
import dev.marulabs.noodlemap.generated.models.MealRecord
import dev.marulabs.noodlemap.generated.models.MealRecordInput
import dev.marulabs.noodlemap.generated.models.MealRecordsResponse
import dev.marulabs.noodlemap.postJson
import dev.marulabs.noodlemap.putJson
import dev.marulabs.noodlemap.session
import dev.marulabs.noodlemap.shops.shops
import dev.marulabs.noodlemap.testApp
import dev.marulabs.noodlemap.withTestDb
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
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.readRawBytes
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.contentType
import io.ktor.http.headersOf
import io.ktor.server.testing.ApplicationTestBuilder
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.UUID
import java.util.zip.CRC32
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import javax.imageio.stream.MemoryCacheImageOutputStream
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test

class MealRecordImageApiTest {

    private val s3 = FakeS3()
    private val r2 = R2MealRecordImageStore(s3.r2Config("images", "https://images.example"))

    @AfterEach
    fun tearDown() {
        r2.close()
        s3.stop()
    }

    private suspend fun ApplicationTestBuilder.addMealRecord(admin: String, eatenOn: String? = null, shopId: String? = null): Pair<String, String> {
        val shop = shopId ?: client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = null)), admin).body<Shop>().id
        val mealRecord = client.postJson("/api/v1/auth/meal-records", encode(MealRecordInput(shopIds = listOf(shop), eatenOn = eatenOn)), admin)
            .body<MealRecord>().id
        return shop to mealRecord
    }

    private suspend fun HttpClient.upload(
        mealRecordId: String,
        bytes: ByteArray,
        token: String?,
        name: String = "file",
        origin: String? = PUBLIC_BASE_URL,
    ): HttpResponse =
        submitFormWithBinaryData(
            "/api/v1/auth/meal-records/$mealRecordId/images",
            formData {
                append(name, bytes, Headers.build {
                    append(HttpHeaders.ContentType, "application/octet-stream")
                    append(HttpHeaders.ContentDisposition, "filename=\"photo\"")
                })
            },
        ) {
            token?.let { session(it) }
            origin?.let { header(HttpHeaders.Origin, it) }
        }

    private suspend fun HttpClient.uploadOk(mealRecordId: String, bytes: ByteArray, admin: String): MealRecordImage =
        upload(mealRecordId, bytes, admin).also { it.status shouldBe HttpStatusCode.OK }.body()

    private suspend fun HttpClient.mealRecordImages(shopId: String): List<List<MealRecordImage>> =
        get("/api/v1/shops/$shopId/meal-records").body<MealRecordsResponse>().mealRecords.map { it.images }

    /** The stored JPEG behind a local-disk URL, through the public route. */
    private suspend fun HttpClient.stored(url: String): HttpResponse = get(url.removePrefix(PUBLIC_BASE_URL))

    private fun fileError(type: FieldErrorType, message: String) =
        ErrorBody(ErrorType.INVALID_REQUEST, message, listOf(FieldError("file", type)))

    @Test
    fun `a JPEG is stored upright, scaled to a 2048 px long edge and without its EXIF`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, mealRecordId) = addMealRecord(admin)
        // Left half red, right half blue; orientation 6 means the camera was turned 90 degrees clockwise.
        val source = withExifOrientation(jpeg(halves(3000, 1000)), 6)
        exifOrientation(source) shouldBe 6

        val image = client.uploadOk(mealRecordId, source, admin)

        // 3000 x 1000 scaled to 2048 x 683, then turned upright.
        image.width shouldBe 683
        image.height shouldBe 2048
        image.caption shouldBe null
        image.url shouldBe "$PUBLIC_BASE_URL/api/v1/meal-record-images/meal-records/$mealRecordId/${image.id}.jpg"
        val res = client.stored(image.url)
        res.status shouldBe HttpStatusCode.OK
        res.contentType()?.withoutParameters() shouldBe ContentType.Image.JPEG
        res.headers[HttpHeaders.CacheControl] shouldBe "public, max-age=86400"
        val bytes = res.readRawBytes()
        exifOrientation(bytes) shouldBe 1
        String(bytes, Charsets.ISO_8859_1).contains("Exif") shouldBe false
        val stored = ImageIO.read(ByteArrayInputStream(bytes))
        stored.width shouldBe 683
        stored.height shouldBe 2048
        // Rotated clockwise: the left (red) half is now on top.
        Color(stored.getRGB(341, 200)).let { it.red shouldBeGreaterThan 200; it.blue shouldBeLessThan 60 }
        Color(stored.getRGB(341, 1848)).let { it.blue shouldBeGreaterThan 200; it.red shouldBeLessThan 60 }

        client.mealRecordImages(shopId) shouldBe listOf(listOf(image))
    }

    @Test
    fun `a small PNG with transparency becomes a JPEG of the same size`() = testApp { t ->
        val admin = t.adminToken()
        val (_, mealRecordId) = addMealRecord(admin)
        val png = ByteArrayOutputStream().also { ImageIO.write(BufferedImage(120, 80, BufferedImage.TYPE_INT_ARGB), "png", it) }.toByteArray()

        val image = client.uploadOk(mealRecordId, png, admin)

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
        val (shopId, mealRecordId) = addMealRecord(admin)
        val gif = ByteArrayOutputStream().also { ImageIO.write(BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB), "gif", it) }.toByteArray()
        val truncatedJpeg = jpeg(halves(200, 100)).copyOf(300)

        for (bytes in listOf("not an image".toByteArray(), gif, truncatedJpeg)) {
            client.upload(mealRecordId, bytes, admin).let {
                it.status shouldBe HttpStatusCode.BadRequest
                it.body<ErrorBody>() shouldBe fileError(FieldErrorType.INVALID_FORMAT, "unsupported image")
            }
        }
        // 8000 x 8000 = 64 MP, refused from the header before anything is decoded.
        client.upload(mealRecordId, pngHeaderOnly(8000, 8000), admin).body<ErrorBody>() shouldBe
            fileError(FieldErrorType.OUT_OF_RANGE, "unsupported image")
        // A progressive JPEG over 30 MP is refused too, though a baseline one that size would be decoded.
        client.upload(mealRecordId, progressiveJpegClaiming(6000, 6000), admin).body<ErrorBody>() shouldBe
            fileError(FieldErrorType.OUT_OF_RANGE, "unsupported image")
        client.upload(mealRecordId, jpeg(halves(20, 10)), admin, name = "other").body<ErrorBody>() shouldBe
            fileError(FieldErrorType.REQUIRED, "file part required")
        // Not multipart, a malformed Content-Type, and multipart without a boundary.
        for ((type, expected) in listOf(
            "image/jpeg" to fileError(FieldErrorType.REQUIRED, "multipart file required"),
            "not a content type" to fileError(FieldErrorType.REQUIRED, "multipart file required"),
            "multipart/form-data" to ErrorBody(ErrorType.INVALID_REQUEST, "invalid multipart body"),
        )) {
            client.post("/api/v1/auth/meal-records/$mealRecordId/images") {
                session(admin)
                header(HttpHeaders.Origin, PUBLIC_BASE_URL)
                // Raw header text: the client would refuse to parse the malformed one itself.
                setBody(object : OutgoingContent.ByteArrayContent() {
                    override val headers = headersOf(HttpHeaders.ContentType, type)
                    override fun bytes() = jpeg(halves(20, 10))
                })
            }.let {
                it.status shouldBe HttpStatusCode.BadRequest
                it.body<ErrorBody>() shouldBe expected
            }
        }

        client.mealRecordImages(shopId) shouldBe listOf(emptyList())
    }

    @Test
    fun `uploads must come from the site's own origin`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, mealRecordId) = addMealRecord(admin)

        // localhost is only trusted in local development (an http site).
        for (origin in listOf(
            null, "https://evil.example", "http://noodle.example", "https://noodle.example.evil.example", "https://localhost:5173",
        )) {
            client.upload(mealRecordId, jpeg(halves(16, 8)), admin, origin = origin).let {
                it.status shouldBe HttpStatusCode.Forbidden
                it.body<ErrorBody>().type shouldBe ErrorType.PERMISSION_DENIED
            }
        }
        client.mealRecordImages(shopId) shouldBe listOf(emptyList())
        client.uploadOk(mealRecordId, jpeg(halves(16, 8)), admin)
    }

    @Test
    fun `in local development uploads also come from localhost web servers`() = testApp(publicBaseUrl = "http://localhost:8888") { t ->
        val admin = t.adminToken()
        val (_, mealRecordId) = addMealRecord(admin)

        // The Vite dev server, the e2e preview, 127.0.0.1, and the API's own origin.
        for (origin in listOf("https://localhost:5173", "http://localhost:14180", "http://127.0.0.1:14180", "http://localhost:8888")) {
            client.upload(mealRecordId, jpeg(halves(16, 8)), admin, origin = origin).status shouldBe HttpStatusCode.OK
        }
        for (origin in listOf(null, "https://evil.example", "http://localhost.evil.example:14180", "http://127.0.0.2:14180")) {
            client.upload(mealRecordId, jpeg(halves(16, 8)), admin, origin = origin).status shouldBe HttpStatusCode.Forbidden
        }
    }

    @Test
    fun `without storage uploads get 503 before anything is read`() =
        testApp(mealRecordImageStore = UnconfiguredMealRecordImageStore(PUBLIC_BASE_URL)) { t ->
            val admin = t.adminToken()
            val (shopId, mealRecordId) = addMealRecord(admin)

            client.upload(mealRecordId, jpeg(halves(16, 8)), admin).let {
                it.status shouldBe HttpStatusCode.ServiceUnavailable
                it.body<ErrorBody>().type shouldBe ErrorType.MEAL_RECORD_IMAGES_STORAGE_UNCONFIGURED
            }
            client.mealRecordImages(shopId) shouldBe listOf(emptyList())
        }

    @Test
    fun `local disk is used only for an http site, and an https site without R2 has no storage`() = withTestDb { t ->
        fun storeFor(publicBaseUrl: String, r2: Config.R2Config? = null) =
            mealRecordImageStoreFor(t.config.copy(publicBaseUrl = publicBaseUrl, mealRecordImagesR2 = r2))

        storeFor("http://localhost:8888").let {
            (it is LocalMealRecordImageStore) shouldBe true
            it.acceptsUploads shouldBe true
        }
        storeFor("https://noodle.example").let {
            (it is UnconfiguredMealRecordImageStore) shouldBe true
            it.acceptsUploads shouldBe false
        }
        storeFor("https://noodle.example", s3.r2Config("images", "https://images.example")).use {
            (it is R2MealRecordImageStore) shouldBe true
        }
    }

    @Test
    fun `an upload over 15 MB is refused`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, mealRecordId) = addMealRecord(admin)
        // Just over the limit: read and cut off mid-stream. Well over it: refused from the Content-Length.
        for (size in listOf(MEAL_RECORD_IMAGE_MAX_BYTES + 1, MEAL_RECORD_IMAGE_MAX_BYTES + 1024 * 1024)) {
            client.upload(mealRecordId, jpeg(halves(20, 10)).copyOf(size.toInt()), admin).let {
                it.status shouldBe HttpStatusCode.BadRequest
                it.body<ErrorBody>() shouldBe fileError(FieldErrorType.TOO_LONG, "image larger than 15 MB")
            }
        }
        client.mealRecordImages(shopId) shouldBe listOf(emptyList())
    }

    @Test
    fun `a meal record holds at most 10 images`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, mealRecordId) = addMealRecord(admin)
        val small = jpeg(halves(16, 8))
        repeat(MEAL_RECORD_IMAGES_PER_MEAL_RECORD_MAX) { client.uploadOk(mealRecordId, small, admin) }

        client.upload(mealRecordId, small, admin).let {
            it.status shouldBe HttpStatusCode.Conflict
            it.body<ErrorBody>().type shouldBe ErrorType.MEAL_RECORD_IMAGE_LIMIT_REACHED
        }
        client.mealRecordImages(shopId).single().size shouldBe MEAL_RECORD_IMAGES_PER_MEAL_RECORD_MAX
    }

    @Test
    fun `uploads beyond the processing cap get 503`() = testApp(maxPendingBitmapWork = 0) { t ->
        val admin = t.adminToken()
        val (_, mealRecordId) = addMealRecord(admin)

        client.upload(mealRecordId, jpeg(halves(16, 8)), admin).let {
            it.status shouldBe HttpStatusCode.ServiceUnavailable
            it.headers[HttpHeaders.RetryAfter] shouldBe "5"
            it.body<ErrorBody>().type shouldBe ErrorType.MEAL_RECORD_IMAGE_PROCESSING_BUSY
        }
    }

    @Test
    fun `images append in order and the admin captions, reorders and deletes them`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, mealRecordId) = addMealRecord(admin)
        val (a, b, c) = List(3) { client.uploadOk(mealRecordId, jpeg(halves(16, 8)), admin) }
        client.mealRecordImages(shopId) shouldBe listOf(listOf(a, b, c))

        val captioned = client.putJson("/api/v1/auth/meal-record-images/${b.id}", encode(UpdateMealRecordImageRequest(caption = "  特製  ")), admin)
            .body<MealRecordImage>()
        captioned shouldBe b.copy(caption = "特製")
        client.putJson("/api/v1/auth/meal-record-images/${b.id}", encode(UpdateMealRecordImageRequest(caption = "あ".repeat(101))), admin).let {
            it.status shouldBe HttpStatusCode.BadRequest
            it.body<ErrorBody>().fieldErrors shouldBe listOf(FieldError("caption", FieldErrorType.TOO_LONG))
        }
        client.putJson("/api/v1/auth/meal-record-images/${b.id}", encode(UpdateMealRecordImageRequest(caption = "あ".repeat(100))), admin)
            .body<MealRecordImage>().caption shouldBe "あ".repeat(100)
        // Code points, not UTF-16 units: 100 emoji fit.
        client.putJson("/api/v1/auth/meal-record-images/${b.id}", encode(UpdateMealRecordImageRequest(caption = "🍜".repeat(100))), admin)
            .body<MealRecordImage>().caption shouldBe "🍜".repeat(100)
        client.putJson("/api/v1/auth/meal-record-images/${b.id}", encode(UpdateMealRecordImageRequest(caption = "   ")), admin)
            .body<MealRecordImage>().caption shouldBe null

        suspend fun reorder(vararg ids: String) =
            client.putJson("/api/v1/auth/meal-records/$mealRecordId/images/order", encode(ReorderMealRecordImagesRequest(ids.toList())), admin)
        reorder(c.id, a.id, b.id).body<MealRecordImagesResponse>().images.map { it.id } shouldContainExactly listOf(c.id, a.id, b.id)
        client.mealRecordImages(shopId).single().map { it.id } shouldContainExactly listOf(c.id, a.id, b.id)
        // At most as many ids as a meal record can hold images, checked before anything else.
        reorder(*Array(MEAL_RECORD_IMAGES_PER_MEAL_RECORD_MAX + 1) { c.id }).body<ErrorBody>().fieldErrors shouldBe
            listOf(FieldError("imageIds", FieldErrorType.OUT_OF_RANGE))
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
        client.mealRecordImages(shopId).single().map { it.id } shouldContainExactly listOf(c.id, a.id, b.id)

        client.deleteWithSession("/api/v1/auth/meal-record-images/${a.id}", admin).status shouldBe HttpStatusCode.NoContent
        client.stored(a.url).status shouldBe HttpStatusCode.NotFound
        client.mealRecordImages(shopId).single().map { it.id } shouldContainExactly listOf(c.id, b.id)
        client.deleteWithSession("/api/v1/auth/meal-record-images/${a.id}", admin).status shouldBe HttpStatusCode.NotFound
        // A new image goes after the remaining ones.
        val d = client.uploadOk(mealRecordId, jpeg(halves(16, 8)), admin)
        client.mealRecordImages(shopId).single().map { it.id } shouldContainExactly listOf(c.id, b.id, d.id)
    }

    @Test
    fun `deleting a meal record deletes its images`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, mealRecordId) = addMealRecord(admin)
        val images = List(2) { client.uploadOk(mealRecordId, jpeg(halves(16, 8)), admin) }

        client.deleteWithSession("/api/v1/auth/meal-records/$mealRecordId", admin).status shouldBe HttpStatusCode.NoContent

        images.forEach { client.stored(it.url).status shouldBe HttpStatusCode.NotFound }
        client.mealRecordImages(shopId).shouldBeEmpty()
        client.shops().single().coverPhotoUrl shouldBe null
        t.dataSource.connection.use { c ->
            c.createStatement().executeQuery("SELECT count(*) FROM meal_record_images").use { it.getLong(1) } shouldBe 0
        }
    }

    @Test
    fun `the cover photo is the first image of the latest meal record that has images`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, older) = addMealRecord(admin, eatenOn = "2023-05-01")
        val (_, newer) = addMealRecord(admin, eatenOn = "2024-01-01", shopId = shopId)
        val (_, undated) = addMealRecord(admin, shopId = shopId)
        val (otherShop, _) = addMealRecord(admin)
        fun cover(shops: List<Shop>, id: String) = shops.single { it.id == id }.coverPhotoUrl

        cover(client.shops(), shopId) shouldBe null
        client.uploadOk(undated, jpeg(halves(16, 8)), admin)
        val olderFirst = client.uploadOk(older, jpeg(halves(16, 8)), admin)
        val olderSecond = client.uploadOk(older, jpeg(halves(16, 8)), admin)
        // The newest meal record has no images and an undated one counts as the oldest.
        cover(client.shops(), shopId) shouldBe olderFirst.url
        cover(client.shops(), otherShop) shouldBe null

        client.putJson("/api/v1/auth/meal-records/$older/images/order", encode(ReorderMealRecordImagesRequest(listOf(olderSecond.id, olderFirst.id))), admin)
        cover(client.shops(), shopId) shouldBe olderSecond.url

        val newerFirst = client.uploadOk(newer, jpeg(halves(16, 8)), admin)
        cover(client.shops(), shopId) shouldBe newerFirst.url
        client.deleteWithSession("/api/v1/auth/meal-record-images/${newerFirst.id}", admin)
        cover(client.shops(), shopId) shouldBe olderSecond.url
    }

    @Test
    fun `image writes need the admin`() = testApp { t ->
        val admin = t.adminToken()
        val (shopId, mealRecordId) = addMealRecord(admin)
        val image = client.uploadOk(mealRecordId, jpeg(halves(16, 8)), admin)

        for ((token, status, type) in listOf(
            Triple(null, HttpStatusCode.Unauthorized, ErrorType.AUTHENTICATION_REQUIRED),
            Triple(t.userToken(), HttpStatusCode.Forbidden, ErrorType.PERMISSION_DENIED),
        )) {
            listOf(
                client.upload(mealRecordId, jpeg(halves(16, 8)), token),
                client.putJson("/api/v1/auth/meal-record-images/${image.id}", encode(UpdateMealRecordImageRequest(caption = "x")), token),
                client.putJson("/api/v1/auth/meal-records/$mealRecordId/images/order", encode(ReorderMealRecordImagesRequest(listOf(image.id))), token),
                client.deleteWithSession("/api/v1/auth/meal-record-images/${image.id}", token),
            ).forEach {
                it.status shouldBe status
                it.body<ErrorBody>().type shouldBe type
            }
        }
        client.mealRecordImages(shopId) shouldBe listOf(listOf(image))
    }

    @Test
    fun `unknown meal records and images are not found, and the local route serves only stored keys`() = testApp { t ->
        val admin = t.adminToken()
        val unknown = UUID.randomUUID().toString()
        for (id in listOf(unknown, "not-a-uuid")) {
            client.upload(id, jpeg(halves(16, 8)), admin).status shouldBe HttpStatusCode.NotFound
            client.putJson("/api/v1/auth/meal-records/$id/images/order", encode(ReorderMealRecordImagesRequest(emptyList())), admin).status shouldBe
                HttpStatusCode.NotFound
            client.putJson("/api/v1/auth/meal-record-images/$id", encode(UpdateMealRecordImageRequest()), admin).status shouldBe HttpStatusCode.NotFound
            client.deleteWithSession("/api/v1/auth/meal-record-images/$id", admin).status shouldBe HttpStatusCode.NotFound
        }
        for (path in listOf("meal-records/$unknown/$unknown.jpg", "../test.db", "meal-records/..%2F..%2Ftest.db")) {
            client.get("/api/v1/meal-record-images/$path").status shouldBe HttpStatusCode.NotFound
        }
    }

    @Test
    fun `with R2 the JPEG goes to the bucket under the mealRecord and is deleted with the image and the mealRecord`() =
        testApp(mealRecordImageStore = r2) { t ->
            val admin = t.adminToken()
            val (shopId, mealRecordId) = addMealRecord(admin)
            val (first, second) = List(2) { client.uploadOk(mealRecordId, withExifOrientation(jpeg(halves(300, 100)), 6), admin) }
            val firstPath = "/images/meal-records/$mealRecordId/${first.id}.jpg"
            val secondPath = "/images/meal-records/$mealRecordId/${second.id}.jpg"
            val firstLegacyPath = "/images/visits/$mealRecordId/${first.id}.jpg"
            s3.objects[firstLegacyPath] = s3.objects.getValue(firstPath).copyOf()

            first.url shouldBe "https://images.example/meal-records/$mealRecordId/${first.id}.jpg"
            s3.contentTypes[firstPath] shouldStartWith "image/jpeg"
            ImageIO.read(ByteArrayInputStream(s3.objects.getValue(firstPath))).let {
                it.width shouldBe 100
                it.height shouldBe 300
            }
            client.shops().single().coverPhotoUrl shouldBe first.url
            // Nothing is served locally when the images live in R2.
            client.get("/api/v1/meal-record-images/meal-records/$mealRecordId/${first.id}.jpg").status shouldBe HttpStatusCode.NotFound

            client.deleteWithSession("/api/v1/auth/meal-record-images/${first.id}", admin).status shouldBe HttpStatusCode.NoContent
            s3.objects.keys shouldBe setOf(secondPath)
            client.deleteWithSession("/api/v1/auth/meal-records/$mealRecordId", admin).status shouldBe HttpStatusCode.NoContent
            s3.objects.keys.shouldBeEmpty()
            s3.requests.filter { it.startsWith("DELETE") } shouldContainExactly listOf(
                "DELETE $firstPath", "DELETE $firstLegacyPath", "DELETE $secondPath", "DELETE /images/visits/$mealRecordId/${second.id}.jpg",
            )
            client.mealRecordImages(shopId).shouldBeEmpty()
        }

    @Test
    fun `a failed object delete still deletes the image`() = testApp(mealRecordImageStore = r2) { t ->
        val admin = t.adminToken()
        val (shopId, mealRecordId) = addMealRecord(admin)
        val image = client.uploadOk(mealRecordId, jpeg(halves(16, 8)), admin)
        s3.fail = true

        client.deleteWithSession("/api/v1/auth/meal-record-images/${image.id}", admin).status shouldBe HttpStatusCode.NoContent
        client.mealRecordImages(shopId) shouldBe listOf(emptyList())
    }

    /** A small progressive JPEG whose frame header claims [width] x [height]. */
    private fun progressiveJpegClaiming(width: Int, height: Int): ByteArray {
        val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
        val out = ByteArrayOutputStream()
        MemoryCacheImageOutputStream(out).use { stream ->
            writer.output = stream
            val param = writer.defaultWriteParam.apply { progressiveMode = ImageWriteParam.MODE_DEFAULT }
            writer.write(null, IIOImage(halves(16, 8), null, null), param)
        }
        writer.dispose()
        val bytes = out.toByteArray()
        // SOF2: FF C2, length (2), precision (1), height (2), width (2).
        val sof = (0 until bytes.size - 1).first { bytes[it] == 0xFF.toByte() && bytes[it + 1] == 0xC2.toByte() }
        ByteBuffer.wrap(bytes, sof + 5, 4).putShort(height.toShort()).putShort(width.toShort())
        return bytes
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
