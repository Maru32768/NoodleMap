package dev.marulabs.noodlemap.generated.models

import kotlin.Boolean
import kotlin.Double
import kotlin.Int
import kotlin.String
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
  @SerialName("menuName")
  public val menuName: String? = null,
  @SerialName("isLimitedMenu")
  public val isLimitedMenu: Boolean,
  /**
   * Price in yen, 0 to 10,000,000.
   */
  @SerialName("price")
  public val price: Int? = null,
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
