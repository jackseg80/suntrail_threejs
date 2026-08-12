package com.suntrail.threejs.guidance;

import com.suntrail.threejs.data.GuidanceSession;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Port Java strict du GuidanceEngine TypeScript v5.84.
 *
 * Aucune dépendance Android : la projection, la continuité, les états et les seuils restent
 * déterministes et peuvent être exécutés par JUnit sur la JVM avec les fixtures partagées.
 */
public final class GuidanceEngine {
    private static final double EARTH_RADIUS_METERS = 6_371_000.0;

    private static final class XYPoint {
        final double x;
        final double y;
        XYPoint(double x, double y) { this.x = x; this.y = y; }
    }

    private static final class Segment {
        final GuidancePoint start;
        final GuidancePoint end;
        final XYPoint startXY;
        final XYPoint endXY;
        final double lengthMeters;
        final double cumulativeStartMeters;
        final double bearing;

        Segment(GuidancePoint start, GuidancePoint end, XYPoint startXY, XYPoint endXY,
                double lengthMeters, double cumulativeStartMeters, double bearing) {
            this.start = start;
            this.end = end;
            this.startXY = startXY;
            this.endXY = endXY;
            this.lengthMeters = lengthMeters;
            this.cumulativeStartMeters = cumulativeStartMeters;
            this.bearing = bearing;
        }
    }

    private static final class Projection {
        final int segmentIndex;
        final double progressMeters;
        final double crossTrackMeters;
        final GuidancePoint projected;

        Projection(int segmentIndex, double progressMeters, double crossTrackMeters,
                   GuidancePoint projected) {
            this.segmentIndex = segmentIndex;
            this.progressMeters = progressMeters;
            this.crossTrackMeters = crossTrackMeters;
            this.projected = projected;
        }
    }

    private final String routeId;
    private final double plannedPaceKmh;
    private final GuidanceThresholds thresholds;
    private final List<GuidancePoint> geometry;
    private final List<Segment> segments;
    private final List<GuidanceCue> cues;
    private final double referenceLat;
    private final double referenceLon;
    private final double latitudeScale;
    private final double longitudeScale;
    private final double totalMeters;

    private String status = "idle";
    private double progressMeters;
    private double crossTrackMeters;
    private int currentSegmentIndex;
    private GuidancePosition lastAcceptedPosition;
    private GuidancePoint lastProjectedPoint;
    private int goodSampleCount;
    private Long offRouteSince;
    private Long recoverySince;
    private Long recoveredAt;
    private Long arrivalSince;
    private Long lastOffRouteAlertAt;

    public GuidanceEngine(
        String routeId,
        List<GuidancePoint> geometry,
        double plannedPaceKmh,
        List<GuidanceCue> cues
    ) {
        this(routeId, geometry, plannedPaceKmh, cues, new GuidanceThresholds());
    }

    public GuidanceEngine(
        String routeId,
        List<GuidancePoint> geometry,
        double plannedPaceKmh,
        List<GuidanceCue> cues,
        GuidanceThresholds thresholds
    ) {
        if (routeId == null || routeId.isEmpty()) throw new IllegalArgumentException("routeId is required");
        if (geometry == null || geometry.size() < 2) {
            throw new IllegalArgumentException("Guidance requires at least two route points");
        }
        this.routeId = routeId;
        this.plannedPaceKmh = Double.isFinite(plannedPaceKmh) && plannedPaceKmh > 0
            ? plannedPaceKmh : 4.0;
        this.thresholds = thresholds;
        this.geometry = new ArrayList<>(geometry);
        this.cues = new ArrayList<>(cues == null ? Collections.emptyList() : cues);
        this.cues.sort(Comparator.comparingDouble(cue -> cue.progressMeters));
        this.referenceLat = geometry.get(0).lat;
        this.referenceLon = geometry.get(0).lon;
        this.latitudeScale = EARTH_RADIUS_METERS * (Math.PI / 180.0);
        this.longitudeScale = latitudeScale * Math.cos(toRadians(referenceLat));

        double cumulative = 0;
        this.segments = new ArrayList<>(geometry.size() - 1);
        for (int index = 0; index < geometry.size() - 1; index++) {
            GuidancePoint start = geometry.get(index);
            GuidancePoint end = geometry.get(index + 1);
            double length = haversineMeters(start, end);
            segments.add(new Segment(start, end, project(start), project(end), length, cumulative,
                bearingDegrees(start, end)));
            cumulative += length;
        }
        this.totalMeters = cumulative;
    }

