package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

/**
 * weekly = a fixed 週間スケジュール in days; irregular = 不定休, no schedule.
 */
public enum class BusinessHoursKind(
  public val `value`: String,
) {
  @SerialName("weekly")
  WEEKLY("weekly"),
  @SerialName("irregular")
  IRREGULAR("irregular"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, BusinessHoursKind> =
        entries.associateBy(BusinessHoursKind::value)

    public fun fromValue(`value`: String): BusinessHoursKind? = mapping[value]
  }
}
