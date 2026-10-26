package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The shop has meal records, so it cannot be deleted.
 */
@Serializable
public data class ShopHasMealRecordsErrorBody(
  @SerialName("type")
  public val type: ShopHasMealRecordsErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
)
