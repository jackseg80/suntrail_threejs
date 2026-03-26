# Plan UI Improvements — SunTrail v5.9
> Généré le 2026-03-26 | Base : audit v5.8.17 | 10 améliorations | 4 phases | ~22 commits

---

## Contexte & Décisions

| Question | Décision |
|----------|----------|
| SharedAPIKeyComponent scope | Remplace les 3 emplacements : setup screen + SettingsSheet + ConnectivitySheet |
| Migration styles dynamiques | `classList + classes CSS` (cssText → classList.add) |
| États vides | Icônes SVG simples cohérentes avec les icônes de la nav bar (style monoline) |
| Typographie | **Normaliser** l'échelle vers une grille cohérente 10/12/14/16/20/24px |
| Haptic feedback | Light (tabs/toggles) · Medium (sheets/swipe) · Success (import/download) · Warning (GPS perdu) |

---

## Vue d'ensemble des 4 phases

```
Phase A — Foundation       (CSS tokens + migration inline + eventBus fix)
Phase B — Core UX          (ARIA + focus trap + swipe gestures)
Phase C — Components       (SharedAPIKey + loading states + empty states)
Phase D — Polish           (Haptic feedback)
```

**Parallélisme :** Phase A-track1 (tokens → CSS) et Phase A-track2 (eventBus) sont indépendants.
Phase B et C peuvent démarrer dès que Phase A est terminée.
Phase D est entièrement additive, démarre quand B+C sont stables.

---

## PHASE A — Foundation

### A1 · Design Tokens CSS
**Fichier :** `src/style.css`
**Durée estimée :** 30 min
**Risque :** 🟢 Faible (additif)

**Objectif :** Ajouter des variables CSS pour espacements, typographie et radius. Zéro changement visuel immédiat — les tokens seront consommés dans A2-A7.

**Variables à ajouter dans `:root` :**

```css
/* Spacing — grille 4px */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;

/* Typography — échelle normalisée */
--text-xs:   10px;   /* labels secondaires, unités */
--text-sm:   12px;   /* metadata, sous-titres */
--text-base: 14px;   /* corps de texte standard */
--text-md:   16px;   /* titres de sections */
--text-lg:   20px;   /* titres de sheets */
--text-xl:   24px;   /* grands chiffres (altitude, etc.) */

/* Radius */
--radius-sm:  8px;
--radius-md:  12px;
--radius-lg:  16px;
--radius-xl:  24px;

/* Transitions */
--transition-fast:   150ms ease;
--transition-normal: 250ms ease;
--transition-slow:   350ms cubic-bezier(0.34, 1.56, 0.64, 1); /* spring */
```

