package com.suntrail.threejs.data;

import android.content.Context;

import androidx.annotation.NonNull;
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
 * Version 1 : Création initiale
 * Version 2 : Ajout contrainte UNIQUE sur (course_id, timestamp) pour éviter les doublons
 */
@Database(entities = {GPSPoint.class}, version = 2, exportSchema = false)
public abstract class AppDatabase extends RoomDatabase {
    
    private static final String DATABASE_NAME = "suntrail_database";
    private static volatile AppDatabase INSTANCE;
    
    public abstract GPSPointDao gpsPointDao();
    
    /**
     * Migration 1→2 : Supprime les doublons avant d'ajouter la contrainte UNIQUE
     */
    static final Migration MIGRATION_1_2 = new Migration(1, 2) {
        @Override
        public void migrate(@NonNull SupportSQLiteDatabase database) {
            // 1. Créer une table temporaire avec les données uniques
            database.execSQL(
                "CREATE TABLE gps_points_temp AS " +
                "SELECT MIN(id) as id, course_id, lat, lon, alt, timestamp, accuracy " +
                "FROM gps_points " +
                "GROUP BY course_id, timestamp"
            );
            
            // 2. Supprimer l'ancienne table
            database.execSQL("DROP TABLE gps_points");
            
            // 3. Recréer la table avec la contrainte UNIQUE
            database.execSQL(
                "CREATE TABLE gps_points (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "course_id TEXT NOT NULL, " +
                "lat REAL NOT NULL, " +
                "lon REAL NOT NULL, " +
                "alt REAL NOT NULL, " +
                "timestamp INTEGER NOT NULL, " +
                "accuracy REAL NOT NULL, " +
                "UNIQUE(course_id, timestamp)" +
                ")"
            );
            
            // 4. Recréer les index
            database.execSQL(
                "CREATE INDEX index_gps_points_course_id_timestamp ON gps_points(course_id, timestamp)"
            );
            database.execSQL(
                "CREATE INDEX index_gps_points_timestamp ON gps_points(timestamp)"
            );
            
            // 5. Restaurer les données
            database.execSQL(
                "INSERT INTO gps_points (id, course_id, lat, lon, alt, timestamp, accuracy) " +
                "SELECT id, course_id, lat, lon, alt, timestamp, accuracy FROM gps_points_temp"
            );
            
            // 6. Supprimer la table temporaire
            database.execSQL("DROP TABLE gps_points_temp");
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
                    // fallbackToDestructiveMigration() supprimé - on veut préserver les données
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
        INSTANCE = null;
    }
}
