package dev.marulabs.noodlemap.visits

import dev.marulabs.noodlemap.addShopRequest
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.TestDb
import dev.marulabs.noodlemap.deleteWithSession
import dev.marulabs.noodlemap.encode
import dev.marulabs.noodlemap.errors.ErrorBody
import dev.marulabs.noodlemap.errors.ErrorType
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.models.Shop
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
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldNotContain
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.ApplicationTestBuilder
import java.util.UUID
import org.junit.jupiter.api.Test

private fun TestDb.setCreatedAt(visitId: String, createdAt: String) = dataSource.connection.use { c ->
    c.prepareStatement("UPDATE visit_logs SET created_at = ? WHERE id = ?").use {
        it.setString(1, createdAt)
        it.setString(2, visitId)
        it.executeUpdate()
    }
}

class VisitLogApiTest {

    private suspend fun ApplicationTestBuilder.addShop(admin: String, placeId: String = "place-1"): String =
        client.postJson("/api/v1/auth/shops", encode(addShopRequest(placeId = placeId)), admin).body<Shop>().id

    private suspend fun HttpClient.addVisit(shopId: String, input: VisitLogInput, admin: String): VisitLog =
        postJson("/api/v1/auth/shops/$shopId/visits", encode(input), admin).also { it.status shouldBe HttpStatusCode.OK }.body()

    private suspend fun HttpClient.visits(shopId: String, token: String? = null): List<VisitLog> =
        get("/api/v1/shops/$shopId/visits") { token?.let { session(it) } }.body<VisitLogsResponse>().visits

    private fun visit(visitedOn: String? = null, rate: Double? = null) =
        VisitLogInput(visitedOn = visitedOn, isLimitedMenu = false, rate = rate)

    @Test
    fun `visits are newest first with undated ones last, and the shop derives eaten, rate and favorite from them`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        client.shops().single().let {
            it.eaten shouldBe false
            it.visitCount shouldBe 0
            it.rate shouldBe 0.0
        }

        val undated = client.addVisit(id, visit(rate = 95.0), admin)
        val older = client.addVisit(id, visit("2023-05-01", rate = 60.0), admin)
        val newest = client.addVisit(id, visit("2024-01-01"), admin)

        client.visits(id).map { it.id } shouldContainExactly listOf(newest.id, older.id, undated.id)
        client.shops().single().let {
            it.eaten shouldBe true
            it.visitCount shouldBe 3
            // The newest visit has no rate, so the latest rated one counts; the undated 95 is older still.
            it.rate shouldBe 60.0
            it.favorite shouldBe false
        }

        client.putJson("/api/v1/auth/visits/${newest.id}", encode(visit("2024-01-01", rate = 80.0)), admin).status shouldBe HttpStatusCode.OK
        client.shops().single().let {
            it.rate shouldBe 80.0
            it.favorite shouldBe true
        }

