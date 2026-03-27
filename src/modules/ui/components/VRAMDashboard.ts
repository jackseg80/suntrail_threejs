import { BaseComponent } from '../core/BaseComponent';
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

export class VRAMDashboard extends BaseComponent {
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private lastAlertTime = 0;
    private static readonly ALERT_COOLDOWN = 30_000; // 30s

    constructor() {
        super('template-vram-dashboard', 'vram-slot');
    }

    public render(): void {
        // Panel starts hidden — no initial metrics fetch needed
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

    public toggle(): void {
        if (!this.element) return;
        const panel = this.element;
        const isVisible = panel.style.display !== 'none';
        if (isVisible) {
            panel.style.display = 'none';
            this.stop();
        } else {
            panel.style.display = '';
            this.start();
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

    public override dispose(): void {
        this.stop();
        super.dispose();
    }
}
