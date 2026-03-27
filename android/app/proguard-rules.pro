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
