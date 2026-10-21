package dev.marulabs.noodlemap.auth

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * Opaque session tokens, ported from Go `auth/utils.go`. The raw token lives only in
 * the cookie; the DB stores its SHA-256 hash. 32 bytes of CSPRNG entropy, base64url
 * without padding.
 */
object SessionTokens {
    private const val TOKEN_BYTES = 32
    private val random = SecureRandom()
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    fun newToken(): String {
        val raw = ByteArray(TOKEN_BYTES)
        random.nextBytes(raw)
        return encoder.encodeToString(raw)
    }

    fun hash(token: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(token.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}
