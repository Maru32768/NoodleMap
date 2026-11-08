package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A missing kind means 営業時間不明 and clears the stored hours. Otherwise the same shape as
 * BusinessHours; a blank note or checkedOn means not set.
 */
@Serializable
public data class BusinessHoursInput(
  /**
   * weekly = a fixed 週間スケジュール in days; irregular = 不定休, no schedule.
   */
  @SerialName("kind")
  public val kind: BusinessHoursKind? = null,
  @SerialName("days")
  public val days: List<BusinessDayHours>? = null,
  @SerialName("note")
  public val note: String? = null,
  @SerialName("checkedOn")
  public val checkedOn: String? = null,
)
