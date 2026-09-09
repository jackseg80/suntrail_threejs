import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    beginTileTrace,
    clearTileDiagnostics,
    disableTileDiagnostics,
    enableTileDiagnostics,
    getTileDiagnosticSnapshot,
    markTileTrace,
    recordTileResource,
} from './tileDiagnostics';

describe('tileDiagnostics', () => {
    beforeEach(() => {
        clearTileDiagnostics();
        disableTileDiagnostics();
        document.getElementById('suntrail-tile-diagnostics-data')?.remove();
    });

    it('does not allocate traces while disabled', () => {
        const id = beginTileTrace({
            key: '14/1/2',
            tx: 1,
            ty: 2,
            zoom: 14,
            cacheOnly: false,
            is2D: true,
            preset: 'balanced',
        });

        expect(id).toBeNull();
        expect(getTileDiagnosticSnapshot().traces).toHaveLength(0);
    });

    it('captures phases, provenance and worker timings for an enabled trace', () => {
        enableTileDiagnostics();
        const id = beginTileTrace({
            key: '14/1/2',
            tx: 1,
            ty: 2,
            zoom: 14,
            cacheOnly: false,
            is2D: true,
            preset: 'balanced',
        });

        markTileTrace(id, 'queued', { queueLength: 1 });
        markTileTrace(id, 'load-started');
        markTileTrace(id, 'resource-read', {
            resource: 'color',
            source: 'country-pack-opfs',
            durationMs: 4.25,
        });
        recordTileResource(id, {
            resource: 'color',
            source: 'country-pack-opfs',
            durationMs: 8.126,
            sizeBytes: 1024,
            decodeMs: 3.334,
        });

        const snapshot = getTileDiagnosticSnapshot();
        expect(snapshot.enabled).toBe(true);
        expect(snapshot.traces).toHaveLength(1);
        expect(snapshot.traces[0]).toMatchObject({
            key: '14/1/2',
            mode: '2d',
            preset: 'balanced',
        });
        expect(snapshot.traces[0].events.map((event) => event.phase)).toEqual([
            'created',
            'queued',
            'load-started',
            'resource-read',
        ]);
        expect(snapshot.traces[0].resources[0]).toMatchObject({
            resource: 'color',
            source: 'country-pack-opfs',
            durationMs: 8.13,
            sizeBytes: 1024,
            decodeMs: 3.33,
        });
    });

    it('returns a detached snapshot', () => {
        enableTileDiagnostics();
        beginTileTrace({
            key: '14/1/2',
            tx: 1,
            ty: 2,
            zoom: 14,
            cacheOnly: false,
            is2D: false,
            preset: 'performance',
        });

        const snapshot = getTileDiagnosticSnapshot();
        snapshot.traces[0].events.length = 0;

        expect(getTileDiagnosticSnapshot().traces[0].events).toHaveLength(1);
        expect(window.suntrailTileDiagnostics).toBeDefined();
    });

    it('publishes a read-only DOM snapshot on request', async () => {
        enableTileDiagnostics();
        beginTileTrace({
            key: '14/3/4',
            tx: 3,
            ty: 4,
            zoom: 14,
            cacheOnly: false,
            is2D: true,
            preset: 'balanced',
        });

        document.documentElement.dataset.tileDiagnosticsRequest = String(
            Date.now()
        );
        await Promise.resolve();

        const output = document.getElementById(
            'suntrail-tile-diagnostics-data'
        );
        expect(document.documentElement.dataset.tileDiagnostics).toBe(
            'enabled'
        );
        expect(JSON.parse(output?.textContent ?? '{}').traces).toHaveLength(1);
    });

    it('publishes deterministic pan requests for browser benchmarks', () => {
        enableTileDiagnostics();
        const listener = vi.fn();
        window.addEventListener('suntrail:tileDiagnosticPan', listener, {
            once: true,
        });

        document.getElementById('suntrail-tile-diagnostics-pan-east')?.click();

        expect(listener).toHaveBeenCalledOnce();
        expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
            axis: 'x',
            direction: 1,
        });
    });
});
