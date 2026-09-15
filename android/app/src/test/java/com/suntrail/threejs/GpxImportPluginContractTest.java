package com.suntrail.threejs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.junit.Test;

import java.lang.reflect.Method;

/** Empêche une régression silencieuse de la réception OS des GPX (v5.91). */
public class GpxImportPluginContractTest {

    @Test
    public void isRegisteredAsGpxImportPlugin() {
        CapacitorPlugin annotation =
            GpxImportPlugin.class.getAnnotation(CapacitorPlugin.class);
        assertNotNull("GpxImportPlugin must carry @CapacitorPlugin", annotation);
        assertEquals("GpxImport", annotation.name());
    }

    @Test
    public void exposesRetainedEventName() {
        assertEquals("gpxImportReceived", GpxImportPlugin.EVENT_RECEIVED);
    }

    @Test
    public void exposesAssociationSettingsMethod() throws Exception {
        Method method = GpxImportPlugin.class.getMethod(
            "openAppAssociationSettings", com.getcapacitor.PluginCall.class);
        assertNotNull(
            "openAppAssociationSettings must remain a Capacitor method",
            method.getAnnotation(PluginMethod.class)
        );
    }

    @Test
    public void overridesHandleOnNewIntent() throws Exception {
        Method method = GpxImportPlugin.class.getDeclaredMethod(
            "handleOnNewIntent", android.content.Intent.class);
        assertTrue(
            "handleOnNewIntent must be declared on GpxImportPlugin",
            method.getDeclaringClass() == GpxImportPlugin.class
        );
    }
}
