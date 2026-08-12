package com.suntrail.threejs.data;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;
import androidx.room.Transaction;

@Dao
public interface GuidanceDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void upsertRoute(ActiveGuidanceRoute route);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void upsertSession(GuidanceSession session);

    @Query("SELECT * FROM active_guidance_route WHERE id = 1")
    ActiveGuidanceRoute getActiveRoute();

    @Query("SELECT * FROM guidance_session WHERE id = 1")
    GuidanceSession getActiveSession();

    @Query("DELETE FROM active_guidance_route")
    void deleteActiveRoute();

    @Query("DELETE FROM guidance_session")
    void deleteActiveSession();

    @Transaction
    default void replaceGuidance(ActiveGuidanceRoute route, GuidanceSession session) {
        upsertRoute(route);
        upsertSession(session);
    }

    @Transaction
    default void clearGuidance() {
        deleteActiveSession();
        deleteActiveRoute();
    }
}
