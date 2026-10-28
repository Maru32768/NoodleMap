package dev.marulabs.noodlemap.shops

import dev.marulabs.noodlemap.addShopRequest
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.deleteWithSession
import dev.marulabs.noodlemap.encode
import dev.marulabs.noodlemap.errors.ErrorBody
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.models.MealRecord
import dev.marulabs.noodlemap.generated.models.MealRecordInput
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.postJson
import dev.marulabs.noodlemap.putJson
import dev.marulabs.noodlemap.testApp
import io.kotest.matchers.shouldBe
import io.ktor.http.HttpStatusCode
import java.util.UUID
import org.junit.jupiter.api.Test

class ShopRateApiTest {
    @Test
    fun `the admin sets and clears a shop's rate apart from its meal records`() = testApp { t ->
        val admin = t.adminToken()
        val shop = client.postJson("/api/v1/auth/shops", encode(addShopRequest()), admin).body<Shop>()
        val path = "/api/v1/auth/shops/${shop.id}/rate"

        client.putJson(path, """{"rate":85}""", admin).status shouldBe HttpStatusCode.NoContent
        client.shops().single().let {
            it.rate shouldBe 85.0
            it.favorite shouldBe true
            // Not eaten: a shop may be rated without any meal record.
            it.eaten shouldBe false
        }

        client.putJson(path, """{"rate":79.5}""", admin).status shouldBe HttpStatusCode.NoContent
        client.shops().single().favorite shouldBe false

        for (bad in listOf("""{"rate":-1}""", """{"rate":100.5}""")) {
            client.putJson(path, bad, admin).status shouldBe HttpStatusCode.BadRequest
        }
        client.putJson(path, """{"rate":90}""", t.userToken()).status shouldBe HttpStatusCode.Forbidden
        client.putJson("/api/v1/auth/shops/${UUID.randomUUID()}/rate", """{"rate":90}""", admin).status shouldBe HttpStatusCode.NotFound
        client.shops().single().rate shouldBe 79.5

        client.putJson(path, "{}", admin).status shouldBe HttpStatusCode.NoContent
        client.shops().single().rate shouldBe null
    }

    @Test
    fun `a meal record sets the rate of only the shops it names, and deleting it keeps the rate`() = testApp { t ->
        val admin = t.adminToken()
        val a = client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = null).copy(name = "A")), admin).body<Shop>()
        val b = client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = null).copy(name = "B")), admin).body<Shop>()
        suspend fun rates() = client.shops().associate { it.name to it.rate }

        // A collaboration rated for shop A only.
        val collab = MealRecordInput(shopIds = listOf(a.id, b.id), rate = 95.0, rateShopIds = listOf(a.id))
        val record = client.postJson("/api/v1/auth/meal-records", encode(collab), admin).body<MealRecord>()
        rates() shouldBe mapOf("A" to 95.0, "B" to null)

        // Without a rate the named shops keep theirs.
        client.putJson("/api/v1/auth/meal-records/${record.id}", encode(collab.copy(rate = null, rateShopIds = listOf(a.id, b.id))), admin)
            .status shouldBe HttpStatusCode.OK
        rates() shouldBe mapOf("A" to 95.0, "B" to null)

        client.putJson("/api/v1/auth/meal-records/${record.id}", encode(collab.copy(rate = 70.0, rateShopIds = listOf(b.id))), admin)
            .status shouldBe HttpStatusCode.OK
        rates() shouldBe mapOf("A" to 95.0, "B" to 70.0)

        // A shop not among shopIds is rejected, and nothing is saved.
        for (ids in listOf(listOf(UUID.randomUUID().toString()), listOf("bad-id"))) {
            val res = client.putJson("/api/v1/auth/meal-records/${record.id}", encode(collab.copy(rate = 10.0, rateShopIds = ids)), admin)
            res.status shouldBe HttpStatusCode.BadRequest
            res.body<ErrorBody>().fieldErrors shouldBe listOf(FieldError("rateShopIds", FieldErrorType.INVALID_FORMAT))
        }
        rates() shouldBe mapOf("A" to 95.0, "B" to 70.0)

        client.deleteWithSession("/api/v1/auth/meal-records/${record.id}", admin).status shouldBe HttpStatusCode.NoContent
        rates() shouldBe mapOf("A" to 95.0, "B" to 70.0)
    }
}
