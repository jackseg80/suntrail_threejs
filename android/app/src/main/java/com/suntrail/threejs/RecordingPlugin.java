package com.suntrail.threejs;

import android.Manifest;
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
 * RecordingPlugin — Plugin Capacitor pour contrôler le Foreground Service (v5.25.0)
 *
 * Architecture Single Source of Truth (v5.25.0):
 * - Lit les points GPS depuis Room SQLite (plus de fichier JSON)
 * - RecordingService.insert() → RecordingPlugin.onNewPoints() callback
 * - Le JS poll/getRecordedPoints() retourne les points de la base Room
 *
 * Exposé côté JavaScript via :
 *   import { registerPlugin } from '@capacitor/core';
 *   const Recording = registerPlugin('Recording');
 *   await Recording.startForeground({ interval: 3000, minDisplacement: 0.5, highAccuracy: true });
 *   await Recording.stopForeground();
 *   const { points } = await Recording.getRecordedPoints();
 *   await Recording.clearRecordedPoints();
 *   await Recording.requestBatteryOptimizationExemption();
 */
@CapacitorPlugin(name = "Recording")
public class RecordingPlugin extends Plugin implements RecordingService.RecordingCallback {

    private AppDatabase    mDatabase;
    private GPSPointDao    mDao;
    private ExecutorService mDbExecutor;
    private String          mCurrentCourseId; // Course ID actif (mis à jour via onNewPoints)

    // ═══════════════════════════════════════════════════════════════════════════
    // Lifecycle
    // ═══════════════════════════════════════════════════════════════════════════

    @Override
    public void load() {
        super.load();
        mDatabase = AppDatabase.getInstance(getContext());
        mDao = mDatabase.gpsPointDao();
        mDbExecutor = Executors.newSingleThreadExecutor();

        // S'enregistrer comme callback auprès du RecordingService
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

    // ═══════════════════════════════════════════════════════════════════════════
    // RecordingCallback — appelé par RecordingService quand nouveaux points
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Called by RecordingService when new points are inserted in SQLite.
     * Can notify the JS side if needed (via sendEvent).
     */
    @Override
    public void onNewPoints(String courseId, int pointCount) {
        // Stocker le courseId courant
        mCurrentCourseId = courseId;
        
        // Envoyer un événement au JS via notifyListeners()
        // Le JS peut écouter via Recording.addListener('onNewPoints', ...)
        JSObject eventData = new JSObject();
        eventData.put("courseId", courseId);
        eventData.put("pointCount", pointCount);
        notifyListeners("onNewPoints", eventData);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Plugin Methods
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Démarre une course d'enregistrement GPS (v5.25.0).
     * Démarre le service, génère un courseId et retourne immédiatement.
     * Le courseId est aussi envoyé via l'événement onNewPoints.
     */
    @PluginMethod
    public void startCourse(PluginCall call) {
        // Récupérer l'originTile si fourni
        JSObject originTileObj = call.getObject("originTile");
        if (originTileObj != null) {
            // Stocker dans SharedPreferences pour que RecordingService puisse y accéder
            getContext().getSharedPreferences("RecordingPrefs", Context.MODE_PRIVATE)
                .edit()
                .putInt("originTileX", originTileObj.getInt("x"))
                .putInt("originTileY", originTileObj.getInt("y"))
                .putInt("originTileZ", originTileObj.getInt("z"))
                .apply();
        }
        
        // Démarrer le service
        startServiceInternal(call);
        
        // Le courseId sera envoyé via onNewPoints callback
        // On retourne immédiatement, le JS recevra le vrai courseId via l'événement
        JSObject result = new JSObject();
        result.put("courseId", mCurrentCourseId != null ? mCurrentCourseId : "");
        result.put("started", true);
        call.resolve(result);
    }

    /**
     * Démarre le Foreground Service d'enregistrement avec config GPS.
     * Affiche la notification persistante et démarre le GPS natif.
     */
    @PluginMethod
    public void startForeground(PluginCall call) {
        startServiceInternal(call);
        call.resolve();
    }
    
    private void startServiceInternal(PluginCall call) {
        // Android 13+ (API 33) : POST_NOTIFICATIONS est une permission runtime.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    getActivity(),
                    new String[]{ Manifest.permission.POST_NOTIFICATIONS },
                    0
                );
            }
        }

        Intent serviceIntent = new Intent(getContext(), RecordingService.class);

        long   interval        = call.getLong("interval", 3000L);
        float  minDisplacement = call.getFloat("minDisplacement", 0.5f);
        boolean highAccuracy   = call.getBoolean("highAccuracy", true);

        serviceIntent.putExtra("interval",        interval);
        serviceIntent.putExtra("minDisplacement", minDisplacement);
        serviceIntent.putExtra("highAccuracy",    highAccuracy);

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

    /**
     * Arrête le Foreground Service et retire la notification.
     */
    @PluginMethod
    public void stopForeground(PluginCall call) {
        stopServiceInternal();
        call.resolve();
    }
    
    /**
     * Arrête la course d'enregistrement GPS (v5.25.0).
     * Alias de stopForeground pour compatibilité avec l'API nativeGPSService.
     */
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

    /**
     * Retourne true si le Foreground Service d'enregistrement tourne encore.
     */
    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", RecordingService.isRunning());
        call.resolve(result);
    }

    /**
     * Retourne les points GPS enregistrés depuis Room SQLite.
     * Format : { points: [{ lat, lon, alt, timestamp, accuracy }, ...], courseId: "..." }
     *
     * Si courseId est fourni, ne retourne que les points de cette session.
     * Sinon, utilise la session courante (mCurrentCourseId).
     */
    @PluginMethod
    public void getRecordedPoints(PluginCall call) {
        String courseId = call.getString("courseId", mCurrentCourseId);

        if (courseId == null || courseId.isEmpty()) {
            // Pas de course en cours, retourner vide
            JSObject result = new JSObject();
            result.put("points", new JSArray());
            result.put("courseId", "");
            result.put("count", 0);
            call.resolve(result);
            return;
        }

        // Query Room en arrière-plan (Room interdit MainThread)
        mDbExecutor.execute(() -> {
            try {
                List<GPSPoint> points = mDao.getPointsForCourse(courseId);

                JSArray jsArr = new JSArray();
                for (GPSPoint pt : points) {
                    JSObject jsPoint = new JSObject();
                    jsPoint.put("lat",       pt.lat);
                    jsPoint.put("lon",       pt.lon);
                    jsPoint.put("alt",       pt.alt);
                    jsPoint.put("timestamp", pt.timestamp);
                    jsPoint.put("accuracy",  pt.accuracy);
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

    /**
     * Retourne le nombre de points pour une course donnée.
     */
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

    /**
     * Efface les points d'une course depuis Room (appelé après merge réussi côté JS).
     */
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

    /**
     * Demande à Android d'exempter l'app des optimisations batterie (Doze mode).
     */
    @PluginMethod
    public void requestBatteryOptimizationExemption(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
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

    /**
     * Retourne le courseId courant du RecordingService.
     */
    @PluginMethod
    public void getCurrentCourseId(PluginCall call) {
        JSObject result = new JSObject();
        result.put("courseId", mCurrentCourseId != null ? mCurrentCourseId : "");
        call.resolve(result);
    }
}