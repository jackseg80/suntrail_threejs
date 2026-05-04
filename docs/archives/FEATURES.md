# 📋 Fonctionnalités de SunTrail 3D (v5.53.2)

Ce document dresse la liste exhaustive des capacités techniques et fonctionnelles du moteur SunTrail.

---

### 🌍 Moteur 3D & Terrain
*   **Moteur Asynchrone (WebWorkers)** : Déportation du téléchargement et du décodage des tuiles vers un pool de WebWorkers (4 mobile / 8 desktop) pour une fluidité totale.
*   **Architecture Découplée (Event Bus)** : Communication inter-modules via un bus d'événements centralisé.
*   **Rendu de Relief Dynamique (LOD)** : Terrain 3D haute performance (MapTiler/OSM) avec LOD progressif (6 à 18).
*   **Support Multi-Source Topo** : Basculement automatique entre **SwissTopo** (Suisse), **IGN** (France), et **OpenTopoMap** (Monde) selon la position.
*   **Hybride 2D/3D Adaptatif (Turbo Engine)** : Bascule 2D optimisée à haute altitude (LOD ≤ 10) et 3D détaillée au sol.
*   **Carte des Pentes HD** : Shader personnalisé avec correction de latitude pour une précision de 30° parfaite dans les Alpes. Jaune 30° / Orange 35° / Rouge 40°+.
*   **Hydrologie & Végétation** : Moteur GPU pour l'eau (ondulations/reflets) et placement déterministe des forêts (Feuillus, Sapins, Mélèzes).
*   **Ghost Tiles & Ground Plane** : Transitions de LOD fluides (1.2s fondu) et plan anti-blanc pour éliminer les artefacts.
*   **Caméra Terrain-Aware** : LOD calculé sur la hauteur réelle au sol, tilt caps dynamiques et protection anti-clipping.

### ☀️ Simulation & Analyse Solaire — *L'innovation SunTrail*
*   **Ombres portées en temps réel sur le relief** : Projection des ombres du soleil sur le terrain 3D réel. Permet de voir l'ombre d'une montagne sur un bivouac ou un sentier.
*   **Détection de Forêts (v5.52.8)** : Identification de la canopée dans l'analyse solaire. Bande verte 🌲 dans le profil et overlay 3D. Exclut l'exposition UV sous les arbres.
*   **Éphémérides Précises (SunCalc)** : Positions Soleil/Lune en temps réel basées sur GPS/Date/Heure.
*   **Soleil mondial** : Les ombres sont correctes partout sur le globe.
*   **Analyse Solaire Pro** :
    *   Timeline 24h avec courbe d'altitude solaire et zones d'ombre terrain.
    *   Heure précise lever/midi/coucher, Heure Dorée, phases lunaires.
    *   **Optimal Departure (v5.52.3)** : Calcul du meilleur créneau de départ (5h-12h) selon l'ensoleillement et les conditions.
    *   Azimut + boussole SVG temps réel, rapport copiable.
*   **Calendrier Solaire Pro** : Simulation pour n'importe quel jour de l'année (passé/futur).

### 🧭 Navigation & Exploration
*   **Planificateur d'Itinéraire Mondial (GRATUIT — v5.50)** : 
    *   Pose de waypoints par appui long (500ms).
    *   Calcul automatique (OpenRouteService / OSRM).
    *   Markers 3D orange interactifs (tap pour supprimer).
    *   Stats : Distance, D+, D-, temps Munter estimé.
*   **Gestes tactiles Google Earth** : Pan, zoom (pinch), rotation (twist), tilt (2 doigts).
*   **Suivi GPS Haute Précision** : Centrage pixel-perfect sur le relief à 60 FPS.
*   **Boussole 3D** : Scène Three.js synchronisée avec animation reset-North.
*   **Recherche hybride** : Géocodage MapTiler/Nominatim + Sommets locaux. Classification intelligente et filtres chips.
*   **Moteur de Sommets (Peaks Engine)** : Indexation locale des sommets > 1000m avec cache 7 jours.
*   **Enregistrement GPS Ultra-Robuste (v5.53)** :
    *   Processus Android séparé (`:tracking`) pour survivre au kill de l'app.
    *   Opt-in exemption optimisation batterie.
    *   Récupération automatique après crash. Export GPX.

