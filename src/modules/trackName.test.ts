import { describe, expect, it } from 'vitest';
import { normalizeTrackName, toGPXFilename } from './trackName';

describe('track names', () => {
    it('keeps accented names in NFC form for the library', () => {
        expect(normalizeTrackName('Randonne\u0301e à l’Étang')).toBe(
            'Randonnée à l’Étang'
        );
    });

    it('keeps accents and readable spaces in exported GPX filenames', () => {
        expect(toGPXFilename('Crêt de la Neige', 42)).toBe(
            'Crêt de la Neige-42.gpx'
        );
    });
});
