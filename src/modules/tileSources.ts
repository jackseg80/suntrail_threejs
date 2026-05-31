/**
 * tileSources.ts — Configuration data-driven des sources de tuiles par pays (v5.56.0)
 *
 * Architecture :
 *   - Chaque pays a une entrée dans COUNTRY_SOURCES avec ses URLs de tuiles.
 *   - Si un pays n'a pas de config → fallback global (MapTiler → OpenTopoMap → OSM).
 *   - Utilisé par tileLoader.ts (getColorUrl, getOverlayUrl) et terrain.ts (autoSelectMapSource).
 *
 * Pour ajouter une source HD pour un pays :
 *   COUNTRY_SOURCES['DE'] = {
 *     colorTopo: (z, x, y) => `https://my-tile-server.com/${z}/${x}/${y}.png`,
 *     minZoom: 10,
 *   };
 *
 * Détection pays → src/modules/geo.ts (getCountryCode, getCountryAtTile)
 * Données polygones → src/data/countries.ts (Natural Earth 1:10m)
 *
 * Voir aussi : CLAUDE.md § Frontières
 */

export interface TileSourceConfig {
    /** URL color (topo) — callback (z, x, y) => url */
    colorTopo?: (z: number, x: number, y: number) => string;
    /** URL satellite */
    colorSatellite?: (z: number, x: number, y: number) => string;
    /** URL overlay sentiers */
    overlay?: (z: number, x: number, y: number) => string;
    /** Zoom min/max pour la source color (inclusif) */
    minZoom?: number;
    maxZoom?: number;
    /** Si true, la source n'est utilisée que si la tuile est STRICTEMENT dans le pays (5/5) */
    strictAtHighZoom?: {
        thresholdZoom: number;
        useStrictAbove: boolean;
    };
}

// ── Helpers URL ─────────────────────────────────────────────────────────────
// exportés pour pouvoir être utilisés dans le fallback et les configs

export function swisstopoTopo(z: number, x: number, y: number): string {
    return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${z}/${x}/${y}.jpeg`;
}

export function swisstopoSatellite(z: number, x: number, y: number): string {
    return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${z}/${x}/${y}.jpeg`;
}

export function swisstopoTrails(z: number, x: number, y: number): string {
    return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/${z}/${x}/${y}.png`;
}

export function ignTopo(z: number, x: number, y: number): string {
    return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
}

export function ignSatellite(z: number, x: number, y: number): string {
    return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
}

export function basemapAtTopo(z: number, x: number, y: number): string {
    return `https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/${z}/${y}/${x}.png`;
}

export function basemapAtSatellite(z: number, x: number, y: number): string {
    return `https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/${z}/${y}/${x}.jpeg`;
}

export function bkgTopo(z: number, x: number, y: number): string {
    const zStr = String(z).padStart(2, '0');
    return `https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/${zStr}/${y}/${x}.png`;
}

export function ignSpainTopo(z: number, x: number, y: number): string {
    return `https://www.ign.es/wmts/ign-base?service=WMTS&request=GetTile&version=1.0.0&layer=IGNBaseTodo-nofondo&style=default&tilematrixset=GoogleMapsCompatible&tilematrix=${z}&tilerow=${y}&tilecol=${x}&format=image/png`;
}

export function kartverketTopo(z: number, x: number, y: number): string {
    return `https://opencache.statkart.no/gatekeeper/gk/gk.open_wmts?service=WMTS&request=GetTile&version=1.0.0&layer=topo4&style=default&tilematrixset=EPSG:3857&tilematrix=${z}&tilerow=${y}&tilecol=${x}&format=image/png`;
}

export function kartverketSatellite(z: number, x: number, y: number): string {
    return `https://opencache.statkart.no/gatekeeper/gk/gk.open_wmts?service=WMTS&request=GetTile&version=1.0.0&layer=norgeibilder&style=default&tilematrixset=EPSG:3857&tilematrix=${z}&tilerow=${y}&tilecol=${x}&format=image/jpeg`;
}

export function opentopomapUrl(z: number, x: number, y: number): string {
    const sub = ['a', 'b', 'c'][(x + y) % 3];
    return `https://${sub}.tile.opentopomap.org/${z}/${x}/${y}.png`;
}

export function maptilerTopo(
    z: number,
    x: number,
    y: number,
    apiKey: string
): string {
    return `https://api.maptiler.com/maps/topo-v2/256/${z}/${x}/${y}@2x.webp?key=${apiKey}`;
}

export function maptilerSatellite(
    z: number,
    x: number,
    y: number,
    apiKey: string
): string {
    return `https://api.maptiler.com/maps/satellite/256/${z}/${x}/${y}@2x.webp?key=${apiKey}`;
}

export function waymarkedTrails(z: number, x: number, y: number): string {
    return `https://tile.waymarkedtrails.org/hiking/${z}/${x}/${y}.png`;
}

export function osmUrl(z: number, x: number, y: number): string {
    return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

// ── Country sources ─────────────────────────────────────────────────────────

export const COUNTRY_SOURCES: Record<string, TileSourceConfig> = {
    CH: {
        colorTopo: (z, x, y) => swisstopoTopo(z, x, y),
        colorSatellite: (z, x, y) => swisstopoSatellite(z, x, y),
        overlay: (z, x, y) => swisstopoTrails(z, x, y),
        minZoom: 10,
        strictAtHighZoom: { thresholdZoom: 14, useStrictAbove: true },
    },
    FR: {
        colorTopo: (z, x, y) => ignTopo(z, x, y),
        colorSatellite: (z, x, y) => ignSatellite(z, x, y),
        minZoom: 10,
    },
    IT: {
        // Italie : pas de source HD native → fallback OpenTopoMap/MapTiler
        minZoom: 10,
    },
    AT: {
        colorTopo: (z, x, y) => basemapAtTopo(z, x, y),
        colorSatellite: (z, x, y) => basemapAtSatellite(z, x, y),
        minZoom: 10,
    },
    DE: {
        colorTopo: (z, x, y) => bkgTopo(z, x, y),
        minZoom: 10,
    },
    ES: {
        colorTopo: (z, x, y) => ignSpainTopo(z, x, y),
        minZoom: 10,
    },
    // NO: Kartverket topo4 — endpoint inaccessible (timeout), à vérifier localement
    // NO: {
    //     colorTopo: (z, x, y) => kartverketTopo(z, x, y),
    //     colorSatellite: (z, x, y) => kartverketSatellite(z, x, y),
    //     minZoom: 10,
    // },
    //
    // ── Pays à activer après vérification locale des endpoints ──
    // (tests 2026-05-26 : tous inaccessibles depuis l'étranger — 401/403/404/503)
    //
    // République Tchèque (ČÚZK): https://ags.cuzk.gov.cz/arcgis/rest/services/ZM/MapServer/WMTS/tile/1.0.0/ZM/default/GoogleMapsCompatible/{z}/{y}/{x}.png
    // Pologne (Geoportal 2): https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution?service=WMTS&request=GetCapabilities
    // Slovaquie (ZBGIS): https://zbgisws.skgeodesy.sk/zbgisservices/wmts/service.svc/get?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0
    // Finlande (MML): https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png
    // Suède (Lantmäteriet): https://api.lantmateriet.se/open/topowebb-ccby/v1/wmts/tile/1.0.0/topowebb/default/web_mercator/{z}/{y}/{x}.png
    //
    // Japon (GSI Maps) — fonctionne, mais JP pas dans le dataset Natural Earth Europe.
    // Pour activer le Japon, d'abord étendre `scripts/ingest-natural-earth.ts` à l'Asie.
    // URL: https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png
};
