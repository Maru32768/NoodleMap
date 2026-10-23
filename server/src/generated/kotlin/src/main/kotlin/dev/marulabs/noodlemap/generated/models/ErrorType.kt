package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class ErrorType(
  public val `value`: String,
) {
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
  @SerialName("shop_has_visit_logs")
  SHOP_HAS_VISIT_LOGS("shop_has_visit_logs"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, ErrorType> = entries.associateBy(ErrorType::value)

    public fun fromValue(`value`: String): ErrorType? = mapping[value]
  }
}
