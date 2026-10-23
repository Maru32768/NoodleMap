package dev.marulabs.noodlemap.visits

import aws.sdk.kotlin.services.s3.deleteObject
import aws.sdk.kotlin.services.s3.putObject
import aws.smithy.kotlin.runtime.content.ByteStream
import dev.marulabs.noodlemap.Config
import dev.marulabs.noodlemap.common.IMMUTABLE_CACHE_CONTROL
import dev.marulabs.noodlemap.common.r2Client
import java.io.Closeable
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Path of the local-disk store's public GET route; the rest of the path is the storage key. */
const val LOCAL_VISIT_IMAGES_PATH = "/api/v1/visit-images"

private val STORAGE_KEY = Regex("""visits/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.jpg""")

/** Where a 訪問画像's JPEG is stored. Never reused: a new image always gets a new id. */
fun visitImageKey(visitId: UUID, imageId: UUID) = "visits/$visitId/$imageId.jpg"

/** Holds the JPEGs of 訪問画像 under their storage keys. */
interface VisitImageStore : Closeable {
    suspend fun put(key: String, jpeg: ByteArray)

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
            cacheControl = IMMUTABLE_CACHE_CONTROL
        }
    }

    // S3 DeleteObject succeeds for a missing key too.
    override suspend fun delete(key: String) {
        s3.deleteObject { bucket = cfg.bucket; this.key = key }
    }

    override fun publicUrl(key: String) = "${cfg.publicBaseUrl}/$key"

    override fun close() = s3.close()
}

/**
 * Files under [dir] served by this server at [LOCAL_VISIT_IMAGES_PATH] (local dev, tests, e2e: whenever
 * VISIT_IMAGES_R2_* is not set).
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
