package dev.marulabs.noodlemap.visits

import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.common.IMMUTABLE_CACHE_CONTROL
import dev.marulabs.noodlemap.db.NoodleMapDb
import dev.marulabs.noodlemap.db.Visit_images
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthVisitImagesController
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthVisitsImagesOrderController
import dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall
import dev.marulabs.noodlemap.generated.models.ReorderVisitImagesRequest
import dev.marulabs.noodlemap.generated.models.UpdateVisitImageRequest
import dev.marulabs.noodlemap.generated.models.VisitImage
import dev.marulabs.noodlemap.generated.models.VisitImagesResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.server.application.ApplicationCall
import io.ktor.server.http.content.LocalPathContent
import io.ktor.server.request.contentType
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.utils.io.readRemaining
import java.io.IOException
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.io.readByteArray
import org.slf4j.LoggerFactory
import org.sqlite.SQLiteErrorCode
import org.sqlite.SQLiteException

/** Upload size limit, checked while the body streams in. */
const val VISIT_IMAGE_MAX_BYTES = 15L * 1024 * 1024
const val VISIT_IMAGES_PER_VISIT_MAX = 10
private const val CAPTION_MAX_LENGTH = 100

private val log = LoggerFactory.getLogger("VisitImages")

/**
 * Plain routes, not the generated ones: the generated upload route would `receive` the whole multipart body
 * as a model, and the local-disk images are bytes, not JSON.
 */
fun Route.visitImageRoutes(images: VisitImageHandler) {
    post("/api/v1/auth/visits/{visitId}/images") { images.upload(call) }
    get("$LOCAL_VISIT_IMAGES_PATH/{key...}") { images.serveLocal(call) }
}

/** The images of each of [visitIds] in display order; visits without images are absent. */
fun visitImagesByVisitLogIds(db: NoodleMapDb, store: VisitImageStore, visitIds: List<UUID>): Map<UUID, List<VisitImage>> {
    if (visitIds.isEmpty()) return emptyMap()
    return db.visitImagesQueries.findVisitImagesByVisitLogIds(visitIds).executeAsList()
        .groupBy(keySelector = { it.visit_log_id }, valueTransform = { it.toApi(store) })
}

/** Removes stored objects whose rows are gone. Best effort: a failure leaves an orphan object and is logged. */
suspend fun deleteStoredVisitImages(store: VisitImageStore, keys: List<String>) {
    for (key in keys) {
        try {
            store.delete(key)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            log.warn("visit image object {} could not be deleted; it is left orphaned", key, e)
        }
    }
}

private fun Visit_images.toApi(store: VisitImageStore) = VisitImage(
    id = id.toString(), url = store.publicUrl(storage_key), width = width.toInt(), height = height.toInt(), caption = caption,
)

private fun fileError(type: FieldErrorType, message: String): Nothing =
    throw DomainException.InvalidRequestWithFields(message, listOf(FieldError("file", type)))

private fun imageIdsError(type: FieldErrorType): Nothing =
    throw DomainException.InvalidRequestWithFields("image ids must list every image of the visit once", listOf(FieldError("imageIds", type)))

