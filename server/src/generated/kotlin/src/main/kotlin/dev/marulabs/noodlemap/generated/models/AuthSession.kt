package dev.marulabs.noodlemap.generated.models

import kotlin.Boolean
import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A signed-in session (device) of the current user. `id` is not the session token.
 */
@Serializable
public data class AuthSession(
  /**
   * UUID serialized as a string.
   */
  @SerialName("id")
  public val id: String,
  @SerialName("userAgent")
  public val userAgent: String? = null,
  /**
   * Login time, ISO 8601 UTC.
   */
  @SerialName("createdAt")
  public val createdAt: String,
  /**
   * Approximate last use (expiry minus TTL; the expiry slides at most every 12 hours), ISO 8601
   * UTC.
   */
  @SerialName("lastUsedAt")
  public val lastUsedAt: String,
  /**
   * True for the session that made this request.
   */
  @SerialName("current")
  public val current: Boolean,
)
