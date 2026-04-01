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

// ── Result classification ─────────────────────────────────────────────
interface ResultClassification {
    type: 'country' | 'region' | 'city' | 'village' | 'peak' | 'poi';
    zoom: number;
    camDist: number;
}

const CLASSIFICATIONS: Record<string, ResultClassification> = {
    country:  { type: 'country', zoom: 6,  camDist: 2_000_000 },
    region:   { type: 'region',  zoom: 8,  camDist: 700_000 },
    city:     { type: 'city',    zoom: 11, camDist: 90_000 },
    village:  { type: 'village', zoom: 13, camDist: 45_000 },
    peak:     { type: 'peak',    zoom: 14, camDist: 12_000 },
    poi:      { type: 'poi',     zoom: 13, camDist: 45_000 },
};

function classifyFeature(feature: any, isPeak = false): ResultClassification {
    if (isPeak) return CLASSIFICATIONS.peak;

    // MapTiler GeoJSON: place_type array
    const pt = feature.place_type?.[0];
    if (pt === 'country') return CLASSIFICATIONS.country;
    if (pt === 'region' || pt === 'state') return CLASSIFICATIONS.region;
    if (pt === 'place' || pt === 'city') return CLASSIFICATIONS.city;
    if (pt === 'locality' || pt === 'neighborhood') return CLASSIFICATIONS.village;
    if (pt === 'poi') return CLASSIFICATIONS.poi;

    // Nominatim: type + class
    const t = feature.type;
    if (t === 'country' || t === 'continent') return CLASSIFICATIONS.country;
    if (t === 'state' || t === 'region' || t === 'county') return CLASSIFICATIONS.region;
    if (t === 'city' || t === 'town') return CLASSIFICATIONS.city;
    if (t === 'village' || t === 'hamlet' || t === 'suburb') return CLASSIFICATIONS.village;
    if (t === 'peak' || t === 'mountain' || t === 'volcano') return CLASSIFICATIONS.peak;

    return CLASSIFICATIONS.poi;
}

// ── Filter types ──────────────────────────────────────────────────────
type FilterKey = 'all' | 'cities' | 'mountains' | 'countries';

// ── SVG icons per type ────────────────────────────────────────────────
const ICON_PEAK = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 2L6 8l4 2 4-2-4-6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10 10v8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="14" r="2" stroke="currentColor" stroke-width="1" opacity="0.5"/></svg>`;
const ICON_PIN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
const ICON_GLOBE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
const ICON_CITY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22V12h6v10"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01"/></svg>`;

function iconForType(type: string): string {
    if (type === 'peak') return ICON_PEAK;
    if (type === 'country' || type === 'region') return ICON_GLOBE;
    if (type === 'city' || type === 'village') return ICON_CITY;
    return ICON_PIN;
}

