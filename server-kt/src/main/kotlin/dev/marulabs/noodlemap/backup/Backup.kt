package dev.marulabs.noodlemap.backup

import aws.sdk.kotlin.services.s3.S3Client
import aws.sdk.kotlin.services.s3.putObject
import aws.smithy.kotlin.runtime.content.ByteStream
import dev.marulabs.noodlemap.Config
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.zip.GZIPOutputStream
import javax.sql.DataSource
import org.slf4j.LoggerFactory

private val log = LoggerFactory.getLogger("Backup")
private val fileStamp = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC)
private val datePrefix = DateTimeFormatter.ofPattern("yyyy/MM/dd").withZone(ZoneOffset.UTC)

/**
 * Creates a consistent SQLite snapshot via `VACUUM INTO`, then (if configured) uploads it
 * to S3 as gzip. Ported from Go `backup/backup.go`. Safe to run while the DB is in use.
 *
 * For Cloudflare R2 (phase 2): set the S3Client endpointUrl + region="auto" and
 * requestChecksumCalculation/responseChecksumValidation = WHEN_REQUIRED.
 */
suspend fun runBackup(dataSource: DataSource, cfg: Config.BackupConfig) {
    val snapshot = Path.of(cfg.snapshotPath)
    Files.deleteIfExists(snapshot)

    // VACUUM is a special statement; inline the (escaped) path rather than bind a parameter.
    val target = cfg.snapshotPath.replace("'", "''")
    dataSource.connection.use { conn ->
        conn.createStatement().use { it.execute("VACUUM INTO '$target'") }
    }
    log.info("backup: snapshot written to {}", cfg.snapshotPath)

    if (!cfg.s3Enabled) {
        log.info("backup: S3 not configured, keeping local snapshot only")
        return
    }

    val gz = gzip(Files.readAllBytes(snapshot))
    val now = Instant.now()
    val key = buildString {
        cfg.s3Prefix?.takeIf { it.isNotBlank() }?.let { append(it.trimEnd('/')).append('/') }
        append(datePrefix.format(now)).append('/')
        append("noodle_map-").append(fileStamp.format(now)).append(".db.gz")
    }

    S3Client.fromEnvironment { region = cfg.awsRegion }.use { s3 ->
        s3.putObject {
            bucket = cfg.s3Bucket
            this.key = key
            body = ByteStream.fromBytes(gz)
        }
    }
    log.info("backup: uploaded to s3://{}/{}", cfg.s3Bucket, key)
}

private fun gzip(data: ByteArray): ByteArray {
    val out = ByteArrayOutputStream()
    GZIPOutputStream(out).use { it.write(data) }
    return out.toByteArray()
}
