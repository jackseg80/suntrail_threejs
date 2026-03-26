
/**
 * SunTrail Event Bus (v5.5.0)
 * Découplage architectural pour briser les cycles terrain <-> scene
 */

type EventMap = {
    'flyTo': { worldX: number; worldZ: number; targetElevation: number };
    'terrainReady': void;
    'sheetOpened': { id: string };
    'sheetClosed': { id: string | null };
};

type Listener<T> = (payload: T) => void;
const listeners = new Map<string, Listener<any>[]>();

export const eventBus = {
    on<K extends keyof EventMap>(event: K, fn: Listener<EventMap[K]>) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event)!.push(fn);
    },
    emit<K extends keyof EventMap>(event: K, payload?: EventMap[K]) {
        listeners.get(event)?.forEach(fn => fn(payload));
    },
    off<K extends keyof EventMap>(event: K, fn: Listener<EventMap[K]>) {
        const arr = listeners.get(event);
        if (arr) listeners.set(event, arr.filter(f => f !== fn));
    }
};
