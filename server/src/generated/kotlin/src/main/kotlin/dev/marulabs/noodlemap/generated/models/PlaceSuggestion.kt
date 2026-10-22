package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class PlaceSuggestion(
  @SerialName("placeId")
  public val placeId: String,
  @SerialName("mainText")
  public val mainText: String,
  @SerialName("secondaryText")
  public val secondaryText: String? = null,
)
