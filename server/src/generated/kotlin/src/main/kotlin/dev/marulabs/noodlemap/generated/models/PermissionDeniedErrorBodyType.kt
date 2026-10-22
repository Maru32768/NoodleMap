package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class PermissionDeniedErrorBodyType(
  public val `value`: String,
) {
  @SerialName("permission_denied")
  PERMISSION_DENIED("permission_denied"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, PermissionDeniedErrorBodyType> =
        entries.associateBy(PermissionDeniedErrorBodyType::value)

    public fun fromValue(`value`: String): PermissionDeniedErrorBodyType? = mapping[value]
  }
}
