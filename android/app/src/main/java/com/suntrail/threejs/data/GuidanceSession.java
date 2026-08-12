package com.suntrail.threejs.data;

import androidx.annotation.NonNull;
import androidx.room.ColumnInfo;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

/**
 * État persistant de l'unique session terrain active.
 *
 * mode vaut recording, guidance ou both. Les champs internes du matcher permettent une reprise
 * monotone après destruction de la WebView ou du processus principal, sans recalculer la route.
 */
@Entity(tableName = "guidance_session")
public class GuidanceSession {

    public static final int SINGLETON_ID = 1;

    @PrimaryKey
    public int id = SINGLETON_ID;

    @NonNull
    public String mode = "recording";

    @ColumnInfo(name = "route_id")
    public String routeId;

    @NonNull
    public String status = "idle";

    @ColumnInfo(name = "recording_course_id")
    public String recordingCourseId;

    @ColumnInfo(name = "progress_meters")
    public double progressMeters;

    @ColumnInfo(name = "remaining_meters")
    public double remainingMeters;

    @ColumnInfo(name = "cross_track_meters")
    public double crossTrackMeters;

    @ColumnInfo(name = "eta_epoch_ms")
    public Long etaEpochMs;

    public Double bearing;

    @ColumnInfo(name = "next_cue_json")
    public String nextCueJson;

    @ColumnInfo(name = "distance_to_next_cue_meters")
    public Double distanceToNextCueMeters;

    @ColumnInfo(name = "accuracy_meters")
    public Double accuracyMeters;

    @ColumnInfo(name = "position_age_ms")
    public Long positionAgeMs;

    @ColumnInfo(name = "updated_at")
    public long updatedAt;

    @ColumnInfo(name = "last_position_lat")
    public Double lastPositionLat;

    @ColumnInfo(name = "last_position_lon")
    public Double lastPositionLon;

    @ColumnInfo(name = "last_position_accuracy")
    public Double lastPositionAccuracy;

    @ColumnInfo(name = "last_position_timestamp")
    public Long lastPositionTimestamp;

    @ColumnInfo(name = "last_projected_lat")
    public Double lastProjectedLat;

    @ColumnInfo(name = "last_projected_lon")
    public Double lastProjectedLon;

    @ColumnInfo(name = "current_segment_index")
    public int currentSegmentIndex;

    @ColumnInfo(name = "good_sample_count")
    public int goodSampleCount;

    @ColumnInfo(name = "off_route_since")
    public Long offRouteSince;

    @ColumnInfo(name = "recovery_since")
    public Long recoverySince;

    @ColumnInfo(name = "recovered_at")
    public Long recoveredAt;

    @ColumnInfo(name = "arrival_since")
    public Long arrivalSince;

    @ColumnInfo(name = "last_off_route_alert_at")
    public Long lastOffRouteAlertAt;

    /** Machine-readable degradation: gps-disabled, permission-denied, storage-full, route-missing. */
    public String issue;
}
