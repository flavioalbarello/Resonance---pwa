import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

android {
    namespace = "it.resonance.adam"
    compileSdk = 36

    defaultConfig {
        applicationId = "it.resonance.adam"
        minSdk = 28
        targetSdk = 36
        // Il numero di versione viene dall'ORA dell'ultimo commit (minuti dal 1/1/2026), non dal conto dei commit.
        // Il conto dipende da quanta storia ha la copia: su GitHub (storia intera) veniva 360, in una copia parziale
        // 156. Il Ghost aveva installato il 360 dalla CI, e ogni APK successivo era per Android una versione più
        // vecchia: «pacchetto non valido» (24/09/2026). L'ora del commit è la stessa ovunque e cresce sempre.
        val istante = providers.exec { commandLine("git", "log", "-1", "--format=%ct"); isIgnoreExitValue = true }
            .standardOutput.asText.map { it.trim().toLongOrNull() ?: (System.currentTimeMillis() / 1000) }.get()
        versionCode = ((istante - 1_767_225_600L) / 60).toInt()
        versionName = Instant.ofEpochSecond(istante).atZone(ZoneId.of("Europe/Rome"))
            .format(DateTimeFormatter.ofPattern("'2.'yyMMdd.HHmm"))
    }

    // La chiave NON sta nel repository (è pubblico): arriva dall'ambiente o dai segreti della CI.
    val chiave = System.getenv("RESONANCE_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }
    signingConfigs {
        if (chiave != null) create("resonance") {
            storeFile = chiave
            storePassword = System.getenv("RESONANCE_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("RESONANCE_KEY_ALIAS") ?: "resonance"
            keyPassword = System.getenv("RESONANCE_KEYSTORE_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("resonance")
        }
    }
    // Il codice compresso dentro l'APK (26/09/2026): da 30 MB a circa 11, lo stesso codice. Con minSdk 28 Android lo
    // terrebbe non compresso per avviarlo un filo prima; qui conta di più poterlo mandare (il limite era 30 MB).
    packaging { dex { useLegacyPackaging = true } }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true; buildConfig = true }
    // Gli schemi esportati servono alla prova di migrazione (ogni versione del database si apre sopra la precedente).
    // Robolectric vede solo gli asset della variante, non quelli di test: stanno nel debug, il release non li porta.
    sourceSets.getByName("debug").assets.srcDir("$projectDir/schemas")
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all { it.systemProperty("robolectric.dependency.repo.url", "https://maven-central.storage-download.googleapis.com/maven2") }
        }
    }
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

ksp { arg("room.schemaLocation", "$projectDir/schemas") }

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.tooling.preview)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.work.runtime)
    implementation(libs.health.connect)
    implementation(libs.okhttp)
    implementation(libs.serialization.json)
    implementation(libs.coroutines.android)
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.room.testing)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test)
    debugImplementation(libs.compose.ui.test.manifest)
}
