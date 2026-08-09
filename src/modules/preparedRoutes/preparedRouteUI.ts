import { i18n } from '../../i18n/I18nService';
import { eventBus } from '../eventBus';
import { searchLocations, type GeocodingResult } from '../geocodingService';
import {
    redoRouteEdit,
    scheduleAutoCompute,
    undoRouteEdit,
} from '../routeManager';
import { addRouteWaypoint } from '../routingService';
import { releaseFlags } from '../releaseFlags';
import { state } from '../state';
import { showToast } from '../toast';
import {
    computeEffort,
    computeLightSummary,
    computePlannedDurationMinutes,
} from './preparedRoute';
import { preparedRouteService } from './preparedRouteService';
import { mutateRouteWaypoints } from './routeDraftHistory';

let initialized = false;
const unsubscribers: Array<() => void> = [];
const searchTimers = new Map<string, ReturnType<typeof setTimeout>>();
const searchControllers = new Map<string, AbortController>();

function element<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function escapeHTML(value: string): string {
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

function toLocalDateTime(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0
        ? `${hours}h${String(mins).padStart(2, '0')}`
        : `${mins} min`;
}

function formatTime(iso: string | null): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(iso));
}

function formatWaypointLabel(
    waypoint: (typeof state.routeWaypoints)[number] | undefined
): string {
    if (!waypoint) return '';
    return (
        waypoint.name ||
        `${waypoint.lat.toFixed(5)}, ${waypoint.lon.toFixed(5)}`
    );
}

function markMetadataDirty(): void {
    state.routeDraftDirty = true;
    renderPreparedRouteEditor();
}

function bindMetadataInput(
    id: string,
    apply: (input: HTMLInputElement | HTMLTextAreaElement) => void
): void {
    const input = element<HTMLInputElement | HTMLTextAreaElement>(id);
    input?.addEventListener('input', () => {
        apply(input);
        markMetadataDirty();
    });
}

function renderSearchResults(
    target: 'start' | 'end',
    results: GeocodingResult[]
): void {
    const container = element<HTMLDivElement>(`rs-${target}-results`);
    if (!container) return;
    container.innerHTML = results
        .slice(0, 5)
        .map(
            (result, index) =>
                `<button type="button" role="option" data-result-index="${index}">${escapeHTML(result.label)}</button>`
        )
        .join('');
    container.hidden = results.length === 0;
    container
        .querySelectorAll<HTMLButtonElement>('[data-result-index]')
        .forEach((button) => {
            button.addEventListener('click', (event) => {
                // The button is removed below; stop propagation first so the
                // outside-click handler keeps the editor open.
                event.stopPropagation();
                const index = Number(button.dataset.resultIndex);
                const result = results[index];
                if (!result) return;
                selectSearchResult(target, result);
                container.innerHTML = '';
                container.hidden = true;
                const input = element<HTMLInputElement>(`rs-${target}-search`);
                if (input) input.value = result.label;
            });
        });
}

function selectSearchResult(
    target: 'start' | 'end',
    result: GeocodingResult
): void {
    const waypoint = {
        lat: result.lat,
        lon: result.lon,
        alt: result.ele,
        name: result.name || result.label.split(',')[0],
    };
    const waypoints = [...state.routeWaypoints];
    if (target === 'start') {
        if (waypoints.length === 0) addRouteWaypoint(waypoint);
        else {
            waypoints[0] = waypoint;
            mutateRouteWaypoints(waypoints);
        }
    } else if (waypoints.length === 0) {
        showToast(
            i18n.t('preparedRoutes.editor.chooseStartFirst') ||
                'Choisissez d’abord le départ A.'
        );
        return;
    } else if (waypoints.length === 1) {
        addRouteWaypoint(waypoint);
    } else {
        waypoints[waypoints.length - 1] = waypoint;
        mutateRouteWaypoints(waypoints);
    }
    scheduleAutoCompute();
}

function bindSearch(target: 'start' | 'end'): void {
    const input = element<HTMLInputElement>(`rs-${target}-search`);
    input?.addEventListener('input', () => {
        const previous = searchTimers.get(target);
        if (previous) clearTimeout(previous);
        searchControllers.get(target)?.abort();
        const query = input.value.trim();
        if (query.length < 2) {
            renderSearchResults(target, []);
            return;
        }
        const timer = setTimeout(async () => {
            const controller = new AbortController();
            searchControllers.set(target, controller);
            try {
                const results = await searchLocations(
                    query,
                    controller.signal,
                    {
                        lat: state.TARGET_LAT,
                        lon: state.TARGET_LON,
                    }
                );
                renderSearchResults(target, results);
            } catch (error) {
                if ((error as Error).name !== 'AbortError') {
                    renderSearchResults(target, []);
                }
            }
        }, 350);
        searchTimers.set(target, timer);
    });
}

