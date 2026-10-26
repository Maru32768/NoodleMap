package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Every image id of the meal record exactly once, in the new display order.
 */
@Serializable
public data class ReorderMealRecordImagesRequest(
  @SerialName("imageIds")
  public val imageIds: List<String>,
)