    public GuidanceUpdate start(long now) {
        status = "acquiring";
        return createUpdate(now, new ArrayList<>(), false, null);
    }

    public GuidanceUpdate pause(long now) {
        if (!"idle".equals(status) && !"arrived".equals(status)) status = "paused";
        return createUpdate(now, new ArrayList<>(), false, null);
    }

    public GuidanceUpdate resume(long now) {
        if ("paused".equals(status)) {
            status = "acquiring";
            goodSampleCount = 0;
            offRouteSince = null;
            recoverySince = null;
        }
        return createUpdate(now, new ArrayList<>(), false, null);
    }

    public GuidanceUpdate stop(long now) {
        status = "idle";
        return createUpdate(now, new ArrayList<>(), false, null);
    }

    public GuidanceUpdate tick(long now) {
        if (!"idle".equals(status) && !"paused".equals(status) && !"arrived".equals(status) &&
            (lastAcceptedPosition == null || now - lastAcceptedPosition.timestamp > thresholds.stalePositionMs)) {
            status = "acquiring";
            goodSampleCount = 0;
            offRouteSince = null;
            recoverySince = null;
        }
        return createUpdate(now, new ArrayList<>(), false, null);
    }

    public GuidanceUpdate update(GuidancePosition position, long now) {
        if ("idle".equals(status) || "paused".equals(status) || "arrived".equals(status)) {
            return createUpdate(now, new ArrayList<>(), false, null);
        }
        long positionAgeMs = Math.max(0, now - position.timestamp);
        Double accuracy = position.accuracyMeters;
        if (positionAgeMs > thresholds.stalePositionMs ||
            (accuracy != null && accuracy > thresholds.maximumAccuracyMeters)) {
            status = "acquiring";
            goodSampleCount = 0;
            offRouteSince = null;
            recoverySince = null;
            return createUpdate(now, new ArrayList<>(), false, position);
        }
        if (isImplausibleJump(position)) {
            status = "acquiring";
            goodSampleCount = 0;
            offRouteSince = null;
            recoverySince = null;
            return createUpdate(now, new ArrayList<>(), false, position);
        }

        Projection candidate = selectProjection(position);
        lastAcceptedPosition = new GuidancePosition(position.lat, position.lon,
            position.accuracyMeters, position.timestamp);
        lastProjectedPoint = candidate.projected;
        currentSegmentIndex = candidate.segmentIndex;
        crossTrackMeters = candidate.crossTrackMeters;
        progressMeters = Math.max(progressMeters, Math.min(totalMeters, candidate.progressMeters));
        goodSampleCount += 1;

        List<String> events = new ArrayList<>();
        double offRouteThreshold = Math.max(thresholds.offRouteBaseMeters,
            thresholds.offRouteAccuracyFactor * (accuracy == null ? 0 : accuracy));
        double recoveryThreshold = offRouteThreshold * thresholds.recoveryThresholdRatio;
        double remaining = totalMeters - progressMeters;

        if (remaining <= thresholds.arrivalRadiusMeters && candidate.crossTrackMeters <= offRouteThreshold) {
            if (arrivalSince == null) arrivalSince = now;
            if (now - arrivalSince >= thresholds.arrivalHoldMs) {
                status = "arrived";
                progressMeters = totalMeters;
                events.add("arrived");
                return createUpdate(now, events, true, null);
            }
        } else {
            arrivalSince = null;
        }

        if (candidate.crossTrackMeters > offRouteThreshold) {
            if (offRouteSince == null) offRouteSince = now;
            recoverySince = null;
            recoveredAt = null;
            if (now - offRouteSince >= thresholds.offRouteHoldMs) {
                status = "offRoute";
                if (lastOffRouteAlertAt == null || now - lastOffRouteAlertAt >= thresholds.alertCooldownMs) {
                    events.add("off-route");
                    lastOffRouteAlertAt = now;
                }
            }
        } else if ("offRoute".equals(status)) {
            offRouteSince = null;
            if (candidate.crossTrackMeters <= recoveryThreshold) {
                if (recoverySince == null) recoverySince = now;
                if (now - recoverySince >= thresholds.recoveryHoldMs) {
                    status = "recovered";
                    recoveredAt = now;
                    recoverySince = null;
                    events.add("recovered");
                }
            } else {
                recoverySince = null;
            }
        } else {
            offRouteSince = null;
            recoverySince = null;
            if ("recovered".equals(status) && recoveredAt != null &&
                now - recoveredAt < thresholds.recoveryDisplayMs) {
                // État transitoire volontairement visible.
            } else if (goodSampleCount >= thresholds.acquiringGoodSamples) {
                status = "onRoute";
                recoveredAt = null;
            } else {
                status = "acquiring";
            }
        }
        return createUpdate(now, events, true, null);
    }

