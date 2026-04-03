/**
 * draggablePanel.ts — Helper réutilisable pour rendre un panel fixe repositionnable.
 *
 * Comportement :
 *   - Swipe vers le bas (rapide) = dismiss (comportement existant conservé)
 *   - Maintenir 300ms sur le drag handle = mode repositionnement libre (X+Y)
 *   - Double-tap sur le handle = reset position d'origine
 *
 * Utilisé par TimelineComponent et le profil d'élévation.
 */

const HOLD_MS = 300;            // Délai avant activation du repositionnement
const DISMISS_THRESHOLD = 60;   // px vers le bas pour dismiss
const DISMISS_VELOCITY = 0.3;   // px/ms

export interface DraggablePanelOptions {
    /** L'élément panel à repositionner */
    panel: HTMLElement;
    /** Le drag handle (élément dans le panel) */
    handle: HTMLElement;
    /** Callback de dismiss (fermeture du panel) */
    onDismiss: () => void;
    /** Classe CSS ajoutée quand le panel est en position custom */
    customPosClass?: string;
}

export function attachDraggablePanel(opts: DraggablePanelOptions): () => void {
    const { panel, handle, onDismiss, customPosClass = 'panel-custom-pos' } = opts;

    // ── État ────────────────────────────────────────────────────────────
    let isActive = false;           // true uniquement entre pointerdown et pointerup
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isDismissing = false;
    let isRepositioning = false;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTapTime = 0;
    let panelStartLeft = 0;
    let panelStartTop = 0;
    let isCustomPos = false;

    function clearHold(): void {
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    }

    // ── Pointer Down ────────────────────────────────────────────────────
    let _activePointerId = -1;

    const onStart = (e: PointerEvent): void => {
        // NE PAS capturer le pointer ici — ça bloquerait les clics sur les boutons enfants.
        // La capture se fait uniquement quand un drag/dismiss commence réellement.
        _activePointerId = e.pointerId;
        isActive = true;
        isDismissing = false;
        isRepositioning = false;
        startX = e.clientX;
        startY = e.clientY;
        startTime = Date.now();

        // Double-tap → reset position
        const now = Date.now();
        if (now - lastTapTime < 300 && isCustomPos) {
            lastTapTime = 0;
            isActive = false;
            resetPosition();
            return;
        }
        lastTapTime = now;

        // Capturer la position de départ du panel
        const rect = panel.getBoundingClientRect();
        panelStartLeft = rect.left;
        panelStartTop = rect.top;

        // Hold timer pour passer en mode repositionnement
        holdTimer = setTimeout(() => {
            holdTimer = null;
            if (!isActive) return;
            // Capturer le pointer MAINTENANT (drag confirmé)
            try { handle.setPointerCapture(_activePointerId); } catch { /* déjà relâché */ }
            isRepositioning = true;
            panel.style.transition = 'none';
            handle.style.cursor = 'grabbing';
        }, HOLD_MS);
    };

    // ── Pointer Move ────────────────────────────────────────────────────
    const onMove = (e: PointerEvent): void => {
        if (!isActive) return;      // ← Guard critique : ignore les pointermove sans pointerdown

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (isRepositioning) {
            // Mode repositionnement libre
            let newLeft = panelStartLeft + dx;
            let newTop = panelStartTop + dy;

            const w = panel.offsetWidth;
            newLeft = Math.max(-w + 40, Math.min(window.innerWidth - 40, newLeft));
            // Empêcher le panel de passer sous la nav bar (bas) ou la top bar (haut)
            const navBar = document.getElementById('nav-bar');
            const navH = navBar ? navBar.offsetHeight : 72;
            const topBar = document.getElementById('top-status-bar');
            const topH = topBar ? topBar.offsetHeight : 52;
            newTop = Math.max(topH + 8, Math.min(window.innerHeight - navH - 40, newTop));

            panel.style.left = `${newLeft}px`;
            panel.style.top = `${newTop}px`;
            panel.style.bottom = 'auto';
            panel.style.transform = 'none';
            if (!isCustomPos) {
                isCustomPos = true;
                panel.classList.add(customPosClass);
            }
            return;
        }

        // Pas encore en repositionnement — vérifier si c'est un swipe vers le bas (dismiss)
        if (!isDismissing && dy > 10 && Math.abs(dy) > Math.abs(dx) * 2) {
            clearHold();
            // Capturer le pointer MAINTENANT (dismiss confirmé)
            try { handle.setPointerCapture(_activePointerId); } catch { /* déjà relâché */ }
            isDismissing = true;
            panel.style.transition = 'none';
        }

        if (isDismissing && dy > 0) {
            if (isCustomPos) {
                panel.style.top = `${panelStartTop + dy * 0.6}px`;
            } else {
                panel.style.transform = `translate(-50%, ${dy * 0.6}px)`;
            }
            return;
        }

        // Si mouvement > 20px avant le hold timer, annuler le hold (c'est un geste carte)
        if (holdTimer && (Math.abs(dx) > 20 || Math.abs(dy) > 20)) {
            clearHold();
        }
    };

    // ── Pointer Up / Cancel ─────────────────────────────────────────────
    const onEnd = (e: PointerEvent): void => {
        if (!isActive) return;      // ← Ignore si pas de pointerdown actif (ou double-tap reset)
        isActive = false;
        clearHold();
        handle.style.cursor = '';

        if (isRepositioning) {
            isRepositioning = false;
            panel.style.transition = '';
            return;
        }

        if (isDismissing) {
            isDismissing = false;
            const dy = e.clientY - startY;
            const duration = Date.now() - startTime;
            const velocity = duration > 0 ? dy / duration : 0;

            panel.style.transition = '';

            if (dy > DISMISS_THRESHOLD || velocity > DISMISS_VELOCITY) {
                if (isCustomPos) resetPosition();
                onDismiss();
            } else {
                // Snap back
                if (isCustomPos) {
                    panel.style.top = `${panelStartTop}px`;
                } else {
                    panel.style.transform = '';
                }
            }
            return;
        }

        // Simple tap — rien à faire
    };

    // ── Reset position ──────────────────────────────────────────────────
    function resetPosition(): void {
        panel.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        panel.style.left = '';
        panel.style.top = '';
        panel.style.bottom = '';
        panel.style.transform = '';
        isCustomPos = false;
        panel.classList.remove(customPosClass);
        setTimeout(() => { panel.style.transition = ''; }, 350);
    }

    // ── Bindingdes listeners ────────────────────────────────────────────
    handle.addEventListener('pointerdown', onStart);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);

    return () => {
        handle.removeEventListener('pointerdown', onStart);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onEnd);
        handle.removeEventListener('pointercancel', onEnd);
    };
}
