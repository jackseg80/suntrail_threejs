/**
 * gpxService.ts — GPX utilities (v5.29.36)
 */

import gpxParser from 'gpxparser';
import { state, isProActive } from './state';
import { showUpgradePrompt } from './iap';
import { haptic } from './haptics';
import { addGPXLayer } from './gpxLayers';
import { updateVisibleTiles } from './terrain';
import { lngLatToTile } from './geo';

export class GPXService {
    
    async handleGPXImport(xml: string, fileName: string = 'track.gpx'): Promise<void> {
        try {
            const gpx = new gpxParser(); 
            gpx.parse(xml);
            if (!gpx.tracks?.length) {
                void haptic('warning');
                return;
            }

            // Gate Freemium : 1 tracé max pour les utilisateurs gratuits
            if (!isProActive() && state.gpxLayers.length >= 1) {
                showUpgradePrompt('multi_gpx');
                void haptic('warning');
                return;
            }
            
            const startPt = gpx.tracks[0].points[0];
            
            // Only recenter map on first import
            if (state.gpxLayers.length === 0) {
                state.TARGET_LAT = startPt.lat; 
                state.TARGET_LON = startPt.lon;
                state.ZOOM = 13; 
                state.originTile = lngLatToTile(startPt.lon, startPt.lat, 13);
                await updateVisibleTiles();
            }
            
            const name = fileName.replace(/\.gpx$/i, '');
            addGPXLayer(gpx, name);
            void haptic('success');
        } catch (e) {
            void haptic('warning');
            throw e;
        }
    }

    /**
     * Génère un GPX à partir d'une couche existante (pour export).
     */
    buildGPXStringFromLayer(layer: any): string {
        const date = new Date().toLocaleDateString();
        const trackName = layer.name || `SunTrail Track - ${date}`;
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SunTrail 3D" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${trackName}</name>
    <trkseg>`;
        
        const points = layer.rawData?.tracks?.[0]?.points || [];
        points.forEach((p: any) => {
            const ele = p.ele !== undefined ? p.ele : (p.alt !== undefined ? p.alt : 0);
            const time = p.time || new Date().toISOString();
            gpx += `
      <trkpt lat="${p.lat}" lon="${p.lon}">
        <ele>${ele.toFixed(1)}</ele>
        <time>${time}</time>
      </trkpt>`;
        });
        gpx += `
    </trkseg>
  </trk>
</gpx>`;
        return gpx;
    }
}

export const gpxService = new GPXService();
