import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import gpxParser from 'gpxparser';
import { addGPXLayer } from './terrain';
import { state } from './state';

// Helper to simulate handleGPX logic from TrackSheet
async function simulateHandleGPX(xml: string) {
    const gpx = new gpxParser();
    try {
        gpx.parse(xml);
    } catch (e) {
        throw new Error('Parsing failed');
    }
    
    if (!gpx.tracks?.length && !gpx.routes?.length && !gpx.waypoints?.length) {
        throw new Error('No tracks, routes or waypoints found');
    }
    
    // In TrackSheet, it checks gpx.tracks[0].points
    if (gpx.tracks?.[0] && (!gpx.tracks[0].points || gpx.tracks[0].points.length === 0)) {
        throw new Error('No points in first track');
    }

    return addGPXLayer(gpx, 'test-track');
}

describe('GPX Robustness Audit', () => {
    beforeEach(() => {
        state.scene = new THREE.Scene();
        state.originTile = { x: 4270, y: 2891, z: 13 };
        state.gpxLayers = [];
        state.activeGPXLayerId = null;
    });

    it('should fail gracefully with an empty file', async () => {
        const emptyXml = '';
        await expect(simulateHandleGPX(emptyXml)).rejects.toThrow();
    });

    it('should fail gracefully with corrupted XML', async () => {
        const corruptedXml = '<?xml version="1.0"?><gpx><trk><name>Unclosed tag</trk>';
        // gpxparser might not throw but return empty tracks
        await expect(simulateHandleGPX(corruptedXml)).rejects.toThrow();
    });

    it('should handle GPX with no points', async () => {
        const noPointsXml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SunTrail" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Empty track</name>
    <trkseg>
    </trkseg>
  </trk>
</gpx>`;
        await expect(simulateHandleGPX(noPointsXml)).rejects.toThrow();
    });

    it('should handle GPX with NaN coordinates', async () => {
        const nanXml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SunTrail" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>NaN track</name>
    <trkseg>
      <trkpt lat="NaN" lon="7.0"><ele>1000</ele></trkpt>
      <trkpt lat="46.1" lon="NaN"><ele>1100</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;
        
        const gpx = new gpxParser();
        gpx.parse(nanXml);
        
        // addGPXLayer calls gpxDrapePoints which calls lngLatToWorld.
        // If lngLatToWorld receives NaN, it might return undefined or crash.
        // We expect it to handle it or we catch the error.
        expect(() => addGPXLayer(gpx, 'nan-track')).toThrow();
    });

    it('should handle GPX with missing elevation', async () => {
        const noEleXml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SunTrail" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>No elevation</name>
    <trkseg>
      <trkpt lat="46.0" lon="7.0"></trkpt>
      <trkpt lat="46.1" lon="7.1"></trkpt>
    </trkseg>
  </trk>
</gpx>`;
        const gpx = new gpxParser();
        gpx.parse(noEleXml);
        
        expect(() => addGPXLayer(gpx, 'no-ele')).not.toThrow();
        const layer = state.gpxLayers[0];
        expect(layer.stats.dPlus).toBe(0);
        expect(layer.stats.dMinus).toBe(0);
    });
});
