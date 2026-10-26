package dev.marulabs.noodlemap.mealrecords

import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.common.BitmapWorkGate
import dev.marulabs.noodlemap.common.retrySoon
import dev.marulabs.noodlemap.db.NoodleMapDb
import dev.marulabs.noodlemap.db.Meal_record_images
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthMealRecordImagesController
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthMealRecordsImagesOrderController
import dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall
import dev.marulabs.noodlemap.generated.models.ReorderMealRecordImagesRequest
import dev.marulabs.noodlemap.generated.models.UpdateMealRecordImageRequest
import dev.marulabs.noodlemap.generated.models.MealRecordImage
import dev.marulabs.noodlemap.generated.models.MealRecordImagesResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.server.application.ApplicationCall
import io.ktor.server.http.content.LocalPathContent
import io.ktor.server.request.contentLength
import io.ktor.server.request.contentType
import io.ktor.server.request.header
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.utils.io.readRemaining
import java.net.URI
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.io.readByteArray
import org.slf4j.LoggerFactory
import org.sqlite.SQLiteErrorCode
import org.sqlite.SQLiteException

/** Upload size limit, checked while the body streams in. */
const val MEAL_RECORD_IMAGE_MAX_BYTES = 15L * 1024 * 1024
const val MEAL_RECORD_IMAGES_PER_MEAL_RECORD_MAX = 10
private const val CAPTION_MAX_LENGTH = 100
private val LOCAL_ORIGIN = Regex("""https?://(localhost|127\.0\.0\.1)(:\d{1,5})?""", RegexOption.IGNORE_CASE)

/** Room for the multipart boundaries and part headers around the file in the request's Content-Length. */
private const val MULTIPART_OVERHEAD_BYTES = 16L * 1024

private val log = LoggerFactory.getLogger("MealRecordImages")

/** Plain routes, not TypeSpec ones. */
fun Route.mealRecordImageRoutes(images: MealRecordImageHandler) {
    // The generated upload route would `receive` the whole multipart body as a model instead of streaming it.
    post("/api/v1/auth/meal-records/{mealRecordId}/images") { images.upload(call) }
    // Answers JPEG bytes for <img> tags (local-disk store only), not a JSON API the web client calls.
    get("$LOCAL_MEAL_RECORD_IMAGES_PATH/{key...}") { images.serveLocal(call) }
}

/** The images of each of [mealRecordIds] in display order; mealRecords without images are absent. */
fun mealRecordImagesByMealRecordIds(db: NoodleMapDb, store: MealRecordImageStore, mealRecordIds: List<UUID>): Map<UUID, List<MealRecordImage>> {
    if (mealRecordIds.isEmpty()) return emptyMap()
    return db.mealRecordImagesQueries.findMealRecordImagesByMealRecordIds(mealRecordIds).executeAsList()
        .groupBy(keySelector = { it.meal_record_id }, valueTransform = { it.toApi(store) })
}

/** Removes stored objects whose rows are gone. Best effort: a failure leaves an orphan object and is logged. */
suspend fun deleteStoredMealRecordImages(store: MealRecordImageStore, keys: List<String>) {
    for (key in keys) {
        try {
            store.delete(key)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            log.warn("mealRecord image object {} could not be deleted; it is left orphaned", key, e)
        }
    }
}

private fun Meal_record_images.toApi(store: MealRecordImageStore) = MealRecordImage(
    id = id.toString(), url = store.publicUrl(storage_key), width = width.toInt(), height = height.toInt(), caption = caption,
)

private fun fileError(type: FieldErrorType, message: String): Nothing =
    throw DomainException.InvalidRequestWithFields(message, listOf(FieldError("file", type)))

private fun imageIdsError(type: FieldErrorType): Nothing =
    throw DomainException.InvalidRequestWithFields("image ids must list every image of the mealRecord once", listOf(FieldError("imageIds", type)))

