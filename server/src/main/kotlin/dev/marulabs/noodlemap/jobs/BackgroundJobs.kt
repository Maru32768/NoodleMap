package dev.marulabs.noodlemap.jobs

import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.backup.BackupService
import io.ktor.server.application.Application
import java.time.Duration
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory

private val log = LoggerFactory.getLogger("BackgroundJobs")
private val SESSION_CLEANUP_INTERVAL = Duration.ofHours(6)
private val BACKUP_INTERVAL = Duration.ofMinutes(30)

/** Schedulers share the manual endpoint's backup service and stop on application shutdown. */
fun Application.startBackgroundJobs(sessions: SessionService, backups: BackupService) {
    launch {
        while (isActive) {
            try {
                withContext(Dispatchers.IO) { sessions.deleteExpired() }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                log.warn("session cleanup failed", e)
            }
            delay(SESSION_CLEANUP_INTERVAL.toMillis())
        }
    }
    launch {
        while (isActive) {
            try {
                backups.run()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                log.warn("backup failed", e)
            }
            delay(BACKUP_INTERVAL.toMillis())
        }
    }
}
