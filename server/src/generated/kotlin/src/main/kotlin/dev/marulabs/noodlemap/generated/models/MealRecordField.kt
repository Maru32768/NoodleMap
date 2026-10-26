package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

/**
 * `menuItems` covers the list and each item; the message names the item (`menuItems[0].name`).
 */
public enum class MealRecordField(
  public val `value`: String,
) {
  @SerialName("shopIds")
  SHOP_IDS("shopIds"),
  @SerialName("eatenOn")
  EATEN_ON("eatenOn"),
  @SerialName("menuItems")
  MENU_ITEMS("menuItems"),
  @SerialName("rate")
  RATE("rate"),
  @SerialName("venueName")
  VENUE_NAME("venueName"),
  @SerialName("publicNote")
  PUBLIC_NOTE("publicNote"),
  @SerialName("privateNote")
  PRIVATE_NOTE("privateNote"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, MealRecordField> = entries.associateBy(MealRecordField::value)

    public fun fromValue(`value`: String): MealRecordField? = mapping[value]
  }
}
