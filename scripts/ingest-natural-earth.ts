/**
 * ingest-natural-earth.ts
 *
 * Télécharge Natural Earth 1:10m admin countries, extrait les pays européens,
 * simplifie les polygones (Ramer-Douglas-Peucker, ~1-2km) et génère
 * le fichier source src/data/countries.ts.
 *
 * Usage : npx tsx scripts/ingest-natural-earth.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { Buffer } from 'node:buffer';

const DATA_URL =
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';

const OUTPUT_PATH = path.resolve(__dirname, '../src/data/countries.ts');

const EPSILON = 0.015;      // ~1.6km en degrés
const MAX_RINGS = 3;        // Max polygones par pays (continent + 2 îles max)
const MIN_POINTS = 6;       // Minimum de points pour un polygone valide
const POINT_DECIMALS = 3;   // Précision ~111m

/** BBox de filtrage Europe (exclut territoires d'outre-mer). */
const EUROPE_BBOX = { minLat: 32, maxLat: 73, minLon: -25, maxLon: 50 };

/** Fuseau Russie : ne garder que la partie européenne (ouest de 60°E). */
const RU_MAX_LON = 60;

/** Pays européens (ISO 3166-1 alpha-2) à inclure. */
const EUROPE_CODES = new Set([
    'AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ',
    'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU',
    'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MD', 'ME', 'MK',
    'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI',
    'SK', 'SM', 'UA', 'VA', 'XK', 'MC',
    'FO', 'IM', 'JE', 'GG', 'GI',
    'TR', 'GE', 'AM', 'AZ',
]);

interface GeoJSONFeature {
    type: 'Feature';
    properties: {
        ISO_A2?: string;
        ISO_A2_EH?: string;
        ADMIN?: string;
        CONTINENT?: string;
    };
    geometry: {
        type: 'Point' | 'MultiPoint' | 'LineString' | 'MultiLineString' | 'Polygon' | 'MultiPolygon';
        coordinates: number[][][] | number[][][][];
    };
}

interface GeoJSON {
    type: 'FeatureCollection';
    features: GeoJSONFeature[];
}

interface CountryDef {
    polygons: number[][][];
    bbox: BBox;
}

interface BBox { minLat: number; maxLat: number; minLon: number; maxLon: number; }

// ── RDP simplifié ────────────────────────────────────────────────────────

function rdp(points: number[][], epsilon: number): number[][] {
    if (points.length <= 2) return points;
    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0];
    const last = points[points.length - 1];
    const dx = last[0] - first[0];
    const dy = last[1] - first[1];
    const lenSq = dx * dx + dy * dy;
    for (let i = 1; i < points.length - 1; i++) {
        let d: number;
        if (lenSq === 0) {
            d = Math.hypot(points[i][0] - first[0], points[i][1] - first[1]);
        } else {
            let t = ((points[i][0] - first[0]) * dx + (points[i][1] - first[1]) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
            d = Math.hypot(points[i][0] - (first[0] + t * dx), points[i][1] - (first[1] + t * dy));
        }
        if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > epsilon) {
        const left = rdp(points.slice(0, maxIdx + 1), epsilon);
        const right = rdp(points.slice(maxIdx), epsilon);
        const result = left.slice(0, -1);
        result.push(...right);
        return result;
    }
    return [first, last];
}

// ── BBox ─────────────────────────────────────────────────────────────────

function ringBBox(ring: number[][]): BBox {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const [lon, lat] of ring) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
    }
    return { minLat, maxLat, minLon, maxLon };
}

function unionBBox(polygons: number[][][]): BBox {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const ring of polygons) {
        const b = ringBBox(ring);
        if (b.minLat < minLat) minLat = b.minLat;
        if (b.maxLat > maxLat) maxLat = b.maxLat;
        if (b.minLon < minLon) minLon = b.minLon;
        if (b.maxLon > maxLon) maxLon = b.maxLon;
    }
    return { minLat, maxLat, minLon, maxLon };
}

function bboxIsInEurope(b: BBox): boolean {
    return b.minLon >= EUROPE_BBOX.minLon && b.maxLon <= EUROPE_BBOX.maxLon &&
           b.minLat >= EUROPE_BBOX.minLat && b.maxLat <= EUROPE_BBOX.maxLat;
}

// ── Extraction ───────────────────────────────────────────────────────────

function extractPolygons(geometry: GeoJSONFeature['geometry']): number[][][] {
    const out: number[][][] = [];
    if (geometry.type === 'Polygon') {
        for (const ring of geometry.coordinates as number[][][]) {
            out.push(ring);
        }
    } else if (geometry.type === 'MultiPolygon') {
        for (const poly of geometry.coordinates as number[][][][]) {
            for (const ring of poly) {
                out.push(ring);
            }
        }
    }
    return out;
}

// ── HTTP GET ─────────────────────────────────────────────────────────────

function httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return httpGet(res.headers.location!).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        }).on('error', reject);
    });
}

// ── Formatage ────────────────────────────────────────────────────────────

function fmt(n: number): string {
    return n.toFixed(POINT_DECIMALS);
}

