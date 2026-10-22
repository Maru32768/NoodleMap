package dev.marulabs.noodlemap

import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import dev.marulabs.noodlemap.auth.AuthHandler
import dev.marulabs.noodlemap.auth.GoogleVerifier
import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.db.buildDataSource
import dev.marulabs.noodlemap.db.buildDatabase
import dev.marulabs.noodlemap.errors.installStatusPages
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthGoogleController.Companion.apiV1AuthGoogleRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthLogoutController.Companion.apiV1AuthLogoutRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthMeController.Companion.apiV1AuthMeRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthShopsController.Companion.apiV1AuthShopsRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthTagsController.Companion.apiV1AuthTagsRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1ShopsController.Companion.apiV1ShopsRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1TagsController.Companion.apiV1TagsRoutes
import dev.marulabs.noodlemap.http.NoCache
import dev.marulabs.noodlemap.jobs.startBackgroundJobs
import dev.marulabs.noodlemap.shops.ShopHandler
import kotlinx.serialization.json.Json

fun main() {
    val config = Config.fromEnv()
    embeddedServer(Netty, port = config.serverPort) {
        module(config)
    }.start(wait = true)
}

fun Application.module(config: Config) {
    val dataSource = buildDataSource(config.dbPath)
    val db = buildDatabase(dataSource)

    val sessions = SessionService(db, config)
    val google = GoogleVerifier(config.googleOAuthClientId)
    val authHandler = AuthHandler(db, google, sessions)
    val shopHandler = ShopHandler(db, sessions)

    startBackgroundJobs(config, dataSource, db, sessions)
    installApp(authHandler, shopHandler)
}

/** Installs plugins and routes. Separated from [module] so tests can wire test handlers. */
fun Application.installApp(authHandler: AuthHandler, shopHandler: ShopHandler) {
    install(ContentNegotiation) {
        // ignoreUnknownKeys matches Gin's BindJSON tolerance for extra fields.
        json(Json { ignoreUnknownKeys = true })
    }
    install(CallLogging)
    install(NoCache)
    installStatusPages()

    // NOTE: do NOT install ForwardedHeaders/XForwardedHeaders — we trust no proxy
    // (parity with Gin SetTrustedProxies(nil)). Auth is enforced per-handler via
    // SessionService.requireUser/requireAdmin, mirroring Gin's middleware semantics.

    routing {
        get("/health") { call.respondText("ok") }

        apiV1ShopsRoutes(shopHandler)
        apiV1TagsRoutes(shopHandler)
        apiV1AuthTagsRoutes(shopHandler)
        apiV1AuthShopsRoutes(shopHandler)

        apiV1AuthGoogleRoutes(authHandler)
        apiV1AuthMeRoutes(authHandler)
        apiV1AuthLogoutRoutes(authHandler)
    }
}