    /** Reprend une session Room. Le statut recovered rend la reprise explicite au bridge. */
    public GuidanceUpdate restore(GuidanceSession session, long now) {
        progressMeters = Math.max(0, Math.min(totalMeters, session.progressMeters));
        crossTrackMeters = Math.max(0, session.crossTrackMeters);
        currentSegmentIndex = Math.max(0, Math.min(segments.size() - 1, session.currentSegmentIndex));
        goodSampleCount = session.goodSampleCount;
        offRouteSince = session.offRouteSince;
        recoverySince = session.recoverySince;
        recoveredAt = session.recoveredAt;
        arrivalSince = session.arrivalSince;
        lastOffRouteAlertAt = session.lastOffRouteAlertAt;
        if (session.lastPositionLat != null && session.lastPositionLon != null &&
            session.lastPositionTimestamp != null) {
            lastAcceptedPosition = new GuidancePosition(session.lastPositionLat, session.lastPositionLon,
                session.lastPositionAccuracy, session.lastPositionTimestamp);
        }
        if (session.lastProjectedLat != null && session.lastProjectedLon != null) {
            lastProjectedPoint = new GuidancePoint(session.lastProjectedLat, session.lastProjectedLon, 0);
        }
        if ("paused".equals(session.status) || "arrived".equals(session.status)) {
            status = session.status;
        } else {
            status = "recovered";
            recoveredAt = now;
            goodSampleCount = Math.max(goodSampleCount, thresholds.acquiringGoodSamples);
        }
        return createUpdate(now, Collections.singletonList("recovered"), false, null);
    }

    public GuidanceSnapshot getSnapshot(long now) { return createSnapshot(now); }
    public double getTotalMeters() { return totalMeters; }

    public void writePersistentState(GuidanceSession session, long now) {
        GuidanceSnapshot snapshot = createSnapshot(now);
        session.routeId = routeId;
        session.status = snapshot.status;
        session.progressMeters = snapshot.progressMeters;
        session.remainingMeters = snapshot.remainingMeters;
        session.crossTrackMeters = snapshot.crossTrackMeters;
        session.etaEpochMs = snapshot.etaEpochMs;
        session.bearing = snapshot.bearing;
        try {
            session.nextCueJson = snapshot.nextCue == null ? null : snapshot.nextCue.toJson().toString();
        } catch (JSONException ignored) {
            session.nextCueJson = null;
        }
        session.distanceToNextCueMeters = snapshot.distanceToNextCueMeters;
        session.accuracyMeters = snapshot.accuracyMeters;
        session.positionAgeMs = snapshot.positionAgeMs;
        session.updatedAt = now;
        session.currentSegmentIndex = currentSegmentIndex;
        session.goodSampleCount = goodSampleCount;
        session.offRouteSince = offRouteSince;
        session.recoverySince = recoverySince;
        session.recoveredAt = recoveredAt;
        session.arrivalSince = arrivalSince;
        session.lastOffRouteAlertAt = lastOffRouteAlertAt;
        if (lastAcceptedPosition != null) {
            session.lastPositionLat = lastAcceptedPosition.lat;
            session.lastPositionLon = lastAcceptedPosition.lon;
            session.lastPositionAccuracy = lastAcceptedPosition.accuracyMeters;
            session.lastPositionTimestamp = lastAcceptedPosition.timestamp;
        }
        if (lastProjectedPoint != null) {
            session.lastProjectedLat = lastProjectedPoint.lat;
            session.lastProjectedLon = lastProjectedPoint.lon;
        }
    }

