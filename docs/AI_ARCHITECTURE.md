# SunTrail — Architecture & Composants (v5.26.6)

> Référence détaillée pour agents IA. Point d'entrée : [CLAUDE.md](../CLAUDE.md)

---

## Calculs & Géométrie (v5.26.0)

- **Formule de Distance** : **Haversine** — Précision < 0.5% sur les distances de randonnée alpine. Remplace l'ancienne approximation planaire (44% d'erreur).
- **Cumul D+ / D-** : Algorithme d'**Hystérésis avec seuil de 2m** (Garmin/Suunto style). Les variations d'altitude GPS sont filtrées et cumulées seulement si l'écart dépasse 2m.
- **Lissage Altitude** : Moyenne mobile sur 3 points appliquée au signal GPS brut avant calcul de pente.
- **Dédoublonnage** : Filtrage strict par timestamp (Set) avant tout calcul de distance pour éviter le gonflement artificiel des stats.

---

## État Global & Persistance (`state.ts`)

- **Monétisation (v5.25.1)** : `state.isPro` est la source de vérité. Synchronisé via `iapService.ts` (RevenueCat).
- **RevenueCat** : Entitlement `SunTrail 3D Pro`. Produits : `suntrail_pro_annual`, `suntrail_pro_monthly`, `suntrail_pro_lifetime`. Trial 7 jours sur plan annuel.
- **Pivot Central** : Toute la configuration (LOD, sources, presets) réside dans l'objet `state`.
- **Réactivité (v5.8.0)** : L'objet `state` est enveloppé dans un **Proxy JS récursif** (`ReactiveState.ts`). Les composants s'abonnent via `state.subscribe('path', callback)`.
- **Note sur les Tableaux (v5.8.16)** : Les méthodes in-place (`.push()`) ne déclenchent pas le Proxy. Utiliser la réaffectation : `state.arr = [...state.arr, item]`.
- **Persistance** : Sauvegarde automatique dans `localStorage`.
- **Versioning (v5.8.16)** : `CURRENT_SETTINGS_VERSION` — si version obsolète détectée au chargement, les réglages sont réinitialisés.
- **Event Bus (`eventBus.ts`)** : Brise les dépendances circulaires entre `terrain.ts` et `scene.ts`. Événements transversaux : `terrainReady`, `flyTo`, `sheetOpened`/`sheetClosed`, `localeChanged`, `networkOnline`/`networkOffline`.
- **Multi-GPX (v5.10.0)** : `state.gpxLayers: GPXLayer[]` — chaque layer a son mesh, couleur, stats et points 3D. Réaffectation obligatoire pour le Proxy.
- **isFlyingTo (v5.10.0)** : Flag `state.isFlyingTo` bloque l'origin shift pendant l'animation flyTo pour éviter les coordonnées stales.
- **i18n live-reload (v5.10.0)** : `BaseComponent.hydrate()` souscrit à `localeChanged`. Les strings en JS doivent avoir `data-i18n` pour être re-traduites. Pour les éléments hors composants, utiliser `eventBus.on('localeChanged', ...)`.
- **ID Testeur (v5.16.1)** : Réglages → Avancés → `iapService.getAppUserID()` → affiche `$RCAnonymousID:...` avec bouton copier. Visible uniquement si `iapService.initialized` (natif).
- **OnboardingTutorial v2 (v5.19.6)** : `src/modules/onboardingTutorial.ts` — module standalone (pas un BaseComponent). 8 slides. Deux exports : `requestOnboarding()` (1er lancement) et `showOnboarding()` (toujours). `z-index: 9000`. Responsive desktop via `@media (min-width: 768px)`. **Ne jamais appeler `localStorage.setItem(ONBOARDING_KEY)` dans `showOnboarding()`** — uniquement dans `requestOnboarding()`.
- **VRAMDashboard (v5.10.0)** : `state.vramPanel: VRAMDashboard | null`. Standalone. `init()` injecte un panel `position:fixed`. `toggle()` contrôle Stats.js et le panel VRAM.

