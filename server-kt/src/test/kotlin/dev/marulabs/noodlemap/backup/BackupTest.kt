package dev.marulabs.noodlemap.backup

import dev.marulabs.noodlemap.TestDb
import dev.marulabs.noodlemap.jobs.startBackgroundJobs
import dev.marulabs.noodlemap.withTestDb
import io.kotest.matchers.shouldBe
import io.ktor.server.testing.testApplication
import java.nio.file.Files
import java.nio.file.Path
import java.sql.DriverManager
import java.time.Instant
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Test

class BackupTest {

    private fun Path.userEmails(): List<String> = DriverManager.getConnection("jdbc:sqlite:$this").use { c ->
        c.createStatement().executeQuery("SELECT email FROM users ORDER BY email").use { rs ->
            buildList { while (rs.next()) add(rs.getString(1)) }
        }
    }

    private val TestDb.snapshot: Path get() = Path.of(config.backup.snapshotPath)

    @Test
    fun `without S3 the backup writes a readable local snapshot, replacing the previous one`() = withTestDb { t ->
        t.seedUser("a@example.com")
        runBlocking { runBackup(t.dataSource, t.config.backup) }
        t.snapshot.userEmails() shouldBe listOf("a@example.com")

        t.seedUser("b@example.com")
        runBlocking { runBackup(t.dataSource, t.config.backup) }
        t.snapshot.userEmails() shouldBe listOf("a@example.com", "b@example.com")
    }

    @Test
    fun `background jobs clean expired sessions and snapshot the database on startup`() = withTestDb { t ->
        val user = t.seedUser("a@example.com")
        t.seedSession(user, expiresAt = Instant.now().minusSeconds(1))
        t.seedSession(user)

        testApplication {
            application { startBackgroundJobs(t.config, t.dataSource, t.db, t.sessions) }
            startApplication()
            withTimeout(10_000) {
                while (t.sessionCount() != 1L || !Files.exists(t.snapshot)) delay(50)
            }
        }

        t.snapshot.userEmails() shouldBe listOf("a@example.com")
    }
}
