package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class Venue(
  /**
   * UUID serialized as a string.
   */
  @SerialName("id")
  public val id: String,
  @SerialName("name")
  public val name: String,
)
