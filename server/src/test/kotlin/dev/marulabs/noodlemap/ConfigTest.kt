package dev.marulabs.noodlemap

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import org.junit.jupiter.api.Test

class ConfigTest {

    private val required = mapOf("DB_PATH" to "/data/app.db", "SERVER_PORT" to "8080", "GOOGLE_OAUTH_CLIENT_ID" to "cid")

    private fun load(vararg env: Pair<String, String>) = (required + env).let { Config.fromEnv { key -> it[key] } }

    private val connection = Config.R2ConnectionConfig("https://acct.r2.cloudflarestorage.com", "kid", "r2-secret")
    private val sharedR2 = arrayOf(
        "R2_ENDPOINT" to "https://acct.r2.cloudflarestorage.com/",
        "R2_ACCESS_KEY_ID" to "kid", "R2_SECRET_ACCESS_KEY" to "r2-secret",
    )

    @Test
    fun `database seed is opt in and blank disables it`() {
        load().dbSeedPath shouldBe null
        load("DB_SEED_PATH" to " ").dbSeedPath shouldBe null
        load("DB_SEED_PATH" to " /data/default.db ").dbSeedPath shouldBe "/data/default.db"
    }

    @Test
    fun `minimal env yields documented defaults`() {
        load() shouldBe Config(
            dbPath = "/data/app.db",
            serverPort = 8080,
            googleOAuthClientId = "cid",
            adminEmail = "",
            cookieSecure = false,
            googlePlacesApiKey = "",
            backup = Config.BackupConfig(snapshotPath = "/data/app.db.bak"),
            publicBaseUrl = "http://localhost:8080",
            ogR2 = null,
            visitImagesR2 = null,
        )
    }

    @Test
    fun `public base url drops the trailing slash`() {
        load("PUBLIC_BASE_URL" to " https://noodle.example/ ").publicBaseUrl shouldBe "https://noodle.example"
    }

    @Test
    fun `shared R2 connection requires all settings and validates the account endpoint`() {
        for (key in sharedR2.map { it.first }) {
            shouldThrow<IllegalStateException> { load(*sharedR2, key to " ") }.message shouldContain "missing: $key"
        }
        shouldThrow<IllegalStateException> { load(*sharedR2, "R2_ENDPOINT" to "acct.r2.cloudflarestorage.com") }
            .message shouldContain "R2_ENDPOINT"
        shouldThrow<IllegalStateException> { load(*sharedR2, "R2_ENDPOINT" to "https://acct.r2.cloudflarestorage.com/og") }
            .message shouldContain "R2_ENDPOINT must be the account endpoint without a path"
        val cfg = load(*sharedR2)
        cfg.ogR2 shouldBe null
        cfg.visitImagesR2 shouldBe null
        cfg.backup.r2 shouldBe null
    }

    @Test
    fun `public buckets require a bucket and public URL together plus the shared connection`() {
        for (prefix in listOf("OG_R2_", "VISIT_IMAGES_R2_")) {
            shouldThrow<IllegalStateException> { load(*sharedR2, "${prefix}BUCKET" to "images") }
                .message shouldContain "missing: ${prefix}PUBLIC_BASE_URL"
            shouldThrow<IllegalStateException> { load(*sharedR2, "${prefix}PUBLIC_BASE_URL" to "https://images.example") }
                .message shouldContain "missing: ${prefix}BUCKET"
            shouldThrow<IllegalStateException> {
                load("${prefix}BUCKET" to "images", "${prefix}PUBLIC_BASE_URL" to "https://images.example")
            }.message shouldContain "requires R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY"
            shouldThrow<IllegalStateException> {
                load(*sharedR2, "${prefix}BUCKET" to "images", "${prefix}PUBLIC_BASE_URL" to "ftp://images.example")
            }.message shouldContain "${prefix}PUBLIC_BASE_URL"
        }
    }

    @Test
    fun `all stores share one connection while preserving their bucket and publication settings`() {
        val cfg = load(
            *sharedR2,
            "OG_R2_BUCKET" to "og", "OG_R2_PUBLIC_BASE_URL" to "https://og.example/",
            "VISIT_IMAGES_R2_BUCKET" to "images", "VISIT_IMAGES_R2_PUBLIC_BASE_URL" to "https://images.example/",
            "BACKUP_R2_BUCKET" to "backups",
        )
        cfg.ogR2 shouldBe Config.R2Config("og", connection, "https://og.example")
        cfg.visitImagesR2 shouldBe Config.R2Config("images", connection, "https://images.example")
        cfg.backup.r2 shouldBe Config.BackupR2Config("backups", connection)
        cfg.toString() shouldNotContain "r2-secret"
        cfg.ogR2.toString() shouldNotContain "r2-secret"
        cfg.visitImagesR2.toString() shouldNotContain "r2-secret"
        cfg.backup.toString() shouldNotContain "r2-secret"
        connection.toString() shouldNotContain "r2-secret"
    }

    @Test
    fun `public base url must be an absolute http url`() {
        load("PUBLIC_BASE_URL" to "http://localhost:5173").publicBaseUrl shouldBe "http://localhost:5173"
        for (bad in listOf("noodle-map.marulabs.dev", "/r", "https://")) {
            shouldThrow<IllegalStateException> { load("PUBLIC_BASE_URL" to bad) }.message shouldContain "PUBLIC_BASE_URL"
        }
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
        load("GOOGLE_PLACES_API_KEY" to "secret-key").toString() shouldNotContain "secret-key"
    }

    @Test
    fun `admin email is trimmed and lowercased`() {
        load("ADMIN_EMAIL" to "  Admin@Example.COM ").adminEmail shouldBe "admin@example.com"
    }

    @Test
    fun `backup only requires its bucket and shared connection without any public URL`() {
        val cfg = load(*sharedR2, "BACKUP_R2_BUCKET" to " backups ", "BACKUP_PATH" to "/backups/snap.db", "BACKUP_R2_PREFIX" to "noodle/")
        cfg.backup shouldBe Config.BackupConfig(
            "/backups/snap.db", Config.BackupR2Config("backups", connection), "noodle/",
        )
        cfg.ogR2 shouldBe null
        cfg.visitImagesR2 shouldBe null
        load("BACKUP_PATH" to " ").backup shouldBe Config.BackupConfig("/data/app.db.bak")
        load(*sharedR2, "BACKUP_R2_PREFIX" to "noodle/").backup.r2 shouldBe null
        shouldThrow<IllegalStateException> { load("BACKUP_R2_BUCKET" to "backups") }
            .message shouldContain "requires R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY"
    }
}