export function renderPreparedRouteEditor(): void {
    const enabled = releaseFlags.isEnabled('preparedRoutes');
    document.body.dataset.preparedRoutes = enabled ? 'enabled' : 'disabled';

    const nameInput = element<HTMLInputElement>('rs-route-name');
    if (nameInput && document.activeElement !== nameInput) {
        nameInput.value = state.routeDraftName;
    }
    const startSearch = element<HTMLInputElement>('rs-start-search');
    if (startSearch && document.activeElement !== startSearch) {
        startSearch.value = formatWaypointLabel(state.routeWaypoints[0]);
    }
    const endSearch = element<HTMLInputElement>('rs-end-search');
    if (endSearch && document.activeElement !== endSearch) {
        endSearch.value = formatWaypointLabel(
            state.routeWaypoints[state.routeWaypoints.length - 1]
        );
    }
    const profileSelect = element<HTMLSelectElement>('rs-profile');
    if (profileSelect) profileSelect.value = state.activeRouteProfile;
    const loopCheckbox = element<HTMLInputElement>('rs-loop');
    if (loopCheckbox) loopCheckbox.checked = state.routeLoopEnabled;
    const startInput = element<HTMLInputElement>('rs-planned-start');
    if (startInput && document.activeElement !== startInput) {
        startInput.value = toLocalDateTime(state.routePlannedStartAt);
    }
    const paceInput = element<HTMLInputElement>('rs-pace');
    if (paceInput && document.activeElement !== paceInput) {
        paceInput.value = String(state.routePlannedPaceKmh);
    }
    const notesInput = element<HTMLTextAreaElement>('rs-route-notes');
    if (notesInput && document.activeElement !== notesInput) {
        notesInput.value = state.routeDraftNotes;
    }
    const tagsInput = element<HTMLInputElement>('rs-route-tags');
    if (tagsInput && document.activeElement !== tagsInput) {
        tagsInput.value = state.routeDraftTags.join(', ');
    }
    const favorite = element<HTMLButtonElement>('rs-favorite-btn');
    if (favorite) {
        favorite.textContent = state.routeDraftFavorite ? '★' : '☆';
        favorite.setAttribute('aria-pressed', String(state.routeDraftFavorite));
        favorite.setAttribute(
            'aria-label',
            i18n.t('preparedRoutes.actions.favorite') || 'Favori'
        );
    }

    const canSave =
        enabled && !!state.routeComputation && state.routeWaypoints.length >= 2;
    const settingsSave = element<HTMLButtonElement>('rs-save-btn');
    const barSave = element<HTMLButtonElement>('rb-save-btn');
    if (settingsSave) settingsSave.disabled = !canSave;
    if (barSave) barSave.disabled = !canSave;

    const status = element<HTMLDivElement>('rs-draft-status');
    if (status) {
        status.textContent = !enabled
            ? i18n.t('preparedRoutes.status.disabled')
            : state.routeDraftDirty
              ? i18n.t('preparedRoutes.status.unsaved')
              : state.routeLastSavedAt
                ? i18n.t('preparedRoutes.status.saved')
                : i18n.t('preparedRoutes.status.new');
        status.dataset.state = state.routeDraftDirty ? 'dirty' : 'saved';
    }

    const summary = element<HTMLDivElement>('rs-route-summary');
    if (!summary) return;
    const computation = state.routeComputation;
    if (!computation) {
        summary.innerHTML = `<p>${escapeHTML(
            state.routeLoading
                ? i18n.t('preparedRoutes.summary.computing')
                : state.routeError
                  ? i18n.t('preparedRoutes.summary.routingError')
                  : state.IS_OFFLINE
                    ? i18n.t('preparedRoutes.summary.offlineDraft')
                    : i18n.t('preparedRoutes.summary.addPoints')
        )}</p>`;
        return;
    }
    const duration = computePlannedDurationMinutes(
        computation.distance,
        computation.ascent,
        state.routePlannedPaceKmh
    );
    const effort = computeEffort(
        computation.distance,
        computation.ascent,
        duration
    );
    const light = computeLightSummary(
        computation.geometry,
        state.routePlannedStartAt,
        duration
    );
    const difficulty = computation.technicalDifficulty;
    const difficultyText = difficulty.sacLevel
        ? `${difficulty.status === 'partial' ? '≈ ' : ''}T${difficulty.sacLevel}`
        : i18n.t('preparedRoutes.difficulty.unknown');
    const difficultyLabel =
        difficulty.status === 'unknown'
            ? i18n.t('preparedRoutes.summary.difficulty')
            : `${i18n.t('preparedRoutes.summary.difficulty')} · ${difficulty.coveragePercent}%`;
    const marginText =
        light.daylightMarginMinutes === null
            ? i18n.t('preparedRoutes.light.chooseStart')
            : light.daylightMarginMinutes >= 0
              ? `+${light.daylightMarginMinutes} min`
              : `${light.daylightMarginMinutes} min`;

    summary.innerHTML = `
        <div class="rs-summary-grid">
            <span><b>${computation.distance.toFixed(1)} km</b><small>${i18n.t('preparedRoutes.summary.distance')}</small></span>
            <span><b>${formatDuration(duration)}</b><small>${i18n.t('preparedRoutes.summary.duration')}</small></span>
            <span><b>${difficultyText}</b><small>${difficultyLabel}</small></span>
            <span><b>${i18n.t(`preparedRoutes.effort.${effort.level}`)}</b><small>${i18n.t('preparedRoutes.summary.effort')}</small></span>
            <span><b>${formatTime(light.etaAt)}</b><small>ETA</small></span>
            <span><b>${marginText}</b><small>${i18n.t('preparedRoutes.summary.daylightMargin')}</small></span>
        </div>
        <p class="rs-summary-explanation">${escapeHTML(
            difficulty.status === 'unknown'
                ? i18n.t(
                      `preparedRoutes.difficulty.reason.${difficulty.reason}`
                  )
                : i18n.t('preparedRoutes.difficulty.coverageExplanation')
        )}</p>
        <p class="rs-summary-method">${escapeHTML(
            i18n.t('preparedRoutes.effort.method')
        )}</p>`;
}

