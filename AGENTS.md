# SunTrail - Base de Connaissance (v5.11.0-wip)

Ce fichier sert de mémoire long-terme pour les agents IA travaillant sur SunTrail. Il consigne les décisions architecturales critiques et les solutions aux problèmes complexes.

## 🧠 Architecture Core

### État Global & Persistance (`state.ts`)
- **Pivot Central** : Toute la configuration (LOD, sources, presets) réside dans l'objet `state`.
- **Réactivité (v5.8.0)** : L'objet `state` est désormais enveloppé dans un **Proxy JS récursif** (`ReactiveState.ts`). Les composants s'abonnent aux changements via `state.subscribe('path', callback)`.
- **Note sur les Tableaux (v5.8.16)** : Les méthodes modifiant les tableaux in-place (comme `.push()`) ne déclenchent pas le Proxy. Il faut utiliser la réaffectation (`state.arr = [...state.arr, item]`) pour notifier les abonnés.
- **Persistance** : Sauvegarde automatique dans `localStorage`. 
- **Versioning (v5.8.16)** : Le système inclut désormais un contrôle de version (`CURRENT_SETTINGS_VERSION`). Si une version obsolète est détectée lors du chargement, les réglages sont réinitialisés pour éviter les corruptions.
- **Event Bus (`eventBus.ts`)** : Utilisé pour briser les dépendances circulaires entre `terrain.ts` et `scene.ts`. Permet de déclencher des événements transversaux (ex: `terrainReady`, `flyTo`).
- **Multi-GPX (v5.10.0)** : `state.gpxLayers: GPXLayer[]` remplace `rawGpxData/gpxMesh/gpxPoints`. Chaque layer a son propre mesh, couleur, stats et points 3D. La réaffectation `state.gpxLayers = [...state.gpxLayers, layer]` est obligatoire pour notifier le Proxy.
- **isFlyingTo (v5.10.0)** : Flag `state.isFlyingTo` mis à `true` pendant l'animation flyTo. **Bloque l'origin shift** pour éviter que les coordonnées capturées dans la closure de l'animation deviennent stales. Remis à `false` à la fin de l'animation (`progress >= 1`).
- **i18n live-reload (v5.10.0)** : `BaseComponent.hydrate()` souscrit à `localeChanged` et appelle `applyToDOM(this.element)`. Cela ne met à jour **que** les éléments avec `data-i18n`. Les strings créées par `innerHTML`/`textContent` en JS doivent **aussi avoir `data-i18n`** pour être re-traduites. Exemple : `el.innerHTML = \`<p data-i18n="key">\${i18n.t('key')}</p>\``. Pour les éléments hors composants (ex: `sun.ts`), utiliser un listener `eventBus.on('localeChanged', () => ...)` dédié.
- **VRAMDashboard (v5.10.0)** : `state.vramPanel: VRAMDashboard | null`. Classe standalone (pas un BaseComponent). `init()` injecte un panel `position:fixed` dans `document.body`. `toggle()` contrôle simultanément les FPS Stats.js (`state.stats.dom`) et le panel VRAM. Activé via toggle "Stats de performance" dans Réglages Avancés.

