package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class SessionCreationFailedErrorBodyType(
  public val `value`: String,
) {
  @SerialName("session_creation_failed")
  SESSION_CREATION_FAILED("session_creation_failed"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, SessionCreationFailedErrorBodyType> =
        entries.associateBy(SessionCreationFailedErrorBodyType::value)

    public fun fromValue(`value`: String): SessionCreationFailedErrorBodyType? = mapping[value]
  }
}
