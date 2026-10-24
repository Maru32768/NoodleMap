package dev.marulabs.noodlemap

import com.zaxxer.hikari.HikariDataSource
import dev.marulabs.noodlemap.auth.AuthHandler
import dev.marulabs.noodlemap.auth.GoogleVerifier
import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.auth.SessionTokens
import dev.marulabs.noodlemap.common.BitmapWorkGate
import dev.marulabs.noodlemap.common.SessionTime
import dev.marulabs.noodlemap.db.NoodleMapDb
import dev.marulabs.noodlemap.db.buildDataSource
import dev.marulabs.noodlemap.db.buildDatabase
import dev.marulabs.noodlemap.generated.models.AddShopRequest
import dev.marulabs.noodlemap.generated.models.CategorySlug
import dev.marulabs.noodlemap.generated.models.UpdateShopRequest
import dev.marulabs.noodlemap.og.OgHandler
import dev.marulabs.noodlemap.og.R2OgImageStore
import dev.marulabs.noodlemap.places.PlacesHandler
import dev.marulabs.noodlemap.shops.ShopHandler
import dev.marulabs.noodlemap.visits.LocalVisitImageStore
import dev.marulabs.noodlemap.visits.VisitImageHandler
import dev.marulabs.noodlemap.visits.VisitImageStore
import dev.marulabs.noodlemap.visits.VisitLogHandler
import io.ktor.client.HttpClient
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.cookie
import io.ktor.client.request.delete
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import java.net.http.HttpClient as JdkHttpClient
import java.nio.file.Files
import java.time.Instant
import java.util.UUID
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlinx.serialization.json.Json

const val ADMIN_EMAIL = "admin@example.com"

val testJson = Json { ignoreUnknownKeys = true }

/** One JDK client for every test app's PlacesHandler instead of a selector thread per test. */
private val placesHttp = JdkHttpClient.newHttpClient()

/** A migrated SQLite file DB plus the real services built on it. */
class TestDb(val config: Config, val dataSource: HikariDataSource, val db: NoodleMapDb) {
    val sessions = SessionService(db, config)
    val localVisitImages = LocalVisitImageStore.nextToDatabase(config.dbPath, config.publicBaseUrl)

    fun seedUser(email: String): UUID =
        UUID.randomUUID().also { db.usersQueries.insertUser(id = it, email = email, google_sub = "sub-$it") }

    /** Inserts a session row for [userId] and returns the raw cookie token. */
    fun seedSession(userId: UUID, expiresAt: Instant = Instant.now().plus(SessionService.TTL)): String =
        SessionTokens.newToken().also {
            db.sessionsQueries.insertSession(UUID.randomUUID(), userId, SessionTokens.hash(it), "test", SessionTime.format(expiresAt))
        }

    fun adminToken(): String = seedSession(seedUser(ADMIN_EMAIL))
    fun userToken(): String = seedSession(seedUser("user-${UUID.randomUUID()}@example.com"))

    fun sessionCount(): Long =
        dataSource.connection.use { c -> c.createStatement().executeQuery("SELECT count(*) FROM sessions").use { it.getLong(1) } }
}

fun testConfig(
    dbPath: String,
    adminEmail: String = ADMIN_EMAIL,
    cookieSecure: Boolean = false,
    publicBaseUrl: String = PUBLIC_BASE_URL,
) = Config(
    dbPath = dbPath,
    serverPort = 0,
    googleOAuthClientId = "test-client",
    adminEmail = adminEmail,
    cookieSecure = cookieSecure,
    googlePlacesApiKey = "",
    backup = Config.BackupConfig(snapshotPath = "$dbPath.bak"),
    publicBaseUrl = publicBaseUrl,
    ogR2 = null,
    visitImagesR2 = null,
)

const val PUBLIC_BASE_URL = "https://noodle.example"

fun withTestDb(
    adminEmail: String = ADMIN_EMAIL,
    cookieSecure: Boolean = false,
    publicBaseUrl: String = PUBLIC_BASE_URL,
    block: (TestDb) -> Unit,
) {
    val dir = Files.createTempDirectory("noodlemap-test")
    val config = testConfig(dir.resolve("test.db").toString(), adminEmail, cookieSecure, publicBaseUrl)
    val ds = buildDataSource(config.dbPath)
    try {
        block(TestDb(config, ds, buildDatabase(ds)))
    } finally {
        ds.close()
        dir.toFile().deleteRecursively()
    }
}

