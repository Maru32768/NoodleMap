package dev.marulabs.noodlemap.generated.models

import kotlin.Double
import kotlin.Int
import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * One 訪問ログ. Visit logs are listed newest first: by visitedOn, those without one last, then by
 * creation.
 */
@Serializable
public data class VisitLog(
  /**
   * UUID serialized as a string.
   */
  @SerialName("id")
  public val id: String,
  /**
   * Visit date as an ISO 8601 calendar date (YYYY-MM-DD). Absent when unknown.
   */
  @SerialName("visitedOn")
  public val visitedOn: String? = null,
  /**
   * 食べたメニュー in display order.
   */
  @SerialName("menuItems")
  public val menuItems: List<MenuItem>,
  /**
   * Derived on the server: the sum of the menu item prices. Absent when no item has a price.
   */
  @SerialName("totalPrice")
  public val totalPrice: Int? = null,
  /**
   * 0 to 100. Absent when the visit is not rated.
   */
  @SerialName("rate")
  public val rate: Double? = null,
  /**
   * 催事 (department store fair, ramen festival, ...) where the shop was visited.
   */
  @SerialName("eventName")
  public val eventName: String? = null,
  @SerialName("publicNote")
  public val publicNote: String? = null,
  /**
   * Only in responses to the admin; omitted for everyone else.
   */
  @SerialName("privateNote")
  public val privateNote: String? = null,
  /**
   * The visit's images in display order; the first one represents the visit.
   */
  @SerialName("images")
  public val images: List<VisitImage>,
)
