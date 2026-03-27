import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { fetchGeocoding } from '../../utils';
import { autoSelectMapSource, resetTerrain, updateVisibleTiles } from '../../terrain';
import { lngLatToTile, lngLatToWorld } from '../../geo';
import { flyTo } from '../../scene';
import { fetchWeather } from '../../weather';
import { i18n } from '../../../i18n/I18nService';
import { eventBus } from '../../eventBus';

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

        const closeBtn = this.element.querySelector('#close-search');
        closeBtn?.setAttribute('aria-label', i18n.t('search.aria.close'));
        closeBtn?.addEventListener('click', () => sheetManager.close());

        this.geoInput = this.element.querySelector('#geo-input') as HTMLInputElement;
        this.geoResults = this.element.querySelector('#geo-results') as HTMLElement;

        if (this.geoInput && this.geoResults) {
            // ARIA: search input label and results container
            this.geoInput.setAttribute('aria-label', i18n.t('search.aria.input'));
            this.geoInput.placeholder = i18n.t('search.placeholder');
            // Re-apply placeholder on locale change
            const onLocale = () => { if (this.geoInput) this.geoInput.placeholder = i18n.t('search.placeholder'); };
            eventBus.on('localeChanged', onLocale);
            this.addSubscription(() => eventBus.off('localeChanged', onLocale));

            this.geoResults.setAttribute('role', 'listbox');
            this.geoResults.setAttribute('aria-live', 'polite');

            // --- Empty states ---
            this.createEmptyStates();

            this.geoInput.addEventListener('input', this.handleInput.bind(this));
            
            // Auto-focus when sheet is opened
            const focusTimer = setInterval(() => {
                if (this.element?.classList.contains('is-open')) {
                    this.geoInput?.focus();
                    clearInterval(focusTimer);
                }
            }, 200);
            this.addSubscription(() => clearInterval(focusTimer));
        }
    }

    private handleInput(): void {
        if (!this.geoInput || !this.geoResults) return;

        if (this.timer) clearTimeout(this.timer);
        const q = this.geoInput.value.trim().toLowerCase();
        
        if (q.length < 2) { 
            this.geoResults.style.display = 'none'; 
            this.geoResults.textContent = '';
            this.showSearchEmptyState('initial');
            return; 
        }

        // Hide empty states during search
        this.showSearchEmptyState('none');
        
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
            // Loading spinner (append after local results if any)
            const loadingEl = document.createElement('div');
            loadingEl.className = 'loading-inline';
            loadingEl.setAttribute('role', 'status');
            loadingEl.setAttribute('aria-live', 'polite');
            loadingEl.innerHTML = `<span class="spinner"></span><span>${i18n.t('search.loading')}</span>`;
            this.geoResults!.appendChild(loadingEl);
            this.geoResults!.style.display = 'block';

            try {
                const data = await fetchGeocoding({ query: q });
                loadingEl.remove();
                if (!data) return;

                // On ne vide pas, on ajoute à la suite des pics locaux
                const features = Array.isArray(data) ? data : (data.features || []);
                
                features.forEach((f: any) => {
                    // Format OSM (Nominatim)
                    if (f.lat && f.lon) {
                        const lat = parseFloat(f.lat);
                        const lon = parseFloat(f.lon);
                        if (!isNaN(lat) && !isNaN(lon)) {
                            this.geoResults!.appendChild(this.createGeoItem(lat, lon, f.display_name || f.name));
                        }
                    } 
                    // Format MapTiler (GeoJSON Feature)
                    else if (f.geometry && f.geometry.coordinates) {
                        const lon = parseFloat(f.geometry.coordinates[0]);
                        const lat = parseFloat(f.geometry.coordinates[1]);
                        if (!isNaN(lat) && !isNaN(lon)) {
                            const label = f.place_name_fr || f.place_name || i18n.t('search.unknownPlace');
                            this.geoResults!.appendChild(this.createGeoItem(lat, lon, label));
                        }
                    }
                });

                if (this.geoResults!.children.length > 0) {
                    this.geoResults!.style.display = 'block';
                    this.showSearchEmptyState('none');
                    this.attachListeners();
                } else if (localMatches.length === 0) {
                    this.geoResults!.style.display = 'none';
                    this.showSearchEmptyState('no-results');
                }
            } catch (e) { 
                console.warn("Geocoding error:", e);
                loadingEl.remove();
                if (localMatches.length === 0) {
                    this.geoResults!.innerHTML = `<div class="loading-inline">${i18n.t('search.error')}</div>`;
                    this.geoResults!.style.display = 'block';
                }
            }
        }, 400);
    }

    private createEmptyStates(): void {
        if (!this.element) return;
        const searchEl = this.element.querySelector('#search');
        if (!searchEl) return;

        // Initial state (visible by default)
        const initialDiv = document.createElement('div');
        initialDiv.className = 'empty-state';
        initialDiv.id = 'search-initial-state';
        initialDiv.innerHTML = `
            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
            </svg>
            <p class="empty-state-subtitle" data-i18n="search.empty.subtitle">${i18n.t('search.empty.subtitle')}</p>`;
        searchEl.appendChild(initialDiv);

        // No results state (hidden by default)
        const noResultsDiv = document.createElement('div');
        noResultsDiv.className = 'empty-state';
        noResultsDiv.id = 'search-no-results';
        noResultsDiv.style.display = 'none';
        noResultsDiv.innerHTML = `
            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L8 8H4l8 14 8-14h-4L12 2z"/>
            </svg>
            <p class="empty-state-title" data-i18n="search.noResults.title">${i18n.t('search.noResults.title')}</p>
            <p class="empty-state-subtitle" data-i18n="search.noResults.subtitle">${i18n.t('search.noResults.subtitle')}</p>`;
        searchEl.appendChild(noResultsDiv);
    }

    private showSearchEmptyState(which: 'initial' | 'no-results' | 'none'): void {
        const initialEl = document.getElementById('search-initial-state');
        const noResultsEl = document.getElementById('search-no-results');
        if (initialEl) initialEl.style.display = which === 'initial' ? 'flex' : 'none';
        if (noResultsEl) noResultsEl.style.display = which === 'no-results' ? 'flex' : 'none';
    }

    private createGeoItem(lat: number, lon: number, label: string, isPeak = false, name = '', ele = 0): HTMLElement {
        const div = document.createElement('div');
        div.className = `geo-item ${isPeak ? 'peak-item' : 'remote-item'} srch-geo-item`;
        div.dataset.lat = lat.toString();
        div.dataset.lon = lon.toString();
        if (isPeak) { 
            div.dataset.name = name; 
            div.dataset.ele = ele.toString();
        }
        
        const leftSide = document.createElement('div');
        leftSide.classList.add('srch-left-side');

        const icon = document.createElement('div');
        icon.classList.add('srch-icon');
        icon.innerHTML = isPeak 
            ? `<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 2L6 8l4 2 4-2-4-6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10 10v8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="14" r="2" stroke="currentColor" stroke-width="1" opacity="0.5"/></svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
        
        leftSide.appendChild(icon);
        
        const contentDiv = document.createElement('div');
        const text = document.createElement('div');
        text.className = 'geo-label srch-geo-label';
        if (isPeak) text.classList.add('srch-geo-label-peak');
        text.textContent = label;
        contentDiv.appendChild(text);

        if (isPeak) {
            const sub = document.createElement('div');
            sub.classList.add('srch-peak-sub');
            sub.textContent = i18n.t('search.peak');
            contentDiv.appendChild(sub);
        }

        leftSide.appendChild(contentDiv);
        div.appendChild(leftSide);
        
        if (isPeak) {
            const altSpan = document.createElement('span');
            altSpan.classList.add('srch-alt-badge');
            altSpan.textContent = `${Math.round(ele)} m`;
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
                const name = (item as HTMLElement).dataset.name || (item as HTMLElement).querySelector('.geo-label')?.textContent || '';
                const ele = parseFloat((item as HTMLElement).dataset.ele!) || 0;
                
                this.handleResultClick(lat, lon, isPeak, name, isNaN(ele) ? 0 : ele);
            };
        });
    }

    private handleResultClick(lat: number, lon: number, isPeak: boolean, peakName: string = '', peakEle: number = 0) {
        if (!this.geoResults || !this.geoInput) return;
        
        sheetManager.close();
        this.geoInput.value = '';
        
        state.TARGET_LAT = lat; 
        state.TARGET_LON = lon;
        autoSelectMapSource(lat, lon);
        
        if (isPeak) {
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
                flyTo(wp.x, wp.z, peakEle * state.RELIEF_EXAGGERATION, 3500); 
            }, 100);
            
            const cp = document.getElementById('coords-panel'); 
            if (cp) {
                cp.style.display = 'block';
                const clickLatLon = document.getElementById('click-latlon');
                if (clickLatLon) clickLatLon.textContent = `🏔️ ${peakName}`;
                const clickAlt = document.getElementById('click-alt');
                if (clickAlt) clickAlt.textContent = `${Math.round(peakEle)} m`;
            }
        } else {
            state.ZOOM = 13; 
            state.originTile = lngLatToTile(lon, lat, 13);
            
            if (state.controls && state.camera) { 
                state.controls.target.set(0, 0, 0); 
                state.camera.position.set(0, 35000, 40000); 
                state.controls.update(); 
            }
            
            this.refreshTerrain(); 

            setTimeout(() => { 
                const wp = lngLatToWorld(lon, lat, state.originTile);
                flyTo(wp.x, wp.z, 0, 8000); // Téléportation ville à 8km pour une vue d'ensemble
            }, 100);
        }
        
        fetchWeather(lat, lon);
    }

    private refreshTerrain() { 
        resetTerrain(); 
        updateVisibleTiles(); 
    }
}
