package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class RequestBodyTimeoutErrorBody(
  @SerialName("type")
  public val type: RequestBodyTimeoutErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
)
