import { i18n } from '../i18n/I18nService';
import { state } from './state';
import { recordingService } from './recordingService';

let activeStop: Promise<string> | null = null;

function escapeText(value: string): string {
    return value.replace(
        /[&<>'"]/g,
        (char) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;',
            })[char] ?? char
    );
}

function createOverlay(innerHTML: string): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'recording-finalization-overlay';
    overlay.innerHTML = `<div class="recording-finalization-panel">${innerHTML}</div>`;
    document.body.appendChild(overlay);
    return overlay;
}

export function promptRecordingName(
    suggestedName: string
): Promise<string | null> {
    return new Promise((resolve) => {
        const overlay = createOverlay(`
            <div class="recording-finalization-title">${escapeText(i18n.t('track.save.title'))}</div>
            <div class="recording-finalization-body">${escapeText(i18n.t('track.save.body'))}</div>
            <input id="rec-save-name" class="recording-finalization-input" type="text" value="${escapeText(suggestedName)}" aria-label="${escapeText(i18n.t('track.save.title'))}">
            <div class="recording-finalization-actions">
                <button id="rec-save-confirm" type="button" data-recording-save>${escapeText(i18n.t('common.save'))}</button>
                <button id="rec-save-discard" type="button" data-recording-discard>${escapeText(i18n.t('track.save.discard'))}</button>
            </div>
        `);
        const input = overlay.querySelector<HTMLInputElement>('input');
        const dismiss = (value: string | null) => {
            overlay.remove();
            document.removeEventListener('keydown', onKeyDown);
            resolve(value);
        };
        const confirm = () => dismiss(input?.value.trim() || suggestedName);
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Enter') confirm();
            if (event.key === 'Escape') dismiss(null);
        };
        overlay
            .querySelector('[data-recording-save]')
            ?.addEventListener('click', confirm);
        overlay
            .querySelector('[data-recording-discard]')
            ?.addEventListener('click', () => dismiss(null));
        input?.addEventListener('keydown', onKeyDown);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) dismiss(null);
        });
        document.addEventListener('keydown', onKeyDown);
        input?.focus();
        input?.select();
    });
}

/**
 * Single finalization entry point for Sortie, Guidance and Android notification.
 * Native tracking stops first; reverse geocoding and naming happen afterwards.
 */
export function stopRecordingWithFeedback(options?: {
    nativeAlreadyStopped?: boolean;
}): Promise<string> {
    if (activeStop) return activeStop;

    activeStop = (async () => {
        const needsName = state.recordedPoints.length >= 2;
        const progress = needsName
            ? createOverlay(`
                <div class="recording-finalization-spinner" aria-hidden="true"></div>
                <div class="recording-finalization-title">${escapeText(i18n.t('track.save.processing'))}</div>
                <div class="recording-finalization-body">${escapeText(i18n.t('track.save.processingBody'))}</div>
            `)
            : null;
        try {
            return await recordingService.stopRecording(undefined, {
                nativeAlreadyStopped: options?.nativeAlreadyStopped,
                resolveName: async (suggestedName) => {
                    progress?.remove();
                    return promptRecordingName(suggestedName);
                },
            });
        } finally {
            progress?.remove();
        }
    })().finally(() => {
        activeStop = null;
    });

    return activeStop;
}
