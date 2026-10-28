package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class SetRepresentativeMealRecordRequest(
  /**
   * A meal record linked to this shop. Omit to return to automatic selection.
   */
  @SerialName("mealRecordId")
  public val mealRecordId: String? = null,
)
