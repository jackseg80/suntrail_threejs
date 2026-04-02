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
- Affiché 420ms après disparition du setup screen.
- Pas de bouton "Refuser".

---

## Setup Screen & Clé MapTiler (v5.12)

- **Auto-skip** : Si `VITE_MAPTILER_KEY` défini, `state.MK` est peuplé et le setup screen masqué.
- **Fallback** : Si `state.MK` vide → setup screen pour saisie manuelle.
- **⚠️ Ordre d'init (v5.12.6)** : `launchScene()` après toute l'hydratation des composants dans `initUI()`.

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
