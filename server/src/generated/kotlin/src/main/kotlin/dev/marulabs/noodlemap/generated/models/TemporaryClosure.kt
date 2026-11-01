package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class TemporaryClosure(
  /**
   * First day of the closure (YYYY-MM-DD).
   */
  @SerialName("startsOn")
  public val startsOn: String,
  /**
   * Day the shop opens again (YYYY-MM-DD), after startsOn. Absent when not decided.
   */
  @SerialName("reopensOn")
  public val reopensOn: String? = null,
)
