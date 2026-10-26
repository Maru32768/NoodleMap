package dev.marulabs.noodlemap.mealrecords

import java.nio.file.Files
import java.nio.file.LinkOption.NOFOLLOW_LINKS
import java.nio.file.Path
import java.nio.file.StandardCopyOption.ATOMIC_MOVE

private val LEGACY_IMAGE_KEY = Regex("""visits/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.jpg""")

internal fun legacyMealRecordImageAlias(key: String): String? =
    key.takeIf { it.startsWith("meal-records/") }?.let { "visits/${it.removePrefix("meal-records/")}" }

internal fun migrateLocalMealRecordImages(databaseDirectory: Path) {
    val sourceRoot = databaseDirectory.resolve("visit-images")
    if (!Files.exists(sourceRoot, NOFOLLOW_LINKS)) return
    check(Files.isDirectory(sourceRoot, NOFOLLOW_LINKS)) { "legacy image directory must be a directory without symbolic links" }
    val targetRoot = databaseDirectory.resolve("meal-record-images")
    ensureImageDirectories(databaseDirectory, targetRoot)
    val complete = targetRoot.resolve(".legacy-copy-complete")
    if (Files.exists(complete, NOFOLLOW_LINKS)) {
        check(Files.isRegularFile(complete, NOFOLLOW_LINKS) && Files.readString(complete) == "meal-record-images-v1\n") {
            "invalid local image migration marker: $complete"
        }
        return
    }
    Files.walk(sourceRoot).use { paths ->
        paths.forEach { source ->
            check(!Files.isSymbolicLink(source)) { "legacy image path must not be a symbolic link: $source" }
            if (Files.isRegularFile(source, NOFOLLOW_LINKS)) {
                val key = sourceRoot.relativize(source).joinToString("/")
                if (LEGACY_IMAGE_KEY.matches(key)) {
                    val target = targetRoot.resolve("meal-records/${key.removePrefix("visits/")}")
                    ensureImageDirectories(databaseDirectory, target.parent)
                    if (Files.exists(target, NOFOLLOW_LINKS)) {
                        check(Files.isRegularFile(target, NOFOLLOW_LINKS) && Files.mismatch(source, target) == -1L) {
                            "existing migrated image differs from its source: $target"
                        }
                    } else {
                        val temporary = Files.createTempFile(target.parent, "migration-", ".tmp")
                        try {
                            Files.copy(source, temporary, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
                            check(Files.mismatch(source, temporary) == -1L) { "image copy verification failed: $source" }
                            Files.move(temporary, target, ATOMIC_MOVE)
                        } finally {
                            Files.deleteIfExists(temporary)
                        }
                    }
                }
            }
        }
    }
    val temporary = Files.createTempFile(targetRoot, "migration-complete-", ".tmp")
    try {
        Files.writeString(temporary, "meal-record-images-v1\n")
        Files.move(temporary, complete, ATOMIC_MOVE)
    } finally {
        Files.deleteIfExists(temporary)
    }
}

private fun ensureImageDirectories(root: Path, directory: Path) {
    var current = root
    for (part in root.relativize(directory)) {
        current = current.resolve(part)
        check(!Files.isSymbolicLink(current)) { "image destination must not be a symbolic link: $current" }
        Files.createDirectories(current)
    }
}
