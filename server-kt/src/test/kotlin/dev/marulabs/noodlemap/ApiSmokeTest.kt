package dev.marulabs.noodlemap

import dev.marulabs.noodlemap.errors.ErrorBody
import dev.marulabs.noodlemap.errors.ErrorType
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import org.junit.jupiter.api.Test

class ApiSmokeTest {

    @Test
    fun health_returns_ok() = testApp {
        val res = client.get("/health")
        res.status shouldBe HttpStatusCode.OK
        res.bodyAsText() shouldBe "ok"
    }

    @Test
    fun public_reads_on_a_fresh_database() = testApp {
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
    fun no_cache_headers_present() = testApp {
        val res = client.get("/api/v1/shops")
        res.headers["Cache-Control"] shouldBe "no-store"
        res.headers["Pragma"] shouldBe "no-cache"
        res.headers["Expires"] shouldBe "0"
    }

    @Test
    fun protected_routes_require_authentication() = testApp {
        client.get("/api/v1/auth/me").let {
            it.status shouldBe HttpStatusCode.Unauthorized
            it.body<ErrorBody>().type shouldBe ErrorType.AUTHENTICATION_REQUIRED
        }
        // The generated route deserializes the body before the handler's auth check, so the
        // request must be well-formed to reach the 401.
        client.postJson("/api/v1/auth/shops", encode(addShopRequest())).status shouldBe HttpStatusCode.Unauthorized
        client.putJson("/api/v1/auth/tags", """{"tags":[]}""").status shouldBe HttpStatusCode.Unauthorized
    }

    @Test
    fun malformed_json_is_invalid_request() = testApp { t ->
        val admin = t.adminToken()
        for (body in listOf("{not json", """{"name":"missing the rest"}""", """{"tags":[{"label":1}]}""")) {
            val res = client.postJson("/api/v1/auth/shops", body, admin)
            res.status shouldBe HttpStatusCode.BadRequest
            res.body<ErrorBody>() shouldBe ErrorBody(ErrorType.INVALID_REQUEST, "invalid request")
        }
    }

    @Test
    fun logout_is_idempotent_without_session() = testApp {
        client.post("/api/v1/auth/logout").status shouldBe HttpStatusCode.OK
    }
}
