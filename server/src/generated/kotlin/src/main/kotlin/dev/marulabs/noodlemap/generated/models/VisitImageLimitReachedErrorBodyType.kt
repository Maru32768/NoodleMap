package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class VisitImageLimitReachedErrorBodyType(
  public val `value`: String,
) {
  @SerialName("visit_image_limit_reached")
  VISIT_IMAGE_LIMIT_REACHED("visit_image_limit_reached"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, VisitImageLimitReachedErrorBodyType> =
        entries.associateBy(VisitImageLimitReachedErrorBodyType::value)

    public fun fromValue(`value`: String): VisitImageLimitReachedErrorBodyType? = mapping[value]
  }
}
