package com.suntrail.threejs;

import android.Manifest;
import android.app.AlarmManager;
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
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.database.sqlite.SQLiteException;
import android.database.sqlite.SQLiteFullException;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.suntrail.threejs.data.ActiveGuidanceRoute;
import com.suntrail.threejs.data.AppDatabase;
import com.suntrail.threejs.data.GPSPoint;
import com.suntrail.threejs.data.GPSPointDao;
import com.suntrail.threejs.data.GuidanceDao;
import com.suntrail.threejs.data.GuidanceSession;
import com.suntrail.threejs.guidance.GuidanceEngine;
import com.suntrail.threejs.guidance.GuidancePosition;
import com.suntrail.threejs.guidance.GuidanceRouteCodec;
import com.suntrail.threejs.guidance.GuidanceSnapshot;
import com.suntrail.threejs.guidance.GuidanceUpdate;

import org.json.JSONObject;

import java.io.File;
import java.io.FileWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Service terrain unique de SunTrail.
 *
 * Le nom historique est conservé pour la compatibilité REC. Une seule souscription
 * FusedLocationProviderClient alimente désormais les modes recording, guidance et both. Les
 * points gps_points ne sont écrits que si recording est actif ; le matcher ne double jamais
 * l'écriture GPS. Route, session et snapshot de guidage vivent dans Room et survivent à la
 * destruction de la WebView ou du processus principal.
 */
public class RecordingService extends Service {
    private static final String TAG = "RecordingService";
    private static final String CHANNEL_ID = "suntrail_recording_v1";
    private static final String ALERT_CHANNEL_ID = "suntrail_guidance_alerts_v1";
    private static final int NOTIFICATION_ID = 42;
    private static final int ALERT_NOTIFICATION_ID = 43;

    public static final String ACTION_POINTS_UPDATED = "com.suntrail.threejs.POINTS_UPDATED";
    public static final String ACTION_SERVICE_STOPPED = "com.suntrail.threejs.SERVICE_STOPPED";
    public static final String ACTION_GUIDANCE_SNAPSHOT = "com.suntrail.threejs.GUIDANCE_SNAPSHOT";
    public static final String ACTION_SESSION_CHANGED = "com.suntrail.threejs.SESSION_CHANGED";
    public static final String ACTION_LOCATION_UPDATED = "com.suntrail.threejs.LOCATION_UPDATED";

    public static final String ACTION_UPDATE_STATS = "com.suntrail.threejs.UPDATE_STATS";
    public static final String ACTION_STOP_COURSE = "com.suntrail.threejs.STOP_COURSE";
    public static final String ACTION_START_RECORDING = "com.suntrail.threejs.START_RECORDING";
    public static final String ACTION_STOP_RECORDING = "com.suntrail.threejs.STOP_RECORDING";
    public static final String ACTION_START_GUIDANCE = "com.suntrail.threejs.START_GUIDANCE";
    public static final String ACTION_STOP_GUIDANCE = "com.suntrail.threejs.STOP_GUIDANCE";
    public static final String ACTION_PAUSE_GUIDANCE = "com.suntrail.threejs.PAUSE_GUIDANCE";
    public static final String ACTION_RESUME_GUIDANCE = "com.suntrail.threejs.RESUME_GUIDANCE";
    public static final String ACTION_STOP_ALL = "com.suntrail.threejs.STOP_ALL";

    private static final String STATE_FILE = "rec_state.json";
    private static final String TRACKING_PREFS = "TrackingPrefs";
    private static final String RECORDING_PREFS = "RecordingPrefs";
    private static final String RECORDING_CONFIG = "suntrail_rec_config";

    private static final float MAX_SPEED_MPS = 15.0f;
    private static final float MIN_DISTANCE_M = 3.0f;
    private static final long MIN_TIME_MS = 1000L;
    private static final float MAX_ACCURACY_M = 50.0f;
    private static final double MIN_ALT_M = -500.0;
    private static final double MAX_ALT_M = 9000.0;
    private static final int BATCH_SIZE = 3;
    private static final long BATCH_FLUSH_INTERVAL_MS = 10_000;
    private static final long NOTIFICATION_UPDATE_INTERVAL_MS = 5_000;

    private FusedLocationProviderClient fusedClient;
    private LocationCallback locationCallback;
    private LocationRequest locationRequest;
    private boolean locationUpdatesStarted;
    private AppDatabase database;
    private GPSPointDao gpsDao;
    private GuidanceDao guidanceDao;
    private ExecutorService dbExecutor;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private volatile boolean recordingActive;
    private volatile boolean guidanceActive;
    private volatile boolean explicitShutdown;
    private volatile String issue;
    private String currentCourseId;
    private long startTime;
    private GuidanceEngine guidanceEngine;
    private GuidanceSession guidanceSession;

    private Location lastValidLocation;
    private long lastValidTimestamp;
    private final AtomicInteger pointCount = new AtomicInteger(0);
    private final List<GPSPoint> pointBuffer = new ArrayList<>();
    private long lastBatchFlush;

