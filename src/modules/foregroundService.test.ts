import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    startRecordingService,
    getInterruptedRecording,
    updateRecordingSnapshot
} from './foregroundService';

// Mock localStorage
const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('Foreground Service (v5.25.0 - Single Source of Truth)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorageMock.getItem.mockReturnValue(null);
    });

    it('startRecordingService doit sauvegarder originTile dans le snapshot', async () => {
        const originTile = { x: 4270, y: 2891, z: 13 };
        
        await startRecordingService(originTile);
        
        expect(localStorageMock.setItem).toHaveBeenCalled();
        const snapshotArg = localStorageMock.setItem.mock.calls[0][1];
        const snapshot = JSON.parse(snapshotArg);
        
        expect(snapshot.originTile).toEqual(originTile);
        expect(snapshot.isRecording).toBe(true);
        expect(snapshot.pointCount).toBe(0);
    });

    it('startRecordingService doit fonctionner sans originTile (compatibilité)', async () => {
        await startRecordingService();
        
        expect(localStorageMock.setItem).toHaveBeenCalled();
        const snapshotArg = localStorageMock.setItem.mock.calls[0][1];
        const snapshot = JSON.parse(snapshotArg);
        
        expect(snapshot.originTile).toBeUndefined();
        expect(snapshot.isRecording).toBe(true);
    });

    it('getInterruptedRecording doit retourner originTile si présent', () => {
        const snapshot = {
            isRecording: true,
            startTime: Date.now(),
            pointCount: 42,
            originTile: { x: 100, y: 200, z: 13 }
        };
        localStorageMock.getItem.mockReturnValue(JSON.stringify(snapshot));
        
        const result = getInterruptedRecording();
        
        expect(result).not.toBeNull();
        expect(result?.originTile).toEqual({ x: 100, y: 200, z: 13 });
        expect(result?.pointCount).toBe(42);
    });

    it('getInterruptedRecording doit retourner null si pas d\'enregistrement', () => {
        localStorageMock.getItem.mockReturnValue(null);
        
        const result = getInterruptedRecording();
        
        expect(result).toBeNull();
    });

    it('getInterruptedRecording doit retourner null si isRecording est false', () => {
        const snapshot = {
            isRecording: false,
            startTime: Date.now(),
            pointCount: 0
        };
        localStorageMock.getItem.mockReturnValue(JSON.stringify(snapshot));
        
        const result = getInterruptedRecording();
        
        expect(result).toBeNull();
    });

    it('updateRecordingSnapshot doit préserver originTile existante', () => {
        const initialSnapshot = {
            isRecording: true,
            startTime: Date.now(),
            pointCount: 10,
            originTile: { x: 500, y: 600, z: 14 }
        };
        localStorageMock.getItem.mockReturnValue(JSON.stringify(initialSnapshot));
        
        updateRecordingSnapshot(20);
        
        expect(localStorageMock.setItem).toHaveBeenCalled();
        const updatedArg = localStorageMock.setItem.mock.calls[0][1];
        const updated = JSON.parse(updatedArg);
        
        expect(updated.pointCount).toBe(20);
        expect(updated.originTile).toEqual({ x: 500, y: 600, z: 14 });
    });
});

// Note: mergeAndDeduplicatePoints a été supprimé en v5.25.0
// L'architecture "Single Source of Truth" utilise uniquement le natif Android
// pour l'enregistrement GPS, éliminant le besoin de fusionner des points JS et natifs.
