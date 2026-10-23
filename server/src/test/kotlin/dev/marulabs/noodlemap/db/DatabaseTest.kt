package dev.marulabs.noodlemap.db

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory

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
    fun `existing foreign key violations are logged once per startup and left in place`() = withDbDir { file ->
        buildDataSource(file.toString()).use { buildDatabase(it) }
        // Written while enforcement is off, as it was before foreign_keys really applied.
        DriverManager.getConnection("jdbc:sqlite:$file").use { conn ->
            conn.createStatement().use { st ->
                st.executeUpdate("INSERT INTO visit_logs (id, shop_id, rate) VALUES ('v1', 'missing', 50), ('v2', 'gone', 60)")
                st.executeUpdate("INSERT INTO shop_links (id, shop_id, type, url, sort_order) VALUES ('l1', 'missing', 'other', 'https://e.com', 0)")
            }
        }

        val warnings = captureWarnings("Database") {
            buildDataSource(file.toString()).use { ds ->
                buildDatabase(ds)
                ds.connection.use {
                    it.pragma("foreign_keys") shouldBe "1"
                    // Reported, not deleted.
                    it.createStatement().use { st ->
                        st.executeQuery("SELECT count(*) FROM visit_logs").use { rs -> rs.getInt(1) shouldBe 2 }
                    }
                }
            }
        }

        warnings.size shouldBe 1
        warnings.single() shouldContain "visit_logs: 2 (rowid 1, 2)"
        warnings.single() shouldContain "shop_links: 1 (rowid 1)"
    }

    @Test
    fun `legacy shop_images rows are counted in a startup warning and left in place`() = withDbDir { file ->
        buildDataSource(file.toString()).use { ds ->
            buildDatabase(ds)
            ds.connection.use { c ->
                c.createStatement().use {
                    it.executeUpdate("INSERT INTO shops (id, name, lat, lng, postal_code, address) VALUES ('s1', 'a', 0, 0, '', '')")
                    it.executeUpdate("INSERT INTO shop_images (id, shop_id, path) VALUES ('i1', 's1', 'a.jpg'), ('i2', 's1', 'b.jpg')")
                }
            }
        }

        val warnings = captureWarnings("Database") { buildDataSource(file.toString()).use { buildDatabase(it) } }

        warnings.single() shouldContain "legacy shop_images holds 2 rows"
    }

    @Test
    fun `a clean database logs no foreign key warning`() = withDbDir { file ->
        captureWarnings("Database") { buildDataSource(file.toString()).use { buildDatabase(it) } } shouldBe emptyList()
    }

    private fun captureWarnings(loggerName: String, block: () -> Unit): List<String> {
        val logger = LoggerFactory.getLogger(loggerName) as Logger
        val appender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(appender)
        try {
            block()
        } finally {
            logger.detachAppender(appender)
        }
        return appender.list.filter { it.level == Level.WARN }.map { it.formattedMessage }
    }
}
