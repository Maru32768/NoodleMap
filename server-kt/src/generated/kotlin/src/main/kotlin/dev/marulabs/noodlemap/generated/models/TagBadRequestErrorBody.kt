package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class TagBadRequestErrorBody(
  @SerialName("type")
  public val type: TagBadRequestErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
  @SerialName("fieldErrors")
  public val fieldErrors: List<TagFieldError>? = null,
)
