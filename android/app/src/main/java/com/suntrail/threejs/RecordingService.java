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
 * RecordingService — Foreground Service Android avec GPS natif (v5.31.2)
 */
public class RecordingService extends Service {

    private static final String TAG             = "RecordingService";
    private static final String CHANNEL_ID      = "suntrail_recording_v1";
    private static final int    NOTIFICATION_ID = 42;
    private static final String PREFS_NAME      = "suntrail_rec_config";
    static final String         STOP_ACTION     = "com.suntrail.threejs.STOP_RECORDING";

    // ── CONSTANTES DE FILTRAGE GPS (Single Source of Truth) ────────────────────────
    private static final float  MAX_SPEED_MPS       = 15.0f;       // 54 km/h
    private static final float  MIN_DISTANCE_M      = 3.0f;        // 3m
    private static final long   MIN_TIME_MS         = 1000L;       // 1s
    private static final float  MAX_ACCURACY_M      = 50.0f;       // 50m
    private static final double MIN_ALT_M           = -500.0;
    private static final double MAX_ALT_M           = 9000.0;

    public interface RecordingCallback {
        void onNewPoints(String courseId, int pointCount);
        void onServiceStopped();
    }

    private static RecordingCallback sCallback;
    public static void setCallback(RecordingCallback callback) { sCallback = callback; }
    public static RecordingCallback getCallback() { return sCallback; }

    private FusedLocationProviderClient mFusedClient;
    private LocationCallback             mLocationCallback;
    private AppDatabase   mDatabase;
    private GPSPointDao  mDao;
    private ExecutorService mDbExecutor;

    private String mCurrentCourseId;
    private Location mLastValidLocation;
    private long     mLastValidTimestamp;
    private final AtomicInteger mPointCount = new AtomicInteger(0);
    private final List<GPSPoint> mPointBuffer = new ArrayList<>();
    private static final int BATCH_SIZE = 3;
    private static final long BATCH_FLUSH_INTERVAL_MS = 10000;
    private long mLastBatchFlush = 0;

    private PowerManager.WakeLock mWakeLock;

    // Stats pour la notification (Single Source of Truth coming from JS)
    private double mStatsDistance = 0.0;
    private double mStatsElevation = 0.0;
    private double mStatsElevationMinus = 0.0;

    private long    mStartTime                 = 0;
    private Location mLastSignificantLocation  = null;
    private long    mLastMovementTime          = 0;
    private boolean mIsImmobile                = false;
    private static final float  IMMOBILITY_DISTANCE_THRESHOLD = 30.0f;
    private static final long   IMMOBILITY_TIME_THRESHOLD     = 30 * 60 * 1000L;

    private PendingIntent    mOpenPendingIntent;
    private PendingIntent    mStopPendingIntent;
    private BroadcastReceiver mStopReceiver;

    private static volatile boolean sIsRunning = false;
    private static RecordingService sInstance = null;
    public static boolean isRunning() { return sIsRunning; }
    public static RecordingService getInstance() { return sInstance; }

    private LocationRequest mLocationRequest;
    private long mLastGpsConfigUpdate = 0;
    private static final long GPS_CONFIG_UPDATE_INTERVAL_MS = 30000;
    private float mCurrentSpeedMps = 0f;
    private static final float SPEED_WALKING_SLOW = 0.8f;
    private static final float SPEED_WALKING_FAST = 1.4f;

    @Override
    public void onCreate() {
        super.onCreate();
        sIsRunning = true;
        sInstance = this;
        mDatabase = AppDatabase.getInstance(getApplicationContext());
        mDao = mDatabase.gpsPointDao();
        mDbExecutor = Executors.newSingleThreadExecutor();
        mFusedClient = LocationServices.getFusedLocationProviderClient(this);
    }

