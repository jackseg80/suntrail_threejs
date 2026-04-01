# 📜 Journal des Modifications - SunTrail 3D

L'historique complet du développement, des prototypes initiaux à la plateforme professionnelle actuelle.

---

## [5.19.1] - 2026-04-01
### 🛠️ Bugfixes UX + Panels Déplaçables + Anti-Spam Overpass

**5 bugfixes utilisateur :**
- Météo : affiche "Ville, Pays" au lieu d'un numéro de rue (`extractLocationName`)
- Soleil/ombres mondial : utilise la position caméra réelle, pas TARGET_LAT/LON fixe Suisse
- UI minuscule après rotation : triple retry viewport reset (100/500/1000ms) + `visualViewport.resize`
- REC GPS : récupération des points après crash app (prompt restaurer/supprimer, seuils 10pts/20s)
- Inclinomètre interactif : tap pour détails (direction, danger), drag pour repositionner, double-tap reset

**Panels déplaçables :**
- Nouveau helper `draggablePanel.ts` — maintenir 300ms + glisser = repositionner librement
- Timeline, profil d'élévation et coords-pill tous repositionnables
- Guard `isActive` contre les pointermove parasites au survol
- Double-tap sur handle = reset position d'origine

**Anti-spam Overpass :**
- Backoff exponentiel global : 15s → 30s → 60s → 2min → 5min max
- `fetchOverpassData()` retourne null immédiatement pendant le backoff
- Queue vidée sur erreur, pas de retry infini
- `isOverpassInBackoff()` exporté — hydrologie skip le fetch si backoff actif

---

## [5.19.0] - 2026-04-01
### 🏔️ Caméra Terrain-Aware + Résilience API

**LOD terrain-aware :**
- LOD basé sur la hauteur au-dessus du sol (pas la distance 3D brute) — LOD 17-18 accessible sur les montagnes
- Target tracking per-frame : `controls.target.y` suit la surface du terrain (lerp adaptatif 0.08/0.03)
- Tilt caps resserrés LOD 15-18 + réduction dynamique jusqu'à 50% en haute altitude
- Range +1 tuile quand caméra inclinée pour couvrir le frustum étendu

**Fix flyTo montagne :**
- Séparation distance/durée (SearchSheet passait la durée comme distance → caméra trop basse)
- Parabole adaptative proportionnelle à l'élévation survolée
- Guard collision relevé à +200m

**Protection anti-spam API :**
- Backoff global 30-60s après 429 ou erreur CORS sur geocoding (MapTiler + OSM)
- Détection 429 sur les tuiles séparée du 403 (rate limit temporaire ≠ clé invalide)
- fetchWeather bloqué pendant l'interaction utilisateur

**Rotation de clés MapTiler :**
- Fetch d'un JSON distant (GitHub Gist) au démarrage avec tableau de clés
- Sélection aléatoire par session — répartition naturelle de la charge
- Fallback silencieux sur la clé bundlée si le Gist est inaccessible
- CSP mise à jour pour gist.githubusercontent.com

---

## [5.18.0] - 2026-04-01
### 🚀 UX Majeure — Recherche, Prix, Météo, Inclinomètre

**Prix dynamiques localisés (Issue 1) :**
- Supprimé les prix EUR hardcodés (`€3.99/€29.99/€99.99`) dans le HTML et les 4 locales
- Placeholder `—` affiché pendant le chargement RevenueCat → prix localisés (CHF, EUR, etc.)
- Sous-titre annuel dynamique avec prix mensuel équivalent dans la devise locale
- Cache prix avec TTL 5min (retry si 1er appel échoué, pas de spam réseau)

**Recherche refonte complète (Issue 3) :**
- Tab renommé "Sommets" → "Recherche" avec icône loupe (4 locales)
- Classification automatique des résultats par type (pays/région/ville/village/sommet/POI)
- Zoom adaptatif : pays → LOD 6, région → LOD 8, ville → LOD 11, sommet → LOD 14
- Filtres chips (Tout / Villes / Montagnes / Pays)
- Module montagnes dédié : recherche Overpass `natural=peak` par nom (filtre Montagnes)
- Sous-titre type localisé sur chaque résultat, icônes adaptées par catégorie

**Ground plane anti-blanc montagne (Issue 10) :**
- Plan sombre (500k×500k) à y=-200 sous le terrain, `MeshBasicMaterial` avec fog
- Masque le vide blanc visible au tilt max en LOD 14+ sur les montagnes
- Optimisé : `depthWrite:false`, pas de shadow, frustum culled, suivi origin shift

**Météo avec nom de lieu (Issue 5) :**
- Affichage du `locationName` (reverse geocoding) en header du panneau météo
- Visible en version free et pro

**Inclinomètre toggle + clarté (Issue 9) :**
- Nouveau toggle `SHOW_INCLINOMETER` dans Réglages (persisté en localStorage)
- Label explicatif "pente au centre" dans le widget
- 4 locales mises à jour

**Boussole temps réel (Issue 8) :**
- `renderCompass()` déplacé avant les return guards du render loop (throttle propre 30fps)
- Animation reset-to-North : `state.isInteractingWithUI` force le rendu pendant l'animation

**Redirect Play Store sur web (Issue 6) :**
- Sur `!Capacitor.isNativePlatform()` : boutons d'achat remplacés par lien Play Store
- Liste des features Pro conservée, 4 locales

**UX diverse :**
- Tous les sheets se ferment au clic sur la carte (pas seulement layers)
- MESSAGES_TESTEURS.md : ajout note "monde entier disponible"
- Soleil/ombres : confirmé fonctionnel dans le monde entier (SunCalc + coords réelles)

---

## [5.17.0] - 2026-04-01
### 🔧 Audit Dette Technique + Optimisations Performance

**Dette technique — Nettoyage (Phase 1) :**
- Supprimé `three-stdlib` (jamais importé, +500ko inutile)
- Déplacé `@capacitor/cli` en devDependencies
- Supprimé `@types/mapbox__vector-tile` et `@types/pbf` (types inclus dans les packages)
- Supprimé tests GPX dupliqués dans `terrain.test.ts` (couverture conservée dans `gpxLayers.test.ts`)
- Corrigé mock réimplémenté dans `weatherPro.test.ts` (utilise la vraie `getWeatherIcon`)
- Supprimé mock inutile de Three.js dans `solarAnalysis.test.ts`
- Supprimé code mort : `preloadChOverviewTiles()` (no-op), `downloadOfflineZone()` (jamais appelée), `getUVColor()`/`getComfortLabel()` (jamais importées)

**i18n UpgradeSheet (Phase 2) :**
- 24 clés i18n ajoutées dans les 4 locales (fr/en/de/it) pour le paywall Pro
- 19 éléments du template `index.html` annotés avec `data-i18n`
- 4 `showToast()` hardcodés français remplacés par `i18n.t()`
- Nouveau test : `upgradeSheet.i18n.test.ts` (96 assertions, 4 locales × 24 clés)

**Performance — Shadow camera dynamique (Phase 3, +15-25 fps) :**
- Shadow frustum adapté au `RANGE × tileSizeMeters` du preset actuel
- Balanced LOD 14 : 7.7km (vs 100km avant = 13× meilleure résolution shadow)
- Clampé 2000m–30000m, guard 500m évite les recalculs par frame

**Performance — Index spatial O(1) (Phase 4, +10-20 fps) :**
- Nouveau module `tileSpatialIndex.ts` : grid hash pour lookup tuiles O(1)
- Guard pour tuiles basses résolutions (LOD 6-10) : bucket `largeTiles` séparé évitant l'explosion de grid
- `getAltitudeAt()` utilise l'index spatial + fallback scan complet

**Performance — Shader eau early-exit (Phase 5A, +5-10 fps) :**
- 2 tests bon marché (`blueVsRed > 0.02 && vTrueNormal.y > 0.998`) éliminent 99%+ des fragments
- smoothstep complet préservé dans `isWater` pour un dégradé doux aux bords

**Performance — Memory leaks (Phase 5C+D) :**
- `disposeWeatherSystem()` : libère geometry, material, points GPU
- `boundedCacheSet()` : caches buildings/hydrology/poi limités à 200 entrées (FIFO)

**Performance — Ray marching adaptatif (Phase 5E) :**
- `findTerrainIntersection()` : step adaptatif (500m en altitude, 100m proche du terrain)
- Réduit le nombre d'itérations de ~5000 à ~500 en moyenne

---

## [5.16.8] - 2026-03-31
### 🐛 Corrections & Améliorations UX

**Détection GPU :**
- Adreno 730 (Snapdragon 8 Gen 1) reclassé de `balanced` → `performance` — flagship, pas mid-range
- Info GPU/CPU/preset détecté affichée dans Réglages > Avancés pour diagnostic

**Monétisation :**
- Prix Upgrade : suppression duplication `/mois` dans `getPrices()` + overflow CSS sur `.upgrade-plan-price`
- REC stop upsell : fix overflow texte sur petits écrans (`min-width:0; overflow-wrap:break-word`)

**Mode Eco :**
- Bouton 2D/3D et toggle timeline masqués en preset eco (`body.preset-eco`) — inutiles en 2D permanent

**Orientation mobile :**
- Handler `orientationchange` + reset viewport meta après rotation paysage→portrait (fix UI minuscule)

**Animation tilt 2D↔3D :**
- Nouvelle animation douce lors du toggle 2D/3D : lerp vers 85% du tiltCap avec bande étroite OrbitControls
- Flag `state.isTiltTransitioning` — exempté du idle throttle, standalone dans `needsUpdate`
- `rebuildActiveTiles()` décalé de 150ms pour éviter le blocage de l'animation

**Profil d'élévation :**
- Tiroir swipe-to-dismiss (même pattern que Timeline) — drag handle, velocity-based dismiss
- Repositionné juste au-dessus du menu nav (`bottom: var(--bar-h) + 8px`)
- Transition CSS `transform` au lieu de `display:none/block`

---

## [5.16.7] - 2026-03-31
### ♿ Audit Lighthouse 100/100/100 — Accessibilité, SEO & UI

**Accessibilité (80→100) :**
- `aria-labelledby` sur le dialog onboarding + `id="ob-title"` sur le heading
- `aria-label` sur tous les toggles (6), sliders (8) et le select langue
- Aria-label dynamique sur `#top-pill-main` (reflète contenu visible : LOD + météo)
- `:focus-visible` CSS sur nav tabs, FABs, toggles, sliders
- Contraste WCAG AA : `--text-2` éclairci `#8b8fa8` → `#a0a4bc` (ratio > 4.5:1)
- Disabled state opacity `0.3` → `0.5` (plus visible)
- Contraste bouton onboarding : fond `#4a8ef8` → `#3b7de0`

