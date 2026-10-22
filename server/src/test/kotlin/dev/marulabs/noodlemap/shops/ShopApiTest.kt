package dev.marulabs.noodlemap.shops

import dev.marulabs.noodlemap.addShopRequest
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.encode
import dev.marulabs.noodlemap.errors.ErrorBody
import dev.marulabs.noodlemap.errors.ErrorType
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.generated.models.ShopsResponse
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
import org.junit.jupiter.api.Test

const val SHOYU = "018ff6e8-5291-7a01-9ab8-000000000001"
const val SHIO = "018ff6e8-5291-7a01-9ab8-000000000002"
const val MISO = "018ff6e8-5291-7a01-9ab8-000000000003"

suspend fun HttpClient.shops(): List<Shop> = get("/api/v1/shops").body<ShopsResponse>().shops

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

        val res = client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate(eaten = true).copy(googlePlaceId = "taken")), admin)

        res.status shouldBe HttpStatusCode.BadRequest
        res.body<ErrorBody>() shouldBe duplicatePlaceId
        client.shops().single { it.id == id }.let {
            it.googlePlaceId shouldBe "mine"
            it.eaten shouldBe false
        }
        // Keeping its own place id is not a conflict.
        client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate()), admin).status shouldBe HttpStatusCode.OK
    }

    @Test
    fun `non-admin cannot add a shop`() = testApp { t ->
        val res = client.postJson("/api/v1/auth/shops", encode(addShopRequest()), t.userToken())

        res.status shouldBe HttpStatusCode.Forbidden
        res.body<ErrorBody>().type shouldBe ErrorType.PERMISSION_DENIED
        client.shops().shouldBeEmpty()
    }

    @Test
    fun `update toggles eaten state and replaces tags`() = testApp { t ->
        val admin = t.adminToken()
        val req = addShopRequest(tagIds = listOf(SHOYU))
        val id = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>().id

        client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate(eaten = true, rate = 80.0, tagIds = listOf(MISO, SHIO, MISO))), admin)
            .status shouldBe HttpStatusCode.OK
        client.shops().single().let {
            it.eaten shouldBe true
            it.rate shouldBe 80.0
            it.favorite shouldBe true
            it.tags.map { tag -> tag.id } shouldContainExactly listOf(SHIO, MISO)
        }

        client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate(eaten = true, rate = 79.5)), admin)
        client.shops().single().let {
            it.rate shouldBe 79.5
            it.favorite shouldBe false
            it.tags.map { tag -> tag.id } shouldContainExactly listOf(SHOYU)
        }

        client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate(eaten = false, rate = 100.0, tagIds = emptyList())), admin)
        client.shops().single().let {
            it.eaten shouldBe false
            it.rate shouldBe 0.0
            it.favorite shouldBe false
            it.tags.shouldBeEmpty()
        }
    }

    @Test
    fun `update with unknown tag ids rolls back the whole update`() = testApp { t ->
        val admin = t.adminToken()
        val req = addShopRequest(tagIds = listOf(SHOYU))
        val id = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>().id

        val res = client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate(eaten = true, tagIds = listOf("bogus")).copy(name = "Renamed")), admin)

        res.body<ErrorBody>() shouldBe invalidTagIds
        client.shops().single().let {
            it.name shouldBe "Ramen Taro"
            it.eaten shouldBe false
            it.tags.map { tag -> tag.id } shouldContainExactly listOf(SHOYU)
        }
    }

    @Test
    fun `update rejects a rate outside 0 to 100`() = testApp { t ->
        val admin = t.adminToken()
        val req = addShopRequest()
        val id = client.postJson("/api/v1/auth/shops", encode(req), admin).body<Shop>().id
        val rateOutOfRange = ErrorBody(ErrorType.INVALID_REQUEST, "rate out of range", listOf(FieldError("rate", FieldErrorType.OUT_OF_RANGE)))

        for (rate in listOf(-0.5, 100.5)) {
            val res = client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate(eaten = true, rate = rate)), admin)
            res.status shouldBe HttpStatusCode.BadRequest
            res.body<ErrorBody>() shouldBe rateOutOfRange
        }
        client.shops().single().eaten shouldBe false

        client.putJson("/api/v1/auth/shops/$id", encode(req.toUpdate(eaten = true, rate = 100.0)), admin)
            .status shouldBe HttpStatusCode.OK
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
