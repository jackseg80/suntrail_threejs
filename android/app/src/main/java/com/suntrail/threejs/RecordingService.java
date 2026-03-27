package com.suntrail.threejs;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * RecordingService — Foreground Service Android (v5.11)
 *
 * Maintient le processus SunTrail en vie quand l'application est en arrière-plan
 * pendant un enregistrement de parcours GPS (REC).
 *
 * Sans ce service, Android peut détruire l'activité après quelques minutes en
 * arrière-plan, annulant l'enregistrement en cours et renvoyant l'utilisateur
 * sur l'écran de démarrage.
 *
 * Type : FOREGROUND_SERVICE_TYPE = "location" (requis pour les apps géo en
 * arrière-plan depuis Android 10 / API 29).
 */
public class RecordingService extends Service {

    private static final String CHANNEL_ID    = "suntrail_recording_v1";
    private static final int    NOTIFICATION_ID = 42;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createNotificationChannel();

        // Intent pour rouvrir l'app au tap sur la notification
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SunTrail 3D — Enregistrement actif")
            .setContentText("Enregistrement de parcours GPS en cours...")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)          // Non-dismissable pendant l'enregistrement
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();

        startForeground(NOTIFICATION_ID, notification);

        // START_STICKY : si Android tue le service, il le redémarre automatiquement
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopForeground(true);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // Service non bindable
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Enregistrement SunTrail",
                NotificationManager.IMPORTANCE_LOW  // Discret, pas de son
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
