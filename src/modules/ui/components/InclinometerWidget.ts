/**
 * InclinometerWidget.ts — Widget Pro affichant la pente du terrain sous le réticule central.
 *
 * Utilise getAltitudeAt() (bilinear interpolation sur les pixelData de tuile) pour
 * échantillonner l'altitude en 3 points autour du centre de la caméra, puis calcule
 * la pente de plus grande pente (gradient 2D).
 *
 * Affiché uniquement si : state.isPro && state.ZOOM >= 13
 * Mis à jour toutes les 200ms (accumulateur, pas de surcharge GPU).
 *
 * v5.19.1 : Tap pour détails, drag pour repositionner, double-tap pour reset position.
 */

import { state, isProActive } from '../../state';
import { getAltitudeAt, findTerrainIntersection } from '../../analysis';
import { showUpgradePrompt } from '../../iap';
import { i18n } from '../../../i18n/I18nService';
import { lngLatToWorld, worldToLngLat } from '../../geo';
import * as THREE from 'three';

/** Décalage d'échantillonnage en mètres monde pour le calcul du gradient */
const SAMPLE_DELTA_M = 4;
const UPDATE_INTERVAL_MS = 200;
const MIN_ZOOM_DISPLAY = 13;
const DRAG_HOLD_MS = 200;       // Délai avant activation du drag (distingue tap vs drag)
const ANTICIPATION_DISTANCE_M = 8; // Distance devant l'utilisateur en mode suivi (réduit v5.40.28)

