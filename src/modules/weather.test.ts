import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWeather } from './weather';
import { state } from './state';

global.fetch = vi.fn();

describe('Weather Module', () => {
    beforeEach(() => {
        state.currentWeather = 'clear';
        state.weatherData = null;
        vi.clearAllMocks();
    });

    it('should set currentWeather to rain for WMO code 61 and get location name', async () => {
        // Mock Weather API
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ current: { 
                weather_code: 61,
                temperature_2m: 10,
                apparent_temperature: 8,
                wind_speed_10m: 5,
                wind_direction_10m: 180,
                relative_humidity_2m: 80,
                cloud_cover: 100
            } })
        });
        // Mock Geo API
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ address: { city: 'Delémont' } })
        });
        
        await fetchWeather(47.36, 7.34);
        expect(state.currentWeather).toBe('rain');
        expect(state.weatherData?.temp).toBe(10);
        expect(state.weatherData?.locationName).toBe('Delémont');
    });

    it('should set currentWeather to snow for WMO code 71', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ current: { 
                weather_code: 71,
                temperature_2m: -2,
                apparent_temperature: -5,
                wind_speed_10m: 10,
                wind_direction_10m: 0,
                relative_humidity_2m: 90,
                cloud_cover: 100
            } })
        });
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ address: { village: 'Moutier' } })
        });
        
        await fetchWeather(47.28, 7.37);
        expect(state.currentWeather).toBe('snow');
        expect(state.weatherData?.locationName).toBe('Moutier');
    });

    it('should set currentWeather to clear for WMO code 0', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ current: { 
                weather_code: 0,
                temperature_2m: 20,
                apparent_temperature: 20,
                wind_speed_10m: 2,
                wind_direction_10m: 90,
                relative_humidity_2m: 40,
                cloud_cover: 0
            } })
        });
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ address: { county: 'Jura' } })
        });
        
        await fetchWeather(46.0, 7.0);
        expect(state.currentWeather).toBe('clear');
    });

    it('should default to clear on API error', async () => {
        (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
        
        await fetchWeather(46.0, 7.0);
        expect(state.currentWeather).toBe('clear');
    });
    
    it('should gracefully handle non-ok responses', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: false,
            status: 500
        });
        (global.fetch as any).mockResolvedValueOnce({
            ok: false,
            status: 500
        });
        
        await fetchWeather(46.0, 7.0);
        expect(state.currentWeather).toBe('clear');
    });
});
