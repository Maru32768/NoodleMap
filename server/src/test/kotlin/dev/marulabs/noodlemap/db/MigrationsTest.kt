package dev.marulabs.noodlemap.db

import app.cash.sqldelight.driver.jdbc.asJdbcDriver
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContainAll
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldMatch
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

    /** A connection from the production pool, so its per-connection PRAGMAs (foreign_keys=ON) are real. */
    private fun <T> withPooledDb(block: (Connection) -> T): T {
        val dir = Files.createTempDirectory("noodlemap-migrations")
        try {
            return buildDataSource(dir.resolve("test.db").toString()).use { ds -> ds.connection.use(block) }
        } finally {
            dir.toFile().deleteRecursively()
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
                listOf("users", "sessions", "shops", "tags", "shops_tags", "shop_images", "shop_links", "visit_logs", "visit_menu_items", "visit_images")
            conn.strings("SELECT name FROM sqlite_master WHERE name = 'eaten_shops'") shouldBe emptyList()
            conn.strings("SELECT name FROM sqlite_master WHERE type = 'trigger'") shouldContainAll
                listOf(
                    "update_users_modtime", "update_shops_modtime", "update_tags_modtime", "update_shop_links_modtime",
                    "update_visit_logs_modtime", "update_visit_menu_items_modtime", "update_visit_images_modtime",
                )
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

            migrate(conn, loadMigrations().filter { it.version <= 13 })

            conn.strings("SELECT shop_id || '=' || rate FROM eaten_shops ORDER BY shop_id") shouldBe
                listOf("s1=80.0", "s2=5.0", "s3=95.0")
            conn.strings("SELECT name FROM pragma_table_info('eaten_shops') WHERE name = 'favorite'") shouldBe emptyList()
        }
    }

    @Test
    fun `00013 makes google_place_id nullable without losing child rows`() {
        // A pooled connection has foreign_keys ON, under which a careless rebuild would
        // cascade-delete shops_tags and shop_links when the old table is dropped.
        withPooledDb { conn ->
            conn.strings("PRAGMA foreign_keys") shouldBe listOf("1")
            migrate(conn, loadMigrations().filter { it.version <= 12 })
            conn.createStatement().use { st ->
                st.executeUpdate(
                    """
                    INSERT INTO shops (id, name, lat, lng, postal_code, address, google_place_id, name_kana, closed_at) VALUES
                        ('s1', 'with-place', 1, 2, '100', 'a', 'p1', 'かな', '2024-01-01'),
                        ('s2', 'manual', 3, 4, '200', 'b', '', NULL, NULL),
                        ('s5', 'manual-padded', 0, 0, '', '', '  ', NULL, NULL),
                        ('s6', 'padded-place', 0, 0, '', '', ' p2 ', NULL, NULL),
                        ('s7', 'manual-whitespace', 0, 0, '', '', char(9, 10, 13, 160, 12288, 32), NULL, NULL),
                        ('s8', 'tab-padded-place', 0, 0, '', '', char(9) || 'p3' || char(12288), NULL, NULL)
                    """.trimIndent(),
                )
                st.executeUpdate("INSERT INTO shops_tags (id, shop_id, tag_id) VALUES ('st1', 's1', '018ff6e8-5291-7a01-9ab8-000000000001')")
                st.executeUpdate("INSERT INTO shop_links (id, shop_id, type, url, sort_order) VALUES ('l1', 's1', 'official', 'https://example.com', 0)")
                st.executeUpdate("INSERT INTO eaten_shops (id, shop_id, rate) VALUES ('e1', 's1', 90)")
                st.executeUpdate("INSERT INTO shop_images (id, shop_id, path) VALUES ('i1', 's2', 'x.jpg')")
            }

            migrate(conn, loadMigrations().filter { it.version <= 13 })

            conn.strings(
                "SELECT id || '|' || ifnull(google_place_id, 'NULL') || '|' || ifnull(name_kana, '') || '|' || ifnull(closed_at, '') FROM shops ORDER BY id",
            ) shouldBe listOf("s1|p1|かな|2024-01-01", "s2|NULL||", "s5|NULL||", "s6| p2 ||", "s7|NULL||", "s8|\tp3　||")
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
    fun `00014 turns every eaten record into an undated visit log, drops eaten_shops and keeps shop_images`() {
        // A pooled connection has foreign_keys ON, under which copying an orphaned eaten record would fail.
        withPooledDb { conn ->
            migrate(conn, loadMigrations().filter { it.version <= 13 })
            conn.createStatement().use { st ->
                st.executeUpdate(
                    """
                    INSERT INTO shops (id, name, lat, lng, postal_code, address) VALUES
                        ('s1', 'eaten', 0, 0, '', ''), ('s2', 'eaten-high', 0, 0, '', ''), ('s3', 'wish', 0, 0, '', '')
                    """.trimIndent(),
                )
                // Uppercase ids and an orphan as older data may hold them, written with enforcement off.
                st.execute("PRAGMA foreign_keys = OFF")
                st.executeUpdate(
                    """
                    INSERT INTO eaten_shops (id, shop_id, rate, created_at, updated_at) VALUES
                        ('E1', 'S1', 5, '2020-01-02 03:04:05', '2021-01-02 03:04:05'),
                        ('e2', 's2', 90, '2022-01-01 00:00:00.123456789 +0000 UTC', '2022-01-01 00:00:00'),
                        ('e3', 'gone', 150, '2023-01-01T00:00:00Z', '2023-01-01 00:00:00'),
                        ('e4', 's3', 0, '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
                        ('e5', 'gone-too', -3, '2024-01-01 00:00:00', '2024-01-01 00:00:00')
                    """.trimIndent(),
                )
                st.executeUpdate("INSERT INTO shop_images (id, shop_id, path) VALUES ('i1', 's2', 'x.jpg')")
                st.execute("PRAGMA foreign_keys = ON")
            }

            migrate(conn, loadMigrations())

            conn.strings(
                "SELECT id || '|' || shop_id || '|' || ifnull(visited_on, 'NULL') || '|' || ifnull(rate, 'NULL') || '|' || created_at || '|' || updated_at FROM visit_logs ORDER BY id",
            ) shouldBe listOf(
                // created_at is rewritten as 'YYYY-MM-DD HH:MM:SS.SSS', the format new visit logs get.
                "e1|s1|NULL|5.0|2020-01-02 03:04:05.000|2021-01-02 03:04:05",
                "e2|s2|NULL|90.0|2022-01-01 00:00:00.000|2022-01-01 00:00:00",
                // Kept (and reported at startup) although its shop is gone; an out-of-range rate is clamped.
                "e3|gone|NULL|100.0|2023-01-01 00:00:00.000|2023-01-01 00:00:00",
                // 0 was the old form's default for "not rated"; other values below 0 are clamped.
                "e4|s3|NULL|NULL|2024-01-01 00:00:00.000|2024-01-01 00:00:00",
                "e5|gone-too|NULL|0.0|2024-01-01 00:00:00.000|2024-01-01 00:00:00",
            )
            conn.strings("SELECT name FROM sqlite_master WHERE name = 'eaten_shops'") shouldBe emptyList()
            // Legacy images stay until they are dropped deliberately.
            conn.strings("SELECT id FROM shop_images") shouldBe listOf("i1")
            conn.strings("SELECT ifnull(wish_level, 'NULL') FROM shops ORDER BY id") shouldBe listOf("NULL", "NULL", "NULL")
            conn.strings("PRAGMA foreign_keys") shouldBe listOf("1")

            conn.createStatement().use { st ->
                // Visit logs pin their shop, the wish level takes only the three codes, and rates stay in 0..100.
                shouldThrow<Exception> { st.executeUpdate("DELETE FROM shops WHERE id = 's1'") }
                st.executeUpdate("UPDATE shops SET wish_level = 'high' WHERE id = 's3'")
                shouldThrow<Exception> { st.executeUpdate("UPDATE shops SET wish_level = 'urgent' WHERE id = 's3'") }
                shouldThrow<Exception> { st.executeUpdate("INSERT INTO visit_logs (id, shop_id, rate) VALUES ('v1', 's3', 101)") }
                st.executeUpdate("INSERT INTO visit_logs (id, shop_id) VALUES ('v3', 's3')")
                // A visit date is NULL or a real 'YYYY-MM-DD' date.
                st.executeUpdate("INSERT INTO visit_logs (id, shop_id, visited_on) VALUES ('v4', 's3', NULL), ('v5', 's3', '2026-10-01')")
                for (bad in listOf("2026-02-30", "2026-1-1", "20261001", "2026-10-01T00:00")) {
                    shouldThrow<Exception> { st.executeUpdate("INSERT INTO visit_logs (id, shop_id, visited_on) VALUES ('v6', 's3', '$bad')") }
                    shouldThrow<Exception> { st.executeUpdate("UPDATE visit_logs SET visited_on = '$bad' WHERE id = 'v5'") }
                }
                // 食べたメニュー pin their visit log, need a name of 1..200 characters and a price in 0..10,000,000.
                st.executeUpdate(
                    "INSERT INTO visit_menu_items (id, visit_log_id, name, is_limited, price, sort_order) " +
                        "VALUES ('m1', 'v3', '${"𩸽".repeat(200)}', 1, 10000000, 0)",
                )
                fun insertItem(values: String) =
                    st.executeUpdate("INSERT INTO visit_menu_items (id, visit_log_id, name, price, sort_order) VALUES ($values, 0)")
                shouldThrow<Exception> { insertItem("'m2', 'nope', 'a', NULL") }
                shouldThrow<Exception> { insertItem("'m3', 'v3', '', NULL") }
                shouldThrow<Exception> { insertItem("'m4', 'v3', '${"𩸽".repeat(201)}', NULL") }
                shouldThrow<Exception> { insertItem("'m5', 'v3', 'a', -1") }
                shouldThrow<Exception> { insertItem("'m6', 'v3', 'a', 10000001") }
                shouldThrow<Exception> { st.executeUpdate("DELETE FROM visit_logs WHERE id = 'v3'") }
            }
            conn.strings("SELECT created_at FROM visit_logs WHERE id = 'v3'").single() shouldMatch
                Regex("""\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}""")
        }
    }

    @Test
    fun `a NO TRANSACTION migration is recorded with its own commit, so a crash after it does not re-run it`() {
        withPooledDb { conn ->
            // Fails after its COMMIT, as a crash between the COMMIT and the end of the migration would.
            val statements = listOf("PRAGMA foreign_keys = OFF", "BEGIN", "CREATE TABLE once (id TEXT)", "COMMIT", "NOT VALID SQL")
            shouldThrow<Exception> { migrate(conn, listOf(Migration(1, statements, useTransaction = false))) }

            conn.version() shouldBe 1
            // Re-running would fail on CREATE TABLE if the migration were not recorded.
            migrate(conn, listOf(Migration(1, statements, useTransaction = false)))
            conn.strings("SELECT count(*) FROM goose_db_version WHERE version_id = 1") shouldBe listOf("1")
            conn.strings("PRAGMA foreign_keys") shouldBe listOf("1")
        }
    }

    @Test
    fun `00015 visit images pin their visit log and keep captions to 100 characters`() {
        withPooledDb { conn ->
            migrate(conn, loadMigrations())
            conn.createStatement().use { st ->
                st.executeUpdate("INSERT INTO shops (id, name, lat, lng, postal_code, address) VALUES ('s1', 'shop', 0, 0, '', '')")
                st.executeUpdate("INSERT INTO visit_logs (id, shop_id) VALUES ('v1', 's1')")
                st.executeUpdate(
                    "INSERT INTO visit_images (id, visit_log_id, storage_key, width, height, caption, sort_order) " +
                        "VALUES ('i1', 'v1', 'visits/v1/i1.jpg', 10, 20, '${"あ".repeat(100)}', 0)",
                )
                shouldThrow<Exception> {
                    st.executeUpdate("INSERT INTO visit_images (id, visit_log_id, storage_key, width, height, sort_order) VALUES ('i2', 'nope', 'k', 1, 1, 0)")
                }
                shouldThrow<Exception> {
                    st.executeUpdate(
                        "INSERT INTO visit_images (id, visit_log_id, storage_key, width, height, caption, sort_order) " +
                            "VALUES ('i3', 'v1', 'k', 1, 1, '${"あ".repeat(101)}', 1)",
                    )
                }
                shouldThrow<Exception> { st.executeUpdate("DELETE FROM visit_logs WHERE id = 'v1'") }
            }
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
    fun `failed NO TRANSACTION migration rolls back and turns foreign keys back on`() {
        withPooledDb { conn ->
            val broken = Migration(
                1,
                listOf("PRAGMA foreign_keys = OFF", "BEGIN", "CREATE TABLE half_done (id TEXT)", "NOT VALID SQL", "COMMIT", "PRAGMA foreign_keys = ON"),
                useTransaction = false,
            )

            shouldThrow<Exception> { migrate(conn, listOf(broken)) }

            conn.strings("SELECT name FROM sqlite_master WHERE name = 'half_done'") shouldBe emptyList()
            conn.strings("PRAGMA foreign_keys") shouldBe listOf("1")
            conn.version() shouldBe 0
            // No transaction is left open: starting a new one would fail otherwise.
            conn.createStatement().use { it.execute("BEGIN"); it.execute("ROLLBACK") }
        }
    }

    @Test
    fun `a NO TRANSACTION migration may only run PRAGMAs after its last commit`() {
        fun parse(vararg lines: String) =
            parseGooseMigration(9, (listOf("-- +goose NO TRANSACTION", "-- +goose Up") + lines).joinToString("\n"))

        shouldThrow<IllegalStateException> { parse("BEGIN;", "CREATE TABLE a (id TEXT);", "COMMIT;", "DROP TABLE a;") }.message shouldBe
            "migration 9: only PRAGMA statements may follow the last COMMIT of a NO TRANSACTION migration"
        for (commit in listOf("COMMIT;", "commit transaction;", "END;", "END TRANSACTION;")) {
            shouldThrow<IllegalStateException> { parse("BEGIN;", "CREATE TABLE a (id TEXT);", commit, "INSERT INTO a VALUES ('x');") }
            parse("PRAGMA foreign_keys = OFF;", "BEGIN;", "CREATE TABLE a (id TEXT);", commit, "PRAGMA foreign_keys = ON;")
                .statements.size shouldBe 5
        }
        // Without a commit of its own (like 00009) nothing is recorded early, so anything may follow.
        parse("PRAGMA foreign_keys = OFF;", "UPDATE a SET id = lower(id);", "PRAGMA foreign_keys = ON;").statements.size shouldBe 3
        // Every real migration passes.
        loadMigrations().size shouldBe loadMigrations().maxOf { it.version }.toInt()
    }

    @Test
    fun `END TRANSACTION also marks where a NO TRANSACTION migration is recorded`() {
        withPooledDb { conn ->
            val statements = listOf("BEGIN", "CREATE TABLE once (id TEXT)", "END TRANSACTION", "NOT VALID SQL")
            shouldThrow<Exception> { migrate(conn, listOf(Migration(1, statements, useTransaction = false))) }

            conn.version() shouldBe 1
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
