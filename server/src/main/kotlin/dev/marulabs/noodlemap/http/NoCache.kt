package dev.marulabs.noodlemap.http

import io.ktor.http.HttpHeaders
import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.response.header

/**
 * Sets no-cache headers on every response, porting Go `middleware.NoCache`, unless the handler
 * set its own Cache-Control (immutable OGP images). Runs when the response is sent, before
 * its headers are committed.
 */
val NoCache = createApplicationPlugin(name = "NoCache") {
    onCallRespond { call ->
        if (call.response.headers.contains(HttpHeaders.CacheControl)) return@onCallRespond
        call.response.header(HttpHeaders.CacheControl, "no-store")
        call.response.header(HttpHeaders.Pragma, "no-cache")
        call.response.header(HttpHeaders.Expires, "0")
    }
}
