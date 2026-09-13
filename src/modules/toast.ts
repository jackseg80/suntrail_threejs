/**
 * toast.ts — Système de notifications temporaires (Toast)
 */

export function showToast(
    message: string,
    duration: number = 3000,
    replaceKey?: string
) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'false');
        document.body.appendChild(container);
    }

    if (replaceKey) {
        Array.from(container.children)
            .find(
                (candidate) =>
                    (candidate as HTMLElement).dataset.toastKey === replaceKey
            )
            ?.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    if (replaceKey) toast.dataset.toastKey = replaceKey;

    container.appendChild(toast);
    void toast.offsetHeight;
    toast.classList.add('is-visible');

    setTimeout(() => {
        toast.classList.remove('is-visible');
        toast.classList.add('is-exiting');
        setTimeout(() => {
            toast.remove();
            if (!container?.childElementCount) container?.remove();
        }, 180);
    }, duration);
}
