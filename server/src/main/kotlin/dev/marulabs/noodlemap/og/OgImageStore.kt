package dev.marulabs.noodlemap.og

import aws.sdk.kotlin.runtime.auth.credentials.StaticCredentialsProvider
import aws.sdk.kotlin.services.s3.S3Client
import aws.sdk.kotlin.services.s3.headObject
import aws.sdk.kotlin.services.s3.model.NotFound
import aws.sdk.kotlin.services.s3.putObject
import aws.smithy.kotlin.runtime.content.ByteStream
import aws.smithy.kotlin.runtime.net.url.Url
import dev.marulabs.noodlemap.Config

/** Where rendered OGP images are kept and served from. */
fun interface OgImageStore {
    /** Makes sure [key] exists, calling [render] only when it is missing, and returns the object's public URL. */
    suspend fun publicUrl(key: String, render: suspend () -> ByteArray): String
}

/** Cloudflare R2 through its S3-compatible API; objects are served from the bucket's public custom domain. */
class R2OgImageStore(private val cfg: Config.OgR2Config) : OgImageStore {
    override suspend fun publicUrl(key: String, render: suspend () -> ByteArray): String {
        // A client per call: crawlers fetch rarely, and `use` always closes its HTTP engine.
        S3Client {
            region = "auto"
            endpointUrl = Url.parse(cfg.endpoint)
            forcePathStyle = true
            credentialsProvider = StaticCredentialsProvider {
                accessKeyId = cfg.accessKeyId
                secretAccessKey = cfg.secretAccessKey
            }
        }.use { s3 ->
            val exists = try {
                s3.headObject { bucket = cfg.bucket; this.key = key }
                true
            } catch (_: NotFound) {
                false
            }
            if (!exists) {
                val png = render()
                s3.putObject {
                    bucket = cfg.bucket
                    this.key = key
                    body = ByteStream.fromBytes(png)
                    contentType = "image/png"
                    cacheControl = "public, max-age=31536000, immutable"
                }
            }
        }
        return "${cfg.publicBaseUrl}/$key"
    }
}
