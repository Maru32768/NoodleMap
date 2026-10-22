package dev.marulabs.noodlemap.db

import app.cash.sqldelight.ColumnAdapter
import app.cash.sqldelight.driver.jdbc.asJdbcDriver
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import java.util.UUID
import javax.sql.DataSource

/** UUID <-> lowercase text. `UUID.toString()` is already lowercase (CLAUDE.md rule). */
object UuidAdapter : ColumnAdapter<UUID, String> {
    override fun decode(databaseValue: String): UUID = UUID.fromString(databaseValue)
    override fun encode(value: UUID): String = value.toString()
}

/**
 * Builds the SQLite-backed [NoodleMapDb].
 *
 * SQLite access mirrors the Go service: WAL + busy_timeout + foreign_keys=ON. WAL is
 * persistent on the file; busy_timeout and foreign_keys are PER-CONNECTION, so they are
 * set via Hikari `connectionInitSql` on every pooled connection — otherwise foreign_keys
 * silently reverts to OFF and breaks FK enforcement that main.go relies on.
 */
fun buildDataSource(dbPath: String): HikariDataSource {
    val cfg = HikariConfig().apply {
        jdbcUrl = "jdbc:sqlite:$dbPath"
        driverClassName = "org.sqlite.JDBC"
        // Modest pool; drop to 1 if SQLITE_BUSY appears under write contention.
        maximumPoolSize = 6
        // Per-connection PRAGMAs. journal_mode=WAL is persistent but harmless to repeat.
        connectionInitSql = "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;"
    }
    return HikariDataSource(cfg)
}

fun buildDatabase(dataSource: DataSource): NoodleMapDb {
    val driver = dataSource.asJdbcDriver()
    dataSource.connection.use { migrate(it, loadMigrations()) }
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
        // shop_images has no queries, so SQLDelight generates no adapter for it.
    )
}
