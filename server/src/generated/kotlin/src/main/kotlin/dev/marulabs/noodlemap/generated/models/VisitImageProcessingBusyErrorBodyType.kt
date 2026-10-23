package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class VisitImageProcessingBusyErrorBodyType(
  public val `value`: String,
) {
  @SerialName("visit_image_processing_busy")
  VISIT_IMAGE_PROCESSING_BUSY("visit_image_processing_busy"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, VisitImageProcessingBusyErrorBodyType> =
        entries.associateBy(VisitImageProcessingBusyErrorBodyType::value)

    public fun fromValue(`value`: String): VisitImageProcessingBusyErrorBodyType? = mapping[value]
  }
}
