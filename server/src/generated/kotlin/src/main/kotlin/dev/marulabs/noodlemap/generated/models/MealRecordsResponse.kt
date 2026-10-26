package dev.marulabs.noodlemap.generated.models

import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class MealRecordsResponse(
  @SerialName("mealRecords")
  public val mealRecords: List<MealRecord>,
)
