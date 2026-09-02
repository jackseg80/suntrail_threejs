import {
    validateStoredTrack,
    type StoredTrackPointV1,
    type StoredTrackV1,
} from './storedTrack';

export const TRACK_DATABASE_NAME = 'suntrail-tracks';
export const TRACK_DATABASE_VERSION = 1;
export const TRACK_STORE_NAME = 'tracks';
export const TRACK_CHUNK_STORE_NAME = 'trackChunks';
export const TRACK_META_STORE_NAME = 'meta';
export const TRACK_CHUNK_SIZE = 1000;

export type TrackRepositoryErrorCode =
    | 'unavailable'
    | 'quota'
    | 'corrupt-record'
    | 'blocked'
    | 'transaction'
    | 'unknown-version'
    | 'unknown';

export class TrackRepositoryError extends Error {
    constructor(
        public readonly code: TrackRepositoryErrorCode,
        message: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'TrackRepositoryError';
    }
}

interface StoredTrackHeader extends Omit<StoredTrackV1, 'geometry'> {
    chunkCount: number;
}

interface StoredTrackChunk {
    id: string;
    trackId: string;
    index: number;
    points: StoredTrackPointV1[];
}

export interface TrackRepositoryDiagnostics {
    corruptedIds: string[];
    unknownVersionIds: string[];
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
    });
}

function normalizeRepositoryError(error: unknown): TrackRepositoryError {
    if (error instanceof TrackRepositoryError) return error;
    const name = error instanceof Error ? error.name : '';
    if (name === 'QuotaExceededError') {
        return new TrackRepositoryError(
            'quota',
            'Le stockage local est plein. La trace en cours est conservée pour récupération.',
            error
        );
    }
    if (name === 'AbortError' || name === 'TransactionInactiveError') {
        return new TrackRepositoryError(
            'transaction',
            'La transaction de trace a été interrompue.',
            error
        );
    }
    if (name === 'VersionError') {
        return new TrackRepositoryError(
            'unknown-version',
            'La base de traces provient d’une version plus récente.',
            error
        );
    }
    return new TrackRepositoryError(
        'unknown',
        error instanceof Error ? error.message : 'IndexedDB track error',
        error
    );
}

function chunkId(trackId: string, index: number): string {
    return `${trackId}:${String(index).padStart(8, '0')}`;
}

export class TrackRepository {
    private databasePromise: Promise<IDBDatabase> | null = null;
    private diagnostics: TrackRepositoryDiagnostics = {
        corruptedIds: [],
        unknownVersionIds: [],
    };

    constructor(
        private readonly factory: IDBFactory,
        private readonly databaseName = TRACK_DATABASE_NAME
    ) {
        if (!factory) {
            throw new TrackRepositoryError(
                'unavailable',
                'IndexedDB is unavailable on this device.'
            );
        }
    }

    public getDiagnostics(): TrackRepositoryDiagnostics {
        return {
            corruptedIds: [...this.diagnostics.corruptedIds],
            unknownVersionIds: [...this.diagnostics.unknownVersionIds],
        };
    }

    public async open(): Promise<void> {
        await this.getDatabase();
    }

