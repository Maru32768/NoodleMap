package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Too many images are being processed right now; retry shortly.
 */
@Serializable
public data class VisitImageProcessingBusyErrorBody(
  @SerialName("type")
  public val type: VisitImageProcessingBusyErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
)
