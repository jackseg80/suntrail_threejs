import { i18n } from '../i18n/I18nService';
import { fetchGeocoding } from './utils';

// ── Result classification ─────────────────────────────────────────────
export interface ResultClassification {
    type: 'country' | 'region' | 'city' | 'village' | 'peak' | 'poi';
    zoom: number;
    camDist: number;
}

export const CLASSIFICATIONS: Record<string, ResultClassification> = {
    country:  { type: 'country', zoom: 6,  camDist: 2_000_000 },
    region:   { type: 'region',  zoom: 8,  camDist: 700_000 },
    city:     { type: 'city',    zoom: 11, camDist: 90_000 },
    village:  { type: 'village', zoom: 13, camDist: 45_000 },
    peak:     { type: 'peak',    zoom: 14, camDist: 12_000 },
    poi:      { type: 'poi',     zoom: 13, camDist: 45_000 },
};

/**
 * Classifie une entité géographique selon son type pour définir le zoom et la distance caméra idéaux.
 */
export function classifyFeature(feature: any, isPeak = false): ResultClassification {
    if (isPeak) return CLASSIFICATIONS.peak;

    // MapTiler GeoJSON: place_type array
    const pt = feature.place_type?.[0];
    if (pt === 'country') return CLASSIFICATIONS.country;
    if (pt === 'region' || pt === 'state') return CLASSIFICATIONS.region;
    if (pt === 'place' || pt === 'city') return CLASSIFICATIONS.city;
    if (pt === 'locality' || pt === 'neighborhood') return CLASSIFICATIONS.village;
    if (pt === 'poi') return CLASSIFICATIONS.poi;

    // Nominatim: type + class
    const t = feature.type;
    if (t === 'country' || t === 'continent') return CLASSIFICATIONS.country;
    if (t === 'state' || t === 'region' || t === 'county') return CLASSIFICATIONS.region;
    if (t === 'city' || t === 'town') return CLASSIFICATIONS.city;
    if (t === 'village' || t === 'hamlet' || t === 'suburb') return CLASSIFICATIONS.village;
    if (t === 'peak' || t === 'mountain' || t === 'volcano') return CLASSIFICATIONS.peak;

    return CLASSIFICATIONS.poi;
}

/**
 * Recherche des sommets (peaks) par nom via Overpass API.
 */
export async function searchPeaksByName(query: string): Promise<Array<{ name: string; lat: number; lon: number; ele: number }>> {
    const q = query.replace(/"/g, '\\"');
    const overpassQuery = `[out:json][timeout:5];node["natural"="peak"]["name"~"${q}",i];out 10;`;
    const urls = [
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`,
        `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(overpassQuery)}`,
    ];
    for (const url of urls) {
        try {
            const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!resp.ok) continue;
            const data = await resp.json();
            return (data.elements || [])
                .filter((e: any) => e.tags?.name)
                .map((e: any) => ({
                    name: e.tags.name,
                    lat: e.lat,
                    lon: e.lon,
                    ele: parseFloat(e.tags.ele) || 0,
                }))
                .sort((a: any, b: any) => b.ele - a.ele)
                .slice(0, 10);
        } catch { continue; }
    }
    return [];
}

export interface GeocodingResult {
    lat: number;
    lon: number;
    label: string;
    classification: ResultClassification;
    name?: string;
    ele?: number;
}

/**
 * Récupère le nom d'un lieu (ville, village ou localité) à partir de coordonnées.
 * Utilisé pour le nommage automatique des tracés GPX.
 */
export async function getPlaceName(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
    const data = await fetchGeocoding({ lat, lon }, signal);
    if (!data) return null;

    // MapTiler format
    if (data.features) {
        // Chercher dans l'ordre de précision décroissante
        const types = ['place', 'locality', 'city', 'village', 'neighborhood'];
        for (const type of types) {
            const feat = data.features.find((f: any) => f.place_type?.includes(type));
            if (feat) return feat.text_fr || feat.text || feat.place_name;
        }
        return data.features[0]?.text || data.features[0]?.place_name;
    }

    // Nominatim format (reverse)
    if (data.address) {
        return data.address.city || data.address.town || data.address.village || data.address.hamlet || data.address.suburb || data.address.municipality;
    }

    return null;
}

/**
 * Service de recherche unifié (MapTiler / Nominatim).
 */
export async function searchLocations(query: string, signal?: AbortSignal): Promise<GeocodingResult[]> {
    const geoData = await fetchGeocoding({ query }, signal);
    if (!geoData) return [];

    const results: GeocodingResult[] = [];
    const features = Array.isArray(geoData) ? geoData : (geoData.features || []);

    features.forEach((f: any) => {
        let lat: number, lon: number, label: string;

        // Format OSM (Nominatim)
        if (f.lat && f.lon) {
            lat = parseFloat(f.lat);
            lon = parseFloat(f.lon);
            label = f.display_name || f.name;
        }
        // Format MapTiler (GeoJSON Feature)
        else if (f.geometry?.coordinates) {
            lon = parseFloat(f.geometry.coordinates[0]);
            lat = parseFloat(f.geometry.coordinates[1]);
            label = f.place_name_fr || f.place_name || i18n.t('search.unknownPlace');
        } else return;

        if (isNaN(lat) || isNaN(lon)) return;

        results.push({
            lat, lon, label,
            classification: classifyFeature(f)
        });
    });

    return results;
}
