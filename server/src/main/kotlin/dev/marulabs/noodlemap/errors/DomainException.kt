package dev.marulabs.noodlemap.errors

import io.ktor.http.HttpStatusCode
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Machine-readable error discriminator. Values mirror TypeSpec `ErrorType`. */
@Serializable
enum class ErrorType {
    @SerialName("invalid_request") INVALID_REQUEST,
    @SerialName("authentication_required") AUTHENTICATION_REQUIRED,
    @SerialName("permission_denied") PERMISSION_DENIED,
    @SerialName("google_auth_failed") GOOGLE_AUTH_FAILED,
    @SerialName("session_creation_failed") SESSION_CREATION_FAILED,
    @SerialName("internal_error") INTERNAL_ERROR,
}

/** Field-level error kind. Values mirror TypeSpec `FieldErrorType`. */
@Serializable
enum class FieldErrorType {
    @SerialName("required") REQUIRED,
    @SerialName("invalid_format") INVALID_FORMAT,
    @SerialName("out_of_range") OUT_OF_RANGE,
    @SerialName("too_long") TOO_LONG,
    @SerialName("duplicate") DUPLICATE,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class FieldError(
    val field: String,
    val type: FieldErrorType,
    val message: String? = null,
)

/**
 * Wire body for all error responses. Matches the JSON the frontend already consumes:
 * `{ type, message?, fieldErrors? }`. This is the single serialization point so the
 * shape cannot drift per endpoint.
 */
@Serializable
data class ErrorBody(
    val type: ErrorType,
    val message: String? = null,
    val fieldErrors: List<FieldError>? = null,
)

/**
 * Base for all expected domain failures. Each subtype owns how it surfaces over HTTP
 * (status + type + field errors), so [dev.marulabs.noodlemap.errors.installStatusPages]
 * can render any of them generically — no per-type `when`, no drift. This replaces the
 * three near-identical `switch errors.Is(...)` blocks in the Go handlers.
 */
sealed class DomainException(
    val status: HttpStatusCode,
    val type: ErrorType,
    val publicMessage: String? = null,
    val fieldErrors: List<FieldError> = emptyList(),
    cause: Throwable? = null,
) : RuntimeException(publicMessage, cause) {

    fun toBody(): ErrorBody = ErrorBody(
        type = type,
        message = publicMessage,
        fieldErrors = fieldErrors.ifEmpty { null },
    )

    class AuthenticationRequired :
        DomainException(HttpStatusCode.Unauthorized, ErrorType.AUTHENTICATION_REQUIRED, "authentication required")

    class PermissionDenied :
        DomainException(HttpStatusCode.Forbidden, ErrorType.PERMISSION_DENIED, "permission denied")

    class InvalidRequest(message: String = "invalid request") :
        DomainException(HttpStatusCode.BadRequest, ErrorType.INVALID_REQUEST, message)

    class InvalidRequestWithFields(message: String, fields: List<FieldError>) :
        DomainException(HttpStatusCode.BadRequest, ErrorType.INVALID_REQUEST, message, fields)

    class GoogleAuthFailed(cause: Throwable? = null) :
        DomainException(HttpStatusCode.BadRequest, ErrorType.GOOGLE_AUTH_FAILED, "failed to authenticate with Google", cause = cause)

    class SessionCreationFailed(cause: Throwable? = null) :
        DomainException(HttpStatusCode.InternalServerError, ErrorType.SESSION_CREATION_FAILED, "failed to create session", cause = cause)

    // --- Domain-specific 400s ported from shops/handler.go ---

    class DuplicateTagSlug :
        DomainException(
            HttpStatusCode.BadRequest, ErrorType.INVALID_REQUEST, "duplicate slug",
            listOf(FieldError("slug", FieldErrorType.DUPLICATE)),
        )

    class DuplicateGooglePlaceId :
        DomainException(
            HttpStatusCode.BadRequest, ErrorType.INVALID_REQUEST, "duplicate google place id",
            listOf(FieldError("googlePlaceId", FieldErrorType.DUPLICATE)),
        )

    class InvalidShopTagIds :
        DomainException(
            HttpStatusCode.BadRequest, ErrorType.INVALID_REQUEST, "invalid tag ids",
            listOf(FieldError("tagIds", FieldErrorType.UNKNOWN)),
        )

    class InvalidTagCommand :
        DomainException(HttpStatusCode.BadRequest, ErrorType.INVALID_REQUEST, "invalid tag")
}
