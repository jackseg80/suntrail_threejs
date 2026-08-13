import type { RouteCorridorPlanV1 } from './routeCorridor';

export type CorridorNetworkType = 'wifi' | 'cellular' | 'none' | 'unknown';
export type CorridorQuotaStatus = 'sufficient' | 'insufficient' | 'unknown';

export interface CorridorStorageEstimate {
    usage?: number;
    quota?: number;
}

export interface RouteCorridorPreflight {
    networkType: CorridorNetworkType;
    networkAllowed: boolean;
    requiresCellularConfirmation: boolean;
    quotaStatus: CorridorQuotaStatus;
    estimatedSizeBytes: number;
    availableBytes: number | null;
}

export interface RouteCorridorPreflightOptions {
    networkAvailable: boolean;
    connectionType: string;
}

export interface RouteCorridorPreflightDependencies {
    estimateStorage?: () => Promise<CorridorStorageEstimate>;
}

function normalizeNetworkType(
    networkAvailable: boolean,
    connectionType: string
): CorridorNetworkType {
    if (!networkAvailable || connectionType === 'none') return 'none';
    if (connectionType === 'wifi' || connectionType === 'cellular') {
        return connectionType;
    }
    return 'unknown';
}

async function defaultEstimateStorage(): Promise<CorridorStorageEstimate> {
    if (typeof navigator === 'undefined') return {};
    if (!navigator.storage?.estimate) return {};
    return navigator.storage.estimate();
}

export async function getRouteCorridorPreflight(
    plan: RouteCorridorPlanV1,
    options: RouteCorridorPreflightOptions,
    dependencies: RouteCorridorPreflightDependencies = {}
): Promise<RouteCorridorPreflight> {
    const networkType = normalizeNetworkType(
        options.networkAvailable,
        options.connectionType
    );
    let availableBytes: number | null = null;
    let quotaStatus: CorridorQuotaStatus = 'unknown';
    try {
        const estimate = await (
            dependencies.estimateStorage ?? defaultEstimateStorage
        )();
        if (
            Number.isFinite(estimate.usage) &&
            Number.isFinite(estimate.quota) &&
            estimate.usage! >= 0 &&
            estimate.quota! >= estimate.usage!
        ) {
            availableBytes = estimate.quota! - estimate.usage!;
            quotaStatus =
                availableBytes >= plan.estimatedSizeBytes
                    ? 'sufficient'
                    : 'insufficient';
        }
    } catch {
        // Une estimation indisponible reste inconnue et ne devient pas un faux blocage.
    }
    return {
        networkType,
        networkAllowed: networkType !== 'none',
        requiresCellularConfirmation: networkType === 'cellular',
        quotaStatus,
        estimatedSizeBytes: plan.estimatedSizeBytes,
        availableBytes,
    };
}
