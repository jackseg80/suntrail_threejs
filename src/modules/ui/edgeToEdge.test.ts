import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve('src/style.css'), 'utf8');
const html = readFileSync(resolve('app.html'), 'utf8');
const mainActivity = readFileSync(
    resolve('android/app/src/main/java/com/suntrail/threejs/MainActivity.java'),
    'utf8'
);

describe('Android edge-to-edge contract', () => {
    it('lets Capacitor expose native WindowInsets to the web viewport', () => {
        expect(html).toContain('viewport-fit=cover');

        for (const edge of ['top', 'right', 'bottom', 'left']) {
            expect(styles).toContain(
                `env(safe-area-inset-${edge}, 0px),\n        var(--safe-area-inset-${edge}, 0px)`
            );
        }
    });

    it('keeps critical terrain controls inside every safe edge', () => {
        expect(styles).toContain('top: var(--safe-top);');
        expect(styles).toContain('padding-right: var(--safe-right);');
        expect(styles).toContain('padding-left: var(--safe-left);');
        expect(styles).toContain('bottom: calc(76px + var(--safe-bottom));');
        expect(styles).toContain('right: calc(16px + var(--safe-right));');
        expect(styles).toContain('left: calc(16px + var(--safe-left));');
    });

    it('preserves status-only immersive mode without an edge-to-edge opt-out', () => {
        expect(mainActivity).toContain(
            'controller.hide(WindowInsets.Type.statusBars())'
        );
        expect(mainActivity).not.toContain('enableEdgeToEdge');
        expect(mainActivity).not.toContain('setDecorFitsSystemWindows');
        expect(mainActivity).not.toContain('LAYOUT_IN_DISPLAY_CUTOUT_MODE');
    });
});
