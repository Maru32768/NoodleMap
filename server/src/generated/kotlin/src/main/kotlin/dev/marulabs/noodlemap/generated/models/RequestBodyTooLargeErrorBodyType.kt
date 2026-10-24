package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class RequestBodyTooLargeErrorBodyType(
  public val `value`: String,
) {
  @SerialName("request_body_too_large")
  REQUEST_BODY_TOO_LARGE("request_body_too_large"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, RequestBodyTooLargeErrorBodyType> =
        entries.associateBy(RequestBodyTooLargeErrorBodyType::value)

    public fun fromValue(`value`: String): RequestBodyTooLargeErrorBodyType? = mapping[value]
  }
}
