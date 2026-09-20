import type { RangeResponse, Source } from 'pmtiles';

async function readResponseRange(
    response: Response,
    skipBytes: number,
    length: number
): Promise<ArrayBuffer> {
    if (!response.body) {
        const raw = await response.arrayBuffer();
        if (raw.byteLength < skipBytes + length) {
            throw new Error(
                `Asset PMTiles tronqué: ${raw.byteLength} octets, plage ${skipBytes}+${length}`
            );
        }
        return raw.slice(skipBytes, skipBytes + length);
    }

    const reader = response.body.getReader();
    const output = new Uint8Array(length);
    let remainingSkip = skipBytes;
    let written = 0;
    let streamDone = false;

    try {
        while (written < length) {
            const chunk = await reader.read();
            if (chunk.done) {
                streamDone = true;
                break;
            }

            const value = chunk.value;
            let start = 0;
            if (remainingSkip > 0) {
                const skipped = Math.min(remainingSkip, value.byteLength);
                remainingSkip -= skipped;
                start = skipped;
            }
            if (remainingSkip > 0 || start === value.byteLength) continue;

            const count = Math.min(value.byteLength - start, length - written);
            output.set(value.subarray(start, start + count), written);
            written += count;
        }

        if (remainingSkip > 0 || written < length) {
            throw new Error(
                `Asset PMTiles tronqué: ${written}/${length} octets utiles`
            );
        }
        return output.buffer;
    } finally {
        // Capacitor Android peut annoncer la bonne plage 206 tout en envoyant
        // tous les octets jusqu'à EOF. Annuler ici empêche de matérialiser le
        // reste d'une archive potentiellement multi-gigaoctet.
        if (!streamDone) await reader.cancel().catch(() => undefined);
    }
}

/**
 * PMTiles byte source for files served by the Capacitor Android asset server.
 *
 * Some Android WebView/Capacitor combinations return a correct 206 header but
 * stream every byte from the requested offset to EOF. Constrain the response
 * to the requested length so a tile read cannot retain most of the archive.
 */
export class EmbeddedAssetSource implements Source {
    constructor(private readonly url: string) {}

    getKey(): string {
        return this.url;
    }

    async getBytes(
        offset: number,
        length: number,
        signal?: AbortSignal
    ): Promise<RangeResponse> {
        const response = await fetch(this.url, {
            headers: { Range: `bytes=${offset}-${offset + length - 1}` },
            signal,
        });
        if (!response.ok) {
            throw new Error(`Asset PMTiles: HTTP ${response.status}`);
        }

        let data: ArrayBuffer;
        if (response.status === 206) {
            const contentRange = response.headers.get('content-range');
            const rangeStart = contentRange
                ? Number(/^bytes (\d+)-/.exec(contentRange)?.[1])
                : Number.NaN;
            if (Number.isFinite(rangeStart) && rangeStart !== offset) {
                throw new Error(
                    `Asset PMTiles: début de plage ${rangeStart}, attendu ${offset}`
                );
            }
            data = await readResponseRange(response, 0, length);
        } else {
            data = await readResponseRange(response, offset, length);
        }

        return {
            data,
            etag: response.headers.get('etag') ?? undefined,
            cacheControl: response.headers.get('cache-control') ?? undefined,
            expires: response.headers.get('expires') ?? undefined,
        };
    }
}
