package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class ShopLink(
  @SerialName("type")
  public val type: ShopLinkType,
  /**
   * Display text. Absent when not set; clients fall back to the type name.
   */
  @SerialName("label")
  public val label: String? = null,
  @SerialName("url")
  public val url: String,
)
