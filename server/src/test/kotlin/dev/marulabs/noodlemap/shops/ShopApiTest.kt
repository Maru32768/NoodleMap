package dev.marulabs.noodlemap.shops

import dev.marulabs.noodlemap.TestDb
import dev.marulabs.noodlemap.addShopRequest
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.deleteWithSession
import dev.marulabs.noodlemap.encode
import dev.marulabs.noodlemap.errors.ErrorBody
import dev.marulabs.noodlemap.errors.ErrorType
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.generated.models.ShopLink
import dev.marulabs.noodlemap.generated.models.ShopLinkInput
import dev.marulabs.noodlemap.generated.models.ShopLinkType
import dev.marulabs.noodlemap.generated.models.ShopsResponse
import dev.marulabs.noodlemap.generated.models.VisitLog
import dev.marulabs.noodlemap.postJson
import dev.marulabs.noodlemap.putJson
import dev.marulabs.noodlemap.testApp
import dev.marulabs.noodlemap.testJson
import dev.marulabs.noodlemap.toUpdate
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldNotContainIgnoringCase
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import java.util.UUID
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Test

const val SHOYU = "018ff6e8-5291-7a01-9ab8-000000000001"
const val SHIO = "018ff6e8-5291-7a01-9ab8-000000000002"
const val MISO = "018ff6e8-5291-7a01-9ab8-000000000003"

suspend fun HttpClient.shops(): List<Shop> = get("/api/v1/shops").body<ShopsResponse>().shops

private fun TestDb.countRows(table: String, shopId: String): Long = dataSource.connection.use { c ->
    c.prepareStatement("SELECT count(*) FROM $table WHERE shop_id = ?").use {
        it.setString(1, shopId)
        it.executeQuery().use { rs -> rs.getLong(1) }
    }
}

class ShopApiTest {

    private val invalidTagIds = ErrorBody(ErrorType.INVALID_REQUEST, "invalid tag ids", listOf(FieldError("tagIds", FieldErrorType.UNKNOWN)))
    private val duplicatePlaceId =
        ErrorBody(ErrorType.INVALID_REQUEST, "duplicate google place id", listOf(FieldError("googlePlaceId", FieldErrorType.DUPLICATE)))

    @Test
    fun `admin adds a shop and it is listed with its tags`() = testApp { t ->
        val res = client.postJson("/api/v1/auth/shops", encode(addShopRequest(tagIds = listOf(MISO, SHOYU))), t.adminToken())

        res.status shouldBe HttpStatusCode.OK
        val added = res.body<Shop>()
        added.name shouldBe "Ramen Taro"
        added.eaten shouldBe false
        added.rate shouldBe 0.0
        added.favorite shouldBe false
        added.tags.map { it.slug } shouldContainExactly listOf("shoyu-ramen", "miso-ramen")
        client.shops() shouldContainExactly listOf(added)
    }

    @Test
    fun `shop dates are normalized and invalid dates are dropped`() = testApp { t ->
        val res = client.postJson(
            "/api/v1/auth/shops",
            encode(addShopRequest(openedAt = " 2024-01-05 ", closedAt = "2024-13-40")),
            t.adminToken(),
        )

        res.body<Shop>().let {
            it.openedAt shouldBe "2024-01-05"
            it.closedAt shouldBe null
        }
        client.shops().single().let {
            it.openedAt shouldBe "2024-01-05"
            it.closedAt shouldBe null
        }
    }