    @Override
    @SuppressWarnings("deprecation")
    public int onStartCommand(Intent intent, int flags, int startId) {
        createNotificationChannel();
        boolean isNewCourse = (intent != null) && intent.getBooleanExtra("isNewCourse", false);

        if (isNewCourse) {
            mCurrentCourseId = java.util.UUID.randomUUID().toString();
            mPointCount.set(0);
            mStartTime = System.currentTimeMillis();
            Log.i(TAG, "Démarrage d'une NOUVELLE course: " + mCurrentCourseId);
        } else {
            SharedPreferences recoveryPrefs = getSharedPreferences("RecordingPrefs", MODE_PRIVATE);
            mCurrentCourseId = recoveryPrefs.getString("currentCourseId", null);
            mStartTime = recoveryPrefs.getLong("startTime", System.currentTimeMillis());

            if (mCurrentCourseId != null) {
                mDbExecutor.execute(() -> {
                    try {
                        int count = mDao.getPointCount(mCurrentCourseId);
                        mPointCount.set(count);
                        updateNotification(count);
                    } catch (Exception e) {
                        Log.e(TAG, "Erreur récupération pointCount: " + e.getMessage());
                    }
                });
            } else {
                mCurrentCourseId = java.util.UUID.randomUUID().toString();
                mPointCount.set(0);
                mStartTime = System.currentTimeMillis();
            }
        }

        mLastValidLocation = null;
        mLastValidTimestamp = 0;

        getSharedPreferences("RecordingPrefs", MODE_PRIVATE).edit()
            .putString("currentCourseId", mCurrentCourseId)
            .putLong("startTime", mStartTime)
            .apply();

        if (sCallback != null) {
            sCallback.onNewPoints(mCurrentCourseId, mPointCount.get());
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        mOpenPendingIntent = PendingIntent.getActivity(this, 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent stopBroadcast = new Intent(STOP_ACTION);
        stopBroadcast.setPackage(getPackageName());
        mStopPendingIntent = PendingIntent.getBroadcast(this, 1, stopBroadcast, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        if (mStopReceiver == null) {
            mStopReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
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

        mLastMovementTime = System.currentTimeMillis();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification(mPointCount.get()), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, buildNotification(mPointCount.get()));
        }

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        long interval = (intent != null) ? intent.getLongExtra("interval", 3000L) : prefs.getLong("interval", 3000L);
        float minDisplacement = (intent != null) ? intent.getFloatExtra("minDisplacement", 0.5f) : prefs.getFloat("minDisplacement", 0.5f);
        boolean highAccuracy = (intent != null) ? intent.getBooleanExtra("highAccuracy", true) : prefs.getBoolean("highAccuracy", true);

        mLocationRequest = LocationRequest.create()
            .setInterval(interval)
            .setFastestInterval(1000L)
            .setSmallestDisplacement(minDisplacement)
            .setPriority(highAccuracy ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY);

        mLocationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                for (Location loc : result.getLocations()) {
                    if (loc.getAccuracy() > MAX_ACCURACY_M) continue;
                    if (!loc.hasAltitude()) continue;

                    double altEllipsoidal = loc.getAltitude();
                    double altOrthometric;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && loc.hasMslAltitude()) {
                        altOrthometric = loc.getMslAltitudeMeters();
                    } else {
                        altOrthometric = altEllipsoidal - estimateGeoIdHeight(loc.getLatitude(), loc.getLongitude());
                    }

                    if (altOrthometric < MIN_ALT_M || altOrthometric > MAX_ALT_M) continue;

                    long now = loc.getTime();
                    long timeDiff = now - mLastValidTimestamp;
                    if (mLastValidTimestamp > 0 && timeDiff < MIN_TIME_MS) continue;

                    double distance3D = 0;
                    if (mLastValidLocation != null) {
                        float distance2D = mLastValidLocation.distanceTo(loc);
                        if (distance2D < MIN_DISTANCE_M) continue;

                        double lastAltOrthometric = mLastValidLocation.getAltitude() - estimateGeoIdHeight(mLastValidLocation.getLatitude(), mLastValidLocation.getLongitude());
                        double altDiff = altOrthometric - lastAltOrthometric;
                        distance3D = Math.sqrt(distance2D * distance2D + altDiff * altDiff);

                        float speedMps = (float) (distance3D / (timeDiff / 1000.0));
                        if (speedMps > MAX_SPEED_MPS) continue;
                        mCurrentSpeedMps = speedMps;
                    }

                    final GPSPoint point = new GPSPoint(mCurrentCourseId, loc.getLatitude(), loc.getLongitude(), altOrthometric, now, loc.getAccuracy());
                    mPointBuffer.add(point);
                    int newCount = mPointCount.incrementAndGet();

                    if (mPointBuffer.size() >= BATCH_SIZE || (now - mLastBatchFlush) > BATCH_FLUSH_INTERVAL_MS) {
                        final List<GPSPoint> pointsToInsert = new ArrayList<>(mPointBuffer);
                        mPointBuffer.clear();
                        mLastBatchFlush = now;
                        mDbExecutor.execute(() -> {
                            mDao.insertAll(pointsToInsert);
                            RecordingCallback cb = getCallback();
                            if (cb != null) cb.onNewPoints(mCurrentCourseId, newCount);
                        });
                    } else {
                        RecordingCallback cb = getCallback();
                        if (cb != null) cb.onNewPoints(mCurrentCourseId, newCount);
                    }

                    mLastValidLocation = loc;
                    mLastValidTimestamp = now;
                    updateImmobilityStatus(loc);
                    updateAdaptiveGpsConfig();
                }
                updateNotification(mPointCount.get());
            }
        };

