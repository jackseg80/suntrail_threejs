import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreparedRouteV1 } from '../preparedRoutes/preparedRoute';
import type { GuidanceSnapshot, GuidanceUpdate } from './guidanceTypes';

const mocks = vi.hoisted(() => ({
    getActiveSession: vi.fn(),
    getRouteById: vi.fn(),
    restoreSavedRoute: vi.fn(),
    stopGuidance: vi.fn(),
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
vi.mock('../preparedRoutes/preparedRouteService', () => ({
    preparedRouteService: {
        getById: mocks.getRouteById,
        restoreSavedRoute: mocks.restoreSavedRoute,
    },
}));
vi.mock('../recordingService', () => ({ recordingService: {} }));
vi.mock('../releaseFlags', () => ({
    releaseFlags: { isEnabled: (flag: string) => flag === 'nativeGuidance' },
}));
vi.mock('../state', () => ({
    state: {
        isRecording: false,
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
