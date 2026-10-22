package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class GooglePlacesFailedErrorBodyType(
  public val `value`: String,
) {
  @SerialName("google_places_failed")
  GOOGLE_PLACES_FAILED("google_places_failed"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, GooglePlacesFailedErrorBodyType> =
        entries.associateBy(GooglePlacesFailedErrorBodyType::value)

    public fun fromValue(`value`: String): GooglePlacesFailedErrorBodyType? = mapping[value]
  }
}
