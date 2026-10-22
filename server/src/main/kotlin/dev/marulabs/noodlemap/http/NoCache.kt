package dev.marulabs.noodlemap.http

import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.response.header

/**
 * Sets no-cache headers on every response, porting Go `middleware.NoCache`.
 * Headers are written before the response body is committed.
 */
val NoCache = createApplicationPlugin(name = "NoCache") {
    onCall { call ->
        call.response.header("Cache-Control", "no-store")
        call.response.header("Pragma", "no-cache")
        call.response.header("Expires", "0")
    }
}