        client.deleteWithSession("/api/v1/auth/visits/${newest.id}", admin)
        client.deleteWithSession("/api/v1/auth/visits/${older.id}", admin)
        client.shops().single().let {
            it.visitCount shouldBe 1
            it.rate shouldBe 95.0
            it.favorite shouldBe true
        }
    }

    @Test
    fun `among undated visits the one created last is the latest`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        val first = client.addVisit(id, visit(rate = 50.0), admin)
        val second = client.addVisit(id, visit(rate = 70.0), admin)
        // Pinned so the test does not depend on the two requests landing in different milliseconds.
        t.setCreatedAt(first.id, "2025-01-01 00:00:00.000")
        t.setCreatedAt(second.id, "2025-01-01 00:00:00.001")

        client.visits(id).map { it.id } shouldContainExactly listOf(second.id, first.id)
        client.shops().single().rate shouldBe 70.0
    }

    @Test
    fun `a shop whose visits are all unrated is eaten without a rate`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        client.addVisit(id, visit("2024-01-01"), admin)

        client.shops().single().let {
            it.eaten shouldBe true
            it.visitCount shouldBe 1
            it.rate shouldBe 0.0
            it.favorite shouldBe false
        }
    }

    @Test
    fun `the private note is only returned to the admin`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        val input = VisitLogInput(isLimitedMenu = true, publicNote = "公開", privateNote = "非公開")
        client.addVisit(id, input, admin).privateNote shouldBe "非公開"

        client.visits(id, admin).single().let {
            it.publicNote shouldBe "公開"
            it.privateNote shouldBe "非公開"
        }
        for (token in listOf(null, t.userToken())) {
            val res = client.get("/api/v1/shops/$id/visits") { token?.let { session(it) } }
            res.bodyAsText() shouldNotContain "privateNote"
            res.body<VisitLogsResponse>().visits.single().let {
                it.publicNote shouldBe "公開"
                it.isLimitedMenu shouldBe true
            }
        }
    }

    @Test
    fun `admin adds, replaces and deletes a visit log with trimmed fields`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        val added = client.addVisit(
            id,
            VisitLogInput(
                visitedOn = " 2024-02-03 ", menuName = " 特製中華そば ", isLimitedMenu = true, price = 1200, rate = 85.5,
                eventName = " 大つけ麺博 ", publicNote = "   ", privateNote = " 混んでいた ",
            ),
            admin,
        )
        added shouldBe VisitLog(
            id = added.id, visitedOn = "2024-02-03", menuName = "特製中華そば", isLimitedMenu = true, price = 1200, rate = 85.5,
            eventName = "大つけ麺博", publicNote = null, privateNote = "混んでいた",
        )
        client.visits(id, admin) shouldContainExactly listOf(added)

        // A replacement clears every field it omits.
        val replaced = client.putJson("/api/v1/auth/visits/${added.id}", encode(VisitLogInput(isLimitedMenu = false, menuName = "つけ麺")), admin)
        replaced.status shouldBe HttpStatusCode.OK
        val expected = VisitLog(id = added.id, menuName = "つけ麺", isLimitedMenu = false)
        replaced.body<VisitLog>() shouldBe expected
        client.visits(id, admin) shouldContainExactly listOf(expected)

        client.deleteWithSession("/api/v1/auth/visits/${added.id}", admin).status shouldBe HttpStatusCode.NoContent
        client.visits(id).shouldBeEmpty()
        client.deleteWithSession("/api/v1/auth/visits/${added.id}", admin).status shouldBe HttpStatusCode.NotFound
    }

    @Test
    fun `invalid fields are all reported and nothing is written`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        val invalid = VisitLogInput(
            visitedOn = "2024/01/01", menuName = "麺".repeat(201), isLimitedMenu = false, price = -1, rate = 100.5,
            eventName = "e".repeat(101), publicNote = "p".repeat(2001), privateNote = "q".repeat(2001),
        )
        val expected = ErrorBody(
            ErrorType.INVALID_REQUEST, "invalid visit log",
            listOf(
                FieldError("visitedOn", FieldErrorType.INVALID_FORMAT),
                FieldError("price", FieldErrorType.OUT_OF_RANGE),
                FieldError("rate", FieldErrorType.OUT_OF_RANGE),
                FieldError("menuName", FieldErrorType.TOO_LONG),
                FieldError("eventName", FieldErrorType.TOO_LONG),
                FieldError("publicNote", FieldErrorType.TOO_LONG),
                FieldError("privateNote", FieldErrorType.TOO_LONG),
            ),
        )

        client.postJson("/api/v1/auth/shops/$id/visits", encode(invalid), admin).let {
            it.status shouldBe HttpStatusCode.BadRequest
            it.body<ErrorBody>() shouldBe expected
        }
        client.visits(id).shouldBeEmpty()

        val kept = client.addVisit(id, visit("2024-01-01", rate = 50.0), admin)
        client.putJson("/api/v1/auth/visits/${kept.id}", encode(invalid), admin).body<ErrorBody>() shouldBe expected
        client.visits(id, admin) shouldContainExactly listOf(kept)
    }

    @Test
    fun `visit dates must be real dates, and limits are inclusive`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        suspend fun fieldError(input: VisitLogInput) =
            client.postJson("/api/v1/auth/shops/$id/visits", encode(input), admin).body<ErrorBody>().fieldErrors

        // The latest allowed date (tomorrow) is checked against a fixed day in VisitsTest.
        fieldError(visit("9999-12-31")) shouldBe listOf(FieldError("visitedOn", FieldErrorType.OUT_OF_RANGE))
        for (bad in listOf("2024-02-30", "24-01-01", "+2024-01-01", "2024-1-1")) {
            fieldError(visit(bad)) shouldBe listOf(FieldError("visitedOn", FieldErrorType.INVALID_FORMAT))
        }
        fieldError(VisitLogInput(isLimitedMenu = false, price = 10_000_001)) shouldBe listOf(FieldError("price", FieldErrorType.OUT_OF_RANGE))
        fieldError(visit(rate = -0.5)) shouldBe listOf(FieldError("rate", FieldErrorType.OUT_OF_RANGE))

        client.addVisit(id, visit("2024-02-29", rate = 0.0), admin).visitedOn shouldBe "2024-02-29"
        client.addVisit(
            id,
            VisitLogInput(
                isLimitedMenu = false, price = 10_000_000, rate = 100.0, menuName = "麺".repeat(200), eventName = "e".repeat(100),
                publicNote = "p".repeat(2000), privateNote = "q".repeat(2000),
            ),
            admin,
        ).price shouldBe 10_000_000
        client.addVisit(id, VisitLogInput(isLimitedMenu = false, price = 0, visitedOn = ""), admin).visitedOn shouldBe null
    }

    @Test
    fun `visit log writes need the admin`() = testApp { t ->
        val admin = t.adminToken()
        val id = addShop(admin)
        val existing = client.addVisit(id, visit(rate = 10.0), admin)
        val body = encode(visit(rate = 99.0))

        for ((token, status, type) in listOf(
            Triple(null, HttpStatusCode.Unauthorized, ErrorType.AUTHENTICATION_REQUIRED),
            Triple(t.userToken(), HttpStatusCode.Forbidden, ErrorType.PERMISSION_DENIED),
        )) {
            listOf(
                client.postJson("/api/v1/auth/shops/$id/visits", body, token),
                client.putJson("/api/v1/auth/visits/${existing.id}", body, token),
                client.deleteWithSession("/api/v1/auth/visits/${existing.id}", token),
            ).forEach {
                it.status shouldBe status
                it.body<ErrorBody>().type shouldBe type
            }
        }
        client.visits(id, admin) shouldContainExactly listOf(existing)
    }

    @Test
    fun `unknown or malformed shops and visit logs are not found`() = testApp { t ->
        val admin = t.adminToken()
        val notFound = ErrorBody(ErrorType.NOT_FOUND, "not found")
        val unknown = UUID.randomUUID().toString()
        val body = encode(visit())

        for (shopId in listOf(unknown, "not-a-uuid")) {
            client.get("/api/v1/shops/$shopId/visits").let {
                it.status shouldBe HttpStatusCode.NotFound
                it.body<ErrorBody>() shouldBe notFound
            }
            client.postJson("/api/v1/auth/shops/$shopId/visits", body, admin).body<ErrorBody>() shouldBe notFound
            client.putJson("/api/v1/auth/visits/$shopId", body, admin).body<ErrorBody>() shouldBe notFound
            client.deleteWithSession("/api/v1/auth/visits/$shopId", admin).body<ErrorBody>() shouldBe notFound
        }
        client.get("/api/v1/shops/${addShop(admin)}/visits").body<VisitLogsResponse>().visits.shouldBeEmpty()
    }
}
