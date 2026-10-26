package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The server has no storage for meal record images configured.
 */
@Serializable
public data class MealRecordImagesStorageUnconfiguredErrorBody(
  @SerialName("type")
  public val type: MealRecordImagesStorageUnconfiguredErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
)
