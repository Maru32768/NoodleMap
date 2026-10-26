package dev.marulabs.noodlemap.generated.models

import kotlin.Double
import kotlin.Int
import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * One 食べた記録. Meal records are listed newest first: by eatenOn, those without one last, then by
 * creation.
 */
@Serializable
public data class MealRecord(
  /**
   * UUID serialized as a string.
   */
  @SerialName("id")
  public val id: String,
  @SerialName("shops")
  public val shops: List<MealRecordShop>,
  @SerialName("venue")
  public val venue: Venue? = null,
  /**
   * Eating date as an ISO 8601 calendar date (YYYY-MM-DD). Absent when unknown.
   */
  @SerialName("eatenOn")
  public val eatenOn: String? = null,
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
   * 0 to 100. Absent when the meal record is not rated.
   */
  @SerialName("rate")
  public val rate: Double? = null,
  @SerialName("publicNote")
  public val publicNote: String? = null,
  /**
   * Only in responses to the admin; omitted for everyone else.
   */
  @SerialName("privateNote")
  public val privateNote: String? = null,
  /**
   * The meal record's images in display order; the first one represents the mealRecord.
   */
  @SerialName("images")
  public val images: List<MealRecordImage>,
)
