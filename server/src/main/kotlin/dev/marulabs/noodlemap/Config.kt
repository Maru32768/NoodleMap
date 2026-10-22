package dev.marulabs.noodlemap

import org.slf4j.LoggerFactory

/**
 * Typed application configuration, loaded from environment variables with fail-fast
 * validation. Mirrors the Go `env.go` + `run()` startup checks: required vars missing →
 * refuse to boot; ADMIN_EMAIL empty → warn and continue.
 */
data class Config(
    val dbPath: String,
    val serverPort: Int,
    val googleOAuthClientId: String,
    val adminEmail: String,
    val cookieSecure: Boolean,
    val googlePlacesApiKey: String,
    val backup: BackupConfig,
    /** Origin of the public site, used for absolute share/OGP URLs. */
    val publicBaseUrl: String,
    /** R2 bucket that caches OGP images; null renders them on every request instead. */
    val ogR2: OgR2Config?,
) {
    data class BackupConfig(
        val snapshotPath: String,
        val s3Bucket: String?,
        val s3Prefix: String?,
        val awsRegion: String?,
    ) {
        val s3Enabled: Boolean get() = !s3Bucket.isNullOrBlank()
    }

    data class OgR2Config(
        val bucket: String,
        val endpoint: String,
        val accessKeyId: String,
        val secretAccessKey: String,
        val publicBaseUrl: String,
    ) {
        override fun toString(): String =
            "OgR2Config(bucket=$bucket, endpoint=$endpoint, accessKeyId=$accessKeyId, secretAccessKey=***, publicBaseUrl=$publicBaseUrl)"
    }

    // Keep the Places key and R2 secret out of logs and error messages.
    override fun toString(): String =
        "Config(dbPath=$dbPath, serverPort=$serverPort, googleOAuthClientId=$googleOAuthClientId, adminEmail=$adminEmail, " +
            "cookieSecure=$cookieSecure, googlePlacesApiKey=${if (googlePlacesApiKey.isEmpty()) "" else "***"}, backup=$backup, " +
            "publicBaseUrl=$publicBaseUrl, ogR2=$ogR2)"

    companion object {
        private val log = LoggerFactory.getLogger(Config::class.java)

        fun fromEnv(env: (String) -> String? = System::getenv): Config {
            val dbPath = required(env, "DB_PATH")
            val serverPort = required(env, "SERVER_PORT").let {
                it.toIntOrNull() ?: error("SERVER_PORT must be an integer: $it")
            }
            val googleOAuthClientId = required(env, "GOOGLE_OAUTH_CLIENT_ID")

            val adminEmail = env("ADMIN_EMAIL").orEmpty().trim()
            if (adminEmail.isEmpty()) {
                log.warn("ADMIN_EMAIL is empty; no users will be granted admin privileges")
            }

            val cookieSecure = env("AUTH_COOKIE_SECURE")?.takeIf { it.isNotBlank() }?.let {
                it.toBooleanStrictOrNull() ?: error("AUTH_COOKIE_SECURE must be a boolean: $it")
            } ?: false

            val googlePlacesApiKey = env("GOOGLE_PLACES_API_KEY").orEmpty().trim()
            if (googlePlacesApiKey.isEmpty()) {
                log.warn("GOOGLE_PLACES_API_KEY is empty; Google Place search for admins is disabled")
            }

            val snapshotPath = env("BACKUP_PATH")?.takeIf { it.isNotBlank() } ?: "$dbPath.bak"

            val publicBaseUrl = env("PUBLIC_BASE_URL")?.trim()?.trimEnd('/')?.takeIf { it.isNotEmpty() }
                ?: "http://localhost:$serverPort".also {
                    log.warn("PUBLIC_BASE_URL is empty; share pages use {} for absolute URLs", it)
                }

            val r2Keys = listOf("OG_R2_BUCKET", "OG_R2_ENDPOINT", "OG_R2_ACCESS_KEY_ID", "OG_R2_SECRET_ACCESS_KEY", "OG_R2_PUBLIC_BASE_URL")
            val r2 = r2Keys.map { env(it)?.trim().orEmpty() }
            val ogR2 = when {
                r2.all { it.isEmpty() } -> null
                r2.any { it.isEmpty() } -> error("${r2Keys.joinToString()} must be set together")
                else -> OgR2Config(r2[0], r2[1], r2[2], r2[3], r2[4].trimEnd('/'))
            }
            if (ogR2 == null) log.info("OG_R2_* not set; OGP images are rendered on every request")

            return Config(
                dbPath = dbPath,
                serverPort = serverPort,
                googleOAuthClientId = googleOAuthClientId,
                adminEmail = adminEmail.lowercase(),
                cookieSecure = cookieSecure,
                googlePlacesApiKey = googlePlacesApiKey,
                backup = BackupConfig(
                    snapshotPath = snapshotPath,
                    s3Bucket = env("S3_BUCKET")?.takeIf { it.isNotBlank() },
                    s3Prefix = env("S3_PREFIX")?.takeIf { it.isNotBlank() },
                    awsRegion = env("AWS_REGION")?.takeIf { it.isNotBlank() },
                ),
                publicBaseUrl = publicBaseUrl,
                ogR2 = ogR2,
            )
        }

        private fun required(env: (String) -> String?, key: String): String =
            env(key)?.takeIf { it.isNotBlank() } ?: error("$key is missing")
    }
}
