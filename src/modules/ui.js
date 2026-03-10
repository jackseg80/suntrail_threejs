import * as THREE from 'three';
import { state } from './state.js';
import { updateSunPosition } from './sun.js';
import { initScene } from './scene.js';
import { loadTerrain, updateVisibleTiles, activeTiles, lngLatToTile, clearLabels } from './terrain.js';

export function initUI() {
    const s1 = localStorage.getItem('maptiler_key_3d');
    if (s1) document.getElementById('k1').value = s1;
    
    document.getElementById('bgo').addEventListener('click', go);
    document.getElementById('k1').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    
    // --- CALENDRIER ---
    const dateInput = document.getElementById('date-input');
    dateInput.valueAsDate = state.simDate;
    dateInput.addEventListener('change', (e) => {
        state.simDate = new Date(e.target.value);
        updateSunPosition(document.getElementById('time-slider').value);
    });

    const timeSlider = document.getElementById('time-slider');
    timeSlider.addEventListener('input', (e) => {
        updateSunPosition(e.target.value);
    });

    // --- CLIC POUR ALTITUDE ---
    window.addEventListener('click', (e) => {
        // On ne déclenche que si on clique sur le canvas Three.js
        if (!state.renderer || !state.camera || !state.scene) return;
        if (e.target.tagName !== 'CANVAS') return;
        
        const mouse = new THREE.Vector2(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, state.camera);
        
        // On récupère toutes les tuiles chargées dans la scène
        const tiles = [];
        for (const tileObj of activeTiles.values()) {
            if (tileObj && tileObj.mesh) tiles.push(tileObj.mesh);
        }
        
        const intersects = raycaster.intersectObjects(tiles, false);
        
        if (intersects.length > 0) {
            const pt = intersects[0].point;
            
            // Calcul de la position inverse (monde -> GPS)
            const dLon = (pt.x / (111320 * Math.cos(state.initialLat * Math.PI / 180)));
            const dLat = -(pt.z / 111320); 
            const lat = state.initialLat + dLat;
            const lon = state.initialLon + dLon;
            
            // L'altitude réelle est pt.y divisé par l'exagération visuelle
            const realAlt = pt.y / state.RELIEF_EXAGGERATION;

            const panel = document.getElementById('coords-panel');
            panel.style.display = 'block';
            document.getElementById('click-latlon').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            document.getElementById('click-alt').textContent = `${Math.round(realAlt)} m`;
        } else {
            document.getElementById('coords-panel').style.display = 'none';
        }
    });

    // --- CONTRÔLES DE PERFORMANCE ---
    const resSlider = document.getElementById('res-slider');
    const rangeSlider = document.getElementById('range-slider');
    const exagSlider = document.getElementById('exag-slider');
    const fogSlider = document.getElementById('fog-slider');
    const shadowToggle = document.getElementById('shadow-toggle');
    const trailsToggle = document.getElementById('trails-toggle');
    const shadowResSelect = document.getElementById('shadow-res-select');
    const pixelLimitSelect = document.getElementById('pixel-limit-select');
    const playBtn = document.getElementById('play-btn');
    const speedSelect = document.getElementById('speed-select');

    playBtn.addEventListener('click', () => {
        state.isAnimating = !state.isAnimating;
        playBtn.textContent = state.isAnimating ? "⏸ Pause" : "▶ Lecture";
        playBtn.style.background = state.isAnimating ? "rgba(59, 130, 246, 0.2)" : "rgba(255,255,255,0.05)";
    });

    speedSelect.addEventListener('change', (e) => {
        state.animationSpeed = parseFloat(e.target.value);
    });

    resSlider.addEventListener('change', async (e) => {
        state.RESOLUTION = parseInt(e.target.value);
        document.getElementById('res-disp').textContent = state.RESOLUTION;
        await refreshTerrain();
    });

    rangeSlider.addEventListener('change', async (e) => {
        state.RANGE = parseInt(e.target.value);
        document.getElementById('range-disp').textContent = state.RANGE;
        await refreshTerrain();
    });

    exagSlider.addEventListener('change', async (e) => {
        state.RELIEF_EXAGGERATION = parseFloat(e.target.value);
        document.getElementById('exag-disp').textContent = state.RELIEF_EXAGGERATION.toFixed(1);
        await refreshTerrain();
    });

    trailsToggle.addEventListener('change', async (e) => {
        state.SHOW_TRAILS = e.target.checked;
        await refreshTerrain();
    });

    shadowResSelect.addEventListener('change', (e) => {
        state.SHADOW_RES = parseInt(e.target.value);
        if (state.sunLight) {
            state.sunLight.shadow.mapSize.width = state.SHADOW_RES;
            state.sunLight.shadow.mapSize.height = state.SHADOW_RES;
            if (state.sunLight.shadow.map) {
                state.sunLight.shadow.map.dispose();
                state.sunLight.shadow.map = null;
            }
        }
    });

    pixelLimitSelect.addEventListener('change', (e) => {
        state.PIXEL_RATIO_LIMIT = parseFloat(e.target.value);
        if (state.renderer) {
            state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
        }
    });

    fogSlider.addEventListener('input', (e) => {
        state.FOG_DENSITY = parseFloat(e.target.value) / 1000000;
        document.getElementById('fog-disp').textContent = e.target.value;
        if (state.scene && state.scene.fog) {
            state.scene.fog.density = state.FOG_DENSITY;
        }
    });

    shadowToggle.addEventListener('change', (e) => {
        state.SHADOWS = e.target.checked;
        if (state.sunLight) {
            state.sunLight.castShadow = state.SHADOWS;
        }
    });

    // Empêcher les contrôles de la caméra sur tous les sliders
    [timeSlider, resSlider, rangeSlider, fogSlider].forEach(slider => {
        ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend'].forEach(evt => {
            slider.addEventListener(evt, (e) => e.stopPropagation(), { passive: false });
        });
    });

    initGeocoding();
    initCollapsibles();
}

