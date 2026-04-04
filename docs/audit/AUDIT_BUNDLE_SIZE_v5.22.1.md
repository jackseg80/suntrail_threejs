# Audit #3 — Bundle Size / Build Prod — SunTrail v5.22.1
Date : 2026-04-04

**Methode** : Build prod (`vite build`), analyse statique des chunks, inspection des assets, verification du contenu APK Android
**Config build** : Vite 5.4.21, Terser (drop_console + drop_debugger), manualChunks (three / vendor / pmtiles), VitePWA (generateSW)

---

## Resume Build

| Metrique | Valeur |
|----------|--------|
| Build status | OK (0 erreur, 1 warning) |
| Temps de build | 2.94s |
| Total JS (brut) | 923.7 KB |
| Total JS (gzip) | ~223.9 KB (initial) / ~260 KB (all chunks) |
| Total CSS (brut) | 35.6 KB |
| Total CSS (gzip) | 7.0 KB |
| Total assets statiques | 3.4 MB (icones + images) |
| Total dist/ | 25 MB (dont 20 MB = europe-overview.pmtiles) |
| Total dist/ hors PMTiles | ~5 MB |
| Precache PWA | 32 entrees, 3950.7 KB |
| Modules transformes | 122 |

**Warning build** : `iapService.ts` est a la fois importe statiquement (par ui.ts, PacksSheet, SettingsSheet, UpgradeSheet) et dynamiquement (par packManager.ts). L'import dynamique est donc inoperant — le module est toujours dans le chunk principal.

---

## Detail des chunks

### Chunks initiaux (charges au demarrage)

| Chunk | Brut | Gzip | Contenu |
|-------|------|------|---------|
| `index-KuGQClKl.js` | 250.7 KB | 79.4 KB | Code metier app (scene, terrain, UI, state, i18n, GPS, meteo, IAP, Capacitor core) |
| `three-LDER771h.js` | 520.6 KB | 130.2 KB | Three.js r160 (isole via manualChunks) |
| `vendor-BtXoi1vh.js` | 24.0 KB | 7.3 KB | suncalc + gpxparser + @mapbox/vector-tile + pbf |
| `pmtiles-BsAOXyl0.js` | 17.7 KB | 7.0 KB | PMTiles reader |
| `index-CtKlh6bl.css` | 35.6 KB | 7.0 KB | Styles globaux |
| **Total initial** | **848.6 KB** | **230.9 KB** | |

### Chunks lazy-loaded (sheets UI, charges apres interaction)

| Chunk | Brut | Gzip est. | Contenu |
|-------|------|-----------|---------|
| `ExpertSheets-BMrnqUDg.js` | 27.0 KB | 6.7 KB | Sheets expert (solaire, debug, etc.) |
| `SettingsSheet-BmX8gudA.js` | 15.3 KB | 4.3 KB | Panneau reglages |
| `TrackSheet-CKVmTsQS.js` | 14.5 KB | 4.9 KB | Panneau traces GPX |
| `SearchSheet-ty-oZj9r.js` | 11.4 KB | 3.9 KB | Recherche lieux |
| `PacksSheet-Arym3S7f.js` | 7.2 KB | 2.3 KB | Packs pays hors-ligne |
| `InclinometerWidget-BISJBPhQ.js` | 7.7 KB | 2.7 KB | Inclinometre |
| `VRAMDashboard-DzGH2RDX.js` | 6.3 KB | 2.3 KB | Debug VRAM |
| `ConnectivitySheet-JnNXlKBQ.js` | 4.7 KB | 1.8 KB | Etat reseau |
| `UpgradeSheet-rfLME_NB.js` | 3.2 KB | 1.3 KB | Ecran upgrade Pro |
| `LayersSheet-D3lKuLU3.js` | 2.9 KB | 1.0 KB | Selection couches |
| **Total lazy** | **100.2 KB** | **31.2 KB** | |

### Chunks Capacitor plugins (web fallbacks)