    private PowerManager.WakeLock wakeLock;
    private double statsDistance;
    private double statsElevation;
    private double statsElevationMinus;
    private Location lastSignificantLocation;
    private long lastMovementTime;
    private boolean isImmobile;
    private float currentSpeedMps;
    private double lastStatsAltitude = Double.NaN;
    private long lastGpsConfigUpdate;
    private long lastNotificationUpdate;
    private long lastRouteIntegrityCheck;
    private long lastGuidancePersistence;
    private String lastGuidanceStatus;
    private volatile boolean routeIntegrityCheckPending;
    private volatile boolean storageFailureLatched;
    private static final float IMMOBILITY_DISTANCE_THRESHOLD = 30.0f;
    private static final long IMMOBILITY_TIME_THRESHOLD = 30 * 60 * 1000L;
    private static final long GPS_CONFIG_UPDATE_INTERVAL_MS = 30_000;

    private BroadcastReceiver providersReceiver;

    private final Runnable guidanceTicker = new Runnable() {
        @Override
        public void run() {
            if (!guidanceActive || guidanceEngine == null) return;
            long now = System.currentTimeMillis();
            if (!hasLocationPermission()) {
                boolean issueChanged = !"permission-denied".equals(issue);
                issue = "permission-denied";
                if (locationUpdatesStarted && fusedClient != null && locationCallback != null) {
                    fusedClient.removeLocationUpdates(locationCallback);
                    locationUpdatesStarted = false;
                }
                if (issueChanged) {
                    persistSession();
                    broadcastSessionChanged();
                    updateNotification();
                }
            } else {
                if ("permission-denied".equals(issue)) {
                    issue = isLocationEnabled() ? null : "gps-disabled";
                    ensureLocationUpdates();
                    persistSession();
                    broadcastSessionChanged();
                    updateNotification();
                }
                applyGuidanceUpdate(guidanceEngine.tick(now));
            }
            if (!routeIntegrityCheckPending && now - lastRouteIntegrityCheck >= 10_000) {
                routeIntegrityCheckPending = true;
                lastRouteIntegrityCheck = now;
                final String expectedRouteId = guidanceSession == null ? null : guidanceSession.routeId;
                dbExecutor.execute(() -> {
                    try {
                        ActiveGuidanceRoute route = guidanceDao.getActiveRoute();
                        if (route == null || expectedRouteId == null || !expectedRouteId.equals(route.routeId)) {
                            issue = "route-missing";
                            mainHandler.post(() -> stopGuidanceMode(true));
                        }
                    } catch (SQLiteException error) {
                        handleStorageFailure(error);
                    } finally {
                        routeIntegrityCheckPending = false;
                    }
                });
            }
            mainHandler.postDelayed(this, 1_000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        database = AppDatabase.getInstance(getApplicationContext());
        gpsDao = database.gpsPointDao();
        guidanceDao = database.guidanceDao();
        dbExecutor = Executors.newSingleThreadExecutor();
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
        createNotificationChannels();
        registerProvidersReceiver();
    }

    @Override
    @SuppressWarnings("deprecation")
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_UPDATE_STATS.equals(action)) {
            if (!recordingActive && !trackingPrefs().getBoolean("recordingActive", false)) {
                if (!guidanceActive && trackingPrefs().getBoolean("guidanceActive", false)) {
                    recoverAfterProcessRestart();
                } else if (!guidanceActive) {
                    explicitShutdown = true;
                    stopSelf(startId);
                }
                updateNotification();
                return activeReturnCode();
            }
            statsDistance = intent.getDoubleExtra("distance", 0.0);
            statsElevation = intent.getDoubleExtra("elevation", 0.0);
            statsElevationMinus = intent.getDoubleExtra("elevationMinus", 0.0);
            updateNotification();
            return START_STICKY;
        }
        if (ACTION_STOP_COURSE.equals(action)) {
            // The WebView remains alive and finalizes the REC itself; do not
            // create a pending course that would be saved again at restart.
            stopRecordingMode(false);
            return activeReturnCode();
        }
        if (ACTION_STOP_RECORDING.equals(action)) {
            // Notification action: the WebView can be asleep or killed, so it
            // needs a recoverable final course when the app returns.
            stopRecordingMode(true);
            return activeReturnCode();
        }
        if (ACTION_STOP_GUIDANCE.equals(action)) {
            stopGuidanceMode(true);
            return activeReturnCode();
        }
        if (ACTION_PAUSE_GUIDANCE.equals(action)) {
            if (guidanceEngine != null) applyGuidanceUpdate(guidanceEngine.pause(System.currentTimeMillis()));
            return START_STICKY;
        }
        if (ACTION_RESUME_GUIDANCE.equals(action)) {
            if (guidanceEngine != null) applyGuidanceUpdate(guidanceEngine.resume(System.currentTimeMillis()));
            return START_STICKY;
        }
        if (ACTION_STOP_ALL.equals(action)) {
            stopRecordingMode(true);
            stopGuidanceMode(true);
            stopIfInactive();
            return START_NOT_STICKY;
        }
        if (ACTION_START_GUIDANCE.equals(action)) {
            startGuidanceMode();
            return START_STICKY;
        }
        if (ACTION_START_RECORDING.equals(action) || action == null && intent != null) {
            startRecordingMode(intent, intent != null && intent.getBooleanExtra("isNewCourse", false));
            return START_STICKY;
        }

        // START_STICKY sans Intent : reprendre les marqueurs rapides puis recharger Room.
        if (intent == null) {
            recoverAfterProcessRestart();
            return activeReturnCode();
        }

        // API historique startCourse/startForeground : absence d'action = recording-only.
        startRecordingMode(intent, intent.getBooleanExtra("isNewCourse", false));
        return START_STICKY;
    }

