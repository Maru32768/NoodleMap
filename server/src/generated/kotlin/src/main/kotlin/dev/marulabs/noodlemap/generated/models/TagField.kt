package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class TagField(
  public val `value`: String,
) {
  @SerialName("category")
  CATEGORY("category"),
  @SerialName("label")
  LABEL("label"),
  @SerialName("slug")
  SLUG("slug"),
  @SerialName("color")
  COLOR("color"),
  @SerialName("sortOrder")
  SORT_ORDER("sortOrder"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, TagField> = entries.associateBy(TagField::value)

    public fun fromValue(`value`: String): TagField? = mapping[value]
  }
}