/** 訪問画像 endpoints: the admin uploads, captions, reorders and deletes; anyone reads them through visit logs. */
class VisitImageHandler(
    private val db: NoodleMapDb,
    private val sessions: SessionService,
    private val store: VisitImageStore,
    /** Uploads being received or processed before new ones get 503; bounds memory on the 512 MB instance. */
    private val maxPendingUploads: Int = 2,
) : ApiV1AuthVisitsImagesOrderController, ApiV1AuthVisitImagesController {

    // One decode at a time: a subsampled bitmap plus its scaled copy is tens of MB.
    private val processLock = Mutex()
    private val pendingUploads = AtomicInteger()

    /** POST /auth/visits/{visitId}/images with one multipart file part named `file`. */
    suspend fun upload(call: ApplicationCall) {
        sessions.requireAdmin(call)
        val visitId = uuidOrNull(call.parameters["visitId"]) ?: throw DomainException.NotFound()
        if (!db.visitLogsQueries.visitLogExists(visitId).executeAsOne()) throw DomainException.NotFound()
        if (db.visitImagesQueries.countVisitImages(visitId).executeAsOne() >= VISIT_IMAGES_PER_VISIT_MAX) {
            throw DomainException.VisitImageLimitReached()
        }
        if (call.request.contentType().match(ContentType.MultiPart.FormData).not()) fileError(FieldErrorType.REQUIRED, "multipart file required")

        val image = try {
            if (pendingUploads.incrementAndGet() > maxPendingUploads) {
                call.response.header(HttpHeaders.RetryAfter, "5")
                throw DomainException.VisitImageProcessingBusy()
            }
            val bytes = receiveFile(call)
            processLock.withLock {
                withContext(Dispatchers.Default) {
                    try {
                        processVisitImage(bytes)
                    } catch (e: UnacceptableImage) {
                        fileError(e.type, "unsupported image")
                    }
                }
            }
        } finally {
            pendingUploads.decrementAndGet()
        }

        val imageId = UUID.randomUUID()
        val key = visitImageKey(visitId, imageId)
        store.put(key, image.jpeg)
        try {
            db.transaction {
                db.visitImagesQueries.appendVisitImage(imageId, visitId, key, image.width.toLong(), image.height.toLong())
                // Counted again after the write: a concurrent upload may have taken the last slot.
                if (db.visitImagesQueries.countVisitImages(visitId).executeAsOne() > VISIT_IMAGES_PER_VISIT_MAX) {
                    throw DomainException.VisitImageLimitReached()
                }
            }
        } catch (e: Exception) {
            deleteStoredVisitImages(store, listOf(key))
            // visit_log_id is the only foreign key: the visit log was deleted meanwhile.
            if (e is SQLiteException && e.resultCode == SQLiteErrorCode.SQLITE_CONSTRAINT_FOREIGNKEY) throw DomainException.NotFound()
            throw e
        }
        call.respond(VisitImage(id = imageId.toString(), url = store.publicUrl(key), width = image.width, height = image.height))
    }

    /** The first file part named `file`, read up to [VISIT_IMAGE_MAX_BYTES]; a larger one is refused mid-stream. */
    private suspend fun receiveFile(call: ApplicationCall): ByteArray {
        // The limit applies to every part; the file part is cut off by the read below long before it.
        val multipart = call.receiveMultipart(formFieldLimit = VISIT_IMAGE_MAX_BYTES * 2)
        try {
            while (true) {
                val part = multipart.readPart() ?: fileError(FieldErrorType.REQUIRED, "file part required")
                try {
                    if (part is PartData.FileItem && part.name == "file") {
                        val bytes = part.provider().readRemaining(VISIT_IMAGE_MAX_BYTES + 1).readByteArray()
                        if (bytes.size > VISIT_IMAGE_MAX_BYTES) fileError(FieldErrorType.TOO_LONG, "image larger than 15 MB")
                        return bytes
                    }
                } finally {
                    part.dispose()
                }
            }
        } catch (_: IOException) {
            // A malformed multipart body (or one cut off by the client).
            throw DomainException.InvalidRequest("invalid multipart body")
        }
    }

    /** Images of the local-disk store; 404 for anything else, and always when images live in R2. */
    suspend fun serveLocal(call: ApplicationCall) {
        val key = call.parameters.getAll("key")?.joinToString("/") ?: throw DomainException.NotFound()
        val file = (store as? LocalVisitImageStore)?.file(key) ?: throw DomainException.NotFound()
        call.response.header(HttpHeaders.CacheControl, IMMUTABLE_CACHE_CONTROL)
        call.respond(LocalPathContent(file, ContentType.Image.JPEG))
    }

    override suspend fun reorderVisitImages(
        visitId: String,
        reorderVisitImagesRequest: ReorderVisitImagesRequest,
        call: TypedApplicationCall<VisitImagesResponse>,
    ) {
        sessions.requireAdmin(call)
        val id = uuidOrNull(visitId) ?: throw DomainException.NotFound()
        val imageIds = reorderVisitImagesRequest.imageIds.map { uuidOrNull(it) ?: imageIdsError(FieldErrorType.UNKNOWN) }
        if (imageIds.toSet().size != imageIds.size) imageIdsError(FieldErrorType.DUPLICATE)
        db.transaction {
            // Written first and checked by rows affected, as in ShopHandler.updateShop.
            val updated = imageIds.withIndex().sumOf { (i, imageId) ->
                db.visitImagesQueries.updateVisitImageSortOrder(i.toLong(), imageId, id).value
            }
            if (!db.visitLogsQueries.visitLogExists(id).executeAsOne()) throw DomainException.NotFound()
            if (updated != imageIds.size.toLong() || db.visitImagesQueries.countVisitImages(id).executeAsOne() != updated) {
                imageIdsError(FieldErrorType.UNKNOWN)
            }
        }
        call.respondTyped(VisitImagesResponse(images = visitImagesByVisitLogIds(db, store, listOf(id))[id].orEmpty()))
    }

    override suspend fun updateVisitImage(
        imageId: String,
        updateVisitImageRequest: UpdateVisitImageRequest,
        call: TypedApplicationCall<VisitImage>,
    ) {
        sessions.requireAdmin(call)
        val id = uuidOrNull(imageId) ?: throw DomainException.NotFound()
        val caption = updateVisitImageRequest.caption?.trim()?.takeIf { it.isNotEmpty() }
        // Counted in code points like the visit log texts (and SQLite's length() in the CHECK).
        if (caption != null && caption.codePointCount(0, caption.length) > CAPTION_MAX_LENGTH) {
            throw DomainException.InvalidRequestWithFields("caption too long", listOf(FieldError("caption", FieldErrorType.TOO_LONG)))
        }
        if (db.visitImagesQueries.updateVisitImageCaption(caption, id).value == 0L) throw DomainException.NotFound()
        val row = db.visitImagesQueries.findVisitImage(id).executeAsOneOrNull() ?: throw DomainException.NotFound()
        call.respondTyped(row.toApi(store))
    }

    override suspend fun deleteVisitImage(imageId: String, call: ApplicationCall) {
        sessions.requireAdmin(call)
        val id = uuidOrNull(imageId) ?: throw DomainException.NotFound()
        val key = db.visitImagesQueries.deleteVisitImage(id).executeAsOneOrNull() ?: throw DomainException.NotFound()
        deleteStoredVisitImages(store, listOf(key))
        call.respond(HttpStatusCode.NoContent)
    }

    private fun uuidOrNull(raw: String?): UUID? = raw?.let { runCatching { UUID.fromString(it) }.getOrNull() }
}
