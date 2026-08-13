import { updateStorageUI } from './tileLoader';
import { appInit } from './appInit';

/**
 * Point d'entrée de l'UI (v6.0 - Orchestration Refactored)
 */
export async function initUI(): Promise<void> {
    // Lancer l'initialisation orchestrée
    await appInit();
    // Initial paint only. Cache/worker mutations already refresh this UI at source.
    updateStorageUI();
}

export function disposeUI(): void {}
