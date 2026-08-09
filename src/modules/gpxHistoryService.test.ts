import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./eventBus', () => ({ eventBus: { emit: vi.fn() } }));
vi.mock('./geo', () => ({
    getCountryCode: vi.fn(() => null),
    COUNTRY_NAMES: {},
}));

import { clearHistory, loadHistory, saveToHistory } from './gpxHistoryService';
import { STORAGE_KEYS } from '../constants/storage';

function makeLayer(id: string, pointOffset = 0) {
    const points = Array.from({ length: 401 }, (_, index) => ({
        lat: 46.5 + pointOffset + index * 0.00001,
        lon: 7.5 + pointOffset + index * 0.00001,
        ele: 900 + index,
    }));
    return {
        id,
        name: 'Boucle du lac.gpx',
        color: '#00ff00',
        rawData: { tracks: [{ points }] },
        stats: {
            distance: 8.25,
            dPlus: 420,
            dMinus: 420,
            pointCount: points.length,
        },
    } as any;
}

describe('GPX history deduplication', () => {
    beforeEach(() => {
        localStorage.clear();
        clearHistory();
    });

    afterEach(() => {
        localStorage.clear();
        clearHistory();
    });

    it('keeps one imported history entry when the same full GPX is imported twice', () => {
        saveToHistory(makeLayer('import-a'), 'import');
        saveToHistory(makeLayer('import-b'), 'import');

        const history = loadHistory();
        expect(history).toHaveLength(1);
        expect(history[0].id).toBe('import-b');
        expect(history[0].contentHash).toBeTruthy();
    });

    it('does not merge independent REC recordings that follow the same geometry', () => {
        saveToHistory(makeLayer('rec-a'), 'rec');
        saveToHistory(makeLayer('rec-b'), 'rec');

        expect(loadHistory()).toHaveLength(2);
    });

    it('removes duplicate legacy imported entries when the history is read', () => {
        const first = makeLayer('legacy-a');
        const second = makeLayer('legacy-b');
        saveToHistory(first, 'import');
        const stored = JSON.parse(
            localStorage.getItem(STORAGE_KEYS.GPX_HISTORY) || '[]'
        );
        stored.push({ ...stored[0], id: second.id, timestamp: Date.now() + 1 });
        stored.forEach((entry: any) => delete entry.contentHash);
        clearHistory();
        localStorage.setItem(STORAGE_KEYS.GPX_HISTORY, JSON.stringify(stored));

        expect(loadHistory()).toHaveLength(1);
    });
});
