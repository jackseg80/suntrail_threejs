# SunTrail — Roadmap (v5.73.0)

## v5.56.2 (2026-05-31) — ✅ Complété

### Historique GPX & Dette Technique

- ✅ **Historique GPX persistant** — 5 derniers imports/REC en localStorage, mini-carte canvas
- ✅ **Fusion panneaux GPX** — Liste unifiée (historique + layers actifs + routes manuelles)
- ✅ **Reverse geocoding automatique** — Nom de lieu (MapTiler/Nominatim) + fallback pays 55 pays
- ✅ **Bouton profil toggle** — État actif, ouvrir/fermer le panneau d'élévation
- ✅ **Types GPX centralisés** — `gpxTypes.ts`, `GeoPoint`, `GPXRawData`, `getElevation()`
- ✅ **Dette technique** — `disposeTrackMesh`, `getPerformanceEpsilonMultiplier`, `createGlassModal`, cache localStorage, build-before-dispose REC mesh

## v5.56.1+ (Sources HD par pays)

### Cartes gouvernementales HD gratuites

Ajout de sources de tuiles WMTS gratuites (Open Government Data) pour les pays de randonnée.
Architecture data-driven : une entrée dans `COUNTRY_SOURCES` suffit, la détection par polygones
Natural Earth est automatique.

**Implémenté :**
- ✅ Suisse (SwissTopo) — `wmts.geo.admin.ch`
- ✅ France (IGN Geoplateforme) — `data.geopf.fr`
- ✅ Autriche (basemap.at) — `mapsneu.wien.gv.at`
- ✅ Allemagne (BKG TopPlusOpen) — `sgx.geodatenzentrum.de`
- ✅ Espagne (IGN España) — `www.ign.es`
- ✅ Norvège (Kartverket) — `cache.kartverket.no/v1/service` (nouveau CDN, accessible mondialement)

### Pays testés mais endpoints inaccessibles (à vérifier localement)

Testé le 2026-05-26 depuis l'étranger. Tous nécessitent une vérification locale
(depuis un navigateur situé dans le pays ou un VPN).

| Pays | Source | Code | Cause probable |
|------|--------|------|----------------|
| 🇨🇿 République Tchèque | ČÚZK ZM | 404 | Endpoint ArcGIS changé |
| 🇵🇱 Pologne | Geoportal 2 | 404 | API migrée |
| 🇸🇰 Slovaquie | ZBGIS | 404 | Endpoint changé |
| 🇫🇮 Finlande | MML maastokartta | 401 | Auth requise |
| 🇸🇪 Suède | Lantmäteriet | 503 | Service down |

**Comment activer :** Tester l'URL depuis l'app/navigateur local → si OK, décommenter
l'entrée dans `COUNTRY_SOURCES` et le helper dans `tileSources.ts`.

### Pays nécessitant des prérequis

| Pays | Source | Prérequis |
|------|--------|-----------|
| 🇸🇮 Slovénie | GURS | URL WMTS à trouver (recherche docs GURS) |
| 🇮🇹 Italie | Geoportale Nazionale | Pas de WMTS national de qualité rando |
| 🇮🇹 Piémont | BDTRE (Région Piemonte) | EPSG:32632 uniquement (pas Web Mercator) — reprojection nécessaire |
| 🇮🇹 Südtirol | MapProxy BZ | 60+ couches EPSG:3857 mais couverture régionale seulement |
| 🇬🇧 Royaume-Uni | Ordnance Survey | Clé API gratuite à configurer |
| 🇯🇵 Japon | GSI Maps | Étendre `countries.ts` à l'Asie (ingest Asia) |
| 🇳🇿 Nouvelle-Zélande | LINZ Topo50 | Clé API gratuite à configurer |
| 🇺🇸🇨🇦 USA/Canada | USGS/NRCan | Faible priorité rando Europe |

### URLs trouvées (prêtes dans `tileSources.ts`)

