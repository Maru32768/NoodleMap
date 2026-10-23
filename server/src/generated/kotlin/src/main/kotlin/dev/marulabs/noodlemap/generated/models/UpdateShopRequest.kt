package dev.marulabs.noodlemap.generated.models

import kotlin.Boolean
import kotlin.Double
import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class UpdateShopRequest(
  @SerialName("name")
  public val name: String,
  /**
   * Omit to keep the stored reading (older clients); a blank string clears it.
   */
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
   * Omit to keep the stored place id (older clients); a blank string clears it.
   */
  @SerialName("googlePlaceId")
  public val googlePlaceId: String? = null,
  @SerialName("category")
  public val category: CategorySlug,
  /**
   * Deprecated and ignored by the server: 食べた is derived from visit logs. Older clients still send
   * it.
   */
  @SerialName("eaten")
  public val eaten: Boolean? = null,
  /**
   * Deprecated and ignored by the server: the shop's rate is derived from visit logs. Older clients
   * still send it.
   */
  @SerialName("rate")
  public val rate: Double? = null,
  @SerialName("tagIds")
  public val tagIds: List<String>,
  /**
   * Omit to keep the stored 気になる度 (older clients); null clears it.
   */
  @SerialName("wishLevel")
  public val wishLevel: String? = null,
  /**
   * Omit to keep the stored links (older clients); an array replaces them all, in array order. At
   * most 10.
   */
  @SerialName("links")
  public val links: List<ShopLinkInput>? = null,
)
