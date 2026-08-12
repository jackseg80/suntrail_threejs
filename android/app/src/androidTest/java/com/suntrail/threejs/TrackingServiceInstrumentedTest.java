package com.suntrail.threejs;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.ParcelFileDescriptor;

import androidx.core.content.ContextCompat;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.GrantPermissionRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.suntrail.threejs.data.ActiveGuidanceRoute;
import com.suntrail.threejs.data.AppDatabase;
import com.suntrail.threejs.data.GuidanceSession;

import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class TrackingServiceInstrumentedTest {
    @Rule public GrantPermissionRule location = GrantPermissionRule.grant(
        Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION);

    private final Context context = ApplicationProvider.getApplicationContext();
    private final AtomicBoolean guidanceActive = new AtomicBoolean(false);
    private final AtomicBoolean recordingActive = new AtomicBoolean(false);
    private final AtomicReference<String> guidanceStatus = new AtomicReference<>("");
    private BroadcastReceiver sessionReceiver;

    @Before public void prepare() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(
                context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        }
        context.getSharedPreferences("TrackingPrefs", Context.MODE_PRIVATE).edit().clear().commit();
        AppDatabase db = AppDatabase.getInstance(context);
        db.clearAllTables();
        ActiveGuidanceRoute route = new ActiveGuidanceRoute();
        route.routeId = "service-route";
        route.geometryJson = "[{\"lat\":46,\"lon\":7,\"ele\":500},{\"lat\":46,\"lon\":7.001,\"ele\":510}]";
        route.cuesJson = "[]";
        route.plannedPaceKmh = 4;
        route.createdAt = System.currentTimeMillis();
        route.updatedAt = route.createdAt;
        GuidanceSession session = new GuidanceSession();
        session.mode = "guidance";
        session.routeId = route.routeId;
        session.status = "acquiring";
        session.updatedAt = route.createdAt;
        db.guidanceDao().replaceGuidance(route, session);
        sessionReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context ignored, Intent intent) {
                if (RecordingService.ACTION_GUIDANCE_SNAPSHOT.equals(intent.getAction())) {
                    try {
                        guidanceStatus.set(new JSONObject(intent.getStringExtra("snapshot")).optString("status"));
                    } catch (Exception ignoredError) {
                        guidanceStatus.set("invalid-snapshot");
                    }
                    return;
                }
                guidanceActive.set(intent.getBooleanExtra("guidance", false));
                recordingActive.set(intent.getBooleanExtra("recording", false));
            }
        };
        IntentFilter sessionEvents = new IntentFilter(RecordingService.ACTION_SESSION_CHANGED);
        sessionEvents.addAction(RecordingService.ACTION_GUIDANCE_SNAPSHOT);
        ContextCompat.registerReceiver(context, sessionReceiver, sessionEvents,
            ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @After public void stop() {
        context.startService(action(RecordingService.ACTION_STOP_ALL));
        if (sessionReceiver != null) context.unregisterReceiver(sessionReceiver);
        AppDatabase.destroyInstance();
    }

    @Test
    public void notificationAndIndependentStopActionsKeepGuidanceAlive() throws Exception {
        ContextCompat.startForegroundService(context, action(RecordingService.ACTION_START_GUIDANCE));
        waitFor("guidance start", guidanceActive::get);
        // Le premier broadcast de session précède volontairement le chargement asynchrone Room.
        // Attendre le snapshot garantit que pause/reprise testent le moteur réellement actif.
        waitFor("guidance engine ready", () -> "acquiring".equals(guidanceStatus.get()));
        waitFor("foreground notification", this::hasTargetForegroundNotification);

        context.startService(action(RecordingService.ACTION_STOP_RECORDING));
        waitFor("recording-only stop broadcast", () -> guidanceActive.get() && !recordingActive.get());
        assertTrue("Stopping REC must not stop Guidance", guidanceActive.get());
        assertFalse(recordingActive.get());

        context.startService(action(RecordingService.ACTION_PAUSE_GUIDANCE));
        waitFor("pause snapshot", () -> "paused".equals(guidanceStatus.get()));
        context.startService(action(RecordingService.ACTION_RESUME_GUIDANCE));
        waitFor("resume snapshot", () -> "acquiring".equals(guidanceStatus.get()));
        context.startService(action(RecordingService.ACTION_STOP_GUIDANCE));
        waitFor("guidance stop", () -> !guidanceActive.get());
        assertFalse(recordingActive.get());
    }

    private Intent action(String value) { return new Intent(context, RecordingService.class).setAction(value); }
    private boolean hasTargetForegroundNotification() throws Exception {
        ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation()
            .executeShellCommand("dumpsys notification --noredact");
        try (FileInputStream input = new FileInputStream(descriptor.getFileDescriptor());
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4_096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toString("UTF-8").contains("com.suntrail.threejs");
        } finally {
            descriptor.close();
        }
    }
    private static void waitFor(String label, Condition condition) throws Exception {
        long deadline = System.currentTimeMillis() + 8_000;
        while (System.currentTimeMillis() < deadline) {
            if (condition.ok()) return;
            Thread.sleep(100);
        }
        throw new AssertionError("Timed out: " + label);
    }
    private interface Condition { boolean ok() throws Exception; }
}
