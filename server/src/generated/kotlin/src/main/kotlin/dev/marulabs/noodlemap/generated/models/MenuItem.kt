package dev.marulabs.noodlemap.generated.models

import kotlin.Boolean
import kotlin.Int
import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * One 食べたメニュー of a visit log.
 */
@Serializable
public data class MenuItem(
  @SerialName("name")
  public val name: String,
  /**
   * True for a 限定メニュー.
   */
  @SerialName("isLimited")
  public val isLimited: Boolean,
  /**
   * Price in yen. Absent when not recorded.
   */
  @SerialName("price")
  public val price: Int? = null,
)
