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
) {
    data class BackupConfig(
        val snapshotPath: String,
        val s3Bucket: String?,
        val s3Prefix: String?,
        val awsRegion: String?,
    ) {
        val s3Enabled: Boolean get() = !s3Bucket.isNullOrBlank()
    }

    // Keep the Places key out of logs and error messages.
    override fun toString(): String =
        "Config(dbPath=$dbPath, serverPort=$serverPort, googleOAuthClientId=$googleOAuthClientId, adminEmail=$adminEmail, " +
            "cookieSecure=$cookieSecure, googlePlacesApiKey=${if (googlePlacesApiKey.isEmpty()) "" else "***"}, backup=$backup)"

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
            )
        }

        private fun required(env: (String) -> String?, key: String): String =
            env(key)?.takeIf { it.isNotBlank() } ?: error("$key is missing")
    }
}