**SEO (82→100) :**
- `<meta name="description">` ajoutée
- `public/robots.txt` créé
- Viewport : `user-scalable=yes, maximum-scale=5.0` (zoom WCAG)

**UI Touch Targets :**
- Toggles `44×26` → `48×28px`, thumb `20` → `22px`
- Sliders thumb `18` → `22px`, track `4` → `6px`
- Compass FAB `48` → `52px` (uniformisé avec les autres FABs)
- Nav tabs padding augmenté (`8/4` → `10/6px`) pour touch target 48px+
- Sheet drag handle `4` → `6px`
- Z-index FAB stack `2100` → `1900` (sous le top bar)
- FAB `:active` transition 80ms (feedback tactile)

**Tests :** +6 tests a11y (onboarding dialog, settings form controls) → 13 total

## [5.16.6] - 2026-03-31
### 💰 Fix prix lifetime
- Fallback prix lifetime `49.99` → `99.99` dans `iapService.ts`

## [5.16.5] - 2026-03-31
### ⚙️ Stats de performance — power user
- `SHOW_STATS` désactivé par défaut (activé manuellement dans Paramètres Avancés)
- Section performance optionnelle dans les protocoles de test
- Google Form script corrigé (`addScaleItem`, `addTextItem`)

## [5.16.4] - 2026-03-31
### 🏢 Bâtiments 3D — Feature Pro + Rationalisation UI

#### Bâtiments 3D réservés aux utilisateurs Pro
- **`buildings.ts`** : gate Pro ajouté — `if (!state.isPro || !state.SHOW_BUILDINGS...)` — les bâtiments ne se chargent que pour les utilisateurs Pro
- **`SettingsSheet.ts`** : 
  - Toggle "Bâtiments OSM" désactivé (`disabled`) et décoché pour les utilisateurs gratuits
  - Badge "PRO" doré ajouté à côté du label
  - Clic sur le toggle en mode gratuit → `showUpgradePrompt('buildings_3d')`
  - Restauration automatique de l'état sauvegardé quand on passe Pro
- **`style.css`** : styles pour toggles désactivés (opacité 0.4, curseur not-allowed)

#### Marketing Pro mis à jour
- **`index.html` (UpgradeSheet)** : nouvelle ligne "🏢 Bâtiments 3D — architecture réaliste sur le terrain (gratuit = 2D seul)"
- **`docs/MESSAGES_TESTEURS.md`** : bâtiments 3D ajouté à la liste des features Pro dans l'email de recrutement
- **`README.md`** : tableau comparatif mis à jour — Gratuit: "Vue 2D" / Pro: "Bâtiments 3D réalistes"

#### Rationalisation UI — Suppression des doublons
- **`SettingsSheet`** : suppression des boutons dupliqués (Télécharger Zone, Vider Cache, PMTiles, clé API)
- **`ConnectivitySheet`** : conservation unique des fonctionnalités de gestion de données
- **`index.html`** : nettoyage du template settings

#### Bouton 2D/3D amélioré
- Déplacé en bas de la stack FAB (à droite)
- Label dynamique "2D" / "3D" sous l'icône (9px)
- Styles CSS pour état actif/inactif

---

## [5.16.3] - 2026-03-31
### 🐛 Bande vide LOD 11+ — root cause : bbox France trop large

#### Root cause identifiée et corrigée
La bande de tuiles transparentes (fond HTML visible) était causée par `isPositionInFrance()` dans `utils.ts` qui utilisait `lon < 9.6°E` comme limite est. Or la vraie frontière de la France continentale est à **~8.23°E** (Lauterbourg, Alsace, frontière du Rhin). Les tuiles dans le Baden-Württemberg, la Forêt Noire et la zone Schaffhausen-Nord (lon 8.23–9.6°E) passaient donc `isTileFullyInRegion(France) = TRUE` → **IGN était appelé pour des tuiles en Allemagne** → IGN retourne `404 "No data found"` → `fetchTile` retourne null → canvas transparent → le HTML de la page était visible à travers les tuiles.

**`utils.ts` — `isPositionInFrance()`** :
- Limite est : `lon < 9.6` → `lon < 8.3` (France continentale)
- Ajout d'un cas séparé pour la **Corse** : `lat > 41.0 && lat < 43.1 && lon > 8.4 && lon < 9.7` — la Corse s'étend jusqu'à ~9.56°E, l'ancienne limite couvrait aussi la Sardaigne/nord Italie par erreur

**`tileWorker.ts`** : cache vidé `v1 → v2` — force le rechargement des tuiles dont les 404 IGN étaient mis en cache navigateur (`cache-control: max-age=1814400` = 21 jours) pour les URL désormais inutilisées.

**`terrain.ts` (v5.16.2)** : fallback opaque pour `colorBitmap` null — empêche les trous transparents si une source retourne une erreur inattendue à l'avenir.

---

## [5.16.2] - 2026-03-31
### 🐛 Bords du monde + bande vide LOD 11+ (Schaffhausen/Tessin)

#### Fix bords du monde vides — clamping géographique caméra
- **`geo.ts`** : constantes `WORLD_BOUNDS` (lat ±85.051°, lon ±180°) + fonction `clampTargetToBounds(worldX, worldZ, originTile)` — convertit en lat/lon, clampe, reconvertit en world.
- **`touchControls.ts`** : appel de `clampTargetToBounds()` à la fin de `doPan()` — couvre tout le pan tactile (1 doigt + 2 doigts).
- **`scene.ts`** : appel dans `throttledUpdate` — couvre le pan souris via OrbitControls. Les deux points d'entrée (touch + mouse) sont couverts. Résultat : impossible de panner au-delà des tuiles valides du système Web Mercator.

#### Fix bande vide LOD 11+ hors-Suisse/France (Schaffhausen, Tessin)
- **Cause** : les tuiles hors-CH et hors-FR (Allemagne, Italie, Autriche...) n'étant pas couvertes par SwissTopo/IGN, elles utilisaient OSM Standard comme fallback. OSM Standard a un style radicalement différent (fond blanc, routes grises) — perçu comme une bande "vide" visuellement incohérente.
- **`tileLoader.ts` — `getColorUrl()`** : pour `MAP_SOURCE=swisstopo` et la branche par défaut, le fallback OSM Standard est remplacé par **OpenTopoMap** (zoom ≤ 17) — style topo cohérent avec SwissTopo. Zoom 18 (Pro uniquement) : OSM Standard conservé car OpenTopoMap ne monte pas à zoom 18.
- **Note** : si MapTiler est disponible (`hasKey=true`), il prend la priorité (topo-v2 → style optimal). OpenTopoMap n'intervient qu'en l'absence de clé MapTiler valide.

---

## [5.16.1] - 2026-03-31
### 🧪 ID Testeur + Protocoles de test

#### ID Testeur dans les Réglages
- **`iapService.ts`** : nouvelle méthode `getAppUserID()` — retourne l'anonymous ID RevenueCat (`$RCAnonymousID:...`) via `Purchases.getAppUserID()`. Retourne `''` sur web/non-natif.
- **`SettingsSheet.ts`** : section "ID Testeur" ajoutée dans Réglages → Avancés (avant le bouton Aide). Affiche l'ID tronqué avec bouton "Copier" → presse-papier. Permet aux testeurs de transmettre leur ID pour recevoir leur récompense Pro après le passage en Production.

#### Protocoles de test testeurs
- **`docs/PROTOCOL_TEST_RAPIDE.md`** : protocole 20-30 min couvrant l'essentiel (navigation, FAB, timeline, SOS, achat). Récompense : 3 mois Pro.
- **`docs/PROTOCOL_TEST_COMPLET.md`** : protocole 1h30-2h couvrant toutes les fonctionnalités (presets, GPX, mode testeur Pro, performance, langues, rapport structuré). Récompense : 1 an Pro.
- Les deux protocoles incluent la procédure de récupération de récompense via l'ID Testeur.

---

## [5.16.0] - 2026-03-31
### 🎓 Tutoriel d'onboarding 1er démarrage

#### Tutoriel interactif 6 slides
- **`src/modules/onboardingTutorial.ts`** : nouveau module standalone calqué sur le pattern `acceptanceWall.ts`. Deux exports : `requestOnboarding()` (vérifie le flag `suntrail_onboarding_v1`, affiche une seule fois) et `showOnboarding()` (toujours afficher, pour le bouton Réglages).
- **6 slides passives** avec navigation Suivant / Passer / Commencer :
  1. 🏔️ **Naviguer** — 1 doigt pour déplacer, pinch zoom, 2 doigts rotation
  2. ✋ **Incliner** — 2 doigts côte à côte (horizontal) + glisser haut/bas pour la caméra
  3. 🎛️ **Boutons de contrôle** — grille 2×2 : Boussole (Nord), Couches (carte), 2D/3D (relief), GPS (position)
  4. 🗂️ **Importer un tracé GPX** — fichier depuis vos randonnées, affiché en 3D sur le terrain
  5. ☀️ **Simuler le soleil** — timeline 24h pour l'ensoleillement
  6. 🆘 **Rester en sécurité** — bouton SOS haut-droite, position exacte pour les secours
- **Navigation** : swipe horizontal (> 50px), flèches clavier, Escape pour fermer.
- **Animation** : transition `translateX ±40px` + `opacity` en 220ms ease-in-out entre les slides. Fade-out overlay 300ms à la fermeture.
- **Dots de progression** : 6 indicateurs, dot actif `var(--accent)`, transition couleur 220ms.
- **Design** : glassmorphism identique à l'acceptance wall, `z-index: 9000`, centré plein écran.
- **Accessibilité** : `role="dialog"`, `aria-modal`, focus sur "Suivant" à l'ouverture, trap Tab, Escape pour fermer.

#### Intégration
- **`ui.ts`** : `void requestAcceptance().then(() => requestOnboarding())` — le tuto s'affiche automatiquement après l'acceptance wall au 1er lancement.
- **`SettingsSheet.ts`** : méthode `createTutorialButton()` — bouton "❓ Aide & Tutoriel" ajouté en bas de la page Réglages → appelle `showOnboarding()` (sans vérification du flag).

#### i18n — 4 locales
- Nouvelles clés `onboarding.*` (6 slides × title+desc, skip/next/start, grille FAB) dans `fr.json`, `de.json`, `it.json`, `en.json`.
- Nouvelle clé `settings.tutorial.btn` dans les 4 locales.

> **Pour tester** : `localStorage.removeItem('suntrail_onboarding_v1')` dans la console puis recharger.

---

## [5.15.0] - 2026-03-30
### 🐛 Bugfixes majeurs · Refonte sources cartographiques · UX

