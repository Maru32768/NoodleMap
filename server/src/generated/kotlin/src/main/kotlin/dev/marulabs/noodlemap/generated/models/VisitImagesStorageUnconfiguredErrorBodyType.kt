package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class VisitImagesStorageUnconfiguredErrorBodyType(
  public val `value`: String,
) {
  @SerialName("visit_images_storage_unconfigured")
  VISIT_IMAGES_STORAGE_UNCONFIGURED("visit_images_storage_unconfigured"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, VisitImagesStorageUnconfiguredErrorBodyType> =
        entries.associateBy(VisitImagesStorageUnconfiguredErrorBodyType::value)

    public fun fromValue(`value`: String): VisitImagesStorageUnconfiguredErrorBodyType? =
        mapping[value]
  }
}
