import * as THREE from 'three';

/**
 * Outils de rendu des traces : détection d'aller-retour (auto-recouvrement),
 * décalage en double voie et chevrons de sens.
 *
 * Ces fonctions ne touchent QUE la géométrie d'affichage. Le guidage, le profil
 * et l'analyse solaire continuent d'utiliser les points lat/lon réels.
 */

export interface SelfOverlapOptions {
    /** Distance horizontale (unités monde) sous laquelle deux passages se recouvrent. */
    minDist?: number;
    /** Écart minimal d'indices entre deux segments pour les considérer distincts. */
    minIndexGap?: number;
}

function pointSegmentDistanceSq(
    px: number,
    pz: number,
    ax: number,
    az: number,
    bx: number,
    bz: number
): number {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cz = az + t * dz;
    const ddx = px - cx;
    const ddz = pz - cz;
    return ddx * ddx + ddz * ddz;
}

/**
 * Détecte si la trace repasse sur elle-même (aller-retour ou boucle qui se
 * recoupe) : deux segments non adjacents proches (< minDist) et de caps
 * opposés. Complexité O(n) via un index spatial.
 */
export function detectSelfOverlap(
    points: THREE.Vector3[],
    options: SelfOverlapOptions = {}
): boolean {
    const minDist = options.minDist ?? 12;
    const minIndexGap = options.minIndexGap ?? 8;
    const n = points.length;
    if (n < minIndexGap + 2) return false;

    const cell = Math.max(minDist, 1);
    const grid = new Map<string, number[]>();
    const key = (gx: number, gz: number) => `${gx}:${gz}`;
    const dirs: Array<{ x: number; z: number }> = [];
    const segCount = n - 1;

    for (let i = 0; i < segCount; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) {
            dirs.push({ x: 0, z: 0 });
            continue;
        }
        dirs.push({ x: dx / len, z: dz / len });
        const steps = Math.max(1, Math.ceil(len / cell));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const gx = Math.floor((a.x + dx * t) / cell);
            const gz = Math.floor((a.z + dz * t) / cell);
            const k = key(gx, gz);
            const arr = grid.get(k);
            if (arr) arr.push(i);
            else grid.set(k, [i]);
        }
    }

    for (let i = 0; i < segCount; i++) {
        const di = dirs[i];
        if (di.x === 0 && di.z === 0) continue;
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / cell));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const px = a.x + dx * t;
            const pz = a.z + dz * t;
            const gx = Math.floor(px / cell);
            const gz = Math.floor(pz / cell);
            for (let ox = -1; ox <= 1; ox++) {
                for (let oz = -1; oz <= 1; oz++) {
                    const arr = grid.get(key(gx + ox, gz + oz));
                    if (!arr) continue;
                    for (const j of arr) {
                        if (Math.abs(i - j) < minIndexGap) continue;
                        const dj = dirs[j];
                        if (dj.x === 0 && dj.z === 0) continue;
                        if (di.x * dj.x + di.z * dj.z > -0.5) continue;
                        if (
                            pointSegmentDistanceSq(
                                px,
                                pz,
                                points[j].x,
                                points[j].z,
                                points[j + 1].x,
                                points[j + 1].z
                            ) <=
                            minDist * minDist
                        ) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}

/**
 * Décale la polyligne vers la droite du sens de marche. Sur un aller-retour,
 * l'aller et le retour se retrouvent de part et d'autre ; au demi-tour l'offset
 * s'annule (les deux voies se rejoignent).
 */
export function offsetPolylineForSelfOverlap(
    points: THREE.Vector3[],
    offset: number
): THREE.Vector3[] {
    if (offset <= 0 || points.length < 2) return points;
    const right = (ax: number, az: number, bx: number, bz: number) => {
        const dx = bx - ax;
        const dz = bz - az;
        const len = Math.hypot(dx, dz);
        return len < 1e-6 ? { x: 0, z: 0 } : { x: dz / len, z: -dx / len };
    };
    const out: THREE.Vector3[] = [];
    const last = points.length - 1;
    for (let i = 0; i <= last; i++) {
        let rx = 0;
        let rz = 0;
        if (i > 0) {
            const r = right(
                points[i - 1].x,
                points[i - 1].z,
                points[i].x,
                points[i].z
            );
            rx += r.x;
            rz += r.z;
        }
        if (i < last) {
            const r = right(
                points[i].x,
                points[i].z,
                points[i + 1].x,
                points[i + 1].z
            );
            rx += r.x;
            rz += r.z;
        }
        const len = Math.hypot(rx, rz);
        const dx = len > 1e-6 ? rx / len : 0;
        const dz = len > 1e-6 ? rz / len : 0;
        out.push(
            new THREE.Vector3(
                points[i].x + dx * offset,
                points[i].y,
                points[i].z + dz * offset
            )
        );
    }
    return out;
}

export interface ChevronOptions {
    /** Demi-longueur du chevron (unités monde). */
    size: number;
    /** Espacement le long de la trace (unités monde). */
    spacing: number;
    /** Hauteur de pose au-dessus des points. */
    lift: number;
    /** Distance avant le premier chevron. Par défaut : un espacement complet. */
    startOffset?: number;
}

function pushChevron(
    arr: number[],
    px: number,
    py: number,
    pz: number,
    tx: number,
    tz: number,
    rx: number,
    rz: number,
    size: number
): void {
    const tipX = px + tx * size * 0.6;
    const tipZ = pz + tz * size * 0.6;
    const baseX = px - tx * size * 0.3;
    const baseZ = pz - tz * size * 0.3;
    const lx = baseX + rx * size * 0.45;
    const lz = baseZ + rz * size * 0.45;
    const rxp = baseX - rx * size * 0.45;
    const rzp = baseZ - rz * size * 0.45;
    arr.push(tipX, py, tipZ, lx, py, lz, rxp, py, rzp);
}

/**
 * Construit des chevrons de sens le long de la trace (positions brutes, 3
 * sommets par chevron). Renvoie deux jeux de sommets : `dark` (contour, plus
 * large, légèrement en dessous) et `light` (cœur clair), pour un rendu bordé.
 */
export function buildDirectionChevrons(
    points: THREE.Vector3[],
    options: ChevronOptions
): { light: number[]; dark: number[] } {
    const light: number[] = [];
    const dark: number[] = [];
    const n = points.length;
    if (n < 2 || options.size <= 0 || options.spacing <= 0) {
        return { light, dark };
    }
    const spacing = options.spacing;
    const darkLift = options.lift - options.size * 0.08;

    let acc = 0;
    let next = Math.max(0, options.startOffset ?? spacing);
    for (let i = 0; i < n - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        const tx = dx / len;
        const tz = dz / len;
        const rx = tz;
        const rz = -tx;
        while (next <= acc + len) {
            const t = (next - acc) / len;
            const px = a.x + dx * t;
            const pz = a.z + dz * t;
            const py = a.y + options.lift;
            pushChevron(light, px, py, pz, tx, tz, rx, rz, options.size);
            pushChevron(
                dark,
                px,
                a.y + darkLift,
                pz,
                tx,
                tz,
                rx,
                rz,
                options.size * 1.35
            );
            next += spacing;
        }
        acc += len;
    }
    return { light, dark };
}
