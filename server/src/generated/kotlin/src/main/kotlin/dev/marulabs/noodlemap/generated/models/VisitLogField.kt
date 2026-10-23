package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

/**
 * `menuItems` covers the list and each item; the message names the item (`menuItems[0].name`).
 */
public enum class VisitLogField(
  public val `value`: String,
) {
  @SerialName("visitedOn")
  VISITED_ON("visitedOn"),
  @SerialName("menuItems")
  MENU_ITEMS("menuItems"),
  @SerialName("rate")
  RATE("rate"),
  @SerialName("eventName")
  EVENT_NAME("eventName"),
  @SerialName("publicNote")
  PUBLIC_NOTE("publicNote"),
  @SerialName("privateNote")
  PRIVATE_NOTE("privateNote"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, VisitLogField> = entries.associateBy(VisitLogField::value)

    public fun fromValue(`value`: String): VisitLogField? = mapping[value]
  }
}
