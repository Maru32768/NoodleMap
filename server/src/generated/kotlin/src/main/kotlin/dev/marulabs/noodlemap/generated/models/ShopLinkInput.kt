package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * An http(s) URL of at most 2048 characters with an optional label of at most 100 characters.
 */
@Serializable
public data class ShopLinkInput(
  @SerialName("type")
  public val type: ShopLinkType,
  @SerialName("label")
  public val label: String? = null,
  @SerialName("url")
  public val url: String,
)