---

## Interface & Composants (v5.9.0)

- **Architecture Découplée** : Logique UI extraite de `ui.ts` vers `src/modules/ui/components/`.
- **BaseComponent** : Classe abstraite — hydratation via `<template>`, rendu, nettoyage des abonnements.
- **SheetManager** : Singleton gérant l'exclusivité des Bottom Sheets + focus trap (Tab/Shift+Tab) + Escape + ARIA (`role="dialog"`, `aria-modal`) + swipe-to-dismiss via `.sheet-drag-handle`.
- **EventBus Sheet Events** : `sheetOpened`/`sheetClosed` émis par SheetManager. `NavigationBar` s'abonne (le `setInterval(300ms)` de polling a été supprimé).
- **Design Tokens (v5.9.0)** : Variables CSS dans `:root` — `--space-1..6`, `--text-xs..xl`, `--radius-sm..xl`, `--transition-fast/normal/slow`. Toujours utiliser ces tokens.
- **SharedAPIKeyComponent (v5.9.0)** : Formulaire clé MapTiler réutilisable. Synchronisation auto via `state.subscribe('MK')`.
- **Network Monitor (v5.20)** : `src/modules/networkMonitor.ts` — détection réseau event-driven. Natif : `@capacitor/network`. Web : `navigator.onLine` + probe HEAD no-cors + Network Information API. `state.isNetworkAvailable` et `state.connectionType` — runtime-only. `IS_OFFLINE` auto-sync. Détection secondaire via échecs tuiles (3 consécutifs → offline). Permission Android : `ACCESS_NETWORK_STATE`.
- **Haptics** : `void haptic('medium')` — jamais await. Swipes et confirmations seulement, PAS sur les clics.
- **Glassmorphism** : Style unifié via `--glass-*` avec flou 20px et saturation optimisée.
- **Timeline FAB (v5.9.0)** : `body.timeline-open` masque `.fab-stack`. Ne pas utiliser le sélecteur CSS `~`.
- **DraggablePanel (v5.19.1)** : `src/modules/ui/draggablePanel.ts` — swipe bas = dismiss, hold 300ms = repositionnement libre, double-tap = reset. Guard `isActive` critique. Classe CSS `.panel-custom-pos`.
- **InclinometerWidget (v5.19.1)** : Tap = panel détail, drag = repositionner (hold 300ms), double-tap = reset. z-index 2100. i18n complet.
- **Coords-pill déplaçable (v5.19.1)** : `#coords-pill` utilise `attachDraggablePanel()`. Position reset à chaque nouveau clic carte.
- **Initialisation UI en deux phases (v5.21.1)** : `initUI()` hydrate d'abord les composants visibles au démarrage (Phase 1 synchrone), puis charge les 10 sheets via `_initSecondaryUI()` après le premier frame (Phase 2 async). Voir `AI_PERFORMANCE.md` — Lazy-loading des composants UI secondaires.
- **Système de thème clair/sombre (v5.22.0)** : `src/modules/theme.ts` — 3 options : `'light' | 'dark' | 'auto'`. `initTheme()` appelé depuis `ui.ts` après `loadSettings()`. `applyTheme(effective)` pose `data-theme="light"` sur `<html>` (absent en mode sombre → tokens `:root` par défaut). `getEffectiveTheme()` résout `'auto'` via `matchMedia('(prefers-color-scheme: dark)')`. Émet `themeChanged` sur l'EventBus. `state.themePreference` persisté dans `localStorage`. Sélecteur 3 boutons dans `SettingsSheet.ts`. Tokens sémantiques ajoutés : `--canvas-bg/text/stroke` (charts SVG/canvas), `--toast-bg/text`, `--overlay-bg`, `--shadow-sm/md/lg`, `--on-accent`, `--on-gold`. **Non themé intentionnellement** : scène Three.js (ciel/terrain/eau/végétation = simulation réaliste), boussole (N=rouge, convention universelle), marqueur GPS (bleu standard), POI (or signalisation), couleurs de danger pente/UV (sécurité).

