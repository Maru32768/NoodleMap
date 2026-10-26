package dev.marulabs.noodlemap.mealrecords

import dev.marulabs.noodlemap.addShopRequest
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.TestDb
import dev.marulabs.noodlemap.deleteWithSession
import dev.marulabs.noodlemap.encode
import dev.marulabs.noodlemap.errors.ErrorBody
import dev.marulabs.noodlemap.errors.ErrorType
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.models.MenuItem
import dev.marulabs.noodlemap.generated.models.MenuItemInput
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.generated.models.MealRecord
import dev.marulabs.noodlemap.generated.models.MealRecordInput
import dev.marulabs.noodlemap.generated.models.MealRecordsResponse
import dev.marulabs.noodlemap.postJson
import dev.marulabs.noodlemap.putJson
import dev.marulabs.noodlemap.session
import dev.marulabs.noodlemap.shops.shops
import dev.marulabs.noodlemap.testApp
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldNotContain
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.ApplicationTestBuilder
import java.util.UUID
import org.junit.jupiter.api.Test

private fun TestDb.setCreatedAt(mealRecordId: String, createdAt: String) = dataSource.connection.use { c ->
    c.prepareStatement("UPDATE meal_records SET created_at = ? WHERE id = ?").use {
        it.setString(1, createdAt)
        it.setString(2, mealRecordId)
        it.executeUpdate()
    }
}

private fun TestDb.menuItemCount(): Int = dataSource.connection.use { c ->
    c.createStatement().use { st -> st.executeQuery("SELECT count(*) FROM meal_record_menu_items").use { it.getInt(1) } }
}

class MealRecordApiTest {

