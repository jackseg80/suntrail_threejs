# ⛰️ SunTrail 3D

**v5.16.7** · **MIT + Commons Clause**

Carte topographique 3D interactive pour la randonnée. Terrain réaliste, GPS, météo, analyse solaire et tracés GPX.

## Aperçu

SunTrail est un moteur de terrain 3D WebGL conçu pour les randonneurs et alpinistes exigeants. Disponible en PWA et application Android native.

**Ce que c'est :**
- Terrain 3D véritable avec données d'élévation (résolution 5-25m)
- Simulation solaire complète (lever/coucher, ombres, heure dorée, phase lunaire)
- Multi-tracés GPX avec profil d'élévation interactif (D+/D-, pente, VAM)
- Station météo (Open-Meteo) avec particules pluie/neige shader
- Enregistrement GPS avec Foreground Service Android
- Mode offline complet (PWA + zones téléchargeables + PMTiles)
- Tutoriel onboarding intégré (6 slides)

**Différenciateurs :**
- 3D réelle avec LOD adaptatif (zoom 6→18)
- Simulation solaire unique sur le marché (courbe 24h, 144 points)
- Données officielles : SwissTopo + Plan IGN v2 + OpenTopoMap
- Offline-first : fonctionne sans réseau une fois les tuiles en cache
- Accessibilité : Lighthouse 100/100/100 (a11y, best practices, SEO)

**Marchés :** 🇨🇭 Suisse · 🇫🇷 France · 🌍 Monde (OpenTopoMap + MapTiler)

## Modèle Freemium

| Tier Gratuit | Tier Pro (€29.99/an · €3.99/mois · €99.99 lifetime) |
|---|---|
| Carte topo CH+FR (LOD ≤ 14) | LOD 18 + Satellite HD |
| GPS live + météo 12h | Météo 3-5 jours + alertes montagne |
| Simulation solaire (jour actuel) | Calendrier illimité (dates passées/futures) |
| 1 tracé GPX + REC illimité | Multi-tracés + export GPX + stats VAM/Naismith |
| Pentes visuelles 30°/35°/40° | Inclinomètre numérique Pro |
| Vue 2D/3D | Bâtiments 3D réalistes |
| Offline 1 zone | Offline illimité + PMTiles |
| Sommets visibles | Index complet + moteur de recherche |

## Features techniques

- Moteur Three.js WebGL avec LOD adaptatif (zoom 6→18)
- WebWorkers pool (4 mobile / 8 desktop) pour fetch tuiles et calcul normal maps
- Touch controls Google Earth (pinch/zoom/rotation/tilt via PointerEvents)
- Presets GPU auto-détectés (52 patterns) : eco / balanced / performance / ultra
- Deep Sleep réel (`setAnimationLoop(null)` sur visibilitychange)
- Idle throttle 20fps + accumulateurs eau/météo (20fps max)
- Adaptive DPR sur interaction mobile (1.0 pendant pan/zoom)
- Boussole 3D Three.js synchronisée avec la caméra
- Profil d'élévation SVG interactif avec marqueur 3D
- Analyse solaire par ray-casting terrain (SunCalc)
- Particules météo GPU-driven (ShaderMaterial, 15k particules)
- Végétation bio-fidèle par altitude (InstancedMesh, déterministe)
- Ghost tiles pour transitions LOD fluides (fondu 1.2s)
- AbortController sur tous les fetches de tuiles
- i18n : FR / DE / IT / EN (fallback automatique)
- PWA (Service Worker, Workbox, cache 30 jours)
- Android natif via Capacitor (Foreground Service GPS, RevenueCat IAP)
- WCAG 2.1 AA : aria-labels, focus-visible, contraste, touch targets 48px+

## Stack technique

Three.js r160 · TypeScript (strict) · Vite 5 · Capacitor 8 · RevenueCat · Vitest (412+ tests) · axe-core

## Installation & Dev

```bash
npm install
npm run dev        # Serveur dev Vite (HMR)
npm test           # 412+ tests unitaires
npm run check      # TypeScript strict
npm run build      # Build production
npm run deploy     # check + build + cap sync
```

Copier `.env.example` en `.env` et renseigner `VITE_MAPTILER_KEY` et `VITE_REVENUECAT_KEY`.

## Release

```bash
# 1. Incrémenter versionCode dans android/app/build.gradle (voir docs/RELEASE.md)
# 2. Commit + push
git push origin main
# 3. Tag (déclenche le CI → build AAB signé)
git tag v5.16.7
git push origin v5.16.7
```

Le CI (`.github/workflows/release.yml`) build l'AAB signé et crée une GitHub Release automatiquement. 6 secrets GitHub requis. Voir [RELEASE.md](./docs/RELEASE.md) pour le workflow complet.

## Sources de données

| Source | Couverture | Licence |
|---|---|---|
| SwissTopo WMTS | 🇨🇭 Suisse | OGD — gratuit |
| Plan IGN v2 | 🇫🇷 France | Etalab 2.0 — gratuit |
| OpenTopoMap | 🌍 Mondial (LOD ≤ 10) | CC-BY-SA |
| OpenStreetMap | 🌍 Mondial | ODbL — gratuit |
| MapTiler Cloud | Satellite + topo mondial | Commercial (clé requise) |
| Open-Meteo | 🌍 Météo mondiale | CC-BY 4.0 — sans clé |
| Overpass API (OSM) | 🌍 Bâtiments, POI, sommets | ODbL |

## Documentation

| Document | Contenu |
|---|---|
| [AGENTS.md](./AGENTS.md) | Base de connaissance technique complète (pour agents IA) |
| [RELEASE.md](./docs/RELEASE.md) | Workflow de publication + historique versionCode |
| [CHANGELOG.md](./docs/CHANGELOG.md) | Historique détaillé des versions |
| [FEATURES.md](./docs/FEATURES.md) | Liste des fonctionnalités |
| [AUDIT_PRESTORE.md](./docs/AUDIT_PRESTORE.md) | Audit pré-Play Store (sécurité, a11y, compliance) |
| [ANDROID.md](./docs/ANDROID.md) | Guide build Android |
| [MONETIZATION.md](./docs/MONETIZATION.md) | Stratégie business |

## Licence

MIT + Commons Clause — code source disponible pour étude et usage personnel. Commercialisation interdite. Voir [LICENSE](./LICENSE).
