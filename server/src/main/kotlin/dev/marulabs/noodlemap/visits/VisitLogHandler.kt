package dev.marulabs.noodlemap.visits

import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.common.JST
import dev.marulabs.noodlemap.db.NoodleMapDb
import dev.marulabs.noodlemap.db.Visit_logs
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthShopsVisitsController
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthVisitsController
import dev.marulabs.noodlemap.generated.controllers.ApiV1ShopsVisitsController
import dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall
import dev.marulabs.noodlemap.generated.models.VisitLog
import dev.marulabs.noodlemap.generated.models.VisitLogInput
import dev.marulabs.noodlemap.generated.models.VisitLogsResponse
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import java.time.LocalDate
import java.util.UUID
import org.sqlite.SQLiteErrorCode
import org.sqlite.SQLiteException

private const val MENU_NAME_MAX_LENGTH = 200
private const val EVENT_NAME_MAX_LENGTH = 100
private const val NOTE_MAX_LENGTH = 2000
private const val PRICE_MAX = 10_000_000
private val ISO_DATE = Regex("""\d{4}-\d{2}-\d{2}""")

private val VISIT_ORDER = latestFirst<Visit_logs>({ it.visited_on }, { it.created_at })

/** A visit log as validated for storage. */
internal data class VisitFields(
    val visitedOn: String?,
    val menuName: String?,
    val isLimitedMenu: Boolean,
    val price: Int?,
    val rate: Double?,
    val eventName: String?,
    val publicNote: String?,
    val privateNote: String?,
)

/**
 * Trims strings (blank = not set) and checks every field, reporting all problems at once. A visit date
 * may be at most tomorrow in [today]'s calendar, leaving room for a client a time zone ahead.
 */
internal fun normalizeVisit(input: VisitLogInput, today: LocalDate): VisitFields {
    val errors = mutableListOf<FieldError>()
    fun text(field: String, raw: String?, max: Int): String? {
        val value = raw?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        if (value.length > max) errors += FieldError(field, FieldErrorType.TOO_LONG)
        return value
    }

    val visitedOn = input.visitedOn?.trim()?.takeIf { it.isNotEmpty() }?.let { raw ->
        val date = raw.takeIf { ISO_DATE.matches(it) }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        when {
            date == null -> null.also { errors += FieldError("visitedOn", FieldErrorType.INVALID_FORMAT) }
            date.isAfter(today.plusDays(1)) -> null.also { errors += FieldError("visitedOn", FieldErrorType.OUT_OF_RANGE) }
            else -> date.toString()
        }
    }
    if (input.price != null && input.price !in 0..PRICE_MAX) errors += FieldError("price", FieldErrorType.OUT_OF_RANGE)
    if (input.rate != null && input.rate !in 0.0..100.0) errors += FieldError("rate", FieldErrorType.OUT_OF_RANGE)
    val fields = VisitFields(
        visitedOn = visitedOn,
        menuName = text("menuName", input.menuName, MENU_NAME_MAX_LENGTH),
        isLimitedMenu = input.isLimitedMenu,
        price = input.price,
        rate = input.rate,
        eventName = text("eventName", input.eventName, EVENT_NAME_MAX_LENGTH),
        publicNote = text("publicNote", input.publicNote, NOTE_MAX_LENGTH),
        privateNote = text("privateNote", input.privateNote, NOTE_MAX_LENGTH),
    )
    if (errors.isNotEmpty()) throw DomainException.InvalidRequestWithFields("invalid visit log", errors)
    return fields
}

/** 訪問ログ endpoints: anyone reads a shop's visits, only the admin writes them or sees 非公開メモ. */
class VisitLogHandler(
    private val db: NoodleMapDb,
    private val sessions: SessionService,
) : ApiV1ShopsVisitsController, ApiV1AuthShopsVisitsController, ApiV1AuthVisitsController {

    override suspend fun listVisitLogs(id: String, call: TypedApplicationCall<VisitLogsResponse>) {
        val shopId = uuidOrNull(id) ?: throw DomainException.NotFound()
        // 非公開メモ is left out on the server for everyone but the admin, not hidden by the client.
        val includePrivateNote = sessions.authenticate(call)?.isAdmin == true
        if (!db.shopsQueries.shopExists(shopId).executeAsOne()) throw DomainException.NotFound()
        val visits = db.visitLogsQueries.findVisitLogsByShopId(shopId).executeAsList()
            .sortedWith(VISIT_ORDER)
            .map { it.toApi(includePrivateNote) }
        call.respondTyped(VisitLogsResponse(visits = visits))
    }

    override suspend fun addVisitLog(id: String, visitLogInput: VisitLogInput, call: TypedApplicationCall<VisitLog>) {
        sessions.requireAdmin(call)
        val shopId = uuidOrNull(id) ?: throw DomainException.NotFound()
        val v = normalizeVisit(visitLogInput, LocalDate.now(JST))
        val visitId = UUID.randomUUID()
        try {
            db.visitLogsQueries.insertVisitLog(
                visitId, shopId, v.visitedOn, v.menuName, v.isLimitedMenu, v.price?.toLong(), v.rate,
                v.eventName, v.publicNote, v.privateNote,
            )
        } catch (e: SQLiteException) {
            // shop_id is the only foreign key, so a violation means the shop does not exist.
            if (e.resultCode == SQLiteErrorCode.SQLITE_CONSTRAINT_FOREIGNKEY) throw DomainException.NotFound()
            throw e
        }
        call.respondTyped(v.toApi(visitId))
    }

    override suspend fun updateVisitLog(visitId: String, visitLogInput: VisitLogInput, call: TypedApplicationCall<VisitLog>) {
        sessions.requireAdmin(call)
        val id = uuidOrNull(visitId) ?: throw DomainException.NotFound()
        val v = normalizeVisit(visitLogInput, LocalDate.now(JST))
        val updated = db.visitLogsQueries.updateVisitLog(
            visitedOn = v.visitedOn, menuName = v.menuName, isLimitedMenu = v.isLimitedMenu, price = v.price?.toLong(),
            rate = v.rate, eventName = v.eventName, publicNote = v.publicNote, privateNote = v.privateNote, id = id,
        ).value
        if (updated == 0L) throw DomainException.NotFound()
        call.respondTyped(v.toApi(id))
    }

    override suspend fun deleteVisitLog(visitId: String, call: ApplicationCall) {
        sessions.requireAdmin(call)
        val id = uuidOrNull(visitId) ?: throw DomainException.NotFound()
        if (db.visitLogsQueries.deleteVisitLog(id).value == 0L) throw DomainException.NotFound()
        call.respond(HttpStatusCode.NoContent)
    }

    private fun uuidOrNull(raw: String): UUID? = runCatching { UUID.fromString(raw) }.getOrNull()

    private fun Visit_logs.toApi(includePrivateNote: Boolean) = VisitLog(
        id = id.toString(), visitedOn = visited_on, menuName = menu_name, isLimitedMenu = is_limited_menu,
        price = price?.toInt(), rate = rate, eventName = event_name, publicNote = public_note,
        privateNote = private_note.takeIf { includePrivateNote },
    )

    // Only the admin writes, so the written log is returned with its 非公開メモ.
    private fun VisitFields.toApi(id: UUID) = VisitLog(
        id = id.toString(), visitedOn = visitedOn, menuName = menuName, isLimitedMenu = isLimitedMenu,
        price = price, rate = rate, eventName = eventName, publicNote = publicNote, privateNote = privateNote,
    )
}
