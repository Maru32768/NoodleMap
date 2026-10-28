package dev.marulabs.noodlemap.mealrecords

import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.common.JST
import dev.marulabs.noodlemap.db.NoodleMapDb
import dev.marulabs.noodlemap.db.Meal_records
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.controllers.ApiV1VenuesController
import dev.marulabs.noodlemap.generated.controllers.ApiV1VenuesMealRecordsController
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthMealRecordsController
import dev.marulabs.noodlemap.generated.controllers.ApiV1ShopsMealRecordsController
import dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall
import dev.marulabs.noodlemap.generated.models.MenuItem
import dev.marulabs.noodlemap.generated.models.MealRecordImage
import dev.marulabs.noodlemap.generated.models.MealRecord
import dev.marulabs.noodlemap.generated.models.MealRecordInput
import dev.marulabs.noodlemap.generated.models.MealRecordsResponse
import dev.marulabs.noodlemap.generated.models.MealRecordShop
import dev.marulabs.noodlemap.generated.models.Venue
import dev.marulabs.noodlemap.generated.models.VenuesResponse
import dev.marulabs.noodlemap.generated.models.VenueMealRecordsResponse
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import java.time.LocalDate
import java.util.UUID
import org.sqlite.SQLiteErrorCode
import org.sqlite.SQLiteException

private const val MENU_NAME_MAX_LENGTH = 200
private const val MENU_ITEMS_MAX = 10
private const val EVENT_NAME_MAX_LENGTH = 100
private const val NOTE_MAX_LENGTH = 2000
private const val PRICE_MAX = 10_000_000
private val ISO_DATE = Regex("""\d{4}-\d{2}-\d{2}""")

private val MEAL_RECORD_ORDER = latestFirst<Meal_records>({ it.eaten_on }, { it.created_at }, { it.id })

/** A meal record as validated for storage. */
internal data class MealRecordFields(
    val shopIds: List<UUID>,
    val eatenOn: String?,
    val menuItems: List<MenuItem>,
    val rate: Double?,
    val venueName: String?,
    val publicNote: String?,
    val privateNote: String?,
)

/** The mealRecord's price: the sum of its menu item prices, or null when no item has one. */
internal fun totalPrice(items: List<MenuItem>): Int? = items.mapNotNull { it.price }.takeIf { it.isNotEmpty() }?.sum()

/**
 * Trims strings (blank = not set) and checks every field, reporting all problems at once. A meal record date
 * may be at most tomorrow in [today]'s calendar, leaving room for a client a time zone ahead.
 */
internal fun normalizeMealRecord(input: MealRecordInput, today: LocalDate): MealRecordFields {
    val errors = mutableListOf<FieldError>()
    val shopIds = input.shopIds.mapNotNull { runCatching { UUID.fromString(it) }.getOrNull() }
    if (input.shopIds.isEmpty()) errors += FieldError("shopIds", FieldErrorType.REQUIRED)
    if (shopIds.size != input.shopIds.size || shopIds.distinct().size != shopIds.size) {
        errors += FieldError("shopIds", FieldErrorType.INVALID_FORMAT)
    }
    fun text(field: String, raw: String?, max: Int): String? {
        val value = raw?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        // Counted in code points, as OpenAPI maxLength counts characters.
        if (value.codePointCount(0, value.length) > max) errors += FieldError(field, FieldErrorType.TOO_LONG)
        return value
    }

    val eatenOn = input.eatenOn?.trim()?.takeIf { it.isNotEmpty() }?.let { raw ->
        val date = raw.takeIf { ISO_DATE.matches(it) }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        when {
            date == null -> null.also { errors += FieldError("eatenOn", FieldErrorType.INVALID_FORMAT) }
            date.isAfter(today.plusDays(1)) -> null.also { errors += FieldError("eatenOn", FieldErrorType.OUT_OF_RANGE) }
            else -> date.toString()
        }
    }
    val menuItems = input.menuItems.orEmpty()
    if (menuItems.size > MENU_ITEMS_MAX) {
        errors += FieldError("menuItems", FieldErrorType.OUT_OF_RANGE, "at most $MENU_ITEMS_MAX menu items")
    }
    // Each item problem is reported on menuItems, the message naming the item.
    val items = menuItems.mapIndexed { i, item ->
        val name = item.name.trim()
        when {
            name.isEmpty() -> errors += FieldError("menuItems", FieldErrorType.REQUIRED, "menuItems[$i].name")
            // A NUL would also cut the name short for SQLite's length() in the CHECK.
            name.any { it.isISOControl() } ->
                errors += FieldError("menuItems", FieldErrorType.INVALID_FORMAT, "menuItems[$i].name")
            name.codePointCount(0, name.length) > MENU_NAME_MAX_LENGTH ->
                errors += FieldError("menuItems", FieldErrorType.TOO_LONG, "menuItems[$i].name")
        }
        if (item.price != null && item.price !in 0..PRICE_MAX) {
            errors += FieldError("menuItems", FieldErrorType.OUT_OF_RANGE, "menuItems[$i].price")
        }
        MenuItem(name = name, isLimited = item.isLimited == true, price = item.price)
    }
    if (input.rate != null && input.rate !in 0.0..100.0) errors += FieldError("rate", FieldErrorType.OUT_OF_RANGE)
    val fields = MealRecordFields(
        shopIds = shopIds,
        eatenOn = eatenOn,
        menuItems = items,
        rate = input.rate,
        venueName = text("venueName", input.venueName, EVENT_NAME_MAX_LENGTH),
        publicNote = text("publicNote", input.publicNote, NOTE_MAX_LENGTH),
        privateNote = text("privateNote", input.privateNote, NOTE_MAX_LENGTH),
    )
    if (errors.isNotEmpty()) throw DomainException.InvalidRequestWithFields("invalid meal record", errors)
    return fields
}

