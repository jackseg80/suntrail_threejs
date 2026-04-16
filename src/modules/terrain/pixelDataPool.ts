/**
 * pixelDataPool.ts
 * Object pooling pour les tableaux Uint8ClampedArray (pixelData d'altitude).
 * Évite les allocations/désallocations massives qui causent des saccades via le GC.
 */

const TILE_SIZE = 256;
const BUFFER_SIZE = TILE_SIZE * TILE_SIZE * 4; // 65536 bytes
const MAX_POOL_SIZE = 100; // Assez pour couvrir le rayon d'affichage max

class PixelDataPool {
    private pool: Uint8ClampedArray[] = [];

    /**
     * Récupère un buffer prêt à l'emploi.
     */
    public acquire(): Uint8ClampedArray {
        const buffer = this.pool.pop();
        if (buffer) {
            return buffer;
        }
        return new Uint8ClampedArray(BUFFER_SIZE);
    }

    /**
     * Rend un buffer au pool pour réutilisation.
     */
    public release(buffer: Uint8ClampedArray | null): void {
        if (!buffer) return;
        if (this.pool.length < MAX_POOL_SIZE && buffer.length === BUFFER_SIZE) {
            this.pool.push(buffer);
        }
    }

    /**
     * Vide le pool pour libérer la mémoire.
     */
    public clear(): void {
        this.pool = [];
    }
}

export const pixelDataPool = new PixelDataPool();
