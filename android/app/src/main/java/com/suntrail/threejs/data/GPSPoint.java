package com.suntrail.threejs.data;

import androidx.room.ColumnInfo;
import androidx.room.Entity;
import androidx.room.Index;
import androidx.room.PrimaryKey;

/**
 * Entity Room représentant un point GPS enregistré.
 * 
 * Architecture: Single Source of Truth (v5.25.0)
 * - Seul le RecordingService natif écrit dans cette table
 * - Le JS lit uniquement via RecordingPlugin
 */
@Entity(
    tableName = "gps_points",
    indices = {
        @Index(value = {"course_id", "timestamp"}),
        @Index(value = {"timestamp"})
    }
)
public class GPSPoint {
    
    @PrimaryKey(autoGenerate = true)
    public long id;
    
    /**
     * Identifiant unique de la course/session d'enregistrement.
     * Généré au démarrage du REC par RecordingService.
     */
    @ColumnInfo(name = "course_id")
    public String courseId;
    
    @ColumnInfo(name = "lat")
    public double lat;
    
    @ColumnInfo(name = "lon")
    public double lon;
    
    @ColumnInfo(name = "alt")
    public double alt;
    
    /**
     * Timestamp GPS en millisecondes (temps atomique satellite).
     * Ne pas confondre avec l'heure système du téléphone.
     */
    @ColumnInfo(name = "timestamp")
    public long timestamp;
    
    /**
     * Précision du point en mètres (accuracy de Location.getAccuracy()).
     */
    @ColumnInfo(name = "accuracy")
    public float accuracy;
    
    public GPSPoint() {
        // Required by Room
    }
    
    public GPSPoint(String courseId, double lat, double lon, double alt, 
                    long timestamp, float accuracy) {
        this.courseId = courseId;
        this.lat = lat;
        this.lon = lon;
        this.alt = alt;
        this.timestamp = timestamp;
        this.accuracy = accuracy;
    }
}
