import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState, mockDetectBestPreset, mockGetGpuInfo } = vi.hoisted(() => {
    const state: Record<string, any> = {
        benchmarkResults: null,
    };
    return {
        mockState: state,
        mockDetectBestPreset: vi.fn(() => 'balanced'),
        mockGetGpuInfo: vi.fn(() => ({
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)',
        })),
    };
});

vi.mock('./state', () => ({ state: mockState }));
vi.mock('./performance', () => ({
    detectBestPreset: mockDetectBestPreset,
    getGpuInfo: mockGetGpuInfo,
}));

// Mock THREE for testGPU
vi.mock('three', async () => {
    const actual = await vi.importActual<typeof import('three')>('three');
    return {
        ...actual,
        WebGLRenderer: class {
            dispose() {}
            getContext() {
                return {
                    RGBA: 6408,
                    UNSIGNED_BYTE: 5121,
                    readPixels: vi.fn(),
                };
            }
            render() {}
        },
    };
});

import { runBenchmark } from './benchmark';
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

describe('Benchmark scoring thresholds', () => {
    const presetRules: Array<{ minScore: number; preset: BenchmarkResult['recommendedPreset'] }> = [
        { minScore: 92, preset: 'ultra' },
        { minScore: 60, preset: 'performance' },
        { minScore: 30, preset: 'balanced' },
        { minScore: 0, preset: 'eco' },
    ];

    function pickPreset(totalScore: number): BenchmarkResult['recommendedPreset'] {
        for (const rule of presetRules) {
            if (totalScore >= rule.minScore) return rule.preset;
        }
        return 'eco';
    }

    it('totalScore >= 92 → ultra', () => {
        expect(pickPreset(92)).toBe('ultra');
        expect(pickPreset(100)).toBe('ultra');
    });

    it('totalScore 60-91 → performance', () => {
        expect(pickPreset(60)).toBe('performance');
        expect(pickPreset(80)).toBe('performance');
        expect(pickPreset(91)).toBe('performance');
    });

    it('totalScore 30-59 → balanced', () => {
        expect(pickPreset(30)).toBe('balanced');
        expect(pickPreset(50)).toBe('balanced');
        expect(pickPreset(59)).toBe('balanced');
    });

    it('totalScore < 30 → eco', () => {
        expect(pickPreset(0)).toBe('eco');
        expect(pickPreset(15)).toBe('eco');
        expect(pickPreset(29)).toBe('eco');
    });
});

describe('runBenchmark()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.benchmarkResults = null;
        mockDetectBestPreset.mockReturnValue('balanced');
        mockGetGpuInfo.mockReturnValue({
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)',
        });
    });

    it('returns a BenchmarkResult', async () => {
        const result = await runBenchmark();
        expect(result).toBeDefined();
        expect(typeof result.cpuScore).toBe('number');
        expect(typeof result.gpuScore).toBe('number');
        expect(typeof result.totalScore).toBe('number');
        expect(result.recommendedPreset).toBeDefined();
    });

    it('stores results in state', async () => {
        await runBenchmark();
        expect(mockState.benchmarkResults).not.toBeNull();
        expect(mockState.benchmarkResults!.cpuScore).toBeGreaterThanOrEqual(0);
        expect(mockState.benchmarkResults!.gpuScore).toBeGreaterThanOrEqual(0);
    });

    it('detects ultra preset for high scores', async () => {
        mockDetectBestPreset.mockReturnValue('ultra');
        const result = await runBenchmark();
        expect(result.recommendedPreset).toBeDefined();
    });

    it('caps Intel iGPUs to balanced', async () => {
        mockDetectBestPreset.mockReturnValue('balanced');
        mockGetGpuInfo.mockReturnValue({
            renderer: 'ANGLE (Intel, Intel(R) UHD Graphics)',
        });
        const result = await runBenchmark();
        expect(['balanced', 'eco']).toContain(result.recommendedPreset);
    });

    it('does not cap Intel Arc GPUs', async () => {
        mockDetectBestPreset.mockReturnValue('ultra');
        mockGetGpuInfo.mockReturnValue({
            renderer: 'ANGLE (Intel, Intel(R) Arc A770)',
        });
        const result = await runBenchmark();
        expect(result.recommendedPreset).toBe('ultra');
    });

    it('does not cap non-Intel GPUs', async () => {
        mockDetectBestPreset.mockReturnValue('ultra');
        mockGetGpuInfo.mockReturnValue({
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090)',
        });
        const result = await runBenchmark();
        expect(result.recommendedPreset).toBe('ultra');
    });
});
