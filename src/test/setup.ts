import { vi, afterEach } from 'vitest';

// --- MOCK LOCALSTORAGE ---
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) || null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value.toString())),
  removeItem: vi.fn((key: string) => storage.delete(key)),
  clear: vi.fn(() => storage.clear()),
  key: vi.fn((i: number) => Array.from(storage.keys())[i] || null),
  get length() { return storage.size; }
};

vi.stubGlobal('localStorage', localStorageMock);

// --- PATCH TEARDOWN (Fix JSDOM/HappyDOM EventTarget Error) ---
const originalRemove = window.removeEventListener;
window.removeEventListener = function(type: string, listener: any, options?: any) {
  try {
    originalRemove.call(this as any, type as any, listener, options);
  } catch (e) {
    // On ignore silencieusement les erreurs de suppression durant le Teardown
  }
};

// --- POLYFILLS ---
if (typeof window.URL.createObjectURL === 'undefined') {
  window.URL.createObjectURL = vi.fn();
}

// --- CLEANUP ---
afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
});
