package dev.marulabs.noodlemap.shops

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.common.ShopDate
import dev.marulabs.noodlemap.db.NoodleMapDb
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthShopsController
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthShopsRateController
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthShopsRepresentativeMealRecordController
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthTagsController
import dev.marulabs.noodlemap.generated.controllers.ApiV1ShopsController
import dev.marulabs.noodlemap.generated.controllers.ApiV1TagsController
import dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall
import dev.marulabs.noodlemap.generated.models.AddShopRequest
import dev.marulabs.noodlemap.generated.models.CategorySlug
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.generated.models.ShopLink
import dev.marulabs.noodlemap.generated.models.ShopLinkInput
import dev.marulabs.noodlemap.generated.models.ShopLinkType
import dev.marulabs.noodlemap.generated.models.SaveTagsRequest
import dev.marulabs.noodlemap.generated.models.SetRepresentativeMealRecordRequest
import dev.marulabs.noodlemap.generated.models.SetShopRateRequest
import dev.marulabs.noodlemap.generated.models.ShopsResponse
import dev.marulabs.noodlemap.generated.models.Tag
import dev.marulabs.noodlemap.generated.models.TagsResponse
import dev.marulabs.noodlemap.generated.models.UpdateShopRequest
import dev.marulabs.noodlemap.generated.models.WishLevel
import dev.marulabs.noodlemap.mealrecords.MealRecordImageStore
import dev.marulabs.noodlemap.mealrecords.coverPhotoKeysByShop
import dev.marulabs.noodlemap.mealrecords.mealRecordCountsByShop
import java.net.IDN
import java.util.UUID
import org.sqlite.SQLiteErrorCode
import org.sqlite.SQLiteException

private const val NAME_KANA_MAX_LENGTH = 100
private const val SHOP_LINKS_MAX = 10
private const val SHOP_LINK_URL_MAX_LENGTH = 2048
private const val SHOP_LINK_LABEL_MAX_LENGTH = 100

// WHATWG parses a host whose last label looks numeric (decimal or 0x hex) as IPv4.
private val NUMERIC_LABEL = Regex("^(0x[0-9a-f]*|[0-9]+)$", RegexOption.IGNORE_CASE)
private val HTTP_URL = Regex("^(?i:https?)://([^/?#]*)(.*)$", RegexOption.DOT_MATCHES_ALL)
private const val FORBIDDEN_HOST_CHARS = " #%/:<>?@[\\]^|"

/**
 * Accepts what browsers accept as an http(s) URL with a host (path, query and fragment are free text,
 * IDN and underscore hosts are fine) but rejects other schemes, userinfo, ports other than ASCII 1..65535
 * and numeric-looking hosts that are not a dotted-decimal IPv4 address.
 * Mirrored by `isHttpUrl` in web/src/features/shops/shop-links.ts.
 * shortcut: no IPv6 literal hosts; add them if a shop ever links to one.
 */
internal fun isHttpUrl(url: String): Boolean {
    if (url.any { it.isISOControl() }) return false
    val authority = HTTP_URL.matchEntire(url)?.groupValues?.get(1) ?: return false
    if ('@' in authority) return false
    val colon = authority.lastIndexOf(':')
    val host = if (colon < 0) authority else authority.substring(0, colon)
    val port = if (colon < 0) "" else authority.substring(colon + 1)
    if (port.isNotEmpty() && (!port.all { it in '0'..'9' } || port.toIntOrNull() !in 1..65535)) return false
    if (host.isEmpty()) return false
    val ascii = try {
        IDN.toASCII(host, IDN.ALLOW_UNASSIGNED)
    } catch (_: IllegalArgumentException) {
        return false
    }
    return ascii.isNotEmpty() && ascii.none { it in FORBIDDEN_HOST_CHARS } && isValidIpv4IfNumeric(ascii)
}

private fun isValidIpv4IfNumeric(host: String): Boolean {
    val labels = host.split('.').let { if (it.size > 1 && it.last().isEmpty()) it.dropLast(1) else it }
    if (!NUMERIC_LABEL.matches(labels.last())) return true
    // shortcut: browsers also accept short (1.2) and hex/octal IPv4 forms; extend if a link ever needs one.
    return labels.size == 4 && labels.all { l -> l.length in 1..3 && l.all { it in '0'..'9' } && l.toInt() <= 255 }
}

