package dev.marulabs.noodlemap

import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationStopped
import javax.imageio.ImageIO
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
import dev.marulabs.noodlemap.common.BitmapWorkGate
import dev.marulabs.noodlemap.db.buildDataSource
import dev.marulabs.noodlemap.db.buildDatabase
import dev.marulabs.noodlemap.errors.installStatusPages
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthGoogleController.Companion.apiV1AuthGoogleRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthGooglePlacesAutocompleteController.Companion.apiV1AuthGooglePlacesAutocompleteRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthGooglePlacesDetailsController.Companion.apiV1AuthGooglePlacesDetailsRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthLogoutController.Companion.apiV1AuthLogoutRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthMeController.Companion.apiV1AuthMeRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthSessionsController.Companion.apiV1AuthSessionsRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthSessionsRevokeOthersController.Companion.apiV1AuthSessionsRevokeOthersRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthShopsController.Companion.apiV1AuthShopsRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthShopsVisitsController.Companion.apiV1AuthShopsVisitsRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthVisitImagesController.Companion.apiV1AuthVisitImagesRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthVisitsController.Companion.apiV1AuthVisitsRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthVisitsImagesOrderController.Companion.apiV1AuthVisitsImagesOrderRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1AuthTagsController.Companion.apiV1AuthTagsRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1ShopsController.Companion.apiV1ShopsRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1ShopsVisitsController.Companion.apiV1ShopsVisitsRoutes
import dev.marulabs.noodlemap.generated.controllers.ApiV1TagsController.Companion.apiV1TagsRoutes
import dev.marulabs.noodlemap.http.NoCache
import dev.marulabs.noodlemap.jobs.startBackgroundJobs
import dev.marulabs.noodlemap.og.OgHandler
import dev.marulabs.noodlemap.og.R2OgImageStore
import dev.marulabs.noodlemap.og.ogRoutes
import dev.marulabs.noodlemap.places.PlacesHandler
import dev.marulabs.noodlemap.shops.ShopHandler
import dev.marulabs.noodlemap.visits.VisitImageHandler
import dev.marulabs.noodlemap.visits.VisitLogHandler
import dev.marulabs.noodlemap.visits.visitImageRoutes
import dev.marulabs.noodlemap.visits.visitImageStoreFor
import kotlinx.serialization.json.Json

fun main() {
    // OGP images are drawn with Java2D; the container has no display.
    System.setProperty("java.awt.headless", "true")
    // PNG encoding stays in memory instead of writing ImageIO temp files.
    ImageIO.setUseCache(false)
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
    // OGP renders and visit image uploads share one bound on bitmap memory.
    val bitmapWork = BitmapWorkGate(maxPending = 3)
    val visitImageStore = visitImageStoreFor(config)
    monitor.subscribe(ApplicationStopped) { visitImageStore.close() }
    val shopHandler = ShopHandler(db, sessions, visitImageStore)
    val visitLogHandler = VisitLogHandler(db, sessions, visitImageStore)
    val visitImageHandler = VisitImageHandler(db, sessions, visitImageStore, bitmapWork, config.publicBaseUrl)
    val placesHandler = PlacesHandler(sessions, config.googlePlacesApiKey)
    val ogStore = config.ogR2?.let(::R2OgImageStore)
    ogStore?.let { store -> monitor.subscribe(ApplicationStopped) { store.close() } }
    val ogHandler = OgHandler(shopHandler, config.publicBaseUrl, ogStore, visitImageStore, bitmapWork)

    startBackgroundJobs(config, dataSource, db, sessions)
    installApp(authHandler, shopHandler, visitLogHandler, visitImageHandler, placesHandler, ogHandler)
}

/** Installs plugins and routes. Separated from [module] so tests can wire test handlers. */
fun Application.installApp(
    authHandler: AuthHandler,
    shopHandler: ShopHandler,
    visitLogHandler: VisitLogHandler,
    visitImageHandler: VisitImageHandler,
    placesHandler: PlacesHandler,
    ogHandler: OgHandler,
) {
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
        apiV1ShopsVisitsRoutes(visitLogHandler)
        apiV1AuthShopsVisitsRoutes(visitLogHandler)
        apiV1AuthVisitsRoutes(visitLogHandler)
        apiV1AuthVisitsImagesOrderRoutes(visitImageHandler)
        apiV1AuthVisitImagesRoutes(visitImageHandler)
        // The upload streams its multipart body, so it is a plain route (see visitImageRoutes).
        visitImageRoutes(visitImageHandler)

        apiV1AuthGoogleRoutes(authHandler)
        apiV1AuthMeRoutes(authHandler)
        apiV1AuthLogoutRoutes(authHandler)
        apiV1AuthSessionsRoutes(authHandler)
        apiV1AuthSessionsRevokeOthersRoutes(authHandler)

        apiV1AuthGooglePlacesAutocompleteRoutes(placesHandler)
        apiV1AuthGooglePlacesDetailsRoutes(placesHandler)

        // Plain routes, not TypeSpec: they answer HTML/PNG/redirects for crawlers, not a JSON API the web client calls.
        ogRoutes(ogHandler)
    }
}
