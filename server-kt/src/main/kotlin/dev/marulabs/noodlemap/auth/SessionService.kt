package dev.marulabs.noodlemap.auth

import io.ktor.http.Cookie
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.userAgent
import dev.marulabs.noodlemap.Config
import dev.marulabs.noodlemap.common.SessionTime
import dev.marulabs.noodlemap.db.NoodleMapDb
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.generated.models.User
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Opaque-token session handling, ported from Go `auth/handler.go` + `auth/session.go`.
 * The raw token lives only in the cookie; the DB stores its SHA-256 hash. Implemented as
 * explicit per-handler checks ([requireUser]/[requireAdmin]) rather than a Ktor
 * Authentication provider — this mirrors Gin's middleware semantics and keeps wiring
 * compile-time obvious. Server-side revocation is preserved (no JWT sessions).
 */
class SessionService(
    private val db: NoodleMapDb,
    private val config: Config,
) {
    private val sessions = db.sessionsQueries

    /** Resolves the current user from the session cookie, sliding the expiry. Null if unauthenticated. */
    fun authenticate(call: ApplicationCall): User? {
        val token = call.request.cookies[COOKIE] ?: return null
        val now = Instant.now()
        val session = sessions.findValidSessionByTokenHash(
            tokenHash = SessionTokens.hash(token),
            now = SessionTime.format(now),
        ).executeAsOneOrNull() ?: return null

        // Slide the expiry only when the session is stale (last extended more than REFRESH
        // ago), avoiding a row-dirtying write on every authenticated request. Refresh the
        // cookie in lockstep so cookie and stored session share the same expiry.
        val staleBefore = SessionTime.format(now.plus(TTL).minus(REFRESH))
        if (session.expires_at < staleBefore) {
            sessions.extendSession(expiresAt = SessionTime.format(now.plus(TTL)), id = session.id)
            setCookie(call, token, TTL)
        }

        return toUser(session.user_id, session.email)
    }

    fun requireUser(call: ApplicationCall): User =
        authenticate(call) ?: throw DomainException.AuthenticationRequired()

    fun requireAdmin(call: ApplicationCall): User =
        requireUser(call).also { if (!it.isAdmin) throw DomainException.PermissionDenied() }

    /** Creates a fresh session for [userId] and sets the cookie. */
    fun createSession(call: ApplicationCall, userId: UUID) {
        val token = SessionTokens.newToken()
        sessions.insertSession(
            id = UUID.randomUUID(),
            user_id = userId,
            token_hash = SessionTokens.hash(token),
            user_agent = call.request.userAgent(),
            expires_at = SessionTime.format(Instant.now().plus(TTL)),
        )
        setCookie(call, token, TTL)
    }

    fun logout(call: ApplicationCall) {
        call.request.cookies[COOKIE]?.let { sessions.deleteSessionByTokenHash(SessionTokens.hash(it)) }
        clearCookie(call)
    }

    fun deleteExpired() = sessions.deleteExpiredSessions(SessionTime.now())

    fun toUser(id: UUID, email: String): User =
        User(id = id.toString(), email = email, isAdmin = isAdmin(email))

    private fun isAdmin(email: String): Boolean =
        config.adminEmail.isNotEmpty() && email.lowercase() == config.adminEmail

    private fun setCookie(call: ApplicationCall, token: String, ttl: Duration) =
        call.response.cookies.append(cookie(token, ttl.seconds.toInt()))

    private fun clearCookie(call: ApplicationCall) =
        call.response.cookies.append(cookie("", 0))

    private fun cookie(value: String, maxAgeSeconds: Int) = Cookie(
        name = COOKIE,
        value = value,
        maxAge = maxAgeSeconds,
        path = "/",
        secure = config.cookieSecure,
        httpOnly = true,
        extensions = mapOf("SameSite" to "Lax"),
    )

    companion object {
        const val COOKIE = "noodle_map_session"
        val TTL: Duration = Duration.ofDays(30)
        val REFRESH: Duration = Duration.ofHours(12)
    }
}
