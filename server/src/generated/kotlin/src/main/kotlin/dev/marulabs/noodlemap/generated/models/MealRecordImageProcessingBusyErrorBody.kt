package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Too many images are being processed right now; retry shortly.
 */
@Serializable
public data class MealRecordImageProcessingBusyErrorBody(
  @SerialName("type")
  public val type: MealRecordImageProcessingBusyErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
)