function initCollapsibles() {
    // Repliement du panneau principal
    const panel = document.getElementById('panel');
    const panelToggle = document.getElementById('panel-toggle');
    const toggleIcon = document.getElementById('toggle-icon');

    panelToggle.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        toggleIcon.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
    });

    // Repliement de la section Performance
    const perfHeader = document.getElementById('perf-header');
    const perfContent = document.getElementById('perf-content');

    perfHeader.addEventListener('click', () => {
        perfContent.classList.toggle('collapsed');
        perfHeader.classList.toggle('collapsed');
    });
}

async function refreshTerrain() {
    // Destruction totale et reconstruction
    clearLabels();
    for (const [key, tileObj] of activeTiles.entries()) {
        if (tileObj && tileObj.mesh) {
            state.scene.remove(tileObj.mesh);
            tileObj.mesh.geometry.dispose();
            if (tileObj.mesh.material.map) tileObj.mesh.material.map.dispose();
            tileObj.mesh.material.dispose();
        }
    }
    activeTiles.clear();
    await updateVisibleTiles();
}

function go() {
    state.MK = document.getElementById('k1').value.trim();
    if (!state.MK || state.MK.length < 5) {
        document.getElementById('serr').textContent = 'Clé MapTiler invalide.';
        return;
    }
    localStorage.setItem('maptiler_key_3d', state.MK);
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('panel').style.display = 'block';
    document.getElementById('panel-toggle').style.display = 'flex';
    initScene();
}

function initGeocoding() {
    const geoInput = document.getElementById('geo-input');
    const geoResults = document.getElementById('geo-results');
    let geoTimer = null;
    
    geoInput.addEventListener('input', () => {
        clearTimeout(geoTimer);
        const q = geoInput.value.trim();
        if (q.length < 2) { geoResults.style.display = 'none'; return; }
        
        geoTimer = setTimeout(async () => {
            try {
                const r = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${state.MK}&language=fr&limit=6`);
                if (!r.ok) return;
                const data = await r.json();
                if (!data.features || !data.features.length) { geoResults.style.display = 'none'; return; }
                
                geoResults.innerHTML = '';
                data.features.forEach(f => {
                    const item = document.createElement('div');
                    item.style.cssText = 'padding:0.6rem 0.75rem; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.8rem;';
                    const name = f.text || f.place_name || '';
                    item.innerHTML = `<div style="color:white; font-weight:500">${name}</div><div style="color:#8b8d98; font-size:0.7rem;">${f.place_name || ''}</div>`;
                    
                    item.addEventListener('click', async () => {
                        const [lng, lat] = f.center || f.geometry.coordinates;
                        geoResults.style.display = 'none';
                        geoInput.value = name;
                        
                        // 1. Mise à jour des coordonnées globales
                        state.TARGET_LAT = lat;
                        state.TARGET_LON = lng;
                        state.initialLat = lat;
                        state.initialLon = lng;
                        
                        // 2. Réinitialisation de la caméra et du point d'origine du monde
                        if (state.controls) {
                            state.originTile = lngLatToTile(lng, lat, state.ZOOM);
                            state.controls.target.set(0, 0, 0);
                            state.camera.position.set(0, 8000, 12000); // Plus haut
                            state.controls.update();
                        }
                        
                        // 3. Reconstruction du nouveau monde et du soleil
                        await refreshTerrain();
                        updateSunPosition(document.getElementById('time-slider').value);
                    });
                    geoResults.appendChild(item);
                });
                geoResults.style.display = 'block';
            } catch (e) { console.warn('Geocoding error:', e); }
        }, 300);
    });
}
