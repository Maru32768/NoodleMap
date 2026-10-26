package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class MealRecordBadRequestErrorBody(
  @SerialName("type")
  public val type: MealRecordBadRequestErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
  @SerialName("fieldErrors")
  public val fieldErrors: List<MealRecordFieldError>? = null,
)
