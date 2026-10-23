package dev.marulabs.noodlemap.generated.models

import kotlin.Boolean
import kotlin.Int
import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * One 食べたメニュー as written by the admin. The name is trimmed and must not be blank.
 */
@Serializable
public data class MenuItemInput(
  @SerialName("name")
  public val name: String,
  /**
   * True for a 限定メニュー. Omit for false.
   */
  @SerialName("isLimited")
  public val isLimited: Boolean? = null,
  /**
   * Price in yen, 0 to 10,000,000. Omit when not recorded.
   */
  @SerialName("price")
  public val price: Int? = null,
)