### Interface & Composants (v5.9.0)
- **Architecture Découplée** : La logique UI est extraite de `ui.ts` vers des classes spécialisées (`src/modules/ui/components/`).
- **BaseComponent** : Classe abstraite gérant le cycle de vie (hydratation via `<template>`, rendu, nettoyage des abonnements).
- **SheetManager** : Singleton gérant l'exclusivité des Bottom Sheets. Gère également : focus trap (Tab/Shift+Tab), touche Escape, attributs ARIA (`role="dialog"`, `aria-modal`), swipe-to-dismiss via `.sheet-drag-handle`.
- **EventBus Sheet Events (v5.9.0)** : `sheetOpened`/`sheetClosed` émis par SheetManager. `NavigationBar` s'abonne à ces événements — le `setInterval(300ms)` de polling a été supprimé.
- **Design Tokens (v5.9.0)** : Variables CSS systématiques dans `:root` — `--space-1..6`, `--text-xs..xl`, `--radius-sm..xl`, `--transition-fast/normal/slow`. Utiliser ces tokens dans tout nouveau CSS, jamais de valeurs hardcodées.
- **SharedAPIKeyComponent (v5.9.0)** : Formulaire clé MapTiler réutilisable (`src/modules/ui/components/SharedAPIKeyComponent.ts`). Instancier avec un `containerId` slot. Synchronisation automatique via `state.subscribe('MK')`.
- **Haptics (v5.9.0)** : Helper `src/modules/haptics.ts` avec `haptic(type)`. Appel via `void haptic('medium')` (jamais await). Utilisé uniquement sur les swipes et les confirmations de succès — PAS sur les clics courants.
- **Glassmorphism** : Style visuel unifié basé sur des variables CSS (`--glass-*`) avec flou de profondeur (20px) et saturation optimisée.
- **Timeline FAB (v5.9.0)** : La classe `body.timeline-open` masque `.fab-stack` quand la timeline est ouverte. Togglée dans `TimelineComponent`. Ne pas utiliser le sélecteur CSS `~` (ordre DOM non garanti).

### Moteur de Tuiles & Performance (`terrain.ts` / `tileLoader.ts`)
- **WebWorkers Pool** : 8 workers asynchrones (`tileWorker.ts`) pour le fetch et le calcul des Normal Maps (relief).
- **Material Pooling (`materialPool.ts`)** : Réutilisation des shaders pour éviter les micro-saccades de compilation Three.js (v5.6.4).
- **Gestion Mémoire (`memory.ts`)** : Utilisation stricte de `disposeObject()` pour libérer la VRAM lors du déchargement des tuiles.
- **Offline-First & PMTiles** : Support PWA (Service Worker) et lecture de fichiers `.pmtiles` locaux pour un usage sans réseau (v5.7.0).
- **Données d'Élévation (v5.8.17)** : Les tuiles d'élévation Terrain-RGB sont capées au zoom 14 max. Pour éviter les erreurs de calcul de pentes à LOD > 14, le worker utilise `elevSourceZoom` (zoom réel des données) pour calculer la taille des pixels des normal maps, pas le zoom d'affichage demandé.

### Données & APIs
- **Hydrologie 3D (v5.8.4)** : Restauration d'un moteur d'eau réaliste. Détection chromatique optimisée pour SwissTopo et vagues en **"Rouleaux Géants"** sans couture entre les tuiles grâce à l'utilisation des coordonnées mondiales absolues.
- **Bâtiments 3D (v5.8.5)** : Utilisation prioritaire de l'**API MapTiler Buildings (Vector Tiles)** pour la rapidité et la stabilité. Les données étant limitées nativement au Zoom 14, un système d'**Overzooming** recalcule les coordonnées pour les niveaux supérieurs. Basculement automatique (Fallback) vers l'API Overpass (OSM) en cas d'erreur ou de quota atteint.
- **Sentiers (MVT)** : Utilisation de tuiles vectorielles (**MVT/PBF**) au lieu de raster pour une netteté infinie et un rendu stylisé (v5.6.5).
- **Végétation Bio-Fidèle (v5.8.15)** : Sélection des essences d'arbres basée sur l'altitude réelle. Utilisation d'un **Dithered Scan** (échantillonnage aléatoire des pixels) pour éliminer le moiré et les bandes. Inclusion d'un **Filtre de Forêt Continue** capturant le fond clair et les symboles sombres de SwissTopo tout en excluant strictement les prairies lumineuses. Nouveauté (v5.8.15) : **Déterminisme Absolu** ; passage à un système de placement par **Pseudo-Random Déterministe** (basé sur les coordonnées mondiales) éliminant définitivement les coutures entre tuiles (net cuts) et les bandes vides.

## 🔋 Performance & Mobile

