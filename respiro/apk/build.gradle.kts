// Respiro come APK: un guscio WebView attorno a respiro/index.html, lo stesso file della PWA.
// Nessuna copia del codice dell'app: l'HTML viene preso da ../index.html al momento della build.
plugins { id("com.android.application") version "8.13.2" }

val generati = layout.buildDirectory.dir("generated/respiro-assets")
val copiaHtml by tasks.registering(Copy::class) {
    from(rootDir.resolve("../index.html"))
    into(generati)
}

android {
    namespace = "it.resonance.respiro"
    compileSdk = 36
    defaultConfig {
        applicationId = "it.resonance.respiro"
        minSdk = 26
        targetSdk = 36
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }
    // La chiave NON sta nel repository (è pubblico): arriva dai segreti della CI, la stessa dell'APK Resonance.
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
            signingConfig = signingConfigs.findByName("resonance") ?: signingConfigs.getByName("debug")
        }
    }
    sourceSets["main"].assets.srcDir(generati)
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
tasks.named("preBuild") { dependsOn(copiaHtml) }
