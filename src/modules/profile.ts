import * as THREE from 'three';
import { state } from './state';
import type { GPXLayer } from './state';
import { attachDraggablePanel } from './ui/draggablePanel';
import { calculateHysteresis } from './geoStats';

interface ProfilePoint {
    dist: number; // Distance cumulée en km
    ele: number;  // Altitude en m
    pos: THREE.Vector3; // Position 3D correspondante
    slope: number; // Pente locale en %
}

let profileData: ProfilePoint[] = [];

/**
 * Résout le layer GPX actif à utiliser pour le profil
 */
function resolveActiveLayer(layerId?: string): GPXLayer | null {
    if (layerId) {
        return state.gpxLayers.find(l => l.id === layerId) || null;
    }
    if (state.activeGPXLayerId) {
        return state.gpxLayers.find(l => l.id === state.activeGPXLayerId) || null;
    }
    return state.gpxLayers.length > 0 ? state.gpxLayers[0] : null;
}

/**
 * Initialise et dessine le profil d'altitude à partir des données GPX
 * v5.24.3: Fix mismatch entre points originaux et points densifiés 3D
 */
export function updateElevationProfile(layerId?: string): void {
    console.log('[Profile] Updating elevation profile for layer:', layerId || 'active');
    const layer = resolveActiveLayer(layerId);
    if (!layer || !layer.points.length) {
        console.warn('[Profile] No layer or points found');
        closeElevationProfile();
        return;
    }

    const gpxPoints3D = layer.points;
    console.log('[Profile] Points count:', gpxPoints3D.length);

    // v5.29.32: Utiliser en priorité les données GPX brutes pour l'altitude
    // avec un mapping correct de l'index pour supporter les points densifiés.
    const rawPoints = layer.rawData?.tracks?.[0]?.points || [];
    const hasRawEle = rawPoints.length > 0 && typeof rawPoints[0].ele === 'number';

    profileData = [];
    let cumulativeDist = 0;
    const elevations: number[] = [];
    const GPX_SURFACE_OFFSET = 30; // Doit être cohérent avec terrain.ts

    for (let i = 0; i < gpxPoints3D.length; i++) {
        const pos = gpxPoints3D[i];
        let slope = 0;
        
        // Altitude : priorité au raw, sinon Y monde corrigé
        let ele = 0;
        if (hasRawEle) {
            // Note: gpxPoints3D est densifié (plus de points que raw)
            // On mappe l'index i vers l'index correspondant dans les données brutes
            const rawIdx = Math.min(rawPoints.length - 1, Math.floor((i / gpxPoints3D.length) * rawPoints.length));
            ele = rawPoints[rawIdx].ele || 0;
        } else {
            // Fallback: soustraire l'offset de surface avant de diviser par l'exagération
            const yCorrected = pos.y - GPX_SURFACE_OFFSET;
            ele = Math.max(0, yCorrected / state.RELIEF_EXAGGERATION);
        }
        
        elevations.push(ele);
        
        if (i > 0) {
            const prevPos = gpxPoints3D[i-1];
            const dx = pos.x - prevPos.x;
            const dz = pos.z - prevPos.z;
            const d2d = Math.sqrt(dx*dx + dz*dz); 
            cumulativeDist += d2d / 1000; 

            const prevEle = profileData[i-1].ele;
            const diff = ele - prevEle;
            if (d2d > 0.1) {
                slope = (diff / d2d) * 100;
            }
        }
        
        profileData.push({
            dist: cumulativeDist,
            ele: ele,
            pos: pos,
            slope: slope
        });
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
        // v5.29.28 : Forcer un reflow visuel pour assurer l'animation et l'affichage
        profileEl.classList.remove('is-open');
        void profileEl.offsetWidth; // Force reflow
        profileEl.classList.add('is-open');
        setupSwipeGesture(profileEl);
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
    
    if (profileInfo) {
        profileInfo.textContent = `Distance : ${dist.toFixed(2)}km | D+ : ${Math.round(dPlus)}m | D- : ${Math.round(dMinus)}m`;
    }
    
    if (!state.isRecording) {
        const trackDist = document.getElementById('track-dist');
        const trackDplus = document.getElementById('track-dplus');
        const trackDminus = document.getElementById('track-dminus');
        
        if (trackDist) trackDist.innerHTML = `${dist.toFixed(2)} <span style="font-size:13px;color:var(--text-2)">km</span>`;
        if (trackDplus) trackDplus.innerHTML = `+${Math.round(dPlus)} <span style="font-size:12px">m</span>`;
        if (trackDminus) trackDminus.innerHTML = `−${Math.round(dMinus)} <span style="font-size:12px">m</span>`;
    }
}

export function drawProfileSVG(): void {
    const svg = document.getElementById('profile-svg') as unknown as SVGSVGElement;
    if (!svg || profileData.length === 0) return;

    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 80;

    const maxDist = profileData[profileData.length - 1].dist;
    const altitudes = profileData.map(p => p.ele);
    const minEle = Math.min(...altitudes);
    const maxEle = Math.max(...altitudes);
    const eleRange = (maxEle - minEle) || 1;

    const pad = height * 0.1;
    const usableHeight = height - (pad * 2);

    let pointsStr = "";
    profileData.forEach((p, i) => {
        const x = (p.dist / maxDist) * width;
        const y = height - (pad + ((p.ele - minEle) / eleRange) * usableHeight);
        pointsStr += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
    });

    const areaStr = pointsStr + `L ${width} ${height} L 0 ${height} Z`;

    svg.innerHTML = `
        <defs>
            <linearGradient id="profile-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:var(--accent);stop-opacity:0.4" />
                <stop offset="100%" style="stop-color:var(--accent);stop-opacity:0.0" />
            </linearGradient>
        </defs>
        <path d="${areaStr}" fill="url(#profile-grad)" />
        <path d="${pointsStr}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" />
    `;
}

function setupProfileInteractions(): void {
    const container = document.getElementById('profile-chart-container');
    const cursor = document.getElementById('profile-cursor');
    const info = document.getElementById('profile-info');
    const svg = document.getElementById('profile-svg');

    if (!container || !cursor || !info || !svg) return;

    if (!state.profileMarker) {
        const geo = new THREE.SphereGeometry(25, 32, 32);
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0x00ffff, 
            emissive: 0x00ffff, 
            emissiveIntensity: 2,
            roughness: 0,
            metalness: 1
        });
        state.profileMarker = new THREE.Mesh(geo, mat);
        
        const lineGeo = new THREE.CylinderGeometry(2, 2, 2000, 8);
        const line = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4 }));
        line.position.y = -1000;
        state.profileMarker.add(line);
        
        state.profileMarker.renderOrder = 2000;
        state.profileMarker.visible = false;
        if (state.scene) state.scene.add(state.profileMarker);
    }

    const onMove = (e: MouseEvent | TouchEvent) => {
        const rect = container.getBoundingClientRect();
        const clientX = (e as MouseEvent).clientX || (e as TouchEvent).touches[0].clientX;
        const x = clientX - rect.left;
        const width = rect.width;
        
        const ratio = THREE.MathUtils.clamp(x / width, 0, 1);
        const maxDist = profileData[profileData.length - 1].dist;
        const targetDist = ratio * maxDist;
        
        let point = profileData[0];
        for (let i = 1; i < profileData.length; i++) {
            if (Math.abs(profileData[i].dist - targetDist) < Math.abs(point.dist - targetDist)) {
                point = profileData[i];
            }
        }

        cursor.style.display = 'block';
        cursor.style.left = `${(point.dist / maxDist) * 100}%`;
        info.textContent = `Distance : ${point.dist.toFixed(2)}km | Alt : ${Math.round(point.ele)}m | Pente : ${Math.round(point.slope)}%`;

        if (state.profileMarker) {
            state.profileMarker.position.copy(point.pos).add(new THREE.Vector3(0, 20, 0));
            state.profileMarker.visible = true;
        }
    };

    container.onmousemove = onMove;
    container.ontouchmove = (e) => {
        onMove(e);
        e.preventDefault();
    };

    container.onmouseleave = () => {
        cursor.style.display = 'none';
        if (state.profileMarker) state.profileMarker.visible = false;
        const maxDist = profileData.length > 0 ? profileData[profileData.length - 1].dist : 0;
        info.textContent = `Distance : ${maxDist.toFixed(2)}km | Alt : 0m`;
    };
    
    container.ontouchend = () => {
        cursor.style.display = 'none';
        if (state.profileMarker) state.profileMarker.visible = false;
    };
}

export function closeElevationProfile(): void {
    const profileEl = document.getElementById('elevation-profile');
    if (profileEl) profileEl.classList.remove('is-open');
    if (state.profileMarker) state.profileMarker.visible = false;
}

let swipeAttached = false;

function setupSwipeGesture(profileEl: HTMLElement): void {
    if (swipeAttached) return;
    swipeAttached = true;

    const handle = profileEl.querySelector<HTMLElement>('.profile-drag-handle');
    if (!handle) return;

    attachDraggablePanel({
        panel: profileEl,
        handle,
        customPosClass: 'panel-custom-pos',
        onDismiss: () => closeElevationProfile(),
    });
}
