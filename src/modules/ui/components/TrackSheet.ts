import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { showToast } from '../../utils';
import { startLocationTracking } from '../../location';
import { sheetManager } from '../core/SheetManager';
// @ts-ignore
import gpxParser from 'gpxparser';
import { updateVisibleTiles, updateGPXMesh } from '../../terrain';
import { lngLatToTile } from '../../geo';
import { updateElevationProfile } from '../../profile';

export class TrackSheet extends BaseComponent {
    constructor() {
        super('template-track', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const closeBtn = document.getElementById('close-track');
        closeBtn?.addEventListener('click', () => {
            sheetManager.close();
        });

        const recBtn = document.getElementById('rec-btn-sheet') as HTMLButtonElement;
        recBtn?.addEventListener('click', async () => {
            state.isRecording = !state.isRecording;
            this.updateRecUI();
            
            if (state.isRecording) {
                showToast("🔴 Enregistrement démarré");
                if (!state.isFollowingUser) await startLocationTracking();
                if (state.userLocation) {
                    state.recordedPoints = [{ ...state.userLocation, timestamp: Date.now() }];
                } else {
                    state.recordedPoints = [];
                }
            } else {
                showToast("⏹️ Enregistrement stoppé");
            }
        });

        const importBtn = document.getElementById('import-gpx-sheet');
        const gpxUpload = document.getElementById('gpx-upload') as HTMLInputElement;
        
        importBtn?.addEventListener('click', () => {
            gpxUpload?.click();
        });

        gpxUpload?.addEventListener('change', (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    this.handleGPX(ev.target!.result as string);
                };
                reader.readAsText(file);
            }
        });

        const exportBtn = document.getElementById('export-gpx-sheet');
        exportBtn?.addEventListener('click', () => {
            if (state.recordedPoints.length < 2) {
                showToast("Tracé trop court pour export");
                return;
            }
            this.exportRecordedGPX();
        });

        this.addSubscription(state.subscribe('isRecording', () => this.updateRecUI()));
        this.addSubscription(state.subscribe('recordedPoints', () => this.updateStats()));
        
        this.updateRecUI();
        this.updateStats();
    }

    private updateRecUI() {
        const recBtn = document.getElementById('rec-btn-sheet') as HTMLButtonElement;
        if (!recBtn) return;
        
        if (state.isRecording) {
            recBtn.classList.add('active');
            recBtn.innerHTML = '<span class="rec-icon">⏹️</span> STOP';
        } else {
            recBtn.classList.remove('active');
            recBtn.innerHTML = '<span class="rec-icon">🔴</span> REC';
        }
    }

    private updateStats() {
        if (!this.element) return;
        
        const distEl = document.getElementById('track-dist');
        const pointsEl = document.getElementById('track-points');
        const dplusEl = document.getElementById('track-dplus');
        const dminusEl = document.getElementById('track-dminus');

        if (pointsEl) pointsEl.textContent = state.recordedPoints.length.toString();
        
        if (state.recordedPoints.length < 2) {
            if (distEl) distEl.innerHTML = `0.0 <span style="font-size:13px;color:var(--t2)">km</span>`;
            if (dplusEl) dplusEl.innerHTML = `+0 <span style="font-size:12px">m</span>`;
            if (dminusEl) dminusEl.innerHTML = `−0 <span style="font-size:12px">m</span>`;
            return;
        }

        let dist = 0;
        let dplus = 0;
        let dminus = 0;

        for (let i = 1; i < state.recordedPoints.length; i++) {
            const p1 = state.recordedPoints[i-1];
            const p2 = state.recordedPoints[i];
            
            // Simple distance calculation (Haversine would be better but this is a placeholder)
            const dx = (p2.lon - p1.lon) * 111320 * Math.cos(p1.lat * Math.PI / 180);
            const dy = (p2.lat - p1.lat) * 111320;
            dist += Math.sqrt(dx*dx + dy*dy);

            const diff = p2.alt - p1.alt;
            if (diff > 0) dplus += diff;
            else dminus += Math.abs(diff);
        }

        if (distEl) distEl.innerHTML = `${(dist / 1000).toFixed(2)} <span style="font-size:13px;color:var(--t2)">km</span>`;
        if (dplusEl) dplusEl.innerHTML = `+${Math.round(dplus)} <span style="font-size:12px">m</span>`;
        if (dminusEl) dminusEl.innerHTML = `−${Math.round(dminus)} <span style="font-size:12px">m</span>`;
    }

    private exportRecordedGPX() {
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SunTrail 3D" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>SunTrail Recorded Track - ${new Date().toLocaleDateString()}</name>
    <trkseg>`;

        state.recordedPoints.forEach(p => {
            gpx += `
      <trkpt lat="${p.lat}" lon="${p.lon}">
        <ele>${p.alt.toFixed(1)}</ele>
        <time>${new Date(p.timestamp).toISOString()}</time>
      </trkpt>`;
        });

        gpx += `
    </trkseg>
  </trk>
</gpx>`;

        const blob = new Blob([gpx], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `suntrail-track-${Date.now()}.gpx`;
        link.click();
        URL.revokeObjectURL(url);
        showToast("GPX téléchargé");
    }

    private async handleGPX(xml: string) {
        const gpx = new gpxParser(); 
        gpx.parse(xml);
        if (!gpx.tracks?.length) return;
        state.rawGpxData = gpx;
        const startPt = gpx.tracks[0].points[0];
        state.TARGET_LAT = startPt.lat; 
        state.TARGET_LON = startPt.lon;
        state.ZOOM = 13; 
        state.originTile = lngLatToTile(startPt.lon, startPt.lat, 13);
        updateGPXMesh(); 
        updateElevationProfile(); 
        await updateVisibleTiles();
    }
}
