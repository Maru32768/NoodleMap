package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class AuthenticationRequiredErrorBody(
  @SerialName("type")
  public val type: AuthenticationRequiredErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
)
