import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks avec vi.hoisted
const { mockAnalysis, mockGeo } = vi.hoisted(() => ({
    mockAnalysis: {
        getAltitudeAt: vi.fn(() => 2000)
    },
    mockGeo: {
        worldToLngLat: vi.fn(() => ({ lat: 45.12345, lon: 6.12345 }))
    }
}));

vi.mock('./toast', () => ({ showToast: vi.fn() }));
vi.mock('../i18n/I18nService', () => ({
    i18n: {
        t: vi.fn((key) => key)
    }
}));

vi.mock('./analysis', () => ({
    getAltitudeAt: mockAnalysis.getAltitudeAt
}));

vi.mock('./geo', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./geo')>();
    return {
        ...actual,
        worldToLngLat: mockGeo.worldToLngLat
    };
});

import { state } from './state';
import { expertService } from './expertService';

describe('ExpertService (v5.29.37)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.userLocation = null;
        state.RELIEF_EXAGGERATION = 1.0;
        state.originTile = { x: 0, y: 0, z: 0 };
    });

    it('doit générer un rapport météo formatté', () => {
        const wd = {
            temp: 15.4,
            apparentTemp: 14.2,
            humidity: 60,
            windSpeed: 20,
            windDir: 180,
            windGusts: 30,
            uvIndex: 5,
            freezingLevel: 3200,
            visibility: 10,
            locationName: 'Chamonix'
        } as any;

        const report = expertService.generateWeatherReport(wd);
        
        expect(report).toContain('SunTrail Weather Report');
        expect(report).toContain('Chamonix');
        expect(report).toContain('15°C');
        expect(report).toContain('3200 m');
    });

    it('doit générer un message SOS correct avec localisation utilisateur', async () => {
        state.userLocation = { lat: 46, lon: 7, alt: 2500 };
        
        const msg = await expertService.generateSOSMessage(0.85); // 85% batterie
        
        expect(msg).toContain('🆘 SOS SUNTRAIL');
        expect(msg).toContain('46.00000,7.00000');
        expect(msg).toContain('ALT:2500m');
        expect(msg).toContain('BAT:85%');
    });

    it('doit générer un message SOS basé sur le curseur si pas de GPS', async () => {
        state.userLocation = null;
        state.controls = { target: { x: 100, z: 200 } } as any;
        
        const msg = await expertService.generateSOSMessage(0.50);
        
        expect(msg).toContain('45.12345,6.12345'); // Mock geo
        expect(msg).toContain('ALT:2000m'); // Mock altitude
        expect(msg).toContain('BAT:50%');
    });

    it('doit retourner le bon emoji de lune', () => {
        expect(expertService.getMoonEmoji('full')).toBe('🌕');
        expect(expertService.getMoonEmoji('new')).toBe('🌑');
        expect(expertService.getMoonEmoji('unknown')).toBe('🌙');
    });
});
