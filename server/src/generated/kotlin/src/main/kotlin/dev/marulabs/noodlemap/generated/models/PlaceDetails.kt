package dev.marulabs.noodlemap.generated.models

import kotlin.Boolean
import kotlin.Double
import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class PlaceDetails(
  @SerialName("placeId")
  public val placeId: String,
  @SerialName("name")
  public val name: String,
  @SerialName("postalCode")
  public val postalCode: String,
  /**
   * Formatted address without the leading country name and postal code.
   */
  @SerialName("address")
  public val address: String,
  @SerialName("lat")
  public val lat: Double,
  @SerialName("lng")
  public val lng: Double,
  /**
   * True when Google reports the place as permanently closed.
   */
  @SerialName("closed")
  public val closed: Boolean,
)
