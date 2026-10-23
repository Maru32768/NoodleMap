package dev.marulabs.noodlemap.visits

import aws.sdk.kotlin.services.s3.deleteObject
import aws.sdk.kotlin.services.s3.model.GetObjectRequest
import aws.sdk.kotlin.services.s3.putObject
import aws.smithy.kotlin.runtime.content.ByteStream
import aws.smithy.kotlin.runtime.content.toByteArray
import dev.marulabs.noodlemap.Config
import dev.marulabs.noodlemap.common.r2Client
import dev.marulabs.noodlemap.errors.DomainException
import java.io.Closeable
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory

/** Path of the local-disk store's public GET route; the rest of the path is the storage key. */
const val LOCAL_VISIT_IMAGES_PATH = "/api/v1/visit-images"

/**
 * Keys are never reused, but a deleted photo should leave shared caches within a day, so no `immutable`
 * and no year-long max-age.
 */
const val VISIT_IMAGE_CACHE_CONTROL = "public, max-age=86400"

private val log = LoggerFactory.getLogger("VisitImages")

private val STORAGE_KEY = Regex("""visits/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.jpg""")

/** Where a 訪問画像's JPEG is stored. Never reused: a new image always gets a new id. */
fun visitImageKey(visitId: UUID, imageId: UUID) = "visits/$visitId/$imageId.jpg"

/**
 * The store for this configuration: R2 when VISIT_IMAGES_R2_* is set; otherwise local disk, but only for an
 * http PUBLIC_BASE_URL (local dev, e2e). A deployed (https) site without R2 boots without image storage,
 * so photos never end up on the server's disk by accident.
 */
fun visitImageStoreFor(config: Config): VisitImageStore = when {
    config.visitImagesR2 != null -> R2VisitImageStore(config.visitImagesR2)
    config.publicBaseUrl.startsWith("http://", ignoreCase = true) ->
        LocalVisitImageStore.nextToDatabase(config.dbPath, config.publicBaseUrl)
    else -> UnconfiguredVisitImageStore(config.publicBaseUrl).also {
        log.warn("VISIT_IMAGES_R2_* not set on an https site; visit image uploads are refused until it is")
    }
}

/** Holds the JPEGs of 訪問画像 under their storage keys. */
interface VisitImageStore : Closeable {
    /** False when nothing can be stored; uploads are then refused before their body is read. */
    val acceptsUploads: Boolean get() = true

    suspend fun put(key: String, jpeg: ByteArray)

    /** The stored JPEG, read from storage itself (never through [publicUrl]); throws when it cannot be read. */
    suspend fun read(key: String): ByteArray

    /** Removes the object; a missing one is not an error. */
    suspend fun delete(key: String)

    /** Absolute URL the browser loads the image from. */
    fun publicUrl(key: String): String

    override fun close() {}
}

/** Cloudflare R2 bucket served from its public custom domain (production). */
class R2VisitImageStore(private val cfg: Config.R2Config) : VisitImageStore {
    private val s3 = r2Client(cfg)

    override suspend fun put(key: String, jpeg: ByteArray) {
        s3.putObject {
            bucket = cfg.bucket
            this.key = key
            body = ByteStream.fromBytes(jpeg)
            contentType = "image/jpeg"
            cacheControl = VISIT_IMAGE_CACHE_CONTROL
        }
    }

    override suspend fun read(key: String): ByteArray =
        s3.getObject(GetObjectRequest { bucket = cfg.bucket; this.key = key }) {
            it.body?.toByteArray() ?: throw IllegalStateException("empty visit image object $key")
        }

    // S3 DeleteObject succeeds for a missing key too.
    override suspend fun delete(key: String) {
        s3.deleteObject { bucket = cfg.bucket; this.key = key }
    }

    override fun publicUrl(key: String) = "${cfg.publicBaseUrl}/$key"

    override fun close() = s3.close()
}

/**
 * No storage: a deployed site whose VISIT_IMAGES_R2_* is not set. Uploads answer 503; images stored under an
 * earlier configuration get links that do not resolve rather than failing the lists that show them.
 */
class UnconfiguredVisitImageStore(private val publicBaseUrl: String) : VisitImageStore {
    override val acceptsUploads get() = false

    override suspend fun put(key: String, jpeg: ByteArray) = throw DomainException.VisitImagesStorageUnconfigured()

    override suspend fun read(key: String) = throw IllegalStateException("visit image storage is not configured")

    override suspend fun delete(key: String) = throw IllegalStateException("visit image storage is not configured")

    override fun publicUrl(key: String) = "$publicBaseUrl$LOCAL_VISIT_IMAGES_PATH/$key"
}

/**
 * Files under [dir] served by this server at [LOCAL_VISIT_IMAGES_PATH] (local dev, tests, e2e: an http site
 * without VISIT_IMAGES_R2_*).
 */
class LocalVisitImageStore(private val dir: Path, private val publicBaseUrl: String) : VisitImageStore {

    override suspend fun put(key: String, jpeg: ByteArray) = withContext(Dispatchers.IO) {
        val target = dir.resolve(key)
        Files.createDirectories(target.parent)
        // Written aside and moved, so a reader never sees half a file.
        val tmp = Files.createTempFile(target.parent, "upload", ".tmp")
        try {
            Files.write(tmp, jpeg)
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } finally {
            Files.deleteIfExists(tmp)
        }
        Unit
    }

    override suspend fun read(key: String): ByteArray = withContext(Dispatchers.IO) {
        Files.readAllBytes(file(key) ?: throw NoSuchFileException(key))
    }

    override suspend fun delete(key: String) = withContext(Dispatchers.IO) {
        Files.deleteIfExists(dir.resolve(key))
        Unit
    }

    override fun publicUrl(key: String) = "$publicBaseUrl$LOCAL_VISIT_IMAGES_PATH/$key"

    /** The stored file for a request path, or null. Only well-formed keys resolve, so no path leaves [dir]. */
    fun file(key: String): Path? =
        key.takeIf { STORAGE_KEY.matches(it) }?.let(dir::resolve)?.takeIf { Files.isRegularFile(it) }

    companion object {
        /** Next to the database, so the files live on the same persistent disk. */
        fun nextToDatabase(dbPath: String, publicBaseUrl: String) =
            LocalVisitImageStore(Path.of(dbPath).toAbsolutePath().parent.resolve("visit-images"), publicBaseUrl)
    }
}
