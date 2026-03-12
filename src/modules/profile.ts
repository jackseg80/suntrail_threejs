import * as THREE from 'three';
import { state } from './state';

interface ProfilePoint {
    dist: number; // Distance cumulée en km
    ele: number;  // Altitude en m
    pos: THREE.Vector3; // Position 3D correspondante
}

let profileData: ProfilePoint[] = [];

/**
 * Initialise et dessine le profil d'altitude à partir des données GPX
 */
export function updateElevationProfile(): void {
    if (!state.rawGpxData || !state.gpxPoints.length) return;

    const track = state.rawGpxData.tracks[0];
    const points = track.points;
    const gpxPoints3D = state.gpxPoints;
    
    profileData = [];
    let cumulativeDist = 0;

    for (let i = 0; i < points.length; i++) {
        if (i > 0) {
            // Calcul de la distance entre deux points (en km)
            const p1 = points[i-1];
            const p2 = points[i];
            const d = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
            cumulativeDist += d;
        }
        profileData.push({
            dist: cumulativeDist,
            ele: points[i].ele || 0,
            pos: gpxPoints3D[i]
        });
    }

    drawProfileSVG();
    setupProfileInteractions();
    
    const profileEl = document.getElementById('elevation-profile');
    if (profileEl) profileEl.style.display = 'block';
}

/**
 * Calcule la distance Haversine entre deux points GPS (en km)
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
        const geo = new THREE.SphereGeometry(15, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
        state.profileMarker = new THREE.Mesh(geo, mat);
        // Ajout d'une ligne verticale sous le marqueur
        const lineGeo = new THREE.CylinderGeometry(2, 2, 1000, 8);
        const line = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.5 }));
        line.position.y = -500;
        state.profileMarker.add(line);
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
        
        info.textContent = `Distance : ${point.dist.toFixed(1)}km | Alt : ${Math.round(point.ele)}m`;

        // Mise à jour du marqueur 3D
        if (state.profileMarker) {
            state.profileMarker.position.copy(point.pos);
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
