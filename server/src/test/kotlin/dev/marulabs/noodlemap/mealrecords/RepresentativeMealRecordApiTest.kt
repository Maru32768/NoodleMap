package dev.marulabs.noodlemap.mealrecords

import dev.marulabs.noodlemap.*
import dev.marulabs.noodlemap.common.JST
import dev.marulabs.noodlemap.generated.models.MealRecord
import dev.marulabs.noodlemap.generated.models.MealRecordInput
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.shops.shops
import dev.marulabs.noodlemap.og.OgCard
import io.kotest.matchers.shouldBe
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import java.util.UUID
import java.time.LocalDate
import org.junit.jupiter.api.Test

class RepresentativeMealRecordApiTest {
    @Test
    fun `selection overrides latest images and OGP while reset restores automatic selection`() = testApp { t ->
        val admin = t.adminToken()
        val shop = client.postJson("/api/v1/auth/shops", encode(addShopRequest()), admin).body<Shop>()
        suspend fun record(date: String): MealRecord = client.postJson(
            "/api/v1/auth/meal-records", encode(MealRecordInput(listOf(shop.id), eatenOn = date)), admin,
        ).body()
        fun image(record: MealRecord, key: String): UUID = UUID.randomUUID().also {
            t.db.mealRecordImagesQueries.appendMealRecordImage(it, UUID.fromString(record.id), key, 320, 240)
        }
        suspend fun current() = client.shops().single()
        suspend fun og() = Regex("""og:image" content="([^"]+)"""").find(client.get("/r/${shop.id}").bodyAsText())!!.groupValues[1]
        val regular = record("2025-01-01")
        val regularImage = image(regular, "regular.jpg")
        val limited = record("2025-02-01")
        image(limited, "limited.jpg")
        val automatic = current().coverPhotoUrl
        val automaticOg = og()
        val path = "/api/v1/auth/shops/${shop.id}/representative-meal-record"
        client.putJson(path, """{"mealRecordId":"${regular.id}"}""", admin).status shouldBe HttpStatusCode.NoContent
        current().representativeMealRecordId shouldBe regular.id
        current().coverPhotoUrl shouldBe t.localMealRecordImages.publicUrl("regular.jpg")
        (og() == automaticOg) shouldBe false
        val newest = record("2025-03-01")
        image(newest, "newest.jpg")
        current().coverPhotoUrl shouldBe t.localMealRecordImages.publicUrl("regular.jpg")
        og().endsWith("/${OgCard.of(current(), "regular.jpg", LocalDate.now(JST)).hash()}.png") shouldBe true
        val second = image(regular, "regular-second.jpg")
        client.putJson("/api/v1/auth/meal-records/${regular.id}/images/order", """{"imageIds":["$second","$regularImage"]}""", admin).status shouldBe HttpStatusCode.OK
        current().coverPhotoUrl shouldBe t.localMealRecordImages.publicUrl("regular-second.jpg")
        client.deleteWithSession("/api/v1/auth/meal-record-images/$second", admin).status shouldBe HttpStatusCode.NoContent
        client.deleteWithSession("/api/v1/auth/meal-record-images/$regularImage", admin).status shouldBe HttpStatusCode.NoContent
        current().representativeMealRecordId shouldBe regular.id
        current().coverPhotoUrl shouldBe t.localMealRecordImages.publicUrl("newest.jpg")
        image(regular, "regular-restored.jpg")
        current().coverPhotoUrl shouldBe t.localMealRecordImages.publicUrl("regular-restored.jpg")
        client.putJson(path, "{}", admin).status shouldBe HttpStatusCode.NoContent
        current().representativeMealRecordId shouldBe null
        current().coverPhotoUrl shouldBe t.localMealRecordImages.publicUrl("newest.jpg")
        (automatic == current().coverPhotoUrl) shouldBe false
    }

    @Test
    fun `selection is admin only and invalid or unrelated records leave the previous selection intact`() = testApp { t ->
        val admin = t.adminToken()
        val shop = client.postJson("/api/v1/auth/shops", encode(addShopRequest()), admin).body<Shop>()
        val other = client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = null)), admin).body<Shop>()
        val record = client.postJson("/api/v1/auth/meal-records", encode(MealRecordInput(listOf(shop.id))), admin).body<MealRecord>()
        val unrelated = client.postJson("/api/v1/auth/meal-records", encode(MealRecordInput(listOf(other.id))), admin).body<MealRecord>()
        val path = "/api/v1/auth/shops/${shop.id}/representative-meal-record"
        val body = """{"mealRecordId":"${record.id}"}"""
        client.putJson(path, body).status shouldBe HttpStatusCode.Unauthorized
        client.putJson(path, body, t.userToken()).status shouldBe HttpStatusCode.Forbidden
        client.putJson(path, body, admin).status shouldBe HttpStatusCode.NoContent
        for ((id, status) in listOf("bad-id" to HttpStatusCode.BadRequest, UUID.randomUUID().toString() to HttpStatusCode.NotFound, unrelated.id to HttpStatusCode.NotFound)) {
            client.putJson(path, """{"mealRecordId":"$id"}""", admin).status shouldBe status
            client.shops().find { it.id == shop.id }!!.representativeMealRecordId shouldBe record.id
        }
        client.putJson("/api/v1/auth/shops/not-a-uuid/representative-meal-record", "{}", admin).status shouldBe HttpStatusCode.BadRequest
        client.putJson("/api/v1/auth/shops/${UUID.randomUUID()}/representative-meal-record", "{}", admin).status shouldBe HttpStatusCode.NotFound
    }

    @Test
    fun `shared records represent shops independently and selections survive edits but disappear on unlink or deletion`() = testApp { t ->
        val admin = t.adminToken()
        val a = client.postJson("/api/v1/auth/shops", encode(addShopRequest()), admin).body<Shop>()
        val b = client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = null)), admin).body<Shop>()
        val shared = client.postJson("/api/v1/auth/meal-records", encode(MealRecordInput(listOf(a.id, b.id))), admin).body<MealRecord>()
        suspend fun select(shop: Shop) = client.putJson("/api/v1/auth/shops/${shop.id}/representative-meal-record", """{"mealRecordId":"${shared.id}"}""", admin)
        select(a).status shouldBe HttpStatusCode.NoContent
        client.shops().find { it.id == b.id }!!.representativeMealRecordId shouldBe null
        select(b).status shouldBe HttpStatusCode.NoContent
        val edited = MealRecordInput(listOf(b.id, a.id), eatenOn = "2025-01-01", publicNote = "edited")
        client.putJson("/api/v1/auth/meal-records/${shared.id}", encode(edited), admin).status shouldBe HttpStatusCode.OK
        client.shops().map { it.representativeMealRecordId }.toSet() shouldBe setOf(shared.id)
        client.putJson("/api/v1/auth/meal-records/${shared.id}", encode(edited.copy(shopIds = listOf(b.id))), admin).status shouldBe HttpStatusCode.OK
        client.shops().find { it.id == a.id }!!.representativeMealRecordId shouldBe null
        client.shops().find { it.id == b.id }!!.representativeMealRecordId shouldBe shared.id
        client.deleteWithSession("/api/v1/auth/meal-records/${shared.id}", admin).status shouldBe HttpStatusCode.NoContent
        client.shops().map { it.representativeMealRecordId }.toSet() shouldBe setOf(null)
    }
}
