package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class GoogleAuthBadRequestErrorBody(
  @SerialName("type")
  public val type: GoogleAuthBadRequestErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
  @SerialName("fieldErrors")
  public val fieldErrors: List<GoogleAuthFieldError>? = null,
)
