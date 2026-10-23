package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class VisitLogFieldError(
  /**
   * `menuItems` covers the list and each item; the message names the item (`menuItems[0].name`).
   */
  @SerialName("field")
  public val `field`: VisitLogField,
  @SerialName("type")
  public val type: FieldErrorType,
  @SerialName("message")
  public val message: String? = null,
)
