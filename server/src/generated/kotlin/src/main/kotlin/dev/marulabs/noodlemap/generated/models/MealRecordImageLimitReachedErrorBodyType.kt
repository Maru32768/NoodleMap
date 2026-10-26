package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class MealRecordImageLimitReachedErrorBodyType(
  public val `value`: String,
) {
  @SerialName("meal_record_image_limit_reached")
  MEAL_RECORD_IMAGE_LIMIT_REACHED("meal_record_image_limit_reached"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, MealRecordImageLimitReachedErrorBodyType> =
        entries.associateBy(MealRecordImageLimitReachedErrorBodyType::value)

    public fun fromValue(`value`: String): MealRecordImageLimitReachedErrorBodyType? =
        mapping[value]
  }
}
