package dev.marulabs.noodlemap.backup

import aws.sdk.kotlin.services.s3.putObject
import aws.smithy.kotlin.runtime.content.ByteStream
import dev.marulabs.noodlemap.Config
import dev.marulabs.noodlemap.common.r2Client
import dev.marulabs.noodlemap.errors.DomainException
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.GZIPOutputStream
import javax.sql.DataSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory

private val log = LoggerFactory.getLogger("Backup")
private val fileStamp = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC)
private val datePrefix = DateTimeFormatter.ofPattern("yyyy/MM/dd").withZone(ZoneOffset.UTC)

/** One admission guard for scheduled and manual snapshots, including their R2 upload. */
class BackupService(private val dataSource: DataSource, private val cfg: Config.BackupConfig) : Closeable {
    private val running = AtomicBoolean()
    private var lastVersion: Long? = null
    // SQLite data_version values can only be compared on the same connection. Keep this
    // observer out of the pool until shutdown; it never starts a transaction or writes.
    private var observer: Connection? = null

    /** Returns false only when a scheduled run has no changes; forced runs always snapshot. */
    suspend fun run(force: Boolean = false): Boolean {
        if (!running.compareAndSet(false, true)) throw DomainException.BackupBusy()
        try {
            return withContext(Dispatchers.IO) {
                val connection = observer ?: dataSource.connection.also { observer = it }
                val version = connection.createStatement().use { st ->
                    st.executeQuery("PRAGMA data_version").use { rs -> rs.getLong(1) }
                }
                if (!force && version == lastVersion) {
                    log.info("backup: no changes since last backup, skipping")
                    return@withContext false
                }
                writeSnapshot()
                currentCoroutineContext().ensureActive()
                lastVersion = version
                true
            }
        } finally {
            running.set(false)
        }
    }

    private suspend fun writeSnapshot() {
        val snapshot = Path.of(cfg.snapshotPath)
        Files.deleteIfExists(snapshot)
        val target = cfg.snapshotPath.replace("'", "''")
        dataSource.connection.use { conn ->
            conn.createStatement().use { it.execute("VACUUM INTO '$target'") }
        }
        log.info("backup: snapshot written to {}", cfg.snapshotPath)
        currentCoroutineContext().ensureActive()

        val r2 = cfg.r2 ?: run {
            log.info("backup: R2 not configured, keeping local snapshot only")
            return
        }
        val gz = gzip(Files.readAllBytes(snapshot))
        currentCoroutineContext().ensureActive()
        val now = Instant.now()
        val key = buildString {
            cfg.prefix?.trim('/')?.takeIf { it.isNotEmpty() }?.let { append(it).append('/') }
            append(datePrefix.format(now)).append('/')
            append("noodle_map-").append(fileStamp.format(now)).append('-').append(UUID.randomUUID()).append(".db.gz")
        }
        r2Client(r2.connection).use { s3 ->
            s3.putObject {
                bucket = r2.bucket
                this.key = key
                body = ByteStream.fromBytes(gz)
                contentType = "application/gzip"
            }
        }
        log.info("backup: uploaded to R2 bucket {}/{}", r2.bucket, key)
    }

    override fun close() {
        observer?.close()
    }
}

private fun gzip(data: ByteArray): ByteArray {
    val out = ByteArrayOutputStream()
    GZIPOutputStream(out).use { it.write(data) }
    return out.toByteArray()
}
