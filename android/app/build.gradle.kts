import java.util.Properties

plugins {
    id("com.android.application")
}

// Leeg = ingebouwde webapp; anders een URL (bijv. de Vite-dev-server), zie gradle.properties
val devUrl = (findProperty("pandaos.devUrl") as String?) ?: ""

// Versie: één bron voor webapp en launcher (version.json in de projectmap; tools/release.ps1 verhoogt hem)
val versionFile = rootProject.layout.projectDirectory.file("../version.json").asFile
val versionJson = groovy.json.JsonSlurper().parse(versionFile) as Map<*, *>

// Ondertekening: altijd dezelfde sleutel, anders weigert Android een update over de geïnstalleerde versie heen.
// Pad en wachtwoorden in android/local.properties (niet in git), standaard de debug-sleutel van deze laptop.
// Bewaar die sleutel goed: zonder dezelfde sleutel kan de radio geen updates meer installeren.
val localProps = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val signingStore = localProps.getProperty("pandaos.keystore") ?: "${System.getProperty("user.home")}/.android/debug.keystore"

android {
    namespace = "nl.pandaos.launcher"
    compileSdk = 35

    defaultConfig {
        applicationId = "nl.pandaos.launcher"
        minSdk = 26 // goedkope radio's draaien vaak een oudere Android dan op de doos staat
        // Bewust 28 (Android 9): alleen zo mag een gewone app zelf met wifi verbinden en Bluetooth aan/uit zetten,
        // voor de eigen PandaOS-schermen (RadioConnectivity). PandaOS komt niet in de Play Store, dus dat kan.
        targetSdk = 28
        versionCode = (versionJson["code"] as Number).toInt()
        versionName = versionJson["version"] as String
        buildConfigField("String", "DEV_URL", "\"$devUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("pandaos") {
            storeFile = file(signingStore)
            storePassword = localProps.getProperty("pandaos.storePassword") ?: "android"
            keyAlias = localProps.getProperty("pandaos.keyAlias") ?: "androiddebugkey"
            keyPassword = localProps.getProperty("pandaos.keyPassword") ?: "android"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("pandaos")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("pandaos")
        }
    }

    // targetSdk 28 is bewust (zie defaultConfig); PandaOS gaat niet naar de Play Store
    lint {
        disable += "ExpiredTargetSdkVersion"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1") // WebViewAssetLoader: webapp via https uit de assets
}

// De gebouwde webapp (client/dist) gaat mee in de app als assets/web.
// Eerst in client/: npx vite build
abstract class CopyWebApp : DefaultTask() {
    @get:InputDirectory
    @get:Optional
    abstract val webDist: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val fs: FileSystemOperations

    @TaskAction
    fun copy() {
        val dist = webDist.asFile.orNull
        if (dist == null || !dist.resolve("index.html").exists()) {
            throw GradleException("client/dist ontbreekt: bouw eerst de webapp (in client/: npx vite build)")
        }
        fs.sync {
            from(dist)
            into(outputDir.dir("web"))
        }
    }
}

val copyWebApp = tasks.register<CopyWebApp>("copyWebApp") {
    val dist = rootProject.layout.projectDirectory.dir("../client/dist")
    if (dist.asFile.exists()) webDist.set(dist)
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyWebApp, CopyWebApp::outputDir)
    }
}
