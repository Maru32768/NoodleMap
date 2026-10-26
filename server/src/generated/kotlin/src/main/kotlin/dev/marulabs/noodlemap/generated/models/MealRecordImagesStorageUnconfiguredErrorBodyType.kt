package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class MealRecordImagesStorageUnconfiguredErrorBodyType(
  public val `value`: String,
) {
  @SerialName("meal_record_images_storage_unconfigured")
  MEAL_RECORD_IMAGES_STORAGE_UNCONFIGURED("meal_record_images_storage_unconfigured"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, MealRecordImagesStorageUnconfiguredErrorBodyType> =
        entries.associateBy(MealRecordImagesStorageUnconfiguredErrorBodyType::value)

    public fun fromValue(`value`: String): MealRecordImagesStorageUnconfiguredErrorBodyType? =
        mapping[value]
  }
}
