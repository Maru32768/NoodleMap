package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Trimmed; blank or omitted clears the caption.
 */
@Serializable
public data class UpdateMealRecordImageRequest(
  @SerialName("caption")
  public val caption: String? = null,
)
