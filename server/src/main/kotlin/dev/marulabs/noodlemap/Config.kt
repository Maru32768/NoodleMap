package dev.marulabs.noodlemap

import java.net.URI
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
    val ogR2: R2Config?,
    /** R2 bucket holding 記録の画像; null stores them on local disk next to the database instead. */
    val mealRecordImagesR2: R2Config?,
    val dbSeedPath: String? = null,
) {
    data class BackupConfig(
        val snapshotPath: String,
        val r2: BackupR2Config? = null,
        val prefix: String? = null,
    )

    /** Private backup storage; it has no public URL or public bucket requirement. */
    data class BackupR2Config(
        val bucket: String,
        val connection: R2ConnectionConfig,
    )

    /** A Cloudflare R2 bucket reached through its S3 API and served from a public custom domain. */
    data class R2Config(
        val bucket: String,
        val connection: R2ConnectionConfig,
        val publicBaseUrl: String,
    )

    data class R2ConnectionConfig(
        val endpoint: String,
        val accessKeyId: String,
        val secretAccessKey: String,
    ) {
        override fun toString(): String =
            "R2ConnectionConfig(endpoint=$endpoint, accessKeyId=$accessKeyId, secretAccessKey=***)"
    }

    // Keep the Places key and R2 secret out of logs and error messages.
    override fun toString(): String =
        "Config(dbPath=$dbPath, serverPort=$serverPort, googleOAuthClientId=$googleOAuthClientId, adminEmail=$adminEmail, " +
            "cookieSecure=$cookieSecure, googlePlacesApiKey=${if (googlePlacesApiKey.isEmpty()) "" else "***"}, backup=$backup, " +
            "publicBaseUrl=$publicBaseUrl, ogR2=$ogR2, mealRecordImagesR2=$mealRecordImagesR2)"

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
                ?.also { httpUrl("PUBLIC_BASE_URL", it) }
                ?: "http://localhost:$serverPort".also {
                    log.warn("PUBLIC_BASE_URL is empty; share pages use {} for absolute URLs", it)
                }

            val r2Connection = r2Connection(env)
            val ogR2 = r2(env, "OG_R2_", r2Connection)
            if (ogR2 == null) log.info("OG_R2_* not set; OGP images are rendered on every request")
            val mealRecordImagesR2 = r2(env, "MEAL_RECORD_IMAGES_R2_", r2Connection)
            if (mealRecordImagesR2 == null) log.info("MEAL_RECORD_IMAGES_R2_* not set; mealRecord images are stored on local disk")

            return Config(
                dbPath = dbPath,
                serverPort = serverPort,
                googleOAuthClientId = googleOAuthClientId,
                adminEmail = adminEmail.lowercase(),
                cookieSecure = cookieSecure,
                googlePlacesApiKey = googlePlacesApiKey,
                backup = BackupConfig(
                    snapshotPath = snapshotPath,
                    r2 = env("BACKUP_R2_BUCKET")?.trim()?.takeIf { it.isNotEmpty() }?.let {
                        BackupR2Config(it, requireR2Connection(r2Connection, "BACKUP_R2_BUCKET"))
                    },
                    prefix = env("BACKUP_R2_PREFIX")?.trim()?.takeIf { it.isNotEmpty() },
                ),
                publicBaseUrl = publicBaseUrl,
                ogR2 = ogR2,
                mealRecordImagesR2 = mealRecordImagesR2,
                dbSeedPath = env("DB_SEED_PATH")?.trim()?.takeIf { it.isNotEmpty() },
            )
        }

        private fun required(env: (String) -> String?, key: String): String =
            env(key)?.takeIf { it.isNotBlank() } ?: error("$key is missing")

        private fun r2Connection(env: (String) -> String?): R2ConnectionConfig? {
            val keys = listOf("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
            val values = keys.map { env(it)?.trim().orEmpty() }
            return when {
                values.all { it.isEmpty() } -> null
                values.any { it.isEmpty() } ->
                    error("Set all shared R2 connection variables or none; missing: ${keys.filterIndexed { i, _ -> values[i].isEmpty() }.joinToString()}")
                else -> R2ConnectionConfig(r2Endpoint(keys[0], values[0]), values[1], values[2])
            }
        }

        private fun requireR2Connection(connection: R2ConnectionConfig?, setting: String): R2ConnectionConfig =
            connection ?: error("$setting requires R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY")

        /** Returns [value] if it is an absolute http(s) URL with a host; otherwise refuses to boot. */
        private fun httpUrl(key: String, value: String): String {
            val uri = runCatching { URI(value) }.getOrNull()
            if (uri?.scheme?.lowercase() !in setOf("http", "https") || uri?.host.isNullOrEmpty()) {
                error("$key must be an absolute http(s) URL: $value")
            }
            return value
        }

        private fun r2(env: (String) -> String?, prefix: String, connection: R2ConnectionConfig?): R2Config? {
            val keys = listOf("BUCKET", "PUBLIC_BASE_URL").map { prefix + it }
            val values = keys.map { env(it)?.trim().orEmpty() }
            return when {
                values.all { it.isEmpty() } -> null
                values.any { it.isEmpty() } ->
                    error("Set all $prefix* variables or none; missing: ${keys.filterIndexed { i, _ -> values[i].isEmpty() }.joinToString()}")
                else -> R2Config(
                    values[0], requireR2Connection(connection, keys[0]), httpUrl(keys[1], values[1].trimEnd('/')),
                )
            }
        }

        /** The account-level S3 endpoint; the dashboard's bucket-suffixed URL would double the bucket in every key. */
        private fun r2Endpoint(key: String, value: String): String {
            val endpoint = httpUrl(key, value.trimEnd('/'))
            if (!URI(endpoint).rawPath.isNullOrEmpty()) {
                error("$key must be the account endpoint without a path (https://<account_id>.r2.cloudflarestorage.com): $value")
            }
            return endpoint
        }
    }
}
