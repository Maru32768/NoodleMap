package dev.marulabs.noodlemap.shops

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.common.ShopDate
import dev.marulabs.noodlemap.db.NoodleMapDb
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthShopsController
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthTagsController
import dev.marulabs.noodlemap.generated.controllers.ApiV1ShopsController
import dev.marulabs.noodlemap.generated.controllers.ApiV1TagsController
import dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall
import dev.marulabs.noodlemap.generated.models.AddShopRequest
import dev.marulabs.noodlemap.generated.models.CategorySlug
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.generated.models.SaveTagsRequest
import dev.marulabs.noodlemap.generated.models.ShopsResponse
import dev.marulabs.noodlemap.generated.models.Tag
import dev.marulabs.noodlemap.generated.models.TagsResponse
import dev.marulabs.noodlemap.generated.models.UpdateShopRequest
import java.util.UUID
import org.sqlite.SQLiteErrorCode
import org.sqlite.SQLiteException

/** Shop and tag endpoints, ported from Go `shops/handler.go`. */
class ShopHandler(
    private val db: NoodleMapDb,
    private val sessions: SessionService,
) : ApiV1ShopsController, ApiV1TagsController, ApiV1AuthShopsController, ApiV1AuthTagsController {

    // --- Public reads ---

    override suspend fun listShops(call: TypedApplicationCall<ShopsResponse>) {
        call.respondTyped(ShopsResponse(shops = loadShops()))
    }

    override suspend fun listTags(call: TypedApplicationCall<TagsResponse>) {
        call.respondTyped(TagsResponse(tags = loadAllTags()))
    }

    // --- Admin writes ---

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
        db.transaction {
            rejectingDuplicatePlaceId {
                db.shopsQueries.insertShop(
                    shopId, req.name, req.lat, req.lng, req.postalCode, req.address,
                    ShopDate.encode(req.openedAt), ShopDate.encode(req.closedAt), req.googlePlaceId, req.category.value,
                )
            }
            replaceShopTags(shopId, req.tagIds)
        }

        call.respondTyped(
            Shop(
                id = shopId.toString(), name = req.name, lat = req.lat, lng = req.lng,
                openedAt = ShopDate.encode(req.openedAt), closedAt = ShopDate.encode(req.closedAt),
                postalCode = req.postalCode, address = req.address, googlePlaceId = req.googlePlaceId,
                eaten = false, rate = 0.0, favorite = false, category = req.category,
                tags = tagsByShopIds(listOf(shopId))[shopId] ?: emptyList(),
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

        val req = updateShopRequest
        db.transaction {
            rejectingDuplicatePlaceId {
                db.shopsQueries.updateShop(
                    req.name, req.lat, req.lng, req.postalCode, req.address,
                    ShopDate.encode(req.openedAt), ShopDate.encode(req.closedAt), req.googlePlaceId, req.category.value, shopId,
                )
            }
            if (req.eaten) {
                db.eatenShopsQueries.upsertEatenShop(UUID.randomUUID(), shopId, req.rate, req.favorite)
            } else {
                db.eatenShopsQueries.deleteEatenShopByShopId(shopId)
            }
            replaceShopTags(shopId, req.tagIds)
        }

        call.respond(HttpStatusCode.OK)
    }

    // --- Helpers ---

    private fun loadShops(): List<Shop> {
        val rows = db.shopsQueries.findAllShops().executeAsList()
        val tagsByShop = tagsByShopIds(rows.map { it.id })
        return rows.map { r ->
            Shop(
                id = r.id.toString(), name = r.name, lat = r.lat, lng = r.lng,
                openedAt = ShopDate.decode(r.opened_at), closedAt = ShopDate.decode(r.closed_at),
                postalCode = r.postal_code, address = r.address, googlePlaceId = r.google_place_id,
                eaten = r.eaten != 0L, rate = r.rate, favorite = r.favorite != 0L,
                category = CategorySlug.fromValue(r.category) ?: CategorySlug.RAMEN,
                tags = tagsByShop[r.id] ?: emptyList(),
            )
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

    /** `google_place_id` is the only UNIQUE column on `shops`, so a UNIQUE violation there is a duplicate place id. */
    private inline fun rejectingDuplicatePlaceId(write: () -> Unit) {
        try {
            write()
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
