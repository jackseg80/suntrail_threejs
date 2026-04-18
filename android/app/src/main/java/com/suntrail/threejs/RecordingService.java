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
import android.content.pm.ServiceInfo;
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

import java.util.ArrayList;
import java.util.List;
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

    // ── CONSTANTES DE FILTRAGE GPS (Single Source of Truth) ────────────────────────

    private static final float  MAX_SPEED_MPS       = 15.0f;       // 54 km/h — reject si plus rapide
    private static final float  MIN_DISTANCE_M      = 3.0f;        // 3m — reject jitter (augmenté pour éviter les doublons)
    private static final long   MIN_TIME_MS         = 1000L;        // 1s — reject rafales OEM
    private static final float  MAX_ACCURACY_M      = 50.0f;        // 50m — reject imprécis
    private static final double MIN_ALT_M           = -500.0;       // reject alt aberrantes
    private static final double MAX_ALT_M           = 9000.0;

    // ── CALLBACK pour notifier le Plugin JS ────────────────────────────────────────

    /**
     * Callback statique pour notifier RecordingPlugin quand de nouveaux points sont disponibles.
     * Implémenté par RecordingPlugin.onNewPoints().
     */
    public interface RecordingCallback {
        void onNewPoints(String courseId, int pointCount);
        void onServiceStopped();
    }

    private static RecordingCallback sCallback;

    public static void setCallback(RecordingCallback callback) {
        sCallback = callback;
    }

    public static RecordingCallback getCallback() {
        return sCallback;
    }

    // ── CHAMPS DU SERVICE ──────────────────────────────────────────────────────────

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

    // Buffer pour batch inserts (v5.25.1) - réduit I/O disque
    private final List<GPSPoint> mPointBuffer = new ArrayList<>();
    private static final int BATCH_SIZE = 3; // v5.26.1: Réduit à 3 pour plus de sécurité (zéro perte)
    private static final long BATCH_FLUSH_INTERVAL_MS = 10000; // Flush forcé toutes les 10s
    private long mLastBatchFlush = 0;

    // WakeLock partiel : maintient le CPU actif pendant l'enregistrement
    private PowerManager.WakeLock mWakeLock;

    // Stats pour la notification (v5.29.38)
    private double mStatsDistance = 0.0;
    private double mStatsElevation = 0.0;
    private double mStatsElevationMinus = 0.0;

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
    private static RecordingService sInstance = null;

    public static boolean isRunning() { return sIsRunning; }
    public static RecordingService getInstance() { return sInstance; }

    // Optimisation batterie v5.25.1 - GPS adaptatif selon vitesse et durée
    private LocationRequest mLocationRequest; // Référence pour mise à jour dynamique
    private long mLastGpsConfigUpdate = 0;
    private static final long GPS_CONFIG_UPDATE_INTERVAL_MS = 30000; // Re-vérifier toutes les 30s
    private float mCurrentSpeedMps = 0f;
    private static final float SPEED_WALKING_SLOW = 0.8f;    // ~3km/h
    private static final float SPEED_WALKING_FAST = 1.4f;    // ~5km/h
    private static final float SPEED_RUNNING = 2.5f;         // ~9km/h

    // ── Lifecycle ──────────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        sIsRunning = true;
        sInstance = this;

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

        // v5.26.0: Gestion intelligente du courseId pour le recovery après kill
        boolean isNewCourse = (intent != null) && intent.getBooleanExtra("isNewCourse", false);

        if (isNewCourse) {
            // Démarrage explicite d'une NOUVELLE course (depuis le bouton REC)
            mCurrentCourseId = java.util.UUID.randomUUID().toString();
            mPointCount.set(0);
            mStartTime = System.currentTimeMillis();
            Log.i(TAG, "Démarrage d'une NOUVELLE course: " + mCurrentCourseId);
        } else {
            // Redémarrage par le système (START_STICKY) ou réactivation
            SharedPreferences recoveryPrefs = getSharedPreferences("RecordingPrefs", MODE_PRIVATE);
            mCurrentCourseId = recoveryPrefs.getString("currentCourseId", null);
            mStartTime = recoveryPrefs.getLong("startTime", System.currentTimeMillis());

            if (mCurrentCourseId != null) {
                // Course existante : on récupère le nombre de points pour la notification
                mDbExecutor.execute(() -> {
                    try {
                        int count = mDao.getPointCount(mCurrentCourseId);
                        mPointCount.set(count);
                        updateNotification(count);
                        Log.i(TAG, "Course récupérée (" + mCurrentCourseId + ") : " + count + " points");
                    } catch (Exception e) {
                        Log.e(TAG, "Erreur récupération pointCount: " + e.getMessage());
                    }
                });
            } else {
                // Cas rare: START_STICKY sans courseId en SharedPreferences -> on en crée un
                mCurrentCourseId = java.util.UUID.randomUUID().toString();
                mPointCount.set(0);
                mStartTime = System.currentTimeMillis();
                Log.w(TAG, "Course absente des prefs, création d'un nouveau ID: " + mCurrentCourseId);
            }
        }

        mLastValidLocation = null;
        mLastValidTimestamp = 0;

        // Sauvegarder (ou maintenir) le courseId et startTime dans SharedPreferences
        getSharedPreferences("RecordingPrefs", MODE_PRIVATE)
            .edit()
            .putString("currentCourseId", mCurrentCourseId)
            .putLong("startTime", mStartTime)
            .apply();
        // Notifier le plugin du courseId courant (pour que le JS sache quoi poller)
        if (sCallback != null) {
            sCallback.onNewPoints(mCurrentCourseId, mPointCount.get());
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

        // v5.26.0: Spécification du type de service pour Android 10+ (API 29+)
        // Requis pour éviter que le service soit killé lors d'opérations mémoire (ex: photos)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification(mPointCount.get()), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, buildNotification(mPointCount.get()));
        }

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

        // Créer la demande de localisation avec configuration initiale
        // v5.25.1: Configuration sera ajustée dynamiquement selon vitesse et durée
        mLocationRequest = LocationRequest.create()
            .setInterval(interval)
            .setFastestInterval(1000L)
            .setSmallestDisplacement(minDisplacement)
            .setPriority(highAccuracy
                ? Priority.PRIORITY_HIGH_ACCURACY
                : Priority.PRIORITY_BALANCED_POWER_ACCURACY);

        // ── LOCATION CALLBACK — LOGIQUE DE FILTRAGE COMPLETE (Single Source of Truth) ──
        mLocationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                for (Location loc : result.getLocations()) {
                    // ── Étape 1: Filtrage précision ──────────────────────────
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
                    // Correction altitude: GPS donne altitude ellipsoïdale (WGS84)
                    // mais on veut altitude orthométrique (au-dessus du niveau de la mer = MSL)
                    double altOrthometric;
                    double altEllipsoidal = loc.getAltitude();

                    // Android 12+ (API 31) fournit directement l'altitude MSL (Mean Sea Level)
                    // C'est la vraie altitude orthométrique précise
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && loc.hasMslAltitude()) {
                        altOrthometric = loc.getMslAltitudeMeters();
                        Log.d(TAG, String.format("ALTITUDE MSL (API 31+): raw=%.1fm msl=%.1fm",
                                altEllipsoidal, altOrthometric));
                    } else {
                        // Android < 12: utiliser approximation du géoïde
                        // La hauteur du géoïde varie selon la position exacte
                        // En Suisse: entre 48m et 55m selon les coordonnées
                        double geoIdHeight = estimateGeoIdHeight(loc.getLatitude(), loc.getLongitude());
                        altOrthometric = altEllipsoidal - geoIdHeight;
                        Log.d(TAG, String.format("ALTITUDE estimated: raw=%.1fm geoId=%.1fm corrected=%.1fm",
                                altEllipsoidal, geoIdHeight, altOrthometric));
                    }

                    if (altOrthometric < MIN_ALT_M || altOrthometric > MAX_ALT_M) {
                        Log.d(TAG, "REJECT: altitude " + altOrthometric + "m out of range");
                        continue;
                    }

                    // ── Étape 4: Filtrage timestamp (évite rafales OEM) ───────────
                    long now = loc.getTime(); // Timestamp GPS atomique
                    long timeDiff = now - mLastValidTimestamp;
                    if (mLastValidTimestamp > 0 && timeDiff < MIN_TIME_MS) {
                        Log.d(TAG, "REJECT: timeDiff " + timeDiff + "ms < " + MIN_TIME_MS + "ms");
                        continue;
                    }

                    // ── Étape 5: Calcul distance 3D depuis dernier point valide ──
                    double distance3D = 0; // Pour calcul vitesse dans updateAdaptiveGpsConfig
                    if (mLastValidLocation != null) {
                        float distance2D = mLastValidLocation.distanceTo(loc);

                        // ── Étape 6: Filtrage jitter (distance 2D < 1m) ───────────
                        if (distance2D < MIN_DISTANCE_M) {
                            Log.d(TAG, "REJECT: distance2D " + distance2D + "m < " + MIN_DISTANCE_M + "m (jitter)");
                            continue;
                        }

                        // ── Étape 7: Calcul vitesse 3D ────────────────────────────  
                        // Distance 3D = sqrt(distance2D² + altDiff²)
                        // Utiliser altitude orthométrique pour le calcul
                        double currentAltOrthometric = altOrthometric;
                        double lastAltOrthometric = mLastValidLocation.getAltitude() -
                            estimateGeoIdHeight(mLastValidLocation.getLatitude(), mLastValidLocation.getLongitude());
                        double altDiff = currentAltOrthometric - lastAltOrthometric;
                        distance3D = Math.sqrt(distance2D * distance2D + altDiff * altDiff);

                        // ── Étape 8: Filtrage vitesse > 15 m/s (54 km/h) ───────
                        float speedMps = (float) (distance3D / (timeDiff / 1000.0));
                        if (speedMps > MAX_SPEED_MPS) {
                            Log.d(TAG, "REJECT: speed " + speedMps + "m/s > " + MAX_SPEED_MPS + "m/s");
                            continue;
                        }

                        Log.v(TAG, String.format("VALID: d2D=%.1fm d3D=%.1fm speed=%.1fm/s timeDiff=%dms",
                                distance2D, distance3D, speedMps, timeDiff));
                    }

                    // ── Étape 9: POINT VALIDE — Insert SQLite + notify ──────────
                    final GPSPoint point = new GPSPoint(
                        mCurrentCourseId,
                        loc.getLatitude(),
                        loc.getLongitude(),
                        altOrthometric,  // Altitude corrigée (orthométrique)
                        now,
                        loc.getAccuracy()
                    );

                    // v5.25.1: Batch insert optimisation - réduit I/O disque
                    mPointBuffer.add(point);
                    int newCount = mPointCount.incrementAndGet();

                    // Vérifier si on doit flush le buffer
                    boolean shouldFlush = mPointBuffer.size() >= BATCH_SIZE ||
                                         (now - mLastBatchFlush) > BATCH_FLUSH_INTERVAL_MS;

                    if (shouldFlush) {
                        final List<GPSPoint> pointsToInsert = new ArrayList<>(mPointBuffer);
                        mPointBuffer.clear();
                        mLastBatchFlush = now;

                        mDbExecutor.execute(() -> {
                            mDao.insertAll(pointsToInsert);

                            // Notifier le Plugin JS via callback (une fois par batch)
                            RecordingCallback cb = getCallback();
                            if (cb != null) {
                                cb.onNewPoints(mCurrentCourseId, newCount);
                            }

                            Log.d(TAG, "INSERTED batch of " + pointsToInsert.size() + " points (total: " + newCount + ")");
                        });
                    } else {
                        // Mise à jour du compteur sans notification (attendre le batch)
                        // Notifier tous les points pour test
                        RecordingCallback cb = getCallback();
                        if (cb != null) {
                            cb.onNewPoints(mCurrentCourseId, newCount);
                        }
                    }

                    // Mettre à jour l'état pour le prochain calcul
                    mLastValidLocation = loc;
                    mLastValidTimestamp = now;

                    // Détection d'immobilité (v5.24.6)
                    updateImmobilityStatus(loc);

                    // v5.25.1: Optimisation batterie - ajuster précision GPS selon vitesse
                    // Calculer vitesse pour le prochain ajustement
                    if (mLastValidLocation != null && timeDiff > 0) {
                        mCurrentSpeedMps = (float) (distance3D / (timeDiff / 1000.0));
                    }
                    updateAdaptiveGpsConfig();
                }

                // Mise à jour de la notification avec le compteur de points et durée
                updateNotification(mPointCount.get());
            }
        };

        try {
            mFusedClient.requestLocationUpdates(mLocationRequest, mLocationCallback, Looper.getMainLooper());
            Log.i(TAG, "GPS natif démarré (courseId=" + mCurrentCourseId + ", interval=" + interval + "ms)");
        } catch (SecurityException e) {
            Log.e(TAG, "Permission GPS refusée : " + e.getMessage());
        }

        // WakeLock partiel : maintient le CPU actif (v5.26.1: timeout 24h pour randos longues)
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "suntrail:gps");
            mWakeLock.acquire(24 * 60 * 60 * 1000L);
        }

        // START_STICKY : Android redémarre le service s'il est tué (avec Intent null)
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        sIsRunning = false;
        mCurrentCourseId = null;

        // Nettoyer le courseId des SharedPreferences (arrêt normal)
        getSharedPreferences("RecordingPrefs", MODE_PRIVATE)
            .edit()
            .remove("currentCourseId")
            .apply();

        // Désenregistrer le BroadcastReceiver du bouton Arrêter
        if (mStopReceiver != null) {
            try { unregisterReceiver(mStopReceiver); } catch (Exception e) { /* déjà désenregistré */ }
            mStopReceiver = null;
        }

        // Arrêter les mises à jour GPS
        if (mFusedClient != null && mLocationCallback != null) {
            mFusedClient.removeLocationUpdates(mLocationCallback);
        }

        // v5.25.1: Flush le buffer de points restants avant d'arrêter
        if (!mPointBuffer.isEmpty() && mDbExecutor != null) {
            final List<GPSPoint> remainingPoints = new ArrayList<>(mPointBuffer);
            final int finalCount = mPointCount.get();
            mPointBuffer.clear();
            mDbExecutor.execute(() -> {
                mDao.insertAll(remainingPoints);
                // Notifier le JS des points flushés
                RecordingCallback cb = getCallback();
                if (cb != null) {
                    cb.onNewPoints(mCurrentCourseId, finalCount);
                }
                Log.d(TAG, "Flushed " + remainingPoints.size() + " remaining points on stop");
            });
        }

        // Fermer l'executor
        if (mDbExecutor != null) {
            mDbExecutor.shutdown();
            try {
                // Attendre que les tâches en cours se terminent (max 5s)
                if (!mDbExecutor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)) {
                    Log.w(TAG, "DB executor did not terminate in time");
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        // Relâcher le WakeLock
        if (mWakeLock != null && mWakeLock.isHeld()) {
            mWakeLock.release();
        }

        // Notifier la fin du service (v5.29.38)
        if (sCallback != null) {
            sCallback.onServiceStopped();
        }

        // Clear callback pour éviter les fuites d'événements
        sCallback = null;
        sInstance = null;

        stopForeground(true);
        super.onDestroy();
        Log.i(TAG, "Service arrêté — " + mPointCount.get() + " points enregistrés dans SQLite");
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // Service non bindable
    }

    // ── Détection d'immobilité ──────────────────────────────────────────────────────

    /**
     * Met à jour le statut d'immobilités basé sur la distance parcourue.
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

    // ── Notification ────────────────────────────────────────────────────────────────

    private Notification buildNotification(int pointCount) {
        String elapsedTime = getElapsedTimeString();

        StringBuilder sb = new StringBuilder();
        sb.append(elapsedTime);
        
        if (pointCount == 0) {
            sb.append(" — En attente du premier point...");
        } else {
            sb.append(" — ").append(pointCount).append(" pts");
            if (mStatsDistance > 0) {
                sb.append(String.format(" — %.1f km", mStatsDistance));
            }
            if (mStatsElevation > 0 || mStatsElevationMinus > 0) {
                sb.append(" — +").append((int)mStatsElevation).append("m");
                sb.append(" / -").append((int)mStatsElevationMinus).append("m");
            }
        }

        String text = sb.toString();

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

    public void updateNotificationStats(double distanceKm, double elevationGainM, double elevationLossM) {
        this.mStatsDistance = distanceKm;
        this.mStatsElevation = elevationGainM;
        this.mStatsElevationMinus = elevationLossM;
        updateNotification(mPointCount.get());
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

    /**
     * v5.25.1: Optimisation batterie - Ajuste dynamiquement la précision GPS
     * selon la vitesse de déplacement et la durée d'enregistrement.
     */
    private void updateAdaptiveGpsConfig() {
        long now = System.currentTimeMillis();

        // Ne re-vérifier que toutes les 30 secondes (évite changements trop fréquents)
        if (now - mLastGpsConfigUpdate < GPS_CONFIG_UPDATE_INTERVAL_MS) {
            return;
        }
        mLastGpsConfigUpdate = now;

        // Calculer durée écoulée
        long elapsedMinutes = (now - mStartTime) / (60 * 1000L);

        // Déterminer le mode optimal selon vitesse et durée
        long newInterval;
        int newPriority;
        String modeDescription;

        if (mCurrentSpeedMps < SPEED_WALKING_SLOW || mIsImmobile) {
            // Mode économie: immobile ou très lent
            newInterval = 10000; // 10s
            newPriority = Priority.PRIORITY_BALANCED_POWER_ACCURACY;
            modeDescription = "ÉCONOMIE (immobile/lent)";
        } else {
            newPriority = Priority.PRIORITY_HIGH_ACCURACY;
            if (mCurrentSpeedMps < SPEED_WALKING_FAST) {
                // Mode standard: marche normale (5-7s)
                newInterval = (elapsedMinutes < 180) ? 5000 : 7000;
                modeDescription = (elapsedMinutes < 180) ? "STANDARD (walking)" : "ECONOMY (3h+)";
            } else {
                // Mode precision: marche rapide ou course (3s)
                newInterval = 3000;
                modeDescription = "PRECISION (fast)";
            }
        }

        // Vérifier si un changement est nécessaire
        if (mLocationRequest.getInterval() != newInterval ||
            mLocationRequest.getPriority() != newPriority) {

            // Mettre à jour la configuration
            mLocationRequest.setInterval(newInterval);
            mLocationRequest.setPriority(newPriority);

            // Réappliquer les changements au FusedLocationProvider
            try {
                mFusedClient.removeLocationUpdates(mLocationCallback);
                mFusedClient.requestLocationUpdates(mLocationRequest, mLocationCallback, Looper.getMainLooper());

                Log.i(TAG, String.format("GPS adaptatif: %s — Intervalle=%ds, Vitesse=%.1fm/s, Durée=%dmin",
                    modeDescription, newInterval/1000, mCurrentSpeedMps, elapsedMinutes));
            } catch (SecurityException e) {
                Log.e(TAG, "Erreur mise à jour GPS adaptatif: " + e.getMessage());
            }
        }
    }

    /**
     * Estime la hauteur du géoïde (différence entre ellipsoïde WGS84 et niveau de la mer)
     * pour corriger l'altitude GPS.
     */
    private double estimateGeoIdHeight(double lat, double lon) {
        // Approximation simplifiée basée sur la localisation
        // Valeur par défaut pour l'Europe occidentale
        if (lat >= 45.0 && lat <= 48.0 && lon >= 5.0 && lon <= 11.0) {
            // Suisse et régions alpines proches
            return 52.0; // mètres
        } else if (lat >= 41.0 && lat <= 51.0 && lon >= -5.0 && lon <= 10.0) {
            // France, Belgique, Pays-Bas
            return 48.0;
        } else if (lat >= 35.0 && lat <= 71.0 && lon >= -10.0 && lon <= 35.0) {
            // Europe générale
            return 50.0;
        } else {
            // Approximation globale basée sur la latitude
            return 50.0; 
        }
    }
}
