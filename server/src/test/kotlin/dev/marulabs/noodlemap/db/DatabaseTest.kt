package dev.marulabs.noodlemap.db

import io.kotest.matchers.shouldBe
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import org.junit.jupiter.api.Test

class DatabaseTest {

    private fun withDbDir(block: (Path) -> Unit) {
        val dir = Files.createTempDirectory("noodlemap-database")
        try {
            block(dir.resolve("test.db"))
        } finally {
            dir.toFile().deleteRecursively()
        }
    }

    private fun Connection.pragma(name: String): String =
        createStatement().use { st -> st.executeQuery("PRAGMA $name").use { rs -> rs.next(); rs.getString(1) } }

    @Test
    fun `every pooled connection gets the per-connection pragmas`() = withDbDir { file ->
        buildDataSource(file.toString()).use { ds ->
            buildDatabase(ds)
            // Hold several at once so the pool has to open distinct connections.
            val connections = List(ds.maximumPoolSize) { ds.connection }
            try {
                connections.map { it.pragma("foreign_keys") } shouldBe List(connections.size) { "1" }
                connections.map { it.pragma("busy_timeout") } shouldBe List(connections.size) { "5000" }
                connections.map { it.pragma("journal_mode") } shouldBe List(connections.size) { "wal" }
            } finally {
                connections.forEach { it.close() }
            }
        }
    }

    @Test
    fun `existing foreign key violations do not stop startup`() = withDbDir { file ->
        buildDataSource(file.toString()).use { buildDatabase(it) }
        // Written while enforcement is off, as it was before foreign_keys really applied.
        DriverManager.getConnection("jdbc:sqlite:$file").use { conn ->
            conn.createStatement().use { it.executeUpdate("INSERT INTO eaten_shops (id, shop_id, rate) VALUES ('e1', 'missing', 50)") }
        }

        buildDataSource(file.toString()).use { ds ->
            buildDatabase(ds)
            ds.connection.use { it.pragma("foreign_keys") shouldBe "1" }
        }
    }
}
