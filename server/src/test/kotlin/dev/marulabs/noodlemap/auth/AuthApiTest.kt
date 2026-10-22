package dev.marulabs.noodlemap.auth

import dev.marulabs.noodlemap.ADMIN_EMAIL
import dev.marulabs.noodlemap.TestDb
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.common.SessionTime
import dev.marulabs.noodlemap.errors.ErrorBody
import dev.marulabs.noodlemap.errors.ErrorType
import dev.marulabs.noodlemap.generated.models.User
import dev.marulabs.noodlemap.postJson
import dev.marulabs.noodlemap.session
import dev.marulabs.noodlemap.testApp
import dev.marulabs.noodlemap.withTestDb
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.matchers.comparables.shouldBeGreaterThan
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.statement.HttpResponse
import io.ktor.http.Cookie
import io.ktor.http.HttpStatusCode
import io.ktor.http.parseServerSetCookieHeader
import java.net.Proxy
import java.net.ProxySelector
import java.net.SocketAddress
import java.net.URI
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.Collections
import org.junit.jupiter.api.Test

class AuthApiTest {

    private fun HttpResponse.sessionCookies(): List<Cookie> =
        headers.getAll("Set-Cookie").orEmpty().map(::parseServerSetCookieHeader).filter { it.name == SessionService.COOKIE }

    private fun TestDb.expiresAt(token: String): String? = dataSource.connection.use { c ->
        c.prepareStatement("SELECT expires_at FROM sessions WHERE token_hash = ?").use { st ->
            st.setString(1, SessionTokens.hash(token))
            st.executeQuery().use { if (it.next()) it.getString(1) else null }
        }
    }

    @Test
    fun `me returns the session user and flags the admin case-insensitively`() = testApp { t ->
        val adminId = t.seedUser("Admin@Example.COM")
        val userId = t.seedUser("someone@example.com")

        client.get("/api/v1/auth/me") { session(t.seedSession(adminId)) }.body<User>() shouldBe
            User(id = adminId.toString(), email = "Admin@Example.COM", isAdmin = true)
        client.get("/api/v1/auth/me") { session(t.seedSession(userId)) }.body<User>() shouldBe
            User(id = userId.toString(), email = "someone@example.com", isAdmin = false)
    }

    @Test
    fun `no admin exists when ADMIN_EMAIL is empty`() = testApp(adminEmail = "") { t ->
        client.get("/api/v1/auth/me") { session(t.seedSession(t.seedUser(ADMIN_EMAIL))) }.body<User>().isAdmin shouldBe false
    }

    @Test
    fun `expired or unknown sessions are unauthenticated`() = testApp { t ->
        val expired = t.seedSession(t.seedUser("old@example.com"), expiresAt = Instant.now().minusSeconds(1))

        for (token in listOf(expired, SessionTokens.newToken())) {
            val res = client.get("/api/v1/auth/me") { session(token) }
            res.status shouldBe HttpStatusCode.Unauthorized
            res.body<ErrorBody>().type shouldBe ErrorType.AUTHENTICATION_REQUIRED
        }
    }

    @Test
    fun `a stale session slides its expiry and reissues the cookie`() = testApp { t ->
        val stale = Instant.now().plus(SessionService.TTL).minus(SessionService.REFRESH).minus(Duration.ofHours(1))
        val token = t.seedSession(t.seedUser("u@example.com"), expiresAt = stale)

        val res = client.get("/api/v1/auth/me") { session(token) }

        res.status shouldBe HttpStatusCode.OK
        val cookie = res.sessionCookies().single()
        cookie.value shouldBe token
        cookie.maxAge shouldBe SessionService.TTL.seconds.toInt()
        t.expiresAt(token)!! shouldBeGreaterThan SessionTime.format(Instant.now().plus(SessionService.TTL).minus(Duration.ofMinutes(1)))
    }

    @Test
    fun `a fresh session is not rewritten`() = testApp { t ->
        val token = t.seedSession(t.seedUser("u@example.com"))
        val before = t.expiresAt(token)

        val res = client.get("/api/v1/auth/me") { session(token) }

        res.status shouldBe HttpStatusCode.OK
        res.sessionCookies().shouldBeEmpty()
        t.expiresAt(token) shouldBe before
    }

