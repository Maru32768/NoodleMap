package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The shop has visit logs, so it cannot be deleted.
 */
@Serializable
public data class ShopHasVisitLogsErrorBody(
  @SerialName("type")
  public val type: ShopHasVisitLogsErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
)
