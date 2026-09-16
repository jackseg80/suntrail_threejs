import * as THREE from 'three';
import { state } from './state';
import type { GPXLayer } from './state';
import { calculateHysteresis } from './geoStats';
import { getAltitudeAt, GPX_SURFACE_OFFSET } from './analysis';
import type { RouteSolarAnalysis } from './solarRoute';
import { ICON_EXPAND, ICON_COLLAPSE } from './ui/icons';
import { i18n } from '../i18n/I18nService';
import { eventBus } from './eventBus';

export interface ProfilePoint {
    dist: number; // Distance cumulée en km (corrigée Mercator)
    ele: number; // Altitude réelle en m
    eleSmooth: number; // Altitude lissée en m (moyenne glissante)
    pos: THREE.Vector3; // Position 3D correspondante
    slope: number; // Pente lissée sur fenêtre en %
}

export type SlopeKind = 'climb' | 'flat' | 'descent';

export interface SlopeSegment {
    startIdx: number;
    endIdx: number;
    startDist: number;
    endDist: number;
    avgSlope: number; // Pente moyenne du segment en %
    kind: SlopeKind;
}

// Paramètres de segmentation (style Openrunner) : ajustables.
// On colorie chaque point par sa bande de pente, puis on fusionne les points
// consécutifs de même bande. Une pente qui change souvent donne donc beaucoup
// de bandes courtes, une pente stable de longues sections.
const ELE_SMOOTH_WINDOW_M = 40; // Fenêtre de lissage de l'altitude
const GRADIENT_WINDOW_M = 80; // Fenêtre de calcul de la pente
const FLAT_THRESHOLD_PCT = 1.0; // Seuil montée / plat / descente
const SLOPE_HYST_PCT = 0.75; // Hystérésis pour éviter le clignotement des bandes
const MIN_RUN_M = 40; // En dessous, la bande (1 seul point) est absorbée

// Échelle unique de raideur (0–3, 3–6, 6–9, 9–12, >12 %), appliquée en
// valeur absolue : montées et descentes partagent la même graduation.
// Fond vert pâle et discret pour le plat, saturation/couleur croissante vers
// le rouge puis le brun, et opacité progressive pour renforcer la raideur.
const SLOPE_CATEGORIES = [
    { max: 3, color: '#c7d9a6', opacity: 0.4 },
    { max: 6, color: '#e9c84a', opacity: 0.5 },
    { max: 9, color: '#f0912e', opacity: 0.6 },
    { max: 12, color: '#e14818', opacity: 0.7 },
    { max: Infinity, color: '#8f3a1e', opacity: 0.75 },
];

export function getSlopeCategory(slope: number): number {
    if (slope < 0) return -1;
    for (let i = 0; i < SLOPE_CATEGORIES.length; i++) {
        if (slope < SLOPE_CATEGORIES[i].max) return i;
    }
    return SLOPE_CATEGORIES.length - 1;
}

/**
 * Bande de raideur avec hystérésis : on ne change de bande que si la pente
 * dépasse franchement le seuil, pour éviter que la couleur clignote quand la
 * pente oscille autour de 3 / 6 / 9 / 12 %.
 */
function applyBandHysteresis(band: number, absSlope: number): number {
    const upper = SLOPE_CATEGORIES[band].max;
    const lower = band > 0 ? SLOPE_CATEGORIES[band - 1].max : 0;
    if (absSlope >= upper + SLOPE_HYST_PCT) return getSlopeCategory(absSlope);
    if (band > 0 && absSlope <= lower - SLOPE_HYST_PCT)
        return getSlopeCategory(absSlope);
    return band;
}

function classifySlope(slope: number): SlopeKind {
    if (slope > FLAT_THRESHOLD_PCT) return 'climb';
    if (slope < -FLAT_THRESHOLD_PCT) return 'descent';
    return 'flat';
}

/**
 * Clé de segmentation d'un point : sens (montée/descente/plat) + bande de
 * raideur. Deux points voisins de même clé appartiennent au même segment.
 */
function slopeKey(slope: number): string {
    if (slope > FLAT_THRESHOLD_PCT) return `u${getSlopeCategory(slope)}`;
    if (slope < -FLAT_THRESHOLD_PCT) return `d${getSlopeCategory(-slope)}`;
    return 'f';
}

/**
 * Style d'un segment selon sa raideur (montée et descente confondues) :
 * couleur et opacité croissantes avec la pente.
 */
