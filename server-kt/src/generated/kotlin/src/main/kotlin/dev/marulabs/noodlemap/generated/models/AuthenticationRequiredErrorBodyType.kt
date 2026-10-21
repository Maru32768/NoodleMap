package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class AuthenticationRequiredErrorBodyType(
  public val `value`: String,
) {
  @SerialName("authentication_required")
  AUTHENTICATION_REQUIRED("authentication_required"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, AuthenticationRequiredErrorBodyType> =
        entries.associateBy(AuthenticationRequiredErrorBodyType::value)

    public fun fromValue(`value`: String): AuthenticationRequiredErrorBodyType? = mapping[value]
  }
}