/** Runs [block] against the real Ktor app wired to a fresh migrated DB. */
fun testApp(
    adminEmail: String = ADMIN_EMAIL,
    cookieSecure: Boolean = false,
    placesApiKey: String = "",
    // Nothing listens on port 9; tests that reach Google pass a local fake server's URL.
    placesBaseUrl: String = "http://127.0.0.1:9",
    ogStore: R2OgImageStore? = null,
    maxPendingBitmapWork: Int = 3,
    ogCoverFailureTtl: Duration = 5.minutes,
    // Null stores visit images on local disk next to the test database, as the app does without R2.
    visitImageStore: VisitImageStore? = null,
    // An http URL puts the app in local-development mode (local-disk images, localhost upload origins).
    publicBaseUrl: String = PUBLIC_BASE_URL,
    maxPendingJsonBodies: Int = 8,
    jsonReceiveTimeoutMillis: Long = 10_000,
    block: suspend ApplicationTestBuilder.(TestDb) -> Unit,
) = withTestDb(adminEmail, cookieSecure, publicBaseUrl) { t ->
    testApplication {
        application {
            val images = visitImageStore ?: t.localVisitImages
            val bitmapWork = BitmapWorkGate(maxPendingBitmapWork)
            val shopHandler = ShopHandler(t.db, t.sessions, images)
            val backups = dev.marulabs.noodlemap.backup.BackupService(t.dataSource, t.config.backup)
            monitor.subscribe(io.ktor.server.application.ApplicationStopped) { backups.close() }
            installApp(
                AuthHandler(t.db, GoogleVerifier(t.config.googleOAuthClientId), t.sessions),
                shopHandler,
                VisitLogHandler(t.db, t.sessions, images),
                VisitImageHandler(t.db, t.sessions, images, bitmapWork, t.config.publicBaseUrl),
                PlacesHandler(t.sessions, placesApiKey, placesBaseUrl, placesHttp),
                OgHandler(shopHandler, t.config.publicBaseUrl, ogStore, images, bitmapWork, ogCoverFailureTtl),
                dev.marulabs.noodlemap.backup.BackupHandler(t.sessions, backups),
                maxPendingJsonBodies,
                jsonReceiveTimeoutMillis,
            )
        }
        block(t)
    }
}

fun HttpRequestBuilder.json(body: String) {
    contentType(ContentType.Application.Json)
    setBody(body)
}

fun HttpRequestBuilder.session(token: String) = cookie(SessionService.COOKIE, token)

suspend fun HttpClient.postJson(path: String, body: String, token: String? = null): HttpResponse =
    post(path) { json(body); token?.let { session(it) } }

suspend fun HttpClient.putJson(path: String, body: String, token: String? = null): HttpResponse =
    put(path) { json(body); token?.let { session(it) } }

suspend fun HttpClient.deleteWithSession(path: String, token: String? = null): HttpResponse =
    delete(path) { token?.let { session(it) } }

suspend inline fun <reified T> HttpResponse.body(): T = testJson.decodeFromString(bodyAsText())

inline fun <reified T> encode(value: T): String = testJson.encodeToString(value)

fun addShopRequest(
    placeId: String? = "place-1",
    tagIds: List<String> = emptyList(),
    openedAt: String? = null,
    closedAt: String? = null,
) = AddShopRequest(
    name = "Ramen Taro", lat = 35.0, lng = 139.0, postalCode = "100-0001", address = "Tokyo",
    openedAt = openedAt, closedAt = closedAt, googlePlaceId = placeId, category = CategorySlug.RAMEN, tagIds = tagIds,
)

fun AddShopRequest.toUpdate(tagIds: List<String> = this.tagIds) =
    UpdateShopRequest(
        name = name, nameKana = nameKana, lat = lat, lng = lng, postalCode = postalCode, address = address, openedAt = openedAt, closedAt = closedAt,
        googlePlaceId = googlePlaceId, category = category, tagIds = tagIds, links = links,
    )
