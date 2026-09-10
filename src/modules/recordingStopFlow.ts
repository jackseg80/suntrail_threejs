import { i18n } from '../i18n/I18nService';
import type { LocationPoint } from './geo';
import type { RecordingSummary } from './outing/outingDashboard';
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
    overlay.innerHTML = `<div class="recording-finalization-panel" role="dialog" aria-modal="true">${innerHTML}</div>`;
    document.body.appendChild(overlay);
    return overlay;
}

function formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function buildTracePreview(points: LocationPoint[]): string {
    if (points.length < 2) return '';
    let minLon = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    for (const point of points) {
        minLon = Math.min(minLon, point.lon);
        maxLon = Math.max(maxLon, point.lon);
        minLat = Math.min(minLat, point.lat);
        maxLat = Math.max(maxLat, point.lat);
    }
    const lonRange = Math.max(maxLon - minLon, 0.000001);
    const latRange = Math.max(maxLat - minLat, 0.000001);
    const step = Math.max(1, Math.ceil(points.length / 240));
    const previewPoints = points.filter(
        (_point, index) => index % step === 0 || index === points.length - 1
    );
    const coordinates = previewPoints
        .map((point) => {
            const x = 10 + ((point.lon - minLon) / lonRange) * 220;
            const y = 90 - ((point.lat - minLat) / latRange) * 80;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
    const first = coordinates.split(' ')[0];
    const last = coordinates.split(' ').at(-1);
    return `<svg class="recording-finalization-map" viewBox="0 0 240 100" role="img" aria-label="${escapeText(i18n.t('track.save.tracePreview'))}">
        <polyline points="${coordinates}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${first?.split(',')[0]}" cy="${first?.split(',')[1]}" r="5" class="recording-finalization-start" />
        <circle cx="${last?.split(',')[0]}" cy="${last?.split(',')[1]}" r="5" class="recording-finalization-end" />
    </svg>`;
}

export function promptRecordingName(
    suggestedName: string,
    points: LocationPoint[] = [],
    summary?: RecordingSummary
): Promise<string | null> {
    return new Promise((resolve) => {
        const pace = summary?.averagePaceSecondsPerKm;
        const overlay = createOverlay(`
            <div class="recording-finalization-title">${escapeText(i18n.t('track.save.title'))}</div>
            <div class="recording-finalization-body">${escapeText(i18n.t('track.save.reviewBody'))}</div>
            ${buildTracePreview(points)}
            ${
                summary
                    ? `<div class="recording-finalization-stats">
                        <div><span>${escapeText(i18n.t('track.save.distance'))}</span><strong>${summary.distanceKm.toFixed(2)} km</strong></div>
                        <div><span>${escapeText(i18n.t('track.save.duration'))}</span><strong>${formatDuration(summary.durationSeconds)}</strong></div>
                        <div><span>${escapeText(i18n.t('track.save.ascent'))}</span><strong>+${Math.round(summary.ascentMeters)} m</strong></div>
                        <div><span>${escapeText(i18n.t('track.save.descent'))}</span><strong>−${Math.round(summary.descentMeters)} m</strong></div>
                        <div><span>${escapeText(i18n.t('track.save.pace'))}</span><strong>${pace ? `${Math.floor(pace / 60)}:${String(Math.round(pace) % 60).padStart(2, '0')} /km` : '—'}</strong></div>
                        <div><span>${escapeText(i18n.t('track.save.points'))}</span><strong>${summary.pointCount}</strong></div>
                    </div>`
                    : ''
            }
            <label class="recording-finalization-label" for="rec-save-name">${escapeText(i18n.t('track.save.body'))}</label>
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
            if (event.key === 'Escape') input?.focus();
        };
        overlay
            .querySelector('[data-recording-save]')
            ?.addEventListener('click', confirm);
        overlay
            .querySelector('[data-recording-discard]')
            ?.addEventListener('click', () => dismiss(null));
        input?.addEventListener('keydown', onKeyDown);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) input?.focus();
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
                resolveName: async (suggestedName, points, summary) => {
                    progress?.remove();
                    return promptRecordingName(suggestedName, points, summary);
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
