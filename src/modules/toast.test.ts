import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showToast } from './toast';

describe('showToast()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('crée #toast-container si absent', () => {
        showToast('Hello');
        expect(document.getElementById('toast-container')).not.toBeNull();
    });

    it('réutilise le container existant', () => {
        showToast('A');
        showToast('B');
        expect(document.querySelectorAll('#toast-container').length).toBe(1);
    });

    it('affiche le message correct', () => {
        showToast('Mon message');
        expect(document.querySelector('.toast')?.textContent).toBe(
            'Mon message'
        );
    });

    it('supprime le toast après la durée par défaut (3000ms)', () => {
        showToast('Ephémère');
        expect(document.querySelectorAll('.toast').length).toBe(1);
        vi.advanceTimersByTime(3300);
        expect(document.querySelectorAll('.toast').length).toBe(0);
    });

    it('supprime le toast après une durée custom', () => {
        showToast('Court', 1000);
        vi.advanceTimersByTime(1300);
        expect(document.querySelectorAll('.toast').length).toBe(0);
    });

    it('supporte plusieurs toasts simultanés', () => {
        showToast('A');
        showToast('B');
        showToast('C');
        expect(document.querySelectorAll('.toast').length).toBe(3);
    });

    it('supprime les toasts indépendamment', () => {
        showToast('Court', 500);
        showToast('Long', 5000);
        vi.advanceTimersByTime(800);
        const remaining = document.querySelectorAll('.toast');
        expect(remaining.length).toBe(1);
        expect(remaining[0].textContent).toBe('Long');
    });
});