    private suspend fun ApplicationTestBuilder.addShop(admin: String, placeId: String = "place-1"): String =
        client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = placeId)), admin).body<Shop>().id

    private suspend fun HttpClient.addMealRecord(shopId: String, input: MealRecordInput, admin: String): MealRecord =
        postJson("/api/v1/auth/meal-records", encode(input.copy(shopIds = listOf(shopId))), admin).also { it.status shouldBe HttpStatusCode.OK }.body()

    private suspend fun HttpClient.mealRecords(shopId: String, token: String? = null): List<MealRecord> =
        get("/api/v1/shops/$shopId/meal-records") { token?.let { session(it) } }.body<MealRecordsResponse>().mealRecords

    private fun mealRecord(shopId: String, eatenOn: String? = null, rate: Double? = null) =
        MealRecordInput(shopIds = listOf(shopId), eatenOn = eatenOn, rate = rate)

    @Test
    fun `mealRecords are newest first with undated ones last, and the shop derives eaten, rate and favorite from them`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        client.shops().single().let {
            it.eaten shouldBe false
            it.mealRecordCount shouldBe 0
            it.rate shouldBe 0.0
        }

        val undated = client.addMealRecord(id, mealRecord(id, rate = 95.0), admin)
        val older = client.addMealRecord(id, mealRecord(id, "2023-05-01", rate = 60.0), admin)
        val newest = client.addMealRecord(id, mealRecord(id, "2024-01-01"), admin)

        client.mealRecords(id).map { it.id } shouldContainExactly listOf(newest.id, older.id, undated.id)
        client.shops().single().let {
            it.eaten shouldBe true
            it.mealRecordCount shouldBe 3
            // The newest meal record has no rate, so the latest rated one counts; the undated 95 is older still.
            it.rate shouldBe 60.0
            it.favorite shouldBe false
        }

        client.putJson("/api/v1/auth/meal-records/${newest.id}", encode(mealRecord(id, "2024-01-01", rate = 80.0)), admin).status shouldBe HttpStatusCode.OK
        client.shops().single().let {
            it.rate shouldBe 80.0
            it.favorite shouldBe true
        }

        client.deleteWithSession("/api/v1/auth/meal-records/${newest.id}", admin)
        client.deleteWithSession("/api/v1/auth/meal-records/${older.id}", admin)
        client.shops().single().let {
            it.mealRecordCount shouldBe 1
            it.rate shouldBe 95.0
            it.favorite shouldBe true
        }
    }

    @Test
    fun `among undated mealRecords the one created last is the latest`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        val first = client.addMealRecord(id, mealRecord(id, rate = 50.0), admin)
        val second = client.addMealRecord(id, mealRecord(id, rate = 70.0), admin)
        // Pinned so the test does not depend on the two requests landing in different milliseconds.
        t.setCreatedAt(first.id, "2025-01-01 00:00:00.000")
        t.setCreatedAt(second.id, "2025-01-01 00:00:00.001")

        client.mealRecords(id).map { it.id } shouldContainExactly listOf(second.id, first.id)
        client.shops().single().rate shouldBe 70.0
    }

    @Test
    fun `a shop whose mealRecords are all unrated is eaten without a rate`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        client.addMealRecord(id, mealRecord(id, "2024-01-01"), admin)

        client.shops().single().let {
            it.eaten shouldBe true
            it.mealRecordCount shouldBe 1
            it.rate shouldBe 0.0
            it.favorite shouldBe false
        }
    }

    @Test
    fun `the private note is only returned to the admin`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        val input = MealRecordInput(shopIds = listOf(id),
            menuItems = listOf(MenuItemInput("限定まぜそば", isLimited = true, price = 1300)), publicNote = "公開", privateNote = "非公開",
        )
        client.addMealRecord(id, input, admin).privateNote shouldBe "非公開"

        client.mealRecords(id, admin).single().let {
            it.publicNote shouldBe "公開"
            it.privateNote shouldBe "非公開"
        }
        for (token in listOf(null, t.userToken())) {
            val res = client.get("/api/v1/shops/$id/meal-records") { token?.let { session(it) } }
            res.bodyAsText() shouldNotContain "privateNote"
            res.body<MealRecordsResponse>().mealRecords.single().let {
                it.publicNote shouldBe "公開"
                it.menuItems shouldBe listOf(MenuItem("限定まぜそば", isLimited = true, price = 1300))
                it.totalPrice shouldBe 1300
            }
        }
    }

    @Test
    fun `admin adds, replaces and deletes a meal record with trimmed fields`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        val added = client.addMealRecord(
            id,
            MealRecordInput(shopIds = listOf(id),
                eatenOn = " 2024-02-03 ", rate = 85.5, venueName = " 大つけ麺博 ", publicNote = "   ", privateNote = " 混んでいた ",
                // 連食: several items in one meal record, kept in order; the total sums the priced ones.
                menuItems = listOf(
                    MenuItemInput(" 特製中華そば ", isLimited = true, price = 1200),
                    MenuItemInput("替え玉"),
                    MenuItemInput("味玉", isLimited = false, price = 150),
                ),
            ),
            admin,
        )
        added shouldBe MealRecord(
            id = added.id, shops = added.shops, eatenOn = "2024-02-03", rate = 85.5, venue = added.venue, publicNote = null,
            privateNote = "混んでいた", images = emptyList(), totalPrice = 1350,
            menuItems = listOf(MenuItem("特製中華そば", true, 1200), MenuItem("替え玉", false), MenuItem("味玉", false, 150)),
        )
        client.mealRecords(id, admin) shouldContainExactly listOf(added)

        // A replacement clears every field it omits, the menu items included.
        client.putJson("/api/v1/auth/meal-records/${added.id}", encode(MealRecordInput(shopIds = listOf(id), rate = 70.0)), admin).body<MealRecord>() shouldBe
            MealRecord(id = added.id, shops = added.shops, rate = 70.0, menuItems = emptyList(), images = emptyList())
        client.mealRecords(id, admin).single().menuItems.shouldBeEmpty()

        val replaced = client.putJson(
            "/api/v1/auth/meal-records/${added.id}",
            encode(MealRecordInput(shopIds = listOf(id), menuItems = listOf(MenuItemInput("つけ麺"), MenuItemInput("ラーメン", price = 900)))),
            admin,
        )
        replaced.status shouldBe HttpStatusCode.OK
        val expected = MealRecord(
            id = added.id, shops = added.shops, menuItems = listOf(MenuItem("つけ麺", false), MenuItem("ラーメン", false, 900)), totalPrice = 900,
            images = emptyList(),
        )
        replaced.body<MealRecord>() shouldBe expected
        client.mealRecords(id, admin) shouldContainExactly listOf(expected)

        client.deleteWithSession("/api/v1/auth/meal-records/${added.id}", admin).status shouldBe HttpStatusCode.NoContent
        t.menuItemCount() shouldBe 0
        client.mealRecords(id).shouldBeEmpty()
        client.deleteWithSession("/api/v1/auth/meal-records/${added.id}", admin).status shouldBe HttpStatusCode.NotFound
    }

    @Test
    fun `invalid fields are all reported and nothing is written`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        val invalid = MealRecordInput(shopIds = listOf(id),
            eatenOn = "2024/01/01", rate = 100.5,
            menuItems = listOf(MenuItemInput("麺".repeat(201)), MenuItemInput("  ", price = -1), MenuItemInput("ok", price = 10_000_001)),
            venueName = "e".repeat(101), publicNote = "p".repeat(2001), privateNote = "q".repeat(2001),
        )
        val expected = ErrorBody(
            ErrorType.INVALID_REQUEST, "invalid meal record",
            listOf(
                FieldError("eatenOn", FieldErrorType.INVALID_FORMAT),
                FieldError("menuItems", FieldErrorType.TOO_LONG, "menuItems[0].name"),
                FieldError("menuItems", FieldErrorType.REQUIRED, "menuItems[1].name"),
                FieldError("menuItems", FieldErrorType.OUT_OF_RANGE, "menuItems[1].price"),
                FieldError("menuItems", FieldErrorType.OUT_OF_RANGE, "menuItems[2].price"),
                FieldError("rate", FieldErrorType.OUT_OF_RANGE),
                FieldError("venueName", FieldErrorType.TOO_LONG),
                FieldError("publicNote", FieldErrorType.TOO_LONG),
                FieldError("privateNote", FieldErrorType.TOO_LONG),
            ),
        )

        client.postJson("/api/v1/auth/meal-records", encode(invalid), admin).let {
            it.status shouldBe HttpStatusCode.BadRequest
            it.body<ErrorBody>() shouldBe expected
        }
        client.mealRecords(id).shouldBeEmpty()

        val kept = client.addMealRecord(id, mealRecord(id, "2024-01-01", rate = 50.0), admin)
        client.putJson("/api/v1/auth/meal-records/${kept.id}", encode(invalid), admin).body<ErrorBody>() shouldBe expected
        client.mealRecords(id, admin) shouldContainExactly listOf(kept)
    }

    @Test
    fun `mealRecord dates must be real dates, and limits are inclusive`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        suspend fun fieldError(input: MealRecordInput) =
            client.postJson("/api/v1/auth/meal-records", encode(input), admin).body<ErrorBody>().fieldErrors

        // The latest allowed date (tomorrow) is checked against a fixed day in MealRecordsTest.
        fieldError(mealRecord(id, "9999-12-31")) shouldBe listOf(FieldError("eatenOn", FieldErrorType.OUT_OF_RANGE))
        for (bad in listOf("2024-02-30", "2024-13-01", "2023-02-29", "24-01-01", "+2024-01-01", "2024-1-1", "20241001", "2024-10-01T00:00")) {
            fieldError(mealRecord(id, bad)) shouldBe listOf(FieldError("eatenOn", FieldErrorType.INVALID_FORMAT))
        }
        fieldError(MealRecordInput(shopIds = listOf(id), menuItems = List(11) { MenuItemInput("麺$it") })) shouldBe
            listOf(FieldError("menuItems", FieldErrorType.OUT_OF_RANGE, "at most 10 menu items"))
        // A leading NUL would otherwise fail the table's CHECK (SQLite's length() stops at it) as a server error.
        fieldError(MealRecordInput(shopIds = listOf(id), menuItems = listOf(MenuItemInput("\u0000麺")))) shouldBe
            listOf(FieldError("menuItems", FieldErrorType.INVALID_FORMAT, "menuItems[0].name"))
        fieldError(mealRecord(id, rate = -0.5)) shouldBe listOf(FieldError("rate", FieldErrorType.OUT_OF_RANGE))

        client.addMealRecord(id, mealRecord(id, "2024-02-29", rate = 0.0), admin).eatenOn shouldBe "2024-02-29"
        client.addMealRecord(
            id,
            MealRecordInput(shopIds = listOf(id),
                rate = 100.0, venueName = "e".repeat(100), publicNote = "p".repeat(2000), privateNote = "q".repeat(2000),
                menuItems = List(10) { MenuItemInput("麺".repeat(200), price = 10_000_000) },
            ),
            admin,
        ).totalPrice shouldBe 100_000_000
        client.addMealRecord(id, MealRecordInput(shopIds = listOf(id), menuItems = listOf(MenuItemInput("水", price = 0)), eatenOn = ""), admin).let {
            it.eatenOn shouldBe null
            it.totalPrice shouldBe 0
        }
    }

    @Test
    fun `meal record writes need the admin`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        val existing = client.addMealRecord(id, mealRecord(id, rate = 10.0), admin)
        val body = encode(mealRecord(id, rate = 99.0))

        for ((token, status, type) in listOf(
            Triple(null, HttpStatusCode.Unauthorized, ErrorType.AUTHENTICATION_REQUIRED),
            Triple(t.userToken(), HttpStatusCode.Forbidden, ErrorType.PERMISSION_DENIED),
        )) {
            listOf(
                client.postJson("/api/v1/auth/meal-records", body, token),
                client.putJson("/api/v1/auth/meal-records/${existing.id}", body, token),
                client.deleteWithSession("/api/v1/auth/meal-records/${existing.id}", token),
            ).forEach {
                it.status shouldBe status
                it.body<ErrorBody>().type shouldBe type
            }
        }
        client.mealRecords(id, admin) shouldContainExactly listOf(existing)
    }

    @Test
    fun `unknown or malformed shops and meal records are not found`() = testApp { t ->
        val admin = t.adminToken()
        val notFound = ErrorBody(ErrorType.NOT_FOUND, "not found")
        val unknown = UUID.randomUUID().toString()
        val body = encode(mealRecord(unknown))

        for (shopId in listOf(unknown, "not-a-uuid")) {
            client.get("/api/v1/shops/$shopId/meal-records").let {
                it.status shouldBe HttpStatusCode.NotFound
                it.body<ErrorBody>() shouldBe notFound
            }
            if (shopId == unknown) client.postJson("/api/v1/auth/meal-records", body, admin).body<ErrorBody>() shouldBe notFound
            client.putJson("/api/v1/auth/meal-records/$shopId", body, admin).body<ErrorBody>() shouldBe notFound
            client.deleteWithSession("/api/v1/auth/meal-records/$shopId", admin).body<ErrorBody>() shouldBe notFound
        }
        client.get("/api/v1/shops/${addShop(admin)}/meal-records").body<MealRecordsResponse>().mealRecords.shouldBeEmpty()
    }
}
