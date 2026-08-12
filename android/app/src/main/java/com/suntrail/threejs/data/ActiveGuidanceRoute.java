package com.suntrail.threejs.data;

import androidx.annotation.NonNull;
import androidx.room.ColumnInfo;
import androidx.room.Entity;
import androidx.room.Index;
import androidx.room.PrimaryKey;

/**
 * Copie native immuable de la route utilisée par le guidage actif.
 *
 * La géométrie et les cues sont validés par le bridge avant insertion. Cette table ne modifie
 * jamais PreparedRouteV1 : elle en conserve uniquement une copie JSON adaptée au processus
 * :tracking et au redémarrage hors WebView.
 */
@Entity(
    tableName = "active_guidance_route",
    indices = {@Index(value = {"route_id"}, unique = true)}
)
public class ActiveGuidanceRoute {

    public static final int SINGLETON_ID = 1;

    @PrimaryKey
    public int id = SINGLETON_ID;

    @NonNull
    @ColumnInfo(name = "route_id")
    public String routeId = "";

    @NonNull
    @ColumnInfo(name = "geometry_json")
    public String geometryJson = "[]";

    @NonNull
    @ColumnInfo(name = "cues_json")
    public String cuesJson = "[]";

    @ColumnInfo(name = "geometry_fingerprint")
    public String geometryFingerprint;

    @ColumnInfo(name = "planned_pace_kmh")
    public double plannedPaceKmh = 4.0;

    @ColumnInfo(name = "created_at")
    public long createdAt;

    @ColumnInfo(name = "updated_at")
    public long updatedAt;
}
