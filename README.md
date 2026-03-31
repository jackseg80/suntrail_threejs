# ⛰️ SunTrail 3D

**v5.11.2** · **MIT + Commons Clause**

Outil de visualisation topographique 3D pour la randonnée alpine.

## Aperçu

SunTrail est un moteur de terrain 3D WebGL conçu pour les randonneurs et alpinistes exigeants.

**Ce que c'est :**
- Terrain 3D véritable avec données d'élévation précises
- Simulation solaire interactive (position du soleil, ombres, heure dorée)
- Multi-tracés GPX avec analyse de profil
- Mode offline complet (PWA + PMTiles)
- Application Android native via Capacitor

**Différenciateurs :**
- 3D réelle (pas de simple ombrage 2D)
- Simulation solaire unique sur le marché
- Données officielles : SwissTopo + Plan IGN v2
- Offline-first : fonctionne sans réseau une fois chargé

**Marchés :** 🇨🇭 Suisse · 🇫🇷 France · v5.12 : 🇦🇹 Autriche

## Modèle Freemium

| Tier Gratuit | Tier Pro (€29.99/an · €3.99/mois · €79.99 lifetime) |
|---|---|
| Carte topo CH+FR (LOD ≤ 14) | LOD 18 + Satellite HD |
| GPS live + météo 12h | Météo 3-5 jours + données avancées |
| Simulation solaire (jour actuel) | Calendrier illimité (dates passées/futures) |
| 1 tracé GPX + **REC illimité** | Multi-tracés + export GPX + stats VAM/Naismith |
| Pentes visuelles 30°/35°/40° | Inclinomètre numérique + gradient 2° |
| Vue 2D | Bâtiments 3D réalistes |
| Offline 1 zone | Offline illimité + PMTiles |
| Top 10 sommets visibles | Index complet + moteur de recherche |

## Features techniques

- Moteur Three.js WebGL avec LOD adaptatif (zoom 6→18)
- WebWorkers pool (4-8 workers) pour fetch et calcul des normal maps
- Touch controls Google Earth (pinch/zoom/rotation/tilt via PointerEvents)
- Presets GPU auto-détectés : eco / balanced / performance / ultra
- Deep Sleep réel (`setAnimationLoop(null)` sur visibilitychange)
- Idle throttle 20fps + accumulateurs eau/météo (20fps max)
- Adaptive DPR sur interaction mobile
- i18n : FR / DE / IT / EN
- PWA (Service Worker, précache Suisse LOD 6-9)
- Android natif via Capacitor (Foreground Service pour REC GPS)

## Stack technique

Three.js · TypeScript · Vite · Capacitor · RevenueCat · Vitest (190 tests)

## Installation & Dev

```bash
npm install
npm run dev        # Dev server
npm test           # 190 tests unitaires
npm run check      # TypeScript strict
npm run deploy     # Build + Android
```

Note : Copier `.env.example` en `.env` et renseigner `VITE_MAPTILER_KEY` et `VITE_REVENUECAT_KEY`

## Sources de données

| Source | Couverture | Licence |
|---|---|---|
| SwissTopo | 🇨🇭 CH | OGD — gratuit |
| Plan IGN v2 | 🇫🇷 FR | Etalab 2.0 — gratuit |
| OpenStreetMap | Mondial | ODbL — gratuit |
| MapTiler Cloud | Satellite + topo mondial | Commercial |

## Documentation

- [CHANGELOG.md](./docs/CHANGELOG.md) — Historique des versions
- [TODO.md](./docs/TODO.md) — Feuille de route
- [FEATURES.md](./docs/FEATURES.md) — Liste des fonctionnalités
- [ANDROID.md](./docs/ANDROID.md) — Guide Android
- [MONETIZATION.md](./docs/MONETIZATION.md) — Stratégie business

## Licence

MIT + Commons Clause — code source disponible pour étude et usage personnel. Commercialisation interdite. Voir [LICENSE](./LICENSE).
