package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class ShopHasVisitLogsErrorBodyType(
  public val `value`: String,
) {
  @SerialName("shop_has_visit_logs")
  SHOP_HAS_VISIT_LOGS("shop_has_visit_logs"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, ShopHasVisitLogsErrorBodyType> =
        entries.associateBy(ShopHasVisitLogsErrorBodyType::value)

    public fun fromValue(`value`: String): ShopHasVisitLogsErrorBodyType? = mapping[value]
  }
}
