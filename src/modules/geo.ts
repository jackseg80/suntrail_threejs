export const EARTH_CIRCUMFERENCE = 40075016.68;

export function lngLatToWorld(lon: number, lat: number, originTile: {x: number, y: number, z: number}): { x: number; z: number } {
    const xNorm = (lon + 180) / 360;
    const yNorm = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2;
    
    const originUnit = 1.0 / Math.pow(2, originTile.z);
    const oxNorm = (originTile.x + 0.5) * originUnit;
    const oyNorm = (originTile.y + 0.5) * originUnit;
    
    return { 
        x: (xNorm - oxNorm) * EARTH_CIRCUMFERENCE, 
        z: (yNorm - oyNorm) * EARTH_CIRCUMFERENCE 
    };
}

export function worldToLngLat(worldX: number, worldZ: number, originTile: {x: number, y: number, z: number}): { lat: number; lon: number } {
    const originUnit = 1.0 / Math.pow(2, originTile.z);
    const oxNorm = (originTile.x + 0.5) * originUnit;
    const oyNorm = (originTile.y + 0.5) * originUnit;
    
    const xNorm = worldX / EARTH_CIRCUMFERENCE + oxNorm;
    const yNorm = worldZ / EARTH_CIRCUMFERENCE + oyNorm;
    
    const lon = xNorm * 360 - 180;
    const n = Math.PI - 2 * Math.PI * yNorm;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    
    return { lat, lon };
}

export function lngLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number; z: number } {
    const n = Math.pow(2, zoom);
    let x = Math.floor((lon + 180) / 360 * n);
    let y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
    x = Math.max(0, Math.min(n - 1, x));
    y = Math.max(0, Math.min(n - 1, y));
    return { x, y, z: zoom };
}

export function getTileBounds(tile: {zoom: number, tx: number, ty: number}) {
    const n = Math.pow(2, tile.zoom);
    const lonWest = tile.tx / n * 360 - 180;
    const lonEast = (tile.tx + 1) / n * 360 - 180;
    const latRadNorth = Math.atan(Math.sinh(Math.PI * (1 - 2 * tile.ty / n)));
    const latNorth = latRadNorth * 180 / Math.PI;
    const latRadSouth = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tile.ty + 1) / n)));
    const latSouth = latRadSouth * 180 / Math.PI;
    return { north: latNorth, south: latSouth, west: lonWest, east: lonEast };
}