async function saveDraft(button: HTMLButtonElement | null): Promise<void> {
    if (!button || button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
        await preparedRouteService.saveCurrentDraft();
        showToast(i18n.t('preparedRoutes.toast.saved'));
        renderPreparedRouteEditor();
    } catch (error) {
        const message =
            error instanceof Error &&
            error.message.startsWith('preparedRoutes.')
                ? i18n.t(error.message)
                : i18n.t('preparedRoutes.error.storage');
        showToast(message);
    } finally {
        button.removeAttribute('aria-busy');
        renderPreparedRouteEditor();
    }
}

export function initPreparedRouteUI(): void {
    if (initialized) return;
    initialized = true;
    void releaseFlags.refresh();

    bindMetadataInput('rs-route-name', (input) => {
        state.routeDraftName = input.value;
    });
    bindMetadataInput('rs-route-notes', (input) => {
        state.routeDraftNotes = input.value;
    });
    bindMetadataInput('rs-route-tags', (input) => {
        state.routeDraftTags = input.value
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
    });
    const startInput = element<HTMLInputElement>('rs-planned-start');
    startInput?.addEventListener('change', () => {
        state.routePlannedStartAt = startInput.value
            ? new Date(startInput.value).toISOString()
            : null;
        markMetadataDirty();
    });
    const paceInput = element<HTMLInputElement>('rs-pace');
    paceInput?.addEventListener('change', () => {
        const value = Number.parseFloat(paceInput.value);
        state.routePlannedPaceKmh = Number.isFinite(value)
            ? Math.max(1, Math.min(12, value))
            : 4;
        markMetadataDirty();
    });
    element<HTMLButtonElement>('rs-favorite-btn')?.addEventListener(
        'click',
        () => {
            state.routeDraftFavorite = !state.routeDraftFavorite;
            markMetadataDirty();
        }
    );
    element<HTMLButtonElement>('rs-undo-btn')?.addEventListener('click', () => {
        undoRouteEdit();
        renderPreparedRouteEditor();
    });
    element<HTMLButtonElement>('rs-redo-btn')?.addEventListener('click', () => {
        redoRouteEdit();
        renderPreparedRouteEditor();
    });
    element<HTMLButtonElement>('rs-save-btn')?.addEventListener('click', (e) =>
        saveDraft(e.currentTarget as HTMLButtonElement)
    );
    element<HTMLButtonElement>('rb-save-btn')?.addEventListener('click', (e) =>
        saveDraft(e.currentTarget as HTMLButtonElement)
    );
    bindSearch('start');
    bindSearch('end');

    for (const key of [
        'routeComputation',
        'routeLoading',
        'routeError',
        'routeWaypoints',
        'routeDraftDirty',
        'routeLastSavedAt',
        'activePreparedRouteId',
        'routePlannedStartAt',
        'routePlannedPaceKmh',
        'routeDraftFavorite',
        'activeRouteProfile',
        'routeLoopEnabled',
    ] as const) {
        unsubscribers.push(state.subscribe(key, renderPreparedRouteEditor));
    }
    const onLocaleChanged = () => renderPreparedRouteEditor();
    eventBus.on('localeChanged', onLocaleChanged);
    unsubscribers.push(() => eventBus.off('localeChanged', onLocaleChanged));
    renderPreparedRouteEditor();
}

export function disposePreparedRouteUI(): void {
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
    for (const timer of searchTimers.values()) clearTimeout(timer);
    for (const controller of searchControllers.values()) controller.abort();
    searchTimers.clear();
    searchControllers.clear();
    initialized = false;
}
