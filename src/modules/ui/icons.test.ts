import { describe, it, expect } from 'vitest';
import {
    ICON_CLOSE,
    ICON_PLAY,
    ICON_PAUSE,
    ICON_STOP,
    ICON_RECORD,
    ICON_CHECK,
    ICON_LOCK,
    ICON_UNLOCK,
    ICON_INFO,
} from './icons';

function parseSvg(
    svg: string
): { width: number; height: number; viewBox: string } | null {
    const match = svg.match(
        /<svg width="(\d+)" height="(\d+)" viewBox="([^"]+)"/
    );
    if (!match) return null;
    return {
        width: parseInt(match[1]),
        height: parseInt(match[2]),
        viewBox: match[3],
    };
}

const allIcons = [
    ICON_CLOSE,
    ICON_PLAY,
    ICON_PAUSE,
    ICON_STOP,
    ICON_RECORD,
    ICON_CHECK,
    ICON_LOCK,
    ICON_UNLOCK,
    ICON_INFO,
];
const iconNames = [
    'ICON_CLOSE',
    'ICON_PLAY',
    'ICON_PAUSE',
    'ICON_STOP',
    'ICON_RECORD',
    'ICON_CHECK',
    'ICON_LOCK',
    'ICON_UNLOCK',
    'ICON_INFO',
];

describe('icons.ts — SVG constants', () => {
    it('devrait exporter 9 icônes distinctes', () => {
        const unique = new Set(allIcons);
        expect(unique.size).toBe(9);
    });

    it('chaque icône est une chaîne SVG valide (ouvrante et fermante)', () => {
        allIcons.forEach((icon, i) => {
            expect(
                icon.startsWith('<svg'),
                `${iconNames[i]} devrait commencer par <svg`
            ).toBe(true);
            expect(
                icon.endsWith('</svg>'),
                `${iconNames[i]} devrait finir par </svg>`
            ).toBe(true);
        });
    });

    it('chaque icône a un viewBox 0 0 24 24 (taille standard)', () => {
        allIcons.forEach((icon, i) => {
            const parsed = parseSvg(icon);
            expect(
                parsed,
                `${iconNames[i]} devrait avoir un viewBox`
            ).not.toBeNull();
            expect(parsed!.viewBox, `${iconNames[i]} viewBox`).toBe(
                '0 0 24 24'
            );
        });
    });

    it('chaque icône utilise stroke="currentColor" ou fill="var(--danger)"', () => {
        allIcons.forEach((icon, i) => {
            const hasStroke = icon.includes('stroke="currentColor"');
            const hasDangerFill = icon.includes('fill="var(--danger)"');
            expect(
                hasStroke || hasDangerFill,
                `${iconNames[i]} devrait utiliser une couleur dynamique`
            ).toBe(true);
        });
    });

    it('ICON_CLOSE contient 2 lignes croisées', () => {
        const lines = ICON_CLOSE.match(/<line/g);
        expect(lines).toHaveLength(2);
    });

    it('ICON_PLAY et ICON_PAUSE sont différentes', () => {
        expect(ICON_PLAY).not.toBe(ICON_PAUSE);
    });

    it('ICON_STOP et ICON_RECORD sont différentes', () => {
        expect(ICON_STOP).not.toBe(ICON_RECORD);
    });

    it('ICON_LOCK et ICON_UNLOCK sont différentes', () => {
        expect(ICON_LOCK).not.toBe(ICON_UNLOCK);
    });

    it('ICON_RECORD est un cercle plein rouge (fill var(--danger))', () => {
        expect(ICON_RECORD).toContain('fill="var(--danger)"');
        expect(ICON_RECORD).toContain('<circle');
    });
});
