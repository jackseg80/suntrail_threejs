package com.suntrail.threejs.data;

import android.content.Context;

import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;
import androidx.room.migration.Migration;
import androidx.sqlite.db.SupportSQLiteDatabase;

/**
 * Base de données Room pour SunTrail 3D.
 * 
 * Contient :
 * - Table gps_points : points GPS enregistrés (architecture Single Source of Truth)
 * 
 * Version 1 : Création initiale gps_points.
 * Version 2 : Route active et session terrain natives, migration additive v5.85.
 */
@Database(
    entities = {GPSPoint.class, ActiveGuidanceRoute.class, GuidanceSession.class},
    version = 2,
    exportSchema = true
)
public abstract class AppDatabase extends RoomDatabase {
    
    private static final String DATABASE_NAME = "suntrail_database";
    private static volatile AppDatabase INSTANCE;
    
    public abstract GPSPointDao gpsPointDao();
    public abstract GuidanceDao guidanceDao();

    public static final Migration MIGRATION_1_2 = new Migration(1, 2) {
        @Override
        public void migrate(SupportSQLiteDatabase database) {
            database.execSQL(
                "CREATE TABLE IF NOT EXISTS `active_guidance_route` (" +
                    "`id` INTEGER NOT NULL, `route_id` TEXT NOT NULL, " +
                    "`geometry_json` TEXT NOT NULL, `cues_json` TEXT NOT NULL, " +
                    "`geometry_fingerprint` TEXT, `planned_pace_kmh` REAL NOT NULL, " +
                    "`created_at` INTEGER NOT NULL, `updated_at` INTEGER NOT NULL, " +
                    "PRIMARY KEY(`id`))"
            );
            database.execSQL(
                "CREATE UNIQUE INDEX IF NOT EXISTS `index_active_guidance_route_route_id` " +
                    "ON `active_guidance_route` (`route_id`)"
            );
            database.execSQL(
                "CREATE TABLE IF NOT EXISTS `guidance_session` (" +
                    "`id` INTEGER NOT NULL, `mode` TEXT NOT NULL, `route_id` TEXT, " +
                    "`status` TEXT NOT NULL, `recording_course_id` TEXT, " +
                    "`progress_meters` REAL NOT NULL, `remaining_meters` REAL NOT NULL, " +
                    "`cross_track_meters` REAL NOT NULL, `eta_epoch_ms` INTEGER, " +
                    "`bearing` REAL, `next_cue_json` TEXT, " +
                    "`distance_to_next_cue_meters` REAL, `accuracy_meters` REAL, " +
                    "`position_age_ms` INTEGER, `updated_at` INTEGER NOT NULL, " +
                    "`last_position_lat` REAL, `last_position_lon` REAL, " +
                    "`last_position_accuracy` REAL, `last_position_timestamp` INTEGER, " +
                    "`last_projected_lat` REAL, `last_projected_lon` REAL, " +
                    "`current_segment_index` INTEGER NOT NULL, `good_sample_count` INTEGER NOT NULL, " +
                    "`off_route_since` INTEGER, `recovery_since` INTEGER, `recovered_at` INTEGER, " +
                    "`arrival_since` INTEGER, `last_off_route_alert_at` INTEGER, `issue` TEXT, " +
                    "PRIMARY KEY(`id`))"
            );
        }
    };
    
    /**
     * Singleton thread-safe pour accéder à la base de données.
     */
    public static AppDatabase getInstance(Context context) {
        if (INSTANCE == null) {
            synchronized (AppDatabase.class) {
                if (INSTANCE == null) {
                    INSTANCE = Room.databaseBuilder(
                        context.getApplicationContext(),
                        AppDatabase.class,
                        DATABASE_NAME
                    )
                    .addMigrations(MIGRATION_1_2)
                    .enableMultiInstanceInvalidation() // Synchronisation cross-processus (:tracking ↔ principal)
                    .build();
                }
            }
        }
        return INSTANCE;
    }
    
    /**
     * Pour les tests uniquement.
     */
    public static void destroyInstance() {
        if (INSTANCE != null) INSTANCE.close();
        INSTANCE = null;
    }
}
