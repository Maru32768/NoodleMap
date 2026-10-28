package dev.marulabs.noodlemap.generated.models

import kotlin.Boolean
import kotlin.Double
import kotlin.Int
import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class Shop(
  /**
   * UUID serialized as a string.
   */
  @SerialName("id")
  public val id: String,
  @SerialName("name")
  public val name: String,
  /**
   * Hiragana reading of the shop name, used for search. Absent when not set.
   */
  @SerialName("nameKana")
  public val nameKana: String? = null,
  @SerialName("lat")
  public val lat: Double,
  @SerialName("lng")
  public val lng: Double,
  /**
   * Opening date as an ISO 8601 calendar date (YYYY-MM-DD). Absent when unknown.
   */
  @SerialName("openedAt")
  public val openedAt: String? = null,
  /**
   * Closing date as an ISO 8601 calendar date (YYYY-MM-DD). Absent when the shop is not closing.
   */
  @SerialName("closedAt")
  public val closedAt: String? = null,
  @SerialName("postalCode")
  public val postalCode: String,
  @SerialName("address")
  public val address: String,
  /**
   * Google Places place id. Absent when the shop was entered by hand.
   */
  @SerialName("googlePlaceId")
  public val googlePlaceId: String? = null,
  /**
   * Derived on the server: true when the shop has at least one meal record. Read-only.
   */
  @SerialName("eaten")
  public val eaten: Boolean,
  /**
   * The shop's own お気に入り度, 0 to 100, set apart from its meal records' rates. Absent when not set.
   */
  @SerialName("rate")
  public val rate: Double? = null,
  /**
   * Derived on the server: true when the shop's rate is 80 or more. Read-only.
   */
  @SerialName("favorite")
  public val favorite: Boolean,
  /**
   * Number of meal records of the shop. Read-only.
   */
  @SerialName("mealRecordCount")
  public val mealRecordCount: Int,
  /**
   * 気になる度. Absent when not set. Kept after the shop is eaten, but only meaningful before.
   */
  @SerialName("wishLevel")
  public val wishLevel: String? = null,
  @SerialName("category")
  public val category: CategorySlug,
  @SerialName("tags")
  public val tags: List<Tag>,
  /**
   * External links (official site, SNS, ...) in display order.
   */
  @SerialName("links")
  public val links: List<ShopLink>,
  /**
   * The selected representative meal record of this shop. Absent for automatic selection.
   */
  @SerialName("representativeMealRecordId")
  public val representativeMealRecordId: String? = null,
  /**
   * First image of the selected representative meal record, falling back to the latest record with
   * images. Absent when none has.
   */
  @SerialName("coverPhotoUrl")
  public val coverPhotoUrl: String? = null,
)
