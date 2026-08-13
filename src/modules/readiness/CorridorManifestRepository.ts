import type {
    CorridorDownloadResource,
    CorridorDownloadStatus,
} from './routeCorridorDownload';

export const CORRIDOR_DATABASE_NAME = 'suntrail-route-corridors';
export const CORRIDOR_DATABASE_VERSION = 1;
export const CORRIDOR_MANIFEST_STORE_NAME = 'manifests';

export type CorridorManifestStatus = 'downloading' | CorridorDownloadStatus;
export type CorridorEntitlement = 'free' | 'pro';
export type CorridorResourceState = 'pending' | 'available' | 'failed';

export interface CorridorManifestResourceV1 extends CorridorDownloadResource {
    state: CorridorResourceState;
    sizeBytes: number;
    /** Ressource créée par un corridor et supprimable après la dernière référence. */
    managed: boolean;
}

export interface CorridorManifestV1 {
    schemaVersion: 1;
    id: string;
    routeId: string;
    entitlement: CorridorEntitlement;
    active: boolean;
    radiusMeters: 500 | 1_000 | 2_000;
    minLod: number;
    maxLod: number;
    status: CorridorManifestStatus;
    createdAt: string;
    updatedAt: string;
    processedResourceCount: number;
    successfulResourceCount: number;
    failedResourceCount: number;
    totalResourceCount: number;
    sizeBytes: number;
    resources: CorridorManifestResourceV1[];
}

export type CorridorManifestRepositoryErrorCode =
    | 'unavailable'
    | 'quota'
    | 'corrupt-record'
    | 'blocked'
    | 'transaction'
    | 'unknown';

export class CorridorManifestRepositoryError extends Error {
    constructor(
        public readonly code: CorridorManifestRepositoryErrorCode,
        message: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'CorridorManifestRepositoryError';
    }
}

export interface CorridorManifestStore {
    list(): Promise<CorridorManifestV1[]>;
    get(id: string): Promise<CorridorManifestV1 | null>;
    save(manifest: CorridorManifestV1): Promise<void>;
    applyChanges(
        upserts: CorridorManifestV1[],
        deleteIds: string[]
    ): Promise<void>;
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

function normalizeError(error: unknown): CorridorManifestRepositoryError {
    if (error instanceof CorridorManifestRepositoryError) return error;
    const name = error instanceof Error ? error.name : '';
    if (name === 'QuotaExceededError') {
        return new CorridorManifestRepositoryError(
            'quota',
            'Le stockage disponible est insuffisant pour le manifeste du corridor.',
            error
        );
    }
    if (name === 'AbortError' || name === 'TransactionInactiveError') {
        return new CorridorManifestRepositoryError(
            'transaction',
            'La transaction du manifeste corridor a été interrompue.',
            error
        );
    }
    return new CorridorManifestRepositoryError(
        'unknown',
        error instanceof Error ? error.message : 'IndexedDB corridor error',
        error
    );
}

function isIsoDate(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        !Number.isNaN(Date.parse(value))
    );
}

function isResource(value: unknown): value is CorridorManifestResourceV1 {
    if (typeof value !== 'object' || value === null) return false;
    const resource = value as Partial<CorridorManifestResourceV1>;
    return (
        Number.isInteger(resource.zoom) &&
        Number.isInteger(resource.tx) &&
        Number.isInteger(resource.ty) &&
        (resource.type === 'color' ||
            resource.type === 'elevation' ||
            resource.type === 'overlay') &&
        typeof resource.url === 'string' &&
        resource.url.length > 0 &&
        (resource.state === 'pending' ||
            resource.state === 'available' ||
            resource.state === 'failed') &&
        Number.isFinite(resource.sizeBytes) &&
        resource.sizeBytes! >= 0 &&
        typeof resource.managed === 'boolean'
    );
}

export function validateCorridorManifest(value: unknown): CorridorManifestV1 {
    if (typeof value !== 'object' || value === null) {
        throw new CorridorManifestRepositoryError(
            'corrupt-record',
            'Manifeste corridor illisible.'
        );
    }
    const manifest = value as Partial<CorridorManifestV1>;
    const statuses: CorridorManifestStatus[] = [
        'downloading',
        'completed',
        'partial',
        'cancelled',
    ];
    if (
        manifest.schemaVersion !== 1 ||
        typeof manifest.id !== 'string' ||
        !manifest.id ||
        typeof manifest.routeId !== 'string' ||
        !manifest.routeId ||
        (manifest.entitlement !== 'free' && manifest.entitlement !== 'pro') ||
        typeof manifest.active !== 'boolean' ||
        ![500, 1_000, 2_000].includes(manifest.radiusMeters ?? -1) ||
        !Number.isInteger(manifest.minLod) ||
        !Number.isInteger(manifest.maxLod) ||
        manifest.minLod! > manifest.maxLod! ||
        !statuses.includes(manifest.status as CorridorManifestStatus) ||
        !isIsoDate(manifest.createdAt) ||
        !isIsoDate(manifest.updatedAt) ||
        !Number.isInteger(manifest.processedResourceCount) ||
        !Number.isInteger(manifest.successfulResourceCount) ||
        !Number.isInteger(manifest.failedResourceCount) ||
        !Number.isInteger(manifest.totalResourceCount) ||
        !Number.isFinite(manifest.sizeBytes) ||
        manifest.sizeBytes! < 0 ||
        !Array.isArray(manifest.resources) ||
        manifest.resources.length !== manifest.totalResourceCount ||
        !manifest.resources.every(isResource) ||
        manifest.processedResourceCount! !==
            manifest.successfulResourceCount! + manifest.failedResourceCount! ||
        manifest.processedResourceCount! > manifest.totalResourceCount!
    ) {
        throw new CorridorManifestRepositoryError(
            'corrupt-record',
            `Le manifeste corridor ${manifest.id ?? 'unknown'} est incohérent.`
        );
    }
    return structuredClone(manifest as CorridorManifestV1);
}

