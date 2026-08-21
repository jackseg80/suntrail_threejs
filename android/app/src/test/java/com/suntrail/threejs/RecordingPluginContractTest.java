package com.suntrail.threejs;

import static org.junit.Assert.assertNotNull;

import com.getcapacitor.PluginMethod;

import org.junit.Test;

import java.lang.reflect.Method;

/** Empêche une régression silencieuse des anciennes API REC et du bridge Guidance. */
public class RecordingPluginContractTest {
    @Test
    public void exposesLegacyRecordingAndIndependentGuidanceMethods() throws Exception {
        String[] methods = {
            "startCourse", "startForeground", "stopCourse", "stopForeground",
            "getCurrentCourse", "getPoints", "getRecordedPoints", "getPointCount",
            "getPendingStoppedCourse", "acknowledgePendingStoppedCourse",
            "clearRecordedPoints", "updateNotificationStats",
            "saveTextToDownloads",
            "startGuidance", "stopGuidance", "pauseGuidance", "resumeGuidance",
            "stopAll", "getActiveSession", "getGuidanceSnapshot"
        };
        for (String name : methods) {
            Method method = RecordingPlugin.class.getMethod(name, com.getcapacitor.PluginCall.class);
            assertNotNull(name + " must remain a Capacitor method", method.getAnnotation(PluginMethod.class));
        }
    }
}