export function getSlopeSegmentFill(segment: SlopeSegment): {
    color: string;
    opacity: number;
} {
    const category =
        SLOPE_CATEGORIES[getSlopeCategory(Math.abs(segment.avgSlope))];
    return { color: category.color, opacity: category.opacity };
}

/**
 * Moyenne glissante de l'altitude sur une fenêtre de distance.
 * Les distances étant croissantes, l'algorithme à deux pointeurs est O(n).
 */
function smoothElevations(points: ProfilePoint[], windowM: number): void {
    const n = points.length;
    if (n === 0) return;
    const halfKm = windowM / 2000;
    let lo = 0;
    let hi = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const d = points[i].dist;
        while (lo < i && points[lo].dist < d - halfKm) {
            sum -= points[lo].ele;
            lo++;
        }
        while (hi < n && points[hi].dist <= d + halfKm) {
            sum += points[hi].ele;
            hi++;
        }
        points[i].eleSmooth = sum / (hi - lo);
    }
}

/**
 * Pente (%) calculée sur une fenêtre de distance glissante (sécante entre les
 * bords de la fenêtre) plutôt qu'entre deux points densifiés successifs.
 */
function computeWindowedGradients(
    points: ProfilePoint[],
    windowM: number
): void {
    const n = points.length;
    if (n === 0) return;
    const halfKm = windowM / 2000;
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < n; i++) {
        const d = points[i].dist;
        while (lo < n && points[lo].dist < d - halfKm) lo++;
        if (hi < i) hi = i;
        while (hi + 1 < n && points[hi + 1].dist <= d + halfKm) hi++;
        // Points trop espacés pour la fenêtre : forcer au moins un voisin
        if (hi === lo) {
            if (hi < n - 1) hi++;
            else if (lo > 0) lo--;
        }
        const spanM = (points[hi].dist - points[lo].dist) * 1000;
        points[i].slope =
            spanM > 0.1
                ? ((points[hi].eleSmooth - points[lo].eleSmooth) / spanM) * 100
                : 0;
    }
}

/**
 * Pente représentative d'une plage : moyenne des pentes lissées de ses points.
 * On ne réutilise PAS (altitude de fin − altitude de début) / distance, car
 * cette formule s'annule sur un segment qui contient à la fois une montée et
 * une descente (il apparaîtrait alors à tort comme plat).
 */
function meanSlope(
    points: ProfilePoint[],
    startIdx: number,
    endIdx: number
): number {
    let sum = 0;
    const count = endIdx - startIdx + 1;
    for (let i = startIdx; i <= endIdx; i++) sum += points[i].slope;
    return count > 0 ? sum / count : 0;
}

function createSegment(
    points: ProfilePoint[],
    startIdx: number,
    endIdx: number
): SlopeSegment {
    const avgSlope = meanSlope(points, startIdx, endIdx);
    return {
        startIdx,
        endIdx,
        startDist: points[startIdx].dist,
        endDist: points[endIdx].dist,
        avgSlope,
        kind: classifySlope(avgSlope),
    };
}

/**
 * Découpe le profil en bandes (façon Openrunner) : chaque bande regroupe les
 * points consécutifs de même sens et de même raideur. Une pente qui change
 * souvent produit donc beaucoup de bandes courtes, une pente stable de longues
 * sections. Seules les bandes d'un seul point (bruit) sont absorbées.
 */
