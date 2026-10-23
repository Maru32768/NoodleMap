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
   * Derived on the server: true when the shop has at least one visit log. Read-only.
   */
  @SerialName("eaten")
  public val eaten: Boolean,
  /**
   * Derived on the server: the rate of the latest visit log that has one, or 0 when none has.
   * Read-only.
   */
  @SerialName("rate")
  public val rate: Double,
  /**
   * Derived on the server: true when the shop's rate comes from a visit log and is 80 or more.
   * Read-only.
   */
  @SerialName("favorite")
  public val favorite: Boolean,
  /**
   * Number of visit logs of the shop. Read-only.
   */
  @SerialName("visitCount")
  public val visitCount: Int,
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
   * Derived on the server: URL of the first image of the latest visit log that has images. Absent
   * when none has.
   */
  @SerialName("coverPhotoUrl")
  public val coverPhotoUrl: String? = null,
)
