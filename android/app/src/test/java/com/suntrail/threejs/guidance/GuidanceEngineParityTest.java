package com.suntrail.threejs.guidance;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

/** Parité complète avec les neuf fixtures et le golden produit par GuidanceEngine TS v5.84. */
public class GuidanceEngineParityTest {
    private static final long BASE_TIME = 1_800_000_000_000L;

    @Test
    public void allV584FixturesMatchGoldenWithinDocumentedTolerance() throws Exception {
        JSONObject inputs = resourceJson("guidance-fixtures.json");
        JSONObject goldenRoot = resourceJson("guidance-parity-v5.84.json");
        JSONObject golden = goldenRoot.getJSONObject("fixtures");
        double metersTolerance = goldenRoot.getDouble("toleranceMeters");
        double bearingTolerance = goldenRoot.getDouble("toleranceBearingDegrees");

        int fixtureCount = 0;
        Iterator<String> keys = inputs.keys();
        while (keys.hasNext()) {
            String name = keys.next();
            fixtureCount++;
            JSONObject fixture = inputs.getJSONObject(name);
            List<GuidancePoint> geometry = geometry(fixture.getJSONArray("geometry"));
            GuidanceEngine engine = new GuidanceEngine(
                "fixture-" + name, geometry, 4.0, Collections.emptyList());
            engine.start(BASE_TIME);
            JSONArray samples = fixture.getJSONArray("samples");
            JSONArray expected = golden.getJSONArray(name);
            assertEquals(name + " sample count", samples.length(), expected.length());
            for (int index = 0; index < samples.length(); index++) {
                JSONObject sample = samples.getJSONObject(index);
                long timestamp = BASE_TIME + sample.getLong("offsetMs");
                GuidanceUpdate actual = engine.update(new GuidancePosition(
                    sample.getDouble("lat"), sample.getDouble("lon"),
                    sample.getDouble("accuracyMeters"), timestamp), timestamp);
                JSONArray value = expected.getJSONArray(index);
                String label = name + "[" + index + "]";
                assertEquals(label + " status", value.getString(0), actual.snapshot.status);
                assertEquals(label + " progress", value.getDouble(1), actual.snapshot.progressMeters, metersTolerance);
                assertEquals(label + " remaining", value.getDouble(2), actual.snapshot.remainingMeters, metersTolerance);
                assertEquals(label + " cross-track", value.getDouble(3), actual.snapshot.crossTrackMeters, metersTolerance);
                assertEquals(label + " bearing", value.getDouble(4), actual.snapshot.bearing, bearingTolerance);
                assertEquals(label + " accepted", value.getBoolean(5), actual.acceptedPosition);
                assertEquals(label + " events", strings(value.getJSONArray(6)), actual.events);
                assertEquals(label + " position age", Long.valueOf(0), actual.snapshot.positionAgeMs);
            }
        }
        assertEquals("The complete v5.84 corpus must remain covered", 9, fixtureCount);
        assertEquals("Golden must not silently omit a fixture", fixtureCount, golden.length());
    }

    @Test
    public void rejectsStaleAndInaccuratePositionsWithoutAlert() {
        GuidanceEngine engine = straightEngine(new GuidanceThresholds());
        engine.start(BASE_TIME);
        GuidanceUpdate inaccurate = engine.update(
            new GuidancePosition(46.01, 7.001, 100.0, BASE_TIME), BASE_TIME);
        GuidanceUpdate stale = engine.update(
            new GuidancePosition(46.01, 7.001, 5.0, BASE_TIME), BASE_TIME + 20_000);
        assertEquals("acquiring", inaccurate.snapshot.status);
        assertEquals("acquiring", stale.snapshot.status);
        assertTrue(inaccurate.events.isEmpty());
        assertTrue(stale.events.isEmpty());
        assertFalse(inaccurate.acceptedPosition);
        assertFalse(stale.acceptedPosition);
    }

    @Test
    public void pauseResumeAndRoomRestorePreserveProgress() {
        GuidanceEngine engine = straightEngine(new GuidanceThresholds());
        engine.start(BASE_TIME);
        engine.update(new GuidancePosition(46.0, 7.001, 5.0, BASE_TIME), BASE_TIME);
        GuidanceUpdate progressed = engine.update(
            new GuidancePosition(46.0, 7.002, 5.0, BASE_TIME + 10_000), BASE_TIME + 10_000);
        double progress = progressed.snapshot.progressMeters;
        assertEquals("paused", engine.pause(BASE_TIME + 11_000).snapshot.status);
        assertEquals(progress, engine.resume(BASE_TIME + 12_000).snapshot.progressMeters, 0.001);

        com.suntrail.threejs.data.GuidanceSession persisted =
            new com.suntrail.threejs.data.GuidanceSession();
        engine.writePersistentState(persisted, BASE_TIME + 12_000);
        GuidanceEngine restored = straightEngine(new GuidanceThresholds());
        GuidanceUpdate recovery = restored.restore(persisted, BASE_TIME + 20_000);
        assertEquals("recovered", recovery.snapshot.status);
        assertEquals(progress, recovery.snapshot.progressMeters, 0.001);
        assertTrue(recovery.events.contains("recovered"));
    }

    @Test
    public void offRouteAlertRespectsTheV584Cooldown() {
        GuidanceThresholds thresholds = new GuidanceThresholds(
            60, 15_000, 2, 40, 1.5, 0, 0.6, 10_000, 5_000, 120_000,
            25, 10_000, 35, 600, 12, 250, 35, 12);
        GuidanceEngine engine = straightEngine(thresholds);
        engine.start(BASE_TIME);
        GuidanceUpdate first = engine.update(
            new GuidancePosition(46.001, 7.001, 5.0, BASE_TIME), BASE_TIME);
        GuidanceUpdate repeated = engine.update(
            new GuidancePosition(46.001, 7.0011, 5.0, BASE_TIME + 10_000),
            BASE_TIME + 10_000);
        assertEquals(Collections.singletonList("off-route"), first.events);
        assertTrue(repeated.events.isEmpty());
        assertEquals(120_000, thresholds.alertCooldownMs);
    }

    private static GuidanceEngine straightEngine(GuidanceThresholds thresholds) {
        List<GuidancePoint> points = new ArrayList<>();
        points.add(new GuidancePoint(46.0, 7.0, 500));
        points.add(new GuidancePoint(46.0, 7.004, 510));
        return new GuidanceEngine("state-test", points, 4.0, Collections.emptyList(), thresholds);
    }

    private static List<GuidancePoint> geometry(JSONArray values) throws Exception {
        List<GuidancePoint> result = new ArrayList<>();
        for (int index = 0; index < values.length(); index++) {
            JSONObject value = values.getJSONObject(index);
            result.add(new GuidancePoint(value.getDouble("lat"), value.getDouble("lon"), value.optDouble("ele", 0)));
        }
        return result;
    }

    private static List<String> strings(JSONArray values) throws Exception {
        List<String> result = new ArrayList<>();
        for (int index = 0; index < values.length(); index++) result.add(values.getString(index));
        return result;
    }

    private static JSONObject resourceJson(String name) throws Exception {
        try (InputStream input = GuidanceEngineParityTest.class.getClassLoader().getResourceAsStream(name)) {
            if (input == null) throw new IllegalStateException("Missing test resource " + name);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) >= 0) output.write(buffer, 0, count);
            return new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
        }
    }
}
