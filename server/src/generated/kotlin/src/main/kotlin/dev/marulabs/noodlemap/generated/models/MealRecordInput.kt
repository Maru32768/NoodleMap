package dev.marulabs.noodlemap.generated.models

import kotlin.Double
import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A meal record as written by the admin. Strings are trimmed and a blank string means not set.
 * On update every field is replaced, so an omitted field is cleared.
 */
@Serializable
public data class MealRecordInput(
  /**
   * 提供店舗 in display order. May be empty only when venueName is set, so the record stays reachable
   * from its venue.
   */
  @SerialName("shopIds")
  public val shopIds: List<String>,
  /**
   * ISO 8601 calendar date (YYYY-MM-DD), no later than tomorrow. Omit when unknown.
   */
  @SerialName("eatenOn")
  public val eatenOn: String? = null,
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
  /**
   * Shops among shopIds whose own お気に入り度 is set to this rate on save. Ignored when rate is omitted.
   */
  @SerialName("rateShopIds")
  public val rateShopIds: List<String>? = null,
  @SerialName("venueName")
  public val venueName: String? = null,
  @SerialName("publicNote")
  public val publicNote: String? = null,
  @SerialName("privateNote")
  public val privateNote: String? = null,
)
