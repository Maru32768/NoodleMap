package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The Google Places API request failed or returned an unusable response.
 */
@Serializable
public data class GooglePlacesFailedErrorBody(
  @SerialName("type")
  public val type: GooglePlacesFailedErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
)
