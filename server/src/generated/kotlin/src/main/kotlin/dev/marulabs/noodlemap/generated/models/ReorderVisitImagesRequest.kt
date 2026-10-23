package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Every image id of the visit log exactly once, in the new display order.
 */
@Serializable
public data class ReorderVisitImagesRequest(
  @SerialName("imageIds")
  public val imageIds: List<String>,
)
