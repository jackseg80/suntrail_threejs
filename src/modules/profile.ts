import * as THREE from 'three';
import { state } from './state';
import type { GPXLayer } from './state';
import { attachDraggablePanel } from './ui/draggablePanel';
import { calculateHysteresis } from './geoStats';
import { getAltitudeAt, GPX_SURFACE_OFFSET } from './analysis';
import type { RouteSolarAnalysis } from './solarRoute';
import { ICON_EXPAND, ICON_COLLAPSE } from './ui/icons';
import { i18n } from '../i18n/I18nService';
import { eventBus } from './eventBus';

interface ProfilePoint {
    dist: number; // Distance cumulée en km
    ele: number; // Altitude en m
    pos: THREE.Vector3; // Position 3D correspondante
    slope: number; // Pente locale en %
}

const SLOPE_CATEGORIES = [
    { max: 3, color: '#22c55e', label: '0–3%' },
    { max: 6, color: '#eab308', label: '3–6%' },
    { max: 9, color: '#f97316', label: '6–9%' },
    { max: 12, color: '#ef4444', label: '9–12%' },
    { max: Infinity, color: '#991b1b', label: '>12%' },
];

export function getSlopeCategory(slope: number): number {
    if (slope < 0) return -1;
    for (let i = 0; i < SLOPE_CATEGORIES.length; i++) {
        if (slope < SLOPE_CATEGORIES[i].max) return i;
    }
    return SLOPE_CATEGORIES.length - 1;
}

let profileData: ProfilePoint[] = [];
let _solarBandData: RouteSolarAnalysis | null = null;
let profileExpanded = false;
let lastProfileStats: { dist: number; dPlus: number; dMinus: number } | null =
    null;

function formatProfileStats(dist: number, dPlus: number, dMinus: number) {
    return i18n.t('profile.summary', {
        distance: dist.toFixed(2),
        ascent: String(Math.round(dPlus)),
        descent: String(Math.round(dMinus)),
    });
}

export function setSolarBandData(analysis: RouteSolarAnalysis | null): void {
    _solarBandData = analysis;
    drawProfileSVG();
    const btn = document.getElementById(
        'profile-solar-btn'
    ) as HTMLButtonElement | null;
    if (btn) {
        btn.textContent = i18n.t('profile.analysis');
        btn.style.display = analysis ? 'inline-flex' : 'none';
        btn.onclick = () =>
            window.dispatchEvent(new CustomEvent('openSolarProbeSheet'));
    }
    // Légende solaire
    const solarLegend = document.getElementById('solar-legend');
    if (solarLegend) {
        solarLegend.style.display = analysis ? '' : 'none';
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
        let slope = 0;

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
            const d2d = Math.sqrt(dx * dx + dz * dz);
            cumulativeDist += d2d / 1000;

            const prevEle = profileData[i - 1].ele;
            const diff = ele - prevEle;
            if (d2d > 0.1) {
                slope = (diff / d2d) * 100;
            }
        }

        profileData.push({
            dist: cumulativeDist,
            ele: ele,
            pos: pos,
            slope: slope,
        });
    }

    // Correction de la distorsion Mercator : les coordonnées monde Three.js
    // surestiment les distances (facteur ≈ 1/cos(lat) ≈ 1.47 à 47°N).
    // On utilise la distance haversine (layer.stats.distance) comme référence.
    if (layer.stats?.distance && cumulativeDist > 0) {
        const scaleFactor = layer.stats.distance / cumulativeDist;
        for (const pd of profileData) {
            pd.dist *= scaleFactor;
            pd.slope /= scaleFactor; // d2d sous-estimé → pente surestimée, corriger
        }
        cumulativeDist = layer.stats.distance;
    }

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
        profileEl.classList.remove('is-open');
        void profileEl.offsetWidth;
        profileEl.classList.add('is-open');
        setupSwipeGesture(profileEl);
        setupExpandToggle();
    }
}

