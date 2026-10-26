package dev.marulabs.noodlemap.mealrecords

import dev.marulabs.noodlemap.addShopRequest
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.deleteWithSession
import dev.marulabs.noodlemap.encode
import dev.marulabs.noodlemap.generated.models.*
import dev.marulabs.noodlemap.postJson
import dev.marulabs.noodlemap.putJson
import dev.marulabs.noodlemap.session
import dev.marulabs.noodlemap.shops.shops
import dev.marulabs.noodlemap.testApp
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldNotContain
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import java.util.UUID
import org.junit.jupiter.api.Test

class SharedRecordsApiTest {
    @Test
    fun `one record belongs to multiple shops and a reusable venue and detaches and deletes atomically`() = testApp { t ->
        val admin = t.adminToken()
        val a = client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = null).copy(name = "A")), admin).body<Shop>()
        val b = client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = null).copy(name = "B")), admin).body<Shop>()
        val input = MealRecordInput(shopIds = listOf(a.id, b.id), eatenOn = "2024-01-02", venueName = " ラーメンWalkerキッチン ", rate = 90.0,
            menuItems = listOf(MenuItemInput("コラボそば", true, 1500)), publicNote = "公開", privateNote = "秘密")
        val shared = client.postJson("/api/v1/auth/meal-records", encode(input), admin).body<MealRecord>()
        shared.shops shouldBe listOf(MealRecordShop(a.id, "A"), MealRecordShop(b.id, "B"))
        shared.venue?.name shouldBe "ラーメンWalkerキッチン"
        val venue = shared.venue!!
        val second = client.postJson("/api/v1/auth/meal-records", encode(input.copy(shopIds = listOf(b.id), eatenOn = "2024-01-01", venueName = venue.name)), admin).body<MealRecord>()
        second.venue shouldBe venue
        client.get("/api/v1/venues").body<VenuesResponse>().venues shouldBe listOf(venue)
        for (shop in listOf(a, b)) {
            client.get("/api/v1/shops/${shop.id}/meal-records") { session(admin) }.body<MealRecordsResponse>().mealRecords.first() shouldBe shared
        }
        client.shops().associate { it.id to it.mealRecordCount } shouldBe mapOf(a.id to 1, b.id to 2)
        client.shops().all { it.eaten && it.favorite && it.rate == 90.0 } shouldBe true
        for (token in listOf(null, t.userToken())) {
            val response = client.get("/api/v1/venues/${venue.id}/meal-records") { token?.let { session(it) } }
            response.bodyAsText() shouldNotContain "privateNote"
            response.bodyAsText() shouldNotContain "秘密"
            response.body<VenueMealRecordsResponse>().mealRecords.map { it.id } shouldBe listOf(shared.id, second.id)
        }
        client.get("/api/v1/venues/${venue.id}/meal-records") { session(admin) }.body<VenueMealRecordsResponse>().mealRecords.first().privateNote shouldBe "秘密"
        for (ids in listOf(emptyList(), listOf(a.id, a.id), listOf("bad-id"))) {
            client.postJson("/api/v1/auth/meal-records", encode(input.copy(shopIds = ids)), admin).status shouldBe HttpStatusCode.BadRequest
        }
        val invalid = input.copy(shopIds = listOf(a.id, UUID.randomUUID().toString()), venueName = "作成されない会場")
        client.postJson("/api/v1/auth/meal-records", encode(invalid), admin).status shouldBe HttpStatusCode.NotFound
        client.putJson("/api/v1/auth/meal-records/${shared.id}", encode(invalid), admin).status shouldBe HttpStatusCode.NotFound
        client.get("/api/v1/venues").body<VenuesResponse>().venues shouldBe listOf(venue)
        client.get("/api/v1/shops/${a.id}/meal-records") { session(admin) }.body<MealRecordsResponse>().mealRecords.single() shouldBe shared
        client.deleteWithSession("/api/v1/auth/shops/${b.id}", admin).status shouldBe HttpStatusCode.Conflict
        client.putJson("/api/v1/auth/meal-records/${shared.id}", encode(input.copy(shopIds = listOf(b.id), venueName = " ", rate = 50.0)), admin).body<MealRecord>().let {
            it.id shouldBe shared.id
            it.shops shouldBe listOf(MealRecordShop(b.id, "B"))
            it.venue shouldBe null
        }
        client.shops().first { it.id == a.id }.let { it.eaten shouldBe false; it.mealRecordCount shouldBe 0 }
        client.deleteWithSession("/api/v1/auth/shops/${a.id}", admin).status shouldBe HttpStatusCode.NoContent
        client.shops().single().rate shouldBe 50.0
        client.deleteWithSession("/api/v1/auth/meal-records/${shared.id}", admin).status shouldBe HttpStatusCode.NoContent
        client.shops().single().mealRecordCount shouldBe 1
        client.deleteWithSession("/api/v1/auth/meal-records/${second.id}", admin).status shouldBe HttpStatusCode.NoContent
        client.get("/api/v1/venues/${venue.id}/meal-records").body<VenueMealRecordsResponse>().mealRecords shouldBe emptyList()
        t.dataSource.connection.use { c -> c.createStatement().use { st -> st.executeQuery("PRAGMA foreign_key_check").use { it.next() shouldBe false } } }
    }
}
