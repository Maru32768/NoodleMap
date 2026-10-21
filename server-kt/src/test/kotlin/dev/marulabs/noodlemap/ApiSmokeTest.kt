package dev.marulabs.noodlemap

import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import dev.marulabs.noodlemap.auth.AuthHandler
import dev.marulabs.noodlemap.auth.GoogleVerifier
import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.db.buildDataSource
import dev.marulabs.noodlemap.db.buildDatabase
import dev.marulabs.noodlemap.shops.ShopHandler
import java.nio.file.Files
import org.junit.jupiter.api.Test

class ApiSmokeTest {

    private fun testConfig(dbPath: String) = Config(
        dbPath = dbPath,
        serverPort = 0,
        googleOAuthClientId = "test-client",
        adminEmail = "",
        cookieSecure = false,
        backup = Config.BackupConfig(snapshotPath = "$dbPath.bak", s3Bucket = null, s3Prefix = null, awsRegion = null),
    )

    private fun app(block: suspend (io.ktor.client.HttpClient) -> Unit) {
        val dbFile = Files.createTempFile("noodlemap-test", ".db")
        val config = testConfig(dbFile.toString())
        val ds = buildDataSource(config.dbPath)
        val db = buildDatabase(ds)
        val sessions = SessionService(db, config)
        val authHandler = AuthHandler(db, GoogleVerifier(config.googleOAuthClientId), sessions)
        val shopHandler = ShopHandler(db, sessions)

        testApplication {
            application { installApp(authHandler, shopHandler) }
            block(client)
        }
        ds.close()
        Files.deleteIfExists(dbFile)
    }

    @Test
    fun health_returns_ok() = app { client ->
        val res = client.get("/health")
        res.status shouldBe HttpStatusCode.OK
        res.bodyAsText() shouldBe "ok"
    }

    @Test
    fun public_reads_on_a_fresh_database() = app { client ->
        client.get("/api/v1/shops").let {
            it.status shouldBe HttpStatusCode.OK
            it.bodyAsText() shouldBe """{"shops":[]}"""
        }
        client.get("/api/v1/tags").let {
            it.status shouldBe HttpStatusCode.OK
            // Tags seeded by migration 00007.
            it.bodyAsText() shouldContain """"slug":"shoyu-ramen""""
        }
    }

    @Test
    fun no_cache_headers_present() = app { client ->
        val res = client.get("/api/v1/shops")
        res.headers["Cache-Control"] shouldBe "no-store"
        res.headers["Pragma"] shouldBe "no-cache"
        res.headers["Expires"] shouldBe "0"
    }

    @Test
    fun protected_routes_require_authentication() = app { client ->
        client.get("/api/v1/auth/me").let {
            it.status shouldBe HttpStatusCode.Unauthorized
            it.bodyAsText() shouldContain "authentication_required"
        }
        // addShop is admin-gated; a well-formed but unauthenticated request gets 401.
        // (The generated route deserializes the body before the handler's auth check, so a
        // body-less request would surface 415 first — real frontend requests always send JSON.)
        val body = """{"name":"x","lat":0.0,"lng":0.0,"postalCode":"x","address":"x","googlePlaceId":"x","category":"ramen","tagIds":[]}"""
        client.post("/api/v1/auth/shops") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }.status shouldBe HttpStatusCode.Unauthorized
    }

    @Test
    fun logout_is_idempotent_without_session() = app { client ->
        client.post("/api/v1/auth/logout").status shouldBe HttpStatusCode.OK
    }
}
