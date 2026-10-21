package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class GoogleAuthBadRequestErrorBodyType(
  public val `value`: String,
) {
  @SerialName("invalid_request")
  INVALID_REQUEST("invalid_request"),
  @SerialName("google_auth_failed")
  GOOGLE_AUTH_FAILED("google_auth_failed"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, GoogleAuthBadRequestErrorBodyType> =
        entries.associateBy(GoogleAuthBadRequestErrorBodyType::value)

    public fun fromValue(`value`: String): GoogleAuthBadRequestErrorBodyType? = mapping[value]
  }
}
