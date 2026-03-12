import { vi, afterEach } from 'vitest';

// Mock de localStorage robuste
const storage = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, value.toString()),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  key: (i: number) => Array.from(storage.keys())[i] || null,
  get length() { return storage.size; }
};

// On écrase localStorage sur window proprement
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  enumerable: true,
  writable: true
});

// Polyfills pour APIs manquantes dans JSDOM
if (typeof window.URL.createObjectURL === 'undefined') {
  window.URL.createObjectURL = vi.fn();
}

// Nettoyage global après chaque test
afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
});