**Aussi :** Remplacer les tailles hardcodées existantes dans style.css par les nouveaux tokens (uniquement dans le fichier style.css, pas dans les composants — ça c'est A2-A7).

**Validation :** `npm run check` → 0 erreur.

---

### A2–A7 · Migration Styles Inline → Classes CSS
**Fichiers :** 6 composants (ordre least-risk → highest-risk)
**Durée estimée :** 30 min/fichier = ~3h total
**Risque :** 🔴 Élevé (visuel) → procéder fichier par fichier

**Règle absolue :** Ne jamais modifier la logique ou le comportement, uniquement déplacer les déclarations CSS.

**Pattern de migration :**
```typescript
// AVANT
div.style.cssText = 'padding: 15px; color: var(--text-2); font-size: 12px;';

// APRÈS
div.classList.add('stat-card');
// Dans style.css :
// .stat-card { padding: var(--space-4); color: var(--text-2); font-size: var(--text-sm); }
```

**Pour les états dynamiques** (`display: none/flex`, opacity) : conserver inline ou utiliser des classes utilitaires `.hidden` / `.visible`.

#### A2 · TopStatusBar.ts (~3 inline styles)
**Nouvelles classes à créer :**
- `.status-bar-inner` — conteneur flex principal
- `.status-gps-dot` — point GPS pulsant
- `.status-rec-badge` — badge REC rouge

#### A3 · ConnectivitySheet.ts (~2 inline styles)
**Nouvelles classes à créer :**
- `.conn-status-row` — ligne statut réseau
- `.conn-stat-value` — valeur numérique précision GPS

#### A4 · TrackSheet.ts (~5 inline styles)
**Nouvelles classes à créer :**
- `.track-stat-grid` — grille 3 colonnes D+/D-/distance
- `.track-stat-item` — cellule stat avec label + valeur
- `.track-waypoint-item` — ligne d'un waypoint dans la liste

#### A5 · LayersSheet.ts (~8 inline styles)
**Nouvelles classes à créer :**
- `.layer-item` — ligne source carto
- `.layer-item-active` — state actif
- `.layer-warning-badge` — badge "LOD limité"

#### A6 · SearchSheet.ts (~15 inline styles)
**Nouvelles classes à créer :**
- `.search-input-wrapper` — conteneur barre de recherche
- `.search-result-item` — ligne résultat géocodage
- `.search-result-item:hover` — hover state (impossible en inline !)
- `.search-section-header` — séparateur "Sommets proches" / "Résultats"

#### A7 · ExpertSheets.ts (~40+ inline styles — le plus gros chantier)
**Nouvelles classes à créer :**
- `.weather-current-card` — card météo actuelle
- `.weather-temp-display` — affichage grande température
- `.forecast-hour-item` — item forecast horaire
- `.forecast-bar` — barre de précipitation
- `.solar-hour-row` — ligne heure soleil levant/coucher
- `.solar-probe-grid` — grille résultats Solar Probe
- `.sos-action-btn` — bouton urgence stylisé
- `.sos-call-btn` — bouton appel 112

**Validation pour chaque A2–A7 :** `npm run check` + `npm test` → 0 nouvelle erreur + vérification visuelle.

---

### A8 · EventBus — Nouveaux Événements Sheets
**Fichier :** `src/modules/eventBus.ts`
**Durée estimée :** 20 min
**Risque :** 🟢 Faible

**Objectif :** Ajouter les événements de cycle de vie des sheets dans l'`EventMap` typé.

```typescript
// Ajouter dans EventMap :
'sheetOpened': { id: string };
'sheetClosed': { id: string | null };
```

**Modifier `SheetManager.ts` :**
- Dans `open(id)` → émettre `eventBus.emit('sheetOpened', { id })` après l'ouverture
- Dans `close()` → émettre `eventBus.emit('sheetClosed', { id: this.activeSheetId })` avant la fermeture

**Validation :** Ajouter un test unitaire dans `eventBus.test.ts` :
```typescript
// Test : sheetOpened émis quand sheetManager.open('search')
// Test : sheetClosed émis quand sheetManager.close()
```

---

### A9 · NavigationBar — Supprimer le Polling
**Fichier :** `src/modules/ui/components/NavigationBar.ts`
**Dépend de :** A8
**Durée estimée :** 20 min
**Risque :** 🟡 Moyen

**Objectif :** Remplacer le `setInterval(300ms)` par un abonnement `eventBus`.

```typescript
// AVANT (lignes 41-48)
const syncInterval = setInterval(() => {
    const activeId = sheetManager.getActiveSheetId();
    // ... sync tabs
}, 300);

// APRÈS
const onSheetChange = (payload: { id: string } | { id: string | null }) => {
    // ... sync tabs avec payload.id
};
eventBus.on('sheetOpened', onSheetChange);
eventBus.on('sheetClosed', onSheetChange);
this.addSubscription(() => {
    eventBus.off('sheetOpened', onSheetChange);
    eventBus.off('sheetClosed', onSheetChange);
});
```

**Validation :**
- `grep -r "setInterval" src/modules/ui/components/NavigationBar.ts` → 0 résultat
- Ouvrir/fermer chaque sheet → vérifier que le tab actif se met à jour correctement
- `npm test` → 0 régression

---

## PHASE B — Core UX

### B1 · ARIA — Attributs Minimum
**Fichiers :** `SheetManager.ts` + tous les composants (10 fichiers)
**Durée estimée :** 2h
**Risque :** 🟢 Faible (additif)

**Objectif :** Ajouter les attributs ARIA essentiels sans modifier l'apparence.

**Dans `SheetManager.ts` — `open(id)` :**
```typescript
sheet.setAttribute('role', 'dialog');
sheet.setAttribute('aria-modal', 'true');
sheet.setAttribute('aria-labelledby', `${id}-title`);
sheet.removeAttribute('aria-hidden');
// Ajouter aria-hidden="true" sur tous les autres sheets
```

**Dans `SheetManager.ts` — `close()` :**
```typescript
sheet.setAttribute('aria-hidden', 'true');
```

**Dans chaque composant `render()` — checklist :**
| Élément | Attribut ARIA à ajouter |
|---------|------------------------|
| Bouton close (×) | `aria-label="Fermer"` |
| Bouton info (ⓘ) | `aria-label="Informations"` |
| Bouton play/pause timeline | `aria-label="Lecture"` / `"Pause"` + `aria-pressed` |
| Toggles on/off | `role="switch"` + `aria-checked="true/false"` |
| Sliders | `aria-label` + `aria-valuemin` + `aria-valuemax` + `aria-valuenow` |
| Tabs NavigationBar | `role="tablist"` sur conteneur + `role="tab"` + `aria-selected` |
| Updates GPS (TopStatusBar) | `aria-live="polite"` sur le conteneur coordonnées |
| Updates timer REC | `aria-live="off"` (update trop fréquent, pas d'annonce) |

**Ajouter `id` sur les titres des sheets** (pour `aria-labelledby`) :
```html
<!-- Dans chaque <template> -->
<h2 id="settings-title" class="sheet-title">Paramètres</h2>
<!-- SheetManager référence settings-title via aria-labelledby="settings-title" -->
```

**Validation :** `npx lighthouse http://localhost:5173 --only-categories=accessibility` → score ≥ 85.

---

### B2 · Focus Trap dans SheetManager
**Fichier :** `src/modules/ui/core/SheetManager.ts`
**Dépend de :** B1
**Durée estimée :** 1h
**Risque :** 🟡 Moyen

**Objectif :** Quand une sheet est ouverte, le focus Tab reste piégé à l'intérieur.

**Implémentation :**
```typescript
private trapFocus(sheet: HTMLElement): void {
    const focusable = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => [...sheet.querySelectorAll<HTMLElement>(focusable)]
        .filter(el => !el.hasAttribute('disabled'));

    this.focusTrapHandler = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;
        const elements = getFocusable();
        if (!elements.length) { e.preventDefault(); return; }
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus();
        }
    };
    document.addEventListener('keydown', this.focusTrapHandler);
    // Focus auto sur premier élément focusable ou le sheet lui-même
    (getFocusable()[0] ?? sheet).focus();
}

private releaseFocus(): void {
    document.removeEventListener('keydown', this.focusTrapHandler);
    this.triggerElement?.focus(); // retour au déclencheur
}
```

**Stocker le trigger :** Dans `open(id)`, mémoriser `this.triggerElement = document.activeElement as HTMLElement`.

**Validation :**
- Ouvrir une sheet → Tab 10 fois → focus ne sort pas de la sheet
- Shift+Tab depuis le premier élément → va au dernier
- Fermer la sheet → focus retourne au bouton déclencheur

---

### B3 · Escape pour Fermer
**Fichier :** `src/modules/ui/core/SheetManager.ts`
**Dépend de :** B2
**Durée estimée :** 15 min
**Risque :** 🟢 Faible

```typescript
// Dans le constructeur SheetManager ou init()
document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.activeSheetId) {
        this.close();
    }
});
```

**Validation :** Ouvrir chaque sheet → Escape → sheet se ferme.

---

### B4 · Swipe Down pour Fermer les Sheets
**Fichier :** `src/modules/ui/core/SheetManager.ts` (+ CSS)
**Durée estimée :** 2h
**Risque :** 🟡 Moyen

**Objectif :** Swipe vertical vers le bas sur le drag handle ferme la sheet.

**Structure HTML à ajouter** dans chaque `<template>` de sheet :
```html
<div class="sheet-drag-handle" aria-hidden="true">
    <div class="sheet-drag-indicator"></div>
</div>
```

**CSS pour le handle :**
```css
.sheet-drag-handle {
    width: 100%;
    padding: var(--space-3) 0 var(--space-2);
    display: flex;
    justify-content: center;
    touch-action: none; /* critique — empêche le scroll browser sur cet élément */
    cursor: grab;
}
.sheet-drag-indicator {
    width: 36px;
    height: 4px;
    border-radius: var(--radius-sm);
    background: var(--text-3);
}
```

**Implémentation Pointer Events :**
```typescript
private attachSwipeGesture(sheet: HTMLElement): void {
    const handle = sheet.querySelector('.sheet-drag-handle');
    if (!handle) return;

    let startY = 0, startTime = 0;

    const onStart = (e: PointerEvent) => {
        startY = e.clientY;
        startTime = Date.now();
        handle.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
        const delta = e.clientY - startY;
        if (delta > 0) {
            // Translate sheet pour feedback visuel
            sheet.style.transform = `translateY(${delta * 0.5}px)`;
        }
    };
    const onEnd = (e: PointerEvent) => {
        const delta = e.clientY - startY;
        const velocity = delta / (Date.now() - startTime); // px/ms
        sheet.style.transform = ''; // reset
        sheet.style.transition = '';

        if (delta > 60 || velocity > 0.3) {
            this.close(); // Seuil atteint → fermer
        }
    };

    handle.addEventListener('pointerdown', onStart);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
}
```

**Appeler dans `open(id)` :** `this.attachSwipeGesture(sheet)`.

**⚠️ Important :** N'attacher le listener qu'au `.sheet-drag-handle`, PAS au contenu — le scroll dans les sheets doit rester fonctionnel.

**Validation :**
- Swipe down >60px depuis le handle → sheet se ferme
- Swipe down <30px → sheet reste ouverte
- Scroll dans le contenu d'une sheet → aucune fermeture accidentelle
- Swipe sur Three.js canvas → aucune interaction parasite

---

## PHASE C — Components

### C1 · SharedAPIKeyComponent
**Fichiers :** `src/modules/ui/components/SharedAPIKeyComponent.ts` (nouveau) + `index.html` + `src/modules/ui/components/SettingsSheet.ts` + `src/modules/ui/components/ConnectivitySheet.ts`
**Durée estimée :** 2h
**Risque :** 🟡 Moyen

**Objectif :** Extraire la logique du formulaire API key en un composant réutilisable.

**Template à ajouter dans `index.html` :**
```html
<template id="template-api-key-form">
    <div class="api-key-section">
        <label class="api-key-label" for="">Clé MapTiler</label>
        <form class="api-key-form">
            <input type="text" class="api-key-input" placeholder="Coller votre clé..." autocomplete="off" spellcheck="false">
            <button type="submit" class="api-key-submit">✓</button>
        </form>
        <p class="api-key-hint">
            <a href="https://cloud.maptiler.com/account/keys/" target="_blank" rel="noopener">Obtenir une clé gratuite</a>
        </p>
    </div>
</template>
```

**Composant :**
```typescript
// src/modules/ui/components/SharedAPIKeyComponent.ts
export class SharedAPIKeyComponent extends BaseComponent {
    constructor(containerId: string) {
        super('template-api-key-form', containerId);
    }

    render(): void {
        const form = this.container.querySelector<HTMLFormElement>('.api-key-form')!;
        const input = this.container.querySelector<HTMLInputElement>('.api-key-input')!;

        // Sync valeur courante
        input.value = state.MK || '';

        // Submit
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const key = input.value.trim();
            if (!key) return;
            state.MK = key;
            showToast('Clé MapTiler sauvegardée ✓');
            // Déclencher rechargement tuiles
            eventBus.emit('terrainReady'); // ou event dédié selon besoin
        });

        // Réactivité
        this.addSubscription(state.subscribe('MK', (val: string) => {
            if (input !== document.activeElement) input.value = val || '';
        }));
    }
}
```

**Intégration dans SettingsSheet.ts :**
- Supprimer le code `#api-key-form`, `#maptiler-key-input` et sa logique
- Ajouter un `<div id="settings-api-key-slot"></div>` dans le template
- Dans `render()` : `new SharedAPIKeyComponent('settings-api-key-slot').hydrate()`

**Intégration dans ConnectivitySheet.ts :**
- Même pattern avec `id="conn-api-key-slot"`

**Setup screen (`index.html`) :**
- Remplacer `#k1` + `#bgo` par une instance de `SharedAPIKeyComponent` dans un container dédié
- Note : le setup screen a une UX différente (plein écran + bouton "Lancer l'expérience"). Garder le texte du bouton mais utiliser le même composant pour la saisie.

**Validation :**
- Saisir une clé dans Settings → vérifier `state.MK` mis à jour + tuiles rechargées
- Saisir une clé dans Connectivity → même résultat
- Setup screen → même résultat
- Les 3 champs sont synchronisés (changer l'un met à jour les autres via subscription)

---

### C2 · Loading States
**Fichiers :** `SearchSheet.ts`, `TrackSheet.ts`, `ConnectivitySheet.ts`
**Durée estimée :** 2h
**Risque :** 🟢 Faible

**Objectif :** Ajouter des indicateurs de chargement sur les 3 opérations async principales.

**Créer un composant spinner partagé (inline CSS, pas de nouveau fichier) :**
```css
/* Dans style.css */
.spinner {
    width: 18px; height: 18px;
    border: 2px solid var(--text-3);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }

.btn-loading {
    pointer-events: none;
    opacity: 0.7;
}
.btn-loading .btn-label { visibility: hidden; }
.btn-loading::after {
    content: '';
    position: absolute;
    /* spinner centré sur le bouton */
    width: 16px; height: 16px;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
}
```

**SearchSheet.ts — Loading pendant géocodage :**
```typescript
// AVANT recherche distante
resultsContainer.innerHTML = '<div class="search-loading" role="status" aria-live="polite"><span class="spinner"></span><span>Recherche...</span></div>';

// APRÈS résultats reçus
// Remplacer .search-loading par les résultats
```

**TrackSheet.ts — Loading pendant import GPX :**
```typescript
// Pendant le parsing FileReader
importBtn.classList.add('btn-loading');
importBtn.setAttribute('aria-busy', 'true');

// À la fin (finally)
importBtn.classList.remove('btn-loading');
importBtn.setAttribute('aria-busy', 'false');
```

**ConnectivitySheet.ts — Loading pendant download zone :**
```typescript
// Pendant le téléchargement
downloadBtn.classList.add('btn-loading');
// Mise à jour du % via innerHTML sur un span dédié `.download-progress`
downloadBtn.classList.remove('btn-loading'); // à la fin
```

**Délai minimum 300ms** pour éviter le flash :
```typescript
const [result] = await Promise.all([fetchData(), new Promise(r => setTimeout(r, 300))]);
```

**Validation :**
- Déclencher chaque opération → spinner visible
- Opération terminée → spinner disparu
- Erreur → spinner disparu + toast d'erreur

---

### C3 · États Vides (Empty States)
**Fichiers :** `TrackSheet.ts`, `SearchSheet.ts`
**Durée estimée :** 1h30
**Risque :** 🟢 Faible

**Objectif :** Afficher un état vide illustré quand il n'y a pas de données.

**Style des icônes :** Cohérent avec la nav bar (monoline, stroke 1.5, style iOS/Material). SVG inline directement dans le HTML.

**Classe CSS partagée :**
```css
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-6) var(--space-4);
    gap: var(--space-3);
    text-align: center;
}
.empty-state-icon {
    width: 48px; height: 48px;
    color: var(--text-3);
    opacity: 0.6;
}
.empty-state-title {
    font-size: var(--text-md);
    color: var(--text-2);
    font-weight: 500;
}
.empty-state-subtitle {
    font-size: var(--text-sm);
    color: var(--text-3);
}
```

**TrackSheet — état vide (0 points enregistrés, 0 GPX importé) :**
```html
<div class="empty-state">
    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <!-- Icône "sentier de montagne" monoline -->
        <path d="M3 17l4-8 4 5 3-3 4 6" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="19" cy="5" r="2"/>
    </svg>
    <p class="empty-state-title">Aucun parcours</p>
    <p class="empty-state-subtitle">Importez un fichier GPX ou lancez l'enregistrement GPS</p>
</div>
```

**SearchSheet — état vide (0 résultats) :**
```html
<div class="empty-state">
    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <!-- Icône "sommet / pin" monoline -->
        <path d="M12 2L8 8H4l8 14 8-14h-4L12 2z" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <p class="empty-state-title">Aucun résultat</p>
    <p class="empty-state-subtitle">Essayez un autre nom de lieu ou sommet</p>
</div>
```

**SearchSheet — état initial (avant saisie) :**
```html
<div class="empty-state" id="search-hint">
    <p class="empty-state-subtitle">Recherchez un lieu, sommet ou commune</p>
</div>
```

**Logique dans les composants :**
- Afficher l'empty state quand `results.length === 0` ET la recherche est terminée (pas pendant le loading)
- Masquer l'empty state pendant le loading (spinner à la place)

**Validation :**
- SearchSheet : chercher "zzzzzzz" → empty state visible
- TrackSheet sans données → empty state visible
- Après import GPX → empty state masqué

---

## PHASE D — Polish

### D1 · Installation @capacitor/haptics
**Durée estimée :** 10 min
**Risque :** 🟢 Faible

```bash
npm install @capacitor/haptics
npx cap sync
```

**Créer un helper partagé `src/modules/haptics.ts` :**
```typescript
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'selection';

export async function haptic(type: HapticType): Promise<void> {
    try {
        switch (type) {
            case 'light':     await Haptics.impact({ style: ImpactStyle.Light }); break;
            case 'medium':    await Haptics.impact({ style: ImpactStyle.Medium }); break;
            case 'heavy':     await Haptics.impact({ style: ImpactStyle.Heavy }); break;
            case 'success':   await Haptics.notification({ type: NotificationType.Success }); break;
            case 'warning':   await Haptics.notification({ type: NotificationType.Warning }); break;
            case 'selection': await Haptics.selectionChanged(); break;
        }
    } catch {
        // Graceful no-op sur web/desktop
    }
}
```

---

### D2 · Intégration Haptic Feedback
**Fichiers :** `SheetManager.ts`, `NavigationBar.ts`, `TrackSheet.ts`, `ConnectivitySheet.ts`
**Dépend de :** D1
**Durée estimée :** 45 min
**Risque :** 🟢 Faible

**Mapping des interactions :**

| Interaction | Type Haptic | Fichier |
|------------|-------------|---------|
| Ouverture sheet | `medium` | `SheetManager.open()` |
| Fermeture sheet | `light` | `SheetManager.close()` |
| Swipe threshold atteint | `medium` | `SheetManager.attachSwipeGesture()` (quand delta > 60) |
| Switch tab NavigationBar | `light` | `NavigationBar.render()` — listener click tab |
| Toggle on/off | `light` | `SettingsSheet` — listener toggle |
| Import GPX réussi | `success` | `TrackSheet` — après parsing OK |
| Download zone terminé | `success` | `ConnectivitySheet` — après download OK |
| GPS signal perdu | `warning` | `location.ts` ou via eventBus |
| Clé API sauvegardée | `success` | `SharedAPIKeyComponent` — après submit |

**Validation :**
- Tester sur appareil Android réel → vibrations correctes
- Tester sur navigateur web → aucun crash, logs silencieux
- `npm test` → mock de `@capacitor/haptics` → tests passent

---

## Récapitulatif des Fichiers Modifiés

| Fichier | Phases | Type de changement |
|---------|--------|--------------------|
| `src/style.css` | A1, A2-A7, C2, C3 | Ajout tokens + classes CSS |
| `src/modules/eventBus.ts` | A8 | Ajout 2 types d'événements |
| `src/modules/ui/core/SheetManager.ts` | A8, B1, B2, B3, B4 | Majeur — cycle de vie complet |
| `src/modules/ui/components/NavigationBar.ts` | A9 | Refactor polling → eventBus |
| `src/modules/ui/components/TopStatusBar.ts` | A2, B1 | CSS + ARIA |
| `src/modules/ui/components/ConnectivitySheet.ts` | A3, B1, C1, C2 | CSS + ARIA + SharedAPIKey |
| `src/modules/ui/components/TrackSheet.ts` | A4, B1, C2, C3 | CSS + ARIA + loading + empty |
| `src/modules/ui/components/LayersSheet.ts` | A5, B1 | CSS + ARIA |
| `src/modules/ui/components/SearchSheet.ts` | A6, B1, C2, C3 | CSS + ARIA + loading + empty |
| `src/modules/ui/components/ExpertSheets.ts` | A7, B1 | CSS + ARIA |
| `src/modules/ui/components/SettingsSheet.ts` | B1, C1 | ARIA + SharedAPIKey |
| `src/modules/ui/components/SharedAPIKeyComponent.ts` | C1 | **Nouveau fichier** |
| `src/modules/haptics.ts` | D1 | **Nouveau fichier** |
| `index.html` | B1, C1 | Ajout template + ids ARIA |
| `package.json` | D1 | Ajout `@capacitor/haptics` |

**Nouveaux fichiers créés :** 2 (`SharedAPIKeyComponent.ts`, `haptics.ts`)
**Fichiers modifiés :** 13
**Nouveaux tests à écrire :** 8 (eventBus events, NavigationBar sync, SharedAPIKeyComponent, loading states ×3, haptics)

---

## Ordre d'Exécution Recommandé

```
Semaine 1
├── [Track A] A1 → A2 → A3 → A4 → A5 → A6 → A7
└── [Track B] A8 → A9

Semaine 2
├── B1 → B2 → B3 → B4

Semaine 3
├── [Track A] C1 → C2
└── [Track B] C3

Semaine 4
└── D1 → D2
```

---

## Commandes de Validation Globale

```bash
npm run check   # TypeScript strict — 0 erreur
npm test        # 102+ tests — 0 régression
npm run build   # Build production — 0 warning critique
```
