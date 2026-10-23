package dev.marulabs.noodlemap.generated.models

import kotlin.Double
import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class AddShopRequest(
  @SerialName("name")
  public val name: String,
  @SerialName("nameKana")
  public val nameKana: String? = null,
  @SerialName("lat")
  public val lat: Double,
  @SerialName("lng")
  public val lng: Double,
  @SerialName("postalCode")
  public val postalCode: String,
  @SerialName("address")
  public val address: String,
  @SerialName("openedAt")
  public val openedAt: String? = null,
  @SerialName("closedAt")
  public val closedAt: String? = null,
  /**
   * Omit (or send a blank string) for a shop entered by hand. Must be unique among shops when set.
   */
  @SerialName("googlePlaceId")
  public val googlePlaceId: String? = null,
  @SerialName("category")
  public val category: CategorySlug,
  @SerialName("tagIds")
  public val tagIds: List<String>,
  /**
   * Omit when not set.
   */
  @SerialName("wishLevel")
  public val wishLevel: String? = null,
  /**
   * At most 10 links, stored in array order. Omit for none.
   */
  @SerialName("links")
  public val links: List<ShopLinkInput>? = null,
)
