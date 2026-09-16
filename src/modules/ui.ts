import { appInit } from './appInit';

/**
 * Point d'entrée de l'UI (v6.0 - Orchestration Refactored)
 */
export async function initUI(): Promise<void> {
    // Lancer l'initialisation orchestrée
    await appInit();
}

export function disposeUI(): void {}