---

## Sources Cartographiques LOD 6-10 (v5.15.0)

- **OpenTopoMap à LOD ≤ 10** : `getColorUrl()` utilise `{a|b|c}.tile.opentopomap.org` quand `zoom <= 10`. MapTiler n'est **pas** appelé. Rotation des 3 sous-domaines via `(tx+ty) % 3`.
- **`preloadChOverviewTiles()` désactivée** : le bulk pre-seeding viole la politique OSM/OpenTopoMap. Fonction conservée en no-op `@deprecated`. **Ne jamais réactiver**.
- **`nativeMax = 18` universel** : le cap `nativeMax = 15` pour OpenTopoMap a été supprimé. OpenTopoMap n'est utilisé qu'à LOD ≤ 10.

---

## Tuiles Embarquées — Overview PMTiles (v5.20)

Archive PMTiles pré-embarquée dans l'APK et la PWA (`public/tiles/europe-overview.pmtiles`, ~20 MB) :

- **LOD 5-7** : Europe entière (OpenTopoMap) — 914 tuiles
- **LOD 8-10** : Suisse (OpenTopoMap) — 202 tuiles
- **LOD 11** : Suisse (SwissTopo pixelkarte-farbe) — 532 tuiles

**Architecture** :

- Variable `embeddedPMTiles` séparée de `localPMTiles` (ne conflicte pas avec les uploads utilisateur)
- `initEmbeddedOverview()` appelé au démarrage dans `main.ts` (fire-and-forget)
- `EMBEDDED_MAX_ZOOM = 11` — l'archive n'est consultée que pour les LOD ≤ 11

**Priorité de résolution dans `fetchWithCache()`** :

1. `localPMTiles` (upload utilisateur) — priorité max
2. Cache API persistant (tuiles déjà téléchargées)
3. `embeddedPMTiles` (LOD ≤ 11) — fallback offline
4. Réseau (providers distants)

**Build** : `npm run build-overview` → `scripts/build-overview-tiles.ts` (sharp + pmtiles, one-shot).
Le fichier est exclu du précache Workbox (`globIgnores: ['**/*.pmtiles']`) et du git (`public/tiles/*.pmtiles`).

---

## Packs Pays — packManager (v5.21.0)

Archives PMTiles régionales (LOD 8-14) achetées via IAP et téléchargées en entier. Module : `src/modules/packManager.ts`.

**Initialisation** (`main.ts` → `packManager.initialize()`) :
1. `loadPersistedStates()` — recharge les PackState depuis `localStorage` clé `suntrail_pack_states`
2. `await fetchCatalog()` — GET `catalog.json` depuis R2 (**await obligatoire** : `mountAllInstalled()` dépend du catalog). Fallback : localStorage → `EMBEDDED_CATALOG` hardcodé (jamais null, même hors ligne)
3. `mountAllInstalled()` — ouvre chaque archive via `FileSource` (OPFS) ou CDN (purchased)

**Format PMTiles à deux niveaux** (critique) :
La lib pmtiles ne lit que les **16 384 premiers octets** au chargement (`getHeaderAndRoot`). Le répertoire root doit donc tenir dans cette fenêtre (~16 257 octets max). Pour ~35 000 tuiles, le répertoire naïf fait ~200 KB → truncation → erreur varint.
Solution : `buildTwoLevelDirectory(entries, leafSize=512)` dans `scripts/pmtiles-writer.ts` — le root contient uniquement des pointeurs (`runLength=0`) vers des leaf directories fetched à la demande via Range requests.

