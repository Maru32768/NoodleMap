package dev.marulabs.noodlemap.auth

import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import dev.marulabs.noodlemap.errors.DomainException
import org.slf4j.LoggerFactory

data class GoogleUser(val sub: String, val email: String)

/**
 * Verifies Google Sign-In ID tokens. Replaces the ~220-line hand-rolled JWKS/JWT code
 * in Go (`auth/google.go`): the library handles JWKS fetch + caching, RS256 signature,
 * audience, issuer (accounts.google.com), and expiry. We only add the explicit
 * `email_verified` rejection that the Go code enforced.
 */
class GoogleVerifier(clientId: String) {
    private val log = LoggerFactory.getLogger(GoogleVerifier::class.java)

    private val verifier = GoogleIdTokenVerifier.Builder(NetHttpTransport(), GsonFactory.getDefaultInstance())
        .setAudience(listOf(clientId))
        .build()

    /** @throws DomainException.GoogleAuthFailed if the credential is invalid or unverified. */
    fun verify(credential: String): GoogleUser {
        val token = try {
            verifier.verify(credential)
        } catch (e: Exception) {
            log.warn("google id token verification error", e)
            throw DomainException.GoogleAuthFailed(e)
        } ?: throw DomainException.GoogleAuthFailed()

        val payload = token.payload
        if (payload.emailVerified != true) {
            throw DomainException.GoogleAuthFailed()
        }
        val sub = payload.subject?.takeIf { it.isNotBlank() } ?: throw DomainException.GoogleAuthFailed()
        val email = payload.email?.takeIf { it.isNotBlank() } ?: throw DomainException.GoogleAuthFailed()
        return GoogleUser(sub = sub, email = email)
    }
}
