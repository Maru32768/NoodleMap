package dev.marulabs.noodlemap.generated.models

import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class SaveTagsRequest(
  @SerialName("tags")
  public val tags: List<TagInput>,
)