| Chunk | Brut | Contenu |
|-------|------|---------|
| `web-CfCn4IEV.js` | 9.8 KB | @revenuecat/purchases-capacitor (web stub) |
| `web-DGFYLRJg.js` | 8.8 KB | @capacitor/filesystem (web impl.) |
| `web-DVp4zPgQ.js` | 1.2 KB | @capacitor/network (web impl.) |
| `web-CRFK8nyE.js` | 1.0 KB | @capacitor/haptics (web impl.) |
| `web-Ds1a1tc0.js` | 1.0 KB | @capacitor/geolocation (web impl.) |
| `web-ChVoDXYO.js` | 0.9 KB | @capacitor/app (web impl.) |
| **Total plugins** | **22.7 KB** | |

### Autres

| Fichier | Brut | Role |
|---------|------|------|
| `tileWorker-Cqrb9tUn.js` | 2.9 KB | Web Worker tuiles (fetch + normal maps) |
| `workbox-window.prod.es5-CLYUWRvB.js` | 5.7 KB | Client PWA workbox |
| `sw.js` | 3.0 KB | Service worker PWA |
| `workbox-1d305bb8.js` | 21.9 KB | Workbox runtime (SW) |
| `index.html` | 57.3 KB | HTML (inline: 13 SVG, 121 data-i18n, 4.5 KB styles inline, ~1000 lignes) |

---

## Assets statiques

| Fichier/Dossier | Taille | Format | Inclus dans APK ? | Notes |
|-----------------|--------|--------|-------------------|-------|
| `assets/icons/icon_1024.png` | 2 579 KB | PNG RGB | OUI | **ANOMALIE** : dimensions reelles 1920x1280 (pas 1024x1024), sans alpha. Devrait etre 1024x1024 pour le manifest PWA. |
| `assets/icons/icon_512.png` | 508 KB | PNG RGBA | OUI | 512x512, correct pour PWA |
| `img/maps/satellite.png` | 290 KB | PNG RGB | OUI | Preview couche satellite, 512x512 |
| `img/maps/outdoor-v2.png` | 37 KB | PNG RGB | OUI | Preview couche outdoor, 512x512 |
| `img/maps/topo.png` | 12 KB | PNG RGB | OUI | Preview couche topo, 256x256 |
| `tiles/europe-overview.pmtiles` | 20 480 KB | PMTiles | **OUI** | Gitignore mais copie dans dist/ et dans APK via `cap sync` |
| `privacy.html` | 19 KB | HTML | OUI | Page politique de confidentialite |
| `robots.txt` | 0.1 KB | Text | OUI | |
| `manifest.webmanifest` | 0.4 KB | JSON | OUI | |

