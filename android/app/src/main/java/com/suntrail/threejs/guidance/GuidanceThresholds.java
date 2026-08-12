package com.suntrail.threejs.guidance;

/** Seuils v5.84 portés sans modification pour la parité Java/TypeScript. */
public final class GuidanceThresholds {
    public final double maximumAccuracyMeters;
    public final long stalePositionMs;
    public final int acquiringGoodSamples;
    public final double offRouteBaseMeters;
    public final double offRouteAccuracyFactor;
    public final long offRouteHoldMs;
    public final double recoveryThresholdRatio;
    public final long recoveryHoldMs;
    public final long recoveryDisplayMs;
    public final long alertCooldownMs;
    public final double arrivalRadiusMeters;
    public final long arrivalHoldMs;
    public final double maximumBackwardMeters;
    public final double continuitySearchMeters;
    public final double maximumPlausibleSpeedMps;
    public final double gpsJumpBaseMeters;
    public final double lookAheadMeters;
    public final double cuePassedMeters;

    public GuidanceThresholds() {
        this(60, 15_000, 2, 40, 1.5, 20_000, 0.6, 10_000, 5_000, 120_000,
            25, 10_000, 35, 600, 12, 250, 35, 12);
    }

    public GuidanceThresholds(
        double maximumAccuracyMeters,
        long stalePositionMs,
        int acquiringGoodSamples,
        double offRouteBaseMeters,
        double offRouteAccuracyFactor,
        long offRouteHoldMs,
        double recoveryThresholdRatio,
        long recoveryHoldMs,
        long recoveryDisplayMs,
        long alertCooldownMs,
        double arrivalRadiusMeters,
        long arrivalHoldMs,
        double maximumBackwardMeters,
        double continuitySearchMeters,
        double maximumPlausibleSpeedMps,
        double gpsJumpBaseMeters,
        double lookAheadMeters,
        double cuePassedMeters
    ) {
        this.maximumAccuracyMeters = maximumAccuracyMeters;
        this.stalePositionMs = stalePositionMs;
        this.acquiringGoodSamples = acquiringGoodSamples;
        this.offRouteBaseMeters = offRouteBaseMeters;
        this.offRouteAccuracyFactor = offRouteAccuracyFactor;
        this.offRouteHoldMs = offRouteHoldMs;
        this.recoveryThresholdRatio = recoveryThresholdRatio;
        this.recoveryHoldMs = recoveryHoldMs;
        this.recoveryDisplayMs = recoveryDisplayMs;
        this.alertCooldownMs = alertCooldownMs;
        this.arrivalRadiusMeters = arrivalRadiusMeters;
        this.arrivalHoldMs = arrivalHoldMs;
        this.maximumBackwardMeters = maximumBackwardMeters;
        this.continuitySearchMeters = continuitySearchMeters;
        this.maximumPlausibleSpeedMps = maximumPlausibleSpeedMps;
        this.gpsJumpBaseMeters = gpsJumpBaseMeters;
        this.lookAheadMeters = lookAheadMeters;
        this.cuePassedMeters = cuePassedMeters;
    }
}
