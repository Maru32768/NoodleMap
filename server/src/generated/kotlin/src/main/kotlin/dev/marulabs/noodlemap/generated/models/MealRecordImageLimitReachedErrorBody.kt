package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The meal record already has the maximum number of images (10).
 */
@Serializable
public data class MealRecordImageLimitReachedErrorBody(
  @SerialName("type")
  public val type: MealRecordImageLimitReachedErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
)
