package com.suntrail.threejs;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * RecordingPlugin — Plugin Capacitor pour contrôler le Foreground Service (v5.11)
 *
 * Exposé côté JavaScript via :
 *   import { registerPlugin } from '@capacitor/core';
 *   const Recording = registerPlugin('Recording');
 *   await Recording.startForeground();
 *   await Recording.stopForeground();
 */
@CapacitorPlugin(name = "Recording")
public class RecordingPlugin extends Plugin {

    /**
     * Démarre le Foreground Service d'enregistrement.
     * Affiche la notification persistante et empêche Android de tuer le processus.
     */
    @PluginMethod
    public void startForeground(PluginCall call) {
        Intent serviceIntent = new Intent(getContext(), RecordingService.class);
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
}