    @Test
    fun `logout deletes the session and clears the cookie`() = testApp { t ->
        val token = t.userToken()
        val other = t.userToken()

        val res = client.post("/api/v1/auth/logout") { session(token) }

        res.status shouldBe HttpStatusCode.OK
        res.sessionCookies().single().let {
            it.value shouldBe ""
            it.maxAge shouldBe 0
        }
        t.expiresAt(token) shouldBe null
        client.get("/api/v1/auth/me") { session(token) }.status shouldBe HttpStatusCode.Unauthorized
        client.get("/api/v1/auth/me") { session(other) }.status shouldBe HttpStatusCode.OK
    }

    @Test
    fun `session cookie is HttpOnly, SameSite=Lax, Path=slash and not Secure by default`() = testApp { t ->
        val cookie = client.post("/api/v1/auth/logout") { session(t.userToken()) }.sessionCookies().single()

        cookie.httpOnly shouldBe true
        cookie.path shouldBe "/"
        cookie.extensions["SameSite"] shouldBe "Lax"
        cookie.secure shouldBe false
    }

    @Test
    fun `session cookie is Secure when configured`() = testApp(cookieSecure = true) { t ->
        client.post("/api/v1/auth/logout") { session(t.userToken()) }.sessionCookies().single().secure shouldBe true
    }

    @Test
    fun `google sign-in rejects bad credentials without a network call`() = testApp { t ->
        val wrongAudience = jwt("""{"iss":"https://accounts.google.com","aud":"someone-else","sub":"1","email":"a@b.c","email_verified":true,"iat":${now()},"exp":${now() + 3600}}""")

        val urls = recordingOutboundConnections {
            for (credential in listOf("garbage", wrongAudience)) {
                val res = client.postJson("/api/v1/auth/google", """{"credential":"$credential"}""")
                res.status shouldBe HttpStatusCode.BadRequest
                res.body<ErrorBody>() shouldBe ErrorBody(ErrorType.GOOGLE_AUTH_FAILED, "failed to authenticate with Google")
            }
        }

        urls.shouldBeEmpty()
        t.sessionCount() shouldBe 0
    }

    @Test
    fun `google sign-in with a malformed body is an invalid request`() = testApp {
        for (body in listOf("""{}""", """{"credential":1""")) {
            val res = client.postJson("/api/v1/auth/google", body)
            res.status shouldBe HttpStatusCode.BadRequest
            res.body<ErrorBody>().type shouldBe ErrorType.INVALID_REQUEST
        }
    }

    @Test
    fun `deleteExpired removes only expired sessions`() = withTestDb { t ->
        val user = t.seedUser("u@example.com")
        t.seedSession(user, expiresAt = Instant.now().minusSeconds(60))
        t.seedSession(user, expiresAt = Instant.now().minusSeconds(1))
        val live = t.seedSession(user)

        t.sessions.deleteExpired()

        t.sessionCount() shouldBe 1
        t.expiresAt(live) shouldNotBe null
    }

    private fun now() = Instant.now().epochSecond

    private fun jwt(payload: String): String {
        val enc = Base64.getUrlEncoder().withoutPadding()
        return listOf("""{"alg":"RS256","typ":"JWT"}""", payload, "sig").joinToString(".") { enc.encodeToString(it.toByteArray()) }
    }

    /** Records every URL the JVM's default HTTP stack (used by Google's NetHttpTransport) tries to open. */
    private suspend fun recordingOutboundConnections(block: suspend () -> Unit): List<URI> {
        val urls = Collections.synchronizedList(mutableListOf<URI>())
        val original = ProxySelector.getDefault()
        ProxySelector.setDefault(object : ProxySelector() {
            override fun select(uri: URI): List<Proxy> = urls.add(uri).let { listOf(Proxy.NO_PROXY) }
            override fun connectFailed(uri: URI, sa: SocketAddress, ioe: java.io.IOException) = Unit
        })
        try {
            block()
        } finally {
            ProxySelector.setDefault(original)
        }
        return urls.toList()
    }
}
