package dev.marulabs.noodlemap.auth

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldMatch
import org.junit.jupiter.api.Test

class SessionTokensTest {

    @Test
    fun `tokens are 32 random bytes as unpadded base64url`() {
        val tokens = List(100) { SessionTokens.newToken() }

        tokens.forEach { it shouldMatch Regex("[A-Za-z0-9_-]{43}") }
        tokens.toSet() shouldHaveSize 100
    }

    @Test
    fun `hash is lowercase hex SHA-256`() {
        SessionTokens.hash("abc") shouldBe "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    }
}