/** 食べた記録 endpoints: anyone reads a shop's mealRecords, only the admin writes them or sees 非公開メモ. */
class MealRecordHandler(
    private val db: NoodleMapDb,
    private val sessions: SessionService,
    private val images: MealRecordImageStore,
) : ApiV1ShopsMealRecordsController, ApiV1AuthMealRecordsController, ApiV1VenuesController, ApiV1VenuesMealRecordsController {

    override suspend fun listMealRecords(id: String, call: TypedApplicationCall<MealRecordsResponse>) {
        val shopId = uuidOrNull(id) ?: throw DomainException.NotFound()
        // 非公開メモ is left out on the server for everyone but the admin, not hidden by the client.
        val includePrivateNote = sessions.authenticate(call)?.isAdmin == true
        if (!db.shopsQueries.shopExists(shopId).executeAsOne()) throw DomainException.NotFound()
        val rows = db.mealRecordsQueries.findMealRecordsByShopId(shopId).executeAsList().sortedWith(MEAL_RECORD_ORDER)
        call.respondTyped(MealRecordsResponse(mealRecords = toApi(rows, includePrivateNote)))
    }

    override suspend fun listVenues(call: TypedApplicationCall<VenuesResponse>) {
        call.respondTyped(VenuesResponse(db.venuesQueries.findVenues().executeAsList().map { Venue(it.id.toString(), it.name) }))
    }

    override suspend fun listVenueMealRecords(venueId: String, call: TypedApplicationCall<VenueMealRecordsResponse>) {
        val id = uuidOrNull(venueId) ?: throw DomainException.NotFound()
        val venue = db.venuesQueries.findVenue(id).executeAsOneOrNull() ?: throw DomainException.NotFound()
        val rows = db.mealRecordsQueries.findMealRecordsByVenueId(id).executeAsList().sortedWith(MEAL_RECORD_ORDER)
        call.respondTyped(VenueMealRecordsResponse(Venue(venue.id.toString(), venue.name), toApi(rows, sessions.authenticate(call)?.isAdmin == true)))
    }

    override suspend fun addMealRecord(mealRecordInput: MealRecordInput, call: TypedApplicationCall<MealRecord>) {
        sessions.requireAdmin(call)
        val v = normalizeMealRecord(mealRecordInput, LocalDate.now(JST))
        val mealRecordId = UUID.randomUUID()
        // The menu items point at the log inserted just before, so a violation means the shop does not exist.
        notFoundOnForeignKeyViolation {
            db.transaction {
                db.mealRecordsQueries.insertMealRecord(mealRecordId, venueId(v.venueName), v.eatenOn, v.rate, v.publicNote, v.privateNote)
                insertShops(mealRecordId, v.shopIds)
                insertMenuItems(mealRecordId, v.menuItems)
            }
        }
        call.respondTyped(toApi(listOf(db.mealRecordsQueries.findMealRecord(mealRecordId).executeAsOne()), true).single())
    }

    override suspend fun updateMealRecord(mealRecordId: String, mealRecordInput: MealRecordInput, call: TypedApplicationCall<MealRecord>) {
        sessions.requireAdmin(call)
        val id = uuidOrNull(mealRecordId) ?: throw DomainException.NotFound()
        val v = normalizeMealRecord(mealRecordInput, LocalDate.now(JST))
        // Every field is replaced, the menu items included; they point at this log, checked to exist just before.
        notFoundOnForeignKeyViolation {
            db.transaction {
                val updated = db.mealRecordsQueries.updateMealRecord(
                    eatenOn = v.eatenOn, rate = v.rate, venueId = venueId(v.venueName), publicNote = v.publicNote,
                    privateNote = v.privateNote, id = id,
                ).value
                if (updated == 0L) throw DomainException.NotFound()
                db.mealRecordShopsQueries.deleteRemovedMealRecordShops(id, v.shopIds)
                insertShops(id, v.shopIds)
                db.mealRecordMenuItemsQueries.deleteMealRecordMenuItemsByMealRecordId(id)
                insertMenuItems(id, v.menuItems)
            }
        }
        call.respondTyped(toApi(listOf(db.mealRecordsQueries.findMealRecord(id).executeAsOne()), true).single())
    }

    override suspend fun deleteMealRecord(mealRecordId: String, call: ApplicationCall) {
        sessions.requireAdmin(call)
        val id = uuidOrNull(mealRecordId) ?: throw DomainException.NotFound()
        // The image and menu item rows go with the log; the image objects are removed once that has committed.
        val keys = db.transactionWithResult {
            db.mealRecordShopsQueries.deleteMealRecordShops(id)
            db.mealRecordMenuItemsQueries.deleteMealRecordMenuItemsByMealRecordId(id)
            val keys = db.mealRecordImagesQueries.deleteMealRecordImagesByMealRecordId(id).executeAsList()
            if (db.mealRecordsQueries.deleteMealRecord(id).value == 0L) throw DomainException.NotFound()
            keys
        }
        deleteStoredMealRecordImages(images, keys)
        call.respond(HttpStatusCode.NoContent)
    }

    private fun uuidOrNull(raw: String): UUID? = runCatching { UUID.fromString(raw) }.getOrNull()

    /** Runs [block], turning a foreign key violation (a row it points at is gone) into Not Found. */
    private fun notFoundOnForeignKeyViolation(block: () -> Unit) {
        try {
            block()
        } catch (e: SQLiteException) {
            if (e.resultCode == SQLiteErrorCode.SQLITE_CONSTRAINT_FOREIGNKEY) throw DomainException.NotFound()
            throw e
        }
    }

    private fun insertMenuItems(mealRecordId: UUID, items: List<MenuItem>) {
        items.forEachIndexed { i, item ->
            db.mealRecordMenuItemsQueries.insertMealRecordMenuItem(
                UUID.randomUUID(), mealRecordId, item.name, item.isLimited, item.price?.toLong(), i.toLong(),
            )
        }
    }

    private fun menuItemsByMealRecordIds(mealRecordIds: List<UUID>): Map<UUID, List<MenuItem>> {
        if (mealRecordIds.isEmpty()) return emptyMap()
        return db.mealRecordMenuItemsQueries.findMealRecordMenuItemsByMealRecordIds(mealRecordIds).executeAsList().groupBy(
            keySelector = { it.meal_record_id },
            valueTransform = { MenuItem(name = it.name, isLimited = it.is_limited, price = it.price?.toInt()) },
        )
    }

    private fun venueId(name: String?): UUID? = name?.let {
        db.venuesQueries.insertVenue(UUID.randomUUID(), it)
        db.venuesQueries.findVenueByName(it).executeAsOne().id
    }

    private fun insertShops(id: UUID, shops: List<UUID>) {
        shops.forEachIndexed { index, shop -> db.mealRecordShopsQueries.insertMealRecordShop(id, shop, index.toLong()) }
    }

    private fun toApi(rows: List<Meal_records>, includePrivateNote: Boolean): List<MealRecord> {
        if (rows.isEmpty()) return emptyList()
        val ids = rows.map { it.id }
        val menuItems = menuItemsByMealRecordIds(ids)
        val photos = mealRecordImagesByMealRecordIds(db, images, ids)
        val shops = db.mealRecordShopsQueries.findShopsByMealRecordIds(ids).executeAsList().groupBy(
            { it.meal_record_id }, { MealRecordShop(it.id.toString(), it.name) },
        )
        val venues = db.venuesQueries.findVenues().executeAsList().associateBy { it.id }
        return rows.map { row ->
            val items = menuItems[row.id].orEmpty()
            MealRecord(
                id = row.id.toString(), shops = shops[row.id].orEmpty(),
                venue = venues[row.venue_id]?.let { Venue(it.id.toString(), it.name) },
                eatenOn = row.eaten_on, menuItems = items, totalPrice = totalPrice(items), rate = row.rate,
                publicNote = row.public_note, privateNote = row.private_note.takeIf { includePrivateNote },
                images = photos[row.id].orEmpty(),
            )
        }
    }
}
