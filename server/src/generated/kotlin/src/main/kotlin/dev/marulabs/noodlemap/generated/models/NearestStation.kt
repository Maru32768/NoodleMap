package dev.marulabs.noodlemap.generated.models

import kotlin.Int
import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class NearestStation(
  /**
   * Station name without the 駅 suffix, e.g. 渋谷.
   */
  @SerialName("name")
  public val name: String,
  /**
   * Straight-line distance from the shop, in meters.
   */
  @SerialName("distanceMeters")
  public val distanceMeters: Int,
)
