# 📋 Fonctionnalités de SunTrail 3D (v5.19.2)

Ce document dresse la liste exhaustive des capacités techniques et fonctionnelles du moteur SunTrail.

---

### 🌍 Moteur 3D & Terrain
*   **Moteur Asynchrone (WebWorkers)** : Déportation du téléchargement et du décodage des tuiles vers un pool de WebWorkers (4 mobile / 8 desktop) pour une fluidité totale sans blocage du thread principal.
*   **Architecture Découplée (Event Bus)** : Utilisation d'un bus d'événements centralisé pour la communication entre les modules Terrain et Scène.
*   **Rendu de Relief Dynamique (LOD)** : Affichage du terrain 3D haute performance via MapTiler et OpenStreetMap avec un système de niveau de détail progressif (LOD 6 à 18).
*   **Support IGN France** : Basculement automatique vers les services officiels de la Géoplateforme pour une précision maximale en France.
*   **Hybride 2D/3D Adaptatif (Turbo Engine)** : Bascule automatique entre un rendu 2D optimisé à haute altitude (LOD ≤ 10) et une 3D détaillée au sol. Animation de tilt fluide lors du toggle 2D↔3D.
*   **Carte des Pentes** : Shader personnalisé calculant et affichant les pentes en temps réel (Jaune 30° / Orange 35° / Rouge 40°+).
*   **Hydrologie par Shader (Pure Alpin)** : Moteur 100% GPU détectant les surfaces d'eau avec ondulations et reflets dynamiques.
*   **Ghost Tiles** : Transitions de LOD fluides — les tuiles sortantes restent visibles avec fondu 1.2s pendant le chargement des nouvelles.
*   **Ground Plane** : Plan de sol anti-blanc sous le terrain pour éliminer les artefacts visuels aux inclinaisons extrêmes.
*   **Caméra terrain-aware (v5.19.0)** : LOD calculé en fonction de la hauteur au sol (pas la distance absolue), tilt caps dynamiques et protection anti-clipping montagne.

### ☀️ Simulation & Analyse Solaire — *Le cœur de SunTrail*
*   **Ombres portées en temps réel sur le relief** : SunTrail est la seule application de randonnée qui projette les ombres du soleil sur un terrain 3D réel — pas une approximation plate, mais un calcul topographique qui montre exactement quand une vallée, un bivouac ou un sentier est à l'ombre ou au soleil. Indispensable pour planifier un départ, choisir un emplacement de bivouac, ou éviter un passage exposé en pleine chaleur.
*   **Éphémérides Précises** : Calcul en temps réel des positions du Soleil et de la Lune (SunCalc) basé sur la date, l'heure et les coordonnées GPS.
*   **Soleil mondial (v5.19.1)** : La position du soleil suit le centre de la carte, pas un point fixe. Les ombres sont correctes partout dans le monde.
*   **Transitions Solaire Ultra-Lisses** : Courbes de luminosité monotones parfaites entre Heure Dorée, Crépuscule et Nuit, avec transition Lune.
*   **Phases Lumineuses & Couleurs** : Identification de l'Heure Dorée, du Crépuscule civil/nautique/astronomique, de la phase lunaire.
*   **Analyse Solaire — Tier Gratuit** : Durée d'ensoleillement total + heure du premier rayon + timeline 48 barres (nuit/ombre/soleil).
*   **Analyse Solaire Pro** : Lever/midi solaire/coucher à la minute, fenêtres Heure Dorée matin+soir, durée du jour, azimut + boussole SVG en temps réel, élévation + barre de progression, phase lunaire + emoji, graphique SVG 24h (courbe altitude, zones colorées, ombres terrain, marqueur courant), rapport copiable complet. Mise à jour temps réel pendant le drag du slider.
*   **Calendrier Solaire Pro** : Simulation des ombres pour n'importe quel jour de l'année (passé et futur) — le tier gratuit est limité à la journée en cours.

### 🧭 Navigation & Exploration
*   **Gestes tactiles Google Earth** : Pan (1 doigt avec inertie), zoom (pinch vers le centre des doigts), rotation (twist), tilt (2 doigts côte à côte) — détection par placement initial des doigts.
*   **Suivi GPS Haute Précision** : Centrage "pixel-perfect" sur l'altitude réelle du relief et interpolation haute fréquence (60 FPS).
*   **Boussole 3D** : Scène Three.js dédiée (120×120px), synchronisée avec la caméra en temps réel, animation reset-to-North en 800ms.
*   **Vol Cinématique (`flyTo`)** : Trajectoires de caméra paraboliques avec protection anti-collision dynamique et zoom adaptatif au terrain.
*   **Recherche hybride (v5.18.0)** : Géocodage MapTiler/Nominatim + filtrage local des sommets. Classification automatique (pays/région/ville/village/sommet/POI) avec zoom adaptatif. Filtres chips : Tout, Villes, Montagnes, Pays. Recherche Overpass pour les sommets par nom.
*   **Moteur de Sommets (Peaks Engine)** : Indexation locale des sommets > 1000m avec cache intelligent 7 jours.
*   **Enregistrement de Tracé GPS** : Capture de points GPS en temps réel (seuil > 50cm) avec export GPX. Foreground Service Android pour enregistrement écran éteint. Récupération automatique des points après crash/kill Android (v5.19.1).

