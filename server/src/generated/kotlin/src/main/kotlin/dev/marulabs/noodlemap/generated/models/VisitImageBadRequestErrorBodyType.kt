package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class VisitImageBadRequestErrorBodyType(
  public val `value`: String,
) {
  @SerialName("invalid_request")
  INVALID_REQUEST("invalid_request"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, VisitImageBadRequestErrorBodyType> =
        entries.associateBy(VisitImageBadRequestErrorBodyType::value)

    public fun fromValue(`value`: String): VisitImageBadRequestErrorBodyType? = mapping[value]
  }
}
