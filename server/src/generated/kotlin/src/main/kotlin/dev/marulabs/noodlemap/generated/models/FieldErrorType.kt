package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class FieldErrorType(
  public val `value`: String,
) {
  @SerialName("required")
  REQUIRED("required"),
  @SerialName("invalid_format")
  INVALID_FORMAT("invalid_format"),
  @SerialName("out_of_range")
  OUT_OF_RANGE("out_of_range"),
  @SerialName("too_long")
  TOO_LONG("too_long"),
  @SerialName("duplicate")
  DUPLICATE("duplicate"),
  @SerialName("unknown")
  UNKNOWN("unknown"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, FieldErrorType> = entries.associateBy(FieldErrorType::value)

    public fun fromValue(`value`: String): FieldErrorType? = mapping[value]
  }
}