### 🌲 Environnement & Urbanisme
*   **Végétation Bio-Fidèle** : Diversification des forêts avec 3 essences (Feuillus, Sapins, Mélèzes) selon l'altitude réelle. Placement déterministe par coordonnées mondiales — pas de coutures entre tuiles.
*   **Bâtiments 3D (Pro)** : MapTiler Vector Tiles + fallback Overpass. Overzooming au-delà du zoom 14 natif. Fusion de géométries pour performances maximales.
*   **Points d'Intérêt (POI)** : Affichage hiérarchisé des panneaux, refuges et cols via Overpass API.
*   **Météo Dynamique** : Moteur de particules GPU (ShaderMaterial, 15k particules max) pour pluie et neige avec physique du vent réel (direction + vitesse depuis Open-Meteo). Throttle 20fps pour économiser le GPU.
*   **Bulletin Météo — Tier Gratuit** : Nom du lieu + température + icône en pastille. 4 stats (temp, ressenti, vent, humidité) + scroll 12h.
*   **Station Météo Pro** : Conditions actuelles complètes (grille 3 colonnes : dew point, UV Index coloré ANSES, couverture nuageuse, vent + flèche SVG direction, rafales, visibilité, isotherme 0°C, probabilité précipitations), scroll 24h enrichi, graphique SVG température 24h, prévisions 3 jours, Alerte Montagne (isotherme vs altitude + Indice Confort Rando composite), bouton "Copier le rapport".


### ⚡ Performance & Optimisation Mobile
*   **Presets de Performance** : 4 modes prédéfinis (Eco, Balanced, Performance, Ultra) avec détection GPU automatique (52 patterns : Intel, AMD, NVIDIA, Adreno, Mali).
*   **Auto-Eco Mode (Battery API)** : Surveillance du niveau de charge et bascule automatique en profil Éco sous les 20% de batterie.
*   **Deep Sleep réel** : `setAnimationLoop(null)` sur `visibilitychange hidden` — arrêt total du GPU quand l'écran est verrouillé ou l'app minimisée.
*   **Idle Throttle 20fps** : Limitation automatique après 800ms sans interaction. Accumulateurs eau/météo indépendants pour animations fluides même throttlées.
*   **Adaptive DPR** : Réduction du pixel ratio à 1.0 pendant les gestes tactiles sur mobile, restauré après 200ms d'inactivité.
*   **Gestion Rigoureuse de la VRAM** : Système `disposeObject()` pour prévenir les fuites de mémoire vidéo. Protection des tuiles actives dans le cache LRU.
*   **AbortController** : Annulation HTTP des fetches de tuiles lors des changements rapides de LOD.
*   **Persistance des Réglages** : Sauvegarde et restauration automatique des préférences via `localStorage` avec versioning.

### 🛠️ Outils Spécialisés & Sécurité
*   **Architecture Offline-First (PWA)** : Mise en cache complète des assets et des tuiles cartographiques. Zones téléchargeables pour usage hors réseau. Support PMTiles natif.
*   **Générateur SOS SMS** : Outil de secours générant un message texte avec coordonnées GPS, altitude, niveau de batterie et horodatage. Gratuit et toujours accessible.
*   **Inclinomètre numérique Pro** : Pente du terrain en ° et % avec alerte couleur (blanc/jaune/orange/rouge). Tap pour panel détail (direction de pente en boussole, niveau de danger). Repositionnable par drag (v5.19.1).
*   **Profil d'élévation interactif** : Courbe SVG avec gradient, survol affichant distance/altitude/pente. Marqueur 3D cyan synchronisé. Panel déplaçable avec swipe-to-dismiss.
*   **Panels déplaçables (v5.19.1)** : Timeline, profil d'élévation et pastille de coordonnées repositionnables par maintien + glissement. Double-tap pour reset.
*   **Support GPX Pro** : Importation et exportation de traces multiples avec statistiques avancées (VAM, pente moyenne, estimation Naismith).
*   **i18n** : 4 langues (FR, DE, IT, EN) avec fallback automatique et rechargement live.

### 💰 Modèle Freemium (v5.14+)
*   **Gate features** : `state.isPro` vérifié côté client via receipt RevenueCat — LOD > 14, satellite, bâtiments 3D, calendrier solaire, analyse solaire Pro, météo Pro, inclinomètre, multi-GPX, export GPX, REC illimité, offline illimité.
*   **UpgradeSheet 3 plans** : Mensuel, Annuel ⭐ mis en avant (7 jours gratuits), Lifetime — prix dynamiques localisés via RevenueCat (devise locale du Play Store).
*   **Upsell contextuel** : Toast LOD 14, badge Pro tuile satellite, hint timeline calendrier, alerte REC, banner upsell dans Analyse Solaire et Météo, jours 2-3 météo grisés.
*   **Mode testeur** : 7 taps sur le numéro de version dans Réglages Avancés — toggle `isPro` en RAM uniquement (non persisté, reset au redémarrage).

### ♿ Accessibilité (Lighthouse 100/100/100)
*   `aria-labelledby` sur tous les dialogs, `aria-label` sur tous les contrôles interactifs
*   `:focus-visible` sur tous les éléments focusables
*   Contraste WCAG AA vérifié
*   Touch targets ≥ 48px
*   13 tests automatisés axe-core
