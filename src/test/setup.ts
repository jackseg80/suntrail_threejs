import { vi, afterEach } from 'vitest';

// Mock de localStorage sans écraser l'objet window
const storage = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) || null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value.toString())),
  removeItem: vi.fn((key: string) => storage.delete(key)),
  clear: vi.fn(() => storage.clear()),
  key: vi.fn((i: number) => Array.from(storage.keys())[i] || null),
  get length() { return storage.size; }
};

// Utilisation de vi.stubGlobal qui est géré proprement par Vitest
vi.stubGlobal('localStorage', localStorageMock);

// Polyfill pour les APIs manquantes dans JSDOM
if (typeof window.URL.createObjectURL === 'undefined') {
  window.URL.createObjectURL = vi.fn();
}

// Nettoyage global après chaque test pour éviter les fuites asynchrones
afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
  // On ne peut pas appeler useRealTimers ici car certains tests n'utilisent pas fakeTimers
});
