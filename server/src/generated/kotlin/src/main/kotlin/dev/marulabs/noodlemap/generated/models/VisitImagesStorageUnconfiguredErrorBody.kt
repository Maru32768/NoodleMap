package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The server has no storage for visit images configured.
 */
@Serializable
public data class VisitImagesStorageUnconfiguredErrorBody(
  @SerialName("type")
  public val type: VisitImagesStorageUnconfiguredErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
)
