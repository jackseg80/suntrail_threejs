package com.suntrail.threejs.guidance;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Validation stricte et copie défensive des payloads PreparedRoute envoyés au natif. */
public final class GuidanceRouteCodec {
    private static final int MAX_GEOMETRY_POINTS = 100_000;
    private static final Set<String> CUE_KINDS = new HashSet<>(Arrays.asList(
        "depart", "continue", "slight-left", "left", "sharp-left", "slight-right",
        "right", "sharp-right", "u-turn", "arrive", "waypoint", "poi"
    ));
    private static final Set<String> CUE_SOURCES = new HashSet<>(Arrays.asList(
        "ors", "osrm", "gpx-waypoint", "manual", "geometry-derived"
    ));
    private static final Set<String> CUE_CONFIDENCE = new HashSet<>(
        Arrays.asList("routed", "declared", "derived")
    );

    private GuidanceRouteCodec() {}

    public static List<GuidancePoint> parseGeometry(String json) throws JSONException {
        JSONArray array = new JSONArray(json);
        if (array.length() < 2 || array.length() > MAX_GEOMETRY_POINTS) {
            throw new JSONException("geometry must contain between 2 and " + MAX_GEOMETRY_POINTS + " points");
        }
        List<GuidancePoint> points = new ArrayList<>(array.length());
        for (int index = 0; index < array.length(); index++) {
            JSONObject value = array.getJSONObject(index);
            double lat = value.getDouble("lat");
            double lon = value.getDouble("lon");
            double ele = value.optDouble("ele", 0.0);
            if (!Double.isFinite(lat) || lat < -90 || lat > 90 ||
                !Double.isFinite(lon) || lon < -180 || lon > 180 || !Double.isFinite(ele)) {
                throw new JSONException("invalid geometry point at index " + index);
            }
            points.add(new GuidancePoint(lat, lon, ele));
        }
        return points;
    }

    public static List<GuidanceCue> parseCues(String json) throws JSONException {
        JSONArray array = new JSONArray(json == null ? "[]" : json);
        List<GuidanceCue> cues = new ArrayList<>(array.length());
        for (int index = 0; index < array.length(); index++) {
            JSONObject value = array.getJSONObject(index);
            String id = value.getString("id");
            String kind = value.getString("kind");
            double progress = value.getDouble("progressMeters");
            String source = value.getString("source");
            String confidence = value.getString("confidence");
            String label = value.isNull("label") ? null : value.optString("label", null);
            if (id.isEmpty() || !CUE_KINDS.contains(kind) || !Double.isFinite(progress) || progress < 0 ||
                !CUE_SOURCES.contains(source) || !CUE_CONFIDENCE.contains(confidence)) {
                throw new JSONException("invalid guidance cue at index " + index);
            }
            cues.add(new GuidanceCue(id, kind, progress, label, source, confidence));
        }
        cues.sort(Comparator.comparingDouble(cue -> cue.progressMeters));
        return cues;
    }

    public static String copyGeometryJson(String json) throws JSONException {
        List<GuidancePoint> points = parseGeometry(json);
        JSONArray copy = new JSONArray();
        for (GuidancePoint point : points) {
            JSONObject value = new JSONObject();
            value.put("lat", point.lat);
            value.put("lon", point.lon);
            value.put("ele", point.ele);
            copy.put(value);
        }
        return copy.toString();
    }

    public static String copyCuesJson(String json) throws JSONException {
        JSONArray copy = new JSONArray();
        for (GuidanceCue cue : parseCues(json)) copy.put(cue.toJson());
        return copy.toString();
    }
}
