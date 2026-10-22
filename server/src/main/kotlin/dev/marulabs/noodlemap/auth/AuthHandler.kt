package dev.marulabs.noodlemap.auth

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import dev.marulabs.noodlemap.db.NoodleMapDb
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthGoogleController
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthLogoutController
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthMeController
import dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall
import dev.marulabs.noodlemap.generated.models.AuthResponse
import dev.marulabs.noodlemap.generated.models.GoogleAuthRequest
import dev.marulabs.noodlemap.generated.models.User
import java.util.UUID

/** Auth endpoints, ported from Go `auth/handler.go`. */
class AuthHandler(
    private val db: NoodleMapDb,
    private val google: GoogleVerifier,
    private val sessions: SessionService,
) : ApiV1AuthGoogleController, ApiV1AuthMeController, ApiV1AuthLogoutController {

    override suspend fun googleAuth(googleAuthRequest: GoogleAuthRequest, call: TypedApplicationCall<AuthResponse>) {
        val googleUser = google.verify(googleAuthRequest.credential)
        val (id, email) = findOrCreateUser(googleUser)
        try {
            sessions.createSession(call, id)
        } catch (e: Exception) {
            throw DomainException.SessionCreationFailed(e)
        }
        call.respondTyped(AuthResponse(user = sessions.toUser(id, email)))
    }

    override suspend fun me(call: TypedApplicationCall<User>) {
        call.respondTyped(sessions.requireUser(call))
    }

    override suspend fun logout(call: ApplicationCall) {
        sessions.logout(call)
        call.respond(HttpStatusCode.OK)
    }

    /** Find by google_sub, else insert; tolerate a concurrent first-login insert race. */
    private fun findOrCreateUser(googleUser: GoogleUser): Pair<UUID, String> {
        val users = db.usersQueries
        users.findUserByGoogleSub(googleUser.sub).executeAsOneOrNull()?.let { return it.id to it.email }

        val id = UUID.randomUUID()
        return try {
            users.insertUser(id = id, email = googleUser.email, google_sub = googleUser.sub)
            id to googleUser.email
        } catch (e: Exception) {
            val existing = users.findUserByGoogleSub(googleUser.sub).executeAsOneOrNull()
            if (existing != null) existing.id to existing.email else throw e
        }
    }
}
