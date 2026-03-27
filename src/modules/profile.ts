import * as THREE from 'three';
import { state } from './state';
import type { GPXLayer } from './state';

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
 */
export function updateElevationProfile(layerId?: string): void {
    const layer = resolveActiveLayer(layerId);
    if (!layer || !layer.points.length) {
        const profileEl = document.getElementById('elevation-profile');
        if (profileEl) profileEl.style.display = 'none';
        return;
    }

    const track = layer.rawData.tracks[0];
    const points = track.points;
    const gpxPoints3D = layer.points;
    
    profileData = [];
    let cumulativeDist = 0;
    let totalDPlus = 0;
    let totalDMinus = 0;

    for (let i = 0; i < points.length; i++) {
        let slope = 0;
        if (i > 0) {
            const p1 = points[i-1];
            const p2 = points[i];
            const d = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon); // en km
            cumulativeDist += d;

            // Calcul D+ / D-
            const diff = (p2.ele || 0) - (p1.ele || 0);
            if (diff > 0) totalDPlus += diff;
            else totalDMinus += Math.abs(diff);

            // Calcul de la pente locale (%) : (m / m) * 100
            if (d > 0.001) { // Éviter division par zéro (min 1m)
                slope = (diff / (d * 1000)) * 100;
            }
        }
        profileData.push({
            dist: cumulativeDist,
            ele: points[i].ele || 0,
            pos: gpxPoints3D[i],
            slope: slope
        });
    }

    // Mise à jour de l'UI des stats
    updateStatsUI(cumulativeDist, totalDPlus, totalDMinus);

    drawProfileSVG();
    setupProfileInteractions();
    
    const profileEl = document.getElementById('elevation-profile');
    if (profileEl) profileEl.style.display = 'block';
}

function updateStatsUI(dist: number, dPlus: number, dMinus: number): void {
    const dEl = document.getElementById('gpx-dist') || document.getElementById('track-dist');
    const pEl = document.getElementById('gpx-dplus') || document.getElementById('track-dplus');
    const mEl = document.getElementById('gpx-dminus') || document.getElementById('track-dminus');
    if (dEl) dEl.textContent = `${dist.toFixed(1)} km`;
    if (pEl) pEl.textContent = `${Math.round(dPlus)} m D+`;
    if (mEl) mEl.textContent = `${Math.round(dMinus)} m D-`;
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
        
        info.textContent = `Distance : ${point.dist.toFixed(1)}km | Alt : ${Math.round(point.ele)}m | Pente : ${Math.round(point.slope)}%`;

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
        info.textContent = `Distance : 0km | Alt : 0m`;
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
