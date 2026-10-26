package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class MealRecordBadRequestErrorBodyType(
  public val `value`: String,
) {
  @SerialName("invalid_request")
  INVALID_REQUEST("invalid_request"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, MealRecordBadRequestErrorBodyType> =
        entries.associateBy(MealRecordBadRequestErrorBodyType::value)

    public fun fromValue(`value`: String): MealRecordBadRequestErrorBodyType? = mapping[value]
  }
}
