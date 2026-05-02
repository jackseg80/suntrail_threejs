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
    const layer = resolveActiveLayer(layerId);
    if (!layer || !layer.points.length) {
        closeElevationProfile();
        return;
    }

    const gpxPoints3D = layer.points;
    if (state.DEBUG_MODE) console.log('[Profile] Points count:', gpxPoints3D.length);

    // v5.29.32: Utiliser en priorité les données GPX brutes pour l'altitude
    // avec un mapping correct de l'index pour supporter les points densifiés.
    const rawPoints = layer.rawData?.tracks?.[0]?.points || [];
    const hasRawEle = rawPoints.length > 0 && typeof rawPoints[0].ele === 'number';

    profileData = [];
    let cumulativeDist = 0;
    const elevations: number[] = [];
    const GPX_SURFACE_OFFSET = 12; // Cohérent avec gpxLayers.ts (v5.51.3)

    // Détecter si les données brutes ont une élévation réelle (OSRM → ele=0 partout)
    const maxRawEle = rawPoints.reduce((max: number, p: any) => Math.max(max, (p.ele || 0), (p.alt || 0)), 0);
    const useRawEle = hasRawEle && maxRawEle > 0;

    for (let i = 0; i < gpxPoints3D.length; i++) {
        const pos = gpxPoints3D[i];
        let slope = 0;
        
        // Altitude : priorité au raw si élévation réelle, sinon Y monde drapé
        let ele = 0;
        if (useRawEle) {
            const rawIdx = Math.min(rawPoints.length - 1, Math.floor((i / gpxPoints3D.length) * rawPoints.length));
            ele = rawPoints[rawIdx].ele || rawPoints[rawIdx].alt || 0;
        } else {
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

    // v5.40.28: S'assurer que le conteneur est en display:block pour avoir une largeur réelle
    const profileEl = document.getElementById('elevation-profile');
    if (profileEl && profileEl.style.display === 'none') {
        profileEl.style.display = 'block';
    }

    const width = svg.clientWidth || window.innerWidth - 40 || 800;
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
    if (profileInteractionsAttached) return;
    profileInteractionsAttached = true;

    let _profileTimer: ReturnType<typeof setTimeout> | null = null;

    function setInteracting() {
        if (_profileTimer) { clearTimeout(_profileTimer); _profileTimer = null; }
        state.isInteractingWithUI = true;
    }
    function clearInteracting() {
        _profileTimer = setTimeout(() => { state.isInteractingWithUI = false; }, 150);
    }

    if (!state.profileMarker) {
        // v5.32.14 : Sphère plus grande et depthTest désactivé pour visibilité totale en 3D
        const geo = new THREE.SphereGeometry(40, 32, 32);
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0x00ffff, 
            emissive: 0x00ffff, 
            emissiveIntensity: 2,
            roughness: 0,
            metalness: 1,
            depthTest: false,
            transparent: true // Nécessaire avec depthTest: false pour certaines passes
        });
        state.profileMarker = new THREE.Mesh(geo, mat);
        
        const lineGeo = new THREE.CylinderGeometry(2, 2, 4000, 8);
        const lineMat = new THREE.MeshBasicMaterial({ 
            color: 0x00ffff, 
            transparent: true, 
            opacity: 0.4,
            depthTest: false 
        });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.y = -2000;
        state.profileMarker.add(line);
        
        state.profileMarker.renderOrder = 9999;
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

    container.addEventListener('pointerdown', setInteracting);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', clearInteracting);
    container.addEventListener('pointerleave', clearInteracting);
    container.addEventListener('pointercancel', clearInteracting);
    
    container.onmouseleave = () => {
        cursor.style.display = 'none';
        if (state.profileMarker) state.profileMarker.visible = false;
        const maxDist = profileData.length > 0 ? profileData[profileData.length - 1].dist : 0;
        info.textContent = `Distance : ${maxDist.toFixed(2)}km | Alt : 0m`;
    };
}

export function closeElevationProfile(): void {
    const profileEl = document.getElementById('elevation-profile');
    if (profileEl) profileEl.classList.remove('is-open');
    if (state.profileMarker) state.profileMarker.visible = false;
}

let swipeAttached = false;
let profileInteractionsAttached = false;

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