const COMPASS_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export class InclinometerWidget {
    private el: HTMLElement | null = null;
    private reticle: HTMLElement | null = null;
    private detailEl: HTMLElement | null = null;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private unsubscribers: Array<() => void> = [];

    // État interactif
    private _isExpanded = false;
    private _isDraggingReticle = false;
    private _isDraggingWidget = false;
    private _isCustomWidgetPos = false;
    private _dragHoldTimer: ReturnType<typeof setTimeout> | null = null;
    private _lastTapTimeWidget = 0;
    private _lastTapTimeReticle = 0;
    
    // Position du réticule en coordonnées écran (px)
    private _reticleX = window.innerWidth / 2;
    private _reticleY = window.innerHeight / 2;
    private _dragStartX = 0;
    private _dragStartY = 0;
    private _reticleStartLeft = 0;
    private _reticleStartTop = 0;

    // Position du widget (px)
    private _widgetStartLeft = 0;
    private _widgetStartTop = 0;

    // Dernières valeurs calculées
    private _lastSlopeDeg = 0;
    private _lastSlopePct = 0;
    private _lastAspectDeg = 0;

    public init(): void {
        // 1. Création du Widget (Texte en bas)
        this.el = document.createElement('div');
        this.el.id = 'inclinometer-widget';
        this.el.style.cssText = [
            'position:fixed',
            'bottom:calc(var(--bar-h) + var(--safe-bottom) + 16px)',
            'left:50%',
            'transform:translateX(-50%)',
            'background:var(--surface)',
            'backdrop-filter:var(--glass)',
            '-webkit-backdrop-filter:var(--glass)',
            'color:var(--text)',
            'font-size:13px',
            'font-weight:600',
            'padding:5px 14px',
            'border-radius:20px',
            'z-index:1200',
            'display:none',
            'border:1px solid var(--border-active)',
            'cursor:pointer',
            'user-select:none',
            'touch-action:none',
        ].join(';');
        document.body.appendChild(this.el);

        // 2. Création du Réticule (Viseur indépendant)
        this.reticle = document.createElement('div');
        this.reticle.id = 'inclinometer-reticle';
        this.reticle.style.cssText = [
            'position:fixed',
            'width:30px',
            'height:30px',
            'left:50%',
            'top:50%',
            'transform:translate(-50%, -50%)',
            'z-index:1199',
            'display:none',
            'pointer-events:auto',
            'cursor:move',
            'touch-action:none',
            'border:2px solid #fff',
            'border-radius:50%',
            'box-shadow:0 0 4px rgba(0,0,0,0.5)',
            'background:rgba(255,255,255,0.1)',
        ].join(';');
        // Petit point au centre du réticule
        const centerDot = document.createElement('div');
        centerDot.style.cssText = 'position:absolute;left:50%;top:50%;width:4px;height:4px;background:#fff;border-radius:50%;transform:translate(-50%,-50%)';
        this.reticle.appendChild(centerDot);
        document.body.appendChild(this.reticle);

        // Événements Widget
        this.el.addEventListener('pointerdown', (e) => this.onWidgetDown(e));
        
        // Événements Réticule
        this.reticle.addEventListener('pointerdown', (e) => this.onReticleDown(e));

        // Événements globaux pour le drag
        const onMove = (e: PointerEvent) => this.onPointerMove(e);
        const onUp = (e: PointerEvent) => this.onPointerUp(e);
        
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        
        this.unsubscribers.push(() => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        });

        // Abonnements
        this.unsubscribers.push(state.subscribe('isPro', () => this.syncVisibility()));
        this.unsubscribers.push(state.subscribe('ZOOM', () => this.syncVisibility()));
        this.unsubscribers.push(state.subscribe('SHOW_INCLINOMETER', () => this.syncVisibility()));
        this.unsubscribers.push(state.subscribe('isFollowingUser', (val) => {
            if (val) this.resetReticle(); // Recentrer si on clique sur le bouton position
            this.syncVisibility();
        }));

        // v5.38.4 : Synchronisation avec l'ouverture de la timeline
        const observer = new MutationObserver(() => this.syncPosition());
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        this.unsubscribers.push(() => observer.disconnect());

        this.syncVisibility();
        this.syncPosition();
    }

    private syncPosition(): void {
        if (!this.el || this._isCustomWidgetPos) return;

        const isTimelineOpen = document.body.classList.contains('timeline-open');
        
        if (isTimelineOpen) {
            // v5.40.27 : Reste en BAS mais décalé au dessus de la timeline
            this.el.style.top = 'auto';
            this.el.style.bottom = 'calc(var(--bar-h) + var(--safe-bottom) + 120px)';
        } else {
            // Position standard
            this.el.style.top = 'auto';
            this.el.style.bottom = 'calc(var(--bar-h) + var(--safe-bottom) + 16px)';
        }
        if (this._isExpanded) this.positionDetail();
    }

    private syncVisibility(): void {
        const shouldShow = isProActive() && state.ZOOM >= MIN_ZOOM_DISPLAY && state.SHOW_INCLINOMETER;
        if (this.el) this.el.style.display = shouldShow ? 'block' : 'none';
        
        // Réticule visible uniquement en mode libre
        if (this.reticle) {
            this.reticle.style.display = (shouldShow && !state.isFollowingUser) ? 'block' : 'none';
        }
        
        if (shouldShow) this.startPolling();
        else {
            this.stopPolling();
            this.closeDetail();
        }
    }

    private startPolling(): void {
        if (this.intervalId !== null) return;
        this.intervalId = setInterval(() => this.update(), UPDATE_INTERVAL_MS);
    }

    private stopPolling(): void {
        if (this.intervalId !== null) { clearInterval(this.intervalId); this.intervalId = null; }
    }

    private update(): void {
        if (!this.el || !state.controls || !state.camera || !state.originTile) return;

        let targetX = 0;
        let targetZ = 0;

        if (state.isFollowingUser && state.userLocation && state.originTile) {
            // MODE SUIVI : Position utilisateur + anticipation
            const pos = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
            const heading = state.userHeading || 0;
            const headingRad = (heading * Math.PI) / 180;
            
            // On projette à 15m devant (0° = Nord = -Z, 90° = Est = +X)
            targetX = pos.x + Math.sin(headingRad) * ANTICIPATION_DISTANCE_M;
            targetZ = pos.z - Math.cos(headingRad) * ANTICIPATION_DISTANCE_M;
        } else {
            // MODE LIBRE : Sous le réticule écran via Raycasting
            const ndcX = (this._reticleX / window.innerWidth) * 2 - 1;
            const ndcY = -(this._reticleY / window.innerHeight) * 2 + 1;
            
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), state.camera);
            
            const hit = findTerrainIntersection(raycaster.ray);
            if (hit) {
                targetX = hit.x;
                targetZ = hit.z;
            } else {
                targetX = state.controls.target.x;
                targetZ = state.controls.target.z;
            }
        }

        const d = SAMPLE_DELTA_M / 2;
        const hE = getAltitudeAt(targetX + d, targetZ);
        const hW = getAltitudeAt(targetX - d, targetZ);
        const hS = getAltitudeAt(targetX, targetZ + d);
        const hN = getAltitudeAt(targetX, targetZ - d);

        const exag = state.RELIEF_EXAGGERATION || 1;
        let realDHdX = (hE - hW) / exag / (2 * d);
        let realDHdZ = (hS - hN) / exag / (2 * d);

        // v5.40.28 : Correction LATITUDE pour l'inclinomètre
        // En Mercator, les distances horizontales sont dilatées par 1/cos(lat).
        // Pour retrouver la pente réelle, on doit diviser la pente apparente par cos(lat).
        const { lat } = worldToLngLat(targetX, targetZ, state.originTile);
        const latFactor = Math.cos(lat * Math.PI / 180);
        if (latFactor > 0.01) {
            realDHdX /= latFactor;
            realDHdZ /= latFactor;
        }

        const maxSlopeRad = Math.atan(Math.sqrt(realDHdX * realDHdX + realDHdZ * realDHdZ));
        this._lastSlopeDeg = Math.round(maxSlopeRad * (180 / Math.PI));
        this._lastSlopePct = Math.round(Math.tan(maxSlopeRad) * 100);
        this._lastAspectDeg = Math.round(((Math.atan2(realDHdX, realDHdZ) * 180 / Math.PI) + 360) % 360);

        // Mise à jour UI
        const labelKey = state.isFollowingUser ? 'inclinometer.label_following' : 'inclinometer.label';
        const label = i18n.t(labelKey);

        if (state.isFollowingUser) {
            // MODE SUIVI : Tout en % pour plus de clarté intuitive (v5.40.27)
            const headingRad = (state.userHeading || 0) * Math.PI / 180;
            const dirX = Math.sin(headingRad);
            const dirZ = -Math.cos(headingRad);
            
            // v5.40.28 : La pente projetée doit aussi être corrigée par la latitude
            const pathSlope = realDHdX * dirX + realDHdZ * dirZ;
            const pathSlopePct = Math.round(pathSlope * 100);
            const sign = pathSlopePct > 0 ? '+' : '';
            
            // Format : 📈 +3% (max. 45%)
            this.el.textContent = `📈 ${sign}${pathSlopePct}% (max. ${this._lastSlopePct}%) — ${label}`;
        } else {
            // MODE LIBRE : Priorité à la pente max du terrain (°) pour la lecture de carte/avalanche
            // Format : ⛰ 45° (100%)
            this.el.textContent = `⛰ ${this._lastSlopeDeg}° (${this._lastSlopePct}%) — ${label}`;
        }

        // Couleurs selon danger (seuil avalanche Swisstopo)
        let color = '#a0a4bc'; // Gris par défaut
        if      (this._lastSlopeDeg >= 40) color = '#ef4444'; // Rouge
        else if (this._lastSlopeDeg >= 35) color = '#f97316'; // Orange
        else if (this._lastSlopeDeg >= 30) color = '#eab308'; // Jaune

        this.el.style.borderColor = color;
        if (this.reticle) {
            this.reticle.style.borderColor = color;
            (this.reticle.firstChild as HTMLElement).style.background = color;
        }

        if (this._isExpanded && this.detailEl) this.updateDetailContent();
    }

    // ── Interaction Réticule ──────────────────────────────────────────

    private onReticleDown(e: PointerEvent): void {
        if (!this.reticle) return;
        
        // Double-tap reset
        const now = Date.now();
        if (now - this._lastTapTimeReticle < 300) {
            this.resetReticle();
            return;
        }
        this._lastTapTimeReticle = now;

        this._isDraggingReticle = true;
        this._dragStartX = e.clientX;
        this._dragStartY = e.clientY;
        const rect = this.reticle.getBoundingClientRect();
        this._reticleStartLeft = rect.left + rect.width / 2;
        this._reticleStartTop = rect.top + rect.height / 2;
        
        this.reticle.setPointerCapture(e.pointerId);
        this.reticle.style.opacity = '0.7';
    }

    private resetReticle(): void {
        this._reticleX = window.innerWidth / 2;
        this._reticleY = window.innerHeight / 2;
        if (this.reticle) {
            this.reticle.style.left = '50%';
            this.reticle.style.top = '50%';
        }
    }

    // ── Interaction Widget Texte ──────────────────────────────────────

    private onWidgetDown(e: PointerEvent): void {
        if (!this.el) return;

        // Double-tap reset
        const now = Date.now();
        if (now - this._lastTapTimeWidget < 300 && this._isCustomWidgetPos) {
            this.resetWidget();
            return;
        }
        this._lastTapTimeWidget = now;

        this._dragStartX = e.clientX;
        this._dragStartY = e.clientY;
        const rect = this.el.getBoundingClientRect();
        this._widgetStartLeft = rect.left;
        this._widgetStartTop = rect.top;

        this._dragHoldTimer = setTimeout(() => {
            this._isDraggingWidget = true;
            if (this.el) {
                this.el.setPointerCapture(e.pointerId);
                this.el.style.opacity = '0.7';
            }
        }, DRAG_HOLD_MS);
    }

    private onPointerMove(e: PointerEvent): void {
        if (!this._isDraggingReticle && !this._isDraggingWidget && !this._dragHoldTimer) return;

        const dx = e.clientX - this._dragStartX;
        const dy = e.clientY - this._dragStartY;

        if (this._dragHoldTimer) {
            // Seuil de mouvement pour annuler le tap au profit d'un drag potentiel/scroll
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                clearTimeout(this._dragHoldTimer);
                this._dragHoldTimer = null;
            }
            return;
        }

        requestAnimationFrame(() => {
            if (this._isDraggingReticle && this.reticle) {
                this._reticleX = Math.max(20, Math.min(window.innerWidth - 20, this._reticleStartLeft + dx));
                this._reticleY = Math.max(20, Math.min(window.innerHeight - 20, this._reticleStartTop + dy));
                this.reticle.style.left = `${this._reticleX}px`;
                this.reticle.style.top = `${this._reticleY}px`;
            } 
            else if (this._isDraggingWidget && this.el) {
                let left = this._widgetStartLeft + dx;
                let top = this._widgetStartTop + dy;
                
                const w = this.el.offsetWidth;
                const h = this.el.offsetHeight;
                left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
                top = Math.max(8, Math.min(window.innerHeight - h - 8, top));

                this.el.style.left = `${left}px`;
                this.el.style.top = `${top}px`;
                this.el.style.bottom = 'auto';
                this.el.style.transform = 'none';
                this._isCustomWidgetPos = true;
                if (this._isExpanded) this.positionDetail();
            }
        });
    }

    private onPointerUp(e: PointerEvent): void {
        if (this._dragHoldTimer) {
            clearTimeout(this._dragHoldTimer);
            this._dragHoldTimer = null;
            // C'était un simple clic
            this.toggleDetail();
        }

        if (this._isDraggingReticle && this.reticle) {
            this._isDraggingReticle = false;
            this.reticle.style.opacity = '1';
            this.reticle.releasePointerCapture(e.pointerId);
        }

        if (this._isDraggingWidget && this.el) {
            this._isDraggingWidget = false;
            this.el.style.opacity = '1';
            this.el.releasePointerCapture(e.pointerId);
        }
    }

    private resetWidget(): void {
        if (!this.el) return;
        this.el.style.left = '50%';
        this.el.style.top = '';
        this.el.style.bottom = 'calc(var(--bar-h) + var(--safe-bottom) + 16px)';
        this.el.style.transform = 'translateX(-50%)';
        this._isCustomWidgetPos = false;
        if (this._isExpanded) this.positionDetail();
    }

    // ── Panel de détail ────────────────────────────────────────────────

    private toggleDetail(): void {
        if (this._isExpanded) this.closeDetail();
        else this.openDetail();
    }

    private openDetail(): void {
        if (this._isExpanded || !this.el) return;
        this._isExpanded = true;

        this.detailEl = document.createElement('div');
        this.detailEl.id = 'inclinometer-detail';
        this.detailEl.style.cssText = [
            'position:fixed',
            'z-index:1201',
            'background:var(--surface-solid)',
            'backdrop-filter:var(--glass)',
            '-webkit-backdrop-filter:var(--glass)',
            'border-radius:12px',
            'padding:12px 16px',
            'color:var(--text)',
            'font-size:13px',
            'min-width:200px',
            'border:1px solid var(--border)',
            'pointer-events:none',
            'opacity:0',
            'transition:opacity 0.15s ease',
        ].join(';');

        this.updateDetailContent();
        document.body.appendChild(this.detailEl);
        this.positionDetail();

        requestAnimationFrame(() => { if (this.detailEl) this.detailEl.style.opacity = '1'; });
    }

    private closeDetail(): void {
        this._isExpanded = false;
        if (this.detailEl) { this.detailEl.remove(); this.detailEl = null; }
    }

    private positionDetail(): void {
        if (!this.detailEl || !this.el) return;
        const rect = this.el.getBoundingClientRect();
        const dw = this.detailEl.offsetWidth || 220;
        let left = rect.left + rect.width / 2 - dw / 2;
        left = Math.max(8, Math.min(window.innerWidth - dw - 8, left));
        const top = rect.top - this.detailEl.offsetHeight - 8;
        this.detailEl.style.left = `${left}px`;
        this.detailEl.style.top = `${Math.max(8, top)}px`;
    }

    private updateDetailContent(): void {
        if (!this.detailEl) return;
        const compassIdx = Math.round(this._lastAspectDeg / 45) % 8;
        const dirKey = COMPASS_DIRS[compassIdx];
        const dirLabel = i18n.t(`inclinometer.directions.${dirKey}`);

        let dangerKey = 'low';
        let dangerColor = '#a0a4bc';
        if (this._lastSlopeDeg >= 40) { dangerKey = 'extreme'; dangerColor = '#ef4444'; }
        else if (this._lastSlopeDeg >= 35) { dangerKey = 'high'; dangerColor = '#f97316'; }
        else if (this._lastSlopeDeg >= 30) { dangerKey = 'moderate'; dangerColor = '#eab308'; }

        this.detailEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:18px;font-weight:700">${this._lastSlopeDeg}° <span style="opacity:0.6;font-size:13px">(${this._lastSlopePct}%)</span></span>
                <span style="font-size:13px;opacity:0.7">${i18n.t('inclinometer.aspect')}: ${dirLabel} (${this._lastAspectDeg}°)</span>
            </div>
            <div style="color:${dangerColor};font-weight:600;font-size:12px;margin-bottom:4px">
                ${i18n.t(`inclinometer.danger.${dangerKey}`)}
            </div>
            <div style="font-size:11px;opacity:0.5">${i18n.t('inclinometer.hint')}</div>
        `;
    }

    public dispose(): void {
        this.stopPolling();
        this.closeDetail();
        this.unsubscribers.forEach(u => u());
        this.unsubscribers = [];
        this.el?.remove();
        this.reticle?.remove();
        this.el = null;
        this.reticle = null;
    }
}

export function showInclinometerUpsell(): void {
    showUpgradePrompt('inclinometer');
}
