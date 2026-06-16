import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k },
}));
vi.mock('../../state', () => ({
    state: {
        weatherData: null,
        controls: { target: { y: 0 } },
        simDate: new Date(),
        hasLastClicked: false,
    },
    isProActive: vi.fn(() => false),
}));
vi.mock('../../weather', () => ({
    getWeatherIcon: vi.fn(),
    fetchWeather: vi.fn(),
    updateWeatherVisibility: vi.fn(),
}));
vi.mock('../../weatherUtils', () => ({
    getUVCategory: vi.fn(),
    getComfortIndex: vi.fn(),
    getFreezingAlert: vi.fn(),
    computeTemperatureChartData: vi.fn(),
    getComfortCategory: vi.fn(),
}));
vi.mock('../../geo', () => ({
    worldToLngLat: vi.fn(() => ({ lat: 46, lon: 8 })),
}));
vi.mock('../../toast', () => ({ showToast: vi.fn() }));
vi.mock('../../iap', () => ({ showUpgradePrompt: vi.fn() }));
vi.mock('../../expertService', () => ({
    expertService: { generateWeatherReport: vi.fn() },
}));
vi.mock('../core/SheetManager', () => ({
    sheetManager: { close: vi.fn() },
}));
vi.mock('../tooltip', () => ({
    createTooltip: vi.fn(() => ({ dispose: vi.fn() })),
}));

import { WeatherSheet } from './WeatherSheet';

describe('WeatherSheet', () => {
    it('constructs without throwing', () => {
        const sheet = new WeatherSheet();
        expect(sheet).toBeDefined();
        sheet.dispose();
    });
});