#### Fix altitude affichée en double (lié à l'exagération du relief)
- **`ui.ts`** : `getAltitudeAt()` retourne l'altitude **multipliée** par `RELIEF_EXAGGERATION` (usage correct pour positionner les objets 3D sur le terrain). Mais l'affichage texte du `#coords-pill` utilisait cette valeur brute → altitude × 2 par défaut (exagération 2.0x). Fix : division par `state.RELIEF_EXAGGERATION` au moment du rendu texte uniquement (`${Math.round(alt / state.RELIEF_EXAGGERATION)} m`). L'`InclinometerWidget` et `profile.ts` étaient déjà corrects.

#### Fix toast "Accès Pro activé" affiché 3 fois
- **`UpgradeSheet.ts` ligne 40** : suppression du `showToast('✅ Accès Pro activé !')` doublon — `grantProAccess()` dans `iap.ts` est la seule source de vérité pour ce toast.
- **`iapService.ts` ligne 50** : guard `if (!state.isPro)` dans `addCustomerInfoUpdateListener` — le listener ne re-déclenche pas `grantProAccess()` si le statut Pro a déjà été accordé par `purchase()`.

#### Fix prix test Google Play "3.99€ for 5 minutes"
- **`iapService.ts`** : `getPrices()` sanitise le `priceString` retourné par RevenueCat avec un regex (`/\s*(for|per|pour|...)\s*\d+\s*(minutes?|min\.?)/gi`) qui supprime le suffixe de période de test Google Play. En production, le prix s'affiche normalement. En Closed Testing, les abonnements ont des périodes raccourcies (1 mois → 5 min) — comportement **intentionnel** de Google Play, pas un bug.

#### Refonte sources cartographiques LOD 6-10 : OpenTopoMap remplace MapTiler
- **`tileLoader.ts` — `getColorUrl()`** : à `zoom <= 10`, on utilisait `api.maptiler.com/maps/topo-v2/` (coût quota, risque de 429 global). Remplacé par `{a|b|c}.tile.opentopomap.org` (CC-BY-SA, 3 sous-domaines en rotation via `(tx+ty) % 3`). Qualité visuelle identique à cette échelle, zéro coût MapTiler.
- **`preloadChOverviewTiles()`** : **désactivée** — le bulk pre-seeding de ~300-400 tuiles Suisse LOD 6-9 viole la politique OSM/OpenTopoMap ("Pre-seeding large areas in advance is prohibited"). Fonction conservée en no-op documenté avec `@deprecated`. Le cache PWA Service Worker couvre les besoins offline.
- **`loadTileData()` — `nativeMax`** : le cap artificiel à zoom 15 pour `MAP_SOURCE === 'opentopomap'` est supprimé. OpenTopoMap n'est plus utilisé à LOD > 10 (swisstopo/IGN/MapTiler sont exclusifs à ces zooms) → `nativeMax = 18` universel.

#### Fix range tuiles LOD 17-18 trop restrictif pour High/Ultra
- **`terrain.ts` ligne 662** : formule de réduction du range à LOD ≥ 17 : diviseur `1.5 → 1.2`, plancher `3 → 4`. Résultat : preset performance LOD 17-18 passe de 3 à **4 tuiles** de portée, ultra de 8 à **10 tuiles**.

#### UX : bouton 2D/3D déplacé vers la FAB stack
- **`index.html`** : le bouton `#nav-2d-toggle` (anciennement 1er onglet de la nav-bar) est maintenant dans la `.fab-stack` (côté droit, entre Couches et GPS). Logique : action de vue plutôt que de navigation entre sections.
- **`NavigationBar.ts`** : `this.element.querySelector('#nav-2d-toggle')` → `document.querySelector('#nav-2d-toggle')` (bouton hors template nav-bar).
- **`style.css`** : règle `#nav-2d-toggle.active` pour l'état 2D actif (fond accent, glow) dans la FAB stack. Règle `#nav-2d-toggle:disabled` conservée (LOD ≤ 10 lock).

#### UX : icône SOS clarifiée
- **`index.html`** : l'icône `⚠️` (cercle + point d'exclamation) remplacée par `🆘` — cohérent avec l'emoji déjà utilisé dans le template `#template-sos`.

#### Fix : inclinomètre masqué par la nav bar sur certains appareils
- **`InclinometerWidget.ts`** : `bottom: 80px` (inline style hardcodé) → `bottom: calc(var(--bar-h) + var(--safe-bottom) + 16px)`. Sur les appareils avec navigation gestuelle (`--safe-bottom` > 8px), la nav bar totale dépasse 80px et écrasait le widget. Les variables CSS custom fonctionnent dans les inline styles (résolution au rendu).

---

## [5.14.1] - 2026-03-30
### 🔧 Corrections UI, IAP et cartographie frontière

#### Sliders météo déplacés vers Réglages Avancés
- **`index.html`** : sliders Intensité et Vitesse des effets météo retirés du panneau `#template-weather` et ajoutés dans `#template-settings` (sous le toggle "Météo"), avec le même style que les autres sliders avancés.
- **`SettingsSheet.ts`** : `bindSlider` pour `WEATHER_DENSITY` et `WEATHER_SPEED` migrés ici. Abonnements state et `updateAllUI` complétés.
- **`ExpertSheets.ts`** : `WeatherSheet` nettoyée — méthodes `bindSlider`/`updateSlider` et import `saveSettings` supprimés. Boutons ☀️🌧️❄️ de simulation manuelle supprimés (artefacts de test, incohérents avec le bulletin météo réel).

#### Fix bouton achat annuel non fonctionnel
- **`iapService.ts`** : `purchase('yearly')` échouait silencieusement car RevenueCat retourne `packageType = "ANNUAL"` (pas `"YEARLY"`) et l'identifier `suntrail_pro_annual` ne contient pas `"yearly"`. Fix : normalisation `yearly → annual` avant le `find()`. Log de diagnostic ajouté en cas d'échec (liste les packages disponibles).

#### Fix tuiles noires à la frontière Suisse/Allemagne (LOD 11+)
- **`tileLoader.ts`** : `getColorUrl()` et `getOverlayUrl()` utilisaient le centre de la tuile pour décider de la source (SwissTopo/IGN). À LOD 11, une tuile centrée en Suisse peut s'étendre en Allemagne → SwissTopo retournait ses tuiles avec zone noire hors couverture + watermark légal visible.
- **Fix** : nouvelle fonction `isTileFullyInRegion()` qui vérifie les **4 coins** de la tuile. SwissTopo et IGN ne sont utilisés que si la tuile est entièrement dans le pays. Sinon fallback MapTiler topo-v2 ou OSM. Appliqué à `getColorUrl` ET `getOverlayUrl`. `getTileCenter()` supprimée (devenue inutile).

---

## [5.14.0] - 2026-03-30
### ⚡ AbortController tuiles + indicateur de chargement

#### AbortController — annulation des fetches HTTP au dispose de tuile
- **`tileWorker.ts`** : `activeControllers: Map<number, AbortController>` — chaque task a son propre controller. Message `{ type:'cancel', id }` → `controller.abort()` → fetch HTTP annulé immédiatement dans le worker. `fetchTile()` accepte un `AbortSignal` optionnel passé à `fetch()`. `AbortError` propagé proprement et ignoré dans le handler.
- **`workerManager.ts`** : `taskWorkerMap: Map<number, Worker>` — trace quel worker gère quelle task. `loadTile()` retourne `{ promise, taskId }` au lieu de `Promise<any>`. Nouvelle méthode `cancelTile(id)` : résout la Promise avec `null` ET envoie le message cancel au bon worker.
- **`tileLoader.ts`** : `loadTileData()` retourne `{ promise, taskId }`. Nouvelle export `cancelTileLoad(taskId)` (délègue à `tileWorkerManager.cancelTile()`).
- **`terrain.ts`** — `Tile.activeTaskId` : stocké au début du `load()`, effacé à la fin. `dispose()` appelle `cancelTileLoad(activeTaskId)` si la tuile est encore en chargement.
- **Impact** : au changement de LOD, les 15-25 fetches de l'ancien LOD sont annulés instantanément → bande passante libérée pour les nouvelles tuiles → chargement 2-3× plus rapide sur connexion mobile.

#### Indicateur de chargement tuiles réseau
- **`index.html`** : `<div id="tile-loading-bar" aria-hidden="true">` — barre fine 3px en haut de l'écran.
- **`style.css`** : animation shimmer (dégradé coulissant `--accent`) — `opacity:0` par défaut, `opacity:1` quand `.visible`. Transition douce 0.25s.
- **`ui.ts`** : abonnement permanent à `state.isProcessingTiles` avec debounce 600ms (ignore les hits cache < 0.3s). Apparaît seulement lors des vrais chargements réseau. Se masque immédiatement quand le chargement se termine.

---

## [5.13.9] - 2026-03-30
### ⚡ Transitions LOD fluides : ghost tiles, prefetch idle, adaptive batch

#### Ghost tiles — fin du flash blanc lors des changements de zoom
- **`terrain.ts` — `Tile.startFadeOut()`** : nouvelle méthode. Au changement de LOD, les anciennes tuiles ne sont plus disposées immédiatement mais passent dans `fadingOutTiles` (Set séparé). Elles restent visibles dans la scène avec un fondu sortant sur 1.2s (`GHOST_FADE_MS`).
- **`Tile.updateFadeOut(deltaMs)`** : décrémente `ghostFadeRemaining`, met à jour l'opacité. Quand `ghostFadeRemaining ≤ 0`, signal pour `animateTiles()` de disposer.
- **`animateTiles()`** : itère `fadingOutTiles`, appelle `updateFadeOut()`, et dispose les tiles finies en libérant la clé de cache GPU.
- **`updateWorldPosition()`** : préserve l'offset Y (-0.5m) des ghost tiles pendant leur reposition (anti-z-fighting). Réappliqué dans `repositionAllTiles()`.
- **`resetTerrain()`** : vide `fadingOutTiles` proprement avant reset complet.
- **Résultat** : aucun flash blanc sur zoom in/out — l'ancien LOD s'efface progressivement pendant que le nouveau apparaît.

#### Prefetch LOD±1 en idle — tuiles déjà en cache à la prochaine transition
- **`terrain.ts` — `prefetchAdjacentLODs()`** (nouvelle export) : précharge LOD+1 (`RANGE/2` autour du centre) et LOD-1 (5×5 central) si absents du cache. Max 20 tuiles par appel. Ajoutées au `loadQueue` avec priorité basse (non-visibles → traitées en dernier).
- **`scene.ts`** : déclenché depuis le render loop quand `isIdleMode && !isProcessingTiles`, toutes les 5 secondes. `lastPrefetchTime` évite le spam.
- **Résultat** : lors de la prochaine transition, les tuiles sont servies depuis le cache GPU (quasi-instantané) au lieu du réseau.

