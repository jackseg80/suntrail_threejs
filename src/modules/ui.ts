import { updateStorageUI } from './tileLoader';
import { appInit } from './appInit';

// Référence de l'intervalle updateStorageUI (W5)
let storageUIIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Point d'entrée de l'UI (v6.0 - Orchestration Refactored)
 */
export async function initUI(): Promise<void> {
    // Lancer l'initialisation orchestrée
    await appInit();

    // Démarrer les intervals résiduels
    storageUIIntervalId = setInterval(updateStorageUI, 2000);
}

export function disposeUI(): void {
    if (storageUIIntervalId !== null) {
        clearInterval(storageUIIntervalId);
        storageUIIntervalId = null;
    }
}
