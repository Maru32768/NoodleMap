package dev.marulabs.noodlemap.db

import app.cash.sqldelight.ColumnAdapter
import app.cash.sqldelight.driver.jdbc.asJdbcDriver
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import java.sql.Connection
import java.nio.file.Files
import java.nio.file.LinkOption.NOFOLLOW_LINKS
import java.nio.file.Path
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
fun buildDataSource(dbPath: String, seedPath: String? = null): HikariDataSource {
    prepareDatabaseFile(Path.of(dbPath), seedPath?.let(Path::of))
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

internal fun prepareDatabaseFile(target: Path, seed: Path?) {
    if (Files.exists(target, NOFOLLOW_LINKS)) return
    target.toAbsolutePath().parent?.let { Files.createDirectories(it) }
    if (seed != null) Files.copy(seed, target)
}

fun buildDatabase(dataSource: DataSource): NoodleMapDb {
    val driver = dataSource.asJdbcDriver()
    dataSource.connection.use {
        migrate(it, loadMigrations())
        warnForeignKeyViolations(it)
        warnLegacyShopImages(it)
    }
    return NoodleMapDb(
        driver = driver,
        // Adapter wiring follows the generated `<Table>.Adapter` constructors. Adjust
        // names to match Fabrikt/SQLDelight output if they differ at first build.
        usersAdapter = Users.Adapter(idAdapter = UuidAdapter),
        sessionsAdapter = Sessions.Adapter(idAdapter = UuidAdapter, user_idAdapter = UuidAdapter),
        shopsAdapter = Shops.Adapter(idAdapter = UuidAdapter),
        tagsAdapter = Tags.Adapter(idAdapter = UuidAdapter),
        shops_tagsAdapter = Shops_tags.Adapter(
            idAdapter = UuidAdapter,
            shop_idAdapter = UuidAdapter,
            tag_idAdapter = UuidAdapter,
        ),
        shop_imagesAdapter = Shop_images.Adapter(idAdapter = UuidAdapter, shop_idAdapter = UuidAdapter),
        shop_linksAdapter = Shop_links.Adapter(idAdapter = UuidAdapter, shop_idAdapter = UuidAdapter),
        meal_recordsAdapter = Meal_records.Adapter(idAdapter = UuidAdapter, venue_idAdapter = UuidAdapter),
        meal_record_shopsAdapter = Meal_record_shops.Adapter(meal_record_idAdapter = UuidAdapter, shop_idAdapter = UuidAdapter),
        shop_representative_meal_recordsAdapter = Shop_representative_meal_records.Adapter(shop_idAdapter = UuidAdapter, meal_record_idAdapter = UuidAdapter),
        venuesAdapter = Venues.Adapter(idAdapter = UuidAdapter),
        meal_record_imagesAdapter = Meal_record_images.Adapter(idAdapter = UuidAdapter, meal_record_idAdapter = UuidAdapter),
        meal_record_menu_itemsAdapter = Meal_record_menu_items.Adapter(idAdapter = UuidAdapter, meal_record_idAdapter = UuidAdapter),
    )
}

private const val VIOLATION_ROWIDS_LOGGED = 5

/** `shop_images` is unused legacy; its rows are reported so the table can be dropped deliberately later. */
private fun warnLegacyShopImages(conn: Connection) {
    val rows = conn.createStatement().use { st -> st.executeQuery("SELECT count(*) FROM shop_images").use { it.getLong(1) } }
    if (rows > 0) log.warn("legacy shop_images holds {} rows; no code uses them (drop the table once they are not needed)", rows)
}

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
