package com.suntrail.threejs.data;

import android.content.Context;

import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;

/**
 * Base de données Room pour SunTrail 3D.
 * 
 * Contient :
 * - Table gps_points : points GPS enregistrés (architecture Single Source of Truth)
 * 
 * Version 1 : Création initiale
 */
@Database(entities = {GPSPoint.class}, version = 1, exportSchema = false)
public abstract class AppDatabase extends RoomDatabase {
    
    private static final String DATABASE_NAME = "suntrail_database";
    private static volatile AppDatabase INSTANCE;
    
    public abstract GPSPointDao gpsPointDao();
    
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
                    .fallbackToDestructiveMigration() // Recrée la BDD si schéma change
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
