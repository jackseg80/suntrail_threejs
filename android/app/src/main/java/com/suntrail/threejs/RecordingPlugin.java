package com.suntrail.threejs;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;

import androidx.annotation.NonNull;
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

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * RecordingPlugin — Plugin Capacitor pour contrôler le Foreground Service (v5.28.1)
 */
@CapacitorPlugin(name = "Recording")
public class RecordingPlugin extends Plugin implements RecordingService.RecordingCallback {

    private AppDatabase    mDatabase;
    private GPSPointDao    mDao;
    private ExecutorService mDbExecutor;
    private String          mCurrentCourseId;

    @Override
    public void load() {
        super.load();
        mDatabase = AppDatabase.getInstance(getContext());
        mDao = mDatabase.gpsPointDao();
        mDbExecutor = Executors.newSingleThreadExecutor();
        RecordingService.setCallback(this);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        RecordingService.setCallback(null);
        if (mDbExecutor != null) {
            mDbExecutor.shutdown();
        }
    }

    @Override
    public void onNewPoints(String courseId, int pointCount, boolean isAutoPaused) {
        mCurrentCourseId = courseId;
        JSObject eventData = new JSObject();
        eventData.put("courseId", courseId);
        eventData.put("pointCount", pointCount);
        eventData.put("isAutoPaused", isAutoPaused);
        notifyListeners("onNewPoints", eventData);
    }

    @PluginMethod
    public void startCourse(PluginCall call) {
        RecordingService.setCallback(this);
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
                android.util.Log.w("RecordingPlugin", "Failed to parse originTile", e);
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
                ActivityCompat.requestPermissions(getActivity(), new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 0);
            }
        }

        Intent serviceIntent = new Intent(getContext(), RecordingService.class);
        serviceIntent.putExtra("isNewCourse", isNewCourse);
        serviceIntent.putExtra("interval", call.getLong("interval", 3000L));
        serviceIntent.putExtra("minDisplacement", call.getFloat("minDisplacement", 0.5f));
        serviceIntent.putExtra("highAccuracy", call.getBoolean("highAccuracy", true));

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
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
        Intent serviceIntent = new Intent(getContext(), RecordingService.class);
        getContext().stopService(serviceIntent);
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", RecordingService.isRunning());
        call.resolve(result);
    }

    @PluginMethod
    public void getRecordedPoints(PluginCall call) {
        String courseId = call.getString("courseId", mCurrentCourseId);
        if (courseId == null || courseId.isEmpty()) {
            JSObject result = new JSObject();
            result.put("points", new JSArray());
            result.put("courseId", "");
            result.put("count", 0);
            call.resolve(result);
            return;
        }

        mDbExecutor.execute(() -> {
            try {
                List<GPSPoint> points = mDao.getPointsForCourse(courseId);
                JSArray jsArr = new JSArray();
                for (GPSPoint pt : points) {
                    JSObject jsPoint = new JSObject();
                    jsPoint.put("lat", pt.lat);
                    jsPoint.put("lon", pt.lon);
                    jsPoint.put("alt", pt.alt);
                    jsPoint.put("timestamp", pt.timestamp);
                    jsPoint.put("accuracy", pt.accuracy);
                    jsArr.put(jsPoint);
                }
                JSObject result = new JSObject();
                result.put("points", jsArr);
                result.put("courseId", courseId);
                result.put("count", points.size());
                call.resolve(result);
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("points", new JSArray());
                result.put("courseId", courseId);
                result.put("count", 0);
                result.put("error", e.getMessage());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void getPoints(PluginCall call) {
        String courseId = call.getString("courseId", mCurrentCourseId);
        long since = call.getLong("since", 0L);
        if (courseId == null || courseId.isEmpty()) {
            JSObject result = new JSObject();
            result.put("points", new JSArray());
            call.resolve(result);
            return;
        }

        mDbExecutor.execute(() -> {
            try {
                List<GPSPoint> points = (since > 0) ? mDao.getPointsSince(courseId, since) : mDao.getPointsForCourse(courseId);
                JSArray jsArr = new JSArray();
                for (GPSPoint pt : points) {
                    JSObject jsPoint = new JSObject();
                    jsPoint.put("lat", pt.lat);
                    jsPoint.put("lon", pt.lon);
                    jsPoint.put("alt", pt.alt);
                    jsPoint.put("timestamp", pt.timestamp);
                    jsPoint.put("accuracy", pt.accuracy);
                    jsArr.put(jsPoint);
                }
                JSObject result = new JSObject();
                result.put("points", jsArr);
                call.resolve(result);
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("points", new JSArray());
                result.put("error", e.getMessage());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void getPointCount(PluginCall call) {
        String courseId = call.getString("courseId", mCurrentCourseId);
        if (courseId == null || courseId.isEmpty()) {
            JSObject result = new JSObject();
            result.put("count", 0);
            call.resolve(result);
            return;
        }
        mDbExecutor.execute(() -> {
            try {
                int count = mDao.getPointCount(courseId);
                JSObject result = new JSObject();
                result.put("count", count);
                call.resolve(result);
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("count", 0);
                result.put("error", e.getMessage());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void clearRecordedPoints(PluginCall call) {
        String courseId = call.getString("courseId", mCurrentCourseId);
        if (courseId == null || courseId.isEmpty()) {
            call.resolve();
            return;
        }
        mDbExecutor.execute(() -> {
            try {
                mDao.deleteCourse(courseId);
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to clear points: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void requestBatteryOptimizationExemption(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject result = new JSObject();
        if (pm == null) {
            result.put("granted", false);
            call.resolve(result);
            return;
        }
        String packageName = getContext().getPackageName();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (pm.isIgnoringBatteryOptimizations(packageName)) {
                result.put("granted", true);
                call.resolve(result);
            } else {
                try {
                    Intent intent = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(android.net.Uri.parse("package:" + packageName));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                    result.put("granted", true);
                } catch (Exception e) {
                    result.put("granted", false);
                }
                call.resolve(result);
            }
        } else {
            result.put("granted", true);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void getCurrentCourseId(PluginCall call) {
        JSObject result = new JSObject();
        result.put("courseId", mCurrentCourseId != null ? mCurrentCourseId : "");
        call.resolve(result);
    }

    @PluginMethod
    public void getCurrentCourse(PluginCall call) {
        boolean isRunning = RecordingService.isRunning();
        String courseId = mCurrentCourseId;
        if (courseId == null && isRunning) {
            courseId = getContext().getSharedPreferences("RecordingPrefs", Context.MODE_PRIVATE).getString("currentCourseId", null);
        }
        if (courseId == null || !isRunning) {
            JSObject result = new JSObject();
            result.put("courseId", courseId != null ? courseId : "");
            result.put("isRunning", false);
            call.resolve(result);
            return;
        }
        JSObject result = new JSObject();
        result.put("courseId", courseId);
        result.put("isRunning", true);
        android.content.SharedPreferences prefs = getContext().getSharedPreferences("RecordingPrefs", Context.MODE_PRIVATE);
        if (prefs.contains("originTileX")) {
            JSObject originTile = new JSObject();
            originTile.put("x", prefs.getInt("originTileX", 0));
            originTile.put("y", prefs.getInt("originTileY", 0));
            originTile.put("z", prefs.getInt("originTileZ", 0));
            result.put("originTile", originTile);
        }
        mCurrentCourseId = courseId;
        call.resolve(result);
    }
}
