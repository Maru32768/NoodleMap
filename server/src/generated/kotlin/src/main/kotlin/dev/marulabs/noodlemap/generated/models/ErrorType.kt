package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class ErrorType(
  public val `value`: String,
) {
  @SerialName("request_body_too_large")
  REQUEST_BODY_TOO_LARGE("request_body_too_large"),
  @SerialName("request_body_busy")
  REQUEST_BODY_BUSY("request_body_busy"),
  @SerialName("request_body_timeout")
  REQUEST_BODY_TIMEOUT("request_body_timeout"),
  @SerialName("backup_busy")
  BACKUP_BUSY("backup_busy"),
  @SerialName("invalid_request")
  INVALID_REQUEST("invalid_request"),
  @SerialName("authentication_required")
  AUTHENTICATION_REQUIRED("authentication_required"),
  @SerialName("permission_denied")
  PERMISSION_DENIED("permission_denied"),
  @SerialName("google_auth_failed")
  GOOGLE_AUTH_FAILED("google_auth_failed"),
  @SerialName("session_creation_failed")
  SESSION_CREATION_FAILED("session_creation_failed"),
  @SerialName("not_found")
  NOT_FOUND("not_found"),
  @SerialName("internal_error")
  INTERNAL_ERROR("internal_error"),
  @SerialName("google_places_not_configured")
  GOOGLE_PLACES_NOT_CONFIGURED("google_places_not_configured"),
  @SerialName("google_places_failed")
  GOOGLE_PLACES_FAILED("google_places_failed"),
  @SerialName("shop_has_meal_records")
  SHOP_HAS_MEAL_RECORDS("shop_has_meal_records"),
  @SerialName("meal_record_image_limit_reached")
  MEAL_RECORD_IMAGE_LIMIT_REACHED("meal_record_image_limit_reached"),
  @SerialName("meal_record_image_processing_busy")
  MEAL_RECORD_IMAGE_PROCESSING_BUSY("meal_record_image_processing_busy"),
  @SerialName("meal_record_images_storage_unconfigured")
  MEAL_RECORD_IMAGES_STORAGE_UNCONFIGURED("meal_record_images_storage_unconfigured"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, ErrorType> = entries.associateBy(ErrorType::value)

    public fun fromValue(`value`: String): ErrorType? = mapping[value]
  }
}