/** 記録の画像 endpoints: the admin uploads, captions, reorders and deletes; anyone reads them through meal records. */
class MealRecordImageHandler(
    private val db: NoodleMapDb,
    private val sessions: SessionService,
    private val store: MealRecordImageStore,
    /** Shared with OGP rendering: bounds memory on the 512 MB instance. */
    private val bitmapWork: BitmapWorkGate,
    /** The site's origin; uploads from any other `Origin` are refused (but see [originAllowed]). */
    publicBaseUrl: String,
) : ApiV1AuthMealRecordsImagesOrderController, ApiV1AuthMealRecordImagesController {

    private val siteOrigin = URI(publicBaseUrl).let { "${it.scheme}://${it.rawAuthority}" }

    // An http site is local dev or e2e, whose web servers (Vite dev, preview) run on other localhost ports.
    private val localDevelopment = publicBaseUrl.startsWith("http://", ignoreCase = true)

    /** A missing Origin is never allowed: browsers always send one on a cross-site POST. */
    private fun originAllowed(origin: String?): Boolean = when {
        origin == null -> false
        origin.equals(siteOrigin, ignoreCase = true) -> true
        else -> localDevelopment && LOCAL_ORIGIN.matches(origin)
    }

    /** POST /auth/meal-records/{mealRecordId}/images with one multipart file part named `file`. */
    suspend fun upload(call: ApplicationCall) {
        sessions.requireAdmin(call)
        // A multipart POST is a CORS "simple" request that any site can make with the admin's cookie, so the
        // browser-set Origin must be this site's.
        if (!originAllowed(call.request.header(HttpHeaders.Origin))) throw DomainException.PermissionDenied()
        if (!store.acceptsUploads) throw DomainException.MealRecordImagesStorageUnconfigured()
        val mealRecordId = uuidOrNull(call.parameters["mealRecordId"]) ?: throw DomainException.NotFound()
        if (!db.mealRecordsQueries.mealRecordExists(mealRecordId).executeAsOne()) throw DomainException.NotFound()
        if (db.mealRecordImagesQueries.countMealRecordImages(mealRecordId).executeAsOne() >= MEAL_RECORD_IMAGES_PER_MEAL_RECORD_MAX) {
            throw DomainException.MealRecordImageLimitReached()
        }
        // A malformed Content-Type is a client error like a missing one.
        val contentType = runCatching { call.request.contentType() }.getOrNull()
        if (contentType?.match(ContentType.MultiPart.FormData) != true) fileError(FieldErrorType.REQUIRED, "multipart file required")
        // Browsers send the length of a FormData body, so an oversized upload is refused before it is read.
        if ((call.request.contentLength() ?: 0) > MEAL_RECORD_IMAGE_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
            fileError(FieldErrorType.TOO_LONG, "image larger than 15 MB")
        }

        // The slot covers receiving the body too, so pending uploads also bound the bytes held in memory.
        val image = bitmapWork.withSlotOrNull {
            val bytes = receiveFile(call)
            bitmapWork.exclusive {
                try {
                    processMealRecordImage(bytes)
                } catch (e: UnacceptableImage) {
                    fileError(e.type, "unsupported image")
                }
            }
        } ?: run {
            call.retrySoon()
            throw DomainException.MealRecordImageProcessingBusy()
        }

        val imageId = UUID.randomUUID()
        val key = mealRecordImageKey(mealRecordId, imageId)
        store.put(key, image.jpeg)
        try {
            db.transaction {
                db.mealRecordImagesQueries.appendMealRecordImage(imageId, mealRecordId, key, image.width.toLong(), image.height.toLong())
                // Counted again after the write: a concurrent upload may have taken the last slot.
                if (db.mealRecordImagesQueries.countMealRecordImages(mealRecordId).executeAsOne() > MEAL_RECORD_IMAGES_PER_MEAL_RECORD_MAX) {
                    throw DomainException.MealRecordImageLimitReached()
                }
            }
        } catch (e: Exception) {
            deleteStoredMealRecordImages(store, listOf(key))
            // meal_record_id is the only foreign key: the meal record was deleted meanwhile.
            if (e is SQLiteException && e.resultCode == SQLiteErrorCode.SQLITE_CONSTRAINT_FOREIGNKEY) throw DomainException.NotFound()
            throw e
        }
        call.respond(MealRecordImage(id = imageId.toString(), url = store.publicUrl(key), width = image.width, height = image.height))
    }

    /** The first file part named `file`, read up to [MEAL_RECORD_IMAGE_MAX_BYTES]; a larger one is refused mid-stream. */
    private suspend fun receiveFile(call: ApplicationCall): ByteArray {
        try {
            // Ktor applies this limit to every part, the file included, and a part over it fails the whole call
            // (500), so it cannot be smaller than the file limit; the Content-Length check above bounds the body.
            val multipart = call.receiveMultipart(formFieldLimit = MEAL_RECORD_IMAGE_MAX_BYTES + 1)
            while (true) {
                val part = multipart.readPart() ?: fileError(FieldErrorType.REQUIRED, "file part required")
                try {
                    if (part is PartData.FileItem && part.name == "file") {
                        val bytes = part.provider().readRemaining(MEAL_RECORD_IMAGE_MAX_BYTES + 1).readByteArray()
                        if (bytes.size > MEAL_RECORD_IMAGE_MAX_BYTES) fileError(FieldErrorType.TOO_LONG, "image larger than 15 MB")
                        return bytes
                    }
                } finally {
                    part.dispose()
                }
            }
        } catch (e: Exception) {
            if (e is DomainException || e is CancellationException) throw e
            // A malformed multipart body (no boundary, an oversized form field, cut off by the client, ...).
            throw DomainException.InvalidRequest("invalid multipart body")
        }
    }

    /** Images of the local-disk store; 404 for anything else, and always when images live in R2. */
    suspend fun serveLocal(call: ApplicationCall) {
        val key = call.parameters.getAll("key")?.joinToString("/") ?: throw DomainException.NotFound()
        val file = (store as? LocalMealRecordImageStore)?.file(key) ?: throw DomainException.NotFound()
        call.response.header(HttpHeaders.CacheControl, MEAL_RECORD_IMAGE_CACHE_CONTROL)
        call.respond(LocalPathContent(file, ContentType.Image.JPEG))
    }

    override suspend fun reorderMealRecordImages(
        mealRecordId: String,
        reorderMealRecordImagesRequest: ReorderMealRecordImagesRequest,
        call: TypedApplicationCall<MealRecordImagesResponse>,
    ) {
        sessions.requireAdmin(call)
        val id = uuidOrNull(mealRecordId) ?: throw DomainException.NotFound()
        if (reorderMealRecordImagesRequest.imageIds.size > MEAL_RECORD_IMAGES_PER_MEAL_RECORD_MAX) imageIdsError(FieldErrorType.OUT_OF_RANGE)
        val imageIds = reorderMealRecordImagesRequest.imageIds.map { uuidOrNull(it) ?: imageIdsError(FieldErrorType.UNKNOWN) }
        if (imageIds.toSet().size != imageIds.size) imageIdsError(FieldErrorType.DUPLICATE)
        db.transaction {
            // Written first and checked by rows affected, as in ShopHandler.updateShop.
            val updated = imageIds.withIndex().sumOf { (i, imageId) ->
                db.mealRecordImagesQueries.updateMealRecordImageSortOrder(i.toLong(), imageId, id).value
            }
            if (!db.mealRecordsQueries.mealRecordExists(id).executeAsOne()) throw DomainException.NotFound()
            if (updated != imageIds.size.toLong() || db.mealRecordImagesQueries.countMealRecordImages(id).executeAsOne() != updated) {
                imageIdsError(FieldErrorType.UNKNOWN)
            }
        }
        call.respondTyped(MealRecordImagesResponse(images = mealRecordImagesByMealRecordIds(db, store, listOf(id))[id].orEmpty()))
    }

    override suspend fun updateMealRecordImage(
        imageId: String,
        updateMealRecordImageRequest: UpdateMealRecordImageRequest,
        call: TypedApplicationCall<MealRecordImage>,
    ) {
        sessions.requireAdmin(call)
        val id = uuidOrNull(imageId) ?: throw DomainException.NotFound()
        val caption = updateMealRecordImageRequest.caption?.trim()?.takeIf { it.isNotEmpty() }
        // Counted in code points like the meal record texts (and SQLite's length() in the CHECK).
        if (caption != null && caption.codePointCount(0, caption.length) > CAPTION_MAX_LENGTH) {
            throw DomainException.InvalidRequestWithFields("caption too long", listOf(FieldError("caption", FieldErrorType.TOO_LONG)))
        }
        if (db.mealRecordImagesQueries.updateMealRecordImageCaption(caption, id).value == 0L) throw DomainException.NotFound()
        val row = db.mealRecordImagesQueries.findMealRecordImage(id).executeAsOneOrNull() ?: throw DomainException.NotFound()
        call.respondTyped(row.toApi(store))
    }

    override suspend fun deleteMealRecordImage(imageId: String, call: ApplicationCall) {
        sessions.requireAdmin(call)
        val id = uuidOrNull(imageId) ?: throw DomainException.NotFound()
        val key = db.mealRecordImagesQueries.deleteMealRecordImage(id).executeAsOneOrNull() ?: throw DomainException.NotFound()
        deleteStoredMealRecordImages(store, listOf(key))
        call.respond(HttpStatusCode.NoContent)
    }

    private fun uuidOrNull(raw: String?): UUID? = raw?.let { runCatching { UUID.fromString(it) }.getOrNull() }
}