    @Test
    fun `name kana is trimmed, kept when omitted, and cleared when blank`() = testApp { t ->
        val admin = t.adminToken()
        val req = addShopRequest().copy(nameKana = " らーめんたろう ")
        val added = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>()
        added.nameKana shouldBe "らーめんたろう"
        client.shops().single().nameKana shouldBe "らーめんたろう"

        client.putJson("/api/v1/auth/shops/${added.id}", encode(req.toUpdate().copy(nameKana = " たろう ")), admin)
            .status shouldBe HttpStatusCode.OK
        client.shops().single().nameKana shouldBe "たろう"

        // Older clients don't send the field; that must keep the stored reading.
        val withoutKana = JsonObject(testJson.encodeToJsonElement(req.toUpdate()).jsonObject - "nameKana").toString()
        client.putJson("/api/v1/auth/shops/${added.id}", withoutKana, admin).status shouldBe HttpStatusCode.OK
        client.shops().single().nameKana shouldBe "たろう"

        client.putJson("/api/v1/auth/shops/${added.id}", encode(req.toUpdate().copy(nameKana = "")), admin)
            .status shouldBe HttpStatusCode.OK
        client.shops().single().nameKana shouldBe null
    }

    @Test
    fun `too long name kana is a field error and nothing is written`() = testApp { t ->
        val admin = t.adminToken()
        val tooLong = ErrorBody(ErrorType.INVALID_REQUEST, "name kana too long", listOf(FieldError("nameKana", FieldErrorType.TOO_LONG)))
        val req = addShopRequest()

        client.postJson("/api/v1/auth/shops", encode(req.copy(nameKana = "あ".repeat(101))), admin).let {
            it.status shouldBe HttpStatusCode.BadRequest
            it.body<ErrorBody>() shouldBe tooLong
        }
        client.shops().shouldBeEmpty()

        val id = client.postJson("/api/v1/auth/shops", encode(req.copy(nameKana = "あ".repeat(100))), admin).body<Shop>().id
        client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate().copy(nameKana = "い".repeat(101))), admin)
            .body<ErrorBody>() shouldBe tooLong
        client.shops().single().nameKana shouldBe "あ".repeat(100)
    }

    @Test
    fun `links keep their order, are kept when omitted on update, and replaced when sent`() = testApp { t ->
        val admin = t.adminToken()
        val req = addShopRequest().copy(
            links = listOf(
                ShopLinkInput(ShopLinkType.TWITTER, url = " https://x.com/taro "),
                ShopLinkInput(ShopLinkType.OFFICIAL, label = " 本店 ", url = "https://taro.example/"),
                ShopLinkInput(ShopLinkType.OTHER, label = " ", url = "http://blog.example/ラーメン"),
            ),
        )
        val stored = listOf(
            ShopLink(ShopLinkType.TWITTER, url = "https://x.com/taro"),
            ShopLink(ShopLinkType.OFFICIAL, label = "本店", url = "https://taro.example/"),
            ShopLink(ShopLinkType.OTHER, url = "http://blog.example/ラーメン"),
        )
        val added = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>()
        added.links shouldBe stored
        client.shops().single().links shouldBe stored

        // Older clients don't send the field; that must keep the stored links.
        val withoutLinks = JsonObject(testJson.encodeToJsonElement(req.toUpdate()).jsonObject - "links").toString()
        client.putJson("/api/v1/auth/shops/${added.id}", withoutLinks, admin).status shouldBe HttpStatusCode.OK
        client.shops().single().links shouldBe stored

        val tabelog = ShopLinkInput(ShopLinkType.TABELOG, url = "https://tabelog.com/x")
        client.putJson("/api/v1/auth/shops/${added.id}", encode(req.toUpdate().copy(links = listOf(req.links!![2], tabelog))), admin)
            .status shouldBe HttpStatusCode.OK
        client.shops().single().links shouldBe listOf(stored[2], ShopLink(ShopLinkType.TABELOG, url = "https://tabelog.com/x"))

        client.putJson("/api/v1/auth/shops/${added.id}", encode(req.toUpdate().copy(links = emptyList())), admin)
            .status shouldBe HttpStatusCode.OK
        client.shops().single().links.shouldBeEmpty()
    }

    @Test
    fun `invalid links are field errors and nothing is written`() = testApp { t ->
        val admin = t.adminToken()
        fun linkError(message: String, type: FieldErrorType) =
            ErrorBody(ErrorType.INVALID_REQUEST, message, listOf(FieldError("links", type)))
        val ok = ShopLinkInput(ShopLinkType.OFFICIAL, url = "https://a.example")
        val cases = listOf(
            listOf(ok.copy(url = "javascript:alert(1)")) to linkError("invalid link url", FieldErrorType.INVALID_FORMAT),
            listOf(ok.copy(url = "data:text/html,hi")) to linkError("invalid link url", FieldErrorType.INVALID_FORMAT),
            listOf(ok.copy(url = "a.example")) to linkError("invalid link url", FieldErrorType.INVALID_FORMAT),
            listOf(ok.copy(url = "https://")) to linkError("invalid link url", FieldErrorType.INVALID_FORMAT),
            listOf(ok.copy(url = "https://a.example/" + "a".repeat(2031))) to linkError("link url too long", FieldErrorType.TOO_LONG),
            listOf(ok.copy(label = "あ".repeat(101))) to linkError("link label too long", FieldErrorType.TOO_LONG),
            List(11) { ok } to linkError("too many links", FieldErrorType.OUT_OF_RANGE),
        )
        for ((links, error) in cases) {
            client.postJson("/api/v1/auth/shops", encode(addShopRequest().copy(links = links)), admin).let {
                it.status shouldBe HttpStatusCode.BadRequest
                it.body<ErrorBody>() shouldBe error
            }
        }
        client.shops().shouldBeEmpty()

        // The limits themselves are allowed.
        val atLimit = ok.copy(url = "https://a.example/" + "a".repeat(2030), label = "あ".repeat(100))
        val req = addShopRequest().copy(links = List(10) { atLimit })
        val id = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>().id
        for ((links, error) in cases) {
            client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate().copy(name = "changed", links = links)), admin)
                .body<ErrorBody>() shouldBe error
        }
        client.shops().single().let {
            it.name shouldBe "Ramen Taro"
            it.links shouldBe List(10) { ShopLink(atLimit.type, atLimit.label, atLimit.url) }
        }
    }

    @Test
    fun `unknown or malformed tag ids are rejected and nothing is written`() = testApp { t ->
        val admin = t.adminToken()
        for (tagIds in listOf(listOf(UUID.randomUUID().toString()), listOf("not-a-uuid"), listOf(SHOYU, "nope"))) {
            val res = client.postJson("/api/v1/auth/shops", encode(addShopRequest(tagIds = tagIds)), admin)
            res.status shouldBe HttpStatusCode.BadRequest
            res.body<ErrorBody>() shouldBe invalidTagIds
        }
        client.shops().shouldBeEmpty()
    }

    @Test
    fun `adding a duplicate google place id is a field error and nothing is written`() = testApp { t ->
        val admin = t.adminToken()
        client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = "dup")), admin).status shouldBe HttpStatusCode.OK

        val res = client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = "dup", tagIds = listOf(SHOYU))), admin)

        res.status shouldBe HttpStatusCode.BadRequest
        val text = res.bodyAsText()
        testJson.decodeFromString<ErrorBody>(text) shouldBe duplicatePlaceId
        text shouldNotContainIgnoringCase "sqlite"
        client.shops().single().tags.shouldBeEmpty()
    }

    @Test
    fun `updating to another shop's google place id is a field error and rolls back`() = testApp { t ->
        val admin = t.adminToken()
        client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = "taken")), admin)
        val req = addShopRequest(placeId = "mine")
        val id = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>().id

        val res = client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate().copy(googlePlaceId = "taken", wishLevel = "high")), admin)

        res.status shouldBe HttpStatusCode.BadRequest
        res.body<ErrorBody>() shouldBe duplicatePlaceId
        client.shops().single { it.id == id }.let {
            it.googlePlaceId shouldBe "mine"
            it.wishLevel shouldBe null
        }
        // Keeping its own place id is not a conflict.
        client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate()), admin).status shouldBe HttpStatusCode.OK
    }

    @Test
    fun `any number of shops can be added without a google place id`() = testApp { t ->
        val admin = t.adminToken()
        val added = listOf(null, "", "   ").map { placeId ->
            client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = placeId)), admin).let {
                it.status shouldBe HttpStatusCode.OK
                it.body<Shop>()
            }
        }

        added.map { it.googlePlaceId } shouldBe listOf(null, null, null)
        client.shops().map { it.googlePlaceId } shouldBe listOf(null, null, null)
        client.get("/api/v1/shops").bodyAsText() shouldNotContainIgnoringCase "googlePlaceId"
    }

    @Test
    fun `google place id is trimmed, kept when omitted, and cleared when blank`() = testApp { t ->
        val admin = t.adminToken()
        val req = addShopRequest(placeId = " place-a ")
        val added = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>()
        added.googlePlaceId shouldBe "place-a"

        client.putJson("/api/v1/auth/shops/${added.id}", encode(req.toUpdate().copy(googlePlaceId = " place-b ")), admin)
            .status shouldBe HttpStatusCode.OK
        client.shops().single().googlePlaceId shouldBe "place-b"

        // Older clients may omit the field; that keeps the stored place id.
        val withoutPlaceId = JsonObject(testJson.encodeToJsonElement(req.toUpdate()).jsonObject - "googlePlaceId").toString()
        client.putJson("/api/v1/auth/shops/${added.id}", withoutPlaceId, admin).status shouldBe HttpStatusCode.OK
        client.shops().single().googlePlaceId shouldBe "place-b"

        client.putJson("/api/v1/auth/shops/${added.id}", encode(req.toUpdate().copy(googlePlaceId = " ")), admin)
            .status shouldBe HttpStatusCode.OK
        client.shops().single().googlePlaceId shouldBe null

        // A cleared place id does not collide with another shop that has none.
        client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = null)), admin).status shouldBe HttpStatusCode.OK
        // A padded copy of a taken id is still a duplicate.
        client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = "taken")), admin)
        client.putJson("/api/v1/auth/shops/${added.id}", encode(req.toUpdate().copy(googlePlaceId = " taken ")), admin)
            .body<ErrorBody>() shouldBe duplicatePlaceId
    }

    @Test
    fun `non-admin cannot add a shop`() = testApp { t ->
        val res = client.postJson("/api/v1/auth/shops", encode(addShopRequest()), t.userToken())

        res.status shouldBe HttpStatusCode.Forbidden
        res.body<ErrorBody>().type shouldBe ErrorType.PERMISSION_DENIED
        client.shops().shouldBeEmpty()
    }

    @Test
    fun `update replaces tags and ignores the deprecated eaten and rate`() = testApp { t ->
        val admin = t.adminToken()
        val req = addShopRequest(tagIds = listOf(SHOYU))
        val id = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>().id

        // Older clients still send eaten/rate, even a rate the old validation rejected.
        for (rate in listOf(80.0, -5.0)) {
            val body = encode(req.toUpdate(tagIds = listOf(MISO, SHIO, MISO)).copy(eaten = true, rate = rate))
            client.putJson("/api/v1/auth/shops/$id", body, admin).status shouldBe HttpStatusCode.OK
        }

        client.shops().single().let {
            it.eaten shouldBe false
            it.rate shouldBe 0.0
            it.favorite shouldBe false
            it.visitCount shouldBe 0
            it.tags.map { tag -> tag.id } shouldContainExactly listOf(SHIO, MISO)
        }
    }

    @Test
    fun `update with unknown tag ids rolls back the whole update`() = testApp { t ->
        val admin = t.adminToken()
        val req = addShopRequest(tagIds = listOf(SHOYU))
        val id = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>().id

        val res = client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate(tagIds = listOf("bogus")).copy(name = "Renamed", wishLevel = "high")), admin)

        res.body<ErrorBody>() shouldBe invalidTagIds
        client.shops().single().let {
            it.name shouldBe "Ramen Taro"
            it.wishLevel shouldBe null
            it.tags.map { tag -> tag.id } shouldContainExactly listOf(SHOYU)
        }
    }

    @Test
    fun `wish level is set on add, kept when omitted, replaced when sent and cleared by null`() = testApp { t ->
        val admin = t.adminToken()
        val req = addShopRequest().copy(wishLevel = "high")
        val added = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>()
        added.wishLevel shouldBe "high"
        client.shops().single().wishLevel shouldBe "high"
        val update = encode(req.toUpdate())
        update shouldNotContainIgnoringCase "wishLevel"

        client.putJson("/api/v1/auth/shops/${added.id}", update, admin).status shouldBe HttpStatusCode.OK
        client.shops().single().wishLevel shouldBe "high"

        client.putJson("/api/v1/auth/shops/${added.id}", encode(req.toUpdate().copy(wishLevel = "low")), admin)
        client.shops().single().wishLevel shouldBe "low"

        val cleared = JsonObject(testJson.encodeToJsonElement(req.toUpdate()).jsonObject + ("wishLevel" to JsonNull))
        client.putJson("/api/v1/auth/shops/${added.id}", cleared.toString(), admin).status shouldBe HttpStatusCode.OK
        client.shops().single().wishLevel shouldBe null
    }

    @Test
    fun `unknown wish level is a field error and nothing is written`() = testApp { t ->
        val admin = t.adminToken()
        val invalidWishLevel = ErrorBody(ErrorType.INVALID_REQUEST, "invalid wish level", listOf(FieldError("wishLevel", FieldErrorType.INVALID_FORMAT)))

        client.postJson("/api/v1/auth/shops", encode(addShopRequest().copy(wishLevel = "urgent")), admin).let {
            it.status shouldBe HttpStatusCode.BadRequest
            it.body<ErrorBody>() shouldBe invalidWishLevel
        }
        client.shops().shouldBeEmpty()

        val req = addShopRequest().copy(wishLevel = "medium")
        val id = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>().id
        client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate().copy(name = "Renamed", wishLevel = "urgent")), admin)
            .body<ErrorBody>() shouldBe invalidWishLevel
        client.shops().single().let {
            it.name shouldBe "Ramen Taro"
            it.wishLevel shouldBe "medium"
        }
    }

    @Test
    fun `updating an unknown shop is not found and writes nothing`() = testApp { t ->
        val admin = t.adminToken()
        val existing = client.postJson("/api/v1/auth/shops", encode(addShopRequest()), admin).body<Shop>()
        val unknown = UUID.randomUUID().toString()

        val update = addShopRequest(placeId = "new-place", tagIds = listOf(SHOYU)).toUpdate()
        val res = client.putJson("/api/v1/auth/shops/$unknown", encode(update), admin)

        res.status shouldBe HttpStatusCode.NotFound
        res.body<ErrorBody>() shouldBe ErrorBody(ErrorType.NOT_FOUND, "not found")
        client.shops() shouldContainExactly listOf(existing)
        t.countRows("shops_tags", unknown) shouldBe 0L
    }

    @Test
    fun `admin deletes a shop with its tags and links`() = testApp { t ->
        val admin = t.adminToken()
        val req = addShopRequest(tagIds = listOf(SHOYU, MISO)).copy(links = listOf(ShopLinkInput(ShopLinkType.OFFICIAL, url = "https://a.example")))
        val id = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>().id
        val kept = client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = "kept", tagIds = listOf(SHOYU))), admin).body<Shop>()
        t.countRows("shops_tags", id) shouldBe 2L
        t.countRows("shop_links", id) shouldBe 1L

        client.deleteWithSession("/api/v1/auth/shops/$id", admin).status shouldBe HttpStatusCode.NoContent

        client.shops() shouldContainExactly listOf(kept)
        for (table in listOf("shops_tags", "shop_links")) t.countRows(table, id) shouldBe 0L
        t.countRows("shops_tags", kept.id) shouldBe 1L
    }

    @Test
    fun `a shop with visit logs cannot be deleted until they are`() = testApp { t ->
        val admin = t.adminToken()
        val req = addShopRequest(tagIds = listOf(SHOYU)).copy(links = listOf(ShopLinkInput(ShopLinkType.OFFICIAL, url = "https://a.example")))
        val id = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>().id
        val visitId = client.postJson("/api/v1/auth/shops/$id/visits", """{"isLimitedMenu":false}""", admin).body<VisitLog>().id

        client.deleteWithSession("/api/v1/auth/shops/$id", admin).let {
            it.status shouldBe HttpStatusCode.Conflict
            it.body<ErrorBody>() shouldBe ErrorBody(ErrorType.SHOP_HAS_VISIT_LOGS, "shop has visit logs")
        }
        client.shops().single().visitCount shouldBe 1
        t.countRows("shops_tags", id) shouldBe 1L
        t.countRows("shop_links", id) shouldBe 1L

        client.deleteWithSession("/api/v1/auth/visits/$visitId", admin).status shouldBe HttpStatusCode.NoContent
        client.deleteWithSession("/api/v1/auth/shops/$id", admin).status shouldBe HttpStatusCode.NoContent
        client.shops().shouldBeEmpty()
    }

    @Test
    fun `delete checks authentication, then the id, then admin, then existence`() = testApp { t ->
        val admin = t.adminToken()
        val id = client.postJson("/api/v1/auth/shops", encode(addShopRequest()), admin).body<Shop>().id

        client.deleteWithSession("/api/v1/auth/shops/not-a-uuid").let {
            it.status shouldBe HttpStatusCode.Unauthorized
            it.body<ErrorBody>().type shouldBe ErrorType.AUTHENTICATION_REQUIRED
        }
        val user = t.userToken()
        client.deleteWithSession("/api/v1/auth/shops/not-a-uuid", user).let {
            it.status shouldBe HttpStatusCode.BadRequest
            it.body<ErrorBody>() shouldBe ErrorBody(ErrorType.INVALID_REQUEST, "invalid id")
        }
        client.deleteWithSession("/api/v1/auth/shops/$id", user).let {
            it.status shouldBe HttpStatusCode.Forbidden
            it.body<ErrorBody>().type shouldBe ErrorType.PERMISSION_DENIED
        }
        client.deleteWithSession("/api/v1/auth/shops/${UUID.randomUUID()}", admin).let {
            it.status shouldBe HttpStatusCode.NotFound
            it.body<ErrorBody>() shouldBe ErrorBody(ErrorType.NOT_FOUND, "not found")
        }
        client.shops().map { it.id } shouldContainExactly listOf(id)
    }

    @Test
    fun `update checks authentication, then the id, then admin`() = testApp { t ->
        val body = encode(addShopRequest().toUpdate())
        val validId = UUID.randomUUID()

        client.putJson("/api/v1/auth/shops/not-a-uuid", body).let {
            it.status shouldBe HttpStatusCode.Unauthorized
            it.body<ErrorBody>().type shouldBe ErrorType.AUTHENTICATION_REQUIRED
        }
        val user = t.userToken()
        client.putJson("/api/v1/auth/shops/not-a-uuid", body, user).let {
            it.status shouldBe HttpStatusCode.BadRequest
            it.body<ErrorBody>() shouldBe ErrorBody(ErrorType.INVALID_REQUEST, "invalid id")
        }
        client.putJson("/api/v1/auth/shops/$validId", body, user).let {
            it.status shouldBe HttpStatusCode.Forbidden
            it.body<ErrorBody>().type shouldBe ErrorType.PERMISSION_DENIED
        }
    }
}