### Optimisations Énergétiques
- **Battery API** : Basculement automatique en mode "Eco" si la batterie descend sous les 20% (v5.7.1).
- **Deep Sleep** : Arrêt total du rendu (0 FPS) via la `Visibility API` quand l'onglet est masqué ou le téléphone verrouillé.
- **2D Turbo** : Mode spécifique avec élévation zéro et maillage plat (2 triangles/tuile), bridé à 30 FPS.

### Adaptabilité Matérielle
- **Light Shader** : Shader simplifié pour GPU Mali/Adreno mid-range, divisant par 4 la charge GPU (v4.5.46).
- **Adaptive Scan** : Réduction du pas de scan pour la végétation sur les appareils mobiles pour préserver le CPU (v4.5.45).

## 🕹️ Navigation & UX

### Mouvements de Caméra
- **Cinematic flyTo** : Trajectoire en "cloche" (parabolique) avec interpolation `easeInOutCubic` et vérification anti-collision en temps realtime (v4.6.0).
- **Adaptive Zoom (v5.8.6)** : Logique de saut intelligent de LOD lors des téléportations ou des déplacements rapides. Élimine le délai de chargement des paliers intermédiaires pour une netteté immédiate à l'arrivée.
- **Tilt Parabola** : L'inclinaison maximale de la caméra est dynamique ; elle atteint son pic au LOD 14 et se redresse automatiquement vers le sol à haute altitude pour masquer l'horizon vide (v4.5.56).
- **Navigation Tactile Google Earth (v5.11.0)** : `src/modules/touchControls.ts` — module autonome interceptant les **PointerEvents** (pas TouchEvents) en phase capture avant OrbitControls. Stratégie : désactive `controls.enabled = false` au premier contact, réactive à la fin. Gestes : 1 doigt = pan (avec inertie), 2 doigts centre-X = pan, 2 doigts centre-Y = tilt (phi), spread = zoom, angle = rotation azimut. Paramètres ajustables en tête de fichier : `PAN_SPEED`, `TILT_SPEED`, `INERTIA`, `ROT_DEADZONE`. **Erreur classique à NE PAS reproduire** : intercepter TouchEvents au lieu de PointerEvents — Three.js r160 OrbitControls utilise exclusivement les PointerEvents.

### GPS & Orientation
- **Origin Shift (Précision GPS)** : Recentrage dynamique complet du monde 3D (Seuil 35km) incluant la translation atomique de tous les objets : Caméra, Soleil, Marqueur, GPX, Forêts et Étiquettes pour une précision absolue longue distance (v5.8.3).
- **Lissage Boussole** : Filtre passe-bas (10%) sur les données de l'API `DeviceOrientation` pour supprimer les tremblements du cône de vue.

## 🗺️ Stratégies Cartographiques Spécifiques

### Unification Globale (LOD <= 10)
- **Problème** : Effet "patchwork" (Suisse verte, France blanche, Allemagne brune) à petite échelle.
- **Solution** : Forçage d'une source unique (MapTiler Topo ou OSM) au LOD <= 10. Les sources de précision (Swisstopo/IGN) ne s'activent qu'au LOD 11+ (v5.7.4).

### Sécurité API & Fallback OSM
- **Détection 403** : Détection dynamique des erreurs de clé MapTiler invalide (v5.7.4).
- **Auto-Switch** : Basculement instantané et global vers **OpenStreetMap Standard** si MapTiler est bloqué ou inaccessible.

## 🛠️ Guide de Débogage

