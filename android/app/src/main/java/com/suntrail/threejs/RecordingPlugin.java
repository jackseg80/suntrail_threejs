package com.suntrail.threejs;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * RecordingPlugin — Plugin Capacitor pour contrôler le Foreground Service (v5.23)
 *
 * Exposé côté JavaScript via :
 *   import { registerPlugin } from '@capacitor/core';
 *   const Recording = registerPlugin('Recording');
 *   await Recording.startForeground({ interval: 3000, minDisplacement: 0.5, highAccuracy: true });
 *   await Recording.stopForeground();
 *   const { points } = await Recording.getRecordedPoints();
 *   await Recording.clearRecordedPoints();
 *   const { granted } = await Recording.requestBatteryOptimizationExemption();
 */
@CapacitorPlugin(name = "Recording")
public class RecordingPlugin extends Plugin {

    /**
     * Démarre le Foreground Service d'enregistrement avec config GPS.
     * Affiche la notification persistante et démarre le GPS natif.
     */
    @PluginMethod
    public void startForeground(PluginCall call) {
        // Android 13+ (API 33) : POST_NOTIFICATIONS est une permission runtime.
        // Sans elle, la notification du foreground service est invisible et Android
        // tue le service bien plus agressivement. On la demande ici, au moment où
        // l'utilisateur déclenche le REC (contexte clair pour lui).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    getActivity(),
                    new String[]{ Manifest.permission.POST_NOTIFICATIONS },
                    0
                );
                // On démarre quand même le service — si l'utilisateur accepte la permission
                // Android affichera la notification immédiatement sans redémarrage.
            }
        }

        Intent serviceIntent = new Intent(getContext(), RecordingService.class);

        // Passer la config GPS au service
        long interval         = call.getLong("interval", 3000L);
        float minDisplacement = call.getFloat("minDisplacement", 0.5f);
        boolean highAccuracy  = call.getBoolean("highAccuracy", true);

        serviceIntent.putExtra("interval",        interval);
        serviceIntent.putExtra("minDisplacement", minDisplacement);
        serviceIntent.putExtra("highAccuracy",    highAccuracy);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to start RecordingService: " + e.getMessage());
        }
    }

    /**
     * Arrête le Foreground Service et retire la notification.
     */
    @PluginMethod
    public void stopForeground(PluginCall call) {
        Intent serviceIntent = new Intent(getContext(), RecordingService.class);
        getContext().stopService(serviceIntent);
        call.resolve();
    }

    /**
     * Retourne true si le Foreground Service d'enregistrement tourne encore.
     * Utilisé au démarrage de l'app pour différencier :
     *   - Service vivant → reprise transparente (le REC continue)
     *   - Service mort   → prompt recovery (Restaurer / Supprimer)
     */
    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", RecordingService.isRunning());
        call.resolve(result);
    }

    /**
     * Retourne les points GPS enregistrés nativement pendant que la WebView était suspendue.
     * Format : { points: [{ lat, lon, alt, timestamp }, ...] }
     */
    @PluginMethod
    public void getRecordedPoints(PluginCall call) {
        File file = new File(getContext().getFilesDir(), RecordingService.POINTS_FILE);

        JSObject result = new JSObject();

        if (!file.exists()) {
            result.put("points", new JSArray());
            call.resolve(result);
            return;
        }

        try {
            byte[] bytes = new byte[(int) file.length()];
            try (FileInputStream fis = new FileInputStream(file)) {
                //noinspection ResultOfMethodCallIgnored
                fis.read(bytes);
            }
            String json = new String(bytes, StandardCharsets.UTF_8);
            JSONArray arr = new JSONArray(json);

            // Convertir en JSArray (Capacitor ne supporte pas JSONArray directement)
            JSArray jsArr = new JSArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject pt = arr.getJSONObject(i);
                JSObject jsPoint = new JSObject();
                jsPoint.put("lat",       pt.getDouble("lat"));
                jsPoint.put("lon",       pt.getDouble("lon"));
                jsPoint.put("alt",       pt.getDouble("alt"));
                jsPoint.put("timestamp", pt.getLong("timestamp"));
                jsArr.put(jsPoint);
            }

            result.put("points", jsArr);
            call.resolve(result);

        } catch (IOException | JSONException e) {
            // En cas d'erreur de lecture, retourner un tableau vide (pas un reject)
            result.put("points", new JSArray());
            call.resolve(result);
        }
    }

    /**
     * Efface le fichier de points natifs (appelé après merge réussi côté JS).
     */
    @PluginMethod
    public void clearRecordedPoints(PluginCall call) {
        File file = new File(getContext().getFilesDir(), RecordingService.POINTS_FILE);
        if (file.exists()) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
        call.resolve();
    }

    /**
     * Demande à Android d'exempter l'app des optimisations batterie (Doze mode).
     * Essentiel pour les OEM agressifs (Samsung, Xiaomi, Huawei).
     * Retourne { granted: true } si l'app est déjà exemptée ou si l'utilisateur accepte.
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
                // Déjà exempté
                result.put("granted", true);
                call.resolve(result);
            } else {
                // Demander l'exemption (ouvre la dialog système)
                try {
                    Intent intent = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(android.net.Uri.parse("package:" + packageName));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                    // On considère que l'utilisateur va accepter (pas de callback disponible)
                    result.put("granted", true);
                } catch (Exception e) {
                    result.put("granted", false);
                }
                call.resolve(result);
            }
        } else {
            // Android < 6 (API 23) : Doze n'existe pas
            result.put("granted", true);
            call.resolve(result);
        }
    }
}