```
CZ: https://ags.cuzk.gov.cz/arcgis/rest/services/ZM/MapServer/WMTS/tile/1.0.0/ZM/default/GoogleMapsCompatible/{z}/{y}/{x}.png
PL: https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0
SK: https://zbgisws.skgeodesy.sk/zbgisservices/wmts/service.svc/get?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0
FI: https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png
SE: https://api.lantmateriet.se/open/topowebb-ccby/v1/wmts/tile/1.0.0/topowebb/default/web_mercator/{z}/{y}/{x}.png
JP: https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png
```

### Pour reprendre

1. Vérifier les URLs WMTS depuis un navigateur/navire dans le pays cible
2. Décommenter le helper URL dans `tileSources.ts` (ex: `cuzkTopo()`, `gsiJpTopo()`)
3. Décommenter l'entrée dans `COUNTRY_SOURCES`
4. Ajouter les tests dans `tileLoader.test.ts` + `terrain.source.test.ts`
5. Lancer `npm test` — 859+ tests doivent passer

**Futur — Vectoriel partiel (labels superposés) :** Tentative le 2026-05-28 d'implémenter
des labels vectoriels via tuiles PBF (Swisstopo `base.vt`, IGN `planign`, MapTiler v3)
superposés en sprites Three.js Canvas. Abandonné — problèmes non résolus :

- **Doublons** : labels vecto + labels raster se superposent, opacité conditionnelle au
  zoom insuffisante pour éviter la redondance visuelle.
- **Parallax** : sprites 3D se déplacent différemment du terrain lors du pan (décalage
  de perspective entre le sprite et le mesh de la tuile).
- **Densité** : tuiles vectorielles contiennent trop d'entités (centaines de communes),
  nécessite un filtrage agressif par admin_level qui devient spécifique à chaque source.
- **Sources** : endpoints PBF hétérogènes (schémas de couches incompatibles entre pays),
  absence de tuiles vectorielles pour l'Allemagne (BKG raster-only), Suisse LightBaseMap
  inaccessible (geoblock probable).

**Pistes alternatives à explorer :**
- Rendu HTML/CSS overlay (CSS3DRenderer) au lieu de sprites 3D — éliminerait le parallax
  mais coût perf élevé.
- Remplacer les sources raster avec labels par des sources raster sans labels + overlay
  vecto (nécessite des endpoints "no labels" que peu de fournisseurs proposent).
- Améliorer la lisibilité des labels raster existants (upscaling @2x, sharpening shader).

---

---

### v5.70.0 - v5.73.0 — ✅ Packs Pays & Optimisations

- ✅ **Packs Pays** : Suisse v3 (664 Mo), France Alpes v2 (515 Mo), Autriche v2 multi-source (985 Mo)
- ✅ **Data-driven inPackZone** : `hasInstalledPackForCountry()` remplace `(inCH||inFR)` codé en dur
- ✅ **Badge LOD cliquable** : détection automatique du pack couvrant la position
- ✅ **Cache partitionné** : `OFFLINE_CACHE_NAME` séparé + index O(1) + warmup au démarrage
- ✅ **Pools matériaux/géométries adaptatifs** : eco:6→ultra:24 (matériaux), 32→128 (géométries)
- ✅ **Normal map RG compact** : VRAM -50% pour les normales (stockage 2 canaux, reconstruction GPU)
- ✅ **Timeout 30s** sur `tile.load()` : évite blocage indéfini
- ✅ **Race condition cache** : `initCacheLayer()` appelé avant `loadTerrain()`
- ✅ **Tests P0** : `initCacheLayer`, `resetTileLoaderState`, `hasInstalledPackForCountry`, `getMinPackZoom`, `inPackZone` (+20 tests)

---

### Paiements Web — Restauration par Email

**Problème critique :** Un utilisateur qui paie via Stripe sur web perd l'accès s'il change de navigateur ou vide le cache (App User ID aléatoire en localStorage).

**Solution :** Email-based restauration sans login obligatoire.

