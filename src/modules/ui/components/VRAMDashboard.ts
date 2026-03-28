import { state } from '../../state';
import { activeTiles } from '../../terrain';
import { tileWorkerManager } from '../../workerManager';
import { showToast } from '../../utils';
import { i18n } from '../../../i18n/I18nService';
import type { PresetType } from '../../state';

export const TEXTURE_LIMITS: Record<string, number> = {
    eco: 50,
    balanced: 150,
    performance: 300,
    ultra: 500,
    custom: 200
};

export function formatTriangles(n: number): string {
    if (n >= 1000) {
        return (n / 1000).toFixed(1) + 'K';
    }
    return String(n);
}

// ---------------------------------------------------------------------------
// PerfRecorder — enregistrement de sessions pour analyse IA
// ---------------------------------------------------------------------------

/** Un échantillon de métriques capturé toutes les 500ms pendant l'enregistrement. */
export interface PerfSample {
    /** Temps écoulé depuis le début de la session (ms) */
    t: number;
    fps: number;
    textures: number;
    geometries: number;
    drawCalls: number;
    triangles: number;
    tiles: number;
    zoom: number;
    isProcessingTiles: boolean;
    isUserInteracting: boolean;
    energySaver: boolean;
}

/** Métadonnées de session exportées avec les échantillons. */
export interface PerfSession {
    appVersion: string;
    preset: string;
    ua: string;
    startedAt: string;
    sampleIntervalMs: number;
    totalSamples: number;
    durationMs: number;
    samples: PerfSample[];
}

/**
 * VRAMDashboard — overlay GPU + PerfRecorder intégré.
 * Standalone (pas un BaseComponent). Contrôlé par toggle "Stats de performance".
 */
export class VRAMDashboard {
    private panel: HTMLElement | null = null;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private lastAlertTime = 0;
    private static readonly ALERT_COOLDOWN = 30_000; // 30s

    // --- PerfRecorder ---
    private samples: PerfSample[] = [];
    private isRecording = false;
    private recordingStartTime = 0;
    private static readonly MAX_SAMPLES = 600; // 5min @ 500ms

    /**
     * Crée l'overlay et l'injecte dans document.body.
     */
    public init(): void {
        this.panel = document.createElement('div');
        this.panel.id = 'vram-dashboard';
        this.panel.className = 'vram-panel';
        this.panel.style.cssText = 'display:none; position:fixed; top:130px; left:0; z-index:9999;';
        this.panel.innerHTML = `
            <div class="vram-row"><span class="vram-label">${i18n.t('vram.geometries')}</span><span class="vram-value" id="vram-geo">—</span></div>
            <div class="vram-row"><span class="vram-label">${i18n.t('vram.textures')}</span><span class="vram-value" id="vram-tex">—</span></div>
            <div class="vram-row"><span class="vram-label">${i18n.t('vram.drawCalls')}</span><span class="vram-value" id="vram-draw">—</span></div>
            <div class="vram-row"><span class="vram-label">${i18n.t('vram.triangles')}</span><span class="vram-value" id="vram-tri">—</span></div>
            <div class="vram-row"><span class="vram-label">${i18n.t('vram.tiles')}</span><span class="vram-value" id="vram-tiles">—</span></div>
            <div class="vram-row"><span class="vram-label">${i18n.t('vram.workers')}</span><span class="vram-value" id="vram-workers">—</span></div>
            <div class="vram-row vram-row--fps"><span class="vram-label">FPS</span><span class="vram-value" id="vram-fps">—</span></div>
            <div class="vram-record-bar">
                <button id="vram-record-btn" class="vram-record-btn" aria-label="Enregistrer session perf">⏺ Enregistrer</button>
                <span id="vram-record-status" class="vram-record-status"></span>
            </div>
        `;
        document.body.appendChild(this.panel);

        // Brancher le bouton record
        const btn = this.panel.querySelector<HTMLButtonElement>('#vram-record-btn');
        btn?.addEventListener('click', () => this.toggleRecording());

        // Synchroniser avec state.SHOW_STATS dès l'initialisation
        this.setVisible(state.SHOW_STATS);
    }

    /**
     * Affiche ou masque le dashboard VRAM + Stats.js FPS.
     * Préférer setVisible() à toggle() pour éviter les désynchronisations.
     */
    public setVisible(visible: boolean): void {
        if (!this.panel) return;
        if (visible) {
            this.panel.style.display = 'block';
            if (state.stats) state.stats.dom.style.display = 'block';
            this.start();
        } else {
            this.panel.style.display = 'none';
            if (state.stats) state.stats.dom.style.display = 'none';
            this.stop();
            // Arrêter l'enregistrement si le panel est fermé
            if (this.isRecording) this.stopRecording(false);
        }
    }

    /** Bascule la visibilité (conservé pour compatibilité). */
    public toggle(): void {
        const isVisible = this.panel?.style.display !== 'none';
        this.setVisible(!isVisible);
    }

    public start(): void {
        if (this.intervalId !== null) return;
        this.intervalId = setInterval(() => this.updateMetrics(), 500);
    }

