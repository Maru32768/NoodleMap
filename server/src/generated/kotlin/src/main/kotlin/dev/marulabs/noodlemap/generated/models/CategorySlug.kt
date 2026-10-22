package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class CategorySlug(
  public val `value`: String,
) {
  @SerialName("ramen")
  RAMEN("ramen"),
  @SerialName("udon")
  UDON("udon"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, CategorySlug> = entries.associateBy(CategorySlug::value)

    public fun fromValue(`value`: String): CategorySlug? = mapping[value]
  }
}
