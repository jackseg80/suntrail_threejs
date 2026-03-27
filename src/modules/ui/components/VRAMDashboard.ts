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

/**
 * VRAMDashboard — standalone overlay on the map (not a BaseComponent).
 * Displays GPU metrics (VRAM) alongside the Stats.js FPS panel.
 * Controlled by a single toggle in Settings.
 */
export class VRAMDashboard {
    private panel: HTMLElement | null = null;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private lastAlertTime = 0;
    private static readonly ALERT_COOLDOWN = 30_000; // 30s

    /**
     * Creates the overlay panel and appends it to document.body.
     * Replaces the old hydrate() / BaseComponent pattern.
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
        `;
        document.body.appendChild(this.panel);

        // Synchroniser avec state.SHOW_STATS dès l'initialisation
        // (évite la désynchronisation entre l'état sauvegardé et l'affichage réel)
        this.setVisible(state.SHOW_STATS);
    }

    /**
     * Affiche ou masque le dashboard VRAM + Stats.js FPS selon la valeur booléenne.
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

    private updateMetrics(): void {
        const info = state.renderer?.info;
        const geo = info?.memory?.geometries ?? 0;
        const tex = info?.memory?.textures ?? 0;
        const draw = info?.render?.calls ?? 0;
        const tris = info?.render?.triangles ?? 0;
        const tiles = activeTiles.size;
        const workers = (tileWorkerManager as any).workers?.length ?? 8;

        this.setSpan('vram-geo', String(geo));
        this.setSpan('vram-tex', String(tex));
        this.setSpan('vram-draw', String(draw));
        this.setSpan('vram-tri', formatTriangles(tris));
        this.setSpan('vram-tiles', String(tiles));
        this.setSpan('vram-workers', String(workers));

        // Texture alert with cooldown
        this.checkTextureAlert(tex);
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

    public dispose(): void {
        this.stop();
        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel);
        }
        this.panel = null;
    }
}