#### Adaptive batch size — plus de parallélisme en transition
- **`processLoadQueue()`** : si ≥ 4 tuiles visibles sont encore en attente (`isTransitioning`), le batch est doublé (`MAX_BUILDS_PER_CYCLE × 2`). Absorbe le backlog d'une transition LOD 2× plus vite.

---

## [5.13.8] - 2026-03-30
### 🐛 Deux corrections critiques + SMS SOS + conformité Play Store

#### Fix : GPS ne sélectionnait plus automatiquement SwissTopo
- **`ui.ts`** : `state.hasManualSource = true` était posé inconditionnellement lors du chargement des settings sauvegardés (localStorage). Résultat : `autoSelectMapSource()` était bloquée en permanence pour tout utilisateur ayant déjà ouvert l'app — la source ne s'adaptait plus jamais à la position.
- **Fix** : `hasManualSource` inféré depuis le MAP_SOURCE sauvegardé — `true` seulement pour les sources manuelles (`satellite`, `ign`, `osm`). Pour `swisstopo` et `opentopomap` (auto-sélectionnables), `hasManualSource = false`. L'auto-switch GPS → SwissTopo fonctionne de nouveau.

#### Fix : Panel SOS bloqué sur "Localisation en cours..."
- **`ExpertSheets.ts`** : `openSOSModal()` n'était câblé qu'au `#sos-btn-pill` (widget coordonnées). Le bouton principal `TopStatusBar` (`#sos-main-btn`) appelait `sheetManager.toggle('sos')` → template affiché, résolution GPS jamais déclenchée → texte statique à jamais.
- **Fix** : Pattern EventBus — `SOSSheet` écoute `sheetOpened { id: 'sos' }` et appelle `resolveAndDisplay()` quel que soit le point d'entrée. Méthode `openSOSModal()` remplacée par `resolveAndDisplay()` (sans `sheetManager.open()`).

#### Feat : Bouton SMS dans le panel SOS
- **`index.html`** : Layout SOS restructuré — bouton "📱 Envoyer par SMS" (vert, `#sos-sms-btn`) + "Copier" sur la même ligne, "Fermer" pleine largeur en dessous. Bouton SMS initialement `disabled`.
- **`ExpertSheets.ts`** : `resolveAndDisplay()` active le bouton SMS après résolution des coords avec `onclick = window.open('sms:?body=...')`. URI scheme `sms:?body=` — ouvre l'app SMS native Android/iOS avec le message pré-rempli. Zéro permission, zéro plugin.
- **i18n** : Clé `sos.sms` ajoutée en FR/EN/DE/IT.

#### Conformité Play Store (v5.13.7)
- **`docs/STORE_LISTING.md`** : Descriptions FR/EN enrichies avec section `⚠️ APPLICATION INDÉPENDANTE` — disclaimer entité gouvernementale + URLs officielles `swisstopo.admin.ch` et `geoportail.gouv.fr`.
- **`index.html`** : Section "Sources de données & Légal" dans Réglages — liens cliquables vers les 4 sources officielles avec disclaimer visible.
- **i18n** : Clés `settings.section.sources` + `settings.legal.*` en FR/EN/DE/IT.

---

## [5.13.6] - 2026-03-30
### 🌡️ Station Météo Pro + nettoyage Expert Panel

#### Station Météo Avancée (version Pro)

- **`weather.ts`** : Fetch Open-Meteo enrichi avec `daily=temperature_2m_max/min,precipitation_sum,precipitation_probability_max,wind_speed/gusts_10m_max,wind_direction_10m_dominant,uv_index_max,weather_code&timezone=auto`. `windDirDeg` (direction vent courant) et `precip` (probabilité horaire) ajoutés à `weatherData`. `daily[]` complet parsé.
- **`state.ts`** : Interface `weatherData` étendue — `windDirDeg?`, `precip?` dans `hourly`, `daily[]` (7 jours).
- **`weatherUtils.ts`** (nouveau) : Module de helpers exportés — `getUVCategory`, `getUVColor`, `getComfortIndex`, `getComfortLabel`, `getFreezingAlert`, `fmtWindDir`.
- **`ExpertSheets.ts` — WeatherSheet** entièrement reprise :
  - **Gratuit** : 4 stats + scroll 12h + banner upsell *"🌡️ Prévisions 3 jours + alertes montagne avec Pro"*
  - **Pro — 5 blocs** :
    1. Conditions actuelles complètes (grille 3 colonnes) — temp/ressenti/humidité, point de rosée/UV coloré ANSES/couverture nuageuse, vent+flèche SVG direction/rafales/visibilité, isotherme 0°C/précip%
    2. Scroll 24h enrichi avec probabilité de précipitations % par heure
    3. Graphique SVG température 24h — courbe polyline jaune, barres précipitations en fond, ligne isotherme 0°C, labels min/max
    4. Prévisions 3 jours — cartes date/icône/max-min/précip mm/UV coloré/vent max
    5. Alerte Montagne — isotherme 0°C vs altitude clic (message dynamique) + Indice Confort Rando (composite temp+vent+UV)
  - Rapport copiable enrichi avec toutes les données Pro
  - `state.subscribe('isPro')` → re-render automatique
- **`index.html`** : Ajout ligne *"🌡️ Station météo avancée — 3 jours, alertes montagne"* dans UpgradeSheet.
- **CSS** : 9 nouvelles classes — `.weather-upsell-banner/btn`, `.weather-daily-*`, `.weather-mountain-alert`, `.weather-comfort-score`, `.weather-svg-chart`.
- **i18n** : Nouvelles clés `weather.upsell`, `weather.section.*`, `weather.stat.*`, `weather.uv.*`, `weather.mountain.*`, `weather.daily.*` en FR/EN/DE/IT.
- **Tests** : `src/test/weatherPro.test.ts` — 33 tests verts (getWeatherIcon, getUVCategory, getComfortIndex, getFreezingAlert, parseDaily, hourly enrichi, fmtWindDir, graceful null).

#### Nettoyage panneau Expert (remplacé par version Pro)

- **`ExpertSheets.ts`** : Suppression de `expertPanel` (propriété, création dynamique, listener `openExpert`, bloc de remplissage avec location/gusts/visibility/etc.).
- **`index.html`** : Bouton `#open-expert-weather` supprimé du template-weather.
- **`style.css`** : `.exp-expert-panel` et `.exp-expert-title` supprimés (dead CSS).

---

## [5.13.5] - 2026-03-30
### 🐛 Fixes layout mobile + release Closed Testing

- **`style.css`** : `.solar-upsell-btn` — `width: auto; margin-top: 0` pour override `.btn-go` (`width:100%; margin-top:32px` causaient débordement hors écran sur mobile).
- **`index.html` — UpgradeSheet plans** : `.upgrade-plans` avec `align-items:stretch` + marge compensant le badge (+10px). `.upgrade-plan` : `flex:1 1 0; min-width:0; box-sizing:border-box; padding:12px 4px` — 3 boutons égaux même avec `€99.99`.
- **`build.gradle`** : versionCode 524→525, versionName 5.13.5.

---

## [5.13.4] - 2026-03-30
### 💳 UpgradeSheet 3 plans + fixes toast

#### UpgradeSheet — 3 plans tarifaires
- **`index.html`** : Remplacement du bloc prix unique par un sélecteur 3 plans inline — mensuel (€2.99/mois), annuel ⭐ mis en avant avec badge (€19.99/an · €1.67/mois), lifetime (€99.99 paiement unique). CSS inline dans le template : `.upgrade-plans`, `.upgrade-plan`, `.upgrade-plan-best`, `.upgrade-plan-badge`, `.upgrade-plan-price`, `.upgrade-plan-sub`.
- **`UpgradeSheet.ts`** : Loading state (`btn-loading`) + toast de confirmation ajoutés sur les boutons monthly et lifetime. `loadPrices()` ne vide plus le HTML du bouton annuel — les prix sont mis à jour via les spans dédiés `#upgrade-yearly/monthly/lifetime-price`.
- **`iapService.ts`** : Prix fallback lifetime corrigé : €49.99 → €99.99.

#### Fix toast durée ignorée
- **`style.css`** : L'animation CSS `.toast` (`toast-out delay:1.2s + duration:0.3s`) forçait la disparition à 1.5s peu importe la durée passée à `showToast()`. Fix : suppression de l'animation CSS. Le JS gère entièrement le timing via `opacity + transition + setTimeout(duration)`. Tous les toasts respectent maintenant leur durée (`showToast(msg, 10000)` → 10s).
- **`scene.ts`** : Toast LOD upsell passé à 10 secondes (anciennement 6s, lui-même corrigé de 3s en v5.13.1).
- **`build.gradle`** : versionCode 522→524, versionName 5.13.2→5.13.4.

---

## [5.13.3] - 2026-03-30
### ☀️ Analyse Solaire Pro complète

#### Backend — `analysis.ts`
Interface `SolarAnalysisResult` enrichie avec 12 nouveaux champs via `SunCalc.getTimes()` et `SunCalc.getMoonIllumination()` :
- `sunrise`, `sunset`, `solarNoon`
- `goldenHourMorningStart/End`, `goldenHourEveningStart/End`
- `dayDurationMinutes`, `currentAzimuthDeg`, `currentElevationDeg`
- `moonPhase`, `moonPhaseName` (8 phases : new → waning_crescent)
- `elevationCurve[144]` — altitude solaire toutes les 10 min sur 24h
- Fonction `getMoonPhaseName()` exportée.

#### UI — `ExpertSheets.ts` — SolarProbeSheet
- **Gratuit** : 1 stat (ensoleillement total) + timeline 48 barres + bannière upsell.
- **Pro — 4 blocs** :
  1. Données du jour — lever/midi solaire/coucher, heure dorée matin+soir, durée du jour, ensoleillement total
  2. Temps réel — azimut + boussole SVG, élévation + barre de progression, phase lunaire + emoji
  3. Graphique SVG 24h — fond coloré nuit/crépuscule/jour, courbe altitude #FFD700, zones d'ombre terrain en rouge, ligne courante mobile
  4. Rapport copiable enrichi
- Subscription `state.subscribe('simDate')` → mise à jour temps réel du Bloc 2 et de la ligne SVG.

#### TimelineComponent
- Div `#timeline-solar-info` avec azimut + élévation injecté sous le slider (Pro uniquement), mis à jour à chaque changement de `simDate`.

#### i18n
- `solar.section.{dayData, realtime}`, `solar.stat.{sunrise, sunset, noon, goldenMorning, goldenEvening, dayDuration, azimuth, elevation, moonPhase, elevationChart}`, `solar.upsell.solar` en FR/EN/DE/IT.

