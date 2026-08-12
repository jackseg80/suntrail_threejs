package com.suntrail.threejs.guidance;

import org.json.JSONException;
import org.json.JSONObject;

public final class GuidanceCue {
    public final String id;
    public final String kind;
    public final double progressMeters;
    public final String label;
    public final String source;
    public final String confidence;

    public GuidanceCue(
        String id,
        String kind,
        double progressMeters,
        String label,
        String source,
        String confidence
    ) {
        this.id = id;
        this.kind = kind;
        this.progressMeters = progressMeters;
        this.label = label;
        this.source = source;
        this.confidence = confidence;
    }

    public JSONObject toJson() throws JSONException {
        JSONObject json = new JSONObject();
        json.put("id", id);
        json.put("kind", kind);
        json.put("progressMeters", progressMeters);
        json.put("label", label == null ? JSONObject.NULL : label);
        json.put("source", source);
        json.put("confidence", confidence);
        return json;
    }
}
