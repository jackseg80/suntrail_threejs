# SunTrail — Guide de Débogage (v5.19.6)

> Référence détaillée pour agents IA. Point d'entrée : [CLAUDE.md](../CLAUDE.md)
> Consulter ce fichier quand un bug est signalé ou qu'un symptôme visuel est observé.

---

| Symptôme | Cause Probable | Solution |
|----------|----------------|----------|
| Altitude affichée en double au clic | `getAltitudeAt()` retourne altitude × `RELIEF_EXAGGERATION` | Diviser par `state.RELIEF_EXAGGERATION` au moment du `textContent`. Voir `ui.ts` `#click-alt`. (v5.15.0) |
| Toast "Accès Pro activé" × 3 | Deux `showToast()` explicites + listener sans guard | Supprimer le toast dans `UpgradeSheet.ts`. `if (!state.isPro)` dans le listener. `grantProAccess()` = seule source. (v5.15.0) |
| Prix test Google Play "3.99€ for 5 minutes" | Google Play ajoute suffixe de période test au `priceString` | Regex de sanitisation dans `iapService.ts` `getPrices()`. Normal en production. (v5.15.0) |
| Panneau météo/solaire s'ouvre en bas | `trapFocus()` focus 1er élément via `setTimeout(50)` → browser scroll vers ce bouton | `setTimeout(() => { sheet.scrollTop = 0; }, 55)` dans `SheetManager.open()`. (v5.16.4) |
| `#settings-version` et Sources & Légal invisibles | `</div>` surnuméraire dans template fermait le container | Supprimer le `</div>` orphelin. Valider avec parse5. (v5.16.4) |
| Bande vide LOD 11+ (Schaffhausen, Forêt Noire, Tessin) | `isPositionInFrance()` avait `lon < 9.6` → tuiles Allemagne passaient en IGN → 404 | `lon < 8.3` France continentale + cas Corse `lat 41-43°N, lon 8.4-9.7°E`. (v5.16.3) |
| Spam MapTiler à LOD 6-10, arrêt de chargement | Toutes les tuiles LOD ≤ 10 appelaient MapTiler → 429 → désactivation globale | OpenTopoMap à `zoom <= 10`. `preloadChOverviewTiles()` désactivée. (v5.15.0) |
| Inclinomètre caché par la nav bar | `bottom: 80px` hardcodé | `bottom: calc(var(--bar-h) + var(--safe-bottom) + 16px)`. (v5.15.0) |
| Bouton 2D/3D introuvable dans NavigationBar | Bouton déplacé hors du template nav-bar | `document.querySelector('#nav-2d-toggle')` au lieu de `this.element.querySelector()`. (v5.15.0) |
| Tuiles Noires (Est) | Clé MapTiler invalide/403 | Vérifier `state.MK` ou laisser le fallback OSM agir. |
| Saut de carte au dézoom | `updateVisibleTiles` sans args | Passer la position caméra ou laisser le fallback par défaut. |
| Voile rouge en 2D | Pentes activées par erreur | Vérifier `is2DGlobal` dans `updateVisibleTiles`. |
| Bâtiments dans les lacs | Erreur Z-Mirror | Vérifier correction altitude relative au relief dans `buildings.ts`. |
| Pentes tout rouge (LOD 15+) | Normal map calcul avec zoom d'affichage | Worker doit utiliser `elevSourceZoom` pour taille pixels, pas le zoom demandé. (v5.8.17) |
| Haptics silencieux Android | Permission VIBRATE manquante | `<uses-permission android:name="android.permission.VIBRATE"/>` + `npx cap sync`. |
| FABs visibles par-dessus la timeline | Sélecteur CSS `~` cassé | `body.timeline-open .fab-stack`. Ne jamais utiliser `#bottom-bar.is-open ~ .fab-stack`. |
| FlyTo envoie au mauvais endroit (2e tracé+) | Origin shift pendant animation | `state.isFlyingTo` bloque l'origin shift. Coords recalculées depuis lat/lon brut. (v5.10.0) |
| Tracé GPX passe sous le terrain | Waypoints espacés → courbe coupe montagne | `gpxDrapePoints()` densifie ×4 + clamp `max(terrainAlt, elevGPX) + 30m`. Re-draping +3s/+6s. (v5.10.0) |
| Tracé GPX visible mais mauvais endroit | `layer.points` stale après origin shift | `scene.ts` itère `state.gpxLayers` et applique l'offset. (v5.10.0) |
| Touch 1 doigt tourne au lieu de panner | TouchEvents interceptés au lieu de PointerEvents | Intercepter `pointerdown` en capture + `controls.enabled = false`. (v5.11.0) |
| Touch 1 doigt gauche/droite = rotation | `camera.matrix` stale | Utiliser `camera.quaternion` (toujours à jour). (v5.11.0) |
| Tilt 2 doigts impossible — rotation | PointerEvents un pointeur à la fois → accumulation donne faux positifs | Détecter par **placement initial** : `|sin(angle)| < TILT_ANGLE` → `_tiltPreArmed=true`. (v5.11) |
| Zoom 2 doigts déclenche rotation | `ROT_DEADZONE` trop bas | 3 guards : `absDAngle > ROT_DEADZONE` + `> spreadDelta×0.5` + `×150 > |dy|`. (v5.11) |
| Violation CSP `frame-ancestors` via `<meta>` | Directive valide uniquement en HTTP header | Supprimer du `<meta>` CSP. |
| Stats de performance : toggle ON mais rien | `toggle()` = flip, désync au démarrage | Utiliser `setVisible(val)`. `VRAMDashboard.init()` appelle `setVisible(state.SHOW_STATS)`. (v5.11.0) |
| FPS counter absent au démarrage | `VRAMDashboard.init()` avant `initScene()` → `state.stats` null | `initScene()` appelle `state.vramPanel?.setVisible(state.SHOW_STATS)` après Stats.js. (v5.11) |
| `ENERGY_SAVER=false` malgré Phase 1 | `loadSettings()` restaure ancienne valeur avant `applyPreset()` | `applyPreset()` force `true` sur mobile (sauf Ultra). (v5.11) |
| Timeline slider ne met pas à jour ombres | `needsUpdate = false` sans animation/mouvement | `state.isInteractingWithUI = true` dans handler `input` + debounce 150ms. (v5.11.0) |
| App Android tuée en background pendant REC | Pas de Foreground Service | `RecordingService.java` (foregroundServiceType=location) + `RecordingPlugin.java`. (v5.11.0) |
| Barre de statut Android visible plein écran | `onResume()` trop tôt | `onWindowFocusChanged(hasFocus=true)` pour `WindowInsetsController.hide(statusBars())`. (v5.11.0) |
| Eau/météo consomme GPU sans interaction | `needsUpdate` toujours vrai | Accumulateurs + flag `*FrameDue` conditionne les renders. (v5.11 Phase 2) |
| GPU idle à 45-48fps Android WebView | `controls.update()` retourne `true` indéfiniment | Guard temporel 800ms + `tiltAnimating` source séparée. (v5.11.1) |
| Météo/pluie à 2-3fps malgré throttle 20fps | Accumulateurs après guard idle | Déplacer accumulateurs **avant** tous les `return` guards. (v5.11.1) |
| Canvas vide 1er démarrage Android | `sceneReady` dispatché avant tuiles chargées | `#map-loading-overlay` affiché sur `sceneReady`, caché quand `isProcessingTiles → false`. (v5.11.1) |
| Export GPX silencieux Android | `link.click()` + `blob://` ignoré par WebView | `@capacitor/filesystem` → `Filesystem.writeFile(Directory.Documents)`. (v5.11.1) |
| Toggle 2D→3D : tuiles plates en damier (LOD 14+) | Tuiles sans élévation (`elevUrl=null` → canvas vide) | `fetchAs2D = zoom <= 10` uniquement. `rebuildActiveTiles()` invalide cache sans `pixelData`. (v5.11) |
| Toggle 2D↔3D : écran blanc | `resetTerrain()` détruit matériaux GPU | `rebuildActiveTiles()` au lieu de `resetTerrain()`. Meshes reconstruits en place. (v5.11) |
| FlyTo ou GPS follow à 20fps | Couplés à `controlsDirty` → `false` après RAF interne | Conditions **standalone** dans `needsUpdate`. `!isFollowingUser` dans guard `isIdleMode`. (v5.11.1) |
| Bouton GPS suivi reste "actif" après flyTo | ID incorrect `gps-follow-btn` (inexistant) | Corriger en `gps-main-btn` + retirer classe `following`. (v5.11.1) |
| Artefact ombre pulsante eau LOD 17-18 | Amplitude vague ±3.7m dépasse la surface | Amplitude réduite ±0.9m, base mesh à `baseAlt + 2.0m`. (v5.11.1) |
| Tuiles blanches intermittentes | `trimCache()` évince tuiles en scène → `texture.dispose()` | `activeCacheKeys` Set — `trimCache()` cherche entrée non-active avant FIFO. (v5.11.1) |
| Idle throttle désactivé après clic GPS | `isFollowingUser=true` au 1er clic (centrage unique) | `isFollowingUser=true` uniquement au 2e clic (suivi continu). (v5.11.1) |
| GPS follow à 120fps sur flagship | Sans plafond propre quand `ENERGY_SAVER=false` | Guard `33ms` conditionnel `isFollowingUser && !ENERGY_SAVER`. (v5.11.1) |
| App démarre en LOD 12 au lieu de LOD 6 | `camera.position` trop basse | Vérifier `camera.position.set(0, 2000000, 2000000)`. (v5.11.2) |
| Bouton 2D non grisé au démarrage (LOD 6) | `syncLowZoomState()` non appelé en init | Appeler après `syncToggleVisual()` dans `NavigationBar.render()`. (v5.11.2) |
| Mode 3D restauré mais meshes plats LOD 10→11 | `rebuildActiveTiles()` non appelé | `syncLowZoomState()` doit appeler `rebuildActiveTiles() + updateVisibleTiles()`. (v5.11.2) |
| Flash blanc transitions de LOD | `updateVisibleTiles()` dispose TOUTES les tuiles de l'ancien LOD | **Ghost tiles** : fondu sortant 1.2s (`GHOST_FADE_MS`). **Ne JAMAIS `tile.dispose()` immédiatement** sur changement de LOD. (v5.13.9) |
| Chargement lent après changement LOD | Fetches HTTP ancien LOD saturent la bande passante | `cancelTileLoad(activeTaskId)` → `AbortController.abort()`. (v5.14.0) |
| GPS ne switche pas vers SwissTopo en Suisse | `hasManualSource = true` posé dans `loadSettings()` | **Ne jamais `hasManualSource = true` au chargement.** Inférer avec `AUTO_SOURCES`. (v5.13.8) |
| Panel SOS bloqué sur "Localisation en cours..." | `resolveAndDisplay()` attaché seulement au `#sos-btn-pill` | Pattern EventBus : `eventBus.on('sheetOpened', ...)`. (v5.13.8) |
| Galaxy Tab S8 (Adreno 730) détecté Balanced | Regex groupait Adreno 730 avec mid-range 6xx | Regex performance élargi `/7[3-9]\d\|80\d/`. (v5.16.8) |
| Prix Upgrade dupliqué | Defaults incluaient `/mois`, `/an` | Defaults nettoyés, regex strip sur prix RevenueCat. (v5.16.8) |
| Toggle 2D→3D sans animation | Pas d'animation caméra | `state.isTiltTransitioning` + lerp polar angle. (v5.16.8) |
| UI minuscule après rotation paysage→portrait | `renderer.setSize(w,h)` posait `canvas.style.width` en pixels paysage | `#canvas-container { overflow: hidden }` + `canvas { width:100%!important }` + `setSize(w,h,false)`. **⚠️ Ne JAMAIS `setSize()` sans `false`. Ne JAMAIS toucher `<meta viewport>` en JS.** |
| Profil d'élévation non fermable / sous boussole | Panel `position:fixed` trop haut | Tiroir swipe-to-dismiss, repositionné juste au-dessus du menu nav. (v5.16.8) |
| Prix EUR en Suisse dans panneau PRO | HTML template hardcode €3.99 | Placeholder `—` dans HTML/JS, sous-titre dynamique RevenueCat, cache 5min. (v5.18.0) |
| Prix `—` dans panneau d'achat mobile | `getPrices()` appelé avant fin init RevenueCat | `iapService.waitForInit(5s)`. `_pricesLoaded` posé si prix réels reçus. (v5.19.2) |
| Blanc intérieur montagne au tilt max LOD 14+ | Terrain = PlaneGeometry simple face, pas de ground plane | Ground plane 500k×500k à y=-200, fog=true, depthWrite=false. **Ne pas DoubleSide**. (v5.18.0) |
| Boussole ne se met pas à jour | `renderCompass()` dans bloc `if (needsUpdate)` → throttlé 20fps | `renderCompass()` avant les return guards + throttle propre 30fps. (v5.18.0) |
| Recherche "Sommets" retourne villes/pays | Tab recherchait tout, 2 zooms hardcodés | Classification par type, zoom adaptatif, filtres chips, Overpass peaks par nom. (v5.18.0) |
| Recherche très lente (Overpass bloque) | `searchPeaksByName()` lancé sur filtre "Tout" | Overpass **uniquement** sur filtre "Montagnes". Timeout 5s. (v5.18.0) |
| Sheets ne se ferment pas au clic carte | `handleMapClick()` ne fermait que `layers-sheet` | Ferme tout sheet actif via `sheetManager.getActiveSheetId()`. (v5.18.0) |
| Panneau PRO invisible PC/web | `renderWebFallback()` injecte dans `.sheet-content` au lieu de `.upgrade-content` | Sélecteur corrigé. (v5.18.0) |
| Météo affiche numéro de rue | `locationName.split(',')[0]` garde la rue | `extractLocationName()` parse contexte structuré MapTiler. (v5.19.1) |
| Soleil/ombres fixes sur la Suisse | `sun.ts:37` utilisait `state.TARGET_LAT/LON` fixe | `updateSunPosition()` dérive depuis `worldToLngLat(controls.target)`. Throttle 1s. (v5.19.1) |
| Spam 429 MapTiler épuise quota | `fetchGeocoding` sans backoff + `fetchWeather` pendant pan | Backoff global 30-60s, `fetchWeather` bloqué pendant interaction, 429 séparé du 403. (v5.19.0) |
| 3D plate mobile (terrain sans relief) | WebView cache les réponses 429 MapTiler | Vider cache Android : Paramètres → Applis → SunTrail → Stockage → Vider le cache. (v5.19.2) |
| Pas de relief (tuiles altitude 0 mélangées) | Rate limit 429 sur `terrain-rgb-v2` | Rotation de clés via Gist + backoff. **Ne pas recharger en boucle**. (v5.19.0) |
| LOD bloqué 14-15 sur montagnes en 2D | `getIdealZoom(dist)` utilise distance 3D brute | `heightAboveGround` en 2D, terrain-aware en 3D. Target.y suit la surface. (v5.19.0) |
| Caméra traverse les montagnes 3D LOD 17-18 | Tilt caps fixes | Tilt caps resserrés (0.85→0.40) + réduction dynamique par élévation. Range +1 si tilt > 0.4 rad. (v5.19.0) |
| flyTo s'écrase dans la montagne | `flyDuration` passé comme `targetDistance` | 5ème paramètre séparé. Parabole adaptative `max(5000, maxElev*0.8)`. Guard +200m. (v5.19.0) |
| REC GPS : crash perd les données | `clearInterruptedRecording()` sans restaurer | Recovery async + prompt "Restaurer/Supprimer". **Jamais de gate Pro dans la restauration.** (v5.19.1) |
| Inclinomètre invisible / bouge au tap | z-index 30 + drag trop sensible | z-index 2100. Drag après hold 300ms seulement, seuil annulation 20px. (v5.19.1) |
| Panel draggable bouge au survol souris | `pointermove` sans `pointerdown` actif | Guard `isActive` dans `draggablePanel.ts`. (v5.19.1) |
| Écran blanc mobile offline | Aucune détection réseau auto | `@capacitor/network` + probe HEAD + échecs tuiles (3 consécutifs → offline). `ACCESS_NETWORK_STATE`. (v5.20) |
