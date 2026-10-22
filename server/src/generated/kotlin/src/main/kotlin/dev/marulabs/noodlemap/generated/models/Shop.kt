package dev.marulabs.noodlemap.generated.models

import kotlin.Boolean
import kotlin.Double
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
  @SerialName("googlePlaceId")
  public val googlePlaceId: String,
  @SerialName("eaten")
  public val eaten: Boolean,
  @SerialName("rate")
  public val rate: Double,
  /**
   * Derived on the server: true when the shop is eaten and its rate is 80 or more. Read-only.
   */
  @SerialName("favorite")
  public val favorite: Boolean,
  @SerialName("category")
  public val category: CategorySlug,
  @SerialName("tags")
  public val tags: List<Tag>,
  /**
   * External links (official site, SNS, ...) in display order.
   */
  @SerialName("links")
  public val links: List<ShopLink>,
)