    private boolean isImplausibleJump(GuidancePosition position) {
        if (lastAcceptedPosition == null) return false;
        long elapsedMs = position.timestamp - lastAcceptedPosition.timestamp;
        if (elapsedMs <= 0) return true;
        double distance = haversineMeters(
            new GuidancePoint(lastAcceptedPosition.lat, lastAcceptedPosition.lon, 0),
            new GuidancePoint(position.lat, position.lon, 0)
        );
        double allowed = Math.max(thresholds.gpsJumpBaseMeters,
            thresholds.maximumPlausibleSpeedMps * (elapsedMs / 1000.0) +
                (position.accuracyMeters == null ? 0 : position.accuracyMeters) +
                (lastAcceptedPosition.accuracyMeters == null ? 0 : lastAcceptedPosition.accuracyMeters));
        return distance > allowed;
    }

    private Projection selectProjection(GuidancePosition position) {
        GuidancePoint point = new GuidancePoint(position.lat, position.lon, 0);
        List<Projection> candidates = new ArrayList<>(segments.size());
        for (int index = 0; index < segments.size(); index++) {
            candidates.add(projectOnSegment(point, segments.get(index), index));
        }
        if (lastAcceptedPosition == null) {
            double nearest = candidates.stream().mapToDouble(value -> value.crossTrackMeters).min().orElse(0);
            return candidates.stream()
                .filter(value -> value.crossTrackMeters <= nearest + 8)
                .min(Comparator.comparingDouble(value -> value.progressMeters))
                .orElse(candidates.get(0));
        }

        double elapsedSeconds = Math.max(0,
            (position.timestamp - lastAcceptedPosition.timestamp) / 1000.0);
        double movementMeters = haversineMeters(
            new GuidancePoint(lastAcceptedPosition.lat, lastAcceptedPosition.lon, 0), point);
        double predictedAdvance = Math.min(movementMeters,
            thresholds.maximumPlausibleSpeedMps * elapsedSeconds);
        double expectedProgress = Math.min(totalMeters, progressMeters + predictedAdvance);

        Projection best = candidates.get(0);
        double bestScore = Double.POSITIVE_INFINITY;
        for (Projection candidate : candidates) {
            double delta = candidate.progressMeters - expectedProgress;
            boolean outside = delta < -thresholds.maximumBackwardMeters ||
                delta > thresholds.continuitySearchMeters;
            double continuityPenalty = Math.abs(delta) * (delta < 0 ? 0.8 : 0.28) +
                (outside ? 500 : 0);
            double segmentPenalty = Math.abs(candidate.segmentIndex - currentSegmentIndex) * 0.15;
            double score = candidate.crossTrackMeters + continuityPenalty + segmentPenalty;
            if (score < bestScore) {
                bestScore = score;
                best = candidate;
            }
        }
        return best;
    }

    private Projection projectOnSegment(GuidancePoint position, Segment segment, int segmentIndex) {
        XYPoint point = project(position);
        double dx = segment.endXY.x - segment.startXY.x;
        double dy = segment.endXY.y - segment.startXY.y;
        double lengthSquared = dx * dx + dy * dy;
        double rawRatio = lengthSquared == 0 ? 0 :
            ((point.x - segment.startXY.x) * dx + (point.y - segment.startXY.y) * dy) /
                lengthSquared;
        double ratio = Math.max(0, Math.min(1, rawRatio));
        double projectedX = segment.startXY.x + ratio * dx;
        double projectedY = segment.startXY.y + ratio * dy;
        return new Projection(segmentIndex,
            segment.cumulativeStartMeters + ratio * segment.lengthMeters,
            Math.hypot(point.x - projectedX, point.y - projectedY),
            interpolate(segment.start, segment.end, ratio));
    }

    private GuidancePoint pointAtProgress(double meters) {
        double target = Math.max(0, Math.min(totalMeters, meters));
        Segment selected = segments.get(segments.size() - 1);
        for (Segment segment : segments) {
            if (target <= segment.cumulativeStartMeters + segment.lengthMeters) {
                selected = segment;
                break;
            }
        }
        double ratio = selected.lengthMeters > 0
            ? (target - selected.cumulativeStartMeters) / selected.lengthMeters : 0;
        return interpolate(selected.start, selected.end, ratio);
    }

