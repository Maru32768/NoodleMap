package dev.marulabs.noodlemap

import com.zaxxer.hikari.HikariDataSource
import dev.marulabs.noodlemap.auth.AuthHandler
import dev.marulabs.noodlemap.auth.GoogleVerifier
import dev.marulabs.noodlemap.auth.SessionService
import dev.marulabs.noodlemap.auth.SessionTokens
import dev.marulabs.noodlemap.common.SessionTime
import dev.marulabs.noodlemap.db.NoodleMapDb
import dev.marulabs.noodlemap.db.buildDataSource
import dev.marulabs.noodlemap.db.buildDatabase
import dev.marulabs.noodlemap.generated.models.AddShopRequest
import dev.marulabs.noodlemap.generated.models.CategorySlug
import dev.marulabs.noodlemap.generated.models.UpdateShopRequest
import dev.marulabs.noodlemap.shops.ShopHandler
import io.ktor.client.HttpClient
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.cookie
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import java.nio.file.Files
import java.time.Instant
import java.util.UUID
import kotlinx.serialization.json.Json

const val ADMIN_EMAIL = "admin@example.com"

val testJson = Json { ignoreUnknownKeys = true }

/** A migrated SQLite file DB plus the real services built on it. */
class TestDb(val config: Config, val dataSource: HikariDataSource, val db: NoodleMapDb) {
    val sessions = SessionService(db, config)

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

fun testConfig(dbPath: String, adminEmail: String = ADMIN_EMAIL, cookieSecure: Boolean = false) = Config(
    dbPath = dbPath,
    serverPort = 0,
    googleOAuthClientId = "test-client",
    adminEmail = adminEmail,
    cookieSecure = cookieSecure,
    backup = Config.BackupConfig(snapshotPath = "$dbPath.bak", s3Bucket = null, s3Prefix = null, awsRegion = null),
)

fun withTestDb(adminEmail: String = ADMIN_EMAIL, cookieSecure: Boolean = false, block: (TestDb) -> Unit) {
    val dir = Files.createTempDirectory("noodlemap-test")
    val config = testConfig(dir.resolve("test.db").toString(), adminEmail, cookieSecure)
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
    block: suspend ApplicationTestBuilder.(TestDb) -> Unit,
) = withTestDb(adminEmail, cookieSecure) { t ->
    testApplication {
        application {
            installApp(AuthHandler(t.db, GoogleVerifier(t.config.googleOAuthClientId), t.sessions), ShopHandler(t.db, t.sessions))
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

suspend inline fun <reified T> HttpResponse.body(): T = testJson.decodeFromString(bodyAsText())

inline fun <reified T> encode(value: T): String = testJson.encodeToString(value)

fun addShopRequest(
    placeId: String = "place-1",
    tagIds: List<String> = emptyList(),
    openedAt: String? = null,
    closedAt: String? = null,
) = AddShopRequest(
    name = "Ramen Taro", lat = 35.0, lng = 139.0, postalCode = "100-0001", address = "Tokyo",
    openedAt = openedAt, closedAt = closedAt, googlePlaceId = placeId, category = CategorySlug.RAMEN, tagIds = tagIds,
)

fun AddShopRequest.toUpdate(eaten: Boolean = false, rate: Double = 0.0, favorite: Boolean = false, tagIds: List<String> = this.tagIds) =
    UpdateShopRequest(
        name = name, lat = lat, lng = lng, postalCode = postalCode, address = address, openedAt = openedAt, closedAt = closedAt,
        googlePlaceId = googlePlaceId, category = category, eaten = eaten, rate = rate, favorite = favorite, tagIds = tagIds,
    )