**Fonts** : Google Fonts (DM Sans 400/500/700 + DM Mono 400/500) chargees en externe via Google Fonts CDN. Non embarquees dans le bundle. Chargement async avec `media="print" onload="this.media='all'"` — bon pattern. Cependant, deux balises `<link>` sont presentes : une async et une synchrone dans `<noscript>` qui est en fait hors du noscript, creant un double-fetch (voir Recommandation #8).

---

## Analyse par dependance

| Dependance | Taille dans le bundle | Tree-shaking | Notes |
|------------|----------------------|--------------|-------|
| **three** (r0.160.1) | 520.6 KB (130.2 KB gz) | Partiel (22% elimine) | `import * as THREE` empeche le tree-shaking complet. Chunk isole = bon cache long terme. La lib complete minifiee fait 655 KB, on est a 508 KB = 77.6% inclus. |
| **pmtiles** (v4.4.0) | 17.7 KB (7.0 KB gz) | Chunk separe | Isole via manualChunks. Precache PWA inclus. Charge via `modulepreload` (donc pas lazy). |
| **@mapbox/vector-tile + pbf** | ~15 KB (dans vendor) | Oui | Decodage tuiles vectorielles (batiments, POI). |
| **suncalc** | ~5 KB (dans vendor) | Oui | Calcul position solaire. Petit. |
| **gpxparser** | ~4 KB (dans vendor) | Oui | Parsing GPX. Petit. |
| **@capacitor/core** | ~10-15 KB (dans index) | Inline | Capacitor bridge, registerPlugin. Interne au chunk app. |
| **@capacitor/\* plugins** | 22.7 KB (6 chunks web) | Chunks auto | Fallbacks web, lazy-loaded. Sur Android natif, le code natif est utilise — ces chunks sont inutiles mais inclus. |
| **@revenuecat/purchases-capacitor** | ~10 KB (dans web-CfCn4IEV + index) | Partiel | Le web stub est un chunk separe. Les types/refs sont dans le chunk principal (~15 references). Sur Android le SDK natif gere la logique. |
| **vite-plugin-pwa / workbox** | 30.6 KB (sw.js + workbox + client) | N/A | Service worker genere. 32 entrees precache (~3.9 MB). Three.js et PMTiles exclus du precache (correct). |

---

## Contenu APK Android (web assets)

| Composant | Taille |
|-----------|--------|
| JS chunks (tous) | ~948 KB |
| CSS | 35 KB |
| Icons PNG | 3 087 KB |
| Images maps | 339 KB |
| europe-overview.pmtiles | 20 480 KB |
| HTML + SW + manifest | ~102 KB |
| **Total web dans APK** | **~25 MB** |

Le fichier `europe-overview.pmtiles` (20 MB) represente **80%** du poids web dans l'APK. C'est la base carto hors-ligne embarquee (LOD 5-7 Europe + LOD 8-11 Suisse).

---

## Comparaison vs budgets mobile

### Budget JS initial (LCP)

| Metrique | Valeur | Budget recommande | Verdict |
|----------|--------|-------------------|---------|
| JS initial (brut) | 848.6 KB | < 500 KB | **DEPASSE** (+69.7%) |
| JS initial (gzip) | 230.9 KB | < 170 KB | **DEPASSE** (+35.8%) |
| JS initial hors Three.js (brut) | 328 KB | < 350 KB | OK |
| JS initial hors Three.js (gzip) | 100.7 KB | < 120 KB | OK |
| CSS initial (gzip) | 7.0 KB | < 50 KB | OK |
| index.html | 57.3 KB | < 15 KB | **DEPASSE** (3.8x) |

**Contexte important** : le budget < 500 KB JS s'applique aux apps web classiques. SunTrail est une app 3D avec Three.js qui est incompressible a ~520 KB. Sur Android/Capacitor, les assets sont locaux (pas de reseau) donc le LCP n'est pas impacte par la taille des chunks JS. Le budget est surtout pertinent pour le mode PWA.

### Budget APK

| Metrique | Valeur | Budget recommande | Verdict |
|----------|--------|-------------------|---------|
| Web content dans APK | ~25 MB | < 10 MB | **DEPASSE** (2.5x) |
| Web content hors PMTiles | ~5 MB | < 10 MB | OK |

---

## Analyse PWA (Service Worker)

| Aspect | Valeur | Commentaire |
|--------|--------|-------------|
| Strategie | `generateSW` (Workbox auto) | Correct pour une SPA |
| Precache | 32 entrees, 3 950 KB | Inclut tous les chunks sauf Three.js et .pmtiles |
| Runtime cache MapTiler | CacheFirst, 30j, 1000 entrees | Bon |
| Runtime cache SwissTopo | CacheFirst, 30j, 1000 entrees | Bon |
| `skipWaiting` + `clientsClaim` | Oui | Mise a jour immediate — attention aux breaking changes |
| Max file size precache | 3 MB | Permet les grosses icones, bloque Three.js (correct) |

**Anomalie precache** : `icon_1024.png` (2.6 MB) et `icon_512.png` (508 KB) sont precachees. A elles deux, elles representent **78%** du precache (3.1 MB / 3.95 MB). Ces icones ne servent qu'au manifest PWA (ecran d'accueil) et n'ont pas besoin d'etre precachees.

---

## Recommandations

### P0 — Impact fort, effort faible

**1. Optimiser icon_1024.png (gain : ~2.4 MB dans APK et precache)**
- Dimensions incorrectes : 1920x1280 au lieu de 1024x1024 declare dans le manifest.
- Redimensionner a 1024x1024, convertir en WebP ou PNG optimise.
- Estimation : 1920x1280 PNG RGB 2.6 MB → 1024x1024 PNG optimise ~150 KB = gain 2.4 MB.

**2. Exclure les icones PWA du precache (gain : ~3.1 MB precache)**
- Ajouter `'**/icon_*.png'` a `globIgnores` dans la config VitePWA.
- Ces icones sont utilisees uniquement pour l'install PWA, pas pour le fonctionnement de l'app.

**3. Convertir les previews carte en WebP (gain : ~200 KB)**
- `satellite.png` (290 KB) → WebP quality 80 → ~50 KB.
- `outdoor-v2.png` (37 KB) → WebP → ~15 KB.
- Les 3 images sont des photos/rendus, ideales pour WebP.

