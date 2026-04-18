import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockPreferences } = vi.hoisted(() => ({
    mockPreferences: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn()
    }
}));

vi.mock('@capacitor/preferences', () => ({
    Preferences: mockPreferences
}));

import {
    startRecordingService,
    getInterruptedRecording,
    updateRecordingSnapshot
} from './foregroundService';

describe('Foreground Service (v5.29.38 - Preferences API)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPreferences.get.mockResolvedValue({ value: null });
    });

    it('startRecordingService doit sauvegarder originTile dans le snapshot', async () => {
        const originTile = { x: 4270, y: 2891, z: 13 };
        
        await startRecordingService(originTile);
        
        expect(mockPreferences.set).toHaveBeenCalled();
        const snapshotArg = mockPreferences.set.mock.calls[0][0].value;
        const snapshot = JSON.parse(snapshotArg);
        
        expect(snapshot.originTile).toEqual(originTile);
        expect(snapshot.isRecording).toBe(true);
        expect(snapshot.pointCount).toBe(0);
    });

    it('startRecordingService doit fonctionner sans originTile (compatibilité)', async () => {
        await startRecordingService();
        
        expect(mockPreferences.set).toHaveBeenCalled();
        const snapshotArg = mockPreferences.set.mock.calls[0][0].value;
        const snapshot = JSON.parse(snapshotArg);
        
        expect(snapshot.originTile).toBeUndefined();
        expect(snapshot.isRecording).toBe(true);
    });

    it('getInterruptedRecording doit retourner originTile si présent', async () => {
        const snapshot = {
            isRecording: true,
            startTime: Date.now(),
            pointCount: 42,
            originTile: { x: 100, y: 200, z: 13 }
        };
        mockPreferences.get.mockResolvedValue({ value: JSON.stringify(snapshot) });
        
        const result = await getInterruptedRecording();
        
        expect(result).not.toBeNull();
        expect(result?.originTile).toEqual({ x: 100, y: 200, z: 13 });
        expect(result?.pointCount).toBe(42);
    });

    it('updateRecordingSnapshot doit préserver originTile existante', async () => {
        const initialSnapshot = {
            isRecording: true,
            startTime: Date.now(),
            pointCount: 10,
            originTile: { x: 500, y: 600, z: 14 }
        };
        mockPreferences.get.mockResolvedValue({ value: JSON.stringify(initialSnapshot) });
        
        await updateRecordingSnapshot(20);
        
        expect(mockPreferences.set).toHaveBeenCalled();
        const updatedArg = mockPreferences.set.mock.calls[0][0].value;
        const updated = JSON.parse(updatedArg);
        
        expect(updated.pointCount).toBe(20);
        expect(updated.originTile).toEqual({ x: 500, y: 600, z: 14 });
    });
});
