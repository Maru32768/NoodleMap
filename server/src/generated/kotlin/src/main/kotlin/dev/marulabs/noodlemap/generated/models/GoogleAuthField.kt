package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class GoogleAuthField(
  public val `value`: String,
) {
  @SerialName("credential")
  CREDENTIAL("credential"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, GoogleAuthField> = entries.associateBy(GoogleAuthField::value)

    public fun fromValue(`value`: String): GoogleAuthField? = mapping[value]
  }
}
