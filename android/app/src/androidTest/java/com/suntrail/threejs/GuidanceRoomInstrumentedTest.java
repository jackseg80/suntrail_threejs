package com.suntrail.threejs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import androidx.room.Room;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.suntrail.threejs.data.ActiveGuidanceRoute;
import com.suntrail.threejs.data.AppDatabase;
import com.suntrail.threejs.data.GuidanceDao;
import com.suntrail.threejs.data.GuidanceSession;
import com.suntrail.threejs.guidance.GuidanceRouteCodec;

import org.json.JSONException;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class GuidanceRoomInstrumentedTest {
    private AppDatabase database;

    @After public void close() { if (database != null) database.close(); }

    @Test
    public void crudRecoveryAndControlledDeletionAreAtomic() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(), AppDatabase.class).allowMainThreadQueries().build();
        GuidanceDao dao = database.guidanceDao();
        ActiveGuidanceRoute route = validRoute("route-crud");
        GuidanceSession session = new GuidanceSession();
        session.mode = "guidance";
        session.routeId = route.routeId;
        session.status = "recovered";
        session.progressMeters = 123.4;
        session.updatedAt = 1_800_000_000_000L;
        dao.replaceGuidance(route, session);

        assertEquals("route-crud", dao.getActiveRoute().routeId);
        assertEquals(123.4, dao.getActiveSession().progressMeters, 0.001);
        assertEquals("recovered", dao.getActiveSession().status);
        dao.clearGuidance();
        assertNull(dao.getActiveRoute());
        assertNull(dao.getActiveSession());
    }

    @Test
    public void migratesARealV1DatabaseWithoutLosingGpsTable() {
        Context context = ApplicationProvider.getApplicationContext();
        String name = "migration-v1-v2-" + System.nanoTime() + ".db";
        SQLiteDatabase legacy = context.openOrCreateDatabase(name, Context.MODE_PRIVATE, null);
        legacy.execSQL("CREATE TABLE gps_points (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, course_id TEXT, lat REAL NOT NULL, lon REAL NOT NULL, alt REAL NOT NULL, timestamp INTEGER NOT NULL, accuracy REAL NOT NULL)");
        legacy.execSQL("CREATE INDEX index_gps_points_course_id_timestamp ON gps_points(course_id, timestamp)");
        legacy.execSQL("CREATE INDEX index_gps_points_timestamp ON gps_points(timestamp)");
        legacy.execSQL("INSERT INTO gps_points(course_id,lat,lon,alt,timestamp,accuracy) VALUES('legacy',46,7,500,123,5)");
        legacy.setVersion(1);
        legacy.close();

        database = Room.databaseBuilder(context, AppDatabase.class, name)
            .addMigrations(AppDatabase.MIGRATION_1_2).allowMainThreadQueries().build();
        assertEquals(1, database.gpsPointDao().getPointCount("legacy"));
        database.guidanceDao().replaceGuidance(validRoute("migrated"), new GuidanceSession());
        assertNotNull(database.guidanceDao().getActiveRoute());
        database.close();
        database = null;
        context.deleteDatabase(name);
    }

    @Test
    public void corruptedRouteIsRejectedAndCanBeCleared() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(), AppDatabase.class).allowMainThreadQueries().build();
        ActiveGuidanceRoute route = validRoute("corrupt");
        route.geometryJson = "[{\"lat\":999,\"lon\":7}]";
        GuidanceSession session = new GuidanceSession();
        session.mode = "guidance";
        session.routeId = route.routeId;
        database.guidanceDao().replaceGuidance(route, session);
        try {
            GuidanceRouteCodec.parseGeometry(database.guidanceDao().getActiveRoute().geometryJson);
            throw new AssertionError("Corrupt geometry must fail closed");
        } catch (JSONException expected) {
            database.guidanceDao().clearGuidance();
        }
        assertNull(database.guidanceDao().getActiveRoute());
        assertNull(database.guidanceDao().getActiveSession());
    }

    private static ActiveGuidanceRoute validRoute(String id) {
        ActiveGuidanceRoute route = new ActiveGuidanceRoute();
        route.routeId = id;
        route.geometryJson = "[{\"lat\":46,\"lon\":7,\"ele\":500},{\"lat\":46,\"lon\":7.001,\"ele\":510}]";
        route.cuesJson = "[]";
        route.plannedPaceKmh = 4;
        route.createdAt = 1;
        route.updatedAt = 1;
        return route;
    }
}
