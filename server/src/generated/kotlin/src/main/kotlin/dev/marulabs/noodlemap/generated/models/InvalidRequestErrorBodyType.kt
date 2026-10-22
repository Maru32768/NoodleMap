package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class InvalidRequestErrorBodyType(
  public val `value`: String,
) {
  @SerialName("invalid_request")
  INVALID_REQUEST("invalid_request"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, InvalidRequestErrorBodyType> =
        entries.associateBy(InvalidRequestErrorBodyType::value)

    public fun fromValue(`value`: String): InvalidRequestErrorBodyType? = mapping[value]
  }
}
