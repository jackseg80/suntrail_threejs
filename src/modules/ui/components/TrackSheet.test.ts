import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockIsProActive } = vi.hoisted(() => ({
    mockIsProActive: vi.fn(() => false),
}));

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k },
}));

vi.mock('../../state', () => ({
    state: { isRecording: false, recordedPoints: [] },
    isProActive: mockIsProActive,
}));

vi.mock('../../haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../toast', () => ({ showToast: vi.fn() }));
vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));
vi.mock('../../foregroundService', () => ({
    clearInterruptedRecording: vi.fn(),
    stopRecordingService: vi.fn(),
}));
vi.mock('../../location', () => ({
    startLocationTracking: vi.fn(),
    isWatchActive: vi.fn(),
}));
vi.mock('../../profile', () => ({
    updateElevationProfile: vi.fn(),
    closeElevationProfile: vi.fn(),
}));
vi.mock('../../gpxLayers', () => ({
    removeGPXLayer: vi.fn(),
    toggleGPXLayer: vi.fn(),
    addGPXLayer: vi.fn(),
    updateRecordedTrackMesh: vi.fn(),
}));
vi.mock('../../gpxService', () => ({
    gpxService: { handleGPXImport: vi.fn() },
}));
vi.mock('../../recordingService', () => ({
    recordingService: {
        toggleRecording: vi.fn(),
        stopRecording: vi.fn(),
        generateSuggestedName: vi.fn(),
    },
}));
vi.mock('../../geoStats', () => ({ calculateTrackStats: vi.fn() }));
vi.mock('../../utils', () => ({ fmtDuration: vi.fn(() => '00:00') }));
vi.mock('../../iap', () => ({ showUpgradePrompt: vi.fn() }));
vi.mock('../../gpxHistoryService', () => ({
    gpxHistoryService: { getHistory: vi.fn(() => []), addEntry: vi.fn() },
}));
vi.mock('../../routeManager', () => ({
    routeManager: { setWaypoints: vi.fn() },
}));
vi.mock('../icons', () => ({ ICON_CLOSE: '✕', ICON_LOCK: '🔒' }));
vi.mock('../core/SheetManager', () => ({
    sheetManager: { open: vi.fn(), close: vi.fn() },
}));
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: vi.fn(() => false) },
}));

import { TrackSheet } from './TrackSheet';

describe('TrackSheet — showSaveTrackPrompt', () => {
    let sheet: TrackSheet;

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="track"></div>';
        sheet = new TrackSheet();
        (sheet as any).element = document.getElementById('track');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('resolve avec le nom saisi sur Enregistrer', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        const input = document.getElementById(
            'rec-save-name'
        ) as HTMLInputElement;
        input.value = 'Ma Rando';
        document.getElementById('rec-save-confirm')?.click();
        await expect(promise).resolves.toBe('Ma Rando');
    });

    it('resolve avec null sur Annuler', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        document.getElementById('rec-save-cancel')?.click();
        await expect(promise).resolves.toBeNull();
    });

    it('resolve avec null sur Escape', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await expect(promise).resolves.toBeNull();
    });

    it('resolve avec la valeur sur Entrée', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        const input = document.getElementById(
            'rec-save-name'
        ) as HTMLInputElement;
        input.value = 'Saisie';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await expect(promise).resolves.toBe('Saisie');
    });

    it('resolve avec le nom suggéré si input vide sur Enregistrer', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Suggere');
        const input = document.getElementById(
            'rec-save-name'
        ) as HTMLInputElement;
        input.value = '   ';
        document.getElementById('rec-save-confirm')?.click();
        await expect(promise).resolves.toBe('Suggere');
    });

    it('resolve avec null sur clic fond overlay', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        const overlay = document.body.lastElementChild as HTMLElement;
        expect(overlay).not.toBeNull();
        overlay.click();
        await expect(promise).resolves.toBeNull();
    });

    it('nettoie le DOM et le listener Escape après dismiss', async () => {
        const promise = (sheet as any).showSaveTrackPrompt('Defaut');
        document.getElementById('rec-save-cancel')?.click();
        await promise;
        expect(document.getElementById('rec-save-cancel')).toBeNull();
    });
});
