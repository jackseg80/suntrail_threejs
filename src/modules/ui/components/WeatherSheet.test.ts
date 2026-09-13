import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../i18n/I18nService', () => ({
    i18n: {
        t: (k: string) => k,
        applyToDOM: vi.fn(),
        getLocale: vi.fn(() => 'fr'),
    },
}));

const { mockState, mockGetSunTimes } = vi.hoisted(() => {
    const state: Record<string, any> = {
        weatherData: null,
        controls: { target: { y: 0 } },
        simDate: new Date(),
        hasLastClicked: false,
        subscribe: vi.fn(() => vi.fn()),
        isMapTilerDisabled: false,
        weatherUnavailable: false,
        lastWeatherLat: 46,
        lastWeatherLon: 8,
    };
    return {
        mockState: state,
        mockGetSunTimes: vi.fn(() => ({
            sunrise: new Date(2026, 8, 11, 7, 10),
            sunset: new Date(2026, 8, 11, 19, 50),
        })),
    };
});

vi.mock('../../suncalcCompat', () => ({
    default: { getTimes: mockGetSunTimes },
}));

vi.mock('../../state', () => ({
    state: mockState,
    isProActive: vi.fn(() => false),
}));

vi.mock('../../weather', () => ({
    getWeatherIcon: vi.fn(() => '☀️'),
    fetchWeather: vi.fn().mockResolvedValue(undefined),
    updateWeatherVisibility: vi.fn(),
}));

vi.mock('../../weatherUtils', () => ({
    getUVCategory: vi.fn(() => 'moderate'),
    getComfortIndex: vi.fn(() => 22),
    getFreezingAlert: vi.fn(() => null),
    computeTemperatureChartData: vi.fn(() => []),
}));

vi.mock('../../geo', () => ({
    worldToLngLat: vi.fn(() => ({ lat: 46, lon: 8 })),
}));

vi.mock('../../toast', () => ({ showToast: vi.fn() }));
vi.mock('../../iap', () => ({ showUpgradePrompt: vi.fn() }));
vi.mock('../../expertService', () => ({
    expertService: { generateWeatherReport: vi.fn(() => 'Weather Report') },
}));
vi.mock('../core/SheetManager', () => ({
    sheetManager: { back: vi.fn() },
}));
vi.mock('../tooltip', () => ({
    createTooltip: vi.fn(() => ({ dispose: vi.fn() })),
}));
vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('../templates/weather.html?raw', () => ({
    default: `
        <div id="weather" class="bottom-sheet">
            <button class="sheet-close" id="close-weather"></button>
            <button id="weather-refresh-btn"></button>
            <div id="weather-content">
                <div id="weather-loading" class="exp-loading"></div>
                <div id="weather-unavailable" class="exp-msg-placeholder"></div>
                <div id="weather-dashboard">
                    <div id="weather-location-name"></div>
                    <div id="weather-temp"></div>
                    <div id="weather-icon"></div>
                    <div id="weather-humidity"></div>
                    <div id="weather-wind"></div>
                </div>
            </div>
        </div>`,
}));

import { WeatherSheet } from './WeatherSheet';
import { sheetManager } from '../core/SheetManager';
import { eventBus } from '../../eventBus';
import { fetchWeather } from '../../weather';
import { showUpgradePrompt } from '../../iap';

