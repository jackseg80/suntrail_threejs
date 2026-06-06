import * as THREE from 'three';
import { state } from './state';
import type { BBox } from './geo';
import { lngLatToWorld } from './geo';
import { getAltitudeAt } from './analysis';

const OVERLAY_HEIGHT_OFFSET = 30;
const BORDER_THICKNESS_BASE = 50;

function computeBorderThickness(
    worldSizeX: number,
    worldSizeZ: number
): number {
    const minDim = Math.min(worldSizeX, worldSizeZ);
    return Math.max(BORDER_THICKNESS_BASE, minDim * 0.01);
}

export type OverlayMode = 'selecting' | 'downloading' | 'cached';

export class ZoneOverlay {
    private borderMeshes: THREE.Mesh[] = [];
    private fill: THREE.Mesh | null = null;
    private group: THREE.Group | null = null;
    private currentBbox: BBox | null = null;
    private mode: OverlayMode = 'selecting';

    show(bbox: BBox, mode: OverlayMode = 'selecting'): void {
        this.mode = mode;
        this.currentBbox = bbox;
        this.createOrUpdate(bbox);
    }

    setMode(mode: OverlayMode): void {
        this.mode = mode;
        if (this.currentBbox) {
            this.createOrUpdate(this.currentBbox);
        }
    }

    update(): void {
        if (!this.currentBbox || !this.group) return;
        this.createOrUpdate(this.currentBbox);
    }

    updateFromBBox(bbox: BBox): void {
        this.currentBbox = bbox;
        this.createOrUpdate(bbox);
    }

    hide(): void {
        if (this.group && state.scene) {
            state.scene.remove(this.group);
        }
        this.disposeGeometries();
        this.currentBbox = null;
    }

    dispose(): void {
        this.hide();
    }

    private createOrUpdate(bbox: BBox): void {
        const origin = state.originTile;

        const centerLon = (bbox.minLon + bbox.maxLon) / 2;
        const centerLat = (bbox.minLat + bbox.maxLat) / 2;
        const centerWorld = lngLatToWorld(centerLon, centerLat, origin);
        let baseY = getAltitudeAt(centerWorld.x, centerWorld.z);
        if (!isFinite(baseY) || baseY < 1) {
            baseY = state.controls?.target?.y ?? 0;
        }

        const corners = [
            { lon: bbox.minLon, lat: bbox.minLat },
            { lon: bbox.maxLon, lat: bbox.minLat },
            { lon: bbox.maxLon, lat: bbox.maxLat },
            { lon: bbox.minLon, lat: bbox.maxLat },
        ];

        const worldCorners = corners.map((c) =>
            lngLatToWorld(c.lon, c.lat, origin)
        );

        const minX = Math.min(...worldCorners.map((w) => w.x));
        const maxX = Math.max(...worldCorners.map((w) => w.x));
        const minZ = Math.min(...worldCorners.map((w) => w.z));
        const maxZ = Math.max(...worldCorners.map((w) => w.z));

        const sizeX = maxX - minX;
        const sizeZ = maxZ - minZ;
        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;
        const y = baseY + OVERLAY_HEIGHT_OFFSET;

        this.disposeGeometries();

        const color = this.mode === 'cached' ? 0x3366ff : 0x00ff66;
        const fillOpacity =
            this.mode === 'downloading'
                ? 0.25
                : this.mode === 'cached'
                  ? 0.12
                  : 0.06;

        const fillGeo = new THREE.PlaneGeometry(sizeX, sizeZ);
        const fillMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: fillOpacity,
            side: THREE.DoubleSide,
            depthTest: false,
        });
        this.fill = new THREE.Mesh(fillGeo, fillMat);
        this.fill.position.set(centerX, y, centerZ);
        this.fill.rotation.x = -Math.PI / 2;
        this.fill.renderOrder = 998;
        this.fill.frustumCulled = false;

        // Borders only for downloading/cached states — selection uses the CSS screen-space frame
        if (this.mode !== 'selecting') {
            const borderColor = this.mode === 'cached' ? 0x6699ff : 0xffffff;
            const borderMat = new THREE.MeshBasicMaterial({
                color: borderColor,
                transparent: false,
                depthTest: false,
            });

            const t = computeBorderThickness(sizeX, sizeZ);

            const bottomBorder = new THREE.Mesh(
                new THREE.BoxGeometry(sizeX + t, 0.1, t),
                borderMat
            );
            bottomBorder.position.set(centerX, y + 0.2, centerZ + sizeZ / 2);

            const topBorder = new THREE.Mesh(
                new THREE.BoxGeometry(sizeX + t, 0.1, t),
                borderMat
            );
            topBorder.position.set(centerX, y + 0.2, centerZ - sizeZ / 2);

            const rightBorder = new THREE.Mesh(
                new THREE.BoxGeometry(t, 0.1, sizeZ + t),
                borderMat
            );
            rightBorder.position.set(centerX + sizeX / 2, y + 0.2, centerZ);

            const leftBorder = new THREE.Mesh(
                new THREE.BoxGeometry(t, 0.1, sizeZ + t),
                borderMat
            );
            leftBorder.position.set(centerX - sizeX / 2, y + 0.2, centerZ);

            for (const m of [
                bottomBorder,
                topBorder,
                rightBorder,
                leftBorder,
            ]) {
                m.renderOrder = 999;
                m.frustumCulled = false;
            }

            this.borderMeshes = [
                bottomBorder,
                topBorder,
                rightBorder,
                leftBorder,
            ];
        } else {
            this.borderMeshes = [];
        }

        if (this.group) {
            if (state.scene) state.scene.remove(this.group);
        }

        this.group = new THREE.Group();
        this.group.add(this.fill);
        for (const m of this.borderMeshes) {
            this.group.add(m);
        }

        if (state.scene) {
            state.scene.add(this.group);
        }
    }

    private disposeGeometries(): void {
        if (this.fill) {
            this.fill.geometry.dispose();
            (this.fill.material as THREE.Material).dispose();
            this.fill = null;
        }
        for (const m of this.borderMeshes) {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
        }
        this.borderMeshes = [];
    }
}
