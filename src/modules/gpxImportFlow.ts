/**
 * gpxImportFlow.ts — Pipeline d'import GPX partagé (v5.91)
 *
 * Centralise l'orchestration utilisée par l'import manuel (TrackSheet) et par la
 * réception OS (partage / « Ouvrir avec »). La géométrie durable est archivée
 * avant toute conversion en route préparée ; aucun champ absent n'est fabriqué.
 */

import { gpxService } from './gpxService';
import { trackService } from './tracks/trackService';
import { preparedRouteService } from './preparedRoutes/preparedRouteService';
import { removeGPXLayer } from './gpxLayers';
import { setRoutePlanningMode } from './routeManager';
import type { PreparedRouteV1 } from './preparedRoutes/preparedRoute';
import type { StoredTrackV1 } from './tracks/storedTrack';

export type GpxDraftGuard = (incomingName: string) => Promise<boolean>;

let draftGuard: GpxDraftGuard | null = null;

/**
 * L'UI fournit le garde qui protège un brouillon modifié. Hors UI (démarrage à
 * froid), aucun brouillon en mémoire ne peut exister : l'absence de garde est
 * donc sûre.
 */
export function setGpxDraftGuard(guard: GpxDraftGuard | null): void {
    draftGuard = guard;
}

export interface GpxImportOutcome {
    /** `skipped` couvre le doublon et le fichier sans trace exploitable. */
    status: 'imported' | 'skipped';
    name?: string;
    track?: StoredTrackV1;
    route?: PreparedRouteV1;
    opened: boolean;
}

export interface GpxImportDeps {
    protectDraft?: GpxDraftGuard;
}

export async function importGpxTrack(
    xml: string,
    fileName: string,
    deps: GpxImportDeps = {}
): Promise<GpxImportOutcome> {
    const layer = await gpxService.handleGPXImport(xml, fileName);
    if (!layer) return { status: 'skipped', opened: false };

    // The full imported geometry is durable before any PreparedRoute is derived.
    const track = await trackService.archiveImport(layer);

    const guard = deps.protectDraft ?? draftGuard;
    const canOpen = guard ? await guard(layer.name) : true;
    const route = await preparedRouteService.importGPXLayer(layer);
    removeGPXLayer(layer.id);

    if (!canOpen) {
        return {
            status: 'imported',
            name: layer.name,
            track,
            route,
            opened: false,
        };
    }

    preparedRouteService.restoreSavedRoute(route);
    setRoutePlanningMode(true, { announceHint: false });
    return {
        status: 'imported',
        name: layer.name,
        track,
        route,
        opened: true,
    };
}
