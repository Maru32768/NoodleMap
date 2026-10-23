plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ktor)
    alias(libs.plugins.sqldelight)
    alias(libs.plugins.fabrikt)
    jacoco
}

group = "dev.marulabs.noodlemap"
version = "0.1.0"

application {
    mainClass.set("dev.marulabs.noodlemap.ApplicationKt")
}

kotlin {
    jvmToolchain(21)
    // Fabrikt emits committed sources under this nested path; register it as a source root.
    sourceSets["main"].kotlin.srcDir("src/generated/kotlin/src/main/kotlin")
}

dependencies {
    implementation(libs.ktor.server.core)
    implementation(libs.ktor.server.netty)
    implementation(libs.ktor.server.content.negotiation)
    implementation(libs.ktor.serialization.json)
    implementation(libs.ktor.server.status.pages)
    implementation(libs.ktor.server.call.logging)
    implementation(libs.ktor.server.auth)

    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.core)

    implementation(libs.sqldelight.jdbc.driver)
    implementation(libs.sqldelight.coroutines)
    implementation(libs.sqlite.jdbc)
    implementation(libs.hikari)

    implementation(libs.google.api.client)
    implementation(libs.aws.s3)
    // EXIF orientation of uploaded visit images; pure Java, no native code, and handles the many EXIF layouts.
    implementation(libs.metadata.extractor)

    implementation(libs.logback.classic)

    testImplementation(libs.ktor.server.test.host)
    // BOM aligns junit-platform engine + launcher (avoids OutputDirectoryProvider mismatch).
    testImplementation(platform("org.junit:junit-bom:5.10.5"))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation(libs.kotest.assertions.core)
    testImplementation(libs.kotlinx.coroutines.core)
}

tasks.test {
    useJUnitPlatform()
}

sqldelight {
    databases {
        create("NoodleMapDb") {
            packageName.set("dev.marulabs.noodlemap.db")
            // The .sq CREATE TABLEs are the compile-time schema for queries only. The real
            // schema comes from the goose SQL files in src/main/resources/db/migrations
            // (SQLDelight can't parse the prod modtime triggers); MigrationsTest keeps them aligned.
            dialect("app.cash.sqldelight:sqlite-3-38-dialect:${libs.versions.sqldelight.get()}")
        }
    }
}

// Verifies SQLDelight .sqm migrations, which this project doesn't use; it still runs on `check`
// and fails inside its worker on sqlite-jdbc's native library.
tasks.matching { it.name == "verifyMainNoodleMapDbMigration" }.configureEach { enabled = false }

// Fabrikt: generate kotlinx.serialization models + Ktor server interfaces from the
// committed OpenAPI doc. Output committed under src/generated/kotlin (see MIGRATION.md).
fabrikt {
    generate("noodlemap") {
        apiFile = file("../api/openapi.yaml")
        basePackage = "dev.marulabs.noodlemap.generated"
        outputDirectory = file("src/generated/kotlin")
        model {
            generate = true
            serializationLibrary = Kotlinx
            sealedInterfacesForOneOf = true
        }
        controller {
            generate = true
            target = Ktor
        }
        validationLibrary = NoValidation
    }
}

// Coverage report only (no threshold): `./gradlew test jacocoTestReport` → build/reports/jacoco/test.
tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports { xml.required = true }
}
