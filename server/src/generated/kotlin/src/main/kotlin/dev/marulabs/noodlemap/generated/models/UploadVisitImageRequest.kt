package dev.marulabs.noodlemap.generated.models

import kotlin.ByteArray
import kotlinx.serialization.Contextual
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public data class UploadVisitImageRequest(
  @Contextual
  @SerialName("file")
  public val `file`: ByteArray,
)
