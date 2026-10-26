package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class ShopHasMealRecordsErrorBodyType(
  public val `value`: String,
) {
  @SerialName("shop_has_meal_records")
  SHOP_HAS_MEAL_RECORDS("shop_has_meal_records"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, ShopHasMealRecordsErrorBodyType> =
        entries.associateBy(ShopHasMealRecordsErrorBodyType::value)

    public fun fromValue(`value`: String): ShopHasMealRecordsErrorBodyType? = mapping[value]
  }
}
