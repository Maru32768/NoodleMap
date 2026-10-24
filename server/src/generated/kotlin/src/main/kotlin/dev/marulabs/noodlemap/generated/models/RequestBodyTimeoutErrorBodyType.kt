package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class RequestBodyTimeoutErrorBodyType(
  public val `value`: String,
) {
  @SerialName("request_body_timeout")
  REQUEST_BODY_TIMEOUT("request_body_timeout"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, RequestBodyTimeoutErrorBodyType> =
        entries.associateBy(RequestBodyTimeoutErrorBodyType::value)

    public fun fromValue(`value`: String): RequestBodyTimeoutErrorBodyType? = mapping[value]
  }
}