**Chaîne de résolution dans `fetchWithCache()`** (ordre décroissant de priorité) :
1. `localPMTiles` (upload utilisateur)
2. **`packManager.getTileFromPacks(z, x, y)`** ← insertion avant CacheStorage
3. CacheStorage (zones offline)
4. `embeddedPMTiles` (LOD ≤ 11, archive embarquée)
5. Réseau (providers distants)

**Gating LOD** : Le LOD 14 est le plafond technique pour tous les utilisateurs (Free et Pro). Les packs fournissent donc la résolution maximale sans restriction d'abonnement une fois achetés.

**Vérification region bounds** : chaque archive est associée à un `PackMeta.bounds`. La tuile est vérifiée par `isTileInBounds()` avant d'interroger l'archive PMTiles.

**Persistence** : `localStorage` clé `suntrail_pack_states` — JSON map `id → PackState { status, installedVersion, downloadProgress, filePath, sizeMB }`.

**EventBus** : `packStatusChanged` émis à chaque changement d'état (téléchargement, installation, erreur). `PacksSheet.ts` s'y abonne pour re-render.

---

## Moteur de Tuiles (`terrain.ts` / `tileLoader.ts`)

- **Sélection source par 4 coins (v5.14.1)** : `isTileFullyInRegion()` au lieu du centre. SwissTopo/IGN uniquement si tous les 4 coins sont dans le pays, sinon fallback MapTiler/OSM.
- **WebWorkers Pool** : 4 workers mobile / 8 desktop (`tileWorker.ts`) pour fetch et calcul Normal Maps.
- **Material Pooling (`materialPool.ts`)** : Réutilisation des shaders — évite les micro-saccades de compilation Three.js.
- **Gestion Mémoire (`memory.ts`)** : `disposeObject()` strict pour libérer la VRAM.
- **Offline-First & PMTiles** : PWA (Service Worker) + archive `.pmtiles` embarquée + fichiers `.pmtiles` utilisateur.
- **Données d'Élévation (v5.8.17)** : Tuiles Terrain-RGB capées au zoom 14 max. Le worker utilise `elevSourceZoom` pour calculer la taille des pixels des normal maps.

---

## Données & APIs

- **Hydrologie 3D (v5.8.4)** : Détection chromatique + vagues "Rouleaux Géants" sans couture (coordonnées mondiales absolues).
- **Bâtiments 3D (v5.8.5)** : API MapTiler Buildings (Vector Tiles) prioritaire + Overzooming au-delà du zoom 14 + fallback Overpass (OSM).
- **Sentiers (MVT)** : Tuiles vectorielles (MVT/PBF) pour netteté infinie et rendu stylisé.
- **Végétation Bio-Fidèle (v5.8.15)** : Essences par altitude réelle. Dithered Scan + Filtre de Forêt Continue + Déterminisme Absolu (pseudo-random par coordonnées mondiales).

---

## Stratégies Cartographiques

### Unification Globale (LOD ≤ 10)
Source unique (MapTiler Topo ou OSM) pour éviter l'effet "patchwork". SwissTopo/IGN uniquement au LOD 11+.

### Sécurité API & Fallback
- **Détection 403** : Détection dynamique des erreurs de clé MapTiler invalide.
- **Auto-Switch** : Basculement instantané vers OpenStreetMap Standard si MapTiler bloqué.

---

## Accessibilité & SEO (v5.16.7) — Lighthouse 100/100/100

- `aria-labelledby` sur tous les dialogs, `aria-label` sur tous les toggles/sliders/selects
- `:focus-visible` sur nav tabs, FABs, toggles, sliders
- Contraste WCAG AA : `--text-2` éclairci à `#a0a4bc` (ratio > 4.5:1)
- `<meta name="description">` + `robots.txt` + viewport `user-scalable=yes, maximum-scale=5.0`
- Touch targets : toggles 48×28px, slider thumbs 22px, compass FAB 52×52px, nav tabs padding augmenté
- Z-index : FAB stack 1900 (sous top bar 2000)
- 13 tests a11y via axe-core