#### Tests
- `src/test/solarAnalysis.test.ts` — 16 tests verts (sunrise/sunset/noon, golden hour, azimuth, elevation curve, moon phase, graceful null).
- **`build.gradle`** : versionCode 521→523, versionName 5.13.1→5.13.3.

---

## [5.13.2] - 2026-03-29
### 🧪 Toggle Pro visible pour Closed Testing

- **`index.html`** : Toggle *"🧪 Mode Pro (test) — Session uniquement — non persisté"* ajouté dans Réglages Avancés, marqué `<!-- ⚠️ SUPPRIMER AVANT PRODUCTION -->`.
- **`SettingsSheet.ts`** : `initTesterProToggle()` — checkbox synchronisée avec `state.isPro`, jamais `saveProStatus()` (RAM uniquement). Toast de confirmation + haptic à chaque toggle.
- **`docs/TODO.md`** : Checklist obligatoire avant Production ajoutée (suppression toggle, screenshots, RevenueCat).
- **`build.gradle`** : versionCode 521→522, versionName 5.13.2.

---

## [5.13.1] - 2026-03-29
### ✨ Upsell contextuel complet

- **`scene.ts`** : Toast LOD 14 durée 3s→6s (porté à 10s en v5.13.4 après fix CSS).
- **`TrackSheet.ts`** : Alerte REC T-5min — vibration + toast *"⏱ Limite 30 min — encore 5 minutes"* à T-25min (setTimeout). 4 langues.
- **`LayersSheet.ts`** : Badge *"Pro"* sur la tuile satellite — masqué automatiquement si `state.isPro`. Subscription `state.subscribe('isPro', syncSatelliteBadge)`.
- **`TimelineComponent.ts`** : Hint discret *"⭐ Simulation solaire complète 24h disponible avec Pro"* sous le slider, caché si `isPro`.
- **`iap.ts`** : Label `multi_gpx` → *"Tracés GPX illimités — comparez vos sorties côte à côte"*.
- **i18n** : `upsell.timeline`, `track.recWarning5min` en FR/EN/DE/IT.
- **`build.gradle`** : versionCode 520→521, versionName 5.13.1.

---

## [5.11.2] - 2026-03-29
### 🗺️ Vue de démarrage Suisse + Verrouillage 2D bas zoom

#### Vue de démarrage neutralisée sur la Suisse entière

- **Position initiale** (`state.ts`) : `TARGET_LAT/LON` modifiés de Spiez (46.6863/7.6617) vers le centroïde géographique de la Suisse (46.8182/8.2275). `ZOOM` passé de 12 à 6.
- **Caméra** (`scene.ts`) : position initiale déplacée de `(0, 35000, 40000)` à `(0, 2000000, 2000000)` — dist ≈ 2 828 000 → `adaptiveLOD()` retourne LOD 6 (dezoom maximum). Ces valeurs ne sont pas persistées en localStorage, le changement s'applique à tous les utilisateurs.
- **Pré-cache tuiles Suisse** (`tileLoader.ts` + `main.ts`) : `preloadChOverviewTiles()` — exécuté une seule fois en background au premier démarrage. Télécharge ~300-400 tuiles couvrant la CH (zooms 6-9, bbox 5.4–11.3°lon/45.2–48.2°lat) dans le CacheStorage persistant 30j. À partir de la 2e visite, la vue LOD 6 est instantanée même hors-ligne. Flag `suntrail-ch-preloaded-v1` en localStorage.

#### Verrouillage automatique du bouton 2D en LOD ≤ 10

- **Logique** (`NavigationBar.ts`) : `state.subscribe('ZOOM', syncLowZoomState)` — quand `ZOOM ≤ 10`, le bouton 2D/3D est désactivé (`btn.disabled = true`) et `IS_2D_MODE` forcé à `true`. L'état précédent est mémorisé dans `_modeBeforeLowZoom` et restauré automatiquement quand `ZOOM > 10` avec `rebuildActiveTiles()` si nécessaire.
- **Style** (`style.css`) : `#nav-2d-toggle:disabled { opacity: 0.35; cursor: not-allowed; }` — feedback visuel clair.
- **Raison** : `fetchAs2D = zoom <= 10` dans `terrain.ts` — les tuiles LOD 6-10 sont toujours chargées sans données d'élévation. Le mode 3D est sans effet à ces niveaux.

---

## [5.11.1-touch] - 2026-03-29
### 🕹️ Navigation Tactile — Refonte complète 2 doigts (v6.3)

#### Contexte
La navigation 2 doigts avait 3 bugs confirmés sur device Android :
1. Zoom zoomait vers le centre écran au lieu des doigts
2. Rotation déclenchait aussi du zoom parasite
3. Tilt impossible — rotation se déclenchait à la place

#### Fixes

- **Zoom vers les doigts** (`touchControls.ts`) : `doZoomToPoint()` — raycasting depuis la caméra à travers le centre du pinch, intersection avec le plan horizontal au niveau du target, re-projection après zoom, compensation `doPan(-ex, -ey)/PAN_SPEED`. Correct quelle que soit l'inclinaison de la caméra.

- **Rotation sans zoom parasite** (`touchControls.ts`) : `isRotating` requiert désormais 3 conditions cumulatives : `|dAngle| > ROT_DEADZONE` + `|dAngle| > spreadDelta × 0.5` (angle doit dominer spread → évite bruit pendant pinch) + `|dAngle| × 150 > |dy|` (angle doit dominer dérive verticale → évite bruit pendant tilt).

- **Tilt par placement des doigts** (`touchControls.ts`) : Abandon des approches par accumulation de signal (v2→v5) — fondamentalement cassées car PointerEvents se déclenchent un pointeur à la fois (d2y=0 systématique → faux positifs). Solution : détection par **placement initial** (style Google Earth réel).
  - Au 2e contact : si `|sin(angle initial)| < TILT_ANGLE (0.707)` → `_tiltPreArmed = true`
  - Premier mouvement vertical (`|dy| > |dx|`, spread stable) → `_tiltLocked = true` immédiatement
  - Pendant le lock : **seul** `doTilt(dy)` s'applique — zoom et rotation bloqués
  - Reset à chaque lever de doigt

#### Architecture finale `touchControls.ts` (v6.3)

```
Placement 2 doigts à l'horizontal  →  _tiltPreArmed = true
+ premier mv vertical              →  _tiltLocked = true  →  doTilt(dy) exclusif
Placement autre / tilt non armé    →  isRotating (3 guards) / doZoomToPoint / doPan
```

#### Paramètres ajustables (tête de fichier)
| Constante | Valeur | Rôle |
|-----------|--------|------|
| `ROT_DEADZONE` | 0.003 rad | Seuil minimal de détection rotation |
| `TILT_ANGLE` | 0.707 | `|sin(angle)| <` ce seuil → pré-armement tilt (0.707 = 45°) |
| `PAN_SPEED` | 1.8 | Vitesse pan |
| `TILT_SPEED` | 1.2 | Sensibilité tilt |
| `INERTIA` | 0.88 | Décélération inertie pan |

---

## [5.11.1] - 2026-03-28
### 🐛 Bugfixes Post-Marche Réelle + Profiling Phase B

#### Bugs identifiés lors des tests de randonnée physique (S23 + A53)

- **Fix flyTo animation 20fps** (`scene.ts`) : La RAF `animateFlight` appelait `controls.update()` en interne, ce qui mettait à jour `lastPosition` dans OrbitControls. Le `controls.update()` suivant dans `renderLoopFn` retournait `false` (`controlsDirty=false`). `state.isFlyingTo` était couplé à `controlsDirty` → pas de rendu. Fix : `state.isFlyingTo` extrait en condition **standalone** dans `needsUpdate`, indépendant de `controlsDirty`.
- **Fix GPS follow camera 20fps** (`scene.ts`) : `state.isFollowingUser` absent de la guard `isIdleMode` → render loop throttlé à 20fps pendant le suivi GPS. Fix : ajout de `!state.isFollowingUser` dans `isIdleMode`. Même règle que `isFlyingTo` : tout mouvement continu de caméra doit être exempté du throttle idle.
- **Fix bouton GPS suivi état inversé** (`scene.ts`) : `flyTo()` référençait l'élément `gps-follow-btn` (inexistant dans le DOM) pour retirer la classe `active` → le bouton restait visuellement "actif" après désactivation du suivi. Fix : correction en `gps-main-btn` + retrait des classes `active` et `following`.
- **Fix artefact eau LOD 17-18** (`hydrology.ts`) : Amplitude des vagues ±3.7m (w1=2.5, w2=1.2) — la vague descendait 2.7m sous la surface du terrain → shadow map artifacts (ombre qui pulse). Fix : amplitude réduite à ±0.9m (w1=0.6, w2=0.3) + base du mesh rehaussée à `baseAlt + 2.0m` (vs +1.0m) → marge minimum 1.1m au-dessus du terrain en tout état de cause.
- **Fix rotation caméra brusque pendant suivi GPS** (`location.ts`) : Grand `delta` après réveil de Deep Sleep pouvait causer une rotation theta brutale lors de la reprise du suivi heading. Fix : `clampedDelta = Math.min(delta, 0.05)` dans le lerp de `spherical.theta` (`centerOnUser()`).

#### Bugs identifiés lors du profiling Phase B (Chrome DevTools)

- **Fix tuiles blanches intermittentes** (`tileCache.ts` + `terrain.ts`) : `addToCache()` et `trimCache()` évincaient aveuglément l'entrée FIFO la plus ancienne sans vérifier si elle était encore rendue en scène. `texture.dispose()` supprimait le handle WebGL → tuile blanche jusqu'à la re-upload au frame suivant (66-400ms sous throttling thermique). Fix : `activeCacheKeys` (Set<string>) — `terrain.ts` marque/démarque les clés via `markCacheKeyActive/Inactive()` au cycle `load/dispose`. L'éviction cherche la première entrée non-active avant de fallback FIFO.
- **Fix idle throttle 20fps cassé après bouton GPS** (`ui.ts`) : `state.isFollowingUser = true` était posé sur le 1er clic GPS (centrage unique, `userLocation=null`). `centerOnUser()` retournait immédiatement mais `isIdleMode` restait `false` indéfiniment → throttle 20fps désactivé. Fix : `isAlreadyCentered` utilise `gpsMainBtn.classList.contains('active')` au lieu de `state.isFollowingUser`. `isFollowingUser=true` uniquement sur 2e clic (suivi continu réel).
- **Fix GPS follow à 120fps** (`scene.ts`) : Sans plafond propre, le suivi GPS tournait à la fréquence maximale du display (120fps sur S23) avec `ENERGY_SAVER=false`. GPS = 1Hz, lerp fluide à 30fps — rendu à 120fps inutile. Fix : guard `33ms` conditionnel à `state.isFollowingUser && !state.ENERGY_SAVER`.
- **feat(settings) : toggle désactivation météo** (`weather.ts`, `scene.ts`, `SettingsSheet.ts`, `index.html`) : `SHOW_WEATHER` existait dans `PerformanceSettings` mais n'était jamais vérifié. Branché dans `updateWeatherSystem()`, `isWeatherActive`, et `bindToggle('weather-toggle')`. Clés i18n déjà présentes dans les 4 langues.

