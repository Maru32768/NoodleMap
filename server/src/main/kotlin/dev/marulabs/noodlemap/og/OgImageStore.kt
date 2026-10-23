package dev.marulabs.noodlemap.og

import aws.sdk.kotlin.services.s3.headObject
import aws.sdk.kotlin.services.s3.model.NotFound
import aws.sdk.kotlin.services.s3.putObject
import aws.smithy.kotlin.runtime.content.ByteStream
import dev.marulabs.noodlemap.Config
import dev.marulabs.noodlemap.common.IMMUTABLE_CACHE_CONTROL
import dev.marulabs.noodlemap.common.r2Client
import java.io.Closeable
import java.util.concurrent.ConcurrentHashMap

private const val MAX_KNOWN_KEYS = 1000

/**
 * Cloudflare R2 (S3-compatible API) holding rendered OGP images, served from the bucket's public
 * custom domain. One client for the app's lifetime; [close] it on shutdown.
 */
class R2OgImageStore(private val cfg: Config.R2Config) : Closeable {
    private val s3 = r2Client(cfg)

    // Keys known to exist, so repeat crawler hits skip the HEAD. Key strings only; cleared when full.
    private val known = ConcurrentHashMap.newKeySet<String>()

    suspend fun exists(key: String): Boolean {
        if (key in known) return true
        val found = try {
            s3.headObject { bucket = cfg.bucket; this.key = key }
            true
        } catch (_: NotFound) {
            false
        }
        if (found) remember(key)
        return found
    }

    suspend fun put(key: String, png: ByteArray) {
        s3.putObject {
            bucket = cfg.bucket
            this.key = key
            body = ByteStream.fromBytes(png)
            contentType = "image/png"
            cacheControl = IMMUTABLE_CACHE_CONTROL
        }
        remember(key)
    }

    fun publicUrl(key: String) = "${cfg.publicBaseUrl}/$key"

    override fun close() = s3.close()

    private fun remember(key: String) {
        if (known.size >= MAX_KNOWN_KEYS) known.clear()
        known.add(key)
    }
}