export function buildSlopeSegments(points: ProfilePoint[]): SlopeSegment[] {
    if (points.length < 2) return [];

    // 1. Regrouper les points consécutifs de même profil (sens + bande de raideur)
    const ranges: Array<{ start: number; end: number }> = [];
    let start = 0;
    let sign = classifySlope(points[0].slope);
    let band = getSlopeCategory(Math.abs(points[0].slope));
    for (let i = 1; i <= points.length; i++) {
        if (i === points.length) {
            ranges.push({ start, end: i - 1 });
            break;
        }
        const nextSign = classifySlope(points[i].slope);
        const nextBand =
            nextSign === sign
                ? applyBandHysteresis(band, Math.abs(points[i].slope))
                : getSlopeCategory(Math.abs(points[i].slope));
        if (nextSign === sign && nextBand === band) continue;
        ranges.push({ start, end: i - 1 });
        sign = nextSign;
        band = nextBand;
        start = i;
    }

    // 2. Dégraisser les bandes d'un seul point (bruit) : les absorber au voisin
    const rangeLengthM = (r: { start: number; end: number }) =>
        (points[r.end].dist - points[r.start].dist) * 1000;
    const cleaned: Array<{ start: number; end: number }> = [];
    for (const r of ranges) {
        if (cleaned.length > 0 && rangeLengthM(r) < MIN_RUN_M) {
            const prev = cleaned[cleaned.length - 1];
            cleaned[cleaned.length - 1] = { start: prev.start, end: r.end };
        } else {
            cleaned.push({ start: r.start, end: r.end });
        }
    }
    if (cleaned.length > 1 && rangeLengthM(cleaned[0]) < MIN_RUN_M) {
        cleaned[1] = { start: cleaned[0].start, end: cleaned[1].end };
        cleaned.shift();
    }

    // 3. Construire les segments et fusionner les voisins de même profil
    const result: SlopeSegment[] = [];
    for (const r of cleaned) {
        const seg = createSegment(points, r.start, r.end);
        const last = result[result.length - 1];
        if (last && slopeKey(last.avgSlope) === slopeKey(seg.avgSlope)) {
            result[result.length - 1] = createSegment(
                points,
                last.startIdx,
                seg.endIdx
            );
        } else {
            result.push(seg);
        }
    }
    return result;
}

let profileData: ProfilePoint[] = [];
let _solarBandData: RouteSolarAnalysis | null = null;
let profileExpanded = false;
let lastProfileStats: { dist: number; dPlus: number; dMinus: number } | null =
    null;

interface ProfileInfoCell {
    label: string;
    value: string;
}

/** Remplit la grille d'infos du profil (libellé + valeur par cellule). */
function setProfileInfoCells(cells: ProfileInfoCell[]): void {
    const info = document.getElementById('profile-info');
    if (!info) return;
    const els = info.querySelectorAll<HTMLElement>('.profile-info-cell');
    els.forEach((el, i) => {
        const cell = cells[i];
        el.hidden = !cell;
        if (!cell) return;
        const label = el.querySelector<HTMLElement>('.profile-info-label');
        const value = el.querySelector<HTMLElement>('.profile-info-value');
        if (label) label.textContent = cell.label;
        if (value) value.textContent = cell.value;
    });
}

/** Résumé (hors survol) : distance, D+, D-. */
function setSummaryInfo(dist: number, dPlus: number, dMinus: number): void {
    setProfileInfoCells([
        {
            label: i18n.t('profile.info.distance'),
            value: `${dist.toFixed(2)} km`,
        },
        {
            label: i18n.t('profile.info.ascent'),
            value: `+${Math.round(dPlus)} m`,
        },
        {
            label: i18n.t('profile.info.descent'),
            value: `−${Math.round(dMinus)} m`,
        },
    ]);
}

export function setSolarBandData(analysis: RouteSolarAnalysis | null): void {
    _solarBandData = analysis;
    drawProfileSVG();
    const btn = document.getElementById(
        'profile-solar-btn'
    ) as HTMLButtonElement | null;
    if (btn) {
        btn.textContent = i18n.t('profile.analysis');
        btn.hidden = !analysis;
        btn.onclick = () =>
            window.dispatchEvent(new CustomEvent('openSolarProbeSheet'));
    }
    // Légende solaire
    const solarLegend = document.getElementById('solar-legend');
    if (solarLegend) {
        solarLegend.hidden = !analysis;
    }
    // Case « ombre inconnue » affichée uniquement si le relief est incomplet
    const unknownLegend = document.getElementById('solar-legend-unknown');
    if (unknownLegend) {
        unknownLegend.hidden = !analysis || analysis.terrainCoverage >= 1;
    }
}

/**
 * Résout le layer GPX actif à utiliser pour le profil
 */
function resolveActiveLayer(layerId?: string): GPXLayer | null {
    if (layerId) {
        return state.gpxLayers.find((l) => l.id === layerId) || null;
    }
    if (state.activeGPXLayerId) {
        return (
            state.gpxLayers.find((l) => l.id === state.activeGPXLayerId) || null
        );
    }
    return state.gpxLayers.length > 0 ? state.gpxLayers[0] : null;
}

/**
 * Initialise et dessine le profil d'altitude à partir des données GPX
 * v5.24.3: Fix mismatch entre points originaux et points densifiés 3D
 */