### P1 — Impact moyen, effort moyen

**4. Reduire index.html (57 KB → ~10 KB)**
- Le HTML contient ~13 SVG inline, 121 attributs data-i18n, et ~4.5 KB de styles inline.
- Deplacer les SVG dans des fichiers separes ou un sprite SVG.
- Les styles inline (4.5 KB) devraient etre dans le CSS bundle.
- Objectif : < 15 KB pour un meilleur TTFB en mode PWA.

**5. Rendre PMTiles veritablement lazy-loaded**
- Actuellement `pmtiles` est dans un chunk separe (correct) mais `modulepreload` dans index.html le charge immediatement au demarrage.
- Le module n'est necessaire que quand l'utilisateur accede aux tuiles offline.
- Supprimer le modulepreload et utiliser `import()` dynamique au premier besoin.
- Gain : -17.7 KB du chemin critique initial.

**6. Corriger le double-fetch Google Fonts**
- Deux balises `<link stylesheet>` chargent la meme URL Google Fonts : une avec `media="print"` (async) et une dans un `<noscript>` qui semble etre hors du noscript dans le build.
- Verifier que le `<noscript>` est bien a l'interieur de la balise et pas hors de celle-ci.

### P2 — Impact fort, effort important

**7. Named imports Three.js (gain potentiel : ~50-150 KB)**
- Remplacer `import * as THREE from 'three'` par des imports nommes (`import { Scene, Mesh, Vector3, ... } from 'three'`) dans les 30 fichiers concernes.
- Actuellement 77.6% de Three.js est inclus (508 KB vs 655 KB full). Avec des imports nommes, Rollup pourrait eliminer davantage de code inutilise (geometries exotiques, loaders non utilises, etc.).
- Effort : refactorisation de 30 fichiers, risque de regression moyen.
- Gain estime : 50-150 KB brut (15-45 KB gzip).

**8. Compresser europe-overview.pmtiles ou le servir a la demande (gain : ~10-15 MB APK)**
- Ce fichier de 20 MB represente 80% du poids web de l'APK.
- Options : (a) le telecharger au premier lancement au lieu de l'embarquer, (b) le compresser avec Brotli dans l'APK et decompresser a l'install, (c) reduire la couverture (LOD 8-11 Suisse = bulk du poids).
- Attention : ce fichier est essentiel pour l'experience offline de base.

### P3 — Optimisations futures

**9. Capacitor web plugins inutiles dans l'APK**
- Les 6 chunks `web-*.js` (22.7 KB) sont des fallbacks web pour PWA. Sur Android, le SDK natif est utilise.
- Gain negligeable (22 KB) mais pourrait etre elimine avec un build conditionnel (define: `__PLATFORM__`).

**10. Compression Brotli pre-build**
- Ajouter `vite-plugin-compression` pour generer des `.br` pre-comprimes.
- Pertinent uniquement si le serveur PWA supporte la negociation Brotli. Non pertinent pour l'APK Capacitor (assets locaux).

---

## Synthese

```
                     BRUT         GZIP
JS initial       848.6 KB     230.9 KB   (dont Three.js 520.6 / 130.2)
JS lazy           98.1 KB      31.2 KB
JS plugins        22.7 KB       ~7 KB
JS worker          2.9 KB        —
CSS               35.6 KB       7.0 KB
HTML              57.3 KB      11.3 KB
SW + Workbox      24.9 KB        —
Icons           3 087   KB       —
Map previews     339    KB       —
PMTiles       20 480    KB       —
─────────────────────────────────────
TOTAL dist/   ~25 MB
TOTAL hors PMTiles  ~5 MB
```

**Verdict global** : Le bundle JS est bien structure (4 chunks manuels + 10 lazy sheets + 6 plugins auto). Le code splitting est efficace — les sheets UI ne sont chargees qu'a la demande. Les gains les plus importants sont cote assets : icon_1024.png mal dimensionnee (+2.4 MB inutiles), precache PWA gonfle par les icones, et le PMTiles de 20 MB qui domine le poids APK. Le JS applicatif hors Three.js (328 KB brut / 101 KB gzip) est dans les normes pour une app 3D de cette complexite.
