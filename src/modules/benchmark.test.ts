import { describe, it, expect } from 'vitest';
import type { BenchmarkResult } from './benchmark';

describe('BenchmarkResult type', () => {
    it('should have required fields', () => {
        const result: BenchmarkResult = {
            cpuScore: 50,
            gpuScore: 60,
            totalScore: 56,
            recommendedPreset: 'balanced',
        };
        expect(result.cpuScore).toBe(50);
        expect(result.gpuScore).toBe(60);
        expect(result.totalScore).toBe(56);
        expect(result.recommendedPreset).toBe('balanced');
    });
});

describe('Benchmark scoring thresholds (logic validation)', () => {
    const presetRules: Array<{
        minScore: number;
        preset: BenchmarkResult['recommendedPreset'];
    }> = [
        { minScore: 92, preset: 'ultra' },
        { minScore: 65, preset: 'performance' },
        { minScore: 30, preset: 'balanced' },
        { minScore: 0, preset: 'eco' },
    ];

    it('totalScore >= 92 → ultra', () => {
        expect(pickPreset(92)).toBe('ultra');
        expect(pickPreset(100)).toBe('ultra');
    });

    it('totalScore 65-91 → performance', () => {
        expect(pickPreset(65)).toBe('performance');
        expect(pickPreset(80)).toBe('performance');
        expect(pickPreset(91)).toBe('performance');
    });

    it('totalScore 30-64 → balanced', () => {
        expect(pickPreset(30)).toBe('balanced');
        expect(pickPreset(50)).toBe('balanced');
        expect(pickPreset(64)).toBe('balanced');
    });

    it('totalScore < 30 → eco', () => {
        expect(pickPreset(0)).toBe('eco');
        expect(pickPreset(15)).toBe('eco');
        expect(pickPreset(29)).toBe('eco');
    });

    function pickPreset(
        totalScore: number
    ): BenchmarkResult['recommendedPreset'] {
        for (const rule of presetRules) {
            if (totalScore >= rule.minScore) return rule.preset;
        }
        return 'eco';
    }
});
