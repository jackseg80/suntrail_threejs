import { vi } from 'vitest';

// Mock de localStorage avant toute chose
const storage: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => storage[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    storage[key] = value.toString();
  }),
  removeItem: vi.fn((key: string) => {
    delete storage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(storage).forEach(key => delete storage[key]);
  }),
  key: vi.fn((index: number) => Object.keys(storage)[index] || null),
  length: 0,
};

// On définit la propriété length dynamiquement
Object.defineProperty(localStorageMock, 'length', {
  get: () => Object.keys(storage).length,
});

// Écrasement global
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  enumerable: true,
  configurable: true
});

// Mock additionnel pour les APIs Web non supportées par JSDOM
if (typeof window.URL.createObjectURL === 'undefined') {
  window.URL.createObjectURL = vi.fn();
}
