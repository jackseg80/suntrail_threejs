package com.suntrail.threejs;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.suntrail.threejs.data.ActiveGuidanceRoute;
import com.suntrail.threejs.data.AppDatabase;
import com.suntrail.threejs.data.GPSPoint;
import com.suntrail.threejs.data.GPSPointDao;
import com.suntrail.threejs.data.GuidanceDao;
import com.suntrail.threejs.data.GuidanceSession;
import com.suntrail.threejs.guidance.GuidanceRouteCodec;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Bridge Capacitor unique du processus de terrain.
 *
 * Les anciennes API REC restent recording-only. Les API Guidance ajoutent une copie native
 * validée de la PreparedRoute dans Room avant de démarrer le même service :tracking.
 */
@CapacitorPlugin(name = "Recording")
public class RecordingPlugin extends Plugin {
    private static final String TAG = "RecordingPlugin";

    private AppDatabase database;
    private GPSPointDao pointDao;
    private GuidanceDao guidanceDao;
    private ExecutorService dbExecutor;
    private String currentCourseId;
    private BroadcastReceiver receiver;

    @Override
    public void load() {
        super.load();
        database = AppDatabase.getInstance(getContext());
        pointDao = database.gpsPointDao();
        guidanceDao = database.guidanceDao();
        dbExecutor = Executors.newSingleThreadExecutor();
        registerBroadcastReceiver();
        JSONObject state = readStateFile();
        if (state != null && state.optBoolean("isRunning", false)) {
            String courseId = state.optString("courseId", "");
            if (!courseId.isEmpty()) currentCourseId = courseId;
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (receiver != null) {
            try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
            receiver = null;
        }
        if (dbExecutor != null) dbExecutor.shutdown();
    }

    private void registerBroadcastReceiver() {
        receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (RecordingService.ACTION_POINTS_UPDATED.equals(action)) {
                    String courseId = intent.getStringExtra("courseId");
                    if (courseId != null && !courseId.isEmpty()) currentCourseId = courseId;
                    JSObject data = new JSObject();
                    data.put("courseId", courseId);
                    data.put("pointCount", intent.getIntExtra("pointCount", 0));
                    notifyListeners("onNewPoints", data);
                } else if (RecordingService.ACTION_LOCATION_UPDATED.equals(action)) {
                    JSObject data = new JSObject();
                    data.put("lat", intent.getDoubleExtra("lat", 0));
                    data.put("lon", intent.getDoubleExtra("lon", 0));
                    data.put("alt", intent.getDoubleExtra("alt", 0));
                    data.put("accuracy", intent.getFloatExtra("accuracy", -1));
                    data.put("timestamp", intent.getLongExtra("timestamp", 0));
                    notifyListeners("onLocationUpdate", data);
                } else if (RecordingService.ACTION_GUIDANCE_SNAPSHOT.equals(action)) {
                    try {
                        JSObject data = new JSObject();
                        data.put("snapshot", new JSONObject(intent.getStringExtra("snapshot")));
                        data.put("events", new JSONArray(intent.getStringExtra("events")));
                        data.put("acceptedPosition", intent.getBooleanExtra("acceptedPosition", false));
                        putNullable(data, "issue", intent.getStringExtra("issue"));
                        notifyListeners("onGuidanceSnapshot", data);
                    } catch (Exception error) {
                        Log.w(TAG, "Invalid guidance broadcast", error);
                    }
                } else if (RecordingService.ACTION_SESSION_CHANGED.equals(action)) {
                    JSObject data = new JSObject();
                    data.put("mode", intent.getStringExtra("mode"));
                    data.put("recording", intent.getBooleanExtra("recording", false));
                    data.put("guidance", intent.getBooleanExtra("guidance", false));
                    putNullable(data, "issue", intent.getStringExtra("issue"));
                    notifyListeners("onSessionChanged", data);
                } else if (RecordingService.ACTION_SERVICE_STOPPED.equals(action)) {
                    notifyListeners("onServiceStopped", new JSObject());
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(RecordingService.ACTION_POINTS_UPDATED);
        filter.addAction(RecordingService.ACTION_LOCATION_UPDATED);
        filter.addAction(RecordingService.ACTION_GUIDANCE_SNAPSHOT);
        filter.addAction(RecordingService.ACTION_SESSION_CHANGED);
        filter.addAction(RecordingService.ACTION_SERVICE_STOPPED);
        ContextCompat.registerReceiver(getContext(), receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    // ---- API REC historique, désormais strictement recording-only -----------------

    @PluginMethod
    public void startCourse(PluginCall call) {
        JSObject originTile = call.getObject("originTile");
        if (originTile != null) {
            try {
                getContext().getSharedPreferences("RecordingPrefs", Context.MODE_PRIVATE).edit()
                    .putInt("originTileX", originTile.getInt("x"))
                    .putInt("originTileY", originTile.getInt("y"))
                    .putInt("originTileZ", originTile.getInt("z")).apply();
            } catch (Exception error) { Log.w(TAG, "Invalid originTile", error); }
        }
        startRecording(call, true);
        JSObject result = new JSObject();
        result.put("courseId", currentCourseId == null ? "" : currentCourseId);
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod public void startForeground(PluginCall call) { startRecording(call, false); call.resolve(); }
    @PluginMethod public void stopForeground(PluginCall call) { sendServiceAction(RecordingService.ACTION_STOP_RECORDING); call.resolve(); }
    @PluginMethod public void stopCourse(PluginCall call) {
        // The WebView owns naming and saving after this explicit stop. Keep
        // notification STOP separate so only it can be recovered later.
        sendServiceAction(RecordingService.ACTION_STOP_COURSE);
        currentCourseId = null;
        call.resolve();
    }

    /**
     * Publie un GPX dans Téléchargements via MediaStore. Android 10+ autorise
     * cette écriture sans permission de stockage étendue et le fichier reste
     * immédiatement visible au sélecteur système utilisé par l'import.
     */
    @PluginMethod
    public void saveTextToDownloads(PluginCall call) {
        String filename = call.getString("filename", "").trim();
        String content = call.getString("content", "");
        if (filename.isEmpty() || filename.contains("/") || filename.contains("\\")) {
            call.reject("A plain export filename is required");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Public Downloads export requires Android 10 or newer");
            return;
        }

        dbExecutor.execute(() -> {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "application/gpx+xml");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                call.reject("Unable to create GPX in Downloads");
                return;
            }

            try (OutputStream stream = resolver.openOutputStream(uri, "w")) {
                if (stream == null) throw new IllegalStateException("Unable to open GPX output");
                stream.write(content.getBytes(StandardCharsets.UTF_8));
                stream.flush();
                ContentValues completed = new ContentValues();
                completed.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(uri, completed, null, null);
                JSObject result = new JSObject();
                result.put("filename", filename);
                result.put("uri", uri.toString());
                call.resolve(result);
            } catch (Exception error) {
                resolver.delete(uri, null, null);
                call.reject("Unable to write GPX in Downloads", error);
            }
        });
    }

    private void startRecording(PluginCall call, boolean newCourse) {
        requestNotificationPermissionIfNeeded();
        Intent intent = serviceIntent(RecordingService.ACTION_START_RECORDING);
        intent.putExtra("isNewCourse", newCourse);
        intent.putExtra("interval", call.getLong("interval", 3_000L));
        intent.putExtra("minDisplacement", call.getFloat("minDisplacement", 0.5f));
        intent.putExtra("highAccuracy", call.getBoolean("highAccuracy", true));
        startService(intent);
    }

    // ---- API Guidance native -------------------------------------------------------

    @PluginMethod
    public void startGuidance(PluginCall call) {
        String routeId = call.getString("routeId", "").trim();
        JSArray geometry = call.getArray("geometry");
        JSArray cues = call.getArray("cues", new JSArray());
        double pace = call.getDouble("plannedPaceKmh", 4.0);
        if (routeId.isEmpty() || geometry == null || !Double.isFinite(pace) || pace <= 0) {
            call.reject("routeId, geometry and a positive plannedPaceKmh are required");
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("Fine location permission is required before native guidance starts");
            return;
        }
        requestNotificationPermissionIfNeeded();
        dbExecutor.execute(() -> {
            try {
                long now = System.currentTimeMillis();
                ActiveGuidanceRoute route = new ActiveGuidanceRoute();
                route.routeId = routeId;
                route.geometryJson = GuidanceRouteCodec.copyGeometryJson(geometry.toString());
                route.cuesJson = GuidanceRouteCodec.copyCuesJson(cues.toString());
                route.geometryFingerprint = call.getString("geometryFingerprint", null);
                route.plannedPaceKmh = pace;
                route.createdAt = now;
                route.updatedAt = now;

                GuidanceSession previous = guidanceDao.getActiveSession();
                GuidanceSession session = new GuidanceSession();
                boolean recording = isRecordingFromState() || (previous != null &&
                    ("recording".equals(previous.mode) || "both".equals(previous.mode)));
                session.mode = recording ? "both" : "guidance";
                session.routeId = routeId;
                session.status = "acquiring";
                session.recordingCourseId = recording && previous != null
                    ? previous.recordingCourseId : currentCourseId;
                session.updatedAt = now;
                guidanceDao.replaceGuidance(route, session);
                sendServiceAction(RecordingService.ACTION_START_GUIDANCE);
                JSObject result = new JSObject();
                result.put("started", true);
                result.put("routeId", routeId);
                result.put("geometryPointCount", new JSONArray(route.geometryJson).length());
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Native guidance route rejected: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod public void stopGuidance(PluginCall call) { sendServiceAction(RecordingService.ACTION_STOP_GUIDANCE); call.resolve(); }
    @PluginMethod public void pauseGuidance(PluginCall call) { sendServiceAction(RecordingService.ACTION_PAUSE_GUIDANCE); call.resolve(); }
    @PluginMethod public void resumeGuidance(PluginCall call) { sendServiceAction(RecordingService.ACTION_RESUME_GUIDANCE); call.resolve(); }
    @PluginMethod public void stopAll(PluginCall call) { sendServiceAction(RecordingService.ACTION_STOP_ALL); currentCourseId = null; call.resolve(); }

    @PluginMethod
    public void getActiveSession(PluginCall call) {
        dbExecutor.execute(() -> {
            try { call.resolve(sessionResult(guidanceDao.getActiveSession())); }
            catch (Exception error) { call.reject("Unable to read active native session", error); }
        });
    }

    @PluginMethod
    public void getGuidanceSnapshot(PluginCall call) {
        dbExecutor.execute(() -> {
            try {
                GuidanceSession session = guidanceDao.getActiveSession();
                JSObject result = new JSObject();
                result.put("snapshot", session == null || session.routeId == null
                    ? JSONObject.NULL : snapshotFromSession(session));
                call.resolve(result);
            } catch (Exception error) { call.reject("Unable to read guidance snapshot", error); }
        });
    }

    // ---- État, notification et Room REC -------------------------------------------

    @PluginMethod
    public void updateNotificationStats(PluginCall call) {
        Intent intent = serviceIntent(RecordingService.ACTION_UPDATE_STATS);
        intent.putExtra("distance", call.getDouble("distance", 0.0));
        intent.putExtra("elevation", call.getDouble("elevation", 0.0));
        intent.putExtra("elevationMinus", call.getDouble("elevationMinus", 0.0));
        try { getContext().startService(intent); } catch (Exception error) { Log.w(TAG, "stats update failed", error); }
        call.resolve();
    }

    @PluginMethod public void isRunning(PluginCall call) {
        JSObject result = new JSObject(); result.put("running", isRecordingFromState()); call.resolve(result);
    }
    @PluginMethod public void getCurrentCourseId(PluginCall call) {
        JSObject result = new JSObject(); result.put("courseId", currentCourseId == null ? "" : currentCourseId); call.resolve(result);
    }
    @PluginMethod public void getCurrentCourse(PluginCall call) {
        JSONObject state = readStateFile();
        boolean running = state != null && state.optBoolean("isRunning", false);
        String courseId = state == null ? "" : state.optString("courseId", "");
        if (running && !courseId.isEmpty()) currentCourseId = courseId;
        JSObject result = new JSObject();
        result.put("courseId", courseId);
        result.put("isRunning", running);
        android.content.SharedPreferences prefs = getContext().getSharedPreferences("RecordingPrefs", Context.MODE_PRIVATE);
        if (prefs.contains("originTileX")) {
            JSObject tile = new JSObject();
            tile.put("x", prefs.getInt("originTileX", 0)); tile.put("y", prefs.getInt("originTileY", 0)); tile.put("z", prefs.getInt("originTileZ", 0));
            result.put("originTile", tile);
        }
        call.resolve(result);
    }
    @PluginMethod public void getPendingStoppedCourse(PluginCall call) {
        android.content.SharedPreferences prefs = getContext().getSharedPreferences("RecordingPrefs", Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        result.put("courseId", prefs.getString("pendingStoppedCourseId", ""));
        result.put("startTime", prefs.getLong("pendingStoppedStartTime", 0L));
        call.resolve(result);
    }
    @PluginMethod public void acknowledgePendingStoppedCourse(PluginCall call) {
        getContext().getSharedPreferences("RecordingPrefs", Context.MODE_PRIVATE).edit()
            .remove("pendingStoppedCourseId")
            .remove("pendingStoppedStartTime")
            .apply();
        call.resolve();
    }

    @SuppressLint("BatteryLife")
    @PluginMethod public void requestBatteryOptimizationExemption(PluginCall call) {
        JSObject result = new JSObject();
        PowerManager manager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (manager == null) { result.put("granted", false); call.resolve(result); return; }
        String packageName = getContext().getPackageName();
        if (manager.isIgnoringBatteryOptimizations(packageName)) { result.put("granted", true); call.resolve(result); return; }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent); result.put("granted", true);
        } catch (Exception error) { Log.w(TAG, "battery exemption failed", error); result.put("granted", false); }
        call.resolve(result);
    }

    @PluginMethod public void getRecordedPoints(PluginCall call) {
        String courseId = call.getString("courseId", currentCourseId);
        if (courseId == null || courseId.isEmpty()) { JSObject r = new JSObject(); r.put("points", new JSArray()); r.put("courseId", ""); r.put("count", 0); call.resolve(r); return; }
        dbExecutor.execute(() -> resolvePoints(call, courseId, 0, true));
    }
    @PluginMethod public void getPoints(PluginCall call) {
        String courseId = call.getString("courseId", currentCourseId); long since = call.getLong("since", 0L);
        if (courseId == null || courseId.isEmpty()) { JSObject r = new JSObject(); r.put("points", new JSArray()); call.resolve(r); return; }
        dbExecutor.execute(() -> resolvePoints(call, courseId, since, false));
    }
    private void resolvePoints(PluginCall call, String courseId, long since, boolean meta) {
        try {
            List<GPSPoint> points = since > 0 ? pointDao.getPointsSince(courseId, since) : pointDao.getPointsForCourse(courseId);
            JSArray values = new JSArray();
            for (GPSPoint point : points) { JSObject value = new JSObject(); value.put("lat", point.lat); value.put("lon", point.lon); value.put("alt", point.alt); value.put("timestamp", point.timestamp); value.put("accuracy", point.accuracy); values.put(value); }
            JSObject result = new JSObject(); result.put("points", values);
            if (meta) { result.put("courseId", courseId); result.put("count", points.size()); }
            call.resolve(result);
        } catch (Exception error) { JSObject result = new JSObject(); result.put("points", new JSArray()); result.put("error", error.getMessage()); call.resolve(result); }
    }
    @PluginMethod public void getPointCount(PluginCall call) {
        String courseId = call.getString("courseId", currentCourseId);
        if (courseId == null || courseId.isEmpty()) { JSObject r = new JSObject(); r.put("count", 0); call.resolve(r); return; }
        dbExecutor.execute(() -> { try { JSObject r = new JSObject(); r.put("count", pointDao.getPointCount(courseId)); call.resolve(r); } catch (Exception error) { JSObject r = new JSObject(); r.put("count", 0); call.resolve(r); } });
    }
    @PluginMethod public void clearRecordedPoints(PluginCall call) {
        String courseId = call.getString("courseId", currentCourseId);
        if (courseId == null || courseId.isEmpty()) { call.resolve(); return; }
        dbExecutor.execute(() -> { try { pointDao.deleteCourse(courseId); call.resolve(); } catch (Exception error) { call.reject("Failed to clear points", error); } });
    }

    private JSObject sessionResult(GuidanceSession session) throws Exception {
        JSObject result = new JSObject();
        if (session == null) {
            result.put("active", false); result.put("mode", "none"); result.put("recording", false); result.put("guidance", false); result.put("snapshot", JSONObject.NULL); return result;
        }
        boolean recording = "recording".equals(session.mode) || "both".equals(session.mode);
        boolean guidance = "guidance".equals(session.mode) || "both".equals(session.mode);
        result.put("active", recording || guidance); result.put("mode", session.mode); result.put("recording", recording); result.put("guidance", guidance);
        putNullable(result, "routeId", session.routeId); putNullable(result, "courseId", session.recordingCourseId); putNullable(result, "issue", session.issue);
        result.put("snapshot", guidance && session.routeId != null ? snapshotFromSession(session) : JSONObject.NULL);
        return result;
    }

    private JSONObject snapshotFromSession(GuidanceSession session) throws Exception {
        JSONObject value = new JSONObject();
        value.put("routeId", session.routeId); value.put("status", session.status); value.put("progressMeters", session.progressMeters); value.put("remainingMeters", session.remainingMeters); value.put("crossTrackMeters", session.crossTrackMeters);
        value.put("eta", session.etaEpochMs == null ? JSONObject.NULL : iso(session.etaEpochMs));
        value.put("bearing", session.bearing == null ? JSONObject.NULL : session.bearing);
        value.put("nextCue", session.nextCueJson == null ? JSONObject.NULL : new JSONObject(session.nextCueJson));
        value.put("distanceToNextCueMeters", session.distanceToNextCueMeters == null ? JSONObject.NULL : session.distanceToNextCueMeters);
        value.put("accuracyMeters", session.accuracyMeters == null ? JSONObject.NULL : session.accuracyMeters);
        value.put("positionAgeMs", session.positionAgeMs == null ? JSONObject.NULL : session.positionAgeMs);
        value.put("updatedAt", iso(session.updatedAt));
        return value;
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 0);
        }
    }
    private void sendServiceAction(String action) {
        Intent intent = serviceIntent(action);
        if (RecordingService.ACTION_START_GUIDANCE.equals(action) ||
            RecordingService.ACTION_START_RECORDING.equals(action)) {
            startService(intent);
        } else {
            getContext().startService(intent);
        }
    }
    private Intent serviceIntent(String action) { return new Intent(getContext(), RecordingService.class).setAction(action); }
    private void startService(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent); else getContext().startService(intent);
    }
    private boolean isRecordingFromState() { JSONObject value = readStateFile(); return value != null && value.optBoolean("isRunning", false); }
    private JSONObject readStateFile() {
        try {
            File file = new File(getContext().getFilesDir(), "rec_state.json"); if (!file.exists()) return null;
            StringBuilder content = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new FileReader(file))) { String line; while ((line = reader.readLine()) != null) content.append(line); }
            return new JSONObject(content.toString());
        } catch (Exception error) { Log.w(TAG, "readStateFile failed", error); return null; }
    }
    private static void putNullable(JSObject object, String key, String value) { object.put(key, value == null ? JSONObject.NULL : value); }
    private static String iso(long epochMs) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US); format.setTimeZone(TimeZone.getTimeZone("UTC")); return format.format(new Date(epochMs));
    }
}