function updateStatsUI(dist: number, dPlus: number, dMinus: number): void {
    const dEl = document.getElementById('gpx-dist');
    const pEl = document.getElementById('gpx-dplus');
    const mEl = document.getElementById('gpx-dminus');
    const profileInfo = document.getElementById('profile-info');

    if (dEl) dEl.textContent = `${dist.toFixed(2)} km`;
    if (pEl) pEl.textContent = `${Math.round(dPlus)} m D+`;
    if (mEl) mEl.textContent = `${Math.round(dMinus)} m D-`;

    lastProfileStats = { dist, dPlus, dMinus };
    if (profileInfo)
        profileInfo.textContent = formatProfileStats(dist, dPlus, dMinus);

    if (!state.isRecording) {
        const trackDist = document.getElementById('track-dist');
        const trackDplus = document.getElementById('track-dplus');
        const trackDminus = document.getElementById('track-dminus');

        if (trackDist)
            trackDist.innerHTML = `${dist.toFixed(2)} <span style="font-size:13px;color:var(--text-2)">km</span>`;
        if (trackDplus)
            trackDplus.innerHTML = `+${Math.round(dPlus)} <span style="font-size:12px">m</span>`;
        if (trackDminus)
            trackDminus.innerHTML = `−${Math.round(dMinus)} <span style="font-size:12px">m</span>`;
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

    const slopeArea = buildSlopeAreaSVG(
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

function buildSlopeAreaSVG(
    width: number,
    height: number,
    padBottom: number,
    usableHeight: number,
    minEle: number,
    eleRange: number,
    maxDist: number
): string {
    if (profileData.length < 2) return '';

    const botY = height;
    let paths = '';

    let groupStart = 0;
    let currentCat = getSlopeCategory(profileData[1].slope);

    for (let i = 2; i <= profileData.length; i++) {
        const cat =
            i < profileData.length
                ? getSlopeCategory(profileData[i].slope)
                : -1;
        if (cat !== currentCat) {
            const groupEnd = i - 1;
            if (groupEnd > groupStart && currentCat >= 0) {
                let pathD = '';
                for (let j = groupStart; j <= groupEnd; j++) {
                    const x = (profileData[j].dist / maxDist) * width;
                    const y =
                        height -
                        (padBottom +
                            ((profileData[j].ele - minEle) / eleRange) *
                                usableHeight);
                    pathD += `${j === groupStart ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
                }
                const lastX = (profileData[groupEnd].dist / maxDist) * width;
                const firstX = (profileData[groupStart].dist / maxDist) * width;
                pathD += `L ${lastX.toFixed(1)} ${botY} L ${firstX.toFixed(1)} ${botY} Z`;

                paths += `<path d="${pathD}" fill="${SLOPE_CATEGORIES[currentCat].color}" fill-opacity="0.55" shape-rendering="crispEdges"/>`;
            }
            groupStart = i - 1;
            if (i < profileData.length) {
                currentCat = getSlopeCategory(profileData[i].slope);
            }
        }
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

    for (let i = 0; i < analysis.points.length - 1; i++) {
        const p = analysis.points[i];
        const pNext = analysis.points[i + 1];
        const x1 = (p.distKm / totalKm) * width;
        const x2 = (pNext.distKm / totalKm) * width;
        const segW = Math.max(1, x2 - x1);

        const fill = p.isNight
            ? 'rgba(10,15,30,0.6)'
            : p.inShadow
              ? 'rgba(71,85,120,0.8)'
              : p.inForest
                ? 'rgba(30,100,50,0.8)'
                : 'rgba(245,166,35,0.85)';
        segments += `<rect x="${x1.toFixed(1)}" y="${BAND_Y}" width="${segW.toFixed(1)}" height="${BAND_H}" fill="${fill}"/>`;
    }
    return bgRect + segments;
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

        cursor.style.display = 'block';
        cursor.style.left = `${(point.dist / maxDist) * 100}%`;

        let timeStr = '';
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
            timeStr = ` | ${h}h${m}`;
        }
        info.textContent = i18n.t('profile.cursor', {
            distance: point.dist.toFixed(2),
            altitude: String(Math.round(point.ele)),
            slope: String(Math.round(point.slope)),
            time: timeStr,
        });

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
        cursor.style.display = 'none';
        if (state.profileMarker) state.profileMarker.visible = false;
        const maxDist =
            profileData.length > 0
                ? profileData[profileData.length - 1].dist
                : 0;
        info.textContent = i18n.t('profile.cursorIdle', {
            distance: maxDist.toFixed(2),
        });
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
    const info = document.getElementById('profile-info');
    if (info) {
        info.textContent = formatProfileStats(
            lastProfileStats.dist,
            lastProfileStats.dPlus,
            lastProfileStats.dMinus
        );
    }
});

export function closeElevationProfile(): void {
    document.body.classList.remove('profile-interacting');
    const profileEl = document.getElementById('elevation-profile');
    if (profileEl) {
        profileEl.classList.remove('is-open');
        profileEl.classList.remove('is-expanded');
    }
    const legend = document.getElementById('profile-legend');
    if (legend) legend.style.display = 'none';
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
    profileInteractionsAttached = false;
    swipeAttached = false;
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

    if (profileExpanded) {
        const profileEl = document.getElementById('elevation-profile');
        profileEl?.classList.add('is-expanded');
        const legend = document.getElementById('profile-legend');
        if (legend) legend.style.display = 'flex';
    }

    _expandToggleHandler = () => {
        profileExpanded = !profileExpanded;
        const profileEl = document.getElementById('elevation-profile');
        const legend = document.getElementById('profile-legend');

        if (profileExpanded) {
            profileEl?.classList.add('is-expanded');
            btn.innerHTML = ICON_COLLAPSE;
            if (legend) legend.style.display = 'flex';
        } else {
            profileEl?.classList.remove('is-expanded');
            btn.innerHTML = ICON_EXPAND;
            if (legend) legend.style.display = 'none';
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => drawProfileSVG());
        });
    };

    btn.addEventListener('click', _expandToggleHandler);
}

let swipeAttached = false;
let profileInteractionsAttached = false;
let expandToggleAttached = false;
let _expandToggleHandler: (() => void) | null = null;
let _profileListeners: Array<{
    el: EventTarget;
    type: string;
    fn: (e: Event) => void;
}> | null = null;

function setupSwipeGesture(profileEl: HTMLElement): void {
    if (swipeAttached) return;
    swipeAttached = true;

    const closeBtn = profileEl.querySelector<HTMLElement>('#close-profile');
    closeBtn?.addEventListener('click', () => closeElevationProfile());

    const handle = profileEl.querySelector<HTMLElement>('.profile-drag-handle');
    if (!handle) return;

    attachDraggablePanel({
        panel: profileEl,
        handle,
        customPosClass: 'panel-custom-pos',
        onDismiss: () => closeElevationProfile(),
    });
}
