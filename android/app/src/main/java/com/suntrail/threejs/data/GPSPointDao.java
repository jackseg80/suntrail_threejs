package com.suntrail.threejs.data;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;

import java.util.List;

/**
 * DAO pour accéder aux points GPS enregistrés.
 * 
 * Toutes les requêtes sont synchrones ( Room gère le threading dans RecordingPlugin).
 */
@Dao
public interface GPSPointDao {
    
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    void insert(GPSPoint point);
    
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    void insertAll(List<GPSPoint> points);
    
    /**
     * Récupère tous les points d'une course, triés par timestamp.
     */
    @Query("SELECT * FROM gps_points WHERE course_id = :courseId ORDER BY timestamp ASC")
    List<GPSPoint> getPointsForCourse(String courseId);
    
    /**
     * Récupère les points d'une course depuis un timestamp donné.
     * Utile pour le polling incrémental côté JS.
     */
    @Query("SELECT * FROM gps_points WHERE course_id = :courseId AND timestamp > :since ORDER BY timestamp ASC")
    List<GPSPoint> getPointsSince(String courseId, long since);
    
    /**
     * Récupère les N derniers points d'une course.
     * Utile pour l'affichage en temps réel sans charger toute l'historique.
     */
    @Query("SELECT * FROM gps_points WHERE course_id = :courseId ORDER BY timestamp DESC LIMIT :limit")
    List<GPSPoint> getLastPoints(String courseId, int limit);
    
    /**
     * Compte le nombre de points dans une course.
     */
    @Query("SELECT COUNT(*) FROM gps_points WHERE course_id = :courseId")
    int getPointCount(String courseId);
    
    /**
     * Supprime tous les points d'une course (quand l'utilisateur arrête le REC).
     */
    @Query("DELETE FROM gps_points WHERE course_id = :courseId")
    void deleteCourse(String courseId);
    
    /**
     * Récupère le dernier point enregistré d'une course.
     * Utile pour le calcul de vitesse.
     */
    @Query("SELECT * FROM gps_points WHERE course_id = :courseId ORDER BY timestamp DESC LIMIT 1")
    GPSPoint getLastPoint(String courseId);
    
    /**
     * Supprime toutes les données (nettoyage complet).
     */
    @Query("DELETE FROM gps_points")
    void deleteAll();
}
