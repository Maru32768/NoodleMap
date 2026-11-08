package dev.marulabs.noodlemap.generated.models

import kotlin.Int
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class BusinessDayHours(
  /**
   * The row a schedule is for: a weekday, or holiday for 祝日.
   */
  @SerialName("day")
  public val day: BusinessDay,
  /**
   * Time ranges in order, not overlapping, at most 4. Empty on a 定休日.
   */
  @SerialName("periods")
  public val periods: List<BusinessPeriod>,
  /**
   * Weeks of the month (1 to 5, ascending) on which this weekday is closed, e.g. [2, 4] for 第2・第4.
   * Absent when none. Weekdays with periods only.
   */
  @SerialName("closedWeeks")
  public val closedWeeks: List<Int>? = null,
)