    private void startRecordingMode(Intent intent, boolean isNewCourse) {
        if (!hasLocationPermission()) {
            issue = "permission-denied";
            broadcastSessionChanged();
            stopIfInactive();
            return;
        }
        explicitShutdown = false;
        if (!recordingActive) {
            if (isNewCourse) {
                currentCourseId = UUID.randomUUID().toString();
                pointCount.set(0);
                startTime = System.currentTimeMillis();
                resetRecordingStats();
            } else {
                SharedPreferences prefs = getSharedPreferences(RECORDING_PREFS, MODE_PRIVATE);
                currentCourseId = prefs.getString("currentCourseId", null);
                startTime = prefs.getLong("startTime", System.currentTimeMillis());
                if (currentCourseId == null || currentCourseId.isEmpty()) {
                    currentCourseId = UUID.randomUUID().toString();
                    pointCount.set(0);
                    startTime = System.currentTimeMillis();
                } else {
                    final String courseId = currentCourseId;
                    dbExecutor.execute(() -> {
                        try {
                            restoreRecordingStats(courseId);
                        } catch (SQLiteException error) {
                            handleStorageFailure(error);
                        }
                    });
                }
            }
            getSharedPreferences(RECORDING_PREFS, MODE_PRIVATE).edit()
                .putString("currentCourseId", currentCourseId)
                .putLong("startTime", startTime)
                .apply();
            recordingActive = true;
            lastValidLocation = null;
            lastValidTimestamp = 0;
            lastMovementTime = System.currentTimeMillis();
            writeStateFile(true);
            sendPointsBroadcast(currentCourseId, pointCount.get());
        }
        readRecordingConfig(intent);
        persistFastState();
        ensureForeground();
        ensureLocationUpdates();
        acquireWakeLock();
        persistSession();
        broadcastSessionChanged();
    }

    private void startGuidanceMode() {
        if (!hasLocationPermission()) {
            issue = "permission-denied";
            broadcastSessionChanged();
            stopIfInactive();
            return;
        }
        explicitShutdown = false;
        guidanceActive = true;
        lastGuidanceStatus = null;
        lastGuidancePersistence = 0;
        issue = isLocationEnabled() ? null : "gps-disabled";
        persistFastState();
        broadcastSessionChanged();
        ensureForeground();
        ensureLocationUpdates();
        acquireWakeLock();
        dbExecutor.execute(() -> {
            try {
                ActiveGuidanceRoute route = guidanceDao.getActiveRoute();
                GuidanceSession session = guidanceDao.getActiveSession();
                if (route == null || session == null) {
                    issue = "route-missing";
                    mainHandler.post(() -> stopGuidanceMode(true));
                    return;
                }
                GuidanceEngine engine = new GuidanceEngine(route.routeId,
                    GuidanceRouteCodec.parseGeometry(route.geometryJson), route.plannedPaceKmh,
                    GuidanceRouteCodec.parseCues(route.cuesJson));
                guidanceSession = session;
                guidanceEngine = engine;
                GuidanceUpdate initial = session.progressMeters > 0 || !"acquiring".equals(session.status)
                    ? engine.restore(session, System.currentTimeMillis())
                    : engine.start(System.currentTimeMillis());
                mainHandler.post(() -> {
                    mainHandler.removeCallbacks(guidanceTicker);
                    applyGuidanceUpdate(initial);
                    mainHandler.postDelayed(guidanceTicker, 1_000);
                });
            } catch (Exception error) {
                Log.e(TAG, "Unable to start guidance", error);
                issue = "route-corrupt";
                mainHandler.post(() -> stopGuidanceMode(true));
            }
        });
    }

    private void recoverAfterProcessRestart() {
        SharedPreferences prefs = trackingPrefs();
        recordingActive = prefs.getBoolean("recordingActive", false);
        guidanceActive = prefs.getBoolean("guidanceActive", false);
        if (!recordingActive && !guidanceActive) {
            explicitShutdown = true;
            stopSelf();
            return;
        }
        if (recordingActive) {
            SharedPreferences recordingPrefs = getSharedPreferences(RECORDING_PREFS, MODE_PRIVATE);
            currentCourseId = recordingPrefs.getString("currentCourseId", null);
            startTime = recordingPrefs.getLong("startTime", System.currentTimeMillis());
            final String courseId = currentCourseId;
            if (courseId != null) dbExecutor.execute(() -> restoreRecordingStats(courseId));
        }
        ensureForeground();
        acquireWakeLock();
        ensureLocationUpdates();
        if (guidanceActive) startGuidanceMode();
        else persistSession();
        broadcastSessionChanged();
    }

    private void stopRecordingMode(boolean notifyBridge) {
        if (!recordingActive && currentCourseId == null) return;
        String stoppedCourseId = currentCourseId;
        long stoppedStartTime = startTime;
        recordingActive = false;
        flushPointBuffer();
        SharedPreferences.Editor recordingEditor = getSharedPreferences(RECORDING_PREFS, MODE_PRIVATE).edit()
            .remove("currentCourseId").remove("startTime");
        if (notifyBridge && stoppedCourseId != null && !stoppedCourseId.isEmpty()) {
            recordingEditor
                .putString("pendingStoppedCourseId", stoppedCourseId)
                .putLong("pendingStoppedStartTime", stoppedStartTime);
        }
        recordingEditor.apply();
        currentCourseId = null;
        writeStateFile(false);
        persistFastState();
        persistSession();
        if (notifyBridge) sendPackageBroadcast(ACTION_SERVICE_STOPPED);
        broadcastSessionChanged();
        reconfigureLocationUpdates();
        stopIfInactive();
    }