### 🧠 Trail Intelligence — Analyse Intelligente
*   **Cotation GPX Pro** : Difficulté CAS T1-T6 + UIAA, temps par segment, pente max/moyenne.
*   **Tracé 3D Coloré par Pente** : Vertex colors vert → rouge sur le tube GPX.
*   **Épaisseur Dynamique (v5.40)** : Trace GPX s'adaptant au zoom (Komoot-style) pour rester visible à toute altitude.
*   **Segmentation & Point demi-effort** : Découpage en segments homogènes et marqueur à 50% du temps Munter.
*   **Exposition solaire Pro** : Barre détaillée ombre/soleil/forêt par km sous le profil.
*   **Alertes sécurité (FREE)** : Risque avalanche, windchill, nuit sur le tracé, orage, coup de chaleur.
*   **Estimation physio Pro** : Hydratation (L), calories (Pandolf), VAM cible.

### 🌲 Environnement & Urbanisme
*   **Végétation Bio-Fidèle** : Forêts diversifiées selon l'altitude, sans couture entre tuiles.
*   **Bâtiments 3D (Pro)** : Données vectorielles PBF/SwissTopo. Empreintes précises et toits 3D.
*   **Points d'Intérêt (POI)** : Panneaux, refuges, cols via API PBF (v5.38). Icônes différenciées (belvédères, abris).
*   **Météo Dynamique** : Particules GPU (pluie/neige) avec vent réel.
*   **Station Météo Pro** : 12 stats (UV, Isotherme 0°C, Rafales, etc.), prévisions 3 jours, Alerte Montagne et Indice Confort.

### ⚡ Performance & Optimisation Mobile
*   **Presets de Performance** : Eco, Balanced, Performance, Ultra avec détection GPU.
*   **Zero-Allocation Pattern (v5.40)** : Suppression des allocations dans la render loop pour zéro micro-saccades.
*   **Auto-Eco Mode** : Bascule sous 20% de batterie.
*   **Deep Sleep & Idle Throttle** : Arrêt total GPU si caché, 20fps si inactif.
*   **Adaptive DPR** : Pixel ratio 1.0 pendant les mouvements, restaure la netteté à l'arrêt.
*   **Gestion VRAM** : `disposeObject()` strict pour prévenir les fuites.

### 🛠️ Outils Spécialisés & Sécurité
*   **Architecture Offline-First** : Cache PWA, packs hors-ligne illimités (Pro), support PMTiles.
*   **Détection réseau intelligente** : Monitoring natif, auto-sync `IS_OFFLINE`, toasts de statut.
*   **Générateur SOS SMS** : Coordonnées, altitude, batterie. Gratuit.
*   **Inclinomètre numérique Pro** : Pente terrain en ° et % avec danger avalanche interactif.
*   **Profil d'élévation interactif** : SVG fluide, survol synchronisé, affichage heure d'arrivée (v5.52).
*   **Tutoriel onboarding v6 (v5.52)** : 6 slides pédagogiques plein écran avec animations SVG.
*   **i18n** : FR, DE, IT, EN avec fallback.

### 💰 Modèle Freemium
*   **Gate features** : RevenueCat integration. LOD 18, Sat, 3D Buildings, Solar Calendar, Pro Weather/Analysis, Inclinometer, Multi-GPX.
*   **Limites Gratuites** : 1 GPX importé, 25 km d'itinéraire planifié.
*   **Mode testeur** : 7 taps sur la version pour débloquer temporairement le Pro.

### ♿ Accessibilité (Lighthouse 100/100/100)
*   ARIA labels, contraste WCAG AA, touch targets ≥ 48px, 100% accessible clavier/lecteur d'écran.
