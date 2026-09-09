import { getTileCacheStats, type TileCacheStats } from './tileCache';

export type TileDiagnosticPhase =
    | 'created'
    | 'queued'
    | 'load-started'
    | 'memory-cache-hit'
    | 'resource-read'
    | 'worker-dispatched'
    | 'worker-completed'
    | 'build-queued'
    | 'build-started'
    | 'mesh-added'
    | 'first-render-submitted'
    | 'failed'
    | 'disposed';

export type TileResourceType = 'color' | 'elevation' | 'overlay';

export type TileResourceSource =
    | 'memory-texture'
    | 'offline-cache'
    | 'navigation-cache'
    | 'embedded-pmtiles'
    | 'country-pack-opfs'
    | 'country-pack-cdn'
    | 'worker-cache'
    | 'network'
    | 'none'
    | 'error';

type DiagnosticValue = string | number | boolean | null;

export interface TileDiagnosticEvent {
    atMs: number;
    phase: TileDiagnosticPhase;
    details?: Record<string, DiagnosticValue>;
}

export interface TileResourceDiagnostic {
    atMs: number;
    resource: TileResourceType;
    source: TileResourceSource;
    durationMs: number;
    sizeBytes?: number;
    cacheLookupMs?: number;
    readMs?: number;
    networkMs?: number;
    decodeMs?: number;
}

export interface TileDiagnosticTrace {
    id: number;
    key: string;
    x: number;
    y: number;
    zoom: number;
    cacheOnly: boolean;
    mode: '2d' | '3d';
    preset: string;
    startedAtMs: number;
    events: TileDiagnosticEvent[];
    resources: TileResourceDiagnostic[];
}

export interface TileDiagnosticSnapshot {
    enabled: boolean;
    capturedAt: string;
    sessionStartedAt: string;
    environment: {
        userAgent: string;
        viewport: string;
        devicePixelRatio: number;
        hardwareConcurrency: number | null;
    };
    cache: TileCacheStats;
    traces: TileDiagnosticTrace[];
}

const MAX_TRACES = 2000;
const sessionStartedAt = new Date().toISOString();
const traces = new Map<number, TileDiagnosticTrace>();
let nextTraceId = 1;
let enabled = false;

function now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

function queryEnablesDiagnostics(): boolean {
    if (import.meta.env.VITE_TILE_DIAGNOSTICS === '1') return true;
    if (typeof window === 'undefined') return false;
    try {
        return (
            new URLSearchParams(window.location.search).get(
                'tileDiagnostics'
            ) === '1'
        );
    } catch {
        return false;
    }
}

export function isTileDiagnosticsEnabled(): boolean {
    return enabled;
}

export function enableTileDiagnostics(): void {
    enabled = true;
    if (typeof document !== 'undefined') {
        document.documentElement.dataset.tileDiagnostics = 'enabled';
        installTileDiagnosticSnapshotControl();
    }
}

export function disableTileDiagnostics(): void {
    enabled = false;
    if (typeof document !== 'undefined')
        document.documentElement.dataset.tileDiagnostics = 'disabled';
}

export function clearTileDiagnostics(): void {
    traces.clear();
    nextTraceId = 1;
}

export function beginTileTrace(tile: {
    key: string;
    tx: number;
    ty: number;
    zoom: number;
    cacheOnly: boolean;
    is2D: boolean;
    preset: string;
}): number | null {
    if (!enabled) return null;
    if (traces.size >= MAX_TRACES) {
        const oldestId = traces.keys().next().value as number | undefined;
        if (oldestId !== undefined) traces.delete(oldestId);
    }
    const id = nextTraceId++;
    const startedAtMs = now();
    traces.set(id, {
        id,
        key: tile.key,
        x: tile.tx,
        y: tile.ty,
        zoom: tile.zoom,
        cacheOnly: tile.cacheOnly,
        mode: tile.is2D ? '2d' : '3d',
        preset: tile.preset,
        startedAtMs: round(startedAtMs),
        events: [{ atMs: 0, phase: 'created' }],
        resources: [],
    });
    return id;
}

export function markTileTrace(
    traceId: number | null | undefined,
    phase: TileDiagnosticPhase,
    details?: Record<string, DiagnosticValue>
): void {
    if (!enabled || traceId == null) return;
    const trace = traces.get(traceId);
    if (!trace) return;
    trace.events.push({
        atMs: round(now() - trace.startedAtMs),
        phase,
        details,
    });
}

export function recordTileResource(
    traceId: number | null | undefined,
    diagnostic: Omit<TileResourceDiagnostic, 'atMs'>
): void {
    if (!enabled || traceId == null) return;
    const trace = traces.get(traceId);
    if (!trace) return;
    trace.resources.push({
        ...diagnostic,
        atMs: round(now() - trace.startedAtMs),
        durationMs: round(diagnostic.durationMs),
        cacheLookupMs:
            diagnostic.cacheLookupMs === undefined
                ? undefined
                : round(diagnostic.cacheLookupMs),
        readMs:
            diagnostic.readMs === undefined
                ? undefined
                : round(diagnostic.readMs),
        networkMs:
            diagnostic.networkMs === undefined
                ? undefined
                : round(diagnostic.networkMs),
        decodeMs:
            diagnostic.decodeMs === undefined
                ? undefined
                : round(diagnostic.decodeMs),
    });
}

