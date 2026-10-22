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
                listOf("users", "sessions", "shops", "eaten_shops", "tags", "shops_tags", "shop_images", "shop_links")
            conn.strings("SELECT name FROM sqlite_master WHERE type = 'trigger'") shouldContainAll
                listOf("update_users_modtime", "update_shops_modtime", "update_tags_modtime", "update_shop_links_modtime")
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
    fun `00010 raises existing favorites to rate 80 before dropping the flag`() {
        withDb { conn ->
            migrate(conn, loadMigrations().filter { it.version <= 9 })
            conn.createStatement().use { st ->
                st.executeUpdate(
                    """
                    INSERT INTO shops (id, name, lat, lng, postal_code, address, google_place_id) VALUES
                        ('s1', 'fav', 0, 0, '', '', 'p1'), ('s2', 'plain', 0, 0, '', '', 'p2'), ('s3', 'fav-high', 0, 0, '', '', 'p3')
                    """.trimIndent(),
                )
                st.executeUpdate(
                    "INSERT INTO eaten_shops (id, shop_id, rate, favorite) VALUES ('e1', 's1', 5, 1), ('e2', 's2', 5, 0), ('e3', 's3', 95, 1)",
                )
            }

            migrate(conn, loadMigrations())

            conn.strings("SELECT shop_id || '=' || rate FROM eaten_shops ORDER BY shop_id") shouldBe
                listOf("s1=80.0", "s2=5.0", "s3=95.0")
            conn.strings("SELECT name FROM pragma_table_info('eaten_shops') WHERE name = 'favorite'") shouldBe emptyList()
        }
    }

    @Test
    fun `00013 makes google_place_id nullable without losing child rows`() {
        withDb { conn ->
            // Production connections run with foreign_keys ON; a careless rebuild would then
            // cascade-delete shops_tags and shop_links when the old table is dropped.
            conn.createStatement().use { it.execute("PRAGMA foreign_keys = ON") }
            migrate(conn, loadMigrations().filter { it.version <= 12 })
            conn.createStatement().use { st ->
                st.executeUpdate(
                    """
                    INSERT INTO shops (id, name, lat, lng, postal_code, address, google_place_id, name_kana, closed_at) VALUES
                        ('s1', 'with-place', 1, 2, '100', 'a', 'p1', 'かな', '2024-01-01'),
                        ('s2', 'manual', 3, 4, '200', 'b', '', NULL, NULL)
                    """.trimIndent(),
                )
                st.executeUpdate("INSERT INTO shops_tags (id, shop_id, tag_id) VALUES ('st1', 's1', '018ff6e8-5291-7a01-9ab8-000000000001')")
                st.executeUpdate("INSERT INTO shop_links (id, shop_id, type, url, sort_order) VALUES ('l1', 's1', 'official', 'https://example.com', 0)")
                st.executeUpdate("INSERT INTO eaten_shops (id, shop_id, rate) VALUES ('e1', 's1', 90)")
                st.executeUpdate("INSERT INTO shop_images (id, shop_id, path) VALUES ('i1', 's2', 'x.jpg')")
            }

            migrate(conn, loadMigrations())

            conn.strings(
                "SELECT id || '|' || ifnull(google_place_id, 'NULL') || '|' || ifnull(name_kana, '') || '|' || ifnull(closed_at, '') FROM shops ORDER BY id",
            ) shouldBe listOf("s1|p1|かな|2024-01-01", "s2|NULL||")
            conn.strings("SELECT id FROM shops_tags") shouldBe listOf("st1")
            conn.strings("SELECT id FROM shop_links") shouldBe listOf("l1")
            conn.strings("SELECT id FROM eaten_shops") shouldBe listOf("e1")
            conn.strings("SELECT id FROM shop_images") shouldBe listOf("i1")
            conn.strings("PRAGMA foreign_keys") shouldBe listOf("1")
            conn.strings("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'shops'") shouldBe listOf("update_shops_modtime")

            conn.createStatement().use { st ->
                // Several shops without a place id fit; a duplicate non-null id still does not.
                st.executeUpdate("INSERT INTO shops (id, name, lat, lng, postal_code, address) VALUES ('s3', 'manual-2', 0, 0, '', '')")
                shouldThrow<Exception> {
                    st.executeUpdate("INSERT INTO shops (id, name, lat, lng, postal_code, address, google_place_id) VALUES ('s4', 'dup', 0, 0, '', '', 'p1')")
                }
                // The FK from the children still points at the rebuilt table, with its cascade.
                st.executeUpdate("DELETE FROM shops WHERE id = 's3'")
                shouldThrow<Exception> { st.executeUpdate("INSERT INTO shop_links (id, shop_id, type, url, sort_order) VALUES ('l2', 'nope', 'official', 'https://e.com', 0)") }
                st.executeUpdate("DELETE FROM eaten_shops WHERE shop_id = 's1'")
                st.executeUpdate("DELETE FROM shops WHERE id = 's1'")
            }
            conn.strings("SELECT count(*) FROM shops_tags") shouldBe listOf("0")
            conn.strings("SELECT count(*) FROM shop_links") shouldBe listOf("0")
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