// ── Overpass peak search by name ──────────────────────────────────────
async function searchPeaksByName(query: string): Promise<Array<{ name: string; lat: number; lon: number; ele: number }>> {
    const q = query.replace(/"/g, '\\"');
    const overpassQuery = `[out:json][timeout:5];node["natural"="peak"]["name"~"${q}",i];out 10;`;
    const urls = [
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`,
        `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(overpassQuery)}`,
    ];
    for (const url of urls) {
        try {
            const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!resp.ok) continue;
            const data = await resp.json();
            return (data.elements || [])
                .filter((e: any) => e.tags?.name)
                .map((e: any) => ({
                    name: e.tags.name,
                    lat: e.lat,
                    lon: e.lon,
                    ele: parseFloat(e.tags.ele) || 0,
                }))
                .sort((a: any, b: any) => b.ele - a.ele)
                .slice(0, 10);
        } catch { continue; }
    }
    return [];
}

export class SearchSheet extends BaseComponent {
    private geoInput: HTMLInputElement | null = null;
    private geoResults: HTMLElement | null = null;
    private timer: any = null;
    private activeFilter: FilterKey = 'all';

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
            this.geoResults.setAttribute('aria-label', i18n.t('search.aria.results'));

            // Filter chips
            this.createFilterChips();

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

    // ── Filter chips ──────────────────────────────────────────────────
    private createFilterChips(): void {
        const searchEl = this.element?.querySelector('#search');
        if (!searchEl || !this.geoInput) return;

        const chipContainer = document.createElement('div');
        chipContainer.className = 'search-filter-chips';
        chipContainer.setAttribute('role', 'radiogroup');
        chipContainer.setAttribute('aria-label', 'Filtres de recherche');

        const filters: FilterKey[] = ['all', 'cities', 'mountains', 'countries'];
        filters.forEach(key => {
            const chip = document.createElement('button');
            chip.className = `search-chip${key === 'all' ? ' search-chip-active' : ''}`;
            chip.textContent = i18n.t(`search.filter.${key}`);
            chip.dataset.filter = key;
            chip.setAttribute('role', 'radio');
            chip.setAttribute('aria-checked', key === 'all' ? 'true' : 'false');
            chip.addEventListener('click', () => {
                this.activeFilter = key;
                chipContainer.querySelectorAll('.search-chip').forEach(c => {
                    c.classList.remove('search-chip-active');
                    c.setAttribute('aria-checked', 'false');
                });
                chip.classList.add('search-chip-active');
                chip.setAttribute('aria-checked', 'true');
                // Re-trigger search with new filter
                if (this.geoInput && this.geoInput.value.trim().length >= 2) {
                    this.handleInput();
                }
            });
            chipContainer.appendChild(chip);
        });

        // Insert after input, before results
        this.geoInput.parentElement?.insertAdjacentElement('afterend', chipContainer);
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

        // 1. AFFICHER LES PICS LOCAUX IMMÉDIATEMENT (si filtre le permet)
        this.geoResults.textContent = '';
        let localMatches: typeof state.localPeaks = [];
        if (this.activeFilter === 'all' || this.activeFilter === 'mountains') {
            localMatches = state.localPeaks.filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
            if (localMatches.length > 0) {
                localMatches.forEach(p => {
                    this.geoResults!.appendChild(
                        this.createGeoItem(p.lat, p.lon, p.name, CLASSIFICATIONS.peak, p.name, p.ele)
                    );
                });
                this.geoResults.style.display = 'block';
                this.attachListeners();
            }
        }

        // 2. RECHERCHE DISTANTE (MAPTILER / OSM + Overpass peaks)
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
                // Geocoding toujours sauf filtre "mountains" pur
                // Overpass peaks uniquement sur filtre "mountains" (trop lent pour "all")
                const shouldSearchPeaks = this.activeFilter === 'mountains';
                const shouldSearchGeo = this.activeFilter !== 'mountains';

                const [geoData, overpassPeaks] = await Promise.all([
                    shouldSearchGeo ? fetchGeocoding({ query: q }) : null,
                    shouldSearchPeaks ? searchPeaksByName(q) : [],
                ]);

                loadingEl.remove();

                // Add Overpass peaks (deduplicate against local matches)
                const localNames = new Set(localMatches.map(p => p.name.toLowerCase()));
                if (overpassPeaks && overpassPeaks.length > 0) {
                    overpassPeaks
                        .filter(p => !localNames.has(p.name.toLowerCase()))
                        .forEach(p => {
                            this.geoResults!.appendChild(
                                this.createGeoItem(p.lat, p.lon, p.name, CLASSIFICATIONS.peak, p.name, p.ele)
                            );
                        });
                }

                // Add geocoding results (filtered by active filter)
                if (geoData) {
                    const features = Array.isArray(geoData) ? geoData : (geoData.features || []);

                    features.forEach((f: any) => {
                        let lat: number, lon: number, label: string;

                        // Format OSM (Nominatim)
                        if (f.lat && f.lon) {
                            lat = parseFloat(f.lat);
                            lon = parseFloat(f.lon);
                            label = f.display_name || f.name;
                        }
                        // Format MapTiler (GeoJSON Feature)
                        else if (f.geometry?.coordinates) {
                            lon = parseFloat(f.geometry.coordinates[0]);
                            lat = parseFloat(f.geometry.coordinates[1]);
                            label = f.place_name_fr || f.place_name || i18n.t('search.unknownPlace');
                        } else return;

                        if (isNaN(lat!) || isNaN(lon!)) return;

                        const classification = classifyFeature(f);

                        // Apply active filter
                        if (!this.matchesFilter(classification.type)) return;

                        this.geoResults!.appendChild(
                            this.createGeoItem(lat!, lon!, label, classification)
                        );
                    });
                }

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

    private matchesFilter(type: string): boolean {
        if (this.activeFilter === 'all') return true;
        if (this.activeFilter === 'mountains') return type === 'peak';
        if (this.activeFilter === 'cities') return type === 'city' || type === 'village';
        if (this.activeFilter === 'countries') return type === 'country' || type === 'region';
        return true;
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

    private createGeoItem(
        lat: number, lon: number, label: string,
        classification: ResultClassification,
        name = '', ele = 0
    ): HTMLElement {
        const isPeak = classification.type === 'peak';
        const div = document.createElement('div');
        div.className = `geo-item ${isPeak ? 'peak-item' : 'remote-item'} srch-geo-item`;
        div.dataset.lat = lat.toString();
        div.dataset.lon = lon.toString();
        div.dataset.resultType = classification.type;
        div.dataset.zoom = classification.zoom.toString();
        div.dataset.camDist = classification.camDist.toString();
        if (isPeak) {
            div.dataset.name = name || label;
            div.dataset.ele = ele.toString();
        }

        const leftSide = document.createElement('div');
        leftSide.classList.add('srch-left-side');

        const icon = document.createElement('div');
        icon.classList.add('srch-icon');
        icon.innerHTML = iconForType(classification.type);

        leftSide.appendChild(icon);

        const contentDiv = document.createElement('div');
        const text = document.createElement('div');
        text.className = 'geo-label srch-geo-label';
        if (isPeak) text.classList.add('srch-geo-label-peak');
        // Shorten label: only first part for long geocoding results
        text.textContent = label.split(',')[0];
        contentDiv.appendChild(text);

        // Subtitle with type
        const sub = document.createElement('div');
        sub.classList.add('srch-peak-sub');
        sub.textContent = i18n.t(`search.type.${classification.type}`);
        contentDiv.appendChild(sub);

        leftSide.appendChild(contentDiv);
        div.appendChild(leftSide);

        if (isPeak && ele > 0) {
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
                const el = item as HTMLElement;
                const lat = parseFloat(el.dataset.lat!);
                const lon = parseFloat(el.dataset.lon!);

                // CRITICAL: Strict isNaN validation
                if (isNaN(lat) || isNaN(lon)) {
                    console.error("Invalid coordinates in search result");
                    return;
                }

                const resultType = el.dataset.resultType || 'poi';
                const targetZoom = parseInt(el.dataset.zoom || '13');
                const camDist = parseInt(el.dataset.camDist || '45000');
                const name = el.dataset.name || el.querySelector('.geo-label')?.textContent || '';
                const ele = parseFloat(el.dataset.ele!) || 0;

                this.handleResultClick(lat, lon, resultType, targetZoom, camDist, name, isNaN(ele) ? 0 : ele);
            };
        });
    }

    private handleResultClick(
        lat: number, lon: number,
        resultType: string, targetZoom: number, camDist: number,
        name: string = '', ele: number = 0
    ) {
        if (!this.geoResults || !this.geoInput) return;

        sheetManager.close();
        this.geoInput.value = '';

        state.TARGET_LAT = lat;
        state.TARGET_LON = lon;
        autoSelectMapSource(lat, lon);

        state.ZOOM = targetZoom;
        state.originTile = lngLatToTile(lon, lat, targetZoom);

        if (state.controls && state.camera) {
            state.controls.target.set(0, 0, 0);
            // Camera position proportional to camDist
            const camY = camDist * 0.7;
            const camZ = camDist * 0.9;
            state.camera.position.set(0, camY, camZ);
            state.controls.update();
        }

        this.refreshTerrain();

        const isPeak = resultType === 'peak';
        const flyDuration = targetZoom <= 8 ? 2000 : targetZoom <= 11 ? 3000 : 3500;

        setTimeout(() => {
            const wp = lngLatToWorld(lon, lat, state.originTile);
            const flyAlt = isPeak ? ele * state.RELIEF_EXAGGERATION : 0;
            flyTo(wp.x, wp.z, flyAlt, flyDuration);
        }, 100);

        // Coords panel for peaks
        if (isPeak && name) {
            const cp = document.getElementById('coords-panel');
            if (cp) {
                cp.style.display = 'block';
                const clickLatLon = document.getElementById('click-latlon');
                if (clickLatLon) clickLatLon.textContent = `🏔️ ${name}`;
                const clickAlt = document.getElementById('click-alt');
                if (clickAlt) clickAlt.textContent = `${Math.round(ele)} m`;
            }
        }

        fetchWeather(lat, lon);
    }

    private refreshTerrain() {
        resetTerrain();
        updateVisibleTiles();
    }
}
