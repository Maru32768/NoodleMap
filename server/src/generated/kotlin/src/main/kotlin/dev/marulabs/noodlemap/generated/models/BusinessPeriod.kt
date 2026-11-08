package dev.marulabs.noodlemap.generated.models

import kotlin.String
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * One time range of a business day. Times are HH:MM in Japan time.
 */
@Serializable
public data class BusinessPeriod(
  /**
   * From 00:00 to 23:59.
   */
  @SerialName("opensAt")
  public val opensAt: String,
  /**
   * After opensAt and at most 24 hours later. Past midnight counts on from 24:00, so 2 a.m. the
   * next morning is 26:00.
   */
  @SerialName("closesAt")
  public val closesAt: String,
)
