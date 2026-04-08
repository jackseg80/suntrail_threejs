# Audit #5 — Accessibilite Mobile Natif — SunTrail v5.22.1

Date : 2026-04-04
Auditeur : Claude (analyse statique du code source)
Referentiel : WCAG 2.1 AA + Material Design 3 (Google Play Store)

---

## Resume

- **Score estime WCAG 2.1 AA : ~65/100** (conforme partiel)
- **Points forts** : aria-labels systematiques sur les form controls, focus trap sur les sheets, Escape ferme les sheets, focus-visible sur tous les boutons principaux, tabindex sur les FABs, tests axe-core existants (a11y.test.ts)
- **Points faibles** : aucun `prefers-reduced-motion`, canvas 3D invisible pour TalkBack, sheet-close buttons trop petits (28px), pas de skip-to-content, aucun landmark semantique, contrastes insuffisants en mode glassmorphism, 3 checkboxes sans aria-label, gestes complexes sans alternatives accessibles

**Nombre de violations identifiees** : 27

---

## 1. Cibles tactiles (48dp minimum Google)

### Conformes (>= 48dp)

| Composant | Taille mesuree | Source |
|---|---|---|
| `.fab-btn` (Compass, Layers, GPS) | 52x52px | `style.css:813` |
| `.nav-mode-toggle` (#nav-2d-toggle) | 52x52px | `style.css:864` |
| `.icon-btn-sm` (Net status, SOS) | 48x48px | `style.css:203` |
| `.status-widget`, `.top-widget` | min-height: 48px | `style.css:184` |
| `.coords-btn` (Solar, SOS dans pill) | min-height: 48px | `style.css:990` |
| `input[type="checkbox"]` (toggles) | 48x28px | `style.css:472` |
| `.gps-disc-btn` (GPS disclosure) | min-height: 48px | `style.css:1576` |
| `input[type="range"]` thumb | 22x22px | `style.css:490` — **valeur CSS mais zone d'impact plus large avec padding** |

### Non conformes (< 48dp)

| Composant | Taille mesuree | Conforme 48dp ? | Action requise |
|---|---|---|---|
| `.sheet-close` (boutons X de fermeture) | **28x28px** | NON | Augmenter a min 44x44px, idealement 48x48px |
| `#close-profile` (fermeture profil) | **24x24px** (inline style) | NON | Augmenter a 48x48px |
| `.search-chip` (filtres recherche) | padding 4px 12px, **hauteur ~22px** | NON | Ajouter min-height: 36px minimum (idealement 48px) |
| `.info-icon` (icone i) | **20x20px** | NON | Augmenter a 44x44px minimum |
| `.sub-expand-btn` (fleches expand) | padding 2px 4px, font-size 8px, **~16x12px** | NON | Augmenter zone cliquable a 44x44px |
| `#play-btn` (timeline) | aucun sizing explicite, **inline styles sans dimension** | NON | Ajouter min-width/min-height: 48px |
| `#speed-select` (vitesse timeline) | aucun sizing, **~40x20px** | NON | Ajouter min-height: 48px |
| `#date-input` (calendrier) | min-height: **35px** (inline) | NON | Augmenter a 48px |
| `.srch-geo-item` (resultats recherche) | padding: 12px, **hauteur variable ~36px** | LIMITE | Ajouter min-height: 48px |
| `.nav-tab` (onglets navigation) | flex:1, padding 10px 0 6px, **hauteur ~ 72px mais largeur variable ~25% ecran** | OK sur ecran standard | Conforme sur ecrans >= 360px |
| `.exp-hourly-item` (items meteo horaire) | min-width: 50px, **hauteur non definie** | NON | Ajouter min-height: 48px si cliquable |
| `.preset-btn` / `.theme-btn` | padding: 12px 5px, **hauteur ~36px** | NON | Ajouter min-height: 44px |
| `#probe-btn` (bouton solaire coords pill) | pas de min-height explicite | A VERIFIER | Le `.coords-btn` parent a min-height:48px — OK |

### Recommandation prioritaire

Les `.sheet-close` (28x28px) et `#close-profile` (24x24px) sont les violations les plus critiques. Sur un ecran mobile, un bouton de 28px est frustrant a toucher avec un pouce. Agrandir a 48x48px avec hit area si necessaire (technique du padding negatif ou pseudo-element).

---

## 2. Contrastes WCAG AA

### Design tokens declares

| Token | Valeur (dark) | Valeur (light) | Usage |
|---|---|---|---|
| `--text` | `#f0f0f2` | `#1a1a1a` | Texte principal |
| `--text-2` | `#a0a4bc` | `#4b5563` | Texte secondaire |
| `--text-3` | `#7b7f9a` | `#6b7280` | Texte tertiaire (note: eclairci en v5.11 pour a11y) |
| `--accent` | `#4a8ef8` | `#2563eb` | Liens, elements actifs |
| `--accent-btn` | `#2668d4` | `#1d4ed8` | Fond boutons |
| `--gold` | `#f5a623` | `#d97706` | Titres sheets |
| `--danger` | `#ef4444` | `#dc2626` | Erreurs, alertes |
| `--success` | `#22c55e` | `#16a34a` | Succes, online |
| `--bg` | `#0a0c12` | `#f5f5f0` | Fond principal |
| `--surface` | `rgba(18,22,34,0.85)` | `rgba(255,255,255,0.80)` | Fond semi-transparent |

### Analyse des contrastes

| Contexte | Couleurs | Ratio estime | Conforme AA ? | Notes |
|---|---|---|---|---|
| Texte principal / fond dark | `#f0f0f2` sur `#0a0c12` | ~17.6:1 | OUI | Excellent |
| Texte principal / fond light | `#1a1a1a` sur `#f5f5f0` | ~15.8:1 | OUI | Excellent |
| `--text-2` / fond dark | `#a0a4bc` sur `#0a0c12` | ~8.2:1 | OUI | Bon |
| `--text-3` / fond dark | `#7b7f9a` sur `#0a0c12` | ~5.3:1 | OUI (texte normal) | Limite pour petit texte |
| `--text-3` / fond light | `#6b7280` sur `#f5f5f0` | ~4.7:1 | OUI (texte normal) | Limite |
| `--accent` / fond dark | `#4a8ef8` sur `#0a0c12` | ~5.0:1 | OUI | Note dans le CSS: ratio 4.44->5.0 |
| `--gold` (titre sheet) / fond dark | `#f5a623` sur `#12141f` | ~6.8:1 | OUI | Bon |
| `--gold` / fond light | `#d97706` sur `#ffffff` | ~3.7:1 | **NON (texte normal)** | 4.5:1 requis |
| `--accent` sur `--surface` (glass) dark | `#4a8ef8` sur `rgba(18,22,34,0.85)` | ~4.5:1 | LIMITE | Depend du contenu derriere |
| `--on-accent` / `--accent-btn` | `#fff` sur `#2668d4` | ~4.8:1 | OUI | Note CSS: "5.6:1 avec #1555e0" |
| `.lod-badge` (`--accent` sur `--surface`) | `#4a8ef8` sur glass | ~4.5:1 | LIMITE | Sous le soleil: illisible |
| `.nav-label` (`--text-2`, 10px) | `#a0a4bc` sur glass | ~7:1 | OUI | Mais texte 10px = accessibilite reduite |
| `--text-3` a 10px (labels section) | `#7b7f9a` a 10px | ~5.3:1 | **NON (texte < 14px)** | Texte < 14px requiert 4.5:1 mais 10px est trop petit pour les malvoyants |
| `.search-chip-active` (`--on-gold` / `--gold`) dark | `#000` sur `#f5a623` | ~6.8:1 | OUI | |
| `.search-chip-active` light | `#fff` sur `#d97706` | ~3.7:1 | **NON** | Le `--on-gold` passe a `#fff` en light mais `#d97706` manque de contraste |
| Toast dark | `--gold` sur `rgba(0,0,0,0.7)` | ~7:1 | OUI | |
| Toast light | `#92400e` sur `rgba(255,255,255,0.92)` | ~5.5:1 | OUI | |

### Probleme glassmorphism

Le `backdrop-filter: saturate(180%) blur(20px)` rend le fond des widgets semi-transparent. Le contraste declare est celui entre le texte et le fond `--surface`, mais le fond reel depend du contenu 3D derriere.

**En plein soleil** (cas d'usage principal de l'app de randonnee), la carte sous-jacente peut etre tres claire (neige, ciel). Le fond `rgba(18,22,34,0.85)` ne filtre que 85% de la lumiere — le 15% restant peut suffisamment eclaircir le fond pour degrader les contrastes sous le seuil AA.

**Recommandation** : utiliser `--surface-solid` (opaque) comme fallback pour les labels critiques (altitude, coordonnees GPS, alertes meteo). Ou ajouter un `background-blend-mode` supplementaire.

---

## 3. Screen Reader (TalkBack)

### aria-labels

| Composant | aria-label present ? | Notes |
|---|---|---|
| FABs (compass, layers, GPS) | OUI | Statiques dans HTML, en francais |
| Toggle 2D/3D | OUI | `aria-pressed` aussi |
| Tous les checkboxes settings | OUI (sauf 3) | `stats-toggle`, `shadow-toggle`, `debug-toggle` **manquent aria-label** |
| Sliders (range) | OUI | Tous labellises |
| Close buttons (sheets) | OUI (via JS) | Ajoutes dynamiquement dans les composants TS |
| Search input | OUI (via JS) | `SearchSheet.ts:117` |
| Geo results listbox | OUI | `role="listbox"` + `aria-live="polite"` |
| Layer grid | OUI | `role="listbox"` + `aria-labelledby` |
| Nav tabs | OUI (via JS) | `role="tab"` + `aria-selected` + `aria-label` dynamique i18n |
| Top pill main | **NON** | `role="button"` + `tabindex="0"` mais **aucun aria-label** |
| Play button (timeline) | OUI (via JS) | `TimelineComponent.ts:106` |
| Speed select | **NON** | Pas d'aria-label |
| Date input | **NON** | Pas d'aria-label |
| API key input | OUI (via JS) | `SharedAPIKeyComponent.ts:21` |

### Structure semantique

| Element | Present ? | Notes |
|---|---|---|
| `<html lang="fr">` | OUI | Correct |
| `<nav>` | OUI | `#nav-bar` — unique landmark nav |
| `<main>` | **NON** | Le contenu principal (canvas 3D) n'est pas dans un `<main>` |
| `<header>` | **NON** | `#top-status-bar` n'est pas un `<header>` |
| `<h1>` | **NON** | Aucun heading de niveau 1 sur la page |
| `<h2>` | Partiel | Uniquement dans le template SOS (`h2` inline) |
| `<h3>` | Partiel | Uniquement dans le template profil d'elevation |
| Skip-to-content link | **NON** | Completement absent |
| Landmark roles | **MINIMAL** | Seul `<nav>` est present |

### Canvas 3D

Le canvas Three.js est cree dynamiquement dans `scene.ts:157` via `container.appendChild(state.renderer.domElement)`. Le `<canvas>` genere par Three.js :

- **N'a pas de `role`** (devrait avoir `role="img"` ou `role="application"`)
- **N'a pas d'`aria-label`** (devrait decrire "Carte topographique 3D interactive")
- **N'a pas de texte alternatif** pour les utilisateurs ne pouvant pas voir la carte
- Le `#canvas-container` est un `<div>` nu sans aucun attribut semantique

C'est la violation la plus critique pour TalkBack : le canvas est le contenu principal de l'application mais il est totalement invisible pour les lecteurs d'ecran.

### Problemes TalkBack specifiques

1. **Langue des aria-labels** : les labels statiques dans le HTML sont en francais (`"Reinitialiser le Nord"`, `"Localiser ma position"`). Ils devraient etre traduits via i18n comme le font les labels dynamiques dans les composants TS.
2. **Sheet drag handles** : correctement marques `aria-hidden="true"` — pas de bruit pour TalkBack.
3. **Emojis dans le contenu** : beaucoup d'emojis utilises comme icones (ex: SOS emoji). Certains sont marques `aria-hidden="true"` (bon), d'autres non.
4. **Live regions** : seul `#geo-results` utilise `aria-live="polite"`. Les changements de meteo, d'altitude, de coordonnees ne sont pas annonces.

---

## 4. Focus Management

### Points forts

| Fonctionnalite | Implementee ? | Source |
|---|---|---|
| Focus trap dans les sheets | OUI | `SheetManager.ts:217-240` — implementation correcte |
| Escape ferme les sheets | OUI | `SheetManager.ts:253-268` |
| Restauration du focus au trigger | OUI | `SheetManager.ts:247` |
| Focus-visible sur nav-tabs | OUI | `style.css:264` |
| Focus-visible sur checkboxes | OUI | `style.css:482` |
| Focus-visible sur sliders | OUI | `style.css:493` |
| Focus-visible sur FABs | OUI | `style.css:830` |
| Focus trap GPS disclosure | OUI | `gpsDisclosure.ts:86-98` |
| ARIA dialog sur sheets | OUI | Dynamiquement via `SheetManager.ts:61-72` |

### Points faibles

| Probleme | Impact | Recommandation |
|---|---|---|
| **Pas de skip-to-content** | Un utilisateur clavier doit tab a travers tous les widgets pour atteindre le contenu | Ajouter un lien cache en haut du body |
| **Sheet close buttons sont des `<div>`** | Non focusables par defaut, pas de `role="button"` ni `tabindex` dans le HTML | Convertir en `<button>` ou ajouter `role="button"` + `tabindex="0"` |
| **Top pill main pas de label** | Focusable (`tabindex="0"`) mais aucun aria-label — TalkBack dira "bouton" sans plus | Ajouter aria-label dynamique |
| **Onboarding focus** | Le bouton "Suivant" recoit le focus (`onboardingTutorial.ts:446`) — correct | OK |
| **Acceptance wall focus** | Le bouton "Accepter" recoit le focus (`acceptanceWall.ts:194`) — correct | OK |
| **Pas de focus-visible sur .sheet-close** | L'outline n'est pas defini pour les boutons de fermeture | Ajouter `:focus-visible` style |
| **Pas de focus-visible sur .preset-btn / .theme-btn** | Ces boutons interactifs n'ont pas de style focus | Ajouter `:focus-visible` style |

---

## 5. Gestes alternatifs

### Gestes utilises (touchControls.ts)

| Geste | Action | Accessible ? |
|---|---|---|
| Pan 1 doigt | Deplacer la carte | OUI — geste standard |
| Pinch 2 doigts | Zoom | **NON** — pas de boutons zoom +/- |
| Twist 2 doigts | Rotation azimut | **NON** — pas de bouton rotation |
| Tilt 2 doigts horizontal | Inclinaison | **NON** — pas de bouton tilt |
| Double-tap | (Non implemente) | N/A |

### Alternatives accessibles existantes

| Alternative | Presente ? | Notes |
|---|---|---|
| Boutons zoom +/- | **NON** | Aucun bouton de zoom dans l'interface |
| Bouton reset vue Nord | OUI | `#compass-fab` avec `role="button"` + `aria-label` — accessible |
| Toggle 2D/3D | OUI | `#nav-2d-toggle` accessible |
| Boussole 3D (`compass.ts`) | **PARTIELLEMENT** | Le canvas de la boussole (`#compass-canvas`) n'a ni `role` ni `aria-label`. Le SVG dans `#compass-fab` est accessible (aria-label). Mais le canvas 80x80px est invisible pour TalkBack. |

### Recommandations

1. **Ajouter des boutons zoom +/-** dans la `.fab-stack` — c'est la violation d'accessibilite la plus impactante pour les gestes. Un utilisateur handicape moteur ne peut pas effectuer un pinch.
2. **Ajouter un bouton reset tilt** (vue de dessus) — le toggle 2D/3D fait partiellement ce travail mais ne restaure pas le tilt en 3D.
3. Le `#compass-canvas` devrait avoir `aria-hidden="true"` puisqu'il est purement decoratif (le `#compass-fab` contient deja le SVG accessible).

---

## 6. Animations & Motion

### prefers-reduced-motion

**TOTALEMENT ABSENT.** Aucune occurrence de `prefers-reduced-motion` dans le CSS ou le JavaScript du projet.

### Animations inventoriees

| Animation | Type | Duree | Respecte reduced-motion ? |
|---|---|---|---|
| `tile-loading-shimmer` | CSS keyframes | 1.4s infinite | **NON** |
| `pulse-red` (REC indicator) | CSS keyframes | 1.5s infinite | **NON** |
| `pulse-rec` (REC button) | CSS keyframes | 1.2s infinite | **NON** |
| `spin` (spinner chargement) | CSS keyframes | 0.6s infinite | **NON** |
| Transitions sheets (slide up) | CSS transition | 350ms | **NON** |
| Transitions FABs (scale) | CSS transition | 300ms | **NON** |
| Transitions themes | CSS transition | 200ms | **NON** |
| Compass reset North | JS animation | 800ms | **NON** (`compass.ts:13`) |
| Camera flyTo | JS animation | variable | **NON** |
| Inertie pan | JS rAF | variable | **NON** |
| Vue 2D/3D tilt transition | JS/state | ~150ms | **NON** |

### Impact

Certains utilisateurs souffrent de mal des transports numerique (vestibular disorders). La rotation 3D de la carte, l'inertie du pan, et les animations de zoom sont particulierement problematiques. L'absence totale de `prefers-reduced-motion` signifie qu'aucun moyen de reduire ces animations n'est offert.

### Recommandation

Ajouter en priorite dans `style.css` :

```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}
```

Et dans le JS, verifier `window.matchMedia('(prefers-reduced-motion: reduce)').matches` pour desactiver l'inertie, les flyTo animes, et la rotation de la boussole.

---

## 7. Problemes supplementaires

### 7.1 Langue et internationalisation

Les aria-labels statiques dans `index.html` sont en francais uniquement :
- `aria-label="Reinitialiser le Nord"`
- `aria-label="Changer le type de carte"`
- `aria-label="Localiser ma position"`
- `aria-label="Basculer 2D/3D"`
- `aria-label="Ouvrir la timeline de simulation"`
- `aria-label="Statut reseau et donnees"`
- `aria-label="Appel de secours SOS"`

Ils ne beneficient pas du systeme i18n, contrairement aux labels dynamiques dans les composants TS. Un utilisateur germanophone ou anglophone avec TalkBack entendra des labels francais.

### 7.2 Semantique des sheet-close

Tous les boutons de fermeture de sheets sont des `<div class="sheet-close">` :
- Pas de role `button`
- Pas de `tabindex`
- Pas de gestion du `keydown` (Enter/Space)
- Le `SheetManager` ajoute `aria-label` via JS mais le `<div>` reste non-semantique

### 7.3 Checkboxes sans label visible associe

Les checkboxes utilisent `aria-label` mais pas `<label for="...">`. Certains lecteurs d'ecran preferent `<label>`. Le rendu visuel est correct (label a cote) mais la connexion programmatique est absente.

### 7.4 Taille de police minimale

Plusieurs elements utilisent des tailles de police tres petites :
- `.nav-mode-label`: **9px** (dans `index.html` inline + `style.css:901`)
- `.lod-badge`: **10px** (`--text-xs`)
- `.section-label`: **10px** (`--text-xs`)
- `.layer-pro-badge`: **9px**
- `.sub-expand-btn`: **8px**
- Divers labels secondaires a **10-11px**

WCAG ne definit pas de taille minimale stricte, mais les bonnes pratiques recommandent 12px minimum pour le texte lisible sur mobile.

---

## 8. Tests existants (a11y.test.ts)

Le projet a une suite de tests axe-core (`src/test/a11y.test.ts`) qui couvre :

- GPS Disclosure Modal (role dialog, aria-labelledby, boutons accessibles)
- Navigation Bar (role tablist, aria-label sur chaque tab, min-height 48px)
- Bottom Sheet generique (role dialog, aria-modal, switches)
- Onboarding Dialog (aria-labelledby)
- Settings Form Controls (aria-label sur toggles, sliders, select)
- Bouton FAB GPS (aria-label, taille >= 48px)

**Lacunes dans les tests** :
- Pas de test pour le canvas 3D
- Pas de test pour les sheet-close buttons
- Pas de test pour les contrastes
- Pas de test pour la structure des landmarks
- Pas de test pour `prefers-reduced-motion`

---

## 9. Recommandations priorisees

### P0 — Critique (a corriger avant toute release orientee accessibilite)

1. **Ajouter `prefers-reduced-motion`** — Media query CSS globale + check JS pour inertie/flyTo/animations. Zero effort, impact majeur pour les utilisateurs vestibulaires.

2. **Canvas 3D : ajouter `role="img"` + `aria-label`** sur `state.renderer.domElement` dans `scene.ts` apres creation. Label : "Carte topographique 3D interactive".

3. **Boutons zoom +/-** — Ajouter dans `.fab-stack`. Essentiel pour les utilisateurs ne pouvant pas effectuer de geste pinch (handicap moteur, switch access).

4. **Sheet-close : convertir en `<button>`** — Remplacer les `<div class="sheet-close">` par `<button class="sheet-close" aria-label="Fermer">` dans tous les templates. Augmenter la taille a 44x44px.

### P1 — Important (Play Store / WCAG AA strict)

5. **Ajouter `<main>` et `<header>`** — Wrapper le `#canvas-container` dans `<main>`, le `#top-status-bar` dans `<header>`. Ajouter un `<h1>` visuellement cache ("SunTrail - Carte 3D").

6. **Skip-to-content link** — Ajouter `<a href="#canvas-container" class="skip-link">Aller au contenu principal</a>` comme premier enfant du body, visible uniquement au focus.

7. **aria-label manquants** — Ajouter sur `#stats-toggle`, `#shadow-toggle`, `#debug-toggle`, `#top-pill-main`, `#speed-select`, `#date-input`.

8. **Internationaliser les aria-labels statiques** — Migrer les labels des FABs vers le systeme `data-i18n` ou les appliquer dynamiquement via les composants TS comme c'est deja fait pour les sheets.

9. **Contrastes en theme clair** — `--gold` (#d97706) sur fond blanc = 3.7:1 (echec AA). Assombrir a `#b45309` (~4.9:1) ou utiliser un fond opaque pour les titres en gold.

### P2 — Souhaitable (amelioration UX)

10. **Augmenter les cibles tactiles restantes** — `.sub-expand-btn` (8px -> 44px hit area), `.info-icon` (20px -> 44px hit area), `.search-chip` (ajouter min-height: 36px).

11. **Ajouter `aria-live` regions** — Pour les changements d'altitude, de coordonnees, et de meteo (dans le top pill et le coords pill).

12. **Focus-visible sur tous les interactifs** — Ajouter `:focus-visible` pour `.sheet-close`, `.preset-btn`, `.theme-btn`, `.track-btn`, `.layer-item`.

13. **Associer `<label>` aux checkboxes** — En complement des `aria-label`, ajouter `<label for="veg-toggle">` pour une meilleure semantique.

14. **`#compass-canvas` : `aria-hidden="true"`** — Le canvas boussole est purement decoratif (le FAB SVG est l'element accessible).

15. **Taille de police minimale** — Revoir les elements a 8-9px (`.sub-expand-btn`, `.nav-mode-label`, `.layer-pro-badge`) pour atteindre 11px minimum.

---

## Annexe : fichiers cles analyses

| Fichier | Contenu pertinent |
|---|---|
| `index.html` | Templates UI, structure semantique, aria-labels statiques |
| `src/style.css` | Design tokens, tailles, contrastes, animations |
| `src/modules/ui/components/NavigationBar.ts` | ARIA tablist/tab, aria-selected dynamique |
| `src/modules/ui/core/SheetManager.ts` | Focus trap, Escape, dialog ARIA, restauration focus |
| `src/modules/touchControls.ts` | Gestes tactiles (pinch, twist, tilt, pan) |
| `src/modules/compass.ts` | Boussole 3D, canvas 120px |
| `src/modules/scene.ts` | Creation du canvas Three.js (sans attributs a11y) |
| `src/modules/onboardingTutorial.ts` | Focus management onboarding |
| `src/modules/gpsDisclosure.ts` | Focus trap modal GPS |
| `src/modules/acceptanceWall.ts` | Focus modal acceptance |
| `src/modules/ui/components/ExpertSheets.ts` | aria-labels dynamiques meteo/solaire/SOS |
| `src/test/a11y.test.ts` | Suite axe-core existante (6 describe blocks) |
