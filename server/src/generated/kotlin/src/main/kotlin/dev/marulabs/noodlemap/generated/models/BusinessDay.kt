package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

/**
 * The row a schedule is for: a weekday, or holiday for 祝日.
 */
public enum class BusinessDay(
  public val `value`: String,
) {
  @SerialName("mon")
  MON("mon"),
  @SerialName("tue")
  TUE("tue"),
  @SerialName("wed")
  WED("wed"),
  @SerialName("thu")
  THU("thu"),
  @SerialName("fri")
  FRI("fri"),
  @SerialName("sat")
  SAT("sat"),
  @SerialName("sun")
  SUN("sun"),
  @SerialName("holiday")
  HOLIDAY("holiday"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, BusinessDay> = entries.associateBy(BusinessDay::value)

    public fun fromValue(`value`: String): BusinessDay? = mapping[value]
  }
}