    private void stopGuidanceMode(boolean notifyBridge) {
        if (!guidanceActive && guidanceEngine == null) return;
        GuidanceEngine engine = guidanceEngine;
        if (engine != null) broadcastGuidanceUpdate(engine.stop(System.currentTimeMillis()));
        guidanceActive = false;
        guidanceEngine = null;
        guidanceSession = null;
        lastGuidanceStatus = null;
        lastGuidancePersistence = 0;
        mainHandler.removeCallbacks(guidanceTicker);
        dbExecutor.execute(() -> {
            try {
                guidanceDao.deleteActiveRoute();
                GuidanceSession session = guidanceDao.getActiveSession();
                if (recordingActive) {
                    if (session == null) session = new GuidanceSession();
                    session.mode = "recording";
                    session.routeId = null;
                    session.status = "idle";
                    session.recordingCourseId = currentCourseId;
                    session.updatedAt = System.currentTimeMillis();
                    guidanceDao.upsertSession(session);
                } else {
                    guidanceDao.deleteActiveSession();
                }
            } catch (SQLiteException error) {
                handleStorageFailure(error);
            }
        });
        persistFastState();
        if (notifyBridge) broadcastSessionChanged();
        reconfigureLocationUpdates();
        stopIfInactive();
    }

    private void stopIfInactive() {
        if (recordingActive || guidanceActive) {
            updateNotification();
            return;
        }
        explicitShutdown = true;
        persistFastState();
        stopSelf();
    }

    private int activeReturnCode() {
        return recordingActive || guidanceActive ? START_STICKY : START_NOT_STICKY;
    }

