package dev.marulabs.noodlemap.errors

import io.ktor.http.HttpStatusCode
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Machine-readable error discriminator. Values mirror TypeSpec `ErrorType`. */
@Serializable
enum class ErrorType {
    @SerialName("request_body_too_large") REQUEST_BODY_TOO_LARGE,
    @SerialName("request_body_busy") REQUEST_BODY_BUSY,
    @SerialName("request_body_timeout") REQUEST_BODY_TIMEOUT,
    @SerialName("backup_busy") BACKUP_BUSY,
    @SerialName("invalid_request") INVALID_REQUEST,
    @SerialName("authentication_required") AUTHENTICATION_REQUIRED,
    @SerialName("permission_denied") PERMISSION_DENIED,
    @SerialName("google_auth_failed") GOOGLE_AUTH_FAILED,
    @SerialName("session_creation_failed") SESSION_CREATION_FAILED,
    @SerialName("not_found") NOT_FOUND,
    @SerialName("internal_error") INTERNAL_ERROR,
    @SerialName("google_places_not_configured") GOOGLE_PLACES_NOT_CONFIGURED,
    @SerialName("google_places_failed") GOOGLE_PLACES_FAILED,
    @SerialName("shop_has_meal_records") SHOP_HAS_MEAL_RECORD_LOGS,
    @SerialName("meal_record_image_limit_reached") MEAL_RECORD_IMAGE_LIMIT_REACHED,
    @SerialName("meal_record_image_processing_busy") MEAL_RECORD_IMAGE_PROCESSING_BUSY,
    @SerialName("meal_record_images_storage_unconfigured") MEAL_RECORD_IMAGES_STORAGE_UNCONFIGURED,
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

    class RequestBodyTooLarge :
        DomainException(HttpStatusCode.PayloadTooLarge, ErrorType.REQUEST_BODY_TOO_LARGE, "request body exceeds 256 KiB")

    class RequestBodyBusy :
        DomainException(HttpStatusCode.ServiceUnavailable, ErrorType.REQUEST_BODY_BUSY, "too many request bodies are being processed")

    class RequestBodyTimeout :
        DomainException(HttpStatusCode.RequestTimeout, ErrorType.REQUEST_BODY_TIMEOUT, "request body receive timed out")

    class BackupBusy :
        DomainException(HttpStatusCode.ServiceUnavailable, ErrorType.BACKUP_BUSY, "backup already running")

    fun toBody(): ErrorBody = ErrorBody(
        type = type,
        message = publicMessage,
        fieldErrors = fieldErrors.ifEmpty { null },
    )

    class AuthenticationRequired :
        DomainException(HttpStatusCode.Unauthorized, ErrorType.AUTHENTICATION_REQUIRED, "authentication required")

    class PermissionDenied :
        DomainException(HttpStatusCode.Forbidden, ErrorType.PERMISSION_DENIED, "permission denied")

    class NotFound :
        DomainException(HttpStatusCode.NotFound, ErrorType.NOT_FOUND, "not found")

    class InvalidRequest(message: String = "invalid request") :
        DomainException(HttpStatusCode.BadRequest, ErrorType.INVALID_REQUEST, message)

    class InvalidRequestWithFields(message: String, fields: List<FieldError>) :
        DomainException(HttpStatusCode.BadRequest, ErrorType.INVALID_REQUEST, message, fields)

    class GoogleAuthFailed(cause: Throwable? = null) :
        DomainException(HttpStatusCode.BadRequest, ErrorType.GOOGLE_AUTH_FAILED, "failed to authenticate with Google", cause = cause)

    class SessionCreationFailed(cause: Throwable? = null) :
        DomainException(HttpStatusCode.InternalServerError, ErrorType.SESSION_CREATION_FAILED, "failed to create session", cause = cause)

    class GooglePlacesNotConfigured :
        DomainException(HttpStatusCode.ServiceUnavailable, ErrorType.GOOGLE_PLACES_NOT_CONFIGURED, "google places is not configured")

    class GooglePlacesFailed(cause: Throwable? = null) :
        DomainException(HttpStatusCode.BadGateway, ErrorType.GOOGLE_PLACES_FAILED, "google places request failed", cause = cause)

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

    class ShopHasMealRecords :
        DomainException(HttpStatusCode.Conflict, ErrorType.SHOP_HAS_MEAL_RECORD_LOGS, "shop has meal records")

    class MealRecordImageLimitReached :
        DomainException(HttpStatusCode.Conflict, ErrorType.MEAL_RECORD_IMAGE_LIMIT_REACHED, "meal record has the maximum number of images")

    class MealRecordImageProcessingBusy :
        DomainException(HttpStatusCode.ServiceUnavailable, ErrorType.MEAL_RECORD_IMAGE_PROCESSING_BUSY, "too many images are being processed")

    class MealRecordImagesStorageUnconfigured :
        DomainException(HttpStatusCode.ServiceUnavailable, ErrorType.MEAL_RECORD_IMAGES_STORAGE_UNCONFIGURED, "mealRecord image storage is not configured")

    class InvalidTagCommand :
        DomainException(HttpStatusCode.BadRequest, ErrorType.INVALID_REQUEST, "invalid tag")
}
