import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadQueue, processLoadQueue, clearLoadQueue } from './terrain/tileQueue';
import { activeTiles } from './terrain';
import { Tile } from './terrain/Tile';
import { state } from './state';

describe('TileQueue Robustness', () => {
    beforeEach(() => {
        clearLoadQueue();
        activeTiles.clear();
        state.MAX_BUILDS_PER_CYCLE = 2;
    });

    it('should filter out tiles from loadQueue if they are no longer in activeTiles', async () => {
        const tile1 = new Tile(0, 0, 15, '15/0/0');
        const tile2 = new Tile(1, 1, 15, '15/1/1');
        
        activeTiles.set(tile1.key, tile1);
        activeTiles.set(tile2.key, tile2);
        
        loadQueue.add(tile1);
        loadQueue.add(tile2);
        
        expect(loadQueue.size).toBe(2);
        
        // Simuler un dezoom : on retire les tuiles de activeTiles
        activeTiles.delete(tile1.key);
        activeTiles.delete(tile2.key);
        
        // On lance le traitement
        await processLoadQueue();
        
        // La file d'attente devrait être vide car les tuiles n'étaient plus dans activeTiles
        expect(loadQueue.size).toBe(0);
    });

    it('should not call load() on tiles that are not in activeTiles', async () => {
        const tile = new Tile(0, 0, 15, '15/0/0');
        const loadSpy = vi.spyOn(tile, 'load').mockResolvedValue(undefined);
        
        loadQueue.add(tile);
        // On ne l'ajoute PAS à activeTiles
        
        await processLoadQueue();
        
        expect(loadSpy).not.toHaveBeenCalled();
        expect(loadQueue.size).toBe(0);
    });
});