| Symptôme | Cause Probable | Solution |
|----------|----------------|----------|
| Tuiles Noires (Est) | Clé MapTiler invalide/403 | Vérifier `state.MK` ou laisser le fallback OSM agir. |
| Saut de carte au dézoom | `updateVisibleTiles` sans args | S'assurer de passer la position caméra ou laisser le fallback par défaut (v5.7.4). |
| Voile rouge en 2D | Pentes activées par erreur | Vérifier le flag `is2DGlobal` dans `updateVisibleTiles`. |
| Bâtiments dans les lacs | Erreur Z-Mirror | Vérifier la correction d'altitude relative au relief dans `buildings.ts`. |
| Pentes tout rouge (LOD 15+) | Mauvais calcul normal map | Les données d'élévation sont capées au zoom 14. Le worker doit utiliser `elevSourceZoom` pour calculer la taille des pixels, pas le zoom demandé (v5.8.17). |
| Haptics silencieux Android | Permission VIBRATE manquante | Vérifier `<uses-permission android:name="android.permission.VIBRATE"/>` dans `AndroidManifest.xml` + `npx cap sync`. |
| FABs visibles par-dessus la timeline | Sélecteur CSS `~` cassé | Utiliser `body.timeline-open .fab-stack` (classe togglée dans `TimelineComponent`). Ne jamais utiliser `#bottom-bar.is-open ~ .fab-stack`. |
| Styles inline dans un nouveau composant | Mauvaise pratique | Utiliser les classes CSS namespaced et les design tokens. Jamais de `style.cssText` ou `element.style.property = 'valeur'` hardcodée. |
| FlyTo envoie au mauvais endroit (2e tracé+) | Origin shift pendant animation | `state.isFlyingTo` bloque l'origin shift. Coords flyTo toujours recalculées depuis lat/lon brut avec `state.originTile` courant (v5.10.0). |
| Tracé GPX passe sous le terrain | Waypoints GPS espacés → courbe lisse coupe la montagne | `gpxDrapePoints()` densifie (×4) + clamp `max(terrainAlt, elevGPX) + 30m`. Re-draping à +3s/+6s post-import (v5.10.0). |
| Tracé GPX visible mais au mauvais endroit | `layer.points` stale après origin shift | `scene.ts` itère sur `state.gpxLayers` et applique le même offset à `layer.points` (v5.10.0). |
| Touch 1 doigt tourne au lieu de panner | TouchEvents interceptés au lieu de PointerEvents | Three.js r160 OrbitControls utilise PointerEvents. Intercepter `pointerdown` en capture + `controls.enabled = false` (v5.11.0). |
| Touch 1 doigt gauche/droite = rotation | `camera.matrix` stale lors du calcul des axes | Utiliser `camera.quaternion` (toujours à jour) et non `setFromMatrixColumn` pour obtenir right/fwd (v5.11.0). |
| Violation CSP `frame-ancestors` via `<meta>` | Directive valide uniquement en HTTP header | Supprimer `frame-ancestors` du `<meta>` CSP — ne fonctionne que côté serveur. |
| Violations CSP domaines cartographiques | `connect-src` incomplet | Ajouter : `https://*.overpass-api.de` ET `https://overpass-api.de` (wildcard ≠ domaine racine), `https://overpass.kumi.systems`, `https://api.open-meteo.com`, `https://cloud.maptiler.com` (img-src). |
| Stats de performance : toggle ON mais rien ne s'affiche | `toggle()` = flip, désync état↔panel au démarrage | Utiliser `setVisible(val)` (setter exact). `VRAMDashboard.init()` appelle `setVisible(state.SHOW_STATS)`. Le callback de `bindToggle` utilise `setVisible` (v5.11.0). |
| Timeline slider ne met pas à jour les ombres en temps réel | `needsUpdate = false` quand ni animation ni mouvement caméra | Setter `state.isInteractingWithUI = true` dans le handler `input` du slider + debounce 150ms → render loop reste actif (v5.11.0). |
| App Android tuée en background pendant REC | Pas de Foreground Service → Android recycle l'activité | `RecordingService.java` (foregroundServiceType=location) + `RecordingPlugin.java` Capacitor. `startRecordingService()` au début du REC, `stopRecordingService()` à la fin (v5.11.0). |
| Barre de statut Android visible en plein écran | `onResume()` trop tôt — Android reset les insets au focus | Utiliser `onWindowFocusChanged(hasFocus=true)` pour `WindowInsetsController.hide(statusBars())` (v5.11.0). |

## 🚀 Commandes de Maintenance
- `npm test` : Lancer la suite de 145 tests unitaires (Vitest).
- `npm run check` : Vérifier le typage TypeScript (strict).
- `npm run deploy` : Suite complète avant livraison mobile.
