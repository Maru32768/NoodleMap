package dev.marulabs.noodlemap.common

import aws.sdk.kotlin.runtime.auth.credentials.StaticCredentialsProvider
import aws.sdk.kotlin.services.s3.S3Client
import aws.smithy.kotlin.runtime.net.url.Url
import dev.marulabs.noodlemap.Config

/** Cache-Control for objects whose key changes whenever their content does. */
const val IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable"

/** An S3 client for a Cloudflare R2 bucket. Keep one for the app's lifetime and close it on shutdown. */
fun r2Client(cfg: Config.R2Config): S3Client = S3Client {
    region = "auto"
    endpointUrl = Url.parse(cfg.endpoint)
    forcePathStyle = true
    credentialsProvider = StaticCredentialsProvider {
        accessKeyId = cfg.accessKeyId
        secretAccessKey = cfg.secretAccessKey
    }
}
