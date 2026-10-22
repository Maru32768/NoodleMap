package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class GooglePlacesNotConfiguredErrorBodyType(
  public val `value`: String,
) {
  @SerialName("google_places_not_configured")
  GOOGLE_PLACES_NOT_CONFIGURED("google_places_not_configured"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, GooglePlacesNotConfiguredErrorBodyType> =
        entries.associateBy(GooglePlacesNotConfiguredErrorBodyType::value)

    public fun fromValue(`value`: String): GooglePlacesNotConfiguredErrorBodyType? = mapping[value]
  }
}
