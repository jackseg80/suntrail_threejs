package com.suntrail.threejs;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import com.suntrail.threejs.data.AppDatabase;
import com.suntrail.threejs.data.GPSPoint;
import com.suntrail.threejs.data.GPSPointDao;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * RecordingService — Foreground Service Android avec GPS natif (v5.25.0)
 *
 * Architecture Single Source of Truth (v5.25.0):
 * - Ce service est la SEULE source d'enregistrement GPS
 * - Les points sont stockés dans Room SQLite (plus de fichier JSON)
 * - Le JS lit uniquement via RecordingPlugin qui query la base Room
 * - Filtrage complet : précision, altitude, vitesse, distance, timestamps
 *
 * Type : FOREGROUND_SERVICE_TYPE = "location" (requis pour les apps géo en arrière-plan
 * depuis Android 10 / API 29).
 */
public class RecordingService extends Service {

    private static final String TAG             = "RecordingService";
    private static final String CHANNEL_ID      = "suntrail_recording_v1";
    private static final int    NOTIFICATION_ID = 42;
    private static final String PREFS_NAME      = "suntrail_rec_config";
    static final String         STOP_ACTION     = "com.suntrail.threejs.STOP_RECORDING";

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTES DE FILTRAGE GPS (Single Source of Truth)
    // ═══════════════════════════════════════════════════════════════════════════
    private static final float  MAX_SPEED_MPS       = 15.0f;       // 54 km/h — reject si plus rapide
    private static final float  MIN_DISTANCE_M      = 1.0f;        // 1m — reject jitter
    private static final long   MIN_TIME_MS         = 1000L;        // 1s — reject rafales OEM
    private static final float  MAX_ACCURACY_M      = 50.0f;        // 50m — reject imprécis
    private static final double MIN_ALT_M           = -500.0;       // reject alt aberrantes
    private static final double MAX_ALT_M           = 9000.0;

    // ═══════════════════════════════════════════════════════════════════════════
    // CALLBACK pour notifier le Plugin JS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Callback statique pour notifier RecordingPlugin quand de nouveaux points sont disponibles.
     * Implémenté par RecordingPlugin.onNewPoints().
     */
    public interface RecordingCallback {
        void onNewPoints(String courseId, int pointCount);
    }

    private static RecordingCallback sCallback;

    public static void setCallback(RecordingCallback callback) {
        sCallback = callback;
    }

    public static RecordingCallback getCallback() {
        return sCallback;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAMPS DU SERVICE
    // ═══════════════════════════════════════════════════════════════════════════

    // GPS
    private FusedLocationProviderClient mFusedClient;
    private LocationCallback             mLocationCallback;

    // Room Database (Single Source of Truth)
    private AppDatabase   mDatabase;
    private GPSPointDao  mDao;
    private ExecutorService mDbExecutor;

    // Course ID (généré au démarrage, identifie la session d'enregistrement)
    private String mCurrentCourseId;
    public String getCurrentCourseId() { return mCurrentCourseId; }

    // État du dernier point valide (pour calculs de vitesse/distance)
    private Location mLastValidLocation;
    private long     mLastValidTimestamp;

    // Compteur de points pour la notification
    private final AtomicInteger mPointCount = new AtomicInteger(0);

    // WakeLock partiel : maintient le CPU actif pendant l'enregistrement
    private PowerManager.WakeLock mWakeLock;

    // Gestion de la durée et de l'immobilité (v5.24.6)
    private long    mStartTime                 = 0;
    private Location mLastSignificantLocation  = null;
    private long    mLastMovementTime          = 0;
    private boolean mIsImmobile                = false;
    private static final float  IMMOBILITY_DISTANCE_THRESHOLD = 30.0f;
    private static final long   IMMOBILITY_TIME_THRESHOLD     = 30 * 60 * 1000L;

    // Cache des PendingIntents pour la notification
    private PendingIntent    mOpenPendingIntent;
    private PendingIntent    mStopPendingIntent;
    private BroadcastReceiver mStopReceiver;

    // Flag statique : permet au JS de savoir si le service tourne encore
    private static volatile boolean sIsRunning = false;
    public static boolean isRunning() { return sIsRunning; }

    // ── Lifecycle ─────────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        sIsRunning = true;

        // Initialiser Room (Single Source of Truth)
        mDatabase = AppDatabase.getInstance(getApplicationContext());
        mDao = mDatabase.gpsPointDao();
        mDbExecutor = Executors.newSingleThreadExecutor();

        mFusedClient = LocationServices.getFusedLocationProviderClient(this);
    }