    public stop(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    public isRunning(): boolean {
        return this.intervalId !== null;
    }

    // -----------------------------------------------------------------------
    // PerfRecorder — méthodes publiques
    // -----------------------------------------------------------------------

    /** Démarre l'enregistrement. Réinitialise le buffer si déjà plein. */
    public startRecording(): void {
        this.samples = [];
        this.isRecording = true;
        this.recordingStartTime = performance.now();
        this.updateRecordBtn();
    }

    /**
     * Arrête l'enregistrement.
     * @param exportNow — si true, copie le JSON dans le presse-papier automatiquement.
     */
    public stopRecording(exportNow = true): void {
        this.isRecording = false;
        this.updateRecordBtn();
        if (exportNow && this.samples.length > 0) {
            this.exportToClipboard();
        }
    }

    /** Copie le JSON de la dernière session dans le presse-papier. */
    public exportToClipboard(): void {
        if (this.samples.length === 0) return;

        const session: PerfSession = {
            appVersion: '5.11.0',
            preset: state.PERFORMANCE_PRESET,
            ua: navigator.userAgent,
            startedAt: new Date(Date.now() - (performance.now() - this.recordingStartTime)).toISOString(),
            sampleIntervalMs: 500,
            totalSamples: this.samples.length,
            durationMs: Math.round(this.samples[this.samples.length - 1].t),
            samples: this.samples,
        };

        const json = JSON.stringify(session, null, 2);

        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(json).then(() => {
                showToast('📋 Session perf copiée — colle dans le chat pour analyse');
                this.updateStatus(`✅ ${this.samples.length} échantillons copiés`);
            }).catch(() => {
                // Fallback si clipboard API refusée
                this.fallbackCopy(json);
            });
        } else {
            this.fallbackCopy(json);
        }
    }

    /** Retourne les échantillons actuels (pour les tests). */
    public getSamples(): PerfSample[] {
        return [...this.samples];
    }

    /** Retourne true si un enregistrement est en cours. */
    public getIsRecording(): boolean {
        return this.isRecording;
    }

    // -----------------------------------------------------------------------
    // Privé
    // -----------------------------------------------------------------------

    private toggleRecording(): void {
        if (this.isRecording) {
            this.stopRecording(true);
        } else {
            this.startRecording();
        }
    }

    private updateMetrics(): void {
        const info = state.renderer?.info;
        const geo = info?.memory?.geometries ?? 0;
        const tex = info?.memory?.textures ?? 0;
        const draw = info?.render?.calls ?? 0;
        const tris = info?.render?.triangles ?? 0;
        const tiles = activeTiles.size;
        const workers = (tileWorkerManager as any).workers?.length ?? 8;
        const fps = state.currentFPS;

        this.setSpan('vram-geo', String(geo));
        this.setSpan('vram-tex', String(tex));
        this.setSpan('vram-draw', String(draw));
        this.setSpan('vram-tri', formatTriangles(tris));
        this.setSpan('vram-tiles', String(tiles));
        this.setSpan('vram-workers', String(workers));
        this.setSpan('vram-fps', String(fps));

        this.checkTextureAlert(tex);

        // Enregistrement PerfRecorder
        if (this.isRecording) {
            const t = Math.round(performance.now() - this.recordingStartTime);

            this.samples.push({
                t,
                fps,
                textures: tex,
                geometries: geo,
                drawCalls: draw,
                triangles: tris,
                tiles,
                zoom: state.ZOOM,
                isProcessingTiles: state.isProcessingTiles,
                isUserInteracting: state.isUserInteracting,
                energySaver: state.ENERGY_SAVER,
            });

            // Buffer circulaire : évincer le plus ancien si plein
            if (this.samples.length > VRAMDashboard.MAX_SAMPLES) {
                this.samples.shift();
            }

            // Mise à jour du compteur d'échantillons dans le bouton
            const elapsed = Math.floor(t / 1000);
            this.updateStatus(`⏺ ${elapsed}s — ${this.samples.length} échantillons`);
        }
    }

    private setSpan(id: string, value: string): void {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    private checkTextureAlert(tex: number): void {
        const preset = state.PERFORMANCE_PRESET as PresetType;
        const limit = TEXTURE_LIMITS[preset] ?? TEXTURE_LIMITS.custom;
        if (tex > limit) {
            const now = Date.now();
            if (now - this.lastAlertTime >= VRAMDashboard.ALERT_COOLDOWN) {
                this.lastAlertTime = now;
                showToast('\u26A0\uFE0F ' + i18n.t('vram.alert.textures') + ' (' + tex + ')');
            }
        }
    }

    private updateRecordBtn(): void {
        const btn = this.panel?.querySelector<HTMLButtonElement>('#vram-record-btn');
        if (!btn) return;
        if (this.isRecording) {
            btn.textContent = '⏹ Stop + Copier';
            btn.classList.add('vram-record-btn--active');
        } else {
            btn.textContent = '⏺ Enregistrer';
            btn.classList.remove('vram-record-btn--active');
            this.updateStatus('');
        }
    }

    private updateStatus(msg: string): void {
        const el = this.panel?.querySelector<HTMLElement>('#vram-record-status');
        if (el) el.textContent = msg;
    }

    private fallbackCopy(text: string): void {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('📋 Session perf copiée (fallback)');
    }

    public dispose(): void {
        this.stop();
        if (this.isRecording) this.stopRecording(false);
        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel);
        }
        this.panel = null;
    }
}
