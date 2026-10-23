package dev.marulabs.noodlemap

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * A local stand-in for R2's S3 API (path style, so object paths are `/<bucket>/<key>`): HEAD answers from
 * [objects], PUT stores, DELETE removes (and succeeds for a missing key, as S3 does); [fail] makes every
 * call 500. Call [stop] when done.
 */
class FakeS3 {
    val objects = ConcurrentHashMap<String, ByteArray>()
    val contentTypes = ConcurrentHashMap<String, String>()
    val requests = CopyOnWriteArrayList<String>()
    @Volatile var fail = false
    @Volatile var headDelayMs = 0L

    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
        executor = Executors.newCachedThreadPool()
        createContext("/") { ex ->
            val path = ex.requestURI.path
            requests += "${ex.requestMethod} $path"
            if (ex.requestMethod == "HEAD") Thread.sleep(headDelayMs)
            val body = ex.requestBody.readBytes()
            val status = when {
                fail -> 500
                ex.requestMethod == "PUT" -> 200.also {
                    objects[path] = body
                    ex.requestHeaders.getFirst("Content-Type")?.let { contentTypes[path] = it }
                }
                ex.requestMethod == "HEAD" -> if (objects.containsKey(path)) 200 else 404
                ex.requestMethod == "DELETE" -> 204.also { objects.remove(path) }
                else -> 405
            }
            ex.sendResponseHeaders(status, -1)
            ex.close()
        }
        start()
    }

    fun r2Config(bucket: String, publicBaseUrl: String) = Config.R2Config(
        bucket = bucket, endpoint = "http://127.0.0.1:${server.address.port}",
        accessKeyId = "kid", secretAccessKey = "secret", publicBaseUrl = publicBaseUrl,
    )

    fun stop() {
        server.stop(0)
        (server.executor as ExecutorService).shutdownNow()
    }
}
