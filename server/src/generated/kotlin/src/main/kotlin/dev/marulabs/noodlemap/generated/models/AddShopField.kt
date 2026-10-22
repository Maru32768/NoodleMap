package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class AddShopField(
  public val `value`: String,
) {
  @SerialName("name")
  NAME("name"),
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
  @SerialName("tagIds")
  TAG_IDS("tagIds"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, AddShopField> = entries.associateBy(AddShopField::value)

    public fun fromValue(`value`: String): AddShopField? = mapping[value]
  }
}
