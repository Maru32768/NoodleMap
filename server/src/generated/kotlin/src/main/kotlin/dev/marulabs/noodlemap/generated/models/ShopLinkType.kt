package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class ShopLinkType(
  public val `value`: String,
) {
  @SerialName("official")
  OFFICIAL("official"),
  @SerialName("twitter")
  TWITTER("twitter"),
  @SerialName("instagram")
  INSTAGRAM("instagram"),
  @SerialName("facebook")
  FACEBOOK("facebook"),
  @SerialName("tabelog")
  TABELOG("tabelog"),
  @SerialName("other")
  OTHER("other"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, ShopLinkType> = entries.associateBy(ShopLinkType::value)

    public fun fromValue(`value`: String): ShopLinkType? = mapping[value]
  }
}
