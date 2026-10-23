package dev.marulabs.noodlemap

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
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
    fun `OG R2 settings are all or nothing and hide the secret`() {
        val r2 = arrayOf(
            "OG_R2_BUCKET" to "og", "OG_R2_ENDPOINT" to "https://acct.r2.cloudflarestorage.com",
            "OG_R2_ACCESS_KEY_ID" to "kid", "OG_R2_SECRET_ACCESS_KEY" to "r2-secret", "OG_R2_PUBLIC_BASE_URL" to "https://og.example/",
        )
        val cfg = load(*r2)

        cfg.ogR2 shouldBe Config.R2Config("og", "https://acct.r2.cloudflarestorage.com", "kid", "r2-secret", "https://og.example")
        cfg.toString() shouldNotContain "r2-secret"
        load(*r2, "OG_R2_ENDPOINT" to "https://acct.r2.cloudflarestorage.com/").ogR2?.endpoint shouldBe
            "https://acct.r2.cloudflarestorage.com"
        shouldThrow<IllegalStateException> { load(*r2.drop(1).dropLast(1).toTypedArray()) }.message.let {
            it shouldContain "missing: OG_R2_BUCKET, OG_R2_PUBLIC_BASE_URL"
            it shouldNotContain "OG_R2_ENDPOINT"
        }
        shouldThrow<IllegalStateException> { load(*r2, "OG_R2_ENDPOINT" to "acct.r2.cloudflarestorage.com") }
            .message shouldContain "OG_R2_ENDPOINT"
        shouldThrow<IllegalStateException> { load(*r2, "OG_R2_ENDPOINT" to "https://acct.r2.cloudflarestorage.com/og") }
            .message shouldContain "OG_R2_ENDPOINT must be the account endpoint without a path"
        shouldThrow<IllegalStateException> { load(*r2, "OG_R2_PUBLIC_BASE_URL" to "ftp://og.example") }
            .message shouldContain "OG_R2_PUBLIC_BASE_URL"
    }

    @Test
    fun `visit image R2 settings are all or nothing, validated like the OG ones, and hide the secret`() {
        val r2 = arrayOf(
            "VISIT_IMAGES_R2_BUCKET" to "images", "VISIT_IMAGES_R2_ENDPOINT" to "https://acct.r2.cloudflarestorage.com/",
            "VISIT_IMAGES_R2_ACCESS_KEY_ID" to "kid", "VISIT_IMAGES_R2_SECRET_ACCESS_KEY" to "images-secret",
            "VISIT_IMAGES_R2_PUBLIC_BASE_URL" to "https://images.example/",
        )
        val cfg = load(*r2)

        cfg.visitImagesR2 shouldBe
            Config.R2Config("images", "https://acct.r2.cloudflarestorage.com", "kid", "images-secret", "https://images.example")
        cfg.ogR2 shouldBe null
        cfg.toString() shouldNotContain "images-secret"
        shouldThrow<IllegalStateException> { load(*r2.drop(3).toTypedArray()) }.message shouldContain
            "Set all VISIT_IMAGES_R2_* variables or none; missing: VISIT_IMAGES_R2_BUCKET, VISIT_IMAGES_R2_ENDPOINT, VISIT_IMAGES_R2_ACCESS_KEY_ID"
        shouldThrow<IllegalStateException> { load(*r2, "VISIT_IMAGES_R2_ENDPOINT" to "https://acct.r2.cloudflarestorage.com/images") }
            .message shouldContain "VISIT_IMAGES_R2_ENDPOINT must be the account endpoint without a path"
        shouldThrow<IllegalStateException> { load(*r2, "VISIT_IMAGES_R2_PUBLIC_BASE_URL" to "images.example") }
            .message shouldContain "VISIT_IMAGES_R2_PUBLIC_BASE_URL"
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
