import { validatePreparedRoute, type PreparedRouteV1 } from './preparedRoute';

export const ROUTE_DATABASE_NAME = 'suntrail-prepared-routes';
export const ROUTE_DATABASE_VERSION = 2;
export const ROUTE_STORE_NAME = 'routes';

export type RouteRepositoryErrorCode =
    | 'unavailable'
    | 'quota'
    | 'corrupt-record'
    | 'blocked'
    | 'transaction'
    | 'unknown';

export class RouteRepositoryError extends Error {
    constructor(
        public readonly code: RouteRepositoryErrorCode,
        message: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'RouteRepositoryError';
    }
}

export interface RouteRepositoryDiagnostics {
    corruptedIds: string[];
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

function normalizeRepositoryError(error: unknown): RouteRepositoryError {
    if (error instanceof RouteRepositoryError) return error;
    const name =
        typeof DOMException !== 'undefined' && error instanceof DOMException
            ? error.name
            : error instanceof Error
              ? error.name
              : '';
    if (name === 'QuotaExceededError') {
        return new RouteRepositoryError(
            'quota',
            'Le stockage local disponible est insuffisant.',
            error
        );
    }
    if (name === 'AbortError' || name === 'TransactionInactiveError') {
        return new RouteRepositoryError(
            'transaction',
            'La transaction de routes a été interrompue.',
            error
        );
    }
    return new RouteRepositoryError(
        'unknown',
        error instanceof Error ? error.message : 'IndexedDB route error',
        error
    );
}

/**
 * Accès unique à la base IndexedDB des routes préparées.
 * L'IDBFactory est injectée afin que les tests utilisent une factory isolée.
 */
export class RouteRepository {
    private databasePromise: Promise<IDBDatabase> | null = null;
    private diagnostics: RouteRepositoryDiagnostics = { corruptedIds: [] };

    constructor(
        private readonly factory: IDBFactory,
        private readonly databaseName = ROUTE_DATABASE_NAME
    ) {
        if (!factory) {
            throw new RouteRepositoryError(
                'unavailable',
                'IndexedDB is unavailable on this device.'
            );
        }
    }

    public getDiagnostics(): RouteRepositoryDiagnostics {
        return { corruptedIds: [...this.diagnostics.corruptedIds] };
    }

    public async open(): Promise<void> {
        await this.getDatabase();
    }

    public async list(): Promise<PreparedRouteV1[]> {
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                ROUTE_STORE_NAME,
                'readonly'
            );
            const completed = transactionComplete(transaction);
            const rawRecords = await requestResult(
                transaction.objectStore(ROUTE_STORE_NAME).getAll()
            );
            await completed;

            const routes: PreparedRouteV1[] = [];
            const corruptedIds: string[] = [];
            for (const rawRecord of rawRecords) {
                try {
                    routes.push(validatePreparedRoute(rawRecord));
                } catch {
                    const id =
                        typeof rawRecord === 'object' &&
                        rawRecord !== null &&
                        'id' in rawRecord
                            ? String((rawRecord as { id: unknown }).id)
                            : 'unknown';
                    corruptedIds.push(id);
                }
            }
            this.diagnostics = { corruptedIds };
            return routes.sort((a, b) => {
                if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
                return b.updatedAt.localeCompare(a.updatedAt);
            });
        } catch (error) {
            throw normalizeRepositoryError(error);
        }
    }

    public async get(id: string): Promise<PreparedRouteV1 | null> {
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                ROUTE_STORE_NAME,
                'readonly'
            );
            const completed = transactionComplete(transaction);
            const value = await requestResult(
                transaction.objectStore(ROUTE_STORE_NAME).get(id)
            );
            await completed;
            if (value === undefined) return null;
            try {
                return validatePreparedRoute(value);
            } catch (error) {
                throw new RouteRepositoryError(
                    'corrupt-record',
                    `La route ${id} est illisible mais peut être supprimée.`,
                    error
                );
            }
        } catch (error) {
            throw normalizeRepositoryError(error);
        }
    }

    public async save(route: PreparedRouteV1): Promise<void> {
        await this.saveMany([route]);
    }

    /** Toutes les écritures réussissent ou la transaction complète est annulée. */
    public async saveMany(routes: PreparedRouteV1[]): Promise<void> {
        const validatedRoutes = routes.map((route) =>
            validatePreparedRoute(route)
        );
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                ROUTE_STORE_NAME,
                'readwrite'
            );
            const completed = transactionComplete(transaction);
            const store = transaction.objectStore(ROUTE_STORE_NAME);
            for (const route of validatedRoutes) store.put(route);
            await completed;
        } catch (error) {
            throw normalizeRepositoryError(error);
        }
    }

    public async delete(id: string): Promise<void> {
        try {
            const database = await this.getDatabase();
            const transaction = database.transaction(
                ROUTE_STORE_NAME,
                'readwrite'
            );
            const completed = transactionComplete(transaction);
            transaction.objectStore(ROUTE_STORE_NAME).delete(id);
            await completed;
            this.diagnostics = {
                corruptedIds: this.diagnostics.corruptedIds.filter(
                    (corruptedId) => corruptedId !== id
                ),
            };
        } catch (error) {
            throw normalizeRepositoryError(error);
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
                    ROUTE_DATABASE_VERSION
                );
                request.onupgradeneeded = () => {
                    const database = request.result;
                    const transaction = request.transaction;
                    if (!transaction) return;
                    const store = database.objectStoreNames.contains(
                        ROUTE_STORE_NAME
                    )
                        ? transaction.objectStore(ROUTE_STORE_NAME)
                        : database.createObjectStore(ROUTE_STORE_NAME, {
                              keyPath: 'id',
                          });
                    if (!store.indexNames.contains('updatedAt')) {
                        store.createIndex('updatedAt', 'updatedAt');
                    }
                    if (!store.indexNames.contains('favorite')) {
                        store.createIndex('favorite', 'favorite');
                    }
                    if (!store.indexNames.contains('name')) {
                        store.createIndex('name', 'name');
                    }
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
                        new RouteRepositoryError(
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
