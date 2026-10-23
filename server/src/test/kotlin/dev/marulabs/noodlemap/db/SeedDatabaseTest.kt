package dev.marulabs.noodlemap.db

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

class SeedDatabaseTest {
    @TempDir
    lateinit var directory: Path

    private val seed = Path.of("../db/default.db").toAbsolutePath()

    private fun Connection.count(table: String): Int = createStatement().use { statement ->
        statement.executeQuery("SELECT count(*) FROM $table").use { rows -> rows.next(); rows.getInt(1) }
    }

    @Test
    fun `first startup copies a complete seed and subsequent startups preserve changes`() {
        val original = Files.readAllBytes(seed)
        val target = directory.resolve("nested/local.db")
        buildDataSource(target.toString(), seed.toString()).use { source ->
            buildDatabase(source)
            source.connection.use { connection ->
                connection.count("shops") shouldBe 1465
                connection.count("visit_logs") shouldBe 468
                connection.count("users") shouldBe 0
                connection.count("sessions") shouldBe 0
                connection.createStatement().use { statement ->
                    statement.executeQuery("PRAGMA integrity_check").use { rows -> rows.next(); rows.getString(1) shouldBe "ok" }
                    statement.executeQuery("PRAGMA foreign_key_check").use { rows -> rows.next() shouldBe false }
                    statement.executeUpdate("DELETE FROM visit_logs")
                }
            }
        }
        buildDataSource(target.toString(), directory.resolve("missing-seed.db").toString()).use { source ->
            buildDatabase(source)
            source.connection.use { it.count("visit_logs") shouldBe 0 }
        }
        Files.readAllBytes(seed).contentEquals(original) shouldBe true
        Files.exists(Path.of("$seed-wal")) shouldBe false
        Files.exists(Path.of("$seed-shm")) shouldBe false
    }

    @Test
    fun `an existing empty file is migrated without seeding`() {
        val target = Files.createFile(directory.resolve("empty.db"))
        buildDataSource(target.toString(), seed.toString()).use { source ->
            buildDatabase(source)
            source.connection.use { it.count("shops") shouldBe 0 }
        }
    }

    @Test
    fun `without a seed a missing database starts empty`() {
        buildDataSource(directory.resolve("nested/empty.db").toString()).use { source ->
            buildDatabase(source)
            source.connection.use { it.count("shops") shouldBe 0 }
        }
    }

    @Test
    fun `a copied database still accepts pending migrations`() {
        val target = directory.resolve("older.db")
        buildDataSource(target.toString(), seed.toString()).use { source ->
            source.connection.use { connection ->
                val migrations = loadMigrations()
                val pending = Migration(migrations.maxOf { it.version } + 1,
                    listOf("CREATE TABLE seed_migration_probe (id INTEGER);"), true)
                migrate(connection, migrations + pending)
                connection.count("seed_migration_probe") shouldBe 0
                connection.count("shops") shouldBe 1465
            }
        }
    }

    @Test
    fun `a missing configured seed fails without creating an empty database`() {
        val target = directory.resolve("missing.db")
        shouldThrow<java.nio.file.NoSuchFileException> {
            buildDataSource(target.toString(), directory.resolve("absent.db").toString())
        }
        Files.exists(target) shouldBe false
    }
}
