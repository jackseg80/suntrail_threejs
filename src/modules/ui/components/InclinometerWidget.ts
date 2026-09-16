/**
 * InclinometerWidget.ts — Widget Pro affichant la pente du terrain sous le réticule central.
 *
 * Utilise getAltitudeAt() (bilinear interpolation sur les pixelData de tuile) pour
 * échantillonner l'altitude en 3 points autour du centre de la caméra, puis calcule
 * la pente de plus grande pente (gradient 2D).
 *
 * Affiché uniquement en 3D (le relief y fournit les pixels d'altitude), si l'option
 * est active et le zoom >= 13 ; Free conserve un aperçu verrouillé.
 * Mis à jour toutes les 200ms (accumulateur, pas de surcharge GPU).
 *
 * v5.90 : résumé ancré ouvrable au toucher/clavier ; seul le viseur reste déplaçable.
 */

import { state, isProActive } from '../../state';
import { getAltitudeAt, findTerrainIntersection } from '../../analysis';
import { showUpgradePrompt } from '../../iap';
import { i18n } from '../../../i18n/I18nService';
import { lngLatToWorld, worldToLngLat } from '../../geo';
import { ICON_LOCK } from '../icons';
import * as THREE from 'three';

/** Décalage d'échantillonnage en mètres monde pour le calcul du gradient */
const SAMPLE_DELTA_M = 4;
const UPDATE_INTERVAL_MS = 200;
const MIN_ZOOM_DISPLAY = 13;
const ANTICIPATION_DISTANCE_M = 8; // Distance devant l'utilisateur en mode suivi (réduit v5.40.28)

