import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { fetchGeocoding } from '../../utils';
import { autoSelectMapSource, resetTerrain, updateVisibleTiles } from '../../terrain';
import { lngLatToTile, lngLatToWorld } from '../../geo';
import { flyTo } from '../../scene';
import { fetchWeather } from '../../weather';

import { sheetManager } from '../core/SheetManager';

export class SearchSheet extends BaseComponent {
    private geoInput: HTMLInputElement | null = null;
    private geoResults: HTMLElement | null = null;
    private timer: any = null;

    constructor() {
        super('template-search', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        this.geoInput = this.element.querySelector('#geo-input') as HTMLInputElement;
        this.geoResults = this.element.querySelector('#geo-results') as HTMLElement;

        if (this.geoInput && this.geoResults) {
            this.geoInput.addEventListener('input', this.handleInput.bind(this));
        }
    }

    private handleInput(): void {
        if (!this.geoInput || !this.geoResults) return;

        if (this.timer) clearTimeout(this.timer);
        const q = this.geoInput.value.trim().toLowerCase();
        
        if (q.length < 2) { 
            this.geoResults.style.display = 'none'; 
            this.geoResults.textContent = ''; 
            return; 
        }
        
        // 1. AFFICHER LES PICS LOCAUX IMMÉDIATEMENT
        this.geoResults.textContent = ''; 
        const localMatches = state.localPeaks.filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
        if (localMatches.length > 0) {
            localMatches.forEach(p => {
                this.geoResults!.appendChild(this.createGeoItem(p.lat, p.lon, p.name, true, p.name, p.ele));
            });
            this.geoResults.style.display = 'block';
            this.attachListeners();
        }

        // 2. RECHERCHE DISTANTE (MAPTILER / OSM)
        this.timer = setTimeout(async () => {
            try {
                const data = await fetchGeocoding({ query: q });
                if (!data) return;

                // On ne vide pas, on ajoute à la suite des pics locaux
                if (Array.isArray(data)) {
                    data.forEach((f: any) => {
                        const lat = parseFloat(f.lat);
                        const lon = parseFloat(f.lon);
                        if (!isNaN(lat) && !isNaN(lon)) {
                            this.geoResults!.appendChild(this.createGeoItem(lat, lon, f.display_name));
                        }
                    });
                } else if (data.features) {
                    data.features.forEach((f: any) => {
                        const lon = parseFloat(f.geometry.coordinates[0]);
                        const lat = parseFloat(f.geometry.coordinates[1]);
                        if (!isNaN(lat) && !isNaN(lon)) {
                            const label = f.place_name_fr || f.place_name || 'Lieu inconnu';
                            this.geoResults!.appendChild(this.createGeoItem(lat, lon, label));
                        }
                    });
                }

                if (this.geoResults!.children.length > 0) {
                    this.geoResults!.style.display = 'block';
                    this.attachListeners();
                }
            } catch (e) { console.warn("Geocoding error:", e); }
        }, 400);
    }

    private createGeoItem(lat: number, lon: number, label: string, isPeak = false, name = '', ele = 0): HTMLElement {
        const div = document.createElement('div');
        div.className = `geo-item ${isPeak ? 'peak-item' : 'remote-item'}`;
        div.style.cssText = 'padding:12px; cursor:pointer; color:white; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;';
        div.dataset.lat = lat.toString();
        div.dataset.lon = lon.toString();
        if (isPeak) { 
            div.dataset.name = name; 
            div.dataset.ele = ele.toString();
            div.style.color = 'var(--gold)';
        }
        
        const leftSide = document.createElement('div');
        const icon = document.createElement('span');
        icon.textContent = isPeak ? '🏔️ ' : '📍 ';
        leftSide.appendChild(icon);
        
        const text = document.createElement('span');
        text.textContent = label;
        leftSide.appendChild(text);
        div.appendChild(leftSide);
        
        if (isPeak) {
            const altSpan = document.createElement('span');
            altSpan.style.cssText = 'color:var(--t2); font-size:11px;';
            altSpan.textContent = `${Math.round(ele)}m`;
            div.appendChild(altSpan);
        }
        return div;
    }

    private attachListeners() {
        if (!this.geoResults) return;
        this.geoResults.querySelectorAll('.geo-item').forEach(item => {
            (item as HTMLElement).onclick = (e) => {
                e.stopPropagation();
                const lat = parseFloat((item as HTMLElement).dataset.lat!);
                const lon = parseFloat((item as HTMLElement).dataset.lon!);
                
                // CRITICAL: Strict isNaN validation
                if (isNaN(lat) || isNaN(lon)) {
                    console.error("Invalid coordinates in search result");
                    return;
                }
                
                const isPeak = item.classList.contains('peak-item');
                const name = (item as HTMLElement).dataset.name || (item as HTMLElement).querySelector('span:nth-child(2)')?.textContent || '';
                const ele = parseFloat((item as HTMLElement).dataset.ele!) || 0;
                
                this.handleResultClick(lat, lon, isPeak, name, isNaN(ele) ? 0 : ele);
            };
        });
    }

    private handleResultClick(lat: number, lon: number, isPeak: boolean, peakName: string = '', peakEle: number = 0) {
        if (!this.geoResults || !this.geoInput) return;
        
        sheetManager.close();
        this.geoInput.value = '';
        
        if (isPeak) {
            state.TARGET_LAT = lat; 
            state.TARGET_LON = lon;
            autoSelectMapSource(lat, lon);
            state.ZOOM = 14; 
            state.originTile = lngLatToTile(lon, lat, 14);
            
            if (state.controls && state.camera) { 
                state.controls.target.set(0, 0, 0); 
                state.camera.position.set(0, 15000, 20000); 
                state.controls.update(); 
            }
            
            this.refreshTerrain();
            
            setTimeout(() => { 
                const wp = lngLatToWorld(lon, lat, state.originTile);
                // Utilisation de l'altitude exagérée pour la cible world
                flyTo(wp.x, wp.z, peakEle * state.RELIEF_EXAGGERATION); 
            }, 100);
            
            const cp = document.getElementById('coords-panel'); 
            if (cp) {
                cp.style.display = 'block';
                const clickLatLon = document.getElementById('click-latlon');
                if (clickLatLon) clickLatLon.textContent = `🏔️ ${peakName}`;
                const clickAlt = document.getElementById('click-alt');
                if (clickAlt) clickAlt.textContent = `${Math.round(peakEle)} m`;
            }
            
            // Dispatch event for lastClickedCoords update if needed by other modules
            const wp = lngLatToWorld(lon, lat, state.originTile);
            document.dispatchEvent(new CustomEvent('search-result-click', {
                detail: { x: wp.x, z: wp.z, alt: peakEle * state.RELIEF_EXAGGERATION }
            }));
            
        } else {
            state.TARGET_LAT = lat; 
            state.TARGET_LON = lon;
            autoSelectMapSource(lat, lon);
            state.ZOOM = 13; 
            state.originTile = lngLatToTile(lon, lat, 13);
            
            if (state.controls && state.camera) { 
                state.controls.target.set(0, 0, 0); 
                state.camera.position.set(0, 35000, 40000); 
                state.controls.update(); 
            }
            
            this.refreshTerrain(); 
        }
        fetchWeather(lat, lon);
    }

    private refreshTerrain() { 
        resetTerrain(); 
        updateVisibleTiles(); 
    }
}
