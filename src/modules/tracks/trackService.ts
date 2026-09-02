import { eventBus } from '../eventBus';
import { loadHistory, type GPXHistoryEntry } from '../gpxHistoryService';
import type { NativeGPSPoint } from '../nativeGPSService';
import type { GPXLayer } from '../state';
import { calculateTrackStats } from '../geoStats';
import type { LocationPoint } from '../geo';
import { normalizeTrackName } from '../trackName';
import { TrackRepository, TrackRepositoryError } from './TrackRepository';
import {
    STORED_TRACK_SCHEMA_VERSION,
    computeTrackBounds,
    createStoredTrackFromLayer,
    createStoredTrackFromLegacy,
    StoredTrackValidationError,
    type StoredTrackV1,
} from './storedTrack';

const LEGACY_MIGRATION_META_KEY = 'legacy-localstorage-migration-v1';

interface LegacyMigrationState {
    version: 1;
    completedIds: string[];
    failedIds: string[];
    completed: boolean;
}

export class TrackService {
    private repository: TrackRepository | null;
    private tracks: StoredTrackV1[] = [];
    private lastError: TrackRepositoryError | null = null;

    constructor(repository?: TrackRepository) {
        this.repository = repository ?? null;
    }

    public getCachedTracks(): StoredTrackV1[] {
        return this.tracks.map((track) => ({
            ...track,
            origin: { ...track.origin },
            ...(track.place ? { place: { ...track.place } } : {}),
            geometry: track.geometry.map((point) => ({ ...point })),
            stats: { ...track.stats },
            bounds: { ...track.bounds },
            quality: { ...track.quality },
        }));
    }

    public getLastError(): TrackRepositoryError | null {
        return this.lastError;
    }

    public async initialize(): Promise<void> {
        try {
            await this.getRepository().open();
            await this.migrateLegacy(loadHistory());
            await this.refresh();
        } catch (error) {
            this.captureError(error);
            eventBus.emit('tracksUpdated');
        }
    }

    public async refresh(): Promise<StoredTrackV1[]> {
        try {
            this.tracks = await this.getRepository().list();
            this.lastError = null;
            eventBus.emit('tracksUpdated');
            return this.getCachedTracks();
        } catch (error) {
            this.captureError(error);
            eventBus.emit('tracksUpdated');
            throw error;
        }
    }

    public async get(id: string): Promise<StoredTrackV1 | null> {
        return this.getRepository().get(id);
    }

    public async archiveImport(layer: GPXLayer): Promise<StoredTrackV1> {
        const track = createStoredTrackFromLayer(layer, {
            origin: 'gpx-import',
        });
        await this.save(track);
        return track;
    }

    public async archiveWebRecording(layer: GPXLayer): Promise<StoredTrackV1> {
        const track = createStoredTrackFromLayer(layer, {
            origin: 'recording',
        });
        await this.save(track);
        return track;
    }

    public async archiveRecording(
        name: string,
        courseId: string,
        rawPoints: NativeGPSPoint[],
        color = '#ef4444'
    ): Promise<StoredTrackV1> {
        if (!courseId || rawPoints.length < 2) {
            throw new TrackRepositoryError(
                'transaction',
                'A recording needs a stable course identity and two points.'
            );
        }
        const geometry = rawPoints.map((point) => ({
            lat: point.lat,
            lon: point.lon,
            ele: point.alt,
            timestamp: point.timestamp,
            accuracy: point.accuracy,
        }));
        const stats = calculateTrackStats(
            rawPoints.map((point) => ({
                lat: point.lat,
                lon: point.lon,
                alt: point.alt,
                timestamp: point.timestamp,
            }))
        );
        const createdAt = new Date(geometry[0].timestamp).toISOString();
        const updatedAt = new Date(
            geometry[geometry.length - 1].timestamp
        ).toISOString();
        const track: StoredTrackV1 = {
            schemaVersion: STORED_TRACK_SCHEMA_VERSION,
            id: `recording:${courseId}`,
            origin: { type: 'recording', sourceId: courseId },
            name: normalizeTrackName(name),
            color,
            geometry,
            stats: {
                distanceKm: stats.distance,
                ascentMeters: stats.dPlus,
                descentMeters: stats.dMinus,
                durationSeconds:
                    (geometry[geometry.length - 1].timestamp -
                        geometry[0].timestamp) /
                    1000,
                pointCount: geometry.length,
                provenance: 'recording',
            },
            bounds: computeTrackBounds(geometry),
            quality: {
                geometry: 'full',
                timing: 'full',
                elevation: 'full',
                accuracy: 'full',
            },
            createdAt,
            updatedAt,
        };
        await this.save(track);
        return track;
    }