        try {
            mFusedClient.requestLocationUpdates(mLocationRequest, mLocationCallback, Looper.getMainLooper());
        } catch (SecurityException e) {
            Log.e(TAG, "Permission GPS refusée : " + e.getMessage());
        }

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "suntrail:gps");
            mWakeLock.acquire(24 * 60 * 60 * 1000L);
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        sIsRunning = false;
        getSharedPreferences("RecordingPrefs", MODE_PRIVATE).edit().remove("currentCourseId").apply();
        if (mStopReceiver != null) { try { unregisterReceiver(mStopReceiver); } catch (Exception e) {} }
        if (mFusedClient != null && mLocationCallback != null) mFusedClient.removeLocationUpdates(mLocationCallback);
        if (!mPointBuffer.isEmpty() && mDbExecutor != null) {
            final List<GPSPoint> remaining = new ArrayList<>(mPointBuffer);
            mPointBuffer.clear();
            mDbExecutor.execute(() -> mDao.insertAll(remaining));
        }
        if (mDbExecutor != null) mDbExecutor.shutdown();
        if (mWakeLock != null && mWakeLock.isHeld()) mWakeLock.release();
        if (sCallback != null) sCallback.onServiceStopped();
        sInstance = null;
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void updateImmobilityStatus(Location currentLocation) {
        long now = System.currentTimeMillis();
        if (mLastSignificantLocation == null) {
            mLastSignificantLocation = currentLocation;
            mLastMovementTime = now;
            return;
        }
        if (mLastSignificantLocation.distanceTo(currentLocation) > IMMOBILITY_DISTANCE_THRESHOLD) {
            mLastSignificantLocation = currentLocation;
            mLastMovementTime = now;
            mIsImmobile = false;
        } else if (now - mLastMovementTime > IMMOBILITY_TIME_THRESHOLD) {
            mIsImmobile = true;
        }
    }

    private String getElapsedTimeString() {
        long elapsedMinutes = (System.currentTimeMillis() - mStartTime) / (60 * 1000L);
        return (elapsedMinutes >= 60) ? (elapsedMinutes / 60) + "h " + (elapsedMinutes % 60) + "min" : elapsedMinutes + "min";
    }

    private Notification buildNotification(int pointCount) {
        StringBuilder sb = new StringBuilder();
        sb.append(getElapsedTimeString());
        
        if (pointCount == 0) {
            sb.append(" — En attente du GPS...");
        } else {
            // v5.31.2 : On affiche TOUJOURS les stats, même si 0.0, pour rassurer l'utilisateur
            sb.append(String.format(" — %d pts — %.2f km", pointCount, mStatsDistance));
            sb.append(String.format(" — +%dm / -%dm", (int)mStatsElevation, (int)mStatsElevationMinus));
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(mIsImmobile ? "⚠️ Immobile — SunTrail REC" : "SunTrail 3D — REC Actif")
            .setContentText(sb.toString())
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(mOpenPendingIntent)
            .setOngoing(true)
            .setPriority(mIsImmobile ? NotificationCompat.PRIORITY_DEFAULT : NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE);

        if (mStopPendingIntent != null) builder.addAction(android.R.drawable.ic_delete, "Arrêter REC", mStopPendingIntent);
        return builder.build();
    }

    public void updateNotificationStats(double distanceKm, double elevationGainM, double elevationLossM) {
        Log.d(TAG, String.format("UpdateStats: %.2f km, +%.0f, -%.0f", distanceKm, elevationGainM, elevationLossM));
        this.mStatsDistance = distanceKm;
        this.mStatsElevation = elevationGainM;
        this.mStatsElevationMinus = elevationLossM;
        updateNotification(mPointCount.get());
    }

    private void updateNotification(int pointCount) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification(pointCount));
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Enregistrement SunTrail", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void updateAdaptiveGpsConfig() {
        long now = System.currentTimeMillis();
        if (now - mLastGpsConfigUpdate < GPS_CONFIG_UPDATE_INTERVAL_MS) return;
        mLastGpsConfigUpdate = now;
        long elapsedMinutes = (now - mStartTime) / (60 * 1000L);
        long newInterval = (mCurrentSpeedMps < 0.8f || mIsImmobile) ? 10000 : (mCurrentSpeedMps < 1.4f ? (elapsedMinutes < 180 ? 5000 : 7000) : 3000);
        int newPriority = (mCurrentSpeedMps < 0.8f || mIsImmobile) ? Priority.PRIORITY_BALANCED_POWER_ACCURACY : Priority.PRIORITY_HIGH_ACCURACY;

        if (mLocationRequest.getInterval() != newInterval || mLocationRequest.getPriority() != newPriority) {
            mLocationRequest.setInterval(newInterval).setPriority(newPriority);
            try {
                mFusedClient.removeLocationUpdates(mLocationCallback);
                mFusedClient.requestLocationUpdates(mLocationRequest, mLocationCallback, Looper.getMainLooper());
            } catch (SecurityException e) {}
        }
    }

    private double estimateGeoIdHeight(double lat, double lon) {
        if (lat >= 45.0 && lat <= 48.0 && lon >= 5.0 && lon <= 11.0) return 52.0;
        if (lat >= 41.0 && lat <= 51.0 && lon >= -5.0 && lon <= 10.0) return 48.0;
        return 50.0;
    }
}
