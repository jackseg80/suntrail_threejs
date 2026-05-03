package com.suntrail.threejs;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.suntrail.threejs.data.AppDatabase;
import com.suntrail.threejs.data.GPSPoint;
import com.suntrail.threejs.data.GPSPointDao;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * RecordingPlugin — Plugin Capacitor pour contrôler RecordingService (v5.53.0)
 *
 * RecordingService tourne dans le processus :tracking (séparé).
 * La communication se fait via :
 *   - Plugin → Service : startForegroundService(Intent) avec action nommée
 *   - Service → Plugin : BroadcastReceiver (ACTION_POINTS_UPDATED, ACTION_SERVICE_STOPPED)
 *   - État partagé     : fichier rec_state.json dans filesDir (même pour les deux processus)
 */
@CapacitorPlugin(name = "Recording")
public class RecordingPlugin extends Plugin {

    private static final String TAG = "RecordingPlugin";

    private AppDatabase     mDatabase;
    private GPSPointDao     mDao;
    private ExecutorService mDbExecutor;
    private String          mCurrentCourseId;

    private BroadcastReceiver mReceiver;

    // ── Lifecycle ──────────────────────────────────────────────────────────────────

    @Override
    public void load() {
        super.load();
        mDatabase   = AppDatabase.getInstance(getContext());
        mDao        = mDatabase.gpsPointDao();
        mDbExecutor = Executors.newSingleThreadExecutor();

        registerBroadcastReceiver();

        // Récupérer le courseId courant depuis le fichier d'état (recovery au démarrage)
        JSONObject state = readStateFile();
        if (state != null) {
            try {
                boolean running = state.optBoolean("isRunning", false);
                String courseId = state.optString("courseId", "");
                if (running && !courseId.isEmpty()) {
                    mCurrentCourseId = courseId;
                    Log.i(TAG, "Recovery courseId depuis rec_state.json: " + courseId);
                }
            } catch (Exception e) {
                Log.w(TAG, "load recovery: " + e.getMessage());
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        unregisterBroadcastReceiver();
        if (mDbExecutor != null) mDbExecutor.shutdown();
    }

    // ── BroadcastReceiver (Service → Plugin) ───────────────────────────────────────

    private void registerBroadcastReceiver() {
        mReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (RecordingService.ACTION_POINTS_UPDATED.equals(action)) {
                    String courseId = intent.getStringExtra("courseId");
                    int    count    = intent.getIntExtra("pointCount", 0);
                    if (courseId != null && !courseId.isEmpty()) mCurrentCourseId = courseId;
                    JSObject data = new JSObject();
                    data.put("courseId", courseId);
                    data.put("pointCount", count);
                    notifyListeners("onNewPoints", data);

                } else if (RecordingService.ACTION_SERVICE_STOPPED.equals(action)) {
                    notifyListeners("onServiceStopped", new JSObject());
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(RecordingService.ACTION_POINTS_UPDATED);
        filter.addAction(RecordingService.ACTION_SERVICE_STOPPED);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(mReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(mReceiver, filter);
        }
    }

    private void unregisterBroadcastReceiver() {
        if (mReceiver != null) {
            try { getContext().unregisterReceiver(mReceiver); } catch (Exception ignored) {}
            mReceiver = null;
        }
    }

    // ── Plugin Methods ─────────────────────────────────────────────────────────────

    @PluginMethod
    public void startCourse(PluginCall call) {
        JSObject originTileObj = call.getObject("originTile");
        if (originTileObj != null) {
            try {
                getContext().getSharedPreferences("RecordingPrefs", Context.MODE_PRIVATE)
                    .edit()
                    .putInt("originTileX", originTileObj.getInt("x"))
                    .putInt("originTileY", originTileObj.getInt("y"))
                    .putInt("originTileZ", originTileObj.getInt("z"))
                    .apply();
            } catch (Exception e) {
                Log.w(TAG, "Failed to parse originTile", e);
            }
        }

        startServiceInternal(call, true);

        JSObject result = new JSObject();
        result.put("courseId", mCurrentCourseId != null ? mCurrentCourseId : "");
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void startForeground(PluginCall call) {
        startServiceInternal(call, false);
        call.resolve();
    }

    private void startServiceInternal(PluginCall call, boolean isNewCourse) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(getActivity(),
                        new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 0);
            }
        }

        Intent intent = new Intent(getContext(), RecordingService.class);
        intent.putExtra("isNewCourse", isNewCourse);
        intent.putExtra("interval",        call.getLong("interval", 3000L));
        intent.putExtra("minDisplacement", call.getFloat("minDisplacement", 0.5f));
        intent.putExtra("highAccuracy",    call.getBoolean("highAccuracy", true));

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to start RecordingService: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopForeground(PluginCall call) {
        stopServiceInternal();
        call.resolve();
    }

    @PluginMethod
    public void stopCourse(PluginCall call) {
        stopServiceInternal();
        mCurrentCourseId = null;
        call.resolve();
    }

    private void stopServiceInternal() {
        // stopService() fonctionne cross-processus — Android arrête le service dans :tracking
        getContext().stopService(new Intent(getContext(), RecordingService.class));
    }

    @PluginMethod
    public void updateNotificationStats(PluginCall call) {
        Double distance      = call.getDouble("distance", 0.0);
        Double elevation     = call.getDouble("elevation", 0.0);
        Double elevationMinus = call.getDouble("elevationMinus", 0.0);

        Intent intent = new Intent(getContext(), RecordingService.class);
        intent.setAction(RecordingService.ACTION_UPDATE_STATS);
        intent.putExtra("distance",      distance);
        intent.putExtra("elevation",     elevation);
        intent.putExtra("elevationMinus", elevationMinus);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
        } catch (Exception e) {
            Log.w(TAG, "updateNotificationStats: " + e.getMessage());
        }
        call.resolve();
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSONObject state = readStateFile();
        boolean running = state != null && state.optBoolean("isRunning", false);
        JSObject result = new JSObject();
        result.put("running", running);
        call.resolve(result);
    }

    @PluginMethod
    public void getCurrentCourseId(PluginCall call) {
        JSObject result = new JSObject();
        result.put("courseId", mCurrentCourseId != null ? mCurrentCourseId : "");
        call.resolve(result);
    }

    @PluginMethod
    public void getCurrentCourse(PluginCall call) {
        JSONObject state = readStateFile();
        boolean running  = state != null && state.optBoolean("isRunning", false);
        String  courseId = state != null ? state.optString("courseId", "") : "";

        if (courseId.isEmpty() || !running) {
            JSObject result = new JSObject();
            result.put("courseId", courseId);
            result.put("isRunning", false);
            call.resolve(result);
            return;
        }

        mCurrentCourseId = courseId;

        JSObject result = new JSObject();
        result.put("courseId", courseId);
        result.put("isRunning", true);

        android.content.SharedPreferences prefs =
                getContext().getSharedPreferences("RecordingPrefs", Context.MODE_PRIVATE);
        if (prefs.contains("originTileX")) {
            JSObject originTile = new JSObject();
            originTile.put("x", prefs.getInt("originTileX", 0));
            originTile.put("y", prefs.getInt("originTileY", 0));
            originTile.put("z", prefs.getInt("originTileZ", 0));
            result.put("originTile", originTile);
        }
        call.resolve(result);
    }

    // ── Room Queries ───────────────────────────────────────────────────────────────

    @PluginMethod
    public void getRecordedPoints(PluginCall call) {
        String courseId = call.getString("courseId", mCurrentCourseId);
        if (courseId == null || courseId.isEmpty()) {
            JSObject r = new JSObject();
            r.put("points", new JSArray());
            r.put("courseId", "");
            r.put("count", 0);
            call.resolve(r);
            return;
        }
        mDbExecutor.execute(() -> resolvePoints(call, courseId, 0, true));
    }

    @PluginMethod
    public void getPoints(PluginCall call) {
        String courseId = call.getString("courseId", mCurrentCourseId);
        long   since    = call.getLong("since", 0L);
        if (courseId == null || courseId.isEmpty()) {
            JSObject r = new JSObject();
            r.put("points", new JSArray());
            call.resolve(r);
            return;
        }
        mDbExecutor.execute(() -> resolvePoints(call, courseId, since, false));
    }

    private void resolvePoints(PluginCall call, String courseId, long since, boolean withMeta) {
        try {
            List<GPSPoint> points = (since > 0)
                    ? mDao.getPointsSince(courseId, since)
                    : mDao.getPointsForCourse(courseId);

            JSArray jsArr = new JSArray();
            for (GPSPoint pt : points) {
                JSObject o = new JSObject();
                o.put("lat",       pt.lat);
                o.put("lon",       pt.lon);
                o.put("alt",       pt.alt);
                o.put("timestamp", pt.timestamp);
                o.put("accuracy",  pt.accuracy);
                jsArr.put(o);
            }
            JSObject result = new JSObject();
            result.put("points", jsArr);
            if (withMeta) {
                result.put("courseId", courseId);
                result.put("count", points.size());
            }
            call.resolve(result);
        } catch (Exception e) {
            JSObject result = new JSObject();
            result.put("points", new JSArray());
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void getPointCount(PluginCall call) {
        String courseId = call.getString("courseId", mCurrentCourseId);
        if (courseId == null || courseId.isEmpty()) {
            JSObject r = new JSObject(); r.put("count", 0); call.resolve(r); return;
        }
        mDbExecutor.execute(() -> {
            try {
                int count = mDao.getPointCount(courseId);
                JSObject r = new JSObject(); r.put("count", count); call.resolve(r);
            } catch (Exception e) {
                JSObject r = new JSObject(); r.put("count", 0); call.resolve(r);
            }
        });
    }

    @PluginMethod
    public void clearRecordedPoints(PluginCall call) {
        String courseId = call.getString("courseId", mCurrentCourseId);
        if (courseId == null || courseId.isEmpty()) { call.resolve(); return; }
        mDbExecutor.execute(() -> {
            try { mDao.deleteCourse(courseId); call.resolve(); }
            catch (Exception e) { call.reject("Failed to clear points: " + e.getMessage()); }
        });
    }

    // ── Fichier d'état cross-processus ─────────────────────────────────────────────

    private JSONObject readStateFile() {
        try {
            File f = new File(getContext().getFilesDir(), "rec_state.json");
            if (!f.exists()) return null;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new FileReader(f))) {
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
            }
            return new JSONObject(sb.toString());
        } catch (Exception e) {
            Log.w(TAG, "readStateFile: " + e.getMessage());
            return null;
        }
    }
}
