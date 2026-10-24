package dev.marulabs.noodlemap.backup

import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthAdminBackupsController
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.contentType
import io.ktor.server.response.respond
class BackupHandler(private val sessions: SessionService, private val backups: BackupService) : ApiV1AuthAdminBackupsController {
    override suspend fun forceBackup(call: ApplicationCall) {
        sessions.requireAdmin(call)
        // A JSON content type forces cross-origin browsers through a CORS preflight.
        if (!call.request.contentType().match(ContentType.Application.Json)) {
            throw DomainException.InvalidRequest("application/json content type required")
        }
        backups.run(force = true)
        call.respond(HttpStatusCode.NoContent)
    }
}
