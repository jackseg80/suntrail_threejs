import * as THREE from 'three';
import { state } from './state';
import type { GPXLayer } from './state';
import { attachDraggablePanel } from './ui/draggablePanel';

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

    // Utiliser directement les points 3D densifiés (layer.points)
    // Car gpxDrapePoints a créé des points intermédiaires pour suivre le terrain
    const gpxPoints3D = layer.points;
    
    profileData = [];
    let cumulativeDist = 0;
    let totalDPlus = 0;
    let totalDMinus = 0;

    // Reconstruire les données de profil à partir des positions 3D
    // en calculant les distances et altitudes cumulativement
    for (let i = 0; i < gpxPoints3D.length; i++) {
        const pos = gpxPoints3D[i];
        let slope = 0;
        let ele = pos.y / state.RELIEF_EXAGGERATION; // Convertir Y monde en altitude
        
        if (i > 0) {
            const prevPos = gpxPoints3D[i-1];
            // Distance 3D entre les points (plus précise que Haversine pour les points densifiés)
            const dx = pos.x - prevPos.x;
            const dy = pos.y - prevPos.y;
            const dz = pos.z - prevPos.z;
            const d3d = Math.sqrt(dx*dx + dy*dy + dz*dz) / 1000; // en km
            cumulativeDist += d3d;

            // Calcul D+ / D- (basé sur l'altitude réelle du terrain)
            const prevEle = prevPos.y / state.RELIEF_EXAGGERATION;
            const diff = ele - prevEle;
            if (diff > 0) totalDPlus += diff;
            else totalDMinus += Math.abs(diff);

            // Calcul de la pente locale (%)
            const d2d = Math.sqrt(dx*dx + dz*dz); // Distance horizontale en mètres
            if (d2d > 0.1) { // Éviter division par zéro
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

    // Mise à jour de l'UI des stats
    // Utiliser les stats du layer (calculées avec Haversine) pour cohérence avec l'affichage
    const displayDist = layer.stats?.distance ?? cumulativeDist;
    const displayDPlus = layer.stats?.dPlus ?? totalDPlus;
    const displayDMinus = layer.stats?.dMinus ?? totalDMinus;
    
    // Calculer le ratio pour convertir les distances 3D en distances Haversine
    // (pour que le profil affiche des distances cohérentes avec les stats)
    const distRatio = cumulativeDist > 0 ? displayDist / cumulativeDist : 1;
    
    updateStatsUI(displayDist, displayDPlus, displayDMinus, distRatio);

    drawProfileSVG();
    setupProfileInteractions();
    
    const profileEl = document.getElementById('elevation-profile');
    if (profileEl) {
        profileEl.classList.add('is-open');
        setupSwipeGesture(profileEl);
    }
}

let currentDistRatio = 1; // Ratio pour convertir distance 3D en distance Haversine

function updateStatsUI(dist: number, dPlus: number, dMinus: number, distRatio: number = 1): void {
    // Mettre à jour les éléments gpx-* (GPX importés)
    const dEl = document.getElementById('gpx-dist');
    const pEl = document.getElementById('gpx-dplus');
    const mEl = document.getElementById('gpx-dminus');
    const profileInfo = document.getElementById('profile-info');
    
    // Stocker le ratio pour les interactions futures
    currentDistRatio = distRatio;
    
    if (dEl) dEl.textContent = `${dist.toFixed(2)} km`;
    if (pEl) pEl.textContent = `${Math.round(dPlus)} m D+`;
    if (mEl) mEl.textContent = `${Math.round(dMinus)} m D-`;
    
    // Mettre à jour le panneau de profil d'élévation
    if (profileInfo) {
        profileInfo.textContent = `Distance : ${dist.toFixed(2)}km | D+ : ${Math.round(dPlus)}m | D- : ${Math.round(dMinus)}m`;
    }
    
    // Mettre à jour le panneau Parcours UNIQUEMENT si pas d'enregistrement en cours
    // (pour éviter de mélanger les stats REC avec les stats du profil)
    if (!state.isRecording) {
        const trackDist = document.getElementById('track-dist');
        const trackDplus = document.getElementById('track-dplus');
        const trackDminus = document.getElementById('track-dminus');
        
        if (trackDist) trackDist.innerHTML = `${dist.toFixed(2)} <span style="font-size:13px;color:var(--text-2)">km</span>`;
        if (trackDplus) trackDplus.innerHTML = `+${Math.round(dPlus)} <span style="font-size:12px">m</span>`;
        if (trackDminus) trackDminus.innerHTML = `−${Math.round(dMinus)} <span style="font-size:12px">m</span>`;
    }
}

/**
 * Calcule la distance Haversine entre deux points GPS (en km)
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Dessine le tracé SVG du profil
 */
function drawProfileSVG(): void {
    const svg = document.getElementById('profile-svg') as unknown as SVGSVGElement;
    if (!svg || profileData.length === 0) return;

    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 60;

    const maxDist = profileData[profileData.length - 1].dist;
    const altitudes = profileData.map(p => p.ele);
    const minEle = Math.min(...altitudes);
    const maxEle = Math.max(...altitudes);
    const eleRange = (maxEle - minEle) || 1;

    // Padding vertical pour le graphique (10%)
    const pad = height * 0.1;
    const usableHeight = height - (pad * 2);

    // Génération du chemin SVG
    let pointsStr = "";
    profileData.forEach((p, i) => {
        const x = (p.dist / maxDist) * width;
        const y = height - (pad + ((p.ele - minEle) / eleRange) * usableHeight);
        pointsStr += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
    });

    // Création de l'aire remplie (gradient)
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

/**
 * Gère les interactions sur le graphique
 */
function setupProfileInteractions(): void {
    const container = document.getElementById('profile-chart-container');
    const cursor = document.getElementById('profile-cursor');
    const info = document.getElementById('profile-info');
    const svg = document.getElementById('profile-svg');

    if (!container || !cursor || !info || !svg) return;

    // Création du marqueur 3D s'il n'existe pas
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
        
        // Ajout d'une ligne verticale sous le marqueur
        const lineGeo = new THREE.CylinderGeometry(2, 2, 2000, 8);
        const line = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4 }));
        line.position.y = -1000;
        state.profileMarker.add(line);
        
        state.profileMarker.renderOrder = 2000; // S'assurer qu'il passe devant le tracé
        state.profileMarker.visible = false;
        if (state.scene) state.scene.add(state.profileMarker);
    }

    container.onmousemove = (e) => {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        
        // Ratio de progression sur le parcours (0 à 1)
        const ratio = THREE.MathUtils.clamp(x / width, 0, 1);
        
        // Trouver le point le plus proche dans profileData
        const maxDist = profileData[profileData.length - 1].dist;
        const targetDist = ratio * maxDist;
        
        // Recherche simple (optimisable par dichotomie si besoin)
        let point = profileData[0];
        for (let i = 1; i < profileData.length; i++) {
            if (Math.abs(profileData[i].dist - targetDist) < Math.abs(point.dist - targetDist)) {
                point = profileData[i];
            }
        }

        // Mise à jour visuelle
        cursor.style.display = 'block';
        cursor.style.left = `${(point.dist / maxDist) * 100}%`;
        
        // Appliquer le ratio pour afficher la distance corrigée (Haversine)
        const correctedDist = point.dist * currentDistRatio;
        info.textContent = `Distance : ${correctedDist.toFixed(2)}km | Alt : ${Math.round(point.ele)}m | Pente : ${Math.round(point.slope)}%`;

        // Mise à jour du marqueur 3D
        if (state.profileMarker) {
            // On l'élève de 20m pour qu'il survole le tracé (évite d'être caché dedans)
            state.profileMarker.position.copy(point.pos).add(new THREE.Vector3(0, 20, 0));
            state.profileMarker.visible = true;
        }
    };

    container.onmouseleave = () => {
        cursor.style.display = 'none';
        if (state.profileMarker) state.profileMarker.visible = false;
        // Remettre l'affichage avec les stats complètes du tracé
        const maxDist = profileData.length > 0 ? profileData[profileData.length - 1].dist * currentDistRatio : 0;
        info.textContent = `Distance : ${maxDist.toFixed(2)}km | Alt : 0m`;
    };
    
    // Support mobile (touch)
    container.ontouchmove = (e) => {
        const touch = e.touches[0];
        const moveEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        container.dispatchEvent(moveEvent);
        e.preventDefault();
    };
}

/** Ferme le tiroir du profil d'élévation */
export function closeElevationProfile(): void {
    const profileEl = document.getElementById('elevation-profile');
    if (profileEl) profileEl.classList.remove('is-open');
    if (state.profileMarker) state.profileMarker.visible = false;
}

let swipeAttached = false;

/** Attache le geste swipe-to-dismiss + drag repositionnable sur le drag handle du profil (v5.19.1) */
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
