import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initUI } from './ui';

// On charge le VRAI index.html
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

vi.mock('./scene', async () => {
    const actual = await vi.importActual('./scene') as any;
    return { ...actual, initScene: vi.fn().mockResolvedValue(undefined) };
});

// Mock robuste de MutationObserver
class MockMutationObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn().mockReturnValue([]);
}
(global as any).MutationObserver = MockMutationObserver;

describe('Initialization Integrity', () => {
    beforeEach(() => {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        document.body.innerHTML = bodyMatch ? bodyMatch[1] : '';
        
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(0),
            json: async () => ({})
        });

        // Mock simple de requestAnimationFrame
        (global as any).window.requestAnimationFrame = (cb: any) => cb();

        // Mock de getContext pour éviter les erreurs JSDOM
        HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(() => ({
            getExtension: vi.fn().mockReturnValue({}),
            getParameter: vi.fn().mockReturnValue('Mock GPU'),
            fillRect: vi.fn(),
            clearRect: vi.fn(),
            drawImage: vi.fn(),
        })) as any;
    });

    it('should initialize UI and find critical structural IDs', async () => {
        await initUI();

        // --- TESTS DE STRUCTURE CRITIQUES ---
        expect(document.getElementById('canvas-container'), 'Missing #canvas-container').not.toBeNull();
        expect(document.getElementById('top-status-bar'), 'Missing #top-status-bar').not.toBeNull();
        expect(document.getElementById('nav-bar'), 'Missing #nav-bar').not.toBeNull();
        expect(document.getElementById('layers-fab'), 'Missing #layers-fab').not.toBeNull();
        expect(document.getElementById('gps-main-btn'), 'Missing #gps-main-btn').not.toBeNull();

        // Vérifier l'hydratation des composants
        expect(document.querySelector('.nav-tab'), 'NavigationBar not hydrated').not.toBeNull();
        expect(document.querySelector('.top-status-bar-content'), 'TopStatusBar not hydrated').not.toBeNull();
        expect(document.getElementById('time-slider'), 'WidgetsComponent not hydrated').not.toBeNull();
    });

    it('should match the CSS expected hierarchy for main elements', () => {
        // Vérifier que #canvas-container est bien dans <main> (requis par le CSS)
        const main = document.querySelector('main');
        expect(main?.querySelector('#canvas-container')).not.toBeNull();

        // Vérifier que #top-status-bar est bien dans <header>
        const header = document.querySelector('header');
        expect(header?.querySelector('#top-status-bar')).not.toBeNull();
    });
});