**Logique :**
1. Après paiement Stripe → proposer d'entrer son email (optionnel mais recommandé)
2. Stocker email dans `localStorage` + utiliser comme App User ID RevenueCat
3. À chaque démarrage web → vérifier email en localStorage ; si présent, l'utiliser
4. Ajouter bouton "Restaurer achats par email" dans UpgradeSheet pour retrouver les achats

**Fichiers :**
- `src/modules/iapService.ts` : post-paiement demander email, initialisation App User ID depuis email localStorage
- `src/modules/ui/components/UpgradeSheet.ts` : bouton "Restaurer par email"
- `src/modules/packManager.ts` : même logique pour les packs

**Avantages :**
- ✅ Non-invasif (pas de login obligatoire)
- ✅ Protège immédiatement les utilisateurs qui entrent email
- ✅ Permet restauration si cache vidé
- ✅ Fondation pour OAuth optionnel plus tard

**Effort :** 2-3h

---

## v5.79.0 — Upgrade Three.js 0.160 → 0.184 ✅ (2026-06-20)

> Plan détaillé : [docs/plans/UPGRADE_THREEJS_184.md](docs/plans/UPGRADE_THREEJS_184.md)

### Objectif

Upgrade de Three.js de la version 0.160.1 à 0.184.0 (24 versions d'écart) en conservant `WebGLRenderer`. Prérequis indispensable pour la migration WebGPU ultérieure (v6.5/v7.0).

### Phases

| Phase | Description | Durée |
|---|---|---|
| A | Audit des changelogs r160→r184 (12 domaines critiques) | 0.5 j |
| B | Upgrade par 5 paliers (r165→r170→r175→r180→r184) avec gate Android à chaque palier | 2.0 j |
| C | Vérification visuelle des 23 systèmes de rendu | 1.5 j |
| D | Tests 7 plateformes (desktop + mobile + WebView Capacitor) | 2.5 j |
| E | Release (version, changelog, docs, tag) | 0.5 j |
| **Total** | | **7.0 j** |

### MR séparées (post-upgrade ✅)

| MR | Package | Actuel → Cible |
|---|---|---|
| MR-A | `suncalc` | 1.9.0 → 2.0.0 ✅ |
| MR-B | `typescript` | 5.9.3 → 6.0.3 ✅ |
| MR-C | `@mapbox/vector-tile` + `pbf` | 2.0.4 → 3.0.0 / 4.0.1 → 5.1.0 ✅ |
| MR-D | `@revenuecat/purchases-capacitor` | 12.3.0 → 13.2.0 ✅ |

### Points de vigilance

- `logarithmicDepthBuffer` sur Mali G71/G72 (S9/S10) — bug connu `gl_FragDepth` ignoré → z-fighting
- `onBeforeCompile` GLSL injection — noms de chunks internes (`#include <begin_vertex>`, etc.) peuvent avoir changé
- `ShaderMaterial` météo — dépend de `logdepthbuf_*` chunks
- `compass.ts` mini-renderer indépendant — contexte WebGL séparé à vérifier

---

## v6.0+ (Moyen terme)

### Authentification Utilisateur Optionnelle

**Objectif :** Accès cross-device transparent aux achats (navigateur → navigateur, app → web, etc.).

**Approches :**
1. **Login Email Léger** : email + lien de confirmation (sans password)
2. **OAuth** : Google/Apple Sign-in (transparent, UX meilleure)
3. **WebAuthn** : biométrie/clé sécurité (futur)

**Bénéfices :**
- Utilisateur login → retrouve Pro/packs sur tous les appareils
- Sync avec Android via même email RevenueCat
- Préparation pour sync cloud (sauvegardes traces, préférences, etc.)
- Analytics utilisateur (améliore monétisation)

---

## v6.0+ (Moyen-long terme)

### Autres Features Payantes

- **Intégration Strava/Komoot** : auto-import traces (Pro)
- **Cloud Sync** : sauvegardes traces/marque-pages (Pro)
- **API Publique** : accès données via webhook (Professionnel/B2B)
- **Marque-pages Collaboratifs** : partage itinéraires entre randonneurs (Pro)

---

## v6.5 — WebGPU Expérimental (opt-in debug)

> Prérequis : v5.79.0 (Three.js 0.184). Plan détaillé : [docs/plans/UPGRADE_THREEJS_184.md](docs/plans/UPGRADE_THREEJS_184.md)

### Objectif

Activer `WebGPURenderer` en mode expérimental pour les utilisateurs qui le souhaitent, avec fallback automatique `WebGLRenderer` si `navigator.gpu` est absent.

### Implémentation

- `state.USE_WEBGPU: boolean` (default `false`, persisté localStorage)
- Détection `!!navigator.gpu` dans `performance.ts`
- `initScene()` conditionnel : `WebGPURenderer` si dispo ET activé, sinon `WebGLRenderer`
- Type `state.renderer: THREE.WebGLRenderer | THREE.WebGPURenderer | null`
- Toggle `webgpu-toggle` dans `SettingsSheet.ts` → Paramètres Avancés (sous `debug-toggle`)
- Si `navigator.gpu` absent → toggle grisé avec tooltip "WebGPU non supporté sur cet appareil"

### Limitations connues

- Shaders terrain (`onBeforeCompile`) restent en GLSL — rendu WebGL uniquement pour l'instant
- Météo (`ShaderMaterial`) reste en GLSL — pas de rendu WebGPU
- Ces shaders seront migrés en TSL en v7.0

---

## v7.0 — WebGPU Production (WebGPU-first)

### Objectif

WebGPU devient le renderer par défaut avec migration complète des shaders et fallback WebGL automatique.

### Implémentation

- Migration TSL des shaders terrain (remplace `onBeforeCompile` GLSL injection)
- Migration TSL du shader météo (remplace `ShaderMaterial` GLSL)
- Polyfill `logarithmicDepthBuffer` pour WebGPU (si disponible dans Three.js r185+)
- `WebGPURenderer` par défaut, `WebGLRenderer` fallback automatique
- Tests exhaustifs Android : Mali (G68, G71, G72, G77), Adreno 6xx/7xx, WebView Capacitor
- Compass mini-renderer : migration CSS/Canvas2D ou unification contexte

### Prérequis

- Three.js r185+ (maturation WebGPU backend)
- Support Android WebGPU élargi (Chrome 121+)
- Retour utilisateur de la phase expérimentale v6.5

---

## Photography & Light Planning

> Analyse des fonctionnalités utiles aux photographes utilisant SunTrail.

Le moteur solaire 3D existant (ombres portées, azimut, heure dorée, phase lunaire) est un socle idéal pour des outils de planification photo. Voici les pistes identifiées, classées par effort/impact.

### Shot Planner (Effort moyen — Impact fort)

**Objectif :** Permettre au photographe de planifier précisément où et quand se tenir pour une photo, en utilisant les données terrain/soleil déjà disponibles.

- **Golden Hour Explorer** — Afficher sur la carte les zones qui seront en plein soleil / ombre dorée à un instant T (déjà partiellement possible via l'overlay 3D solaire). Amélioration : filtrer par "uniquement les zones où le soleil rase le relief" (golden hour).
- **Sunrise/Sunset Compass** — Overlay directionnel sur la carte montrant le point exact où le soleil se lève/couche par rapport au relief (intégré à la boussole Pro existante). Utile pour composer avec un pic ou un lac en silhouette.
- **Altitude du soleil au premier plan** — Indiquer si le soleil sera visible depuis un point donné (pas masqué par une crête) à une date/heure donnée. Le raycasting `isAtShadow()` le fait déjà, mais il faudrait une UI dédiée "le soleil sera-t-il visible à cet endroit à cette heure ?".
- **Carte des ombres projetées** — Snapshot de l'overlay 3D à un instant T exportable en image (pour préparer un shooting à l'avance).

### Seasonal Planner (Effort important — Impact fort)

**Objectif :** Aider à choisir la meilleure saison/période pour photographier un lieu.

- **Calendrier lumineux** — Pour un point donné, visualiser sur l'année : heure du lever/coucher, azimut à chaque saison, durée du jour, position du soleil par rapport aux crêtes environnantes.
- **Aide au choix saison** — Simulation rapide des ombres à différentes dates (solstice d'été → ombres courtes, soleil haut ; solstice d'hiver → ombres longues, soleil rasant). Les photographes de montagne cherchent souvent l'été pour les alpages en lumière ou l'hiver pour les effets de contraste.
- **Éphémérides photo** — Tableau de bord avec : lever/coucher, heure dorée/début-fin, azimut au lever/coucher, phase lunaire, hauteur max du soleil. (Données déjà calculées dans `SolarAnalysisResult`, manque juste l'UI dédiée.)

### Condition Tracker (Effort moyen — Impact moyen)

**Objectif :** Anticiper les conditions atmosphériques qui font la différence entre une photo banale et une photo exceptionnelle.

- **Visibilité météo** — Coupler les prévisions météo (déjà intégrées via Open-Meteo) avec l'analyse de terrain : probabilité de ciel dégagé à l'heure dorée, visibilité des pics lointains.
- **Indice de turbidité** — Données sur la clarté de l'air (aérosols) pour estimer la qualité de la lumière. API Open-Meteo AQI / CAMS.
- **Snow Line Tracker** — Altitude de la limite pluie/neige → savoir si les sommets seront enneigés (contexte photo hiver/printemps).
- **Leaf Season Indicator** — Modèle empirique basé sur l'altitude et la latitude pour prédire les couleurs d'automne (rough, mais utile).

### Astro Photography (Effort important — Impact niche)

**Objectif :** Planification photo nocturne (voie lactée, stars trails).

- **Milky Way Visibility** — Calendrier de visibilité de la Voie Lactée : lever/coucher, position par rapport au relief, phase lunaire (pas de lune = ciel noir). API SunCalc ne couvre pas ça — nécessite une lib externe ou calculs astronomiques.
- **Dark Sky Map** — Superposition des zones de pollution lumineuse (couche tuile Light Pollution Map, VIIRS DNB). Identifier les meilleurs spots autour d'un refuge.
- **Blue Hour Planner** — Heure exacte du coucher civil/nautique/astronomique pour la photo crépusculaire.

### Technical Debt / Prérequis

- L'API solaire (`runSolarProbe`) calcule déjà : azimut, élévation, heure dorée, phase lunaire, lever/coucher. Certaines données sont Pro-only dans l'UI mais disponibles en interne.
- L'overlay 3D (`buildSolarOverlay`) colore déjà le tracé par ombre/soleil — pourrait être étendu en overlay plein écran pour la planification photo.
- Les données météo (`weather.ts`, Open-Meteo) sont déjà intégrées et peuvent être croisées avec les données solaires.
- Le raycasting `isAtShadow()` est la brique de base pour déterminer si un point est dans la lumière ou l'ombre à un instant donné.

### Priorités suggérées

| Priorité | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P0 | Vue "Azimut lever/coucher" dans les stats point | Faible (données existantes) | Fort |
| P1 | Export snapshot ombres (carte ou overlay) | Moyen | Fort |
| P2 | Calendrier lumineux saisonnier | Important | Très fort |
| P3 | Dark Sky Map / pollution lumineuse | Moyen | Niche |
| P4 | Milky Way tracker | Important | Niche |

---

## Notes

- **RevenueCat :** Documenté [docs/MONETIZATION.md](docs/MONETIZATION.md)
- **Production Stripe :** À faire lors passage en prod (clés live, domaine production, etc.)
- **Tests :** 750 tests passent (iapService mocké dans `src/test/setup.ts`)