describe('WeatherSheet', () => {
    let container: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState.weatherData = null;
        mockState.weatherUnavailable = false;
        container = document.createElement('div');
        container.id = 'sheet-container';
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('constructs without throwing', () => {
        const sheet = new WeatherSheet();
        expect(sheet).toBeDefined();
        sheet.dispose();
    });

    it('hydrates without crashing', () => {
        const sheet = new WeatherSheet();
        expect(() => sheet.hydrate()).not.toThrow();
    });

    it('close button follows the common sheet back contract', () => {
        const sheet = new WeatherSheet();
        sheet.hydrate();
        const btn = document.getElementById('close-weather')!;
        btn.click();
        expect(sheetManager.back).toHaveBeenCalled();
    });

    it('shows loading state when no weather data', () => {
        mockState.weatherData = null;
        mockState.weatherUnavailable = false;
        const sheet = new WeatherSheet();
        sheet.hydrate();
        const content = document.getElementById('weather-content');
        expect(content?.children.length).toBeGreaterThan(0);
    });

    it('shows unavailable message when weather service is unavailable', () => {
        mockState.weatherData = null;
        mockState.weatherUnavailable = true;
        const sheet = new WeatherSheet();
        sheet.hydrate();
        const content = document.getElementById('weather-content');
        expect(content?.children.length).toBeGreaterThan(0);
        expect(content?.textContent).toContain(
            'weather.unavailableDescription'
        );
        expect(content?.textContent).not.toContain(
            'Service météo temporairement indisponible'
        );
    });

    it('shows weather dashboard when data is available', () => {
        mockState.weatherUnavailable = false;
        mockState.weatherData = {
            temp: 15,
            apparentTemp: 13,
            humidity: 60,
            windSpeed: 10,
            windDir: 180,
            windGusts: 25,
            uvIndex: 4,
            freezingLevel: 2500,
            visibility: 10,
            locationName: 'Zermatt',
            weatherCode: 1,
            daily: [],
            hourly: [],
        };
        const sheet = new WeatherSheet();
        sheet.hydrate();
        const content = document.getElementById('weather-content');
        expect(content).not.toBeNull();
        expect(content!.children.length).toBeGreaterThan(0);
    });

    it('displays location name when set', () => {
        mockState.weatherUnavailable = false;
        mockState.weatherData = {
            temp: 20,
            apparentTemp: 18,
            humidity: 50,
            windSpeed: 5,
            windDir: 90,
            windGusts: 10,
            uvIndex: 2,
            freezingLevel: 3000,
            visibility: 20,
            locationName: 'Chamonix',
            weatherCode: 0,
            daily: [],
            hourly: [],
        };
        const sheet = new WeatherSheet();
        sheet.hydrate();
        const loc = document.getElementById('weather-location-name');
        expect(loc?.textContent).toBe('Chamonix');
    });

    it('uses translated labels for sunrise and sunset in the hourly forecast', () => {
        const sheet = new WeatherSheet();
        const hourly = [
            { time: '07:00', temp: 10, code: 0 },
            { time: '19:00', temp: 16, code: 0 },
        ];

        const scroll = (sheet as any).buildHourlyScroll({ hourly }, 24);

        expect(scroll.textContent).toContain('solar.stat.sunrise');
        expect(scroll.textContent).toContain('solar.stat.sunset');
        expect(scroll.textContent).not.toContain('Sunrise');
        expect(scroll.textContent).not.toContain('Sunset');
    });

    it('uses real buttons for the locked forecast days', () => {
        const sheet = new WeatherSheet();
        const preview = (sheet as any).buildDailyForecastPreview({
            daily: [
                {
                    date: '2026-09-12',
                    code: 0,
                    tempMax: 18,
                    tempMin: 8,
                    precipSum: 0,
                    windSpeedMax: 10,
                },
                {
                    date: '2026-09-13',
                    code: 0,
                    tempMax: 19,
                    tempMin: 9,
                    precipSum: 0,
                    windSpeedMax: 11,
                },
                {
                    date: '2026-09-14',
                    code: 0,
                    tempMax: 20,
                    tempMin: 10,
                    precipSum: 0,
                    windSpeedMax: 12,
                },
            ],
        });
        const lockedDays = preview.querySelectorAll(
            'button.weather-daily-row--locked'
        );
        expect(lockedDays).toHaveLength(2);

        (lockedDays[0] as HTMLButtonElement).click();
        expect(showUpgradePrompt).toHaveBeenCalledWith('weather_extended');
    });

    it('dispose cleans up without crash', () => {
        const sheet = new WeatherSheet();
        sheet.hydrate();
        expect(() => sheet.dispose()).not.toThrow();
    });

    it('refresh button calls fetchWeather', () => {
        const sheet = new WeatherSheet();
        sheet.hydrate();
        const btn = document.getElementById('weather-refresh-btn')!;
        btn.click();
        expect(fetchWeather).toHaveBeenCalled();
    });

    it('subscribes to sheetOpened for auto-refresh', () => {
        const sheet = new WeatherSheet();
        sheet.hydrate();
        expect(eventBus.on).toHaveBeenCalledWith(
            'sheetOpened',
            expect.anything()
        );
    });

    it('triggers fetchWeather on sheetOpened with id=weather', () => {
        const sheet = new WeatherSheet();
        sheet.hydrate();

        let handler: (payload: { id: string }) => void = () => {};
        vi.mocked(eventBus.on).mockImplementation((_event, fn) => {
            if (_event === 'sheetOpened')
                handler = fn as (payload: { id: string }) => void;
        });

        sheet.hydrate();
        handler({ id: 'weather' });
        expect(fetchWeather).toHaveBeenCalled();
    });

    it('ignores sheetOpened for other sheet ids', () => {
        const sheet = new WeatherSheet();
        sheet.hydrate();

        let handler: (payload: { id: string }) => void = () => {};
        vi.mocked(eventBus.on).mockImplementation((_event, fn) => {
            if (_event === 'sheetOpened')
                handler = fn as (payload: { id: string }) => void;
        });

        sheet.hydrate();
        handler({ id: 'other' });
        expect(fetchWeather).not.toHaveBeenCalled();
    });

    it('subscribes to state changes', () => {
        const sheet = new WeatherSheet();
        sheet.hydrate();
        expect(mockState.subscribe).toHaveBeenCalledWith(
            'weatherData',
            expect.anything()
        );
        expect(mockState.subscribe).toHaveBeenCalledWith(
            'weatherUnavailable',
            expect.anything()
        );
        expect(mockState.subscribe).toHaveBeenCalledWith(
            'isPro',
            expect.anything()
        );
    });

    it('sets aria-live on weather content', () => {
        const sheet = new WeatherSheet();
        sheet.hydrate();
        const content = document.getElementById('weather-content')!;
        expect(content.getAttribute('aria-live')).toBe('polite');
    });

    it('sets aria-label on close button', () => {
        const sheet = new WeatherSheet();
        sheet.hydrate();
        const btn = document.getElementById('close-weather')!;
        expect(btn.getAttribute('aria-label')).toBe('weather.aria.close');
    });
});
