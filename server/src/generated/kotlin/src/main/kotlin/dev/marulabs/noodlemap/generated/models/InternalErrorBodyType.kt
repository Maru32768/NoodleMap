package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class InternalErrorBodyType(
  public val `value`: String,
) {
  @SerialName("internal_error")
  INTERNAL_ERROR("internal_error"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, InternalErrorBodyType> =
        entries.associateBy(InternalErrorBodyType::value)

    public fun fromValue(`value`: String): InternalErrorBodyType? = mapping[value]
  }
}