function ringToString(ring: number[][]): string {
    const parts: string[] = [];
    for (const [lon, lat] of ring) {
        parts.push(`[${fmt(lon)},${fmt(lat)}]`);
    }
    return parts.join(',');
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
    console.log('[Ingest] Téléchargement Natural Earth 1:10m...');
    const raw = await httpGet(DATA_URL);
    const geo: GeoJSON = JSON.parse(raw);
    console.log(`[Ingest] ${geo.features.length} features chargés.`);

    const countries: Record<string, CountryDef> = {};
    let skipped = 0;
    let excludedRings = 0;

    for (const feat of geo.features) {
        const isoA2 = feat.properties.ISO_A2;
        const isoEH = feat.properties.ISO_A2_EH;
        const code = (isoA2 && isoA2 !== '-99') ? isoA2 : isoEH;
        if (!code || !EUROPE_CODES.has(code)) { skipped++; continue; }

        // Ignorer les features dupliqués (ex: territoire d'outre-mer traité séparément)
        if (countries[code]) { skipped++; continue; }

        const rings = extractPolygons(feat.geometry);
        if (rings.length === 0) { skipped++; continue; }

        // Simplifier chaque anneau (sauf micro-états : skip si < 20 pts)
        let simplified = rings.map(ring => {
            if (ring.length <= 20) return ring;
            const simplified = rdp(ring, EPSILON);
            return simplified.length >= MIN_POINTS ? simplified : ring.slice(0, Math.min(ring.length, 20));
        });

        // Filtrer : ne garder que les anneaux en Europe
        let filtered = simplified.filter(ring => bboxIsInEurope(ringBBox(ring)));
        excludedRings += simplified.length - filtered.length;

        // Pour la Russie : limiter la longitude
        if (code === 'RU') {
            filtered = filtered.map(ring => ring.filter(([lon]) => lon <= RU_MAX_LON));
            filtered = filtered.filter(ring => ring.length >= MIN_POINTS);
        }

        if (filtered.length === 0) {
            console.warn(`  ⚠ ${code} : 0 anneau européen valide après filtre`);
            skipped++; continue;
        }

        // Garder les anneaux les plus longs (continent principal + îles majeures)
        filtered.sort((a, b) => b.length - a.length);
        filtered = filtered.slice(0, MAX_RINGS);

        // Deuxième passe : si l'anneau principal > 300 pts, simplifier davantage
        if (filtered.length > 0 && filtered[0].length > 300) {
            filtered[0] = rdp(filtered[0], EPSILON * 2);
        }

        // Supprimer les anneaux trop courts
        filtered = filtered.filter(r => r.length >= MIN_POINTS);

        countries[code] = {
            polygons: filtered,
            bbox: unionBBox(filtered),
        };

        const name = feat.properties.ADMIN || code;
        const totalPts = filtered.reduce((s, r) => s + r.length, 0);
        const b = countries[code].bbox;
        console.log(`  ✓ ${code} (${name}) : ${filtered.length} polygones, ${totalPts} pts, bbox ${b.minLat.toFixed(1)}..${b.maxLat.toFixed(1)}`);
    }

    console.log(`[Ingest] ${Object.keys(countries).length} pays, ${excludedRings} anneaux hors-Europe exclus.`);
    console.log(`[Ingest] ${skipped} features ignorés.`);

    const ts = generateTypeScript(countries);
    fs.writeFileSync(OUTPUT_PATH, ts, 'utf-8');
    console.log(`[Ingest] Écrit dans ${OUTPUT_PATH}`);
    console.log(`[Ingest] Taille : ${(Buffer.byteLength(ts, 'utf-8') / 1024).toFixed(1)} Ko`);
}

function generateTypeScript(countries: Record<string, CountryDef>): string {
    const codes = Object.keys(countries).sort();
    const lines: string[] = [];

    lines.push('/**');
    lines.push(' * Frontières européennes (Natural Earth 1:10m).');
    lines.push(` * Généré par scripts/ingest-natural-earth.ts — ${new Date().toISOString().slice(0, 10)}`);
    lines.push(' *');
    lines.push(` * ${codes.length} pays : ${codes.join(', ')}`);
    lines.push(' */');
    lines.push('');
    lines.push('export interface CountryDef {');
    lines.push('    polygons: number[][][];');
    lines.push('    bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };');
    lines.push('}');
    lines.push('');
    lines.push('export const COUNTRIES: Record<string, CountryDef> = {');

    for (const code of codes) {
        const c = countries[code];
        lines.push(`  ${code}: {`);
        lines.push(`    polygons: [`);
        for (const ring of c.polygons) {
            lines.push(`      [${ringToString(ring)}],`);
        }
        lines.push(`    ],`);
        const b = c.bbox;
        lines.push(`    bbox: { minLat: ${fmt(b.minLat)}, maxLat: ${fmt(b.maxLat)}, minLon: ${fmt(b.minLon)}, maxLon: ${fmt(b.maxLon)} },`);
        lines.push(`  },`);
    }

    lines.push('};');
    lines.push('');
    return lines.join('\n');
}

main().catch(e => {
    console.error('[Ingest] Erreur :', e.message || e);
    process.exit(1);
});
