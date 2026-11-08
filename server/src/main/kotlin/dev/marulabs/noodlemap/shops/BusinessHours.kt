package dev.marulabs.noodlemap.shops

import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.models.BusinessDay
import dev.marulabs.noodlemap.generated.models.BusinessDayHours
import dev.marulabs.noodlemap.generated.models.BusinessHours
import dev.marulabs.noodlemap.generated.models.BusinessHoursInput
import dev.marulabs.noodlemap.generated.models.BusinessHoursKind
import java.time.LocalDate
import kotlinx.serialization.json.Json

private const val NOTE_MAX_LENGTH = 500
private const val PERIODS_MAX = 4
private const val DAY_MINUTES = 24 * 60
private val TIME = Regex("^([0-9]{2}):([0-5][0-9])$")
private val WEEKDAYS = BusinessDay.entries - BusinessDay.HOLIDAY

/** `shops.business_hours` holds the API's [BusinessHours] as JSON, written only after [normalizeBusinessHours]. */
internal object BusinessHoursColumn {
    // A key written by a newer build must not break the shop list after a rollback.
    private val json = Json { ignoreUnknownKeys = true }

    fun encode(hours: BusinessHours?): String? = hours?.let { json.encodeToString(it) }

    fun decode(raw: String?): BusinessHours? = raw?.let { json.decodeFromString<BusinessHours>(it) }
}

/** Null for 営業時間不明 (no kind). Days come back in mon..sun, holiday order; blank note and checkedOn mean not set. */
internal fun normalizeBusinessHours(input: BusinessHoursInput): BusinessHours? {
    val kind = input.kind ?: return null
    val note = input.note?.trim()?.takeIf { it.isNotEmpty() }
    if (note != null && note.length > NOTE_MAX_LENGTH) invalid("business hours note too long", FieldErrorType.TOO_LONG)
    val checkedOn = input.checkedOn?.trim()?.takeIf { it.isNotEmpty() }?.let {
        runCatching { LocalDate.parse(it) }.getOrNull()?.toString()
            ?: invalid("invalid business hours checked date", FieldErrorType.INVALID_FORMAT)
    }
    val days = input.days.orEmpty()
    val normalized = when (kind) {
        BusinessHoursKind.IRREGULAR -> {
            if (days.isNotEmpty()) invalid("irregular business hours with a schedule", FieldErrorType.OUT_OF_RANGE)
            emptyList()
        }
        BusinessHoursKind.WEEKLY -> {
            val byDay = days.groupBy { it.day }
            if (byDay.values.any { it.size > 1 }) invalid("duplicate business day", FieldErrorType.OUT_OF_RANGE)
            if (WEEKDAYS.any { it !in byDay }) invalid("business hours without every weekday", FieldErrorType.REQUIRED)
            BusinessDay.entries.mapNotNull { byDay[it]?.single() }.map(::normalizeDay)
        }
    }
    return BusinessHours(kind = kind, days = normalized, note = note, checkedOn = checkedOn)
}

private fun normalizeDay(day: BusinessDayHours): BusinessDayHours {
    if (day.periods.size > PERIODS_MAX) invalid("too many business periods", FieldErrorType.OUT_OF_RANGE)
    var previousClose = 0
    for (period in day.periods) {
        val opens = minutes(period.opensAt)
        val closes = minutes(period.closesAt)
        if (opens >= DAY_MINUTES) invalid("business period opens after 23:59", FieldErrorType.OUT_OF_RANGE)
        if (closes <= opens || closes > opens + DAY_MINUTES) {
            invalid("business period closes before it opens or a day later", FieldErrorType.OUT_OF_RANGE)
        }
        if (opens < previousClose) invalid("business periods overlap or are out of order", FieldErrorType.OUT_OF_RANGE)
        previousClose = closes
    }
    val weeks = day.closedWeeks?.takeIf { it.isNotEmpty() } ?: return day.copy(closedWeeks = null)
    if (day.day == BusinessDay.HOLIDAY || day.periods.isEmpty()) {
        invalid("closed weeks on a day without hours", FieldErrorType.OUT_OF_RANGE)
    }
    if (weeks.any { it !in 1..5 } || weeks.toSet().size != weeks.size) {
        invalid("closed weeks must be distinct weeks 1 to 5", FieldErrorType.OUT_OF_RANGE)
    }
    return day.copy(closedWeeks = weeks.sorted())
}

private fun minutes(raw: String): Int {
    val (hours, minutes) = TIME.matchEntire(raw)?.destructured
        ?: invalid("invalid business period time", FieldErrorType.INVALID_FORMAT)
    return hours.toInt() * 60 + minutes.toInt()
}

private fun invalid(message: String, type: FieldErrorType): Nothing =
    throw DomainException.InvalidRequestWithFields(message, listOf(FieldError("businessHours", type)))