    private GuidanceCue nextCue() {
        for (GuidanceCue cue : cues) {
            if (cue.progressMeters >= progressMeters - thresholds.cuePassedMeters) return cue;
        }
        return null;
    }

    private GuidanceSnapshot createSnapshot(long now) {
        double remaining = Math.max(0, totalMeters - progressMeters);
        Long eta = null;
        if ("arrived".equals(status)) eta = now;
        else if (!"idle".equals(status)) {
            eta = now + Math.round((remaining / (plannedPaceKmh * 1000.0)) * 3_600_000.0);
        }
        GuidanceCue nextCue = nextCue();
        GuidancePoint lookAhead = pointAtProgress(progressMeters + thresholds.lookAheadMeters);
        Double bearing = null;
        if ("offRoute".equals(status) && lastAcceptedPosition != null && lastProjectedPoint != null) {
            bearing = bearingDegrees(
                new GuidancePoint(lastAcceptedPosition.lat, lastAcceptedPosition.lon, 0),
                lastProjectedPoint);
        } else if (lastProjectedPoint != null) {
            bearing = bearingDegrees(lastProjectedPoint, lookAhead);
        } else if (!segments.isEmpty()) {
            bearing = segments.get(currentSegmentIndex).bearing;
        }
        return new GuidanceSnapshot(routeId, status, progressMeters, remaining, crossTrackMeters,
            eta, bearing, nextCue,
            nextCue == null ? null : Math.max(0, nextCue.progressMeters - progressMeters),
            lastAcceptedPosition == null ? null : lastAcceptedPosition.accuracyMeters,
            lastAcceptedPosition == null ? null : Math.max(0, now - lastAcceptedPosition.timestamp),
            now);
    }

    private GuidanceUpdate createUpdate(long now, List<String> events, boolean accepted,
                                        GuidancePosition rejected) {
        GuidanceSnapshot snapshot = createSnapshot(now);
        if (rejected != null) {
            snapshot = new GuidanceSnapshot(snapshot.routeId, snapshot.status,
                snapshot.progressMeters, snapshot.remainingMeters, snapshot.crossTrackMeters,
                snapshot.etaEpochMs, snapshot.bearing, snapshot.nextCue,
                snapshot.distanceToNextCueMeters, rejected.accuracyMeters,
                Math.max(0, now - rejected.timestamp), snapshot.updatedAt);
        }
        return new GuidanceUpdate(snapshot, new ArrayList<>(events), accepted);
    }

    private XYPoint project(GuidancePoint point) {
        return new XYPoint((point.lon - referenceLon) * longitudeScale,
            (point.lat - referenceLat) * latitudeScale);
    }

    private static GuidancePoint interpolate(GuidancePoint start, GuidancePoint end, double ratio) {
        return new GuidancePoint(start.lat + (end.lat - start.lat) * ratio,
            start.lon + (end.lon - start.lon) * ratio,
            start.ele + (end.ele - start.ele) * ratio);
    }

    private static double toRadians(double value) { return value * Math.PI / 180.0; }
    private static double toDegrees(double value) { return value * 180.0 / Math.PI; }
    private static double normalizeBearing(double value) { return ((value % 360) + 360) % 360; }

    public static double haversineMeters(GuidancePoint a, GuidancePoint b) {
        double lat1 = toRadians(a.lat);
        double lat2 = toRadians(b.lat);
        double dLat = lat2 - lat1;
        double dLon = toRadians(b.lon - a.lon);
        double h = Math.pow(Math.sin(dLat / 2), 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLon / 2), 2);
        return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    public static double bearingDegrees(GuidancePoint a, GuidancePoint b) {
        double lat1 = toRadians(a.lat);
        double lat2 = toRadians(b.lat);
        double dLon = toRadians(b.lon - a.lon);
        double y = Math.sin(dLon) * Math.cos(lat2);
        double x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        return normalizeBearing(toDegrees(Math.atan2(y, x)));
    }
}
