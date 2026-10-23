package dev.marulabs.noodlemap.db

import java.nio.file.Files
import java.nio.file.Path
import java.sql.DriverManager

fun main(args: Array<String>) {
    require(args.size == 1) { "Expected a new database path" }
    val path = Path.of(args.single())
    Files.createFile(path)
    DriverManager.getConnection("jdbc:sqlite:$path").use { connection ->
        migrate(connection, loadMigrations())
    }
}