/** A shop as the public list returns it, with the storage key of its 代表写真 (null when it has none). */
class ShopRecord(val shop: Shop, val coverPhotoKey: String?)

/** Shop and tag endpoints, ported from Go `shops/handler.go`. */
class ShopHandler(
    private val db: NoodleMapDb,
    private val sessions: SessionService,
    private val mealRecordImages: MealRecordImageStore,
) : ApiV1ShopsController, ApiV1TagsController, ApiV1AuthShopsController, ApiV1AuthTagsController,
    ApiV1AuthShopsRepresentativeMealRecordController, ApiV1AuthShopsRateController {

    // --- Public reads ---

    override suspend fun listShops(call: TypedApplicationCall<ShopsResponse>) {
        call.respondTyped(ShopsResponse(shops = loadShops().map { it.shop }))
    }

    override suspend fun listTags(call: TypedApplicationCall<TagsResponse>) {
        call.respondTyped(TagsResponse(tags = loadAllTags()))
    }

    // --- Admin writes ---

    override suspend fun setRepresentativeMealRecord(
        id: String,
        setRepresentativeMealRecordRequest: SetRepresentativeMealRecordRequest,
        call: ApplicationCall,
    ) {
        sessions.requireAdmin(call)
        val shopId = runCatching { UUID.fromString(id) }.getOrNull() ?: throw DomainException.InvalidRequest()
        val recordId = setRepresentativeMealRecordRequest.mealRecordId?.let {
            runCatching { UUID.fromString(it) }.getOrNull() ?: throw DomainException.InvalidRequest()
        }
        db.transaction {
            // Acquire SQLite's write lock before validation. A rejected selection rolls this deletion back.
            db.shopRepresentativeMealRecordsQueries.deleteRepresentativeMealRecord(shopId)
            if (!db.shopsQueries.shopExists(shopId).executeAsOne()) throw DomainException.NotFound()
            if (recordId != null) {
                if (!db.mealRecordShopsQueries.mealRecordShopExists(recordId, shopId).executeAsOne()) {
                    throw DomainException.NotFound()
                }
                db.shopRepresentativeMealRecordsQueries.setRepresentativeMealRecord(shopId, recordId)
            }
        }
        call.respond(HttpStatusCode.NoContent)
    }

    override suspend fun setShopRate(id: String, setShopRateRequest: SetShopRateRequest, call: ApplicationCall) {
        sessions.requireAdmin(call)
        val shopId = runCatching { UUID.fromString(id) }.getOrNull() ?: throw DomainException.InvalidRequest()
        val rate = setShopRateRequest.rate
        if (rate != null && rate !in 0.0..100.0) throw DomainException.InvalidRequest()
        if (db.shopsQueries.setShopRate(rate, shopId).value == 0L) throw DomainException.NotFound()
        call.respond(HttpStatusCode.NoContent)
    }

    override suspend fun saveTags(saveTagsRequest: SaveTagsRequest, call: TypedApplicationCall<TagsResponse>) {
        sessions.requireAdmin(call)

        val seenSlugs = HashSet<String>()
        for (t in saveTagsRequest.tags) {
            // Go bound id as uuid.UUID, so a malformed id failed BindJSON with a plain 400.
            if (t.id != null && runCatching { UUID.fromString(t.id) }.isFailure) throw DomainException.InvalidRequest()
            if (t.label.isBlank() || t.slug.isBlank() || t.color.isBlank()) throw DomainException.InvalidTagCommand()
            if (!seenSlugs.add(t.slug)) throw DomainException.DuplicateTagSlug()
        }

        db.transaction {
            val existing = db.tagsQueries.findAllTags().executeAsList()
            val keep = saveTagsRequest.tags.mapNotNull { it.id?.let(UUID::fromString) }.toSet()
            existing.filter { it.id !in keep }.forEach { db.tagsQueries.deleteTag(it.id) }

            for (t in saveTagsRequest.tags) {
                val category = t.category?.value
                if (t.id == null) {
                    db.tagsQueries.insertTag(UUID.randomUUID(), category, t.label, t.slug, t.color, t.sortOrder.toLong())
                } else {
                    db.tagsQueries.updateTag(category, t.label, t.slug, t.color, t.sortOrder.toLong(), UUID.fromString(t.id))
                }
            }
        }

        call.respondTyped(TagsResponse(tags = loadAllTags()))
    }

    override suspend fun addShop(addShopRequest: AddShopRequest, call: TypedApplicationCall<Shop>) {
        sessions.requireAdmin(call)

        val shopId = UUID.randomUUID()
        val req = addShopRequest
        val nameKana = normalizeNameKana(req.nameKana)
        // Blank means "entered by hand": stored as NULL so any number of such shops fit the UNIQUE column.
        val googlePlaceId = req.googlePlaceId?.trim()?.takeIf { it.isNotEmpty() }
        val links = normalizeLinks(req.links.orEmpty())
        val wishLevel = req.wishLevel?.let(::parseWishLevel)
        db.transaction {
            rejectingDuplicatePlaceId {
                db.shopsQueries.insertShop(
                    shopId, req.name, nameKana, req.lat, req.lng, req.postalCode, req.address,
                    ShopDate.encode(req.openedAt), ShopDate.encode(req.closedAt), googlePlaceId, req.category.value,
                    wishLevel?.value,
                )
            }
            replaceShopTags(shopId, req.tagIds)
            replaceShopLinks(shopId, links)
        }

        call.respondTyped(
            Shop(
                id = shopId.toString(), name = req.name, nameKana = nameKana, lat = req.lat, lng = req.lng,
                openedAt = ShopDate.encode(req.openedAt), closedAt = ShopDate.encode(req.closedAt),
                postalCode = req.postalCode, address = req.address, googlePlaceId = googlePlaceId,
                eaten = false, favorite = false, mealRecordCount = 0, wishLevel = wishLevel?.value,
                category = req.category,
                tags = tagsByShopIds(listOf(shopId))[shopId] ?: emptyList(),
                links = linksByShopIds(listOf(shopId))[shopId] ?: emptyList(),
            ),
        )
    }

    override suspend fun updateShop(id: String, updateShopRequest: UpdateShopRequest, call: ApplicationCall) {
        // Order mirrors Gin: auth (401) -> bad id (400) -> admin (403).
        val user = sessions.requireUser(call)
        val shopId = try {
            UUID.fromString(id)
        } catch (_: IllegalArgumentException) {
            throw DomainException.InvalidRequest("invalid id")
        }
        if (!user.isAdmin) throw DomainException.PermissionDenied()

        // eaten / rate are deprecated and ignored: 食べた comes from meal records, お気に入り度 from setShopRate.
        val req = updateShopRequest
        // Missing (older clients) keeps the stored reading; blank clears it ('' -> NULL in SQL).
        val nameKana = req.nameKana?.let { normalizeNameKana(it) ?: "" }
        // Same for the place id: missing keeps it, blank clears it.
        val googlePlaceId = req.googlePlaceId?.trim()
        // Missing (older clients) keeps the stored links; an array replaces them all.
        val links = req.links?.let { normalizeLinks(it) }
        // Same for the 気になる度: missing keeps it, '' clears it.
        val wishLevel = req.wishLevel?.let { if (it.isEmpty()) "" else parseWishLevel(it).value }
        db.transaction {
            // Write first and judge existence by rows affected: a SELECT before the first write
            // in a deferred WAL transaction can fail with SQLITE_BUSY_SNAPSHOT under contention.
            val updated = rejectingDuplicatePlaceId {
                db.shopsQueries.updateShop(
                    req.name, nameKana, req.lat, req.lng, req.postalCode, req.address,
                    ShopDate.encode(req.openedAt), ShopDate.encode(req.closedAt), googlePlaceId, req.category.value,
                    wishLevel, shopId,
                ).value
            }
            if (updated == 0L) throw DomainException.NotFound()
            replaceShopTags(shopId, req.tagIds)
            links?.let { replaceShopLinks(shopId, it) }
        }

        call.respond(HttpStatusCode.OK)
    }

    override suspend fun deleteShop(id: String, call: ApplicationCall) {
        // Same order as updateShop: auth (401) -> bad id (400) -> admin (403).
        val user = sessions.requireUser(call)
        val shopId = try {
            UUID.fromString(id)
        } catch (_: IllegalArgumentException) {
            throw DomainException.InvalidRequest("invalid id")
        }
        if (!user.isAdmin) throw DomainException.PermissionDenied()

        db.transaction {
            // The first statement writes, so the check below reads under the write lock (a SELECT before
            // the first write in a deferred WAL transaction can fail with SQLITE_BUSY_SNAPSHOT). An unknown
            // id deletes nothing; it is detected by rows affected.
            db.shopsTagsQueries.deleteShopTagsByShopId(shopId)
            // A shop with meal records is never deleted (GLOSSARY.md 店舗); throwing rolls the tag delete back.
            if (db.mealRecordsQueries.shopHasMealRecords(shopId).executeAsOne()) throw DomainException.ShopHasMealRecords()
            // Legacy shop_images rows have no ON DELETE CASCADE, so they go before the shop.
            db.shopImagesQueries.deleteShopImagesByShopId(shopId)
            db.shopLinksQueries.deleteShopLinksByShopId(shopId)
            if (db.shopsQueries.deleteShop(shopId).value == 0L) throw DomainException.NotFound()
        }

        call.respond(HttpStatusCode.NoContent)
    }

    /** One shop as the public list returns it, or null. */
    // shortcut: scans the whole (personal-log sized) list; add a by-id query if shops grow to many thousands.
    fun findShop(id: UUID): ShopRecord? = loadShops().firstOrNull { it.shop.id == id.toString() }

    // --- Helpers ---

    // The one place the お気に入り rule lives (GLOSSARY.md): the shop's お気に入り度 is 80 or more.
    private fun isFavorite(rate: Double?): Boolean = rate != null && rate >= 80.0

    private fun loadShops(): List<ShopRecord> {
        val rows = db.shopsQueries.findAllShops().executeAsList()
        val tagsByShop = tagsByShopIds(rows.map { it.id })
        val linksByShop = linksByShopIds(rows.map { it.id })
        val mealRecordCounts = mealRecordCountsByShop(db)
        val coversByShop = coverPhotoKeysByShop(db)
        val representatives = db.shopRepresentativeMealRecordsQueries.findAllRepresentativeMealRecords()
            .executeAsList().associate { it.shop_id to it.meal_record_id }
        return rows.map { r ->
            val mealRecordCount = mealRecordCounts[r.id] ?: 0
            val coverKey = coversByShop[r.id]
            val shop = Shop(
                id = r.id.toString(), name = r.name, nameKana = r.name_kana, lat = r.lat, lng = r.lng,
                openedAt = ShopDate.decode(r.opened_at), closedAt = ShopDate.decode(r.closed_at),
                postalCode = r.postal_code, address = r.address, googlePlaceId = r.google_place_id,
                eaten = mealRecordCount > 0, rate = r.rate, favorite = isFavorite(r.rate),
                mealRecordCount = mealRecordCount, wishLevel = r.wish_level,
                category = CategorySlug.fromValue(r.category) ?: CategorySlug.RAMEN,
                tags = tagsByShop[r.id] ?: emptyList(),
                links = linksByShop[r.id] ?: emptyList(),
                coverPhotoUrl = coverKey?.let(mealRecordImages::publicUrl),
                representativeMealRecordId = representatives[r.id]?.toString(),
            )
            ShopRecord(shop, coverKey)
        }
    }

    private fun loadAllTags(): List<Tag> = db.tagsQueries.findAllTags().executeAsList().map {
        Tag(
            id = it.id.toString(), category = it.category?.let(CategorySlug::fromValue),
            label = it.label, slug = it.slug, color = it.color, sortOrder = it.sort_order.toInt(),
        )
    }

    private fun tagsByShopIds(ids: List<UUID>): Map<UUID, List<Tag>> {
        if (ids.isEmpty()) return emptyMap()
        return db.shopsTagsQueries.findTagsByShopIds(ids).executeAsList().groupBy(
            keySelector = { it.shop_id },
            valueTransform = {
                Tag(
                    id = it.id.toString(), category = it.category?.let(CategorySlug::fromValue),
                    label = it.label, slug = it.slug, color = it.color, sortOrder = it.sort_order.toInt(),
                )
            },
        )
    }

    private fun linksByShopIds(ids: List<UUID>): Map<UUID, List<ShopLink>> {
        if (ids.isEmpty()) return emptyMap()
        return db.shopLinksQueries.findShopLinksByShopIds(ids).executeAsList().groupBy(
            keySelector = { it.shop_id },
            valueTransform = { ShopLink(type = ShopLinkType.fromValue(it.type) ?: ShopLinkType.OTHER, label = it.label, url = it.url) },
        )
    }

    /** Trims URLs and labels (blank label = not set) and rejects anything but short http(s) URLs. */
    private fun normalizeLinks(links: List<ShopLinkInput>): List<ShopLinkInput> {
        fun invalid(message: String, type: FieldErrorType): Nothing =
            throw DomainException.InvalidRequestWithFields(message, listOf(FieldError("links", type)))

        if (links.size > SHOP_LINKS_MAX) invalid("too many links", FieldErrorType.OUT_OF_RANGE)
        return links.map { link ->
            val url = link.url.trim()
            if (url.length > SHOP_LINK_URL_MAX_LENGTH) invalid("link url too long", FieldErrorType.TOO_LONG)
            if (!isHttpUrl(url)) invalid("invalid link url", FieldErrorType.INVALID_FORMAT)
            val label = link.label?.trim()?.takeIf { it.isNotEmpty() }
            if (label != null && label.length > SHOP_LINK_LABEL_MAX_LENGTH) invalid("link label too long", FieldErrorType.TOO_LONG)
            link.copy(url = url, label = label)
        }
    }

    private fun replaceShopLinks(shopId: UUID, links: List<ShopLinkInput>) {
        db.shopLinksQueries.deleteShopLinksByShopId(shopId)
        links.forEachIndexed { i, link ->
            db.shopLinksQueries.insertShopLink(UUID.randomUUID(), shopId, link.type.value, link.label, link.url, i.toLong())
        }
    }

    private fun parseWishLevel(raw: String): WishLevel =
        WishLevel.fromValue(raw) ?: throw DomainException.InvalidRequestWithFields(
            "invalid wish level",
            listOf(FieldError("wishLevel", FieldErrorType.INVALID_FORMAT)),
        )

    /** Trims the reading; blank means "not set". */
    private fun normalizeNameKana(raw: String?): String? {
        val kana = raw?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        if (kana.length > NAME_KANA_MAX_LENGTH) {
            throw DomainException.InvalidRequestWithFields(
                "name kana too long",
                listOf(FieldError("nameKana", FieldErrorType.TOO_LONG)),
            )
        }
        return kana
    }

    /** `google_place_id` is the only UNIQUE column on `shops`, so a UNIQUE violation there is a duplicate place id. */
    private inline fun <T> rejectingDuplicatePlaceId(write: () -> T): T {
        try {
            return write()
        } catch (e: SQLiteException) {
            if (e.resultCode == SQLiteErrorCode.SQLITE_CONSTRAINT_UNIQUE) throw DomainException.DuplicateGooglePlaceId()
            throw e
        }
    }

    /** Replaces a shop's tag links. Rejects unknown tag ids; dedupes preserving order. */
    private fun replaceShopTags(shopId: UUID, tagIds: List<String>) {
        val existing = db.tagsQueries.findAllTags().executeAsList().map { it.id }.toSet()
        val normalized = LinkedHashSet<UUID>()
        for (raw in tagIds) {
            val tagId = try {
                UUID.fromString(raw)
            } catch (_: IllegalArgumentException) {
                throw DomainException.InvalidShopTagIds()
            }
            if (tagId !in existing) throw DomainException.InvalidShopTagIds()
            normalized.add(tagId)
        }
        db.shopsTagsQueries.deleteShopTagsByShopId(shopId)
        normalized.forEach { db.shopsTagsQueries.insertShopTag(UUID.randomUUID(), shopId, it) }
    }
}