    @Override
    @SuppressWarnings("deprecation") // LocationRequest.create() — API 16+ (minSdk 24)
    public int onStartCommand(Intent intent, int flags, int startId) {
        createNotificationChannel();

        // Générer un nouveau courseId pour cette session d'enregistrement
        mCurrentCourseId = java.util.UUID.randomUUID().toString();
        mLastValidLocation = null;
        mLastValidTimestamp = 0;
        mPointCount.set(0);
        
        // Notifier le plugin du nouveau courseId (même sans points encore)
        if (sCallback != null) {
            sCallback.onNewPoints(mCurrentCourseId, 0);
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        mOpenPendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // PendingIntent pour le bouton "Arrêter" dans la notification
        Intent stopBroadcast = new Intent(STOP_ACTION);
        stopBroadcast.setPackage(getPackageName());
        mStopPendingIntent = PendingIntent.getBroadcast(
            this, 1, stopBroadcast,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // BroadcastReceiver : tap "Arrêter" dans la notification → stopSelf()
        if (mStopReceiver == null) {
            mStopReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    Log.i(TAG, "Arrêt demandé depuis la notification");
                    stopSelf();
                }
            };
            IntentFilter filter = new IntentFilter(STOP_ACTION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(mStopReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(mStopReceiver, filter);
            }
        }

        // Initialiser le temps de démarrage pour la durée (v5.24.6)
        mStartTime = System.currentTimeMillis();
        mLastMovementTime = mStartTime;

        startForeground(NOTIFICATION_ID, buildNotification(0));

        // Lire la config depuis les Intent extras (premier démarrage)
        // ou depuis les SharedPreferences (redémarrage START_STICKY, intent peut être null)
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        long   interval        = (intent != null) ? intent.getLongExtra("interval", 3000L)          : prefs.getLong("interval", 3000L);
        float  minDisplacement = (intent != null) ? intent.getFloatExtra("minDisplacement", 0.5f)  : prefs.getFloat("minDisplacement", 0.5f);
        boolean highAccuracy   = (intent != null) ? intent.getBooleanExtra("highAccuracy", true)   : prefs.getBoolean("highAccuracy", true);

        // Sauvegarder pour le redémarrage éventuel
        prefs.edit()
            .putLong("interval", interval)
            .putFloat("minDisplacement", minDisplacement)
            .putBoolean("highAccuracy", highAccuracy)
            .apply();

        // Créer la demande de localisation (API dépréciée mais compatible minSdk 24)
        LocationRequest locationRequest = LocationRequest.create()
            .setInterval(interval)
            .setFastestInterval(1000L)
            .setSmallestDisplacement(minDisplacement)
            .setPriority(highAccuracy
                ? Priority.PRIORITY_HIGH_ACCURACY
                : Priority.PRIORITY_BALANCED_POWER_ACCURACY);

        // ═══════════════════════════════════════════════════════════════════════
        // LOCATION CALLBACK — LOGIQUE DE FILTRAGE COMPLETE (Single Source of Truth)
        // ═══════════════════════════════════════════════════════════════════════
        mLocationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                for (Location loc : result.getLocations()) {
                    // ── Étape 1: Filtrage précision ──────────────────────────────
                    if (loc.getAccuracy() > MAX_ACCURACY_M) {
                        Log.d(TAG, "REJECT: accuracy " + loc.getAccuracy() + "m > " + MAX_ACCURACY_M + "m");
                        continue;
                    }

                    // ── Étape 2: Filtrage altitude présente ──────────────────────
                    if (!loc.hasAltitude()) {
                        Log.d(TAG, "REJECT: no altitude");
                        continue;
                    }

                    // ── Étape 3: Filtrage altitude aberrante ─────────────────────
                    double alt = loc.getAltitude();
                    if (alt < MIN_ALT_M || alt > MAX_ALT_M) {
                        Log.d(TAG, "REJECT: altitude " + alt + "m out of range");
                        continue;
                    }

                    // ── Étape 4: Filtrage timestamp (évite rafales OEM) ───────────
                    long now = loc.getTime(); // Timestamp GPS atomique
                    long timeDiff = now - mLastValidTimestamp;
                    if (mLastValidTimestamp > 0 && timeDiff < MIN_TIME_MS) {
                        Log.d(TAG, "REJECT: timeDiff " + timeDiff + "ms < " + MIN_TIME_MS + "ms");
                        continue;
                    }

                    // ── Étape 5: Calcul distance 3D depuis dernier point valide ─
                    if (mLastValidLocation != null) {
                        float distance2D = mLastValidLocation.distanceTo(loc);

                        // ── Étape 6: Filtrage jitter (distance 2D < 1m) ─────────
                        if (distance2D < MIN_DISTANCE_M) {
                            Log.d(TAG, "REJECT: distance2D " + distance2D + "m < " + MIN_DISTANCE_M + "m (jitter)");
                            continue;
                        }

                        // ── Étape 7: Calcul vitesse 3D ───────────────────────────
                        // Distance 3D = sqrt(distance2D² + altDiff²)
                        double altDiff = loc.getAltitude() - mLastValidLocation.getAltitude();
                        double distance3D = Math.sqrt(distance2D * distance2D + altDiff * altDiff);

                        // ── Étape 8: Filtrage vitesse > 15 m/s (54 km/h) ───────
                        float speedMps = (float) (distance3D / (timeDiff / 1000.0));
                        if (speedMps > MAX_SPEED_MPS) {
                            Log.d(TAG, "REJECT: speed " + speedMps + "m/s > " + MAX_SPEED_MPS + "m/s");
                            continue;
                        }

                        Log.v(TAG, String.format("VALID: d2D=%.1fm d3D=%.1fm speed=%.1fm/s timeDiff=%dms",
                                distance2D, distance3D, speedMps, timeDiff));
                    }

                    // ══════════════════════════════════════════════════════════
                    // ── Étape 9: POINT VALIDE — Insert SQLite + notify ─────────
                    // ══════════════════════════════════════════════════════════

                    final GPSPoint point = new GPSPoint(
                        mCurrentCourseId,
                        loc.getLatitude(),
                        loc.getLongitude(),
                        alt,
                        now,
                        loc.getAccuracy()
                    );

                    // Insert en arrière-plan (Room interdit MainThread)
                    mDbExecutor.execute(() -> {
                        mDao.insert(point);
                        int count = mPointCount.incrementAndGet();

                        // Notifier le Plugin JS via callback
                        RecordingCallback cb = getCallback();
                        if (cb != null) {
                            cb.onNewPoints(mCurrentCourseId, count);
                        }

                        Log.d(TAG, "INSERTED point #" + count + " for course " + mCurrentCourseId);
                    });

                    // Mettre à jour l'état pour le prochain calcul
                    mLastValidLocation = loc;
                    mLastValidTimestamp = now;

                    // Détection d'immobilité (v5.24.6)
                    updateImmobilityStatus(loc);

                    // Mise à jour notification (post delayed pour éviter surcharge)
                }

                // Mise à jour de la notification avec le compteur de points et durée
                updateNotification(mPointCount.get());
            }
        };

