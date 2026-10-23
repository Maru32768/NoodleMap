package dev.marulabs.noodlemap.http

import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.receiveText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * Whether the JSON object body names [key] at all, even as `null`. Generated request models read a
 * missing and a null field alike; this tells "omitted = keep" from "null = clear". The generated route has
 * already received the body, so this relies on the DoubleReceive plugin installed in `installApp`.
 */
suspend fun ApplicationCall.jsonBodyHasKey(key: String): Boolean =
    (runCatching { Json.parseToJsonElement(receiveText()) }.getOrNull() as? JsonObject)?.containsKey(key) == true
