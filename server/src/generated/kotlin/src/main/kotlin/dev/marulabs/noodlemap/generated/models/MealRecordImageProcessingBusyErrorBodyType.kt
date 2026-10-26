package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class MealRecordImageProcessingBusyErrorBodyType(
  public val `value`: String,
) {
  @SerialName("meal_record_image_processing_busy")
  MEAL_RECORD_IMAGE_PROCESSING_BUSY("meal_record_image_processing_busy"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, MealRecordImageProcessingBusyErrorBodyType> =
        entries.associateBy(MealRecordImageProcessingBusyErrorBodyType::value)

    public fun fromValue(`value`: String): MealRecordImageProcessingBusyErrorBodyType? =
        mapping[value]
  }
}
