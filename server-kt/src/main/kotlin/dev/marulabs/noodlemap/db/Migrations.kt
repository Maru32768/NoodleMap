package dev.marulabs.noodlemap.db

import java.nio.file.FileSystems
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import kotlin.io.path.name
import kotlin.io.path.readText
import org.slf4j.LoggerFactory

/**
 * A goose-format SQL migration (`-- +goose Up` / `Down` / `StatementBegin` / `StatementEnd` /
 * `NO TRANSACTION`). Only the Up section is kept; this server never migrates down.
 */
data class Migration(val version: Long, val statements: List<String>, val useTransaction: Boolean)

private val log = LoggerFactory.getLogger("Migrations")

private const val MIGRATIONS_DIR = "/db/migrations"

fun loadMigrations(): List<Migration> {
    val uri = Migration::class.java.getResource(MIGRATIONS_DIR)?.toURI()
        ?: error("classpath resource $MIGRATIONS_DIR not found")
    if (uri.scheme != "jar") return readMigrations(Path.of(uri))
    return FileSystems.newFileSystem(uri, emptyMap<String, Any>()).use { readMigrations(it.getPath(MIGRATIONS_DIR)) }
}

private fun readMigrations(dir: Path): List<Migration> =
    Files.list(dir).use { files ->
        files.filter { it.name.endsWith(".sql") }
            .map { parseGooseMigration(versionOf(it.name), it.readText()) }
            .toList()
    }.sortedBy { it.version }.also { migrations ->
        val dupes = migrations.groupBy { it.version }.filterValues { it.size > 1 }.keys
        require(dupes.isEmpty()) { "duplicate migration versions: $dupes" }
    }

private fun versionOf(fileName: String): Long =
    fileName.substringBefore('_').toLongOrNull()
        ?: error("migration file name must start with a numeric version: $fileName")

fun parseGooseMigration(version: Long, sql: String): Migration {
    val statements = mutableListOf<String>()
    val current = StringBuilder()
    var section: String? = null
    var inBlock = false
    var useTransaction = true

    for (line in sql.lines()) {
        val directive = line.trim().takeIf { it.startsWith("-- +goose") }?.removePrefix("-- +goose")?.trim()
        when {
            directive == "NO TRANSACTION" -> useTransaction = false
            directive == "Up" || directive == "Down" -> section = directive
            section != "Up" -> Unit
            directive == "StatementBegin" -> inBlock = true
            directive == "StatementEnd" -> {
                inBlock = false
                statements += current.toString().trim()
                current.clear()
            }
            inBlock -> current.appendLine(line)
            line.trim().startsWith("--") || line.isBlank() -> Unit
            else -> {
                current.appendLine(line)
                if (line.trimEnd().endsWith(";")) {
                    statements += current.toString().trim()
                    current.clear()
                }
            }
        }
    }
    check(!inBlock) { "migration $version: unterminated StatementBegin" }
    check(current.isBlank()) { "migration $version: trailing statement without ';'" }
    return Migration(version, statements, useTransaction)
}

/**
 * Applies pending [migrations], tracking them in goose's own `goose_db_version` table so a
 * database migrated by the Go server needs no reconciliation (and the Go server can still
 * read one migrated here).
 */
fun migrate(conn: Connection, migrations: List<Migration>) {
    conn.createStatement().use { st ->
        st.executeUpdate(
            """
            CREATE TABLE IF NOT EXISTS goose_db_version (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version_id INTEGER NOT NULL,
                is_applied INTEGER NOT NULL,
                tstamp TIMESTAMP DEFAULT (datetime('now'))
            )
            """.trimIndent(),
        )
    }
    val current = currentVersion(conn) ?: 0L.also { recordVersion(conn, it) }
    val latest = migrations.maxOfOrNull { it.version } ?: 0L
    check(current <= latest) { "database is at migration $current, newer than this build's latest ($latest)" }

    val pending = migrations.filter { it.version > current }
    if (pending.isEmpty()) {
        log.info("database schema up to date at migration {}", current)
        return
    }
    for (m in pending) {
        log.info("applying migration {}", m.version)
        if (m.useTransaction) inTransaction(conn) { apply(conn, m) } else apply(conn, m)
    }
}

private fun apply(conn: Connection, m: Migration) {
    conn.createStatement().use { st -> m.statements.forEach { st.execute(it) } }
    recordVersion(conn, m.version)
}

private fun currentVersion(conn: Connection): Long? =
    conn.createStatement().use { st ->
        st.executeQuery("SELECT max(version_id) FROM goose_db_version WHERE is_applied = 1").use { rs ->
            rs.next()
            rs.getLong(1).takeUnless { rs.wasNull() }
        }
    }

private fun recordVersion(conn: Connection, version: Long) {
    conn.prepareStatement("INSERT INTO goose_db_version (version_id, is_applied) VALUES (?, 1)").use {
        it.setLong(1, version)
        it.executeUpdate()
    }
}

private fun inTransaction(conn: Connection, block: () -> Unit) {
    conn.autoCommit = false
    try {
        block()
        conn.commit()
    } catch (e: Throwable) {
        conn.rollback()
        throw e
    } finally {
        conn.autoCommit = true
    }
}
