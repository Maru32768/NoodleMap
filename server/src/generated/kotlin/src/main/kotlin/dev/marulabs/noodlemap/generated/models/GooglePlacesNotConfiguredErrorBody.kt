package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The server has no Google Places API key configured.
 */
@Serializable
public data class GooglePlacesNotConfiguredErrorBody(
  @SerialName("type")
  public val type: GooglePlacesNotConfiguredErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
)