export class CorridorManifestRepository implements CorridorManifestStore {
    private databasePromise: Promise<IDBDatabase> | null = null;

    constructor(
        private readonly factory: IDBFactory,
        private readonly databaseName = CORRIDOR_DATABASE_NAME
    ) {
        if (!factory) {
            throw new CorridorManifestRepositoryError(
                'unavailable',
                'IndexedDB is unavailable on this device.'
            );
        }
    }

    public async list(): Promise<CorridorManifestV1[]> {
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                CORRIDOR_MANIFEST_STORE_NAME,
                'readonly'
            );
            const completed = transactionComplete(transaction);
            const records = await requestResult(
                transaction.objectStore(CORRIDOR_MANIFEST_STORE_NAME).getAll()
            );
            await completed;
            return records
                .map(validateCorridorManifest)
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        } catch (error) {
            throw normalizeError(error);
        }
    }

    public async get(id: string): Promise<CorridorManifestV1 | null> {
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                CORRIDOR_MANIFEST_STORE_NAME,
                'readonly'
            );
            const completed = transactionComplete(transaction);
            const record = await requestResult(
                transaction.objectStore(CORRIDOR_MANIFEST_STORE_NAME).get(id)
            );
            await completed;
            return record === undefined
                ? null
                : validateCorridorManifest(record);
        } catch (error) {
            throw normalizeError(error);
        }
    }

    public async save(manifest: CorridorManifestV1): Promise<void> {
        await this.applyChanges([manifest], []);
    }

    public async applyChanges(
        upserts: CorridorManifestV1[],
        deleteIds: string[]
    ): Promise<void> {
        const validated = upserts.map(validateCorridorManifest);
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                CORRIDOR_MANIFEST_STORE_NAME,
                'readwrite'
            );
            const completed = transactionComplete(transaction);
            const store = transaction.objectStore(CORRIDOR_MANIFEST_STORE_NAME);
            for (const manifest of validated) store.put(manifest);
            for (const id of new Set(deleteIds)) store.delete(id);
            await completed;
        } catch (error) {
            throw normalizeError(error);
        }
    }

    public async close(): Promise<void> {
        if (!this.databasePromise) return;
        try {
            const database = await this.databasePromise;
            database.close();
        } finally {
            this.databasePromise = null;
        }
    }

    private getDatabase(): Promise<IDBDatabase> {
        if (!this.databasePromise) {
            this.databasePromise = new Promise((resolve, reject) => {
                let settled = false;
                const request = this.factory.open(
                    this.databaseName,
                    CORRIDOR_DATABASE_VERSION
                );
                request.onupgradeneeded = () => {
                    const database = request.result;
                    const transaction = request.transaction;
                    if (!transaction) return;
                    const store = database.objectStoreNames.contains(
                        CORRIDOR_MANIFEST_STORE_NAME
                    )
                        ? transaction.objectStore(CORRIDOR_MANIFEST_STORE_NAME)
                        : database.createObjectStore(
                              CORRIDOR_MANIFEST_STORE_NAME,
                              { keyPath: 'id' }
                          );
                    if (!store.indexNames.contains('routeId')) {
                        store.createIndex('routeId', 'routeId');
                    }
                    if (!store.indexNames.contains('active')) {
                        store.createIndex('active', 'active');
                    }
                    if (!store.indexNames.contains('updatedAt')) {
                        store.createIndex('updatedAt', 'updatedAt');
                    }
                };
                request.onsuccess = () => {
                    if (settled) {
                        request.result.close();
                        return;
                    }
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
                    reject(normalizeError(request.error));
                };
                request.onblocked = () => {
                    if (settled) return;
                    settled = true;
                    this.databasePromise = null;
                    reject(
                        new CorridorManifestRepositoryError(
                            'blocked',
                            'Fermez les autres onglets SunTrail pour mettre à niveau les corridors.'
                        )
                    );
                };
            });
        }
        return this.databasePromise;
    }
}