export function updateElevationProfile(
    layerId?: string,
    opts?: { noOpen?: boolean }
): void {
    const layer = resolveActiveLayer(layerId);
    if (!layer || !layer.points.length) {
        closeElevationProfile();
        return;
    }

    const gpxPoints3D = layer.points;
    if (state.DEBUG_MODE)
        console.log('[Profile] Points count:', gpxPoints3D.length);

    // v5.29.32: Utiliser en priorité les données GPX brutes pour l'altitude
    // avec un mapping correct de l'index pour supporter les points densifiés.
    const rawPoints = layer.rawData?.tracks?.[0]?.points || [];
    const hasRawEle =
        rawPoints.length > 0 && typeof rawPoints[0].ele === 'number';

    profileData = [];
    let cumulativeDist = 0;
    const elevations: number[] = [];

    // Détecter si les données brutes ont une élévation réelle (OSRM → ele=0 partout)
    const maxRawEle = rawPoints.reduce(
        (max: number, p: any) => Math.max(max, p.ele || 0, p.alt || 0),
        0
    );
    const useRawEle = hasRawEle && maxRawEle > 0;

    for (let i = 0; i < gpxPoints3D.length; i++) {
        const pos = gpxPoints3D[i];

        // Altitude : priorité au raw si élévation réelle, sinon Y monde drapé
        let ele: number;
        if (useRawEle) {
            const rawIdx = Math.min(
                rawPoints.length - 1,
                Math.floor((i / gpxPoints3D.length) * rawPoints.length)
            );
            ele = rawPoints[rawIdx].ele || rawPoints[rawIdx].alt || 0;
        } else {
            // v5.56.18: Utiliser le max entre pos.y (drapé) et getAltitudeAt (tuiles actuelles).
            // pos.y préserve l'altitude si les tuiles étaient chargées au moment du draping.
            // getAltitudeAt sert de fallback si les tuiles sont disponibles maintenant.
            const hPos = pos.y - GPX_SURFACE_OFFSET;
            const hTile = getAltitudeAt(pos.x, pos.z);
            const h = Math.max(hPos, hTile);
            ele = Math.max(0, h / state.RELIEF_EXAGGERATION);
        }

        elevations.push(ele);

        if (i > 0) {
            const prevPos = gpxPoints3D[i - 1];
            const dx = pos.x - prevPos.x;
            const dz = pos.z - prevPos.z;
            cumulativeDist += Math.sqrt(dx * dx + dz * dz) / 1000;
        }

        profileData.push({
            dist: cumulativeDist,
            ele: ele,
            eleSmooth: ele,
            pos: pos,
            slope: 0,
        });
    }

    // Correction de la distorsion Mercator : les coordonnées monde Three.js
    // surestiment les distances (facteur ≈ 1/cos(lat) ≈ 1.47 à 47°N).
    // On utilise la distance haversine (layer.stats.distance) comme référence.
    // On corrige AVANT le calcul des pentes pour qu'elles soient dans l'espace réel.
    if (layer.stats?.distance && cumulativeDist > 0) {
        const scaleFactor = layer.stats.distance / cumulativeDist;
        for (const pd of profileData) {
            pd.dist *= scaleFactor;
        }
        cumulativeDist = layer.stats.distance;
    }

    // Lissage de l'altitude puis pente sur fenêtre glissante (style Garmin)
    smoothElevations(profileData, ELE_SMOOTH_WINDOW_M);
    computeWindowedGradients(profileData, GRADIENT_WINDOW_M);

    // Calcul du dénivelé avec l'algorithme d'hystérésis standard (3m)
    const { dPlus, dMinus } = calculateHysteresis(elevations, 3);

    // Mise à jour de l'UI des stats
    const displayDist = layer.stats?.distance ?? cumulativeDist;
    const displayDPlus = layer.stats?.dPlus ?? dPlus;
    const displayDMinus = layer.stats?.dMinus ?? dMinus;

    updateStatsUI(displayDist, displayDPlus, displayDMinus);

    drawProfileSVG();
    setupProfileInteractions();

    const profileEl = document.getElementById('elevation-profile');
    if (profileEl) {
        if (opts?.noOpen) {
            // Rebuild de tuiles : ne pas rouvrir si l'utilisateur a fermé le panel
            return;
        }
        resetProfilePanelPosition(profileEl);
        profileEl.classList.remove('is-open');
        void profileEl.offsetWidth;
        profileEl.classList.add('is-open');
        document.body.classList.toggle(
            'guidance-profile-open',
            document.body.classList.contains('guidance-active')
        );
        setupProfileCloseControl(profileEl);
        setupExpandToggle();
    }
}

