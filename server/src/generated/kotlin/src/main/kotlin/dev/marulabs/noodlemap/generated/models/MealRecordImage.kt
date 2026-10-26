package dev.marulabs.noodlemap.generated.models

import kotlin.Int
import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * One 記録の画像: a JPEG whose long edge is at most 2048 px, already rotated upright.
 */
@Serializable
public data class MealRecordImage(
  /**
   * UUID serialized as a string.
   */
  @SerialName("id")
  public val id: String,
  /**
   * Absolute URL of the JPEG.
   */
  @SerialName("url")
  public val url: String,
  @SerialName("width")
  public val width: Int,
  @SerialName("height")
  public val height: Int,
  @SerialName("caption")
  public val caption: String? = null,
)
