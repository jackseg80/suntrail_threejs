# SunTrail — Monétisation & IAP (v5.19.6)

> Référence détaillée pour agents IA. Point d'entrée : [CLAUDE.md](../CLAUDE.md)
> Pour la stratégie business (prix, concurrence, décisions) : voir [MONETIZATION.md](./MONETIZATION.md)

---

## Architecture Freemium (v5.12)

- **`state.isPro: boolean`** : Flag central. `false` par défaut. Persisté dans `localStorage` via clé séparée `suntrail_pro` (immunisée contre les resets de version).
- **`saveProStatus()` / `loadProStatus()`** dans `state.ts`. `loadProStatus()` appelé en **premier** dans `initUI()`, avant `loadSettings()`.
- **`src/modules/iap.ts`** : `showUpgradePrompt(feature)` ouvre l'UpgradeSheet, `grantProAccess()` / `revokeProAccess()` modifient `state.isPro` + persistent.
- **`src/modules/iapService.ts`** : RevenueCat (`@revenuecat/purchases-capacitor` v12.3.0). Entitlement : `'SunTrail 3D Pro'` (avec espaces). No-op sur Web/PWA.
- **Clé bundlée** : `VITE_REVENUECAT_KEY` dans `.env` (hors Git). `VITE_MAPTILER_KEY` idem.

---

## Rotation de Clés MapTiler (v5.19.0)

- **Problème** : une seule clé free MapTiler (100k req/mois) → rate limit 429.
- **Solution** : GitHub Gist (`suntrail_config.json`) contenant un tableau de clés.
- **URL** : `https://gist.githubusercontent.com/jackseg80/c4f2e5e99c1efb9d736736cb65fce862/raw/suntrail_config.json`
- **Format** : objets `{ key, enabled }`. Clés `enabled: false` exclues. Ancien format (strings) rétrocompatible.
- **Priorité** : clé utilisateur manuelle > clé Gist > clé bundlée (`.env`).
- **Timing** : clé bundlée sert LOD ≤ 10 (OpenTopoMap). Gist répond avant le premier appel MapTiler (LOD 11+).
- **CSP** : `gist.githubusercontent.com` dans `connect-src`.
- **Rotation** : éditer le Gist, `enabled: false` sur la clé épuisée → effet immédiat.

---

## Protection Anti-Spam API (v5.19.0)

- **Geocoding** : backoff global 30-60s après 429 ou CORS (`_geocodingBackoffUntil`). `fetchWeather` bloqué pendant interaction.
- **Tuiles** : 429 séparé du 403 (`rateLimited` vs `forbidden`). Le 429 ne désactive PAS MapTiler (vs 403 → mode OSM).
- **Overpass** : backoff exponentiel 15s→5min après 429/504. Queue LIFO vidée pendant backoff.

---

## Feature Gates

| Feature | Fichier | Guard |
|---|---|---|
| LOD > 14 | `performance.ts` → `applyPreset()` | `effectiveMaxZoom = state.isPro ? MAX_ALLOWED_ZOOM : Math.min(MAX_ALLOWED_ZOOM, 14)` |
| Couche Satellite | `LayersSheet.ts` | `if (source === 'satellite' && !state.isPro)` |
| Multi-tracés GPX (> 1) | `TrackSheet.ts` → `handleGPX()` | `if (!state.isPro && state.gpxLayers.length >= 1)` |
| Export GPX | `TrackSheet.ts` → `exportRecordedGPX()` | `if (!state.isPro)` |
| REC > 30 min | `TrackSheet.ts` | `setTimeout(REC_FREE_LIMIT_MS)` si `!state.isPro` |
| Cotation CAS T1-T6 | `trailAnalysis.ts` | `if (!state.isPro)` → badge simplifié |
| Temps par segment | `TrackSheet.ts` | `if (!state.isPro)` → temps total Munter seul |
| Tracé coloré par pente | GPX mesh builder | `if (!state.isPro)` → monochrome |
| Barre exposition détaillée | `profile.ts` | `if (!state.isPro)` → icône résumé |
| Tableau heure de départ | `trailAnalysis.ts` | `if (!state.isPro)` → phrase générique |
| Segments complets | `TrackSheet.ts` | `if (!state.isPro)` → compteur seul |
| Hydratation / Calories | `trailAnalysis.ts` | `if (!state.isPro)` → masqué |
| Score condition détaillé | `trailAnalysis.ts` | `if (!state.isPro)` → étoiles seul |
| Poids utilisateur | `SettingsSheet.ts` | `if (!state.isPro)` → masqué |
| Calendrier solaire (dates passées/futures) | `TimelineComponent.ts` | `if (!state.isPro && !isToday)` → reset + `showUpgradePrompt('solar_calendar')` |
| Inclinomètre numérique | `InclinometerWidget.ts` | `state.isPro && state.ZOOM >= 13` |
| REC illimité (stats avancées) | `TrackSheet.ts` | Limite 30min supprimée ; upsell post-session si `!state.isPro` |
| Météo jours 2-3 | `ExpertSheets.ts` | `opacity:0.38` + badge PRO + `showUpgradePrompt('weather_extended')` |

