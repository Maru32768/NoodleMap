package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class RequestBodyBusyErrorBodyType(
  public val `value`: String,
) {
  @SerialName("request_body_busy")
  REQUEST_BODY_BUSY("request_body_busy"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, RequestBodyBusyErrorBodyType> =
        entries.associateBy(RequestBodyBusyErrorBodyType::value)

    public fun fromValue(`value`: String): RequestBodyBusyErrorBodyType? = mapping[value]
  }
}