    private void ensureLocationUpdates() {
        if (!hasLocationPermission()) {
            issue = "permission-denied";
            return;
        }
        buildLocationRequest();
        if (locationCallback == null) locationCallback = createLocationCallback();
        try {
            if (locationUpdatesStarted) fusedClient.removeLocationUpdates(locationCallback);
            fusedClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper());
            locationUpdatesStarted = true;
        } catch (SecurityException error) {
            issue = "permission-denied";
            persistSession();
            broadcastSessionChanged();
        }
    }

    private void reconfigureLocationUpdates() {
        if (!recordingActive && !guidanceActive) {
            if (locationUpdatesStarted && fusedClient != null && locationCallback != null) {
                fusedClient.removeLocationUpdates(locationCallback);
            }
            locationUpdatesStarted = false;
            releaseWakeLock();
            return;
        }
        ensureLocationUpdates();
        updateNotification();
    }

    @SuppressWarnings("deprecation")
    private void buildLocationRequest() {
        SharedPreferences prefs = getSharedPreferences(RECORDING_CONFIG, MODE_PRIVATE);
        long interval = guidanceActive ? 3_000L : prefs.getLong("interval", 3_000L);
        float minDisplacement = prefs.getFloat("minDisplacement", 0.5f);
        boolean highAccuracy = guidanceActive || prefs.getBoolean("highAccuracy", true);
        locationRequest = LocationRequest.create()
            .setInterval(interval)
            .setFastestInterval(1_000L)
            .setSmallestDisplacement(minDisplacement)
            .setPriority(highAccuracy ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY);
    }

    private LocationCallback createLocationCallback() {
        return new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                for (Location location : result.getLocations()) {
                    double altitude = orthometricAltitude(location);
                    broadcastLocation(location, altitude);
                    if (guidanceActive && guidanceEngine != null) {
                        Double accuracy = location.hasAccuracy() ? (double) location.getAccuracy() : null;
                        applyGuidanceUpdate(guidanceEngine.update(
                            new GuidancePosition(location.getLatitude(), location.getLongitude(), accuracy,
                                location.getTime()), System.currentTimeMillis()));
                    }
                    if (recordingActive) handleRecordingLocation(location, altitude);
                }
                updateNotificationThrottled();
            }
        };
    }

    private void handleRecordingLocation(Location location, double altitude) {
        if (!location.hasAccuracy() || location.getAccuracy() > MAX_ACCURACY_M) return;
        if (!location.hasAltitude() || altitude < MIN_ALT_M || altitude > MAX_ALT_M) return;
        long timestamp = location.getTime();
        if (pointCount.get() == 0 && timestamp < startTime - 15_000) return;
        long timeDiff = timestamp - lastValidTimestamp;
        if (lastValidTimestamp > 0 && timeDiff < MIN_TIME_MS) return;

        if (lastValidLocation != null) {
            float distance2D = lastValidLocation.distanceTo(location);
            float minDistance = pointCount.get() < 5 ? 1.5f : MIN_DISTANCE_M;
            if (distance2D < minDistance) return;
            double lastAltitude = Double.isFinite(lastStatsAltitude)
                ? lastStatsAltitude
                : orthometricAltitude(lastValidLocation);
            double altitudeDiff = altitude - lastAltitude;
            double distance3D = Math.sqrt(distance2D * distance2D + altitudeDiff * altitudeDiff);
            float speedMps = (float) (distance3D / (timeDiff / 1000.0));
            if (speedMps > MAX_SPEED_MPS) return;
            currentSpeedMps = speedMps;
            statsDistance += distance3D / 1_000.0;
            if (Double.isFinite(lastStatsAltitude)) {
                double elevationDelta = altitude - lastStatsAltitude;
                // Five-metre hysteresis keeps notification D+/D- useful
                // without amplifying normal barometric/GPS noise.
                if (elevationDelta >= 5.0) statsElevation += elevationDelta;
                else if (elevationDelta <= -5.0) statsElevationMinus += -elevationDelta;
            }
        }

        GPSPoint point = new GPSPoint(currentCourseId, location.getLatitude(), location.getLongitude(),
            altitude, timestamp, location.getAccuracy());
        synchronized (pointBuffer) { pointBuffer.add(point); }
        int newCount = pointCount.incrementAndGet();
        if (pointBuffer.size() >= BATCH_SIZE || timestamp - lastBatchFlush > BATCH_FLUSH_INTERVAL_MS) {
            List<GPSPoint> pending;
            synchronized (pointBuffer) {
                pending = new ArrayList<>(pointBuffer);
                pointBuffer.clear();
            }
            lastBatchFlush = timestamp;
            final String courseId = currentCourseId;
            dbExecutor.execute(() -> {
                try {
                    gpsDao.insertAll(pending);
                    sendPointsBroadcast(courseId, newCount);
                } catch (SQLiteException error) {
                    handleStorageFailure(error);
                }
            });
        }
        lastValidLocation = location;
        lastStatsAltitude = altitude;
        lastValidTimestamp = timestamp;
        updateImmobilityStatus(location);
        updateAdaptiveGpsConfig();
    }

    private void applyGuidanceUpdate(GuidanceUpdate update) {
        if (!guidanceActive) return;
        GuidanceSnapshot snapshot = update.snapshot;
        boolean statusChanged = !Objects.equals(lastGuidanceStatus, snapshot.status);
        boolean hasEvents = !update.events.isEmpty();
        lastGuidanceStatus = snapshot.status;
        if (update.acceptedPosition || statusChanged || hasEvents) {
            broadcastGuidanceUpdate(update);
        }
        long now = System.currentTimeMillis();
        if (statusChanged || hasEvents ||
            (update.acceptedPosition && now - lastGuidancePersistence >= 10_000L)) {
            persistSession();
            lastGuidancePersistence = now;
        }
        for (String event : update.events) {
            if ("off-route".equals(event)) showGuidanceAlert("Hors itinéraire", "Revenez vers la trace SunTrail.");
            else if ("arrived".equals(event)) showGuidanceAlert("Arrivée", "Vous avez atteint la fin de la route.");
        }
        updateNotificationThrottled();
    }

    private void broadcastGuidanceUpdate(GuidanceUpdate update) {
        try {
            Intent intent = packageIntent(ACTION_GUIDANCE_SNAPSHOT);
            intent.putExtra("snapshot", update.snapshot.toJson().toString());
            intent.putExtra("events", new org.json.JSONArray(update.events).toString());
            intent.putExtra("acceptedPosition", update.acceptedPosition);
            intent.putExtra("issue", issue);
            sendBroadcast(intent);
        } catch (Exception error) {
            Log.w(TAG, "Unable to broadcast guidance snapshot", error);
        }
    }

    private void persistSession() {
        // Le bridge a déjà écrit la route/session initiale. Ne jamais l'écraser pendant
        // la courte fenêtre asynchrone où le moteur est encore en chargement.
        if (guidanceActive && guidanceEngine == null) return;
        GuidanceSession session = guidanceSession == null ? new GuidanceSession() : guidanceSession;
        session.mode = currentMode();
        session.recordingCourseId = recordingActive ? currentCourseId : null;
        session.issue = issue;
        long now = System.currentTimeMillis();
        if (guidanceActive && guidanceEngine != null) {
            guidanceEngine.writePersistentState(session, now);
        } else {
            session.routeId = null;
            session.status = "idle";
            session.updatedAt = now;
        }
        guidanceSession = session;
        GuidanceSession persisted = copySession(session);
        boolean keepSession = recordingActive || guidanceActive;
        dbExecutor.execute(() -> {
            try {
                if (keepSession) guidanceDao.upsertSession(persisted);
                else guidanceDao.deleteActiveSession();
            } catch (SQLiteFullException error) {
                handleStorageFailure(error);
            } catch (SQLiteException error) {
                Log.e(TAG, "Session persistence failed", error);
                issue = "storage-error";
                broadcastSessionChanged();
            }
        });
    }

    private void handleStorageFailure(SQLiteException error) {
        Log.e(TAG, "Storage failure", error);
        issue = error instanceof SQLiteFullException ? "storage-full" : "storage-error";
        if (storageFailureLatched) return;
        storageFailureLatched = true;
        mainHandler.post(() -> {
            if (recordingActive) stopRecordingMode(true);
            broadcastSessionChanged();
            updateNotification();
        });
    }

    private GuidanceSession copySession(GuidanceSession source) {
        GuidanceSession copy = new GuidanceSession();
        copy.id = source.id;
        copy.mode = source.mode;
        copy.routeId = source.routeId;
        copy.status = source.status;
        copy.recordingCourseId = source.recordingCourseId;
        copy.progressMeters = source.progressMeters;
        copy.remainingMeters = source.remainingMeters;
        copy.crossTrackMeters = source.crossTrackMeters;
        copy.etaEpochMs = source.etaEpochMs;
        copy.bearing = source.bearing;
        copy.nextCueJson = source.nextCueJson;
        copy.distanceToNextCueMeters = source.distanceToNextCueMeters;
        copy.accuracyMeters = source.accuracyMeters;
        copy.positionAgeMs = source.positionAgeMs;
        copy.updatedAt = source.updatedAt;
        copy.lastPositionLat = source.lastPositionLat;
        copy.lastPositionLon = source.lastPositionLon;
        copy.lastPositionAccuracy = source.lastPositionAccuracy;
        copy.lastPositionTimestamp = source.lastPositionTimestamp;
        copy.lastProjectedLat = source.lastProjectedLat;
        copy.lastProjectedLon = source.lastProjectedLon;
        copy.currentSegmentIndex = source.currentSegmentIndex;
        copy.goodSampleCount = source.goodSampleCount;
        copy.offRouteSince = source.offRouteSince;
        copy.recoverySince = source.recoverySince;
        copy.recoveredAt = source.recoveredAt;
        copy.arrivalSince = source.arrivalSince;
        copy.lastOffRouteAlertAt = source.lastOffRouteAlertAt;
        copy.issue = source.issue;
        return copy;
    }

    private void flushPointBuffer() {
        List<GPSPoint> pending;
        synchronized (pointBuffer) {
            if (pointBuffer.isEmpty()) return;
            pending = new ArrayList<>(pointBuffer);
            pointBuffer.clear();
        }
        dbExecutor.execute(() -> {
            try { gpsDao.insertAll(pending); }
            catch (SQLiteException error) { handleStorageFailure(error); }
        });
    }

    private void resetRecordingStats() {
        statsDistance = 0.0;
        statsElevation = 0.0;
        statsElevationMinus = 0.0;
        lastStatsAltitude = Double.NaN;
        currentSpeedMps = 0.0f;
    }

    private void restoreRecordingStats(String courseId) {
        List<GPSPoint> points = gpsDao.getPointsForCourse(courseId);
        double distanceKm = 0.0;
        double ascent = 0.0;
        double descent = 0.0;
        GPSPoint previous = null;
        for (GPSPoint point : points) {
            if (previous != null) {
                float[] result = new float[1];
                Location.distanceBetween(previous.lat, previous.lon, point.lat, point.lon, result);
                double altitudeDelta = point.alt - previous.alt;
                distanceKm += Math.sqrt(result[0] * result[0] + altitudeDelta * altitudeDelta) / 1_000.0;
                if (altitudeDelta >= 5.0) ascent += altitudeDelta;
                else if (altitudeDelta <= -5.0) descent += -altitudeDelta;
            }
            previous = point;
        }
        final GPSPoint last = previous;
        final double restoredDistance = distanceKm;
        final double restoredAscent = ascent;
        final double restoredDescent = descent;
        mainHandler.post(() -> {
            pointCount.set(points.size());
            statsDistance = restoredDistance;
            statsElevation = restoredAscent;
            statsElevationMinus = restoredDescent;
            if (last != null) {
                Location restored = new Location("suntrail-room");
                restored.setLatitude(last.lat);
                restored.setLongitude(last.lon);
                restored.setAltitude(last.alt);
                restored.setAccuracy(last.accuracy);
                restored.setTime(last.timestamp);
                lastValidLocation = restored;
                lastValidTimestamp = last.timestamp;
                lastStatsAltitude = last.alt;
            }
            updateNotification();
        });
    }

    private void ensureForeground() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void updateNotificationThrottled() {
        long now = System.currentTimeMillis();
        if (now - lastNotificationUpdate < NOTIFICATION_UPDATE_INTERVAL_MS) return;
        lastNotificationUpdate = now;
        updateNotification();
    }

    private void updateNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null && (recordingActive || guidanceActive)) {
            manager.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private Notification buildNotification() {
        String mode = currentMode();
        String title;
        if ("both".equals(mode)) title = "SunTrail — Guidage + REC";
        else if ("guidance".equals(mode)) title = "SunTrail — Guidage actif";
        else title = isImmobile ? "Immobile — SunTrail REC" : "SunTrail — REC actif";

        StringBuilder text = new StringBuilder();
        GuidanceSnapshot snapshot = guidanceActive && guidanceEngine != null
            ? guidanceEngine.getSnapshot(System.currentTimeMillis()) : null;
        if (snapshot != null) {
            if (snapshot.nextCue != null && snapshot.distanceToNextCueMeters != null) {
                text.append(cueLabel(snapshot.nextCue.kind)).append(" dans ")
                    .append(formatNotificationDistance(snapshot.distanceToNextCueMeters));
            } else {
                text.append(String.format(Locale.getDefault(), "%.1f km restants · %s",
                    snapshot.remainingMeters / 1000.0, statusLabel(snapshot.status)));
            }
        }
        if (recordingActive) {
            if (text.length() > 0) text.append(" · ");
            text.append(getElapsedTimeString());
            if (pointCount.get() == 0) text.append(" · GPS…");
            else {
                double elapsedHours = Math.max(1L, System.currentTimeMillis() - startTime) / 3_600_000.0;
                double averageSpeedKmh = statsDistance / elapsedHours;
                text.append(String.format(Locale.getDefault(), " · %.2f km · %.1f km/h",
                    statsDistance, averageSpeedKmh));
            }
        }
        if (issue != null) text.append(" · ").append(issueLabel(issue));

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text.toString())
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text.toString()))
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(openPendingIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE);

        if (guidanceActive) {
            boolean paused = snapshot != null && "paused".equals(snapshot.status);
            builder.addAction(android.R.drawable.ic_media_pause, paused ? "Reprendre" : "Pause",
                servicePendingIntent(paused ? ACTION_RESUME_GUIDANCE : ACTION_PAUSE_GUIDANCE, 10));
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter guidage",
                servicePendingIntent(ACTION_STOP_GUIDANCE, 11));
        }
        if (recordingActive) {
            builder.addAction(android.R.drawable.ic_delete, "Arrêter REC",
                servicePendingIntent(ACTION_STOP_RECORDING, 12));
        }
        return builder.build();
    }

    private String formatNotificationDistance(double meters) {
        if (meters >= 1_000.0) return String.format(Locale.getDefault(), "%.1f km", meters / 1_000.0);
        return String.format(Locale.getDefault(), "%.0f m", meters);
    }

    private String cueLabel(String kind) {
        if ("left".equals(kind) || "sharp-left".equals(kind) || "slight-left".equals(kind)) return "Tournez à gauche";
        if ("right".equals(kind) || "sharp-right".equals(kind) || "slight-right".equals(kind)) return "Tournez à droite";
        if ("u-turn".equals(kind)) return "Demi-tour";
        if ("arrive".equals(kind)) return "Arrivée";
        return "Continuez";
    }

    private PendingIntent openPendingIntent() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent servicePendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, RecordingService.class).setAction(action);
        return PendingIntent.getService(this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void showGuidanceAlert(String title, String text) {
        Notification notification = new NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(openPendingIntent())
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVibrate(new long[]{0, 250, 150, 250})
            .build();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(ALERT_NOTIFICATION_ID, notification);
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel tracking = new NotificationChannel(CHANNEL_ID,
            "Suivi terrain SunTrail", NotificationManager.IMPORTANCE_LOW);
        tracking.setShowBadge(false);
        manager.createNotificationChannel(tracking);
        NotificationChannel alerts = new NotificationChannel(ALERT_CHANNEL_ID,
            "Alertes de guidage SunTrail", NotificationManager.IMPORTANCE_HIGH);
        alerts.enableVibration(true);
        alerts.setVibrationPattern(new long[]{0, 250, 150, 250});
        manager.createNotificationChannel(alerts);
    }

    private void registerProvidersReceiver() {
        providersReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                issue = isLocationEnabled() ? null : "gps-disabled";
                if (guidanceEngine != null) applyGuidanceUpdate(guidanceEngine.tick(System.currentTimeMillis()));
                persistSession();
                broadcastSessionChanged();
                updateNotification();
            }
        };
        ContextCompat.registerReceiver(this, providersReceiver,
            new IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION),
            ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    private void broadcastLocation(Location location, double altitude) {
        Intent intent = packageIntent(ACTION_LOCATION_UPDATED);
        intent.putExtra("lat", location.getLatitude());
        intent.putExtra("lon", location.getLongitude());
        intent.putExtra("alt", altitude);
        intent.putExtra("accuracy", location.hasAccuracy() ? location.getAccuracy() : -1f);
        intent.putExtra("timestamp", location.getTime());
        sendBroadcast(intent);
    }

    private void broadcastSessionChanged() {
        Intent intent = packageIntent(ACTION_SESSION_CHANGED);
        intent.putExtra("mode", currentMode());
        intent.putExtra("recording", recordingActive);
        intent.putExtra("guidance", guidanceActive);
        intent.putExtra("issue", issue);
        sendBroadcast(intent);
    }

    private void sendPointsBroadcast(String courseId, int count) {
        Intent intent = packageIntent(ACTION_POINTS_UPDATED);
        intent.putExtra("courseId", courseId);
        intent.putExtra("pointCount", count);
        sendBroadcast(intent);
    }

    private void sendPackageBroadcast(String action) { sendBroadcast(packageIntent(action)); }
    private Intent packageIntent(String action) { return new Intent(action).setPackage(getPackageName()); }

    private void readRecordingConfig(Intent intent) {
        SharedPreferences prefs = getSharedPreferences(RECORDING_CONFIG, MODE_PRIVATE);
        if (intent == null) return;
        prefs.edit()
            .putLong("interval", intent.getLongExtra("interval", prefs.getLong("interval", 3_000L)))
            .putFloat("minDisplacement", intent.getFloatExtra("minDisplacement", prefs.getFloat("minDisplacement", 0.5f)))
            .putBoolean("highAccuracy", intent.getBooleanExtra("highAccuracy", prefs.getBoolean("highAccuracy", true)))
            .apply();
    }

    private void updateImmobilityStatus(Location location) {
        long now = System.currentTimeMillis();
        if (lastSignificantLocation == null) {
            lastSignificantLocation = location;
            lastMovementTime = now;
        } else if (lastSignificantLocation.distanceTo(location) > IMMOBILITY_DISTANCE_THRESHOLD) {
            lastSignificantLocation = location;
            lastMovementTime = now;
            isImmobile = false;
        } else if (now - lastMovementTime > IMMOBILITY_TIME_THRESHOLD) {
            isImmobile = true;
        }
    }

    @SuppressWarnings("deprecation")
    private void updateAdaptiveGpsConfig() {
        if (guidanceActive || locationRequest == null) return;
        long now = System.currentTimeMillis();
        if (now - lastGpsConfigUpdate < GPS_CONFIG_UPDATE_INTERVAL_MS) return;
        lastGpsConfigUpdate = now;
        long interval = isImmobile ? 30_000 : currentSpeedMps < 0.5f ? 10_000 : currentSpeedMps < 1.4f ? 5_000 : 3_000;
        int priority = isImmobile ? Priority.PRIORITY_BALANCED_POWER_ACCURACY : Priority.PRIORITY_HIGH_ACCURACY;
        if (locationRequest.getInterval() != interval || locationRequest.getPriority() != priority) {
            locationRequest.setInterval(interval).setPriority(priority);
            ensureLocationUpdates();
        }
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED;
    }

    private boolean isLocationEnabled() {
        LocationManager manager = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (manager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return manager.isLocationEnabled();
        return manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
            manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    }

    private double orthometricAltitude(Location location) {
        if (!location.hasAltitude()) return 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && location.hasMslAltitude()) {
            return location.getMslAltitudeMeters();
        }
        return location.getAltitude() - estimateGeoidHeight(location.getLatitude(), location.getLongitude());
    }

    private double estimateGeoidHeight(double lat, double lon) {
        if (lat >= 45 && lat <= 48 && lon >= 5 && lon <= 11) return 52;
        if (lat >= 41 && lat <= 51 && lon >= -5 && lon <= 10) return 48;
        return 50;
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager manager = (PowerManager) getSystemService(POWER_SERVICE);
        if (manager == null) return;
        wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "suntrail:tracking");
        wakeLock.acquire(24 * 60 * 60 * 1000L);
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    private void persistFastState() {
        trackingPrefs().edit()
            .putBoolean("recordingActive", recordingActive)
            .putBoolean("guidanceActive", guidanceActive)
            .apply();
    }

    private SharedPreferences trackingPrefs() { return getSharedPreferences(TRACKING_PREFS, MODE_PRIVATE); }

    private String currentMode() {
        if (recordingActive && guidanceActive) return "both";
        if (guidanceActive) return "guidance";
        if (recordingActive) return "recording";
        return "none";
    }

    private String statusLabel(String status) {
        if ("offRoute".equals(status)) return "hors trace";
        if ("recovered".equals(status)) return "repris";
        if ("paused".equals(status)) return "pause";
        if ("arrived".equals(status)) return "arrivé";
        if ("acquiring".equals(status)) return "GPS…";
        return "sur trace";
    }

    private String issueLabel(String value) {
        if ("gps-disabled".equals(value)) return "GPS désactivé";
        if ("permission-denied".equals(value)) return "permission GPS retirée";
        if ("storage-full".equals(value)) return "stockage plein";
        if ("route-missing".equals(value) || "route-corrupt".equals(value)) return "route indisponible";
        return "stockage indisponible";
    }

    private String getElapsedTimeString() {
        if (startTime <= 0 || startTime > System.currentTimeMillis()) return "0min";
        long minutes = (System.currentTimeMillis() - startTime) / 60_000L;
        if (minutes < 0 || minutes > 365L * 24 * 60) return "0min";
        return minutes >= 60 ? minutes / 60 + "h " + minutes % 60 + "min" : minutes + "min";
    }

    private void writeStateFile(boolean running) {
        try {
            JSONObject json = new JSONObject();
            json.put("isRunning", running);
            json.put("courseId", running && currentCourseId != null ? currentCourseId : "");
            json.put("startTime", running ? startTime : 0);
            json.put("mode", currentMode());
            File file = new File(getFilesDir(), STATE_FILE);
            try (FileWriter writer = new FileWriter(file)) { writer.write(json.toString()); }
        } catch (Exception error) {
            Log.w(TAG, "writeStateFile", error);
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        if (!recordingActive && !guidanceActive) return;
        PendingIntent pending = PendingIntent.getService(getApplicationContext(), 101,
            new Intent(getApplicationContext(), RecordingService.class),
            PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager manager = (AlarmManager) getSystemService(ALARM_SERVICE);
        if (manager != null) manager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + 1_000, pending);
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacks(guidanceTicker);
        if (providersReceiver != null) {
            try { unregisterReceiver(providersReceiver); } catch (Exception ignored) {}
            providersReceiver = null;
        }
        if (locationUpdatesStarted && fusedClient != null && locationCallback != null) {
            fusedClient.removeLocationUpdates(locationCallback);
        }
        flushPointBuffer();
        releaseWakeLock();
        if (explicitShutdown) {
            writeStateFile(false);
            trackingPrefs().edit().clear().apply();
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.cancel(NOTIFICATION_ID);
                manager.cancel(ALERT_NOTIFICATION_ID);
            }
        }
        if (dbExecutor != null) dbExecutor.shutdown();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
