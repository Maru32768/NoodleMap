package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class NotFoundErrorBodyType(
  public val `value`: String,
) {
  @SerialName("not_found")
  NOT_FOUND("not_found"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, NotFoundErrorBodyType> =
        entries.associateBy(NotFoundErrorBodyType::value)

    public fun fromValue(`value`: String): NotFoundErrorBodyType? = mapping[value]
  }
}
