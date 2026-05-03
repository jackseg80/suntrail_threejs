package com.suntrail.threejs;

import android.app.Activity;
import android.os.Bundle;

/**
 * Activity transparente dans le processus :tracking.
 *
 * Rôle : être le point d'entrée du processus :tracking. Le Foreground Service
 * (RecordingService) maintient ce processus vivant, indépendamment de la vie
 * de MainActivity et du processus principal.
 *
 * Cette Activity se ferme immédiatement après création — c'est le Service qui
 * fait tout le travail. Elle peut être étendue plus tard pour afficher une UI
 * de contrôle minimal (pause/stop) si besoin.
 */
public class TrackingActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Fermeture immédiate : le Foreground Service maintient le processus vivant
        finish();
    }
}
