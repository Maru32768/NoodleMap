package dev.marulabs.noodlemap.generated.models

import kotlin.Boolean
import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class User(
  /**
   * UUID serialized as a string.
   */
  @SerialName("id")
  public val id: String,
  @SerialName("email")
  public val email: String,
  @SerialName("isAdmin")
  public val isAdmin: Boolean,
)
