package dev.marulabs.noodlemap.jobs

import io.ktor.server.application.Application
import dev.marulabs.noodlemap.Config
import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.backup.runBackup
import dev.marulabs.noodlemap.db.NoodleMapDb
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Duration
import javax.sql.DataSource
import org.slf4j.LoggerFactory

private val log = LoggerFactory.getLogger("BackgroundJobs")

private val SESSION_CLEANUP_INTERVAL = Duration.ofHours(6)
private val BACKUP_INTERVAL = Duration.ofMinutes(30)

/**
 * Launches the two in-process schedulers on the application coroutine scope, porting the
 * Go goroutines. These are inherently safe single-instance jobs (SQLite on one disk).
 * Coroutines are cancelled cleanly on application shutdown.
 */
fun Application.startBackgroundJobs(
    config: Config,
    dataSource: DataSource,
    db: NoodleMapDb,
    sessions: SessionService,
) {
    // Session cleanup: delete expired sessions so the table doesn't grow unbounded.
    launch {
        while (isActive) {
            try {
                withContext(Dispatchers.IO) { sessions.deleteExpired() }
            } catch (e: Exception) {
                log.warn("session cleanup failed", e)
            }
            delay(SESSION_CLEANUP_INTERVAL.toMillis())
        }
    }

    // Backup: snapshot + upload only when the DB changed since the last run.
    launch {
        var lastVersion = -1L
        while (isActive) {
            try {
                val version = withContext(Dispatchers.IO) { readDataVersion(dataSource) }
                if (version == lastVersion) {
                    log.info("backup: no changes since last backup, skipping")
                } else {
                    withContext(Dispatchers.IO) { runBackup(dataSource, config.backup) }
                    lastVersion = version
                }
            } catch (e: Exception) {
                log.warn("backup failed", e)
            }
            delay(BACKUP_INTERVAL.toMillis())
        }
    }
}

private fun readDataVersion(dataSource: DataSource): Long =
    dataSource.connection.use { conn ->
        conn.createStatement().use { st ->
            st.executeQuery("PRAGMA data_version").use { rs ->
                if (rs.next()) rs.getLong(1) else -1L
            }
        }
    }
