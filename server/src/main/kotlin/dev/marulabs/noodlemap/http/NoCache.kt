package dev.marulabs.noodlemap.http

import dev.marulabs.noodlemap.og.OG_IMAGE_PATH
import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.request.path
import io.ktor.server.response.header

/**
 * Sets no-cache headers on every response, porting Go `middleware.NoCache`.
 * Headers are written before the response body is committed.
 */
val NoCache = createApplicationPlugin(name = "NoCache") {
    onCall { call ->
        // OGP image URLs carry a content hash; their handler sets a long-lived Cache-Control instead.
        if (call.request.path().startsWith(OG_IMAGE_PATH)) return@onCall
        call.response.header("Cache-Control", "no-store")
        call.response.header("Pragma", "no-cache")
        call.response.header("Expires", "0")
    }
}
