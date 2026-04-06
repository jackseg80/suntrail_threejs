import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    mergeAndDeduplicatePoints,
    startRecordingService,
    getInterruptedRecording,
    updateRecordingSnapshot
} from './foregroundService';
import type { LocationPoint } from './state';

// Mock localStorage
const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

function pt(timestamp: number, lat = 46.0, lon = 7.0, alt = 1000): LocationPoint {
    return { lat, lon, alt, timestamp };
}

describe('mergeAndDeduplicatePoints', () => {
    it('retourne un tableau vide si les deux entrées sont vides', () => {
        expect(mergeAndDeduplicatePoints([], [])).toEqual([]);
    });

    it('retourne les points JS triés par timestamp si natifs vides', () => {
        const js = [pt(3000), pt(1000), pt(2000)];
        const result = mergeAndDeduplicatePoints(js, []);
        expect(result.map(p => p.timestamp)).toEqual([1000, 2000, 3000]);
    });

    it('retourne les points natifs triés par timestamp si JS vides', () => {
        const native = [pt(6000), pt(4000), pt(5000)];
        const result = mergeAndDeduplicatePoints([], native);
        expect(result.map(p => p.timestamp)).toEqual([4000, 5000, 6000]);
    });

    it('merge et trie correctement deux tableaux sans chevauchement', () => {
        const js     = [pt(1000), pt(2000), pt(3000)];
        const native = [pt(4000), pt(5000), pt(6000)];
        const result = mergeAndDeduplicatePoints(js, native);
        expect(result.map(p => p.timestamp)).toEqual([1000, 2000, 3000, 4000, 5000, 6000]);
        expect(result).toHaveLength(6);
    });

    it('déduplique les points chevauchants (< 500ms d\'écart)', () => {
        // JS a un point à t=3000, natif a un point à t=3200 (200ms plus tard — chevauchement)
        const js     = [pt(1000), pt(2000), pt(3000)];
        const native = [pt(3200), pt(4000), pt(5000)];
        const result = mergeAndDeduplicatePoints(js, native);
        // t=3200 doit être supprimé (< 500ms après t=3000)
        expect(result.map(p => p.timestamp)).toEqual([1000, 2000, 3000, 4000, 5000]);
        expect(result).toHaveLength(5);
    });

    it('conserve les points dont l\'écart est exactement > 500ms', () => {
        const js     = [pt(1000), pt(2000)];
        const native = [pt(2501)];  // 501ms après t=2000 → doit être conservé
        const result = mergeAndDeduplicatePoints(js, native);
        expect(result).toHaveLength(3);
        expect(result[2].timestamp).toBe(2501);
    });

    it('supprime les doublons à timestamp identique', () => {
        const js     = [pt(1000), pt(2000), pt(3000)];
        const native = [pt(2000), pt(3000), pt(4000)];
        const result = mergeAndDeduplicatePoints(js, native);
        // t=2000 et t=3000 en double doivent être dédupliqués
        expect(result.map(p => p.timestamp)).toEqual([1000, 2000, 3000, 4000]);
    });

    it('préserve les données lat/lon/alt correctement après merge', () => {
        const js     = [pt(1000, 46.1, 7.1, 1100)];
        const native = [pt(2000, 46.2, 7.2, 1200)];
        const result = mergeAndDeduplicatePoints(js, native);
        expect(result[0]).toEqual({ lat: 46.1, lon: 7.1, alt: 1100, timestamp: 1000 });
        expect(result[1]).toEqual({ lat: 46.2, lon: 7.2, alt: 1200, timestamp: 2000 });
    });

    it('ne crashe pas sur de grands volumes (1000+ points)', () => {
        const js: LocationPoint[]     = [];
        const native: LocationPoint[] = [];
        for (let i = 0; i < 600; i++) js.push(pt(i * 3000));
        for (let i = 0; i < 600; i++) native.push(pt(i * 3000 + 1500));
        expect(() => mergeAndDeduplicatePoints(js, native)).not.toThrow();
        const result = mergeAndDeduplicatePoints(js, native);
        expect(result.length).toBe(1200);
    });

    it('gère un seul point dans un seul tableau', () => {
        const result = mergeAndDeduplicatePoints([pt(5000)], []);
        expect(result).toHaveLength(1);
        expect(result[0].timestamp).toBe(5000);
    });

    it('gère plusieurs chevauchements consécutifs', () => {
        // Scénario : app revient en foreground après 3s de background
        // JS a arrêté à t=10000, natif a des points à t=10100, t=10200, t=10300 (tous < 500ms du dernier JS)
        const js     = [pt(8000), pt(9000), pt(10000)];
        const native = [pt(10100), pt(10200), pt(10300), pt(13000), pt(16000)];
        const result = mergeAndDeduplicatePoints(js, native);
        // t=10100, 10200, 10300 doivent être supprimés (< 500ms après t=10000/10100/10200)
        expect(result.map(p => p.timestamp)).toEqual([8000, 9000, 10000, 13000, 16000]);
    });
});

describe('Persistance recordingOriginTile (v5.24.5)', () => {
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
