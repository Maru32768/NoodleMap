package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The visit log already has the maximum number of images (10).
 */
@Serializable
public data class VisitImageLimitReachedErrorBody(
  @SerialName("type")
  public val type: VisitImageLimitReachedErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
)