export function getTileDiagnosticSnapshot(): TileDiagnosticSnapshot {
    const width = typeof window === 'undefined' ? 0 : window.innerWidth;
    const height = typeof window === 'undefined' ? 0 : window.innerHeight;
    return {
        enabled,
        capturedAt: new Date().toISOString(),
        sessionStartedAt,
        environment: {
            userAgent:
                typeof navigator === 'undefined' ? '' : navigator.userAgent,
            viewport: `${width}x${height}`,
            devicePixelRatio:
                typeof window === 'undefined'
                    ? 1
                    : window.devicePixelRatio || 1,
            hardwareConcurrency:
                typeof navigator === 'undefined'
                    ? null
                    : navigator.hardwareConcurrency || null,
        },
        cache: getTileCacheStats(),
        traces: Array.from(traces.values()).map((trace) => ({
            ...trace,
            events: trace.events.map((event) => ({
                ...event,
                details: event.details ? { ...event.details } : undefined,
            })),
            resources: trace.resources.map((resource) => ({ ...resource })),
        })),
    };
}

export function downloadTileDiagnostics(): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return;
    const json = JSON.stringify(getTileDiagnosticSnapshot(), null, 2);
    const url = URL.createObjectURL(
        new Blob([json], { type: 'application/json' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `suntrail-tile-diagnostics-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
}

function publishTileDiagnosticSnapshot(): void {
    if (typeof document === 'undefined') return;
    let output = document.getElementById('suntrail-tile-diagnostics-data');
    if (!output) {
        output = document.createElement('script');
        output.id = 'suntrail-tile-diagnostics-data';
        output.setAttribute('type', 'application/json');
        output.hidden = true;
        document.documentElement.appendChild(output);
    }
    output.textContent = JSON.stringify(getTileDiagnosticSnapshot());
}

function installTileDiagnosticSnapshotControl(): void {
    if (typeof document === 'undefined' || !enabled) return;
    if (document.getElementById('suntrail-tile-diagnostics-snapshot')) return;
    const button = document.createElement('button');
    button.id = 'suntrail-tile-diagnostics-snapshot';
    button.type = 'button';
    button.setAttribute('aria-label', 'Publier le diagnostic des tuiles');
    button.style.cssText =
        'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0.01;padding:0;border:0;z-index:2147483647';
    button.addEventListener('click', publishTileDiagnosticSnapshot);
    document.body.appendChild(button);

    for (const action of [
        { id: 'east', axis: 'x', direction: 1 },
        { id: 'west', axis: 'x', direction: -1 },
        { id: 'south', axis: 'z', direction: 1 },
        { id: 'north', axis: 'z', direction: -1 },
    ] as const) {
        const actionId = `suntrail-tile-diagnostics-pan-${action.id}`;
        if (document.getElementById(actionId)) continue;
        const panButton = document.createElement('button');
        panButton.id = actionId;
        panButton.type = 'button';
        panButton.setAttribute(
            'aria-label',
            `Déplacer la carte de diagnostic vers ${action.id}`
        );
        panButton.style.cssText =
            'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0.01;padding:0;border:0;z-index:2147483647';
        panButton.addEventListener('click', () => {
            window.dispatchEvent(
                new CustomEvent('suntrail:tileDiagnosticPan', {
                    detail: {
                        axis: action.axis,
                        direction: action.direction,
                    },
                })
            );
        });
        document.body.appendChild(panButton);
    }
}

export interface SunTrailTileDiagnosticsApi {
    enable: typeof enableTileDiagnostics;
    disable: typeof disableTileDiagnostics;
    clear: typeof clearTileDiagnostics;
    snapshot: typeof getTileDiagnosticSnapshot;
    download: typeof downloadTileDiagnostics;
}

declare global {
    interface Window {
        suntrailTileDiagnostics?: SunTrailTileDiagnosticsApi;
    }
}

if (queryEnablesDiagnostics()) enabled = true;

if (typeof window !== 'undefined') {
    window.suntrailTileDiagnostics = {
        enable: enableTileDiagnostics,
        disable: disableTileDiagnostics,
        clear: clearTileDiagnostics,
        snapshot: getTileDiagnosticSnapshot,
        download: downloadTileDiagnostics,
    };
    document.documentElement.dataset.tileDiagnostics = enabled
        ? 'enabled'
        : 'disabled';
    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            installTileDiagnosticSnapshotControl,
            { once: true }
        );
    } else {
        installTileDiagnosticSnapshotControl();
    }
    window.addEventListener(
        'suntrail:requestTileDiagnostics',
        publishTileDiagnosticSnapshot
    );
    if (typeof MutationObserver !== 'undefined') {
        const snapshotRequestObserver = new MutationObserver((mutations) => {
            if (
                mutations.some(
                    (mutation) =>
                        mutation.attributeName ===
                        'data-tile-diagnostics-request'
                )
            ) {
                publishTileDiagnosticSnapshot();
            }
        });
        snapshotRequestObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-tile-diagnostics-request'],
        });
    }
}
