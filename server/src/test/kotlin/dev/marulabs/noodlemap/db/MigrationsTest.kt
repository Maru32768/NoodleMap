package dev.marulabs.noodlemap.db

import app.cash.sqldelight.driver.jdbc.asJdbcDriver
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContainAll
import io.kotest.matchers.shouldBe
import java.nio.file.Files
import java.sql.Connection
import java.sql.DriverManager
import org.junit.jupiter.api.Test

class MigrationsTest {

    private fun <T> withDb(block: (Connection) -> T): T {
        val file = Files.createTempFile("noodlemap-migrations", ".db")
        try {
            return DriverManager.getConnection("jdbc:sqlite:$file").use(block)
        } finally {
            Files.deleteIfExists(file)
        }
    }

    private fun Connection.strings(sql: String): List<String> =
        createStatement().use { st -> st.executeQuery(sql).use { rs -> buildList { while (rs.next()) add(rs.getString(1)) } } }

    private fun Connection.version(): Long =
        createStatement().use { it.executeQuery("SELECT max(version_id) FROM goose_db_version").use { rs -> rs.getLong(1) } }

    @Test
    fun `fresh database gets the full goose schema including modtime triggers`() {
        withDb { conn ->
            val migrations = loadMigrations()
            migrate(conn, migrations)

            conn.version() shouldBe migrations.maxOf { it.version }
            conn.strings("SELECT name FROM sqlite_master WHERE type = 'table'") shouldContainAll
                listOf("users", "sessions", "shops", "eaten_shops", "tags", "shops_tags", "shop_images")
            conn.strings("SELECT name FROM sqlite_master WHERE type = 'trigger'") shouldContainAll
                listOf("update_users_modtime", "update_shops_modtime", "update_tags_modtime")
        }
    }

    @Test
    fun `rerunning on an up-to-date database applies nothing`() {
        withDb { conn ->
            migrate(conn, loadMigrations())
            val rows = conn.strings("SELECT count(*) FROM goose_db_version")

            migrate(conn, loadMigrations())

            conn.strings("SELECT count(*) FROM goose_db_version") shouldBe rows
        }
    }

    @Test
    fun `database newer than the build refuses to start`() {
        withDb { conn ->
            migrate(conn, loadMigrations())

            shouldThrow<IllegalStateException> { migrate(conn, loadMigrations().dropLast(1)) }
        }
    }

    @Test
    fun `failed migration rolls back its statements and is not recorded`() {
        withDb { conn ->
            val broken = Migration(1, listOf("CREATE TABLE half_done (id TEXT)", "NOT VALID SQL"), useTransaction = true)

            shouldThrow<Exception> { migrate(conn, listOf(broken)) }

            conn.strings("SELECT name FROM sqlite_master WHERE name = 'half_done'") shouldBe emptyList()
            conn.version() shouldBe 0
        }
    }

    @Test
    fun `goose parser keeps StatementBegin blocks whole and ignores Down`() {
        val m = parseGooseMigration(
            7,
            """
            -- +goose NO TRANSACTION
            -- +goose Up
            -- a comment
            CREATE TABLE a (id TEXT);
            -- +goose StatementBegin
            CREATE TRIGGER t AFTER UPDATE ON a BEGIN
                UPDATE a SET id = NEW.id;
            END;
            -- +goose StatementEnd
            -- +goose Down
            DROP TABLE a;
            """.trimIndent(),
        )

        m.useTransaction shouldBe false
        m.statements.size shouldBe 2
        m.statements[1] shouldBe "CREATE TRIGGER t AFTER UPDATE ON a BEGIN\n    UPDATE a SET id = NEW.id;\nEND;"
    }

    // The .sq files are SQLDelight's compile-time view of the schema; queries are checked
    // against them, so they must describe the same columns and indexes the migrations create.
    @Test
    fun `sqldelight schema matches the migrated schema`() {
        val migrated = withDb { conn -> migrate(conn, loadMigrations()); describe(conn) }
        val declared = withDb { conn ->
            val file = conn.metaData.url.removePrefix("jdbc:sqlite:")
            buildDataSource(file).use { NoodleMapDb.Schema.create(it.asJdbcDriver()) }
            describe(conn)
        }

        declared shouldBe migrated
    }

    private fun describe(conn: Connection): Map<String, List<String>> =
        conn.strings("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'goose_db_version'")
            .sorted()
            .associateWith { table ->
                val columns = conn.strings(
                    "SELECT name || ' notnull=' || \"notnull\" || ' pk=' || pk || ' default=' || ifnull(dflt_value, '') FROM pragma_table_info('$table')",
                ).sorted()
                val indexes = conn.strings(
                    "SELECT name || ' unique=' || \"unique\" FROM pragma_index_list('$table') WHERE origin = 'c'",
                ).sorted()
                columns + indexes
            }
}
