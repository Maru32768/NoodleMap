package dev.marulabs.noodlemap.mealrecords

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

class LocalMealRecordImageMigrationTest {
    @TempDir
    lateinit var directory: Path

    @Test
    fun `opening local storage copies legacy images without deleting originals and can run twice`() {
        val recordId = UUID.randomUUID()
        val imageId = UUID.randomUUID()
        val source = directory.resolve("visit-images/visits/$recordId/$imageId.jpg")
        Files.createDirectories(source.parent)
        Files.write(source, byteArrayOf(1, 2, 3, 4))

        repeat(2) {
            val store = LocalMealRecordImageStore.nextToDatabase(directory.resolve("db.sqlite").toString(), "http://localhost")
            val key = mealRecordImageKey(recordId, imageId)
            val target = store.file(key) ?: error("migrated image missing")
            Files.mismatch(source, target) shouldBe -1L
            store.publicUrl(key) shouldBe "http://localhost/api/v1/meal-record-images/meal-records/$recordId/$imageId.jpg"
        }
        Files.exists(source) shouldBe true
        val target = directory.resolve("meal-record-images/meal-records/$recordId/$imageId.jpg")
        Files.delete(target)
        LocalMealRecordImageStore.nextToDatabase(directory.resolve("db.sqlite").toString(), "http://localhost")
        Files.exists(target) shouldBe false
    }

    @Test
    fun `a partially copied destination resumes and an existing differing image is never overwritten`() {
        val key = "${UUID.randomUUID()}/${UUID.randomUUID()}.jpg"
        val source = directory.resolve("visit-images/visits/$key")
        Files.createDirectories(source.parent)
        Files.write(source, byteArrayOf(1, 2))
        val target = directory.resolve("meal-record-images/meal-records/$key")
        Files.createDirectories(target.parent)
        Files.write(target.parent.resolve("migration-interrupted.tmp"), byteArrayOf(9))

        Files.write(target, byteArrayOf(9))
        shouldThrow<IllegalStateException> { migrateLocalMealRecordImages(directory) }
        Files.readAllBytes(target).toList() shouldBe listOf<Byte>(9)
        Files.readAllBytes(source).toList() shouldBe listOf<Byte>(1, 2)
        Files.delete(target)
        migrateLocalMealRecordImages(directory)
        Files.readAllBytes(target).toList() shouldBe listOf<Byte>(1, 2)
    }
}
