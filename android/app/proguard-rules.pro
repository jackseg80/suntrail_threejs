# ============================================================
# ProGuard / R8 — SunTrail 3D (Capacitor WebView App)
# ============================================================

# --- Capacitor core ---
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

# --- Package SunTrail ---
-keep class com.suntrail.** { *; }

# --- WebView / JavaScript Interface ---
# Requis pour que Capacitor Bridge fonctionne en mode release
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# --- AndroidX / Support Library ---
-keep class androidx.** { *; }
-dontwarn androidx.**

# --- Serialisation & Annotations ---
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions

# --- Crash reports lisibles (stack traces avec numéros de ligne) ---
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# --- Suppression des warnings inoffensifs ---
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# --- Bibliothèques JavaScript (WebView / Capacitor) ---
# Ces bibliothèques s'exécutent dans la WebView — ProGuard ne touche pas au JS,
# mais les classes Java interopérant avec elles doivent être préservées.

# Three.js (WebGL, rendu 3D) — aucune classe Java native
# PMTiles (lecture de cartes locales) — aucune classe Java native
# MapBox Vector Tile (décodage PBF) — aucune classe Java native
# gpxparser — aucune classe Java native
# Ces libs sont bundlées en JS par Vite et ne génèrent pas de classes Java.
# Les -keep ci-dessous ciblent uniquement les ponts Capacitor qui les appellent.
-keep class com.getcapacitor.plugin.** { *; }

# --- OkHttp (utilisé en interne par Capacitor pour les requêtes réseau) ---
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# --- Gson (désérialisation JSON dans Capacitor Bridge) ---
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer
