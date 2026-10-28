package dev.marulabs.noodlemap.generated.models

import kotlin.Double
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class SetShopRateRequest(
  /**
   * 0 to 100. Omit to clear.
   */
  @SerialName("rate")
  public val rate: Double? = null,
)
