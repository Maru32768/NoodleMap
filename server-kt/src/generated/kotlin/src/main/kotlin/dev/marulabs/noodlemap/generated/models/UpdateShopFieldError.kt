package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class UpdateShopFieldError(
  @SerialName("field")
  public val `field`: UpdateShopField,
  @SerialName("type")
  public val type: FieldErrorType,
  @SerialName("message")
  public val message: String? = null,
)
