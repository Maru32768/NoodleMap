package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

/**
 * `file` is the uploaded image part; `imageIds` is the full ordered id list of a reorder.
 */
public enum class VisitImageField(
  public val `value`: String,
) {
  @SerialName("file")
  FILE("file"),
  @SerialName("caption")
  CAPTION("caption"),
  @SerialName("imageIds")
  IMAGE_IDS("imageIds"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, VisitImageField> = entries.associateBy(VisitImageField::value)

    public fun fromValue(`value`: String): VisitImageField? = mapping[value]
  }
}
