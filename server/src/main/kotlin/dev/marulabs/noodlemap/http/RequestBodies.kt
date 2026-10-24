package dev.marulabs.noodlemap.http

import dev.marulabs.noodlemap.common.retrySoon
import dev.marulabs.noodlemap.errors.DomainException
import io.ktor.http.content.MultiPartData
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.application.call
import io.ktor.server.application.receiveType
import io.ktor.server.request.ApplicationReceivePipeline
import io.ktor.server.request.contentLength
import io.ktor.util.AttributeKey
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.readRemaining
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.withTimeout
import kotlinx.io.readByteArray

const val JSON_BODY_MAX_BYTES = 256L * 1024
private val BODY_SLOT = AttributeKey<Unit>("request-body-slot")

fun Application.installRequestBodyLimits(maxPending: Int = 8, receiveTimeoutMillis: Long = 10_000) {
    val slots = Semaphore(maxPending)
    intercept(ApplicationCallPipeline.Plugins) {
        try {
            proceed()
        } finally {
            if (call.attributes.contains(BODY_SLOT)) {
                call.attributes.remove(BODY_SLOT)
                slots.release()
            }
        }
    }
    receivePipeline.intercept(ApplicationReceivePipeline.Before) {
        // Multipart has its own authenticated, streaming limit and bitmap admission.
        if (call.receiveType.type == MultiPartData::class) return@intercept
        val channel = subject as? ByteReadChannel ?: return@intercept
        if ((call.request.contentLength() ?: 0) > JSON_BODY_MAX_BYTES) {
            channel.cancel(null)
            throw DomainException.RequestBodyTooLarge()
        }
        if (!slots.tryAcquire()) {
            channel.cancel(null)
            call.retrySoon()
            throw DomainException.RequestBodyBusy()
        }
        call.attributes.put(BODY_SLOT, Unit)
        val bytes = try {
            withTimeout(receiveTimeoutMillis) { channel.readRemaining(JSON_BODY_MAX_BYTES + 1).readByteArray() }
        } catch (e: TimeoutCancellationException) {
            channel.cancel(e)
            throw DomainException.RequestBodyTimeout()
        }
        if (bytes.size > JSON_BODY_MAX_BYTES) {
            channel.cancel(null)
            throw DomainException.RequestBodyTooLarge()
        }
        proceedWith(ByteReadChannel(bytes))
    }
}
