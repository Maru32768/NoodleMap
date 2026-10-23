package dev.marulabs.noodlemap.generated.models

import kotlin.collections.List
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class VisitLogsResponse(
  @SerialName("visits")
  public val visits: List<VisitLog>,
)
