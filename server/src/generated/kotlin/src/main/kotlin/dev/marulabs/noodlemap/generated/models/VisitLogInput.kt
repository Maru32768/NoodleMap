package dev.marulabs.noodlemap.generated.models

import kotlin.Double
import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A visit log as written by the admin. Strings are trimmed and a blank string means not set.
 * On update every field is replaced, so an omitted field is cleared.
 */
@Serializable
public data class VisitLogInput(
  /**
   * ISO 8601 calendar date (YYYY-MM-DD), no later than tomorrow. Omit when unknown.
   */
  @SerialName("visitedOn")
  public val visitedOn: String? = null,
  /**
   * 食べたメニュー in display order, at most 10. Omit for none.
   */
  @SerialName("menuItems")
  public val menuItems: List<MenuItemInput>? = null,
  /**
   * 0 to 100. Omit when not rated.
   */
  @SerialName("rate")
  public val rate: Double? = null,
  @SerialName("eventName")
  public val eventName: String? = null,
  @SerialName("publicNote")
  public val publicNote: String? = null,
  @SerialName("privateNote")
  public val privateNote: String? = null,
)