function updateStatsUI(dist: number, dPlus: number, dMinus: number): void {
    lastProfileStats = { dist, dPlus, dMinus };
    setSummaryInfo(dist, dPlus, dMinus);

    if (!state.isRecording) {
        const trackDist = document.getElementById('track-dist');
        const trackDplus = document.getElementById('track-dplus');
        const trackDminus = document.getElementById('track-dminus');

        if (trackDist)
            trackDist.innerHTML = `${dist.toFixed(2)} <span class="stat-card-unit stat-card-unit--distance">km</span>`;
        if (trackDplus)
            trackDplus.innerHTML = `+${Math.round(dPlus)} <span class="stat-card-unit">m</span>`;
        if (trackDminus)
            trackDminus.innerHTML = `−${Math.round(dMinus)} <span class="stat-card-unit">m</span>`;
    }
}

export function drawProfileSVG(): void {
    const svg = document.getElementById(
        'profile-svg'
    ) as unknown as SVGSVGElement;
    if (!svg || profileData.length === 0) return;

    const profileEl = document.getElementById('elevation-profile');
    if (profileEl && profileEl.style.display === 'none') {
        profileEl.style.display = 'block';
    }

    const width = svg.clientWidth || window.innerWidth - 40 || 800;
    const height = svg.clientHeight || 100;

    const maxDist = profileData[profileData.length - 1].dist;
    const altitudes = profileData.map((p) => p.ele);
    const minEle = Math.min(...altitudes);
    const maxEle = Math.max(...altitudes);
    const eleRange = maxEle - minEle || 1;

    const padTop = 15;
    const padBottom = _solarBandData ? 24 : 10;
    const usableHeight = height - padTop - padBottom;

    let pointsStr = '';
    profileData.forEach((p, i) => {
        const x = (p.dist / maxDist) * width;
        const y =
            height - (padBottom + ((p.ele - minEle) / eleRange) * usableHeight);
        pointsStr += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
    });

    const slopeArea = buildSlopeSegmentsSVG(
        width,
        height,
        padBottom,
        usableHeight,
        minEle,
        eleRange,
        maxDist
    );

    const solarBand = _solarBandData
        ? buildSolarBandSVG(_solarBandData, width, height)
        : '';

    svg.innerHTML = `
        ${slopeArea}
        <path d="${pointsStr}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" />
        ${solarBand}
    `;
}

