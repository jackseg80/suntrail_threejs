import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showToast } from './toast';
import { debounce, throttle, fmtTime, fmtDuration, simplifyRDP } from './utils';

describe('showToast()', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="toast-container"></div>';
    });

    it('should show toast message', () => {
        showToast('Hello');
        const toast = document.querySelector('.toast');
        expect(toast).not.toBeNull();
        expect(toast?.textContent).toContain('Hello');
    });
});

describe('debounce()', () => {
    it('should only call the function once after rapid calls', async () => {
        vi.useFakeTimers();
        const func = vi.fn();
        const debounced = debounce(func, 100);

        debounced();
        debounced();
        debounced();

        expect(func).not.toHaveBeenCalled();
        vi.advanceTimersByTime(150);
        expect(func).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('should call with the latest arguments', async () => {
        vi.useFakeTimers();
        const func = vi.fn();
        const debounced = debounce(func, 100);

        debounced(1);
        debounced(2);
        debounced(3);

        vi.advanceTimersByTime(150);
        expect(func).toHaveBeenCalledWith(3);
        vi.useRealTimers();
    });

    it('should call after each wait period when called spaced apart', async () => {
        vi.useFakeTimers();
        const func = vi.fn();
        const debounced = debounce(func, 100);

        debounced('a');
        vi.advanceTimersByTime(150);
        expect(func).toHaveBeenCalledTimes(1);
        expect(func).toHaveBeenCalledWith('a');

        debounced('b');
        vi.advanceTimersByTime(150);
        expect(func).toHaveBeenCalledTimes(2);
        expect(func).toHaveBeenCalledWith('b');
        vi.useRealTimers();
    });
});

describe('throttle()', () => {
    it('should call immediately on first invocation', () => {
        vi.useFakeTimers();
        const func = vi.fn();
        const throttled = throttle(func, 100);
        throttled();
        expect(func).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('should throttle rapid calls within the limit', () => {
        vi.useFakeTimers();
        const func = vi.fn();
        const throttled = throttle(func, 100);

        throttled();
        throttled();
        throttled();

        expect(func).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(150);
        expect(func).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });
});

describe('fmtTime()', () => {
    it('should return placeholder for null date', () => {
        expect(fmtTime(null)).toBe('—:—');
    });

    it('should format a valid date', () => {
        const d = new Date(2025, 0, 1, 14, 30);
        const result = fmtTime(d);
        expect(result).toContain(':');
        expect(result.length).toBeGreaterThanOrEqual(4);
    });
});

describe('fmtDuration()', () => {
    it('should format 0 minutes', () => {
        expect(fmtDuration(0)).toBe('0h 00');
    });

    it('should format hours and minutes', () => {
        expect(fmtDuration(90)).toBe('1h 30');
    });

    it('should format less than an hour', () => {
        expect(fmtDuration(45)).toBe('0h 45');
    });

    it('should pad single-digit minutes', () => {
        expect(fmtDuration(61)).toBe('1h 01');
    });
});

describe('simplifyRDP()', () => {
    const getPos = (p: { x: number; y: number; z: number }) => p;

    it('should return same array for 2 points or fewer', () => {
        const points = [{ x: 0, y: 0, z: 0 }];
        expect(simplifyRDP(points, 1, getPos)).toEqual(points);
    });

    it('should simplify a straight line to endpoints only', () => {
        const points = [
            { x: 0, y: 0, z: 0 },
            { x: 5, y: 0, z: 0 },
            { x: 10, y: 0, z: 0 },
        ];
        const result = simplifyRDP(points, 1, getPos);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual(points[0]);
        expect(result[1]).toEqual(points[2]);
    });

    it('should keep points that deviate beyond epsilon', () => {
        const points = [
            { x: 0, y: 0, z: 0 },
            { x: 5, y: 10, z: 0 },
            { x: 10, y: 0, z: 0 },
        ];
        const result = simplifyRDP(points, 1, getPos);
        expect(result).toHaveLength(3);
    });

    it('should handle empty array', () => {
        expect(simplifyRDP([], 1, getPos)).toEqual([]);
    });
});