#### Profiling marche réelle (Sessions 3 & 4)
- **Galaxy S23 (Performance)** : −10% / 30min = 20%/h. Drain dominé par GPS+REC Foreground Service. GPU en Deep Sleep ~90% du temps. Objectif ≤ 15%/h atteint en usage réel.
- **Galaxy A53 (Balanced)** : −6% / 30min = 12%/h. Poche, screen off, GPS passif, Deep Sleep 100%. Objectif ≤ 15%/h **atteint**. ✅ Sprint 7 Play Store en v5.11 autorisé.

#### Profiling Phase B — Chrome DevTools (Sessions 6 & 7)
- **A53 flame chart** : throttle météo 50ms OK, workers 4 actifs OK, Long Tasks lors LOD changes (buildMesh CPU-bound), Long Task 41s = GPS button → `refreshTerrain()` one-time. Scripting 26%.
- **A53 memory heap** : aucune fuite. +122MB ArrayBuffer = cache normal (S1 pris à vide). +98 shader programs = materialPool Balanced-spécifique, backlog v5.12.
- **S23 flame chart** : 60fps < 16ms stable, scripting 19%, Long Tasks quasi nuls (Adreno 740), throttle météo 50ms déterministe. Fix v5.11.1 confirmé : plus de 20fps sur flyTo/follow.
- **S23 memory heap** : quasi-plat (~200kB croissance vs ~150MB A53). +8 WebGLPrograms (vs +98 A53) → materialPool backlog = Balanced-spécifique uniquement.

---

## [5.11.0-wip] - 2026-03-28
### 🔋 Sprint 6 — Optimisation Énergétique Mobile + PerfRecorder + Recalibration Presets

#### Sprint 6 — Phase 1 : Quick Wins Batterie
- **Deep Sleep réel** (`scene.ts`) : Remplacement du `return` inline insuffisant par `renderer.setAnimationLoop(null)` sur `visibilitychange hidden` + relance sur `visible`. Le GPU s'arrête totalement quand l'écran est verrouillé.
- **ENERGY_SAVER universel mobile** (`performance.ts`) : `state.ENERGY_SAVER = true` forcé dans `applyPreset()` (pas seulement dans `detectBestPreset()`) pour couvrir les utilisateurs de retour dont `loadSettings()` restaurait l'ancienne valeur `false`. Exception : preset Ultra mobile (Snapdragon Elite).
- **Fix `processLoadQueue` hardcodé** (`terrain.ts`) : `slice(0, 4)` → `slice(0, Math.max(1, state.MAX_BUILDS_PER_CYCLE))`. Le preset ne contrôlait pas le débit réel — corrigé.
- **Limites tileCache mobiles** (`tileCache.ts`) : Cache réduit pour mobile par tier (ultra: 350, performance: 180, balanced: 120 vs 800/400/300 desktop). `trimCache()` exporté pour purge immédiate sur changement de preset.
- **Cap PIXEL_RATIO_LIMIT 2.0** (`performance.ts`) : Écrans OLED 3× ne nécessitent pas plus de 2× pour la cartographie.
- **Fix Stats.js init timing** (`scene.ts` + `VRAMDashboard.ts`) : `VRAMDashboard.init()` s'exécutait avant `initScene()` créant `state.stats` → FPS counter non affiché. `state.vramPanel?.setVisible(state.SHOW_STATS)` appelé après création Stats.js. 188 tests ✅.

#### Sprint 6 — PerfRecorder : Module d'analyse de performance
- **`VRAMDashboard.ts`** : Intégration `PerfRecorder` — buffer circulaire 600 échantillons (5 min à 500ms). Interface `PerfSample` + `PerfSession` exportées.
- **Bouton ⏺/⏹** dans le panel VRAM : démarre/arrête l'enregistrement. `Stop + Copier` exporte le JSON dans le presse-papier pour analyse IA.
- **FPS rolling** (`scene.ts` + `state.ts`) : `state.currentFPS` alimenté par un compteur de frames (fenêtre 1s) dans le render loop. Affiché dans le panel VRAM.
- **Données capturées** : fps, textures, geometries, drawCalls, triangles, tiles, zoom, isProcessingTiles, isUserInteracting, energySaver, timestamp relatif.
- **CSS** (`style.css`) : `.vram-record-btn`, `.vram-record-btn--active`, `.vram-record-status` avec design tokens.

#### Sprint 6 — Recalibration Presets + Détection GPU enrichie
- **Architecture simplifiée** : Suppression de la double-couche "preset + caps mobile". Les valeurs de chaque tier sont maintenant directes et universelles. Seul Ultra conserve des ajustements mobiles légers (shadow 2048, RANGE 8 sur Snapdragon Elite).
- **Presets recalibrés pour le marché mobile** :
  - `eco` — vieux mobile (MAX_ALLOWED_ZOOM: 14)
  - `balanced` (STD — Galaxy A53) : RESOLUTION 64→32, VEGETATION_DENSITY 2000→500, WEATHER_DENSITY 2000→1000
  - `performance` (High — Galaxy S23) : RANGE 8→5, SHADOW_RES 2048→1024, MAX_BUILDS_PER_CYCLE 4→2 (baked-in)
  - `ultra` — PC bureau / RTX / Apple M / Snapdragon Elite (inchangé)
- **`detectBestPreset()` enrichi** (`performance.ts`) : 52 patterns GPU couverts (vs 8). Intel HD/UHD par génération (HD 520/620+), Intel Arc, Intel Iris Xe, AMD Vega iGPU, AMD RX par série (RDNA/Polaris), NVIDIA GTX par série numérique, Snapdragon Elite (Adreno 830+), Mali-G68/G78 explicites. Fallback : ≥8 cores CPU → `balanced` (pas `eco`).
- **`tileCache.getMaxCacheSize()` aligné** : Tailles basées sur RANGE effectif (performance RANGE=5 → 121 tuiles → cache 180).

---

## [5.11.0-wip] - 2026-03-27
### 🚀 Audit Production Play Store + Navigation Tactile + Accessibilité + Android

#### Sprint 0 — Prérequis
- **Version bump** : `package.json` → `5.11.0`, `versionCode: 511 / "5.11.0"` dans `android/app/build.gradle`.
- **Play Console** : Compte développeur créé, vérification identité complétée.

#### Sprint 1 — Android Release Build
- **signingConfigs.release** : Chargement via `keystore.properties` (hors Git). Template `android/keystore.properties.template` fourni.
- **R8/ProGuard** : `minifyEnabled true` + `shrinkResources true`. `proguard-rules.pro` complété avec règles Capacitor, WebView JS Interface, AndroidX, stack traces.
- **16 KB page size** : `android.zipAlign.16KB=true` dans `gradle.properties` (Android 15+).
- **Edge-to-Edge** : `android:enableOnBackInvokedCallback="true"`, barres système transparentes, `windowLayoutInDisplayCutoutMode=shortEdges` dans `styles.xml`.
- **Fix Vitest 4** : `poolOptions.forks.singleFork` → `singleFork: true` (warning de dépréciation supprimé).

#### Sprint 2 — Sécurité & Code
- **npm audit** : 2 critiques → 0, 13 high production → 0. Overrides `jsdom ^25`, `qs ^6.14.1`, `tough-cookie ^4.1.3`. Upgrade vitest → 4.1.2 (fix `flatted` HIGH).
- **7 `@ts-ignore` supprimés** : Remplacés par `src/vite-env.d.ts` (virtual:pwa-register), `src/types/global.d.ts` (Battery API, webkitCompassHeading), `src/types/gpxparser.d.ts` (types complets gpxparser). Suppressions spurieuses retirées (Stats, pmtiles.FileSource, import dynamique).
- **CSP header** : `<meta http-equiv="Content-Security-Policy">` complet dans `index.html`. Whitelist : MapTiler, SwissTopo, IGN/geopf.fr, OpenStreetMap, Overpass (domaine racine + sous-domaines), overpass.kumi.systems, open-meteo.com, cloud.maptiler.com (img-src).
- **Service Worker** : `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`. Noms de caches versionnés `maptiler-cache-v5.11`, `swisstopo-cache-v5.11`, `CACHE_NAME = suntrail-tiles-v5.11`.
- **Fuite clé API** : Suppression du `console.log("[Geocoding] URLs:", ...)` dans `utils.ts` qui loggait l'URL complète incluant `state.MK`.

