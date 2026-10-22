package dev.marulabs.noodlemap

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test

class ConfigTest {

    private val required = mapOf("DB_PATH" to "/data/app.db", "SERVER_PORT" to "8080", "GOOGLE_OAUTH_CLIENT_ID" to "cid")

    private fun load(vararg env: Pair<String, String>) = (required + env).let { Config.fromEnv { key -> it[key] } }

    @Test
    fun `minimal env yields documented defaults`() {
        load() shouldBe Config(
            dbPath = "/data/app.db",
            serverPort = 8080,
            googleOAuthClientId = "cid",
            adminEmail = "",
            cookieSecure = false,
            googlePlacesApiKey = "",
            backup = Config.BackupConfig(snapshotPath = "/data/app.db.bak", s3Bucket = null, s3Prefix = null, awsRegion = null),
        )
    }

    @Test
    fun `each required var must be present and non-blank`() {
        for (key in required.keys) {
            shouldThrow<IllegalStateException> { Config.fromEnv { (required - key)[it] } }.message shouldContain key
            shouldThrow<IllegalStateException> { load(key to " ") }.message shouldContain key
        }
    }

    @Test
    fun `SERVER_PORT must be an integer`() {
        shouldThrow<IllegalStateException> { load("SERVER_PORT" to "http") }.message shouldContain "SERVER_PORT"
    }

    @Test
    fun `AUTH_COOKIE_SECURE accepts only true or false`() {
        load("AUTH_COOKIE_SECURE" to "true").cookieSecure shouldBe true
        load("AUTH_COOKIE_SECURE" to "false").cookieSecure shouldBe false
        load("AUTH_COOKIE_SECURE" to "").cookieSecure shouldBe false
        shouldThrow<IllegalStateException> { load("AUTH_COOKIE_SECURE" to "yes") }.message shouldContain "AUTH_COOKIE_SECURE"
        shouldThrow<IllegalStateException> { load("AUTH_COOKIE_SECURE" to "TRUE") }
    }

    @Test
    fun `google places api key is optional and trimmed`() {
        load("GOOGLE_PLACES_API_KEY" to " key ").googlePlacesApiKey shouldBe "key"
    }

    @Test
    fun `admin email is trimmed and lowercased`() {
        load("ADMIN_EMAIL" to "  Admin@Example.COM ").adminEmail shouldBe "admin@example.com"
    }

    @Test
    fun `backup settings come from env and S3 is enabled only with a bucket`() {
        val backup = load(
            "BACKUP_PATH" to "/backups/snap.db", "S3_BUCKET" to "bucket", "S3_PREFIX" to "noodle/", "AWS_REGION" to "ap-northeast-1",
        ).backup

        backup shouldBe Config.BackupConfig("/backups/snap.db", "bucket", "noodle/", "ap-northeast-1")
        backup.s3Enabled shouldBe true
        load("S3_BUCKET" to " ", "BACKUP_PATH" to "").backup.let {
            it.s3Enabled shouldBe false
            it.snapshotPath shouldBe "/data/app.db.bak"
        }
    }
}
