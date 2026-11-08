package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class BusinessHours(
  /**
   * weekly = a fixed 週間スケジュール in days; irregular = 不定休, no schedule.
   */
  @SerialName("kind")
  public val kind: BusinessHoursKind,
  /**
   * For weekly, one row for each weekday mon to sun, then an optional holiday row; without it 祝日
   * follow their weekday. Empty for irregular.
   */
  @SerialName("days")
  public val days: List<BusinessDayHours>,
  /**
   * 補足, at most 500 characters: what the schedule cannot express. Absent when not set.
   */
  @SerialName("note")
  public val note: String? = null,
  /**
   * 確認日 (YYYY-MM-DD): when the hours were last confirmed. Absent when not recorded.
   */
  @SerialName("checkedOn")
  public val checkedOn: String? = null,
)
