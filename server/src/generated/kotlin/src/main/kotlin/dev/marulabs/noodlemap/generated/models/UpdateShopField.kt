package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class UpdateShopField(
  public val `value`: String,
) {
  @SerialName("name")
  NAME("name"),
  @SerialName("nameKana")
  NAME_KANA("nameKana"),
  @SerialName("lat")
  LAT("lat"),
  @SerialName("lng")
  LNG("lng"),
  @SerialName("postalCode")
  POSTAL_CODE("postalCode"),
  @SerialName("address")
  ADDRESS("address"),
  @SerialName("openedAt")
  OPENED_AT("openedAt"),
  @SerialName("closedAt")
  CLOSED_AT("closedAt"),
  @SerialName("googlePlaceId")
  GOOGLE_PLACE_ID("googlePlaceId"),
  @SerialName("category")
  CATEGORY("category"),
  @SerialName("eaten")
  EATEN("eaten"),
  @SerialName("rate")
  RATE("rate"),
  @SerialName("tagIds")
  TAG_IDS("tagIds"),
  @SerialName("links")
  LINKS("links"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, UpdateShopField> = entries.associateBy(UpdateShopField::value)

    public fun fromValue(`value`: String): UpdateShopField? = mapping[value]
  }
}
