package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class MealRecordImageFieldError(
  /**
   * `file` is the uploaded image part; `imageIds` is the full ordered id list of a reorder.
   */
  @SerialName("field")
  public val `field`: MealRecordImageField,
  @SerialName("type")
  public val type: FieldErrorType,
  @SerialName("message")
  public val message: String? = null,
)
