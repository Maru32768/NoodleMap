package dev.marulabs.noodlemap.common

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * Session timestamps. Stored as UTC "yyyy-MM-dd HH:mm:ss" text — lexicographically
 * sortable, so the `expires_at > :now` / `< :staleBefore` comparisons work as string
 * compares. This shares the leading-19-char prefix with the Go/modernc format
 * ("... +0000 UTC"), so existing sessions still validate until they naturally expire.
 */
object SessionTime {
    private val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC)
    fun format(instant: Instant): String = fmt.format(instant)
    fun now(): String = format(Instant.now())

    /**
     * Leniently reads a stored timestamp as UTC: the leading "yyyy-MM-dd HH:mm:ss" (also the
     * prefix of legacy Go values), an ISO `T` separator, or a shorter value such as a bare date
     * (missing parts default to zero). Null when unreadable, so one odd row can't fail a listing.
     */
    fun parseOrNull(stored: String): Instant? {
        val s = stored.trim().replace('T', ' ').take(EPOCH_TEXT.length)
        if (s.length < "yyyy-MM-dd".length) return null
        return runCatching { Instant.from(fmt.parse(s + EPOCH_TEXT.substring(s.length))) }.getOrNull()
    }

    private const val EPOCH_TEXT = "1970-01-01 00:00:00"
}

/**
 * Shop open/close calendar dates (ISO YYYY-MM-DD on the wire).
 *
 * The Go service anchored these at JST midnight inside a DATETIME column; rendered back
 * in JST they are just the date. Any legacy value therefore begins with the JST
 * calendar date, so [decode] takes the first 10 chars and works for both legacy rows
 * and values this service writes. [encode] validates and stores the literal date.
 */
object ShopDate {
    fun encode(date: String?): String? {
        val d = date?.trim().orEmpty()
        if (d.isEmpty()) return null
        return try {
            LocalDate.parse(d).toString() // normalises & validates YYYY-MM-DD
        } catch (_: Exception) {
            null
        }
    }

    fun decode(stored: String?): String? = stored?.takeIf { it.length >= 10 }?.substring(0, 10)
}
