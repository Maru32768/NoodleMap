package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A blank or missing startsOn means no 臨時休業. reopensOn needs startsOn and must come after it.
 */
@Serializable
public data class TemporaryClosureInput(
  @SerialName("startsOn")
  public val startsOn: String? = null,
  @SerialName("reopensOn")
  public val reopensOn: String? = null,
)