    public async list(): Promise<StoredTrackV1[]> {
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                [TRACK_STORE_NAME, TRACK_CHUNK_STORE_NAME],
                'readonly'
            );
            const completed = transactionComplete(transaction);
            const [headers, chunks] = await Promise.all([
                requestResult<StoredTrackHeader[]>(
                    transaction.objectStore(TRACK_STORE_NAME).getAll()
                ),
                requestResult<StoredTrackChunk[]>(
                    transaction.objectStore(TRACK_CHUNK_STORE_NAME).getAll()
                ),
            ]);
            await completed;
            const chunksByTrack = new Map<string, StoredTrackChunk[]>();
            for (const chunk of chunks) {
                const current = chunksByTrack.get(chunk.trackId) ?? [];
                current.push(chunk);
                chunksByTrack.set(chunk.trackId, current);
            }
            const valid: StoredTrackV1[] = [];
            const corruptedIds: string[] = [];
            const unknownVersionIds: string[] = [];
            for (const header of headers) {
                try {
                    valid.push(
                        this.hydrate(header, chunksByTrack.get(header.id) ?? [])
                    );
                } catch (error) {
                    if (
                        error instanceof TrackRepositoryError &&
                        error.code === 'unknown-version'
                    ) {
                        unknownVersionIds.push(header.id);
                    } else {
                        corruptedIds.push(header.id || 'unknown');
                    }
                }
            }
            this.diagnostics = { corruptedIds, unknownVersionIds };
            return valid.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        } catch (error) {
            throw normalizeRepositoryError(error);
        }
    }

    public async get(id: string): Promise<StoredTrackV1 | null> {
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                [TRACK_STORE_NAME, TRACK_CHUNK_STORE_NAME],
                'readonly'
            );
            const completed = transactionComplete(transaction);
            const [header, chunks] = await Promise.all([
                requestResult<StoredTrackHeader | undefined>(
                    transaction.objectStore(TRACK_STORE_NAME).get(id)
                ),
                requestResult<StoredTrackChunk[]>(
                    transaction
                        .objectStore(TRACK_CHUNK_STORE_NAME)
                        .index('trackId')
                        .getAll(id)
                ),
            ]);
            await completed;
            if (!header) return null;
            return this.hydrate(header, chunks);
        } catch (error) {
            throw normalizeRepositoryError(error);
        }
    }

    public async save(track: StoredTrackV1): Promise<void> {
        const validated = validateStoredTrack(track);
        const chunks: StoredTrackChunk[] = [];
        for (
            let offset = 0, index = 0;
            offset < validated.geometry.length;
            offset += TRACK_CHUNK_SIZE, index++
        ) {
            chunks.push({
                id: chunkId(validated.id, index),
                trackId: validated.id,
                index,
                points: validated.geometry
                    .slice(offset, offset + TRACK_CHUNK_SIZE)
                    .map((point) => ({ ...point })),
            });
        }
        const { geometry: _geometry, ...metadata } = validated;
        const header: StoredTrackHeader = {
            ...metadata,
            chunkCount: chunks.length,
        };
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                [TRACK_STORE_NAME, TRACK_CHUNK_STORE_NAME],
                'readwrite'
            );
            const completed = transactionComplete(transaction);
            try {
                const chunkStore = transaction.objectStore(
                    TRACK_CHUNK_STORE_NAME
                );
                const existingKeys = await requestResult(
                    chunkStore.index('trackId').getAllKeys(validated.id)
                );
                for (const key of existingKeys) chunkStore.delete(key);
                transaction.objectStore(TRACK_STORE_NAME).put(header);
                for (const chunk of chunks) chunkStore.put(chunk);
                await completed;
            } catch (error) {
                try {
                    transaction.abort();
                } catch {
                    // The transaction may already have aborted.
                }
                await completed.catch(() => undefined);
                throw error;
            }
        } catch (error) {
            throw normalizeRepositoryError(error);
        }
    }

    public async rename(id: string, name: string): Promise<StoredTrackV1> {
        const track = await this.get(id);
        if (!track) {
            throw new TrackRepositoryError(
                'corrupt-record',
                `La trace ${id} est introuvable.`
            );
        }
        const updated = {
            ...track,
            name: name.trim(),
            updatedAt: new Date().toISOString(),
        };
        await this.save(updated);
        return updated;
    }

    public async delete(id: string): Promise<void> {
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                [TRACK_STORE_NAME, TRACK_CHUNK_STORE_NAME],
                'readwrite'
            );
            const completed = transactionComplete(transaction);
            transaction.objectStore(TRACK_STORE_NAME).delete(id);
            const chunkStore = transaction.objectStore(TRACK_CHUNK_STORE_NAME);
            const keys = await requestResult(
                chunkStore.index('trackId').getAllKeys(id)
            );
            for (const key of keys) chunkStore.delete(key);
            await completed;
        } catch (error) {
            throw normalizeRepositoryError(error);
        }
    }

    public async getMeta<T>(key: string): Promise<T | undefined> {
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                TRACK_META_STORE_NAME,
                'readonly'
            );
            const completed = transactionComplete(transaction);
            const record = await requestResult<{ key: string; value: T }>(
                transaction.objectStore(TRACK_META_STORE_NAME).get(key)
            );
            await completed;
            return record?.value;
        } catch (error) {
            throw normalizeRepositoryError(error);
        }
    }

    public async setMeta(key: string, value: unknown): Promise<void> {
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                TRACK_META_STORE_NAME,
                'readwrite'
            );
            const completed = transactionComplete(transaction);
            transaction.objectStore(TRACK_META_STORE_NAME).put({ key, value });
            await completed;
        } catch (error) {
            throw normalizeRepositoryError(error);
        }
    }

    public async close(): Promise<void> {
        if (!this.databasePromise) return;
        try {
            (await this.databasePromise).close();
        } finally {
            this.databasePromise = null;
        }
    }

    private hydrate(
        header: StoredTrackHeader,
        chunks: StoredTrackChunk[]
    ): StoredTrackV1 {
        if (header.schemaVersion !== 1) {
            throw new TrackRepositoryError(
                'unknown-version',
                `Version de trace inconnue pour ${header.id}.`
            );
        }
        const ordered = [...chunks].sort((a, b) => a.index - b.index);
        if (
            ordered.length !== header.chunkCount ||
            ordered.some((chunk, index) => chunk.index !== index)
        ) {
            throw new TrackRepositoryError(
                'corrupt-record',
                `Les blocs de la trace ${header.id} sont incomplets.`
            );
        }
        const { chunkCount: _chunkCount, ...metadata } = header;
        try {
            return validateStoredTrack({
                ...metadata,
                geometry: ordered.flatMap((chunk) =>
                    chunk.points.map((point) => ({ ...point }))
                ),
            });
        } catch (error) {
            throw new TrackRepositoryError(
                'corrupt-record',
                `La trace ${header.id} est illisible.`,
                error
            );
        }
    }

    private getDatabase(): Promise<IDBDatabase> {
        if (!this.databasePromise) {
            this.databasePromise = new Promise((resolve, reject) => {
                let settled = false;
                const request = this.factory.open(
                    this.databaseName,
                    TRACK_DATABASE_VERSION
                );
                request.onupgradeneeded = () => {
                    const database = request.result;
                    const tracks = database.createObjectStore(
                        TRACK_STORE_NAME,
                        { keyPath: 'id' }
                    );
                    tracks.createIndex('updatedAt', 'updatedAt');
                    tracks.createIndex('originType', 'origin.type');
                    const chunks = database.createObjectStore(
                        TRACK_CHUNK_STORE_NAME,
                        { keyPath: 'id' }
                    );
                    chunks.createIndex('trackId', 'trackId');
                    database.createObjectStore(TRACK_META_STORE_NAME, {
                        keyPath: 'key',
                    });
                };
                request.onsuccess = () => {
                    settled = true;
                    const database = request.result;
                    database.onversionchange = () => {
                        database.close();
                        this.databasePromise = null;
                    };
                    resolve(database);
                };
                request.onerror = () => {
                    settled = true;
                    this.databasePromise = null;
                    reject(normalizeRepositoryError(request.error));
                };
                request.onblocked = () => {
                    if (settled) return;
                    settled = true;
                    this.databasePromise = null;
                    reject(
                        new TrackRepositoryError(
                            'blocked',
                            'Fermez les autres onglets SunTrail pour terminer la mise à niveau du stockage.'
                        )
                    );
                };
            });
        }
        return this.databasePromise;
    }
}
