package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlin.collections.Map
import kotlinx.serialization.SerialName

public enum class BackupBusyErrorBodyType(
  public val `value`: String,
) {
  @SerialName("backup_busy")
  BACKUP_BUSY("backup_busy"),
  ;

  override fun toString(): String = value

  public companion object {
    private val mapping: Map<String, BackupBusyErrorBodyType> =
        entries.associateBy(BackupBusyErrorBodyType::value)

    public fun fromValue(`value`: String): BackupBusyErrorBodyType? = mapping[value]
  }
}