const COMPASS_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export class InclinometerWidget {
    private el: HTMLElement | null = null;
    private reticle: HTMLElement | null = null;
    private detailEl: HTMLElement | null = null;
    private summaryValueEl: HTMLElement | null = null;
    private summaryLabelEl: HTMLElement | null = null;
    private lockEl: HTMLElement | null = null;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private unsubscribers: Array<() => void> = [];

    // État interactif
    private _isExpanded = false;
    private _isDraggingReticle = false;
    private _lastTapTimeReticle = 0;

    // Position du réticule en coordonnées écran (px)
    private _reticleX = window.innerWidth / 2;
    private _reticleY = window.innerHeight / 2;
    private _dragStartX = 0;
    private _dragStartY = 0;
    private _reticleStartLeft = 0;
    private _reticleStartTop = 0;

    private _raycaster = new THREE.Raycaster();
    private _ndc = new THREE.Vector2();

    // Dernières valeurs calculées
    private _lastSlopeDeg = 0;
    private _lastSlopePct = 0;
    private _lastAspectDeg = 0;

    public init(): void {
        // 1. Création du Widget (Texte en bas)
        this.el = document.createElement('button');
        this.el.id = 'inclinometer-widget';
        this.el.className = 'inclinometer-summary';
        this.el.setAttribute('type', 'button');
        this.el.setAttribute('aria-expanded', 'false');
        this.el.setAttribute('aria-controls', 'inclinometer-detail');
        this.el.setAttribute(
            'aria-label',
            i18n.t('settings.label.inclinometer')
        );
        this.el.innerHTML = `
            <span class="inclinometer-summary-value">—° (—%)</span>
            <span class="inclinometer-summary-label">${i18n.t('inclinometer.label')}</span>
            <span class="inclinometer-summary-lock" aria-hidden="true">${ICON_LOCK}</span>
        `;
        this.summaryValueEl = this.el.querySelector(
            '.inclinometer-summary-value'
        );
        this.summaryLabelEl = this.el.querySelector(
            '.inclinometer-summary-label'
        );
        this.lockEl = this.el.querySelector('.inclinometer-summary-lock');
        document.body.appendChild(this.el);

        // 2. Création du Réticule (Viseur indépendant)
        this.reticle = document.createElement('button');
        this.reticle.id = 'inclinometer-reticle';
        this.reticle.className = 'inclinometer-reticle';
        this.reticle.setAttribute('type', 'button');
        this.reticle.setAttribute(
            'aria-label',
            i18n.t('inclinometer.moveReticle')
        );
        document.body.appendChild(this.reticle);

        this.el.addEventListener('click', () => this.toggleDetail());

        // Événements Réticule
        this.reticle.addEventListener('pointerdown', (e) =>
            this.onReticleDown(e)
        );
        this.reticle.addEventListener('keydown', (e) =>
            this.onReticleKeyDown(e)
        );

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
        this.unsubscribers.push(
            state.subscribe('isPro', () => this.syncVisibility())
        );
        this.unsubscribers.push(
            state.subscribe('ZOOM', () => this.syncVisibility())
        );
        this.unsubscribers.push(
            state.subscribe('SHOW_INCLINOMETER', () => this.syncVisibility())
        );
        // La pente du terrain n'est calculable qu'en 3D (pixels d'altitude chargés)
        this.unsubscribers.push(
            state.subscribe('IS_2D_MODE', () => this.syncVisibility())
        );
        this.unsubscribers.push(
            state.subscribe('isFollowingUser', (val) => {
                if (val) this.resetReticle(); // Recentrer si on clique sur le bouton position
                this.syncVisibility();
            })
        );

        // v5.38.4 : Synchronisation avec l'ouverture de la timeline
        const observer = new MutationObserver(() => {
            this.syncGuidanceHost();
            this.syncPosition();
        });
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
        });
        this.unsubscribers.push(() => observer.disconnect());

        this.syncVisibility();
        this.syncGuidanceHost();
        this.syncPosition();
    }

    private syncGuidanceHost(): void {
        if (!this.el) return;
        const guidanceSlot = document.getElementById(
            'guidance-inclinometer-slot'
        );
        if (guidanceSlot) guidanceSlot.hidden = this.el.hidden;
        const target =
            document.body.classList.contains('guidance-active') && guidanceSlot
                ? guidanceSlot
                : document.body;
        if (this.el.parentElement !== target) target.appendChild(this.el);
    }

    private syncPosition(): void {
        if (this._isExpanded) this.positionDetail();
    }

    private syncVisibility(): void {
        const shouldShow =
            !state.IS_2D_MODE &&
            state.ZOOM >= MIN_ZOOM_DISPLAY &&
            state.SHOW_INCLINOMETER;
        if (this.el) this.el.hidden = !shouldShow;
        const guidanceSlot = document.getElementById(
            'guidance-inclinometer-slot'
        );
        if (guidanceSlot) guidanceSlot.hidden = !shouldShow;

        // Réticule visible uniquement en mode libre
        if (this.reticle) {
            this.reticle.hidden = !shouldShow || state.isFollowingUser;
        }

        const proActive = isProActive();
        if (shouldShow && proActive) this.startPolling();
        else {
            this.stopPolling();
            this.closeDetail();
        }
        if (shouldShow && !proActive) this.renderLockedState();
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
        if (!this.el) return;

        // Si pas Pro : on affiche juste le verrou (v5.54)
        if (!isProActive()) {
            this.renderLockedState();
            return;
        }
        if (!state.controls || !state.camera || !state.originTile) return;

        let targetX: number;
        let targetZ: number;

        if (state.isFollowingUser && state.userLocation && state.originTile) {
            // MODE SUIVI : Position utilisateur + anticipation
            const pos = lngLatToWorld(
                state.userLocation.lon,
                state.userLocation.lat,
                state.originTile
            );
            const heading = state.userHeading || 0;
            const headingRad = (heading * Math.PI) / 180;

            // On projette à 15m devant (0° = Nord = -Z, 90° = Est = +X)
            targetX = pos.x + Math.sin(headingRad) * ANTICIPATION_DISTANCE_M;
            targetZ = pos.z - Math.cos(headingRad) * ANTICIPATION_DISTANCE_M;
        } else {
            // MODE LIBRE : Sous le réticule écran via Raycasting
            const ndcX = (this._reticleX / window.innerWidth) * 2 - 1;
            const ndcY = -(this._reticleY / window.innerHeight) * 2 + 1;

            this._ndc.set(ndcX, ndcY);
            this._raycaster.setFromCamera(this._ndc, state.camera);

            const hit = findTerrainIntersection(this._raycaster.ray);
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

        // Vérifier si on a des données d'élévation valides (tous à 0 = pas de relief)
        const hasElevation = hE !== 0 || hW !== 0 || hS !== 0 || hN !== 0;

        if (!hasElevation) {
            const labelKey = state.isFollowingUser
                ? 'inclinometer.label_following'
                : 'inclinometer.label';
            const label = i18n.t(labelKey);
            this.renderSummary('—° (—%)', label);
            this.setDangerLevel('unavailable');
            return;
        }

        const exag = state.RELIEF_EXAGGERATION || 1;
        let realDHdX = (hE - hW) / exag / (2 * d);
        let realDHdZ = (hS - hN) / exag / (2 * d);

        // v5.40.28 : Correction LATITUDE pour l'inclinomètre
        // En Mercator, les distances horizontales sont dilatées par 1/cos(lat).
        // Pour retrouver la pente réelle, on doit diviser la pente apparente par cos(lat).
        const { lat } = worldToLngLat(targetX, targetZ, state.originTile);
        const latFactor = Math.cos((lat * Math.PI) / 180);
        if (latFactor > 0.01) {
            realDHdX /= latFactor;
            realDHdZ /= latFactor;
        }

        const maxSlopeRad = Math.atan(
            Math.sqrt(realDHdX * realDHdX + realDHdZ * realDHdZ)
        );
        this._lastSlopeDeg = Math.round(maxSlopeRad * (180 / Math.PI));
        this._lastSlopePct = Math.round(Math.tan(maxSlopeRad) * 100);
        this._lastAspectDeg = Math.round(
            ((Math.atan2(realDHdX, realDHdZ) * 180) / Math.PI + 360) % 360
        );

        // Mise à jour UI
        const labelKey = state.isFollowingUser
            ? 'inclinometer.label_following'
            : 'inclinometer.label';
        const label = i18n.t(labelKey);

        if (state.isFollowingUser) {
            // MODE SUIVI : Tout en % pour plus de clarté intuitive (v5.40.27)
            const headingRad = ((state.userHeading || 0) * Math.PI) / 180;
            const dirX = Math.sin(headingRad);
            const dirZ = -Math.cos(headingRad);

            // v5.40.28 : La pente projetée doit aussi être corrigée par la latitude
            const pathSlope = realDHdX * dirX + realDHdZ * dirZ;
            const pathSlopePct = Math.round(pathSlope * 100);
            const sign = pathSlopePct > 0 ? '+' : '';

            this.renderSummary(
                `${sign}${pathSlopePct}% · max. ${this._lastSlopePct}%`,
                label
            );
        } else {
            // MODE LIBRE : Priorité à la pente max du terrain (°) pour la lecture de carte/avalanche
            this.renderSummary(
                `${this._lastSlopeDeg}° (${this._lastSlopePct}%)`,
                label
            );
        }

        this.setDangerLevel(this.getDangerLevel());

        if (this._isExpanded && this.detailEl) this.updateDetailContent();
    }

    private renderLockedState(): void {
        if (!this.el) return;
        this.renderSummary('—° (—%)', i18n.t('inclinometer.label'), true);
        this.setDangerLevel('locked');
    }

    private renderSummary(value: string, label: string, locked = false): void {
        if (this.summaryValueEl) this.summaryValueEl.textContent = value;
        if (this.summaryLabelEl) this.summaryLabelEl.textContent = label;
        if (this.lockEl) this.lockEl.hidden = !locked;
    }

    private getDangerLevel(): 'low' | 'moderate' | 'high' | 'extreme' {
        if (this._lastSlopeDeg >= 40) return 'extreme';
        if (this._lastSlopeDeg >= 35) return 'high';
        if (this._lastSlopeDeg >= 30) return 'moderate';
        return 'low';
    }

    private setDangerLevel(
        level:
            'unavailable' | 'locked' | 'low' | 'moderate' | 'high' | 'extreme'
    ): void {
        if (this.el) this.el.dataset.level = level;
        if (this.reticle) this.reticle.dataset.level = level;
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

    private onPointerMove(e: PointerEvent): void {
        if (!this._isDraggingReticle) return;

        const dx = e.clientX - this._dragStartX;
        const dy = e.clientY - this._dragStartY;

        requestAnimationFrame(() => {
            if (this._isDraggingReticle && this.reticle) {
                this._reticleX = Math.max(
                    20,
                    Math.min(
                        window.innerWidth - 20,
                        this._reticleStartLeft + dx
                    )
                );
                this._reticleY = Math.max(
                    20,
                    Math.min(
                        window.innerHeight - 20,
                        this._reticleStartTop + dy
                    )
                );
                this.reticle.style.left = `${this._reticleX}px`;
                this.reticle.style.top = `${this._reticleY}px`;
            }
        });
    }

    private onPointerUp(e: PointerEvent): void {
        if (this._isDraggingReticle && this.reticle) {
            this._isDraggingReticle = false;
            this.reticle.style.opacity = '1';
            this.reticle.releasePointerCapture(e.pointerId);
        }
    }

    private onReticleKeyDown(e: KeyboardEvent): void {
        const step = e.shiftKey ? 24 : 8;
        const movements: Partial<Record<string, [number, number]>> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
        };
        if (e.key === 'Home') {
            e.preventDefault();
            this.resetReticle();
            return;
        }
        const movement = movements[e.key];
        if (!movement || !this.reticle) return;
        e.preventDefault();
        this._reticleX = Math.max(
            24,
            Math.min(window.innerWidth - 24, this._reticleX + movement[0])
        );
        this._reticleY = Math.max(
            24,
            Math.min(window.innerHeight - 24, this._reticleY + movement[1])
        );
        this.reticle.style.left = `${this._reticleX}px`;
        this.reticle.style.top = `${this._reticleY}px`;
    }

    // ── Panel de détail ────────────────────────────────────────────────

    private toggleDetail(): void {
        if (!isProActive()) {
            showUpgradePrompt('inclinometer');
            return;
        }
        if (this._isExpanded) this.closeDetail();
        else this.openDetail();
        this.el?.setAttribute('aria-expanded', String(this._isExpanded));
    }

    private openDetail(): void {
        if (this._isExpanded || !this.el) return;
        this._isExpanded = true;

        this.detailEl = document.createElement('div');
        this.detailEl.id = 'inclinometer-detail';
        this.detailEl.className = 'inclinometer-detail';
        this.detailEl.setAttribute('role', 'region');
        this.detailEl.setAttribute(
            'aria-label',
            i18n.t('settings.label.inclinometer')
        );

        this.updateDetailContent();
        document.body.appendChild(this.detailEl);
        this.positionDetail();

        requestAnimationFrame(() => {
            this.detailEl?.classList.add('is-visible');
        });
    }

    private closeDetail(): void {
        this._isExpanded = false;
        this.el?.setAttribute('aria-expanded', 'false');
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

        const dangerKey = this.getDangerLevel();
        this.detailEl.dataset.level = dangerKey;

        this.detailEl.innerHTML = `
            <div class="inclinometer-detail-heading">
                <span class="inclinometer-detail-value">${this._lastSlopeDeg}° <span>(${this._lastSlopePct}%)</span></span>
                <span class="inclinometer-detail-aspect">${i18n.t('inclinometer.aspect')}: ${dirLabel} (${this._lastAspectDeg}°)</span>
            </div>
            <div class="inclinometer-detail-danger">
                ${i18n.t(`inclinometer.danger.${dangerKey}`)}
            </div>
            <div class="inclinometer-detail-hint">${i18n.t('inclinometer.hint')}</div>
        `;
    }

    public dispose(): void {
        this.stopPolling();
        this.closeDetail();
        this.unsubscribers.forEach((u) => u());
        this.unsubscribers = [];
        this.el?.remove();
        this.reticle?.remove();
        this.el = null;
        this.reticle = null;
        this.summaryValueEl = null;
        this.summaryLabelEl = null;
        this.lockEl = null;
    }
}

export function showInclinometerUpsell(): void {
    showUpgradePrompt('inclinometer');
}