    public async archiveRecoveredRecording(
        name: string,
        courseId: string,
        points: LocationPoint[],
        color = '#ef4444'
    ): Promise<StoredTrackV1> {
        const geometry = points.map((point) => ({
            lat: point.lat,
            lon: point.lon,
            ele: point.alt,
            timestamp: point.timestamp,
        }));
        if (!courseId || geometry.length < 2) {
            throw new TrackRepositoryError(
                'transaction',
                'Recovered recording identity is incomplete.'
            );
        }
        const stats = calculateTrackStats(points);
        const track: StoredTrackV1 = {
            schemaVersion: STORED_TRACK_SCHEMA_VERSION,
            id: `recording:${courseId}`,
            origin: { type: 'recording', sourceId: courseId },
            name: normalizeTrackName(name),
            color,
            geometry,
            stats: {
                distanceKm: stats.distance,
                ascentMeters: stats.dPlus,
                descentMeters: stats.dMinus,
                durationSeconds:
                    (geometry[geometry.length - 1].timestamp -
                        geometry[0].timestamp) /
                    1000,
                pointCount: geometry.length,
                provenance: 'derived',
            },
            bounds: computeTrackBounds(geometry),
            quality: {
                geometry: 'approximate',
                timing: 'full',
                elevation: 'full',
                accuracy: 'unknown',
            },
            createdAt: new Date(geometry[0].timestamp).toISOString(),
            updatedAt: new Date(
                geometry[geometry.length - 1].timestamp
            ).toISOString(),
        };
        await this.save(track);
        return track;
    }

    public async rename(id: string, name: string): Promise<StoredTrackV1> {
        const updated = await this.getRepository().rename(
            id,
            normalizeTrackName(name)
        );
        await this.refresh();
        return updated;
    }

    public async updatePlace(
        id: string,
        place: { locationName?: string; countryName?: string }
    ): Promise<void> {
        const current = await this.getRepository().get(id);
        if (!current) return;
        await this.getRepository().save({
            ...current,
            place: { ...current.place, ...place },
            updatedAt: new Date().toISOString(),
        });
        await this.refresh();
    }

    public async delete(id: string): Promise<void> {
        await this.getRepository().delete(id);
        await this.refresh();
    }

    /**
     * Copy-first, resumable migration. The old localStorage value stays intact
     * for rollback to the previous client; only the IndexedDB marker changes.
     */
    public async migrateLegacy(entries: GPXHistoryEntry[]): Promise<void> {
        const saved = await this.getRepository().getMeta<LegacyMigrationState>(
            LEGACY_MIGRATION_META_KEY
        );
        const completedIds = new Set(saved?.completedIds ?? []);
        const failedIds = new Set<string>();
        for (const entry of entries) {
            if (completedIds.has(entry.id)) continue;
            try {
                await this.getRepository().save(
                    createStoredTrackFromLegacy(entry)
                );
            } catch (error) {
                if (error instanceof StoredTrackValidationError) {
                    failedIds.add(entry.id || 'unknown');
                    await this.getRepository().setMeta(
                        LEGACY_MIGRATION_META_KEY,
                        {
                            version: 1,
                            completedIds: [...completedIds],
                            failedIds: [...failedIds],
                            completed: false,
                        } satisfies LegacyMigrationState
                    );
                    continue;
                }
                throw error;
            }
            completedIds.add(entry.id);
            await this.getRepository().setMeta(LEGACY_MIGRATION_META_KEY, {
                version: 1,
                completedIds: [...completedIds],
                failedIds: [...failedIds],
                completed: false,
            } satisfies LegacyMigrationState);
        }
        await this.getRepository().setMeta(LEGACY_MIGRATION_META_KEY, {
            version: 1,
            completedIds: [...completedIds],
            failedIds: [...failedIds],
            completed: failedIds.size === 0,
        } satisfies LegacyMigrationState);
    }

    public async close(): Promise<void> {
        await this.repository?.close();
    }

    private async save(track: StoredTrackV1): Promise<void> {
        try {
            await this.getRepository().save(track);
            await this.refresh();
        } catch (error) {
            this.captureError(error);
            throw error;
        }
    }

    private getRepository(): TrackRepository {
        if (this.repository) return this.repository;
        if (!globalThis.indexedDB) {
            throw new TrackRepositoryError(
                'unavailable',
                'IndexedDB is unavailable on this device.'
            );
        }
        this.repository = new TrackRepository(globalThis.indexedDB);
        return this.repository;
    }

    private captureError(error: unknown): void {
        this.lastError =
            error instanceof TrackRepositoryError
                ? error
                : new TrackRepositoryError(
                      'unknown',
                      error instanceof Error
                          ? error.message
                          : 'Track storage error',
                      error
                  );
    }
}

export const trackService = new TrackService();
