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
  @SerialName("googlePlaceId")
  public val googlePlaceId: String,
  @SerialName("category")
  public val category: CategorySlug,
  @SerialName("eaten")
  public val eaten: Boolean,
  @SerialName("rate")
  public val rate: Double,
  @SerialName("tagIds")
  public val tagIds: List<String>,
)
