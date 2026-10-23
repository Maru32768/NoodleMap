package dev.marulabs.noodlemap.db

import app.cash.sqldelight.ColumnAdapter
import app.cash.sqldelight.driver.jdbc.asJdbcDriver
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import java.sql.Connection
import java.util.UUID
import javax.sql.DataSource
import org.slf4j.LoggerFactory
import org.sqlite.SQLiteConfig

private val log = LoggerFactory.getLogger("Database")

/** UUID <-> lowercase text. `UUID.toString()` is already lowercase (CLAUDE.md rule). */
object UuidAdapter : ColumnAdapter<UUID, String> {
    override fun decode(databaseValue: String): UUID = UUID.fromString(databaseValue)
    override fun encode(value: UUID): String = value.toString()
}

/**
 * Builds the pooled SQLite [HikariDataSource] that [buildDatabase] migrates and wraps.
 *
 * SQLite access mirrors the Go service: WAL + busy_timeout + foreign_keys=ON. WAL is
 * persistent on the file; busy_timeout and foreign_keys are PER-CONNECTION, so sqlite-jdbc
 * applies them (as [SQLiteConfig] driver properties) whenever it opens a pooled connection.
 * Not Hikari `connectionInitSql`: sqlite-jdbc runs only the first statement of a
 * multi-statement string, which left foreign_keys OFF.
 */
fun buildDataSource(dbPath: String): HikariDataSource {
    val cfg = HikariConfig().apply {
        jdbcUrl = "jdbc:sqlite:$dbPath"
        driverClassName = "org.sqlite.JDBC"
        // Modest pool; drop to 1 if SQLITE_BUSY appears under write contention.
        maximumPoolSize = 6
        // Per-connection PRAGMAs. journal_mode=WAL is persistent but harmless to repeat.
        dataSourceProperties = SQLiteConfig().apply {
            setJournalMode(SQLiteConfig.JournalMode.WAL)
            setBusyTimeout(5000)
            enforceForeignKeys(true)
        }.toProperties()
    }
    return HikariDataSource(cfg)
}

fun buildDatabase(dataSource: DataSource): NoodleMapDb {
    val driver = dataSource.asJdbcDriver()
    dataSource.connection.use {
        migrate(it, loadMigrations())
        warnForeignKeyViolations(it)
    }
    return NoodleMapDb(
        driver = driver,
        // Adapter wiring follows the generated `<Table>.Adapter` constructors. Adjust
        // names to match Fabrikt/SQLDelight output if they differ at first build.
        usersAdapter = Users.Adapter(idAdapter = UuidAdapter),
        sessionsAdapter = Sessions.Adapter(idAdapter = UuidAdapter, user_idAdapter = UuidAdapter),
        shopsAdapter = Shops.Adapter(idAdapter = UuidAdapter),
        eaten_shopsAdapter = Eaten_shops.Adapter(idAdapter = UuidAdapter, shop_idAdapter = UuidAdapter),
        tagsAdapter = Tags.Adapter(idAdapter = UuidAdapter),
        shops_tagsAdapter = Shops_tags.Adapter(
            idAdapter = UuidAdapter,
            shop_idAdapter = UuidAdapter,
            tag_idAdapter = UuidAdapter,
        ),
        shop_imagesAdapter = Shop_images.Adapter(idAdapter = UuidAdapter, shop_idAdapter = UuidAdapter),
        shop_linksAdapter = Shop_links.Adapter(idAdapter = UuidAdapter, shop_idAdapter = UuidAdapter),
    )
}

private const val VIOLATION_ROWIDS_LOGGED = 5

/**
 * Logs one WARN summarising rows whose foreign key points at nothing, per table. Enforcement
 * used to be silently off, so an existing database may hold such orphans; they are reported,
 * never deleted, and do not fail boot.
 */
private fun warnForeignKeyViolations(conn: Connection) {
    val rowIdsByTable = linkedMapOf<String, MutableList<Long>>()
    conn.createStatement().use { st ->
        st.executeQuery("PRAGMA foreign_key_check").use { rs ->
            while (rs.next()) rowIdsByTable.getOrPut(rs.getString("table")) { mutableListOf() } += rs.getLong("rowid")
        }
    }
    if (rowIdsByTable.isEmpty()) return
    val summary = rowIdsByTable.entries.joinToString("; ") { (table, rowIds) ->
        val shown = rowIds.take(VIOLATION_ROWIDS_LOGGED).joinToString(", ")
        "$table: ${rowIds.size} (rowid $shown${if (rowIds.size > VIOLATION_ROWIDS_LOGGED) ", ..." else ""})"
    }
    log.warn("foreign key violations (rows referencing missing parents, left in place): {}", summary)
}
