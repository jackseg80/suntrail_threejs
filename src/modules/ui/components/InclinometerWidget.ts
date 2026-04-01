/**
 * InclinometerWidget.ts — Widget Pro affichant la pente du terrain sous le réticule central.
 *
 * Utilise getAltitudeAt() (bilinear interpolation sur les pixelData de tuile) pour
 * échantillonner l'altitude en 3 points autour du centre de la caméra, puis calcule
 * la pente de plus grande pente (gradient 2D).
 *
 * Affiché uniquement si : state.isPro && state.ZOOM >= 13
 * Mis à jour toutes les 200ms (accumulateur, pas de surcharge GPU).
 */

import { state } from '../../state';
import { getAltitudeAt } from '../../analysis';
import { showUpgradePrompt } from '../../iap';

/** Décalage d'échantillonnage en mètres monde */
const SAMPLE_DELTA_M = 5;
const UPDATE_INTERVAL_MS = 200;
const MIN_ZOOM_DISPLAY = 13;

export class InclinometerWidget {
    private el: HTMLElement | null = null;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private unsubscribers: Array<() => void> = [];

    public init(): void {
        this.el = document.createElement('div');
        this.el.id = 'inclinometer-widget';
        this.el.setAttribute('aria-label', 'Inclinomètre terrain');
        this.el.setAttribute('role', 'status');
        this.el.setAttribute('aria-live', 'polite');
        this.el.style.cssText = [
            'position:fixed',
            // Respecte la nav bar quelle que soit sa hauteur (safe-area-inset-bottom variable selon l'appareil)
            'bottom:calc(var(--bar-h) + var(--safe-bottom) + 16px)',
            'left:50%',
            'transform:translateX(-50%)',
            'background:rgba(0,0,0,0.55)',
            'backdrop-filter:blur(8px)',
            '-webkit-backdrop-filter:blur(8px)',
            'color:#fff',
            'font-size:13px',
            'font-weight:600',
            'font-variant-numeric:tabular-nums',
            'letter-spacing:0.3px',
            'padding:5px 14px',
            'border-radius:20px',
            'pointer-events:auto',
            'z-index:30',
            'display:none',
            'white-space:nowrap',
            'border:1px solid rgba(255,255,255,0.15)',
            'cursor:default',
            'user-select:none',
        ].join(';');

        document.body.appendChild(this.el);

        // Abonnements réactifs
        this.unsubscribers.push(state.subscribe('isPro', () => this.syncVisibility()));
        this.unsubscribers.push(state.subscribe('ZOOM', () => this.syncVisibility()));
        this.unsubscribers.push(state.subscribe('SHOW_INCLINOMETER', () => this.syncVisibility()));
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

        // Trois échantillons autour du centre (en croix)
        const hCenter = getAltitudeAt(cx, cz);
        const hX      = getAltitudeAt(cx + SAMPLE_DELTA_M, cz);
        const hZ      = getAltitudeAt(cx, cz + SAMPLE_DELTA_M);

        // Annuler RELIEF_EXAGGERATION pour obtenir la pente réelle
        const exag = state.RELIEF_EXAGGERATION || 1;
        const realDHdX = (hX - hCenter) / exag / SAMPLE_DELTA_M;
        const realDHdZ = (hZ - hCenter) / exag / SAMPLE_DELTA_M;

        // Pente de plus grande pente (norme du gradient)
        const slopeRad = Math.atan(Math.sqrt(realDHdX * realDHdX + realDHdZ * realDHdZ));
        const slopeDeg = Math.round(slopeRad * (180 / Math.PI));
        const slopePct = Math.round(Math.tan(slopeRad) * 100);

        this.el.textContent = `⛰ ${slopeDeg}° (${slopePct}%) — pente au centre`;

        // Couleur de la bordure selon seuils avalanche
        let borderColor = 'rgba(255,255,255,0.15)'; // neutre
        if      (slopeDeg >= 40) borderColor = 'rgba(239,68,68,0.7)';   // rouge ≥40°
        else if (slopeDeg >= 35) borderColor = 'rgba(249,115,22,0.7)';  // orange ≥35°
        else if (slopeDeg >= 30) borderColor = 'rgba(234,179,8,0.7)';   // jaune ≥30°
        this.el.style.borderColor = borderColor;
    }

    public dispose(): void {
        this.stopPolling();
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
