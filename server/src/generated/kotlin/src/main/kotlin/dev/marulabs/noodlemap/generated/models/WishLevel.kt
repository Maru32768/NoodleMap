package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

/**
 * 気になる度 of a shop not eaten yet: low = ちょっと行きたい, medium = 行きたい, high = 絶対行きたい.
 */
public enum class WishLevel(
  public val `value`: String,
) {
  @SerialName("low")
  LOW("low"),
  @SerialName("medium")
  MEDIUM("medium"),
  @SerialName("high")
  HIGH("high"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, WishLevel> = entries.associateBy(WishLevel::value)

    public fun fromValue(`value`: String): WishLevel? = mapping[value]
  }
}