#### Sprint 2.5 — Navigation Tactile Google Earth
- **`src/modules/touchControls.ts`** : Module autonome 190 lignes. Intercepte `pointerdown` en phase CAPTURE (avant OrbitControls), désactive `controls.enabled = false`, réactive à la fin.
- **Diagnostic racine** : Three.js r160 OrbitControls utilise PointerEvents exclusivement. Les tentatives précédentes (TouchEvents) étaient inopérantes.
- **1 doigt** : Pan horizontal avec inertie (`INERTIA = 0.88`) — glissement après lâcher.
- **2 doigts** : Pinch = zoom · twist = rotation azimut · centre-X = pan · centre-Y = tilt (inclinaison via `THREE.Spherical.phi`).
- **Vitesse** : `PAN_SPEED = 1.8` (+ rapide qu'OrbitControls par défaut pour compenser l'absence d'inertie initiale).
- **Paramètres** : `PAN_SPEED`, `TILT_SPEED`, `INERTIA`, `ROT_DEADZONE` ajustables en tête de fichier.
- **`scene.ts`** : `initTouchControls()` branché après OrbitControls init. `disposeTouchControls()` dans `disposeScene()`.

---

#### Sprint 3 — Accessibilité & UX Légale
- **Prominent Disclosure GPS** : `gpsDisclosure.ts` — modale WCAG avec focus trap, traduite 4 langues, stockée `localStorage`. Appelée avant `Geolocation.getCurrentPosition()`. Obligatoire Play Store.
- **axe-core** : 7 tests WCAG 2.1 AA — GPS Disclosure, Navigation Bar, Bottom Sheet, FAB GPS (`src/test/a11y.test.ts`).
- **Touch targets** : `icon-btn-sm` 34→48px · `#compass-fab` 44→48px · `.status-widget/.top-widget` min-height 48px · `.coords-btn` min-height 48px.
- **Contraste accent** : `--accent: #3b7ef8` → `#4a8ef8` (ratio 4.44 → ~5.0, WCAG AA).
- **Aria-labels** : `compass-fab`, `layers-fab`, `gps-main-btn`, `top-pill-main`, `net-status-icon`, `sos-main-btn`, `timeline-toggle-btn` — `role="button"` + `tabindex="0"`.
- **Auto-hide** : 5s → 10s (TalkBack a plus de temps pour naviguer).

#### Sprint 3.5 — Android Immersive + Foreground Service REC
- **Immersive mode** : `MainActivity.java` — `WindowInsetsController.hide(statusBars())` dans `onWindowFocusChanged()`. La barre système (heure, batterie) est masquée.
- **RecordingService.java** : Foreground Service `foregroundServiceType="location"`, `START_STICKY`, notification persistante — empêche Android de tuer l'app pendant l'enregistrement.
- **RecordingPlugin.java** : Plugin Capacitor `startForeground()` / `stopForeground()` — contrôlé depuis JS.
- **AndroidManifest.xml** : `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS` + `<service>` déclaré.
- **`foregroundService.ts`** : Wrapper JS + persistence `localStorage` — snapshot du REC à chaque point GPS. Toast d'alerte si l'app a été tuée pendant l'enregistrement.

#### Fixes UX Sprint 3-4
- **Mode 2D (Eco)** : Timeline et bouton 🕒 masqués (`display:none`). Altitude supprimée du panneau coordonnées (toujours 0 en 2D). Fermeture propre de la timeline au switch vers Eco.
- **Timeline slider temps réel** : `state.isInteractingWithUI = true` pendant le drag → render loop reste actif → ombres se déplacent en temps réel sans mouvement de caméra.
- **Stats de performance** : Suppression du doublon `vram-toggle`. `VRAMDashboard.setVisible(val)` remplace `toggle()` — synchronisation exacte avec `state.SHOW_STATS` dès l'init. Plus de désynchronisation toggle ON / panel caché.

---

## [5.10.0] - 2026-03-27
### 🌐 Multi-GPX, i18n FR/DE/IT/EN, Dashboard VRAM — Validé utilisateur

#### Internationalisation (Sprint 1 + 1-bis)
- **I18nService** : Singleton léger (`src/i18n/I18nService.ts`) avec `t(key)`, `setLocale()`, interpolation `{{var}}`, fallback FR → clé brute.
- **4 langues** : `fr.json` (source of truth, ~200 clés), `de.json`, `it.json`, `en.json` — termes de randonnée/cartographie soignés.
- **Couverture complète** : Strings JS dynamiques (toasts, aria-labels, empty states) + templates HTML statiques via `data-i18n`.
- **Mécanisme HTML** : `I18nService.applyToDOM(root)` appliqué automatiquement dans `BaseComponent.hydrate()` — tous les composants traduits sans code supplémentaire.
- **Live reload** : Abonnement `localeChanged` dans `BaseComponent` — l'UI se traduit instantanément au changement de langue.
- **Sélecteur de langue** : Combobox FR/DE/IT/EN dans SettingsSheet, persistance via `state.lang` (localStorage).
- **`<html lang>`** : Mis à jour dynamiquement via EventBus `localeChanged`.
- **14 tests i18n** ajoutés.

#### Multi-GPX (Sprint 2)
- **Refonte State** : `rawGpxData`/`gpxMesh`/`gpxPoints` (mono) → `gpxLayers: GPXLayer[]` + `activeGPXLayerId`. Palette `GPX_COLORS` (8 couleurs cycliques).
- **terrain.ts** : `addGPXLayer()`, `removeGPXLayer()`, `toggleGPXLayer()`, `updateAllGPXMeshes()`, `clearAllGPXLayers()`.
- **TrackSheet** : Liste réactive des tracés (nom, couleur, stats, toggle 👁, suppression ×). Import multi-fichiers (attribut `multiple`). Clic → flyTo + profil.
- **profile.ts** : `updateElevationProfile(layerId?)` avec résolution du layer actif.
- **scene.ts** : Origin shift itère sur tous les layers + sync `layer.points` après shift. Flag `state.isFlyingTo` bloque l'origin shift pendant l'animation flyTo — élimine les coordonnées stales entre imports successifs.
- **FlyTo robuste** : Coords calculées depuis lat/lon brut à chaque appel (immunisé contre les changements d'`originTile`).
- **Terrain Draping** : `gpxDrapePoints()` — densification ×4 entre waypoints GPS + clamping `Y = max(terrainAlt, elevGPX) + 30m`. Re-draping automatique à +3s/+6s après import. Le tracé suit le dénivelé réel du terrain rendu.
- **9 tests Multi-GPX** ajoutés (133/135 total, 2 pré-existants tileLoader).

#### Dashboard VRAM Pro (Sprint 3)
- **VRAMDashboard** : composant standalone, overlay `position:fixed` sur la carte (top:130px). Métriques temps réel à 500ms : géométries, textures GPU, draw calls, triangles, tuiles actives, workers.
- **Overlay unifié FPS+VRAM** : un seul toggle "Stats de performance" dans Réglages → contrôle simultanément FPS (Stats.js Three.js) et métriques GPU.
- **Seuils d'alerte** : toast ⚠️ si textures > limite profil (eco=50 / balanced=150 / performance=300 / ultra=500). Cooldown 30s anti-spam.
- **`state.vramPanel: VRAMDashboard | null`** : stub mort depuis v5.7 remplacé par implémentation réelle.
- **10 tests** `vramDashboard.test.ts`.

#### Qualité & Fixes Post-validation (Sprint 4 + 3-bis)
- **145/145 tests** — objectif 140+ dépassé. Fix `tileLoader.test.ts` (signature `getElevationUrl → {url,sourceZoom}`).
- **i18n live-reload complet** : toutes les strings dynamiques créées en JS (`innerHTML`, `textContent`) équipées de `data-i18n` → `applyToDOM()` les met à jour au changement de locale. `sun.ts` : `applySolarPhaseLabel()` + listener `localeChanged` pour les phases solaires (Plein jour / Heure Dorée / Crépuscule / Nuit).
- **Couverture i18n étendue** : Solar (phases, statuts, stats), Search placeholder, WeatherExpert, TrackSheet empty state.
- **0 erreurs TypeScript** strict.

## [5.9.0] - 2026-03-27
### 🎨 UI Refonte Qualité — Design Tokens, Accessibilité, Gestures & Haptics

#### Design System
- **Design Tokens CSS** : Ajout de variables CSS systématiques dans `:root` — `--space-1` à `--space-6` (grille 4px), `--text-xs` à `--text-xl` (échelle normalisée 10→24px), `--radius-sm` à `--radius-xl`, `--transition-fast/normal/slow`. Les valeurs hardcodées dans `style.css` ont été remplacées par les tokens.
- **Migration Styles Inline** : ~50 blocs `style.cssText` répartis sur 6 composants (`ConnectivitySheet`, `ExpertSheets`, `LayersSheet`, `SearchSheet`, `TrackSheet`, `TopStatusBar`) migrés vers des classes CSS namespaced (`.conn-*`, `.exp-*`, `.lyr-*`, `.srch-*`, `.trk-*`). Correction au passage du bug `var(--t2)` → `var(--text-2)` dans ExpertSheets.

#### EventBus & Performance
- **Sheet Lifecycle Events** : Ajout de `sheetOpened`/`sheetClosed` dans l'`EventMap` typé. `SheetManager` émet ces événements à chaque ouverture/fermeture.
- **Suppression du Polling** : Le `setInterval(300ms)` de `NavigationBar` (sync des tabs actifs) remplacé par des subscriptions `eventBus`. Réduction de la charge CPU et batterie.

#### Accessibilité (ARIA)
- **ARIA complet sur 10 composants** : `role="tablist"/"tab"` + `aria-selected` sur la nav bar, `role="switch"` + `aria-checked` sur tous les toggles, `aria-value*` sur les sliders, `aria-label` sur tous les boutons icônes, `aria-live="polite"` sur les zones de mise à jour dynamique (GPS, REC, météo).
- **Focus Trap** : Quand une sheet s'ouvre, le focus Tab est piégé à l'intérieur (cycle Tab/Shift+Tab). À la fermeture, le focus retourne à l'élément déclencheur.
- **Touche Escape** : Ferme la sheet active depuis le clavier.
- **Sheets dialogues** : `role="dialog"`, `aria-modal="true"`, `aria-labelledby` ajoutés dynamiquement par `SheetManager`.

#### Gestures
- **Swipe-to-dismiss Sheets** : Chaque sheet dispose d'un drag handle (barre grise). Swipe vers le bas ≥60px ou vélocité ≥0.3px/ms → fermeture animée avec feedback haptique.
- **Swipe-to-dismiss Timeline** : La timeline (`#bottom-bar`) dispose du même drag handle injectable en JS. Swipe down → fermeture et réapparition des boutons FAB.
- **Fix FAB/Timeline overlap** : Remplacement du sélecteur CSS `~` (cassé selon l'ordre DOM) par `body.timeline-open .fab-stack` pour masquer les FABs quand la timeline est ouverte.

#### Composants
- **SharedAPIKeyComponent** : Extraction du formulaire de clé MapTiler dupliqué en 3 endroits (SettingsSheet, ConnectivitySheet, setup screen) vers un `BaseComponent` réutilisable. Synchronisation automatique via `state.subscribe('MK')`.
- **Loading States** : Spinners et états désactivés sur les 3 opérations async — géocodage (SearchSheet), import GPX (TrackSheet), download zone (ConnectivitySheet). Pattern `btn-loading` + `aria-busy` avec `finally` garanti.
- **Empty States** : États vides illustrés (icônes SVG monoline) dans TrackSheet (aucun parcours) et SearchSheet (état initial + aucun résultat).

#### Haptic Feedback (Android)
- **`@capacitor/haptics` v8.0.1** installé. Nouveau helper `src/modules/haptics.ts` avec graceful fallback web.
- **Permission VIBRATE** ajoutée à `AndroidManifest.xml` (était manquante — bloquait tout le feedback).
- **Mapping ciblé** : `medium` sur les swipes (sheets + timeline), `success` sur import GPX réussi / download terminé / sauvegarde clé API. Les haptics trop fréquents (open/close au clic, tabs, toggles) ont été supprimés.

## [5.8.17] - 2026-03-26
### 🛠️ Slope Visualization Fix & UI Cleanup
- **Slope Calculation Correction**: Fixed a critical bug where slopes appeared completely red (exaggerated) at zoom levels above 14 (LOD 15+). The issue was caused by normal map calculations using the requested zoom level instead of the actual elevation data zoom (capped at 14).
  - `getElevationUrl()` now returns `{url, sourceZoom}` to track the real data resolution
  - Worker receives `elevSourceZoom` parameter for accurate pixel size calculation
  - Normal maps are now correctly computed regardless of display zoom level
- **UI Simplification**: Removed the redundant GPU stats button from the top status bar. Performance statistics are still accessible via Settings > Advanced Parameters > "Stats de performance (FPS)".

### 📱 Mobile Fixes
- **GPS Accuracy Display**: Added `userLocationAccuracy` to the reactive state. The Connectivity panel now displays the real GPS accuracy (in meters) instead of always showing "--".
- **Compass Button**: Fixed the North alignment button. It now smoothly animates the camera to face North (0°) with a 500ms ease-out animation, instead of just showing a toast message.
- **Timeline FAB Hiding**: The floating action buttons (GPS, Layers, Compass) now automatically hide when the timeline panel is open, preventing UI overlap.
- **Recording Permissions**: The app now properly requests and handles GPS permissions on mobile devices before starting track recording.

## [5.8.16] - 2026-03-25
### 🛠️ GPS Recording & Live Tracking
- **Reactive Recording Fix**: Resolved a critical issue where GPS recording only captured the first point. Switched from `.push()` to array re-assignment (`[...]`) to ensure the reactive state notifies UI listeners of new points.
- **Live 3D Track Mesh**: Implemented `updateRecordedTrackMesh()`. The engine now renders a dynamic, pulsing red 3D tube in the scene as the user moves, providing immediate visual feedback of the recorded path.
- **Pulsing REC Indicator**: Added a persistent, pulsing red "REC" indicator in the Top Status Bar during recording. 
- **Recording Timer**: Integrated a live chronometer in the status bar to track recording duration at a glance.
- **UI Interactivity**: The REC indicator is now clickable, providing a shortcut back to the "Parcours" sheet.

## [5.8.15] - 2026-03-25
### 🌲 Vegetation & Tile Continuity
- **Deterministic Placement Engine**: Replaced all `Math.random()` calls with a custom `pseudoRandom` function seeded by global tile coordinates. This permanently eliminates "net cuts" (seams) between adjacent tiles.
- **Banding Elimination**: Removed the hard row-by-row tree limit. Forests are now distributed across the entire tile surface using purely probabilistic density, fixing the "empty bands" at the bottom of high-zoom tiles.
- **Refined Spatial Jitter**: Implemented deterministic jitter to maintain organic appearance while ensuring perfect boundary alignment.
- **Fixed State Tests**: Updated performance tests to match the new 8000 density standard for the Ultra preset.

## [5.8.14] - 2026-03-24
### 🌲 Vegetation Quality & Anti-Banding
- **Dithered Scan Engine**: Implemented randomized pixel sampling within the scan grid to permanently eliminate Moiré patterns and "horizontal banding" at high zoom levels.
- **Continuous Forest Filter**: Expanded SwissTopo detection to include both dark symbols and the light-green forest background. This ensures a consistent tree carpet even at LOD 17/18 where symbols are sparse.
- **Ultra Preset Balance**: Reduced Ultra vegetation density to 8000 to maintain high performance while ensuring visual quality through better distribution.
- **Enhanced Jitter**: Doubled the spatial randomization range to break all visible grid alignments.

## [5.8.13] - 2026-03-24
### 🌲 Vegetation & Distribution
- **Probabilistic Placement**: Implemented a probability-based distribution to eliminate horizontal banding and gaps at high zoom levels.
- **Improved Jitter**: Increased spatial randomization to break up grid-like patterns appearing at extreme LODs.

## [5.8.11] - 2026-03-24
### 🌲 Vegetation & Realism
- **Density Normalization**: Implemented a zoom-aware scaling for forest density. Trees are now normalized based on the physical area of the tile, ensuring that forests look consistent from LOD 15 up to LOD 18 without overcrowding.
- **Micro-adjustment**: Set minimum tree count per tile to 100 to maintain some vegetation presence even at extreme zooms.

## [5.8.10] - 2026-03-24
### 🌲 Vegetation & Performance
- **Reverted Forest Density**: Default tree counts restored to stable values (Balanced: 2000, Performance: 8000, Ultra: 12000) to maintain visual balance and performance.
- **Stable Scan Resolution**: Reverted vegetation scanner to 64x64 resolution for improved frame stability.
- **Advanced SwissTopo Forest Filter**: Implemented a "symbol-based" detection logic for SwissTopo. The engine now specifically targets the darker forest symbols (< 195 luminance) while strictly excluding the brighter backgrounds and uniform green sport fields.
- **Ultra-Strict Lawn Exclusion**: Added radical checks for "pure green" and vivid saturation to ensure sports fields, golf courses, and gardens remain tree-free.

## [5.8.9] - 2026-03-24
### 🌲 Vegetation Precision
- **Anti-Lawn Filter Refinement**: Improved chromatic discrimination between alpine forests and manicured urban lawns using greenness purity ratios.

## [5.8.8] - 2026-03-24
### 🌲 Vegetation Precision
- **Anti-Lawn Filter**: Implemented a strict chromatic filter to distinguish between natural forests and manicured grass (football fields, golf courses, gardens).
- **Luminance & Saturation Tuning**: Reduced brightness threshold and added vivid green detection to prevent false-positive tree placement on bright sports surfaces.

## [5.8.7] - 2026-03-24
### 🌲 Vegetation & Environment
- **Massive Forest Density**: Increased default tree density across all presets (Balanced: 4000, Performance: 10000, Ultra: 18000).
- **Adaptive Scan Engine**: Implementation of a high-resolution vegetation scanner (up to 128x128) allowing for truly dense forests.
- **Tree Scaling Refinement**: Adjusted tree scales and random jitter for a fuller, more organic forest appearance.
- **Settings Versioning**: Bumped state version to 5.8.7 to ensure proper settings migration.

## [5.8.6] - 2026-03-24
### 🛠️ Navigation & Performance
- **Adaptive Zoom Engine**: Implementation of a "smart jump" logic for LOD transitions. When teleporting or moving fast, the engine now skips intermediate zoom levels to instantly match the camera altitude.
- **Cinematic flyTo Refinement**: Improved target altitudes for teleportation. Peaks now aim for 3.5km (LOD 16/17) and cities for 8km (LOD 15/16) for immediate immersion.
- **State Stability**: Fixed `MAX_ALLOWED_ZOOM` handling in the reactive state to prevent zoom blocking during manual interactions.

## [5.8.5] - 2026-03-24
### 🛠️ 3D Buildings & Infrastructure
- **MapTiler Buildings Integration**: Fixed API URL to use dedicated `buildings` tileset and implemented native handling for overzoomed tiles (native data capped at Z14).
- **Intelligent Fallback**: Fixed fallback logic to trigger on 400 Bad Request errors, ensuring OSM Overpass takes over immediately if MapTiler fails.
- **Height-Aware Placement**: Improved building base altitude detection using relief sampling, ensuring structures are correctly grounded.
- **RTX Shadows**: Maintained geometry merging while enabling high-performance shadow casting for all building meshes.

## [5.8.4] - 2026-03-24
### 🛠️ Hydrology & Water Rendering
- **3D Hydrology Restoration**: Full restoration of dynamic 3D lakes and rivers meshes extracted from OSM Overpass API.
- **Seamless Water Engine**: Implementation of a global wave system using absolute world coordinates. This eliminates tile seams and moiré patterns.
- **Giant Roller Waves**: Replaced grid-like waves with natural, directional roller waves for a more realistic alpine lake appearance.
- **SwissTopo Detection**: Enhanced chromatic detection logic to correctly identify and render water even on light-colored SwissTopo maps.

## [5.8.3] - 2026-03-24
### 🛠️ Precision & Long-Distance Navigation
- **Origin Shift Implementation**: Implementation of a dynamic world recentering system (35km threshold). This eliminates floating-point jitter during long-distance crossings.
- **Atomic Translation**: All global scene objects (Camera, Sun, GPS Marker, GPX Tracks, Forests, and Labels) are now seamlessly offset during recentering.
- **UI Logic cleanup**: Removal of debug logs and refinement of the shift trigger conditions.

## [5.8.2] - 2026-03-24
### 🛠️ Restoration & Expert Features
- **Solar & Weather Restoration**: Réintégration de la logique dynamique pour l'Analyse Solaire et le Dashboard Météo. Les données sont de nouveau extraites et affichées en temps réel.
- **Advanced Settings**: Regroupement des réglages techniques (LOD, Fog, API Key, PMTiles) dans une section "Paramètres Avancés" collapsible.
- **Geolocation Unification**: Migration vers `@capacitor/geolocation` pour une expérience de positionnement identique et robuste sur PC et Mobile.
- **GPX Import Fix**: Rétablissement de la fonctionnalité d'importation de tracés dans l'onglet Parcours.
- **Mobile UX Refinement**: Ajustement du positionnement du bouton GPS (Top-Right) et du radar pour éviter les chevauchements sur petit écran. Timeline centrée et adaptative.

## [5.8.1] - 2026-03-22
### 🛠️ UI Fixes & Stability
- **Fix Logic Bindings** : Rétablissement des connexions JavaScript pour la sélection des calques et des presets de performance dans le nouveau système de tiroirs.
- **Search Reliability** : Correction de l'affichage des résultats de recherche et fiabilisation de la sélection des sommets.
- **Crash Fix** : Suppression des références obsolètes dans `startApp()` qui bloquaient le thread principal au chargement.

## [5.8.0] - 2026-03-22
### 🎨 Modern Mobile UI (v5.8)
- **Bottom Navigation Bar** : Suppression des boutons flottants épars au profit d'une barre de navigation fixe avec 4 onglets : *Carte, Recherche, Parcours, Réglages*.
- **Système de Bottom Sheets** : Toutes les interfaces coulissent désormais depuis le bas avec une animation fluide, optimisée pour l'usage à une main.
- **Top Bar Moderne** : Intégration d'un dashboard central affichant l'altitude temps réel, le niveau de détail (LOD) et un widget météo interactif.
- **Backdrop Intelligent** : Ajout d'un overlay permettant la fermeture intuitive des panneaux au clic extérieur.

## [5.7.4] - 2026-03-23
### 🗺️ Unification Mondiale & Sécurité API
- **Unification Bas-Zoom (LOD <= 10)** : Harmonisation de l'affichage à grande échelle. L'application utilise désormais une source unique pour le monde entier à bas niveau de zoom.
- **Fail-safe MapTiler (Auto-OSM)** : Implémentation d'une détection dynamique des erreurs 403 (clés invalides/expirées). Basculement automatique sur OpenStreetMap.
- **Fix Saut de Grille** : Correction du bug de recentrage lors des changements de source automatiques.

... (Historique tronqué pour lisibilité)
