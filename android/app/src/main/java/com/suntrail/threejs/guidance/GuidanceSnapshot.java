package com.suntrail.threejs.guidance;

import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Contrat partagé avec src/modules/guidance/guidanceTypes.ts. */
public final class GuidanceSnapshot {
    public final String routeId;
    public final String status;
    public final double progressMeters;
    public final double remainingMeters;
    public final double crossTrackMeters;
    public final Long etaEpochMs;
    public final Double bearing;
    public final GuidanceCue nextCue;
    public final Double distanceToNextCueMeters;
    public final Double accuracyMeters;
    public final Long positionAgeMs;
    public final long updatedAt;

    public GuidanceSnapshot(
        String routeId,
        String status,
        double progressMeters,
        double remainingMeters,
        double crossTrackMeters,
        Long etaEpochMs,
        Double bearing,
        GuidanceCue nextCue,
        Double distanceToNextCueMeters,
        Double accuracyMeters,
        Long positionAgeMs,
        long updatedAt
    ) {
        this.routeId = routeId;
        this.status = status;
        this.progressMeters = progressMeters;
        this.remainingMeters = remainingMeters;
        this.crossTrackMeters = crossTrackMeters;
        this.etaEpochMs = etaEpochMs;
        this.bearing = bearing;
        this.nextCue = nextCue;
        this.distanceToNextCueMeters = distanceToNextCueMeters;
        this.accuracyMeters = accuracyMeters;
        this.positionAgeMs = positionAgeMs;
        this.updatedAt = updatedAt;
    }

    public JSONObject toJson() throws JSONException {
        JSONObject json = new JSONObject();
        json.put("routeId", routeId);
        json.put("status", status);
        json.put("progressMeters", progressMeters);
        json.put("remainingMeters", remainingMeters);
        json.put("crossTrackMeters", crossTrackMeters);
        json.put("eta", etaEpochMs == null ? JSONObject.NULL : toIso(etaEpochMs));
        json.put("bearing", bearing == null ? JSONObject.NULL : bearing);
        json.put("nextCue", nextCue == null ? JSONObject.NULL : nextCue.toJson());
        json.put("distanceToNextCueMeters", distanceToNextCueMeters == null ? JSONObject.NULL : distanceToNextCueMeters);
        json.put("accuracyMeters", accuracyMeters == null ? JSONObject.NULL : accuracyMeters);
        json.put("positionAgeMs", positionAgeMs == null ? JSONObject.NULL : positionAgeMs);
        json.put("updatedAt", toIso(updatedAt));
        return json;
    }

    private static String toIso(long epochMs) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(epochMs));
    }
}
