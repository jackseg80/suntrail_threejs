package com.suntrail.threejs.guidance;

public final class GuidancePosition {
    public final double lat;
    public final double lon;
    public final Double accuracyMeters;
    public final long timestamp;

    public GuidancePosition(double lat, double lon, Double accuracyMeters, long timestamp) {
        this.lat = lat;
        this.lon = lon;
        this.accuracyMeters = accuracyMeters;
        this.timestamp = timestamp;
    }
}
