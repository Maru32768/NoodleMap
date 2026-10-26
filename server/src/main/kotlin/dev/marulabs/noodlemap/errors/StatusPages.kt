package dev.marulabs.noodlemap.errors

import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import org.slf4j.LoggerFactory

private val log = LoggerFactory.getLogger("StatusPages")

/**
 * Central error rendering. Any [DomainException] is serialized from the data it carries.
 * A malformed request body or path parameter is a generic `invalid_request`. Anything else
 * is logged internally and surfaced as a generic `internal_error` — never
 * leaking internal exception strings (server/CLAUDE.md error policy).
 */
fun Application.installStatusPages() {
    install(StatusPages) {
        exception<DomainException> { call, cause ->
            // Server faults (5xx) are worth logging with the cause; client faults are not. A missing
            // Places key and missing image storage are expected config (warned at startup) and a busy image
            // upload is load shedding, not faults.
            if (cause.status.value >= 500 && cause !is DomainException.GooglePlacesNotConfigured &&
                cause !is DomainException.MealRecordImageProcessingBusy && cause !is DomainException.MealRecordImagesStorageUnconfigured &&
                cause !is DomainException.RequestBodyBusy && cause !is DomainException.BackupBusy
            ) {
                log.error("domain error: ${cause.type}", cause)
            }
            call.respond(cause.status, cause.toBody())
        }
        // Malformed/invalid request bodies (kotlinx.serialization, missing fields, bad
        // path params) → generic invalid_request, matching Gin's BindJSON behavior.
        exception<io.ktor.server.plugins.BadRequestException> { call, _ ->
            call.respond(
                io.ktor.http.HttpStatusCode.BadRequest,
                ErrorBody(type = ErrorType.INVALID_REQUEST, message = "invalid request"),
            )
        }
        exception<kotlinx.serialization.SerializationException> { call, _ ->
            call.respond(
                io.ktor.http.HttpStatusCode.BadRequest,
                ErrorBody(type = ErrorType.INVALID_REQUEST, message = "invalid request"),
            )
        }
        exception<Throwable> { call, cause ->
            log.error("unhandled error", cause)
            call.respond(
                io.ktor.http.HttpStatusCode.InternalServerError,
                ErrorBody(type = ErrorType.INTERNAL_ERROR, message = "internal error"),
            )
        }
    }
}