> **⚠️ RÈGLE Trail Intelligence** : Les alertes sécurité (avalanche, windchill, nuit, orage, chaleur, visibilité, batterie) sont **TOUJOURS FREE**. Ne jamais les gater derrière `state.isPro`.

---

## Offline & Packs Pays (v5.20+)

### Tuiles embarquées (implémenté)

- Archive `europe-overview.pmtiles` (~20 MB) dans `public/tiles/` : LOD 5-7 Europe + LOD 8-11 Suisse.
- Montée automatiquement au démarrage via `initEmbeddedOverview()`.
- Free et Pro : aucun gate (c'est le premier affichage de base).
- Voir `AI_ARCHITECTURE.md` § "Tuiles Embarquées" pour les détails techniques.

### Zones offline (implémenté)

- `downloadVisibleZone()` télécharge les tuiles visibles dans le Cache API.
- Free : 1 zone, Pro : illimité. Gate dans `ConnectivitySheet.ts`.
- Compteur : `localStorage` clé `suntrail-offline-zones-count`.

### Packs pays HD (implémenté v5.21.0)

Fichiers PMTiles par pays/région, achetés via IAP non-consumable (RevenueCat) et téléchargeables en entier pour usage offline.

| Pack | LOD | Taille réelle | Produit RevenueCat |
| ---- | --- | ------------- | ------------------ |
| Suisse HD | 8-14 | ~721 MB (rebuild v2 prévu) | `suntrail_pack_switzerland` |
| France Alpes HD | 8-14 | ~520 MB (rebuild v2 prévu) | `suntrail_pack_france_alps` |

> **v5.21.1** : les packs en prod sont LOD 12-14. Le rebuild LOD 8-14 est planifié (voir ci-dessous).

**Gating** : Tout acheteur du pack accède à tous les LOD complets. Pas de restriction Pro — le pack est un achat unique indépendant de l'abonnement.

**Architecture** : voir `AI_ARCHITECTURE.md` § "Packs Pays — packManager".

**Sources** :

- Suisse : SwissTopo `pixelkarte-farbe` — LOD 8-14 (API publique gratuite, haute qualité)
- France Alpes : IGN `PLANIGNV2` — LOD 8-14 (API publique gratuite `data.geopf.fr`)
- LOD 5-7 : OpenTopoMap interdit en bulk download → embedded overview APK (one-shot interne)

**Build** : `npm run build-pack -- --pack switzerland` → `scripts/build-country-pack.ts` (sharp + pmtiles-writer, ~2h pour la Suisse). Cache résumable dans `.cache/pack-{id}/`.

**Hébergement CDN** : Cloudflare R2 — `suntrail-packs` bucket. Structure :
```
catalog.json
packs/suntrail-pack-switzerland-v1.pmtiles
packs/suntrail-pack-france_alps-v1.pmtiles
```
R2 supporte les HTTP Range requests (nécessaire pour que la lib pmtiles charge les leaf directories à la demande). CORS : `GET`, `HEAD`, `ExposeHeaders: Content-Range, Accept-Ranges, Content-Length, ETag`.

**Stockage app** : OPFS uniquement (Android + PWA). Téléchargement complet (pas de streaming Range) pour usage 100% offline. `Filesystem.External` et `file://` ne supportent pas les Range requests dans WebView.

---

### Optimisation taille des packs (v5.22 — implémenté)

**Problème** : LOD 14 représente ~75% du volume total. À grande échelle (France entière), un pack naïf dépasserait 1.3 GB.

**Leviers implémentés** :

#### 1. Qualité WebP différenciée par LOD ✓ (v5.22)

```
LOD 5-10  : quality 55  → ~5 KB/tuile
LOD 11-12 : quality 70  → ~12 KB/tuile
LOD 13-14 : quality 80  → ~20 KB/tuile
```

Gain réel : ~28% — Suisse 716 MB, France Alpes 515 MB.
Implémenté dans `scripts/build-country-pack.ts` → `webpQualityForZoom(zoom)`.

#### 2. Déduplication runLength (PMTiles v3) ✓ (v5.22)

Tuiles consécutives identiques regroupées en un seul blob + entrée `runLength > 1`.
Gain pour les Alpes : ~1-5% (terrain varié). Fort gain attendu sur les futurs packs côtiers (~30%).
Implémenté dans `scripts/pmtiles-writer.ts` → `deduplicateTiles(sorted)`. Hash FNV-1a 32-bit pur JS.
23 tests unitaires dans `src/test/pmtilesWriter.test.ts`.

#### 3. Découpage par massif (stratégie produit)

Pour les grands territoires, vendre des packs ciblés plutôt qu'un pack national.

- **Suisse HD** ✓ — 716 MB, LOD 8-14 (SwissTopo)
- **France Alpes HD** ✓ — 515 MB, LOD 8-14 (IGN PLANIGNV2)
- **Pyrénées HD** — à venir (~450 MB estimé)
- **Vosges HD** — à venir (~250 MB estimé)
- **Massif Central HD** — à venir (~400 MB estimé)
- Objectif : rester sous 600 MB par pack

---

## Gate LOD Pro (v5.14.0)

- **⚠️ RÈGLE CRITIQUE** : `MAX_ALLOWED_ZOOM` reflète toujours la valeur native du preset (14/16/18). **Ne jamais l'écraser à 14 pour les gratuits.**
- Le gate est appliqué dynamiquement dans `scene.ts` et `terrain.ts` : `effectiveMaxZoom = state.isPro ? MAX_ALLOWED_ZOOM : Math.min(MAX_ALLOWED_ZOOM, 14)`.
- Tout changement de `state.isPro` est immédiatement effectif sans re-appliquer le preset.

---

## Architecture IAP RevenueCat (v5.14.0)

- **SDK key** : `goog_` prefix = Google Play production. Dans `iapService.ts` → `Purchases.configure({ apiKey: SDK_KEY })`.
- **Service Account JSON** : Lié dans RevenueCat → App Settings → Google Play (validation serveur).
- **Customer anonyme** : Créé au premier démarrage natif. ID visible dans logcat : `$RCAnonymousID:xxxxx`.
- **Grant manuel** : RevenueCat → Customers → recherche ID → Grant Entitlement → `SunTrail 3D Pro`.

---

## Acceptance Wall (`src/modules/acceptanceWall.ts`)

- Overlay bloquant, même pattern que `gpsDisclosure.ts`.
- Stocké : `suntrail_acceptance_v1` (incrémenter pour forcer re-affichage).
- Affiché dès que la scène 3D est prête (`suntrail:sceneReady`).
- Pas de bouton "Refuser".

---

## Clé MapTiler — Résolution automatique (v5.20)

- **Clé bundlée** : `VITE_MAPTILER_KEY` dans `.env` → injectée au build, disponible immédiatement sans réseau.
- **Clé distante** : Rotation aléatoire depuis un GitHub Gist (fire-and-forget). Écrase la bundlée sauf si clé manuelle en localStorage.
- **Clé manuelle** : Saisie possible dans ConnectivitySheet (`SharedAPIKeyComponent`), sauvée en localStorage.
- **⚠️ Ordre d'init** : `launchScene()` appelé inconditionnellement après l'hydratation des composants dans `initUI()`.

---

## REC GPS — Architecture (v5.12.8)

- **Séparation save/export** :
  - `saveRecordedGPXInternal()` — **sans gate Pro** — parse GPX → `addGPXLayer()`. Toujours appelé au STOP.
  - `downloadRecordedGPX()` — I/O filesystem uniquement.
  - `exportRecordedGPX()` — wrapper Pro-only.
- **⚠️ Ne jamais gater la sauvegarde automatique** derrière `isPro`.
- **Persistance** : `foregroundService.ts` — `updateRecordingSnapshot()` écrit les points dans `Directory.Cache` toutes les 30 pts ou 60s. `getPersistedRecordingPoints()` restaure après kill.

---

## Mode Testeur (v5.12.9)

- 7 taps sur `#settings-version` dans Réglages Avancés → toggle `state.isPro` en RAM.
- **Jamais `saveProStatus()`** — non persisté par design.
- Taps 4-6 : haptic light + clignotement. Tap 7 : haptic success + toast.
- Reset au redémarrage.

---

## Timeline 2D Guard (v5.12.7)

- `TimelineComponent.ts` utilise `state.IS_2D_MODE` (pas `body.classList`) pour vérifier le mode 2D.
- `NavigationBar` : `syncLowZoomState()` ajoute toujours `body.mode-2d` quand ZOOM ≤ 10.

---

## Pattern : Ajouter une feature Pro

1. Implémenter la feature normalement
2. Ajouter le guard : `if (!state.isPro) { showUpgradePrompt('feature_key'); return; }`
3. Ajouter `feature_key` dans le tableau Feature Gates ci-dessus
4. Tester avec le mode testeur (7 taps sur `#settings-version`)