        try {
            mFusedClient.requestLocationUpdates(locationRequest, mLocationCallback, Looper.getMainLooper());
            Log.i(TAG, "GPS natif démarré (courseId=" + mCurrentCourseId + ", interval=" + interval + "ms)");
        } catch (SecurityException e) {
            Log.e(TAG, "Permission GPS refusée : " + e.getMessage());
        }

        // WakeLock partiel : maintient le CPU actif (timeout 4h max)
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "suntrail:gps");
            mWakeLock.acquire(4 * 60 * 60 * 1000L);
        }

        // START_STICKY : Android redémarre le service s'il est tué (avec Intent null)
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        sIsRunning = false;
        mCurrentCourseId = null;

        // Désenregistrer le BroadcastReceiver du bouton Arrêter
        if (mStopReceiver != null) {
            try { unregisterReceiver(mStopReceiver); } catch (Exception e) { /* déjà désenregistré */ }
            mStopReceiver = null;
        }

        // Arrêter les mises à jour GPS
        if (mFusedClient != null && mLocationCallback != null) {
            mFusedClient.removeLocationUpdates(mLocationCallback);
        }

        // Fermer l'executor
        if (mDbExecutor != null) {
            mDbExecutor.shutdown();
        }

        // Relâcher le WakeLock
        if (mWakeLock != null && mWakeLock.isHeld()) {
            mWakeLock.release();
        }

        // Clear callback
        sCallback = null;

        stopForeground(true);
        super.onDestroy();
        Log.i(TAG, "Service arrêté — " + mPointCount.get() + " points enregistrés dans SQLite");
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // Service non bindable
    }

    // ── Détection d'immobilité ───────────────────────────────────────────────────

    /**
     * Met à jour le statut d'immobilité basé sur la distance parcourue.
     * L'utilisateur est considéré immobile s'il n'a pas bougé de plus de 30m pendant 30 minutes.
     */
    private void updateImmobilityStatus(Location currentLocation) {
        long now = System.currentTimeMillis();

        if (mLastSignificantLocation == null) {
            mLastSignificantLocation = currentLocation;
            mLastMovementTime = now;
            mIsImmobile = false;
            return;
        }

        float distance = mLastSignificantLocation.distanceTo(currentLocation);

        if (distance > IMMOBILITY_DISTANCE_THRESHOLD) {
            mLastSignificantLocation = currentLocation;
            mLastMovementTime = now;
            if (mIsImmobile) {
                mIsImmobile = false;
                Log.i(TAG, "Mouvement repris après immobilité");
            }
        } else {
            long timeSinceLastMovement = now - mLastMovementTime;
            if (timeSinceLastMovement > IMMOBILITY_TIME_THRESHOLD && !mIsImmobile) {
                mIsImmobile = true;
                Log.i(TAG, "Immobilité détectée (> 30 min sans mouvement significatif)");
            }
        }
    }

    /**
     * Calcule la durée écoulée depuis le démarrage au format "Xh Ymin"
     */
    private String getElapsedTimeString() {
        long now = System.currentTimeMillis();
        long elapsedMs = now - mStartTime;
        long elapsedMinutes = elapsedMs / (60 * 1000L);
        long hours = elapsedMinutes / 60;
        long minutes = elapsedMinutes % 60;

        if (hours > 0) {
            return hours + "h " + minutes + "min";
        } else {
            return minutes + "min";
        }
    }

    // ── Notification ──────────────────────────────────────────────────────────────

    private Notification buildNotification(int pointCount) {
        String elapsedTime = getElapsedTimeString();

        String text;
        if (pointCount == 0) {
            text = elapsedTime + " — En attente du premier point...";
        } else {
            text = elapsedTime + " — " + pointCount + " point" + (pointCount > 1 ? "s" : "") + " enregistré" + (pointCount > 1 ? "s" : "");
        }

        String title;
        int importance;
        if (mIsImmobile) {
            long immobileMinutes = (System.currentTimeMillis() - mLastMovementTime) / (60 * 1000L);
            title = "⚠️ Immobile (" + immobileMinutes + " min) — Toujours actif ?";
            importance = NotificationCompat.PRIORITY_DEFAULT;
        } else {
            title = "SunTrail 3D — Enregistrement actif";
            importance = NotificationCompat.PRIORITY_LOW;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(mOpenPendingIntent)
            .setOngoing(true)
            .setPriority(importance)
            .setCategory(NotificationCompat.CATEGORY_SERVICE);

        if (mStopPendingIntent != null) {
            builder.addAction(android.R.drawable.ic_delete, "Arrêter REC", mStopPendingIntent);
        }

        return builder.build();
    }

    private void updateNotification(int pointCount) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, buildNotification(pointCount));
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Enregistrement SunTrail",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Maintient l'enregistrement GPS actif en arrière-plan");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}