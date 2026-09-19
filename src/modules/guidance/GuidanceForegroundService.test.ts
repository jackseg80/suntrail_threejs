import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreparedRouteV1 } from '../preparedRoutes/preparedRoute';
import type { GuidanceSnapshot, GuidanceUpdate } from './guidanceTypes';

const mocks = vi.hoisted(() => ({
    getActiveSession: vi.fn(),
    getRouteById: vi.fn(),
    restoreSavedRoute: vi.fn(),
    stopGuidance: vi.fn(),
    toggleRecordingPause: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    addGuidanceListener: vi.fn(() => vi.fn()),
    addSessionListener: vi.fn(() => vi.fn()),
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
}));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: {} }));
vi.mock('../../i18n/I18nService', () => ({
    i18n: { t: (key: string) => key },
}));
vi.mock('../eventBus', () => ({ eventBus: { emit: vi.fn() } }));
vi.mock('../haptics', () => ({ haptic: vi.fn() }));
vi.mock('../location', () => ({
    centerOnUser: vi.fn(),
    setUserFollowViewport: vi.fn(),
    startLocationTracking: vi.fn(),
}));
vi.mock('../profile', () => ({
    closeElevationProfile: vi.fn(),
    updateElevationProfile: vi.fn(),
}));
vi.mock('../routeManager', () => ({
    setRoutePlanningMode: vi.fn(),
}));
vi.mock('../preparedRoutes/preparedRouteService', () => ({
    preparedRouteService: {
        getById: mocks.getRouteById,
        restoreSavedRoute: mocks.restoreSavedRoute,
    },
}));
vi.mock('../recordingService', () => ({
    recordingService: {
        toggleRecording: vi.fn(),
        toggleRecordingPause: mocks.toggleRecordingPause,
    },
}));
vi.mock('../releaseFlags', () => ({
    releaseFlags: { isEnabled: (flag: string) => flag === 'nativeGuidance' },
}));
vi.mock('../state', () => ({
    state: {
        isRecording: false,
        isPaused: false,
        recordedPoints: [],
        recordingStartTime: null,
        recordingPausedAt: null,
        recordingPausedDurationMs: 0,
        userLocation: null,
        userLocationAccuracy: null,
        userHeading: null,
        subscribe: mocks.subscribe,
    },
}));
vi.mock('../nativeGPSService', () => ({
    nativeGPSService: {
        getActiveSession: mocks.getActiveSession,
        stopGuidance: mocks.stopGuidance,
        addGuidanceListener: mocks.addGuidanceListener,
        addSessionListener: mocks.addSessionListener,
    },
}));

import { GuidanceForegroundService } from './GuidanceForegroundService';
import { state } from '../state';

const snapshot: GuidanceSnapshot = {
    routeId: 'route-recovery',
    status: 'recovered',
    progressMeters: 420,
    remainingMeters: 1580,
    crossTrackMeters: 4,
    eta: '2026-08-12T17:00:00.000Z',
    bearing: 90,
    nextCue: null,
    distanceToNextCueMeters: null,
    accuracyMeters: 8,
    positionAgeMs: 1000,
    updatedAt: '2026-08-12T15:00:00.000Z',
};

describe('GuidanceForegroundService native recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.className = '';
        document.body.innerHTML = '';
        state.isRecording = false;
        state.isPaused = false;
    });

    it('offers the three panel states through explicit controls', () => {
        const service = new GuidanceForegroundService();
        const internals = service as unknown as { ensureUI(): void };
        internals.ensureUI();
        const panel = document.getElementById('guidance-foreground');
        const minimize = panel?.querySelector<HTMLButtonElement>(
            '[data-guidance-action="minimize"]'
        );
        const open = panel?.querySelector<HTMLButtonElement>(
            '[data-guidance-action="open"]'
        );
        const details = panel?.querySelector<HTMLButtonElement>(
            '[data-guidance-action="toggle-details"]'
        );

        expect(panel?.dataset.panelMode).toBe('compact');
        expect(
            panel?.querySelector('#guidance-inclinometer-slot')
        ).not.toBeNull();
        expect(
            panel?.querySelector('.guidance-panel-controls span')
        ).toBeNull();
        expect(open?.textContent).toBe('guidance.actions.open');
        minimize?.click();
        expect(panel?.dataset.panelMode).toBe('peek');
        open?.click();
        expect(panel?.dataset.panelMode).toBe('compact');
        details?.click();
        expect(panel?.dataset.panelMode).toBe('details');
        details?.click();
        expect(panel?.dataset.panelMode).toBe('compact');
    });

    it('uses readable route names and explicit terrain controls', () => {
        const service = new GuidanceForegroundService();
        const internals = service as unknown as {
            ensureUI(): void;
            render(): void;
            route: PreparedRouteV1;
            snapshot: GuidanceSnapshot;
        };
        internals.ensureUI();
        internals.route = {
            id: 'route-readable',
            name: 'Barrage_de_Rossens__boucle',
        } as PreparedRouteV1;
        internals.snapshot = snapshot;
        internals.render();

        const panel = document.getElementById('guidance-foreground');
        const toggle = panel?.querySelector<HTMLButtonElement>(
            '[data-guidance-action="toggle-details"]'
        );
        expect(panel?.querySelector('#guidance-route-name')?.textContent).toBe(
            'Barrage de Rossens boucle'
        );
        expect(
            panel?.querySelector('[data-guidance-action="record"]')?.textContent
        ).toBe('guidance.actions.record');
        expect(
            panel?.querySelector('[data-guidance-action="stop"]')?.textContent
        ).toBe('guidance.actions.stopGuidance');
        expect(
            panel?.querySelector<HTMLButtonElement>(
                '[data-guidance-action="pause-rec"]'
            )?.hidden
        ).toBe(true);
        expect(
            panel?.querySelector<HTMLElement>('.guidance-secondary-actions')
                ?.hidden
        ).toBe(true);
        expect(toggle?.textContent).toBe('guidance.actions.details');

        toggle?.click();
        expect(panel?.dataset.panelMode).toBe('details');
        expect(toggle?.textContent).toBe('guidance.actions.compact');

        toggle?.click();
        expect(panel?.dataset.panelMode).toBe('compact');
    });

    it('pauses only the recording while combined guidance stays active', async () => {
        const service = new GuidanceForegroundService();
        const internals = service as unknown as {
            ensureUI(): void;
            render(): void;
            route: PreparedRouteV1;
            snapshot: GuidanceSnapshot;
        };
        internals.ensureUI();
        internals.route = {
            id: 'route-with-rec',
            name: 'Boucle avec REC',
        } as PreparedRouteV1;
        internals.snapshot = snapshot;
        state.isRecording = true;
        internals.render();

        const panel = document.getElementById('guidance-foreground');
        const pause = panel?.querySelector<HTMLButtonElement>(
            '[data-guidance-action="pause-rec"]'
        );
        expect(panel?.dataset.recording).toBe('true');
        expect(pause?.hidden).toBe(false);
        expect(pause?.textContent).toBe('track.btn.pause');
        expect(
            panel?.querySelector<HTMLElement>('#guidance-rec-badge')?.hidden
        ).toBe(false);
        expect(
            panel?.querySelector('#guidance-rec-badge-duration')?.textContent
        ).toMatch(/^\d+:\d{2}$/);

        pause?.click();
        await vi.waitFor(() =>
            expect(mocks.toggleRecordingPause).toHaveBeenCalledOnce()
        );
        expect(mocks.stopGuidance).not.toHaveBeenCalled();

        state.isPaused = true;
        internals.render();
        expect(pause?.textContent).toBe('track.btn.resume');
        expect(pause?.getAttribute('aria-pressed')).toBe('true');

        pause?.click();
        await vi.waitFor(() =>
            expect(mocks.toggleRecordingPause).toHaveBeenCalledTimes(2)
        );
        expect(mocks.stopGuidance).not.toHaveBeenCalled();
    });

    it('recreates the prepared route layer when attaching to a surviving native session', async () => {
        const route = Object.freeze({
            id: 'route-recovery',
        }) as PreparedRouteV1;
        mocks.getActiveSession.mockResolvedValue({
            active: true,
            mode: 'both',
            recording: true,
            guidance: true,
            routeId: route.id,
            snapshot,
        });
        mocks.getRouteById.mockResolvedValue(route);

        const service = new GuidanceForegroundService();
        const internals = service as unknown as {
            ensureUI(): void;
            applyUpdate(update: GuidanceUpdate): void;
        };
        vi.spyOn(internals, 'ensureUI').mockImplementation(() => undefined);
        const applyUpdate = vi
            .spyOn(internals, 'applyUpdate')
            .mockImplementation(() => undefined);

        await expect(service.recoverNativeSession()).resolves.toBe(true);

        expect(mocks.restoreSavedRoute).toHaveBeenCalledOnce();
        expect(mocks.restoreSavedRoute).toHaveBeenCalledWith(route);
        expect(applyUpdate).toHaveBeenCalledWith({
            snapshot,
            events: ['recovered'],
            acceptedPosition: false,
        });
        expect(document.body.classList.contains('guidance-active')).toBe(true);
        expect(mocks.stopGuidance).not.toHaveBeenCalled();
    });
});