function buildSlopeSegmentsSVG(
    width: number,
    height: number,
    padBottom: number,
    usableHeight: number,
    minEle: number,
    eleRange: number,
    maxDist: number
): string {
    const segments = buildSlopeSegments(profileData);
    let paths = '';

    for (const segment of segments) {
        let pathD = '';
        for (let i = segment.startIdx; i <= segment.endIdx; i++) {
            const p = profileData[i];
            const x = (p.dist / maxDist) * width;
            const y =
                height -
                (padBottom + ((p.ele - minEle) / eleRange) * usableHeight);
            pathD += `${i === segment.startIdx ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
        }
        const firstX = (profileData[segment.startIdx].dist / maxDist) * width;
        const lastX = (profileData[segment.endIdx].dist / maxDist) * width;
        pathD += `L ${lastX.toFixed(1)} ${height} L ${firstX.toFixed(1)} ${height} Z`;

        const { color, opacity } = getSlopeSegmentFill(segment);
        paths += `<path d="${pathD}" fill="${color}" fill-opacity="${opacity}" shape-rendering="crispEdges"/>`;
    }

    return paths;
}

function buildSolarBandSVG(
    analysis: RouteSolarAnalysis,
    width: number,
    height: number
): string {
    const BAND_H = 12;
    const BAND_Y = height - BAND_H - 4; // v5.51.4: Un peu d'air par rapport au bord bas
    const totalKm = analysis.totalKm || 1;

    const bgRect = `<rect x="0" y="${BAND_Y}" width="${width}" height="${BAND_H}" fill="rgba(0,0,0,0.35)" rx="2"/>`;
    let segments = '';
    let hasUnknown = false;

    for (let i = 0; i < analysis.points.length - 1; i++) {
        const p = analysis.points[i];
        const pNext = analysis.points[i + 1];
        const x1 = (p.distKm / totalKm) * width;
        const x2 = (pNext.distKm / totalKm) * width;
        const segW = Math.max(1, x2 - x1);

        // Relief manquant : ombre indéterminée, on ne fait pas croire au soleil
        const shadeUnknown =
            !p.isNight &&
            !p.inShadow &&
            !p.inForest &&
            p.terrainKnown === false;
        if (shadeUnknown) hasUnknown = true;

        const fill = shadeUnknown
            ? 'url(#solarShadeUnknown)'
            : p.isNight
              ? 'rgba(10,15,30,0.6)'
              : p.inShadow
                ? 'rgba(71,85,120,0.8)'
                : p.inForest
                  ? 'rgba(30,100,50,0.8)'
                  : 'rgba(245,166,35,0.85)';
        segments += `<rect x="${x1.toFixed(1)}" y="${BAND_Y}" width="${segW.toFixed(1)}" height="${BAND_H}" fill="${fill}"/>`;
    }
    const defs = hasUnknown
        ? '<defs><pattern id="solarShadeUnknown" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(148,163,184,0.22)"/><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(148,163,184,0.85)" stroke-width="1.5"/></pattern></defs>'
        : '';
    return defs + bgRect + segments;
}

// v5.40.28: Redessiner lors du redimensionnement (rotation écran)
window.addEventListener('resize', () => {
    const profileEl = document.getElementById('elevation-profile');
    if (profileEl && profileEl.classList.contains('is-open')) {
        drawProfileSVG();
    }
});

function setupProfileInteractions(): void {
    const container = document.getElementById('profile-chart-container');
    const cursor = document.getElementById('profile-cursor');
    const info = document.getElementById('profile-info');
    const svg = document.getElementById('profile-svg');

    if (!container || !cursor || !info || !svg) return;

    // Recréer le marker s'il a été supprimé par closeElevationProfile()
    if (!state.profileMarker) {
        // v5.53.7 : Réduction de la taille de base (40 -> 6) car l'échelle est maintenant adaptative
        const geo = new THREE.SphereGeometry(6, 32, 32);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 3,
            roughness: 0,
            metalness: 1,
            depthTest: false,
            transparent: true,
        });
        state.profileMarker = new THREE.Mesh(geo, mat);

        // Contour noir proportionnel
        const outlineGeo = new THREE.SphereGeometry(7.2, 32, 32);
        const outlineMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            depthTest: false,
            transparent: true,
            opacity: 0.5,
        });
        const outline = new THREE.Mesh(outlineGeo, outlineMat);
        state.profileMarker.add(outline);

        state.profileMarker.renderOrder = 9999;
        state.profileMarker.visible = false;
        if (state.scene) state.scene.add(state.profileMarker);
    }

    if (profileInteractionsAttached) return;
    profileInteractionsAttached = true;

    let _profileTimer: ReturnType<typeof setTimeout> | null = null;
    let _keepAliveRaf: number | null = null;

    function startKeepAlive() {
        state.isInteractingWithUI = true;
        const tick = () => {
            state.isInteractingWithUI = true;
            _keepAliveRaf = requestAnimationFrame(tick);
        };
        _keepAliveRaf = requestAnimationFrame(tick);
    }
    function stopKeepAlive() {
        if (_keepAliveRaf !== null) {
            cancelAnimationFrame(_keepAliveRaf);
            _keepAliveRaf = null;
        }
        if (_profileTimer) {
            clearTimeout(_profileTimer);
            _profileTimer = null;
        }
        _profileTimer = setTimeout(() => {
            state.isInteractingWithUI = false;
        }, 150);
    }

    function setInteracting() {
        if (_profileTimer) {
            clearTimeout(_profileTimer);
            _profileTimer = null;
        }
        state.isInteractingWithUI = true;
    }

    const onMove = (e: MouseEvent | TouchEvent) => {
        setInteracting(); // Maintenir le renderer actif (évite le Deep Sleep en 2D)
        const rect = container.getBoundingClientRect();
        const clientX =
            (e as MouseEvent).clientX ||
            (e as TouchEvent).touches[0]?.clientX ||
            0;
        const x = clientX - rect.left;
        const width = rect.width;

        const ratio = THREE.MathUtils.clamp(x / width, 0, 1);
        const maxDist = profileData[profileData.length - 1].dist;
        const targetDist = ratio * maxDist;

        let point = profileData[0];
        for (let i = 1; i < profileData.length; i++) {
            if (
                Math.abs(profileData[i].dist - targetDist) <
                Math.abs(point.dist - targetDist)
            ) {
                point = profileData[i];
            }
        }

        cursor.hidden = false;
        cursor.style.left = `${(point.dist / maxDist) * 100}%`;

        let timeValue = '—';
        if (_solarBandData && _solarBandData.points.length > 0) {
            let closest = _solarBandData.points[0];
            for (const sp of _solarBandData.points) {
                if (
                    Math.abs(sp.distKm - point.dist) <
                    Math.abs(closest.distKm - point.dist)
                ) {
                    closest = sp;
                }
            }
            const h = String(closest.evalDate.getHours()).padStart(2, '0');
            const m = String(closest.evalDate.getMinutes()).padStart(2, '0');
            timeValue = `${h}h${m}`;
        }
        setProfileInfoCells([
            {
                label: i18n.t('profile.info.distance'),
                value: `${point.dist.toFixed(2)} km`,
            },
            {
                label: i18n.t('profile.info.altitude'),
                value: `${Math.round(point.ele)} m`,
            },
            {
                label: i18n.t('profile.info.slope'),
                value: `${Math.round(point.slope)}%`,
            },
            { label: i18n.t('profile.info.time'), value: timeValue },
        ]);

        if (state.profileMarker) {
            // v5.53.6 : Échelle adaptative calquée sur computeTrackThickness
            // La base (40) est déjà définie dans la géométrie initiale (SphereGeometry(40)).
            // À LOD 18, l'exposant est 0, scale = 1.
            // À LOD 14, l'exposant est 4, scale = 2^4 = 16.
            const zoom = state.ZOOM || 10;
            const exponent = Math.max(0, 18 - zoom);
            const scale = Math.pow(2, exponent);

            state.profileMarker.scale.setScalar(scale);

            // Ajuster l'offset vertical proportionnellement pour que la sphère "flotte"
            // tout en restant visible (20 pixels monde à LOD 18)
            state.profileMarker.position
                .copy(point.pos)
                .add(new THREE.Vector3(0, 20 * scale, 0));
            state.profileMarker.visible = true;
        }
    };

    // touch-action:none sur le container (HTML) empêche le browser de capturer le scroll
    // et déclencher pointercancel pendant le drag sur mobile
    container.addEventListener('pointerdown', startKeepAlive);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', stopKeepAlive);
    container.addEventListener('pointerleave', stopKeepAlive);
    container.addEventListener('pointercancel', stopKeepAlive);
    _profileListeners = [
        {
            el: container,
            type: 'pointerdown',
            fn: startKeepAlive as unknown as (e: Event) => void,
        },
        {
            el: container,
            type: 'pointermove',
            fn: onMove as unknown as (e: Event) => void,
        },
        {
            el: container,
            type: 'pointerup',
            fn: stopKeepAlive as unknown as (e: Event) => void,
        },
        {
            el: container,
            type: 'pointerleave',
            fn: stopKeepAlive as unknown as (e: Event) => void,
        },
        {
            el: container,
            type: 'pointercancel',
            fn: stopKeepAlive as unknown as (e: Event) => void,
        },
    ];

    container.onmouseleave = () => {
        cursor.hidden = true;
        if (state.profileMarker) state.profileMarker.visible = false;
        if (lastProfileStats) {
            setSummaryInfo(
                lastProfileStats.dist,
                lastProfileStats.dPlus,
                lastProfileStats.dMinus
            );
        }
    };

    let _uiHideTimer: ReturnType<typeof setTimeout> | null = null;
    const profileEl = document.getElementById('elevation-profile');
    if (profileEl) {
        const hideUI = () => {
            if (_uiHideTimer) clearTimeout(_uiHideTimer);
            _uiHideTimer = null;
            document.body.classList.add('profile-interacting');
        };
        const showUI = () => {
            if (_uiHideTimer) clearTimeout(_uiHideTimer);
            _uiHideTimer = setTimeout(() => {
                document.body.classList.remove('profile-interacting');
            }, 250);
        };

        profileEl.addEventListener('pointerdown', hideUI);
        profileEl.addEventListener('pointerup', showUI);
        profileEl.addEventListener('pointerleave', showUI);
        profileEl.addEventListener('pointercancel', showUI);
    }
}

eventBus.on('localeChanged', () => {
    const solarButton = document.getElementById('profile-solar-btn');
    if (solarButton) solarButton.textContent = i18n.t('profile.analysis');
    if (!lastProfileStats) return;
    setSummaryInfo(
        lastProfileStats.dist,
        lastProfileStats.dPlus,
        lastProfileStats.dMinus
    );
});

export function closeElevationProfile(): void {
    document.body.classList.remove('profile-interacting');
    document.body.classList.remove('guidance-profile-open');
    const profileEl = document.getElementById('elevation-profile');
    if (profileEl) {
        profileEl.classList.remove('is-open');
        profileEl.classList.remove('is-expanded');
        resetProfilePanelPosition(profileEl);
    }
    const legend = document.getElementById('profile-legend');
    if (legend) legend.hidden = true;
    const expandBtn = document.getElementById('profile-expand-btn');
    if (expandBtn) {
        if (_expandToggleHandler) {
            expandBtn.removeEventListener('click', _expandToggleHandler);
            _expandToggleHandler = null;
        }
        expandBtn.innerHTML = ICON_EXPAND;
    }
    profileExpanded = false;
    expandToggleAttached = false;
    if (state.profileMarker) {
        state.profileMarker.visible = false;
        state.profileMarker.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach((m) => m.dispose());
                } else {
                    child.material?.dispose();
                }
            }
        });
        if (state.scene) state.scene.remove(state.profileMarker);
        state.profileMarker = null;
    }
    // Cleanup profile interactions listeners
    if (_profileListeners) {
        for (const { el, type, fn } of _profileListeners) {
            el.removeEventListener(type, fn as any);
        }
        _profileListeners = null;
    }
    if (_profileChartTransitionHandler) {
        document
            .getElementById('profile-chart-container')
            ?.removeEventListener(
                'transitionend',
                _profileChartTransitionHandler
            );
        _profileChartTransitionHandler = null;
    }
    profileInteractionsAttached = false;
    expandToggleAttached = false;
}

function setupExpandToggle(): void {
    const btn = document.getElementById('profile-expand-btn');
    if (!btn || expandToggleAttached) return;
    expandToggleAttached = true;

    if (_expandToggleHandler) {
        btn.removeEventListener('click', _expandToggleHandler);
    }

    btn.innerHTML = profileExpanded ? ICON_COLLAPSE : ICON_EXPAND;

    const chart = document.getElementById('profile-chart-container');
    if (chart && !_profileChartTransitionHandler) {
        _profileChartTransitionHandler = (event: TransitionEvent) => {
            if (event.target === chart && event.propertyName === 'height') {
                drawProfileSVG();
            }
        };
        chart.addEventListener('transitionend', _profileChartTransitionHandler);
    }

    if (profileExpanded) {
        const profileEl = document.getElementById('elevation-profile');
        profileEl?.classList.add('is-expanded');
        const legend = document.getElementById('profile-legend');
        if (legend) legend.hidden = false;
    }

    _expandToggleHandler = () => {
        profileExpanded = !profileExpanded;
        const profileEl = document.getElementById('elevation-profile');
        const legend = document.getElementById('profile-legend');

        if (profileExpanded) {
            profileEl?.classList.add('is-expanded');
            btn.innerHTML = ICON_COLLAPSE;
            if (legend) legend.hidden = false;
        } else {
            profileEl?.classList.remove('is-expanded');
            btn.innerHTML = ICON_EXPAND;
            if (legend) legend.hidden = true;
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => drawProfileSVG());
        });
    };

    btn.addEventListener('click', _expandToggleHandler);
}

let profileInteractionsAttached = false;
let expandToggleAttached = false;
let _expandToggleHandler: (() => void) | null = null;
let _profileChartTransitionHandler: ((event: TransitionEvent) => void) | null =
    null;
let _profileCloseButton: HTMLElement | null = null;
const _profileCloseHandler = (): void => closeElevationProfile();
let _profileListeners: Array<{
    el: EventTarget;
    type: string;
    fn: (e: Event) => void;
}> | null = null;

function resetProfilePanelPosition(profileEl: HTMLElement): void {
    profileEl.classList.remove('panel-custom-pos');
    profileEl.style.removeProperty('left');
    profileEl.style.removeProperty('top');
    profileEl.style.removeProperty('right');
    profileEl.style.removeProperty('bottom');
    profileEl.style.removeProperty('transform');
    profileEl.style.removeProperty('transition');
}

function setupProfileCloseControl(profileEl: HTMLElement): void {
    resetProfilePanelPosition(profileEl);
    const closeBtn = profileEl.querySelector<HTMLElement>('#close-profile');
    if (_profileCloseButton === closeBtn) return;
    _profileCloseButton?.removeEventListener('click', _profileCloseHandler);
    _profileCloseButton = closeBtn;
    _profileCloseButton?.addEventListener('click', _profileCloseHandler);
}
