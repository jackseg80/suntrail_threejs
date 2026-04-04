package com.suntrail.threejs;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
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

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * RecordingService — Foreground Service Android avec GPS natif (v5.23)
 *
 * Depuis v5.23, ce service enregistre lui-même les points GPS via FusedLocationProviderClient,
 * indépendamment du cycle de vie de la WebView. Même si Android tue l'Activity pour libérer
 * de la mémoire (ouverture de l'appareil photo, etc.), l'enregistrement GPS continue.
 *
 * Les points sont stockés dans getFilesDir()/suntrail_native_points.json (stockage interne,
 * toujours accessible, pas de permission requise). Quand la WebView revient, elle lit ces
 * points via RecordingPlugin.getRecordedPoints() et les merge avec ses propres données.
 *
 * Type : FOREGROUND_SERVICE_TYPE = "location" (requis pour les apps géo en arrière-plan
 * depuis Android 10 / API 29).
 */
public class RecordingService extends Service {

    private static final String TAG             = "RecordingService";
    private static final String CHANNEL_ID      = "suntrail_recording_v1";
    private static final int    NOTIFICATION_ID = 42;
    static final String         POINTS_FILE     = "suntrail_native_points.json";
    private static final String PREFS_NAME      = "suntrail_rec_config";

    // Seuils de persistance : écrire sur disque toutes les 5 positions ou 10 secondes
    private static final int  PERSIST_EVERY_N     = 5;
    private static final long PERSIST_INTERVAL_MS = 10_000L;

    // GPS
    private FusedLocationProviderClient mFusedClient;
    private LocationCallback            mLocationCallback;

    // Stockage en mémoire des points GPS
    private final List<JSONObject> mPoints = new ArrayList<>();

    // WakeLock partiel : maintient le CPU actif pendant l'enregistrement
    private PowerManager.WakeLock mWakeLock;

    // Compteurs de persistance
    private int  mLastPersistedCount = 0;
    private long mLastPersistTime    = 0;

    // Cache du PendingIntent pour les mises à jour de notification
    private PendingIntent mOpenPendingIntent;

    // ── Lifecycle ─────────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        mFusedClient = LocationServices.getFusedLocationProviderClient(this);

        // Charger les points existants depuis le disque (pour le redémarrage START_STICKY)
        loadPointsFromDisk();
    }

    @Override
    @SuppressWarnings("deprecation") // LocationRequest.create() — API 16+ (minSdk 24)
    public int onStartCommand(Intent intent, int flags, int startId) {
        createNotificationChannel();

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        mOpenPendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        startForeground(NOTIFICATION_ID, buildNotification(mPoints.size()));


        // Lire la config depuis les Intent extras (premier démarrage)
        // ou depuis les SharedPreferences (redémarrage START_STICKY, intent peut être null)
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        long interval        = (intent != null) ? intent.getLongExtra("interval", 3000L)          : prefs.getLong("interval", 3000L);
        float minDisplacement = (intent != null) ? intent.getFloatExtra("minDisplacement", 0.5f)  : prefs.getFloat("minDisplacement", 0.5f);
        boolean highAccuracy  = (intent != null) ? intent.getBooleanExtra("highAccuracy", true)   : prefs.getBoolean("highAccuracy", true);

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

        mLocationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                for (Location loc : result.getLocations()) {
                    try {
                        JSONObject point = new JSONObject();
                        point.put("lat",       loc.getLatitude());
                        point.put("lon",       loc.getLongitude());
                        point.put("alt",       loc.hasAltitude() ? loc.getAltitude() : 0.0);
                        point.put("timestamp", loc.getTime());
                        mPoints.add(point);
                    } catch (JSONException e) {
                        Log.w(TAG, "Erreur création point GPS : " + e.getMessage());
                    }
                }

                // Mise à jour de la notification avec le compteur de points
                updateNotification(mPoints.size());

                // Persister selon les seuils (pas systématiquement pour préserver les I/O)
                long now = System.currentTimeMillis();
                int newPoints = mPoints.size() - mLastPersistedCount;
                if (newPoints >= PERSIST_EVERY_N || now - mLastPersistTime >= PERSIST_INTERVAL_MS) {
                    persistPointsToDisk();
                }
            }
        };

        try {
            mFusedClient.requestLocationUpdates(locationRequest, mLocationCallback, Looper.getMainLooper());
            Log.i(TAG, "GPS natif démarré (interval=" + interval + "ms, minDisplacement=" + minDisplacement + "m)");
        } catch (SecurityException e) {
            Log.e(TAG, "Permission GPS refusée : " + e.getMessage());
        }

        // WakeLock partiel : maintient le CPU actif (timeout 4h max)
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "suntrail:gps");
            mWakeLock.acquire(4 * 60 * 60 * 1000L);
        }

        mLastPersistTime = System.currentTimeMillis();

        // START_STICKY : Android redémarre le service s'il est tué (avec Intent null)
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        // Arrêter les mises à jour GPS
        if (mFusedClient != null && mLocationCallback != null) {
            mFusedClient.removeLocationUpdates(mLocationCallback);
        }

        // Flush final : persister tous les points restants avant de mourir
        persistPointsToDisk();

        // Relâcher le WakeLock
        if (mWakeLock != null && mWakeLock.isHeld()) {
            mWakeLock.release();
        }

        stopForeground(true);
        super.onDestroy();
        Log.i(TAG, "Service arrêté — " + mPoints.size() + " points persistés");
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // Service non bindable
    }

    // ── Persistance ───────────────────────────────────────────────────────────────

    private void persistPointsToDisk() {
        if (mPoints.isEmpty()) return;
        try {
            JSONArray arr = new JSONArray();
            for (JSONObject point : mPoints) {
                arr.put(point);
            }
            File file = new File(getFilesDir(), POINTS_FILE);
            try (FileOutputStream fos = new FileOutputStream(file, false)) {
                fos.write(arr.toString().getBytes(StandardCharsets.UTF_8));
            }
            mLastPersistedCount = mPoints.size();
            mLastPersistTime    = System.currentTimeMillis();
            Log.d(TAG, "Points persistés sur disque : " + mPoints.size());
        } catch (Exception e) {
            Log.w(TAG, "Erreur persistance points : " + e.getMessage());
        }
    }

    private void loadPointsFromDisk() {
        File file = new File(getFilesDir(), POINTS_FILE);
        if (!file.exists()) return;
        try {
            byte[] bytes = new byte[(int) file.length()];
            try (java.io.FileInputStream fis = new java.io.FileInputStream(file)) {
                //noinspection ResultOfMethodCallIgnored
                fis.read(bytes);
            }
            JSONArray arr = new JSONArray(new String(bytes, StandardCharsets.UTF_8));
            for (int i = 0; i < arr.length(); i++) {
                mPoints.add(arr.getJSONObject(i));
            }
            mLastPersistedCount = mPoints.size();
            Log.i(TAG, "Points rechargés depuis le disque : " + mPoints.size());
        } catch (Exception e) {
            Log.w(TAG, "Erreur lecture points depuis le disque : " + e.getMessage());
        }
    }

    // ── Notification ──────────────────────────────────────────────────────────────

    private Notification buildNotification(int pointCount) {
        String text = pointCount == 0
            ? "GPS actif — en attente du premier point..."
            : "GPS actif — " + pointCount + " point" + (pointCount > 1 ? "s" : "") + " enregistré" + (pointCount > 1 ? "s" : "");
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SunTrail 3D — Enregistrement actif")
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(mOpenPendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
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
