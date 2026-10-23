package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class VisitLogBadRequestErrorBodyType(
  public val `value`: String,
) {
  @SerialName("invalid_request")
  INVALID_REQUEST("invalid_request"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, VisitLogBadRequestErrorBodyType> =
        entries.associateBy(VisitLogBadRequestErrorBodyType::value)

    public fun fromValue(`value`: String): VisitLogBadRequestErrorBodyType? = mapping[value]
  }
}
