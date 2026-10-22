package dev.marulabs.noodlemap.generated.models

import kotlin.Int
import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class Tag(
  /**
   * UUID serialized as a string.
   */
  @SerialName("id")
  public val id: String,
  @SerialName("category")
  public val category: CategorySlug? = null,
  @SerialName("label")
  public val label: String,
  @SerialName("slug")
  public val slug: String,
  @SerialName("color")
  public val color: String,
  @SerialName("sortOrder")
  public val sortOrder: Int,
)
