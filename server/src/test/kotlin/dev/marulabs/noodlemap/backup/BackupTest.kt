package dev.marulabs.noodlemap.backup

import com.sun.net.httpserver.HttpServer
import dev.marulabs.noodlemap.Config
import dev.marulabs.noodlemap.TestDb
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.jobs.startBackgroundJobs
import dev.marulabs.noodlemap.session
import dev.marulabs.noodlemap.testApp
import dev.marulabs.noodlemap.withTestDb
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.ktor.client.request.post
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.net.InetSocketAddress
import java.nio.file.Files
import java.nio.file.Path
import java.sql.DriverManager
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.zip.GZIPInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
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
    fun `without R2 the backup writes a readable snapshot and forced runs replace it without DB changes`() = withTestDb { t ->
        BackupService(t.dataSource, t.config.backup).use { backups ->
            t.seedUser("a@example.com")
            runBlocking { backups.run() } shouldBe true
            t.snapshot.userEmails() shouldBe listOf("a@example.com")
            runBlocking { backups.run() } shouldBe false
            Files.delete(t.snapshot)
            runBlocking { backups.run(force = true) } shouldBe true
            t.snapshot.userEmails() shouldBe listOf("a@example.com")
            t.seedUser("b@example.com")
            runBlocking { backups.run() } shouldBe true
            t.snapshot.userEmails() shouldBe listOf("a@example.com", "b@example.com")
        }
    }

    @Test
    fun `a failed snapshot releases admission and remains eligible for the next scheduled run`() = withTestDb { t ->
        val missingDirectory = t.snapshot.resolveSibling("missing-directory")
        val cfg = t.config.backup.copy(snapshotPath = missingDirectory.resolve("snapshot.db").toString())
        BackupService(t.dataSource, cfg).use { backups ->
            shouldThrow<java.sql.SQLException> { runBlocking { backups.run() } }
            Files.createDirectory(missingDirectory)
            runBlocking { backups.run() } shouldBe true
            Path.of(cfg.snapshotPath).userEmails() shouldBe emptyList()
        }
    }

    @Test
    fun `background jobs clean expired sessions and snapshot the database on startup`() = withTestDb { t ->
        val user = t.seedUser("a@example.com")
        t.seedSession(user, expiresAt = Instant.now().minusSeconds(1))
        t.seedSession(user)
        BackupService(t.dataSource, t.config.backup).use { backups ->
            testApplication {
                application { startBackgroundJobs(t.sessions, backups) }
                startApplication()
                withTimeout(10_000) {
                    while (t.sessionCount() != 1L || !Files.exists(t.snapshot)) delay(50)
                }
            }
        }
        t.snapshot.userEmails() shouldBe listOf("a@example.com")
    }

    @Test
    fun `manual backup requires an admin and JSON content type then waits for a readable snapshot`() = testApp { t ->
        val endpoint = "/api/v1/auth/admin/backups"
        client.post(endpoint) { contentType(ContentType.Application.Json) }.status shouldBe HttpStatusCode.Unauthorized
        client.post(endpoint) { session(t.userToken()); contentType(ContentType.Application.Json) }.status shouldBe HttpStatusCode.Forbidden
        val admin = t.adminToken()
        client.post(endpoint) { session(admin) }.status shouldBe HttpStatusCode.BadRequest
        client.post(endpoint) { session(admin); contentType(ContentType.Application.Json) }.status shouldBe HttpStatusCode.NoContent
        t.snapshot.userEmails().contains("admin@example.com") shouldBe true
        Files.delete(t.snapshot)
        client.post(endpoint) { session(admin); contentType(ContentType.Application.Json) }.status shouldBe HttpStatusCode.NoContent
        Files.exists(t.snapshot) shouldBe true
    }

    @Test
    fun `R2 uploads a signed gzip snapshot and rejects overlapping scheduled and forced runs`() = withTestDb { t ->
        val received = CountDownLatch(1)
        val release = CountDownLatch(1)
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        var path = ""
        var authorization = ""
        var uploaded = byteArrayOf()
        server.createContext("/") { exchange ->
            path = exchange.requestURI.path
            authorization = exchange.requestHeaders.getFirst("Authorization")
            uploaded = exchange.requestBody.readAllBytes()
            received.countDown()
            release.await(10, TimeUnit.SECONDS)
            exchange.sendResponseHeaders(200, -1)
            exchange.close()
        }
        server.start()
        try {
            t.seedUser("backup@example.com")
            val cfg = t.config.backup.copy(
                r2 = Config.BackupR2Config("private-backups", Config.R2ConnectionConfig("http://127.0.0.1:${server.address.port}", "test-key", "test-secret")),
                prefix = "db-backup",
            )
            BackupService(t.dataSource, cfg).use { backups ->
                runBlocking {
                    val first = async(Dispatchers.IO) { backups.run() }
                    try {
                        received.await(10, TimeUnit.SECONDS) shouldBe true
                        shouldThrow<DomainException.BackupBusy> { backups.run(force = true) }
                        shouldThrow<DomainException.BackupBusy> { backups.run() }
                    } finally {
                        release.countDown()
                    }
                    first.await() shouldBe true
                }
                path shouldContain "/private-backups/db-backup/"
                authorization shouldContain "Credential=test-key/"
                val restored = t.snapshot.resolveSibling("restored.db")
                Files.write(restored, GZIPInputStream(uploaded.inputStream()).use { it.readAllBytes() })
                restored.userEmails() shouldBe listOf("backup@example.com")
                val firstPath = path
                runBlocking { backups.run(force = true) } shouldBe true
                (path != firstPath) shouldBe true
            }
        } finally {
            release.countDown()
            server.stop(0)
        }
    }
}
