package dev.marulabs.noodlemap.auth

import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.errors.ErrorBody
import dev.marulabs.noodlemap.errors.ErrorType
import dev.marulabs.noodlemap.generated.models.AuthSession
import dev.marulabs.noodlemap.generated.models.SessionsResponse
import dev.marulabs.noodlemap.session
import dev.marulabs.noodlemap.testApp
import io.kotest.matchers.collections.shouldContainExactlyInAnyOrder
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.shouldBe
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import io.ktor.http.parseServerSetCookieHeader
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Test

class SessionsApiTest {

    private suspend fun HttpClient.sessions(token: String): List<AuthSession> =
        get("/api/v1/auth/sessions") { session(token) }.body<SessionsResponse>().sessions

    private suspend fun HttpClient.revoke(token: String, id: String): HttpResponse =
        delete("/api/v1/auth/sessions/$id") { session(token) }

    private suspend fun HttpClient.isLoggedIn(token: String): Boolean =
        get("/api/v1/auth/me") { session(token) }.status == HttpStatusCode.OK

    @Test
    fun `lists only the caller's live sessions and flags the current one`() = testApp { t ->
        val user = t.seedUser("u@example.com")
        val current = t.seedSession(user)
        t.seedSession(user)
        t.seedSession(user, expiresAt = Instant.now().minusSeconds(1))
        t.userToken()

        val list = client.sessions(current)

        list.size shouldBe 2
        list.map { it.current } shouldContainExactlyInAnyOrder listOf(true, false)
        list.forEach {
            it.userAgent shouldBe "test"
            Instant.parse(it.createdAt)
            Instant.parse(it.lastUsedAt)
        }
    }

    @Test
    fun `listing requires a session`() = testApp {
        val res = client.get("/api/v1/auth/sessions")
        res.status shouldBe HttpStatusCode.Unauthorized
        res.body<ErrorBody>().type shouldBe ErrorType.AUTHENTICATION_REQUIRED
    }

    @Test
    fun `revokes another session of the caller`() = testApp { t ->
        val user = t.seedUser("u@example.com")
        val current = t.seedSession(user)
        val other = t.seedSession(user)
        val otherId = client.sessions(other).single { it.current }.id

        client.revoke(current, otherId).status shouldBe HttpStatusCode.OK

        client.isLoggedIn(other) shouldBe false
        client.isLoggedIn(current) shouldBe true
        client.sessions(current).map { it.id }.contains(otherId) shouldBe false
    }

    @Test
    fun `cannot revoke another user's session or an unknown id`() = testApp { t ->
        val mine = t.userToken()
        val theirs = t.userToken()
        val theirId = client.sessions(theirs).single().id

        for (id in listOf(theirId, UUID.randomUUID().toString(), "not-a-uuid")) {
            val res = client.revoke(mine, id)
            res.status shouldBe HttpStatusCode.NotFound
            res.body<ErrorBody>().type shouldBe ErrorType.NOT_FOUND
        }
        client.isLoggedIn(theirs) shouldBe true
    }

    @Test
    fun `revoking the current session logs out and clears the cookie`() = testApp { t ->
        val token = t.userToken()
        val id = client.sessions(token).single().id

        val res = client.revoke(token, id)

        res.status shouldBe HttpStatusCode.OK
        res.headers.getAll("Set-Cookie").orEmpty().map(::parseServerSetCookieHeader)
            .single { it.name == SessionService.COOKIE }.maxAge shouldBe 0
        client.isLoggedIn(token) shouldBe false
    }

    @Test
    fun `revoking a non-current session leaves the cookie alone`() = testApp { t ->
        val user = t.seedUser("u@example.com")
        val current = t.seedSession(user)
        val otherId = client.sessions(t.seedSession(user)).single { it.current }.id

        client.revoke(current, otherId).headers.getAll("Set-Cookie").orEmpty().shouldBeEmpty()
    }

    @Test
    fun `revoke-others keeps only the current session and spares other users`() = testApp { t ->
        val user = t.seedUser("u@example.com")
        val current = t.seedSession(user)
        val others = List(2) { t.seedSession(user) }
        val stranger = t.userToken()

        client.post("/api/v1/auth/sessions/revoke-others") { session(current) }.status shouldBe HttpStatusCode.OK

        client.sessions(current).map { it.current } shouldBe listOf(true)
        others.forEach { client.isLoggedIn(it) shouldBe false }
        client.isLoggedIn(stranger) shouldBe true
    }
}
