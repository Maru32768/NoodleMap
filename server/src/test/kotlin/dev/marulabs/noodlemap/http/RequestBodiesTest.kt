package dev.marulabs.noodlemap.http

import dev.marulabs.noodlemap.addShopRequest
import dev.marulabs.noodlemap.encode
import dev.marulabs.noodlemap.postJson
import dev.marulabs.noodlemap.testApp
import io.kotest.matchers.shouldBe
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.contentType
import io.ktor.utils.io.ByteWriteChannel
import io.ktor.utils.io.writeFully
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import org.junit.jupiter.api.Test

class RequestBodiesTest {
    @Test
    fun `oversized unauthenticated JSON is refused before deserialization`() = testApp {
        client.postJson("/api/v1/auth/shops", " ".repeat(JSON_BODY_MAX_BYTES.toInt() + 1)).status shouldBe HttpStatusCode.PayloadTooLarge
        client.postJson("/api/v1/auth/google", " ".repeat(JSON_BODY_MAX_BYTES.toInt() + 1)).status shouldBe HttpStatusCode.PayloadTooLarge
        val multibyte = """{"unknown":"${"麺".repeat(JSON_BODY_MAX_BYTES.toInt() / 2)}"}"""
        client.postJson("/api/v1/auth/shops", multibyte).status shouldBe HttpStatusCode.PayloadTooLarge
        client.postJson("/api/v1/auth/shops", " ".repeat(JSON_BODY_MAX_BYTES.toInt())).status shouldBe HttpStatusCode.BadRequest
    }

    @Test
    fun `unknown-length body is measured and a malformed content type cannot exempt it`() = testApp {
        for (type in listOf(ContentType.Application.Json, ContentType.MultiPart.FormData)) {
            client.post("/api/v1/auth/shops") {
                contentType(type)
                setBody(object : OutgoingContent.WriteChannelContent() {
                    override suspend fun writeTo(channel: ByteWriteChannel) {
                        channel.writeFully(ByteArray(JSON_BODY_MAX_BYTES.toInt() + 1) { 32 })
                    }
                })
            }.status shouldBe HttpStatusCode.PayloadTooLarge
        }
    }

    @Test
    fun `bounded valid and malformed JSON preserve auth and parser behavior and release slots`() = testApp(maxPendingJsonBodies = 1) { t ->
        val admin = t.adminToken()
        repeat(2) {
            client.postJson("/api/v1/auth/shops", "{").status shouldBe HttpStatusCode.BadRequest
            val body = encode(addShopRequest(placeId = "place-$it").copy(name = "麺の店"))
            client.postJson("/api/v1/auth/shops", body).status shouldBe HttpStatusCode.Unauthorized
            client.postJson("/api/v1/auth/shops", body, admin).status shouldBe HttpStatusCode.OK
        }
    }

    @Test
    fun `slow body holds admission and timeout releases it`() = testApp(maxPendingJsonBodies = 1, jsonReceiveTimeoutMillis = 300) {
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        coroutineScope {
            val slow = async {
                client.post("/api/v1/auth/shops") {
                    contentType(ContentType.Application.Json)
                    setBody(object : OutgoingContent.WriteChannelContent() {
                        override suspend fun writeTo(channel: ByteWriteChannel) {
                            channel.writeFully(byteArrayOf(32))
                            channel.flush()
                            started.complete(Unit)
                            release.await()
                        }
                    })
                }
            }
            started.await()
            // The writer starting does not itself prove the server has acquired admission.
            var busy = false
            repeat(100) {
                if (!busy) {
                    busy = client.postJson("/api/v1/auth/shops", "{}").status == HttpStatusCode.ServiceUnavailable
                    if (!busy) kotlinx.coroutines.delay(1)
                }
            }
            busy shouldBe true
            launch { kotlinx.coroutines.delay(500); release.complete(Unit) }
            slow.await().status shouldBe HttpStatusCode.RequestTimeout
            release.complete(Unit)
        }
        client.postJson("/api/v1/auth/shops", "{").status shouldBe HttpStatusCode.BadRequest
    }
}
