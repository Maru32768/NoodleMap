package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class MealRecordImageBadRequestErrorBody(
  @SerialName("type")
  public val type: MealRecordImageBadRequestErrorBodyType,
  @SerialName("message")
  public val message: String? = null,
  @SerialName("fieldErrors")
  public val fieldErrors: List<MealRecordImageFieldError>? = null,
)
