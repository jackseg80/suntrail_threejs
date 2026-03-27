package com.suntrail.threejs;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Enregistrer le plugin Foreground Service avant super.onCreate()
        registerPlugin(RecordingPlugin.class);
        super.onCreate(savedInstanceState);
        hideStatusBar();
    }

    /**
     * onWindowFocusChanged est l'endroit correct pour appliquer le mode immersif.
     * onResume() est trop tôt — Android peut reset les insets après l'avoir obtenu le focus.
     * Recommandation officielle Google pour l'immersive mode.
     */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideStatusBar();
        }
    }

    /**
     * Masque la barre de statut système (heure, batterie, notifications).
     * L'utilisateur peut la faire apparaître temporairement en swipant depuis le haut.
     */
    private void hideStatusBar() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        }
    }
}
