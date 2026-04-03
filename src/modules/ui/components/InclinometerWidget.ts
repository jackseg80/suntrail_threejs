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

import { state } from '../../state';
import { getAltitudeAt } from '../../analysis';
import { showUpgradePrompt } from '../../iap';
import { i18n } from '../../../i18n/I18nService';
import { eventBus } from '../../eventBus';

/** Décalage d'échantillonnage en mètres monde */
const SAMPLE_DELTA_M = 5;
const UPDATE_INTERVAL_MS = 200;
const MIN_ZOOM_DISPLAY = 13;
const DRAG_HOLD_MS = 300;       // Délai avant activation du drag (distingue tap vs drag)
const DETAIL_AUTO_CLOSE_MS = 5000;

const COMPASS_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export class InclinometerWidget {
    private el: HTMLElement | null = null;
    private detailEl: HTMLElement | null = null;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private unsubscribers: Array<() => void> = [];

    // État interactif
    private _isExpanded = false;
    private _isDragging = false;
    private _isCustomPos = false;
    private _dragHoldTimer: ReturnType<typeof setTimeout> | null = null;
    private _detailTimer: ReturnType<typeof setTimeout> | null = null;
    private _lastTapTime = 0;
    private _dragStartX = 0;
    private _dragStartY = 0;
    private _elStartLeft = 0;
    private _elStartTop = 0;

    // Dernières valeurs calculées (pour le panel détail)
    private _lastSlopeDeg = 0;
    private _lastSlopePct = 0;
    private _lastAspectDeg = 0;

    public init(): void {
        this.el = document.createElement('div');
        this.el.id = 'inclinometer-widget';
        this.el.setAttribute('aria-label', i18n.t('inclinometer.label'));
        this.el.setAttribute('role', 'status');
        this.el.setAttribute('aria-live', 'polite');
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
            'font-variant-numeric:tabular-nums',
            'letter-spacing:0.3px',
            'padding:5px 14px',
            'border-radius:20px',
            'pointer-events:auto',
            'z-index:2100',
            'display:none',
            'white-space:nowrap',
            'border:1px solid var(--border-active)',
            'cursor:pointer',
            'user-select:none',
            'touch-action:none',
        ].join(';');

        document.body.appendChild(this.el);

        // Événements tactiles / souris
        this.el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        this.el.addEventListener('pointermove', (e) => this.onPointerMove(e));
        this.el.addEventListener('pointerup', (e) => this.onPointerUp(e));
        this.el.addEventListener('pointercancel', () => this.onPointerCancel());

        // Abonnements réactifs
        this.unsubscribers.push(state.subscribe('isPro', () => this.syncVisibility()));
        this.unsubscribers.push(state.subscribe('ZOOM', () => this.syncVisibility()));
        this.unsubscribers.push(state.subscribe('SHOW_INCLINOMETER', () => this.syncVisibility()));

        // Re-traduction
        eventBus.on('localeChanged', () => {
            if (this.el) this.el.setAttribute('aria-label', i18n.t('inclinometer.label'));
        });

        this.syncVisibility();
    }

    private syncVisibility(): void {
        const shouldShow = state.isPro && state.ZOOM >= MIN_ZOOM_DISPLAY && state.SHOW_INCLINOMETER;
        if (shouldShow) {
            if (this.el) this.el.style.display = 'block';
            this.startPolling();
        } else {
            if (this.el) this.el.style.display = 'none';
            this.stopPolling();
            this.closeDetail();
        }
    }

    private startPolling(): void {
        if (this.intervalId !== null) return;
        this.intervalId = setInterval(() => this.update(), UPDATE_INTERVAL_MS);
    }

    private stopPolling(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    private update(): void {
        if (!this.el || !state.controls) return;

        const cx = state.controls.target.x;
        const cz = state.controls.target.z;

        const hCenter = getAltitudeAt(cx, cz);
        const hX      = getAltitudeAt(cx + SAMPLE_DELTA_M, cz);
        const hZ      = getAltitudeAt(cx, cz + SAMPLE_DELTA_M);

        const exag = state.RELIEF_EXAGGERATION || 1;
        const realDHdX = (hX - hCenter) / exag / SAMPLE_DELTA_M;
        const realDHdZ = (hZ - hCenter) / exag / SAMPLE_DELTA_M;

        const slopeRad = Math.atan(Math.sqrt(realDHdX * realDHdX + realDHdZ * realDHdZ));
        this._lastSlopeDeg = Math.round(slopeRad * (180 / Math.PI));
        this._lastSlopePct = Math.round(Math.tan(slopeRad) * 100);

        // Direction de la pente (azimut du gradient descendant) — 0° = Nord
        this._lastAspectDeg = Math.round(((Math.atan2(realDHdX, realDHdZ) * 180 / Math.PI) + 360) % 360);

        this.el.textContent = `⛰ ${this._lastSlopeDeg}° (${this._lastSlopePct}%) — ${i18n.t('inclinometer.label')}`;

        // Couleur de la bordure selon seuils avalanche
        let borderColor = 'var(--border-active)';
        if      (this._lastSlopeDeg >= 40) borderColor = 'rgba(239,68,68,0.7)';
        else if (this._lastSlopeDeg >= 35) borderColor = 'rgba(249,115,22,0.7)';
        else if (this._lastSlopeDeg >= 30) borderColor = 'rgba(234,179,8,0.7)';
        this.el.style.borderColor = borderColor;

        // Mettre à jour le panel détail s'il est ouvert
        if (this._isExpanded && this.detailEl) this.updateDetailContent();
    }

    // ── Interaction : tap / drag / double-tap ──────────────────────────

    private onPointerDown(e: PointerEvent): void {
        if (!this.el) return;
        this.el.setPointerCapture(e.pointerId);

        // Double-tap → reset position
        const now = Date.now();
        if (now - this._lastTapTime < 300 && this._isCustomPos) {
            this._lastTapTime = 0;
            this.resetPosition();
            return;
        }
        this._lastTapTime = now;

        // Préparer le drag (hold 150ms)
        this._dragStartX = e.clientX;
        this._dragStartY = e.clientY;

        const rect = this.el.getBoundingClientRect();
        this._elStartLeft = rect.left;
        this._elStartTop = rect.top;

        this._dragHoldTimer = setTimeout(() => {
            this._isDragging = true;
            if (this.el) this.el.style.opacity = '0.8';
        }, DRAG_HOLD_MS);
    }

    private onPointerMove(e: PointerEvent): void {
        if (!this.el) return;

        // Le drag ne s'active QUE après le hold timer (300ms).
        // Avant le hold timer, un mouvement > 20px annule le hold (= c'est un scroll/swipe, pas un hold).
        if (!this._isDragging) {
            if (this._dragHoldTimer) {
                const mdx = e.clientX - this._dragStartX;
                const mdy = e.clientY - this._dragStartY;
                if (Math.abs(mdx) > 20 || Math.abs(mdy) > 20) {
                    // Trop de mouvement → annuler le hold, c'est un geste de carte
                    clearTimeout(this._dragHoldTimer);
                    this._dragHoldTimer = null;
                }
            }
            return;
        }

        const dx = e.clientX - this._dragStartX;
        const dy = e.clientY - this._dragStartY;
        let newLeft = this._elStartLeft + dx;
        let newTop = this._elStartTop + dy;

        // Contraindre au viewport
        const w = this.el.offsetWidth;
        const h = this.el.offsetHeight;
        newLeft = Math.max(0, Math.min(window.innerWidth - w, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - h, newTop));

        // Passer en positionnement absolu
        this.el.style.left = `${newLeft}px`;
        this.el.style.top = `${newTop}px`;
        this.el.style.bottom = 'auto';
        this.el.style.transform = 'none';
        this._isCustomPos = true;
    }

    private onPointerUp(e: PointerEvent): void {
        if (!this.el) return;
        this.el.releasePointerCapture(e.pointerId);

        if (this._dragHoldTimer) { clearTimeout(this._dragHoldTimer); this._dragHoldTimer = null; }

        if (this._isDragging) {
            this._isDragging = false;
            this.el.style.opacity = '1';
            // Repositionner le panel détail si ouvert
            if (this._isExpanded) this.positionDetail();
            return;
        }

        // C'est un tap (pas un drag) → toggle détail
        this.toggleDetail();
    }

    private onPointerCancel(): void {
        if (this._dragHoldTimer) { clearTimeout(this._dragHoldTimer); this._dragHoldTimer = null; }
        this._isDragging = false;
        if (this.el) this.el.style.opacity = '1';
    }

    private resetPosition(): void {
        if (!this.el) return;
        this.el.style.left = '50%';
        this.el.style.top = '';
        this.el.style.bottom = 'calc(var(--bar-h) + var(--safe-bottom) + 16px)';
        this.el.style.transform = 'translateX(-50%)';
        this._isCustomPos = false;
        if (this._isExpanded) this.positionDetail();
    }

    // ── Panel de détail ────────────────────────────────────────────────

    private toggleDetail(): void {
        if (this._isExpanded) {
            this.closeDetail();
        } else {
            this.openDetail();
        }
    }

    private openDetail(): void {
        if (this._isExpanded || !this.el) return;
        this._isExpanded = true;

        this.detailEl = document.createElement('div');
        this.detailEl.id = 'inclinometer-detail';
        this.detailEl.style.cssText = [
            'position:fixed',
            'z-index:2101',
            'background:var(--surface-solid)',
            'backdrop-filter:var(--glass)',
            '-webkit-backdrop-filter:var(--glass)',
            'border-radius:var(--radius-lg, 12px)',
            'padding:12px 16px',
            'color:var(--text)',
            'font-size:13px',
            'min-width:200px',
            'max-width:260px',
            'border:1px solid var(--border)',
            'pointer-events:none',
            'opacity:0',
            'transition:opacity 0.15s ease',
        ].join(';');

        this.updateDetailContent();
        document.body.appendChild(this.detailEl);
        this.positionDetail();

        requestAnimationFrame(() => {
            if (this.detailEl) this.detailEl.style.opacity = '1';
        });

        // Auto-fermeture
        this._detailTimer = setTimeout(() => this.closeDetail(), DETAIL_AUTO_CLOSE_MS);
    }

    private closeDetail(): void {
        this._isExpanded = false;
        if (this._detailTimer) { clearTimeout(this._detailTimer); this._detailTimer = null; }
        if (this.detailEl) {
            this.detailEl.remove();
            this.detailEl = null;
        }
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
        this.el = null;
    }
}

// Upsell helper pour les users gratuits qui touchent le widget (si jamais visible)
export function showInclinometerUpsell(): void {
    showUpgradePrompt('inclinometer');
}
