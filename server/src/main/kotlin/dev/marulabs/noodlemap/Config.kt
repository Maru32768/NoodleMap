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
    /** R2 bucket holding 訪問画像; null stores them on local disk next to the database instead. */
    val visitImagesR2: R2Config?,
) {
    data class BackupConfig(
        val snapshotPath: String,
        val s3Bucket: String?,
        val s3Prefix: String?,
        val awsRegion: String?,
    ) {
        val s3Enabled: Boolean get() = !s3Bucket.isNullOrBlank()
    }

    /** A Cloudflare R2 bucket reached through its S3 API and served from a public custom domain. */
    data class R2Config(
        val bucket: String,
        val endpoint: String,
        val accessKeyId: String,
        val secretAccessKey: String,
        val publicBaseUrl: String,
    ) {
        override fun toString(): String =
            "R2Config(bucket=$bucket, endpoint=$endpoint, accessKeyId=$accessKeyId, secretAccessKey=***, publicBaseUrl=$publicBaseUrl)"
    }

    // Keep the Places key and R2 secret out of logs and error messages.
    override fun toString(): String =
        "Config(dbPath=$dbPath, serverPort=$serverPort, googleOAuthClientId=$googleOAuthClientId, adminEmail=$adminEmail, " +
            "cookieSecure=$cookieSecure, googlePlacesApiKey=${if (googlePlacesApiKey.isEmpty()) "" else "***"}, backup=$backup, " +
            "publicBaseUrl=$publicBaseUrl, ogR2=$ogR2, visitImagesR2=$visitImagesR2)"

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

            val ogR2 = r2(env, "OG_R2_")
            if (ogR2 == null) log.info("OG_R2_* not set; OGP images are rendered on every request")
            val visitImagesR2 = r2(env, "VISIT_IMAGES_R2_")
            if (visitImagesR2 == null) log.info("VISIT_IMAGES_R2_* not set; visit images are stored on local disk")

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
                visitImagesR2 = visitImagesR2,
            )
        }

        private fun required(env: (String) -> String?, key: String): String =
            env(key)?.takeIf { it.isNotBlank() } ?: error("$key is missing")

        /** Returns [value] if it is an absolute http(s) URL with a host; otherwise refuses to boot. */
        private fun httpUrl(key: String, value: String): String {
            val uri = runCatching { URI(value) }.getOrNull()
            if (uri?.scheme?.lowercase() !in setOf("http", "https") || uri?.host.isNullOrEmpty()) {
                error("$key must be an absolute http(s) URL: $value")
            }
            return value
        }

        /** The five `<prefix>*` variables of one R2 bucket: all of them, or none (null). */
        private fun r2(env: (String) -> String?, prefix: String): R2Config? {
            val keys = listOf("BUCKET", "ENDPOINT", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "PUBLIC_BASE_URL").map { prefix + it }
            val values = keys.map { env(it)?.trim().orEmpty() }
            return when {
                values.all { it.isEmpty() } -> null
                values.any { it.isEmpty() } ->
                    error("Set all $prefix* variables or none; missing: ${keys.filterIndexed { i, _ -> values[i].isEmpty() }.joinToString()}")
                else -> R2Config(
                    values[0], r2Endpoint(keys[1], values[1]), values[2], values[3], httpUrl(keys[4], values[4].trimEnd('/')),
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
