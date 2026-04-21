# ⛰️ SunTrail 3D

**v5.19.2** · **MIT + Commons Clause**

Carte topographique 3D interactive pour la randonnée. Terrain réaliste, simulation solaire avec ombres portées, GPS, météo, tracés GPX et recherche de lieux.

## Aperçu

SunTrail est un moteur de terrain 3D WebGL conçu pour les randonneurs et alpinistes exigeants. Disponible en PWA et application Android native.

**Ce que c'est :**
- Terrain 3D véritable avec données d'élévation (résolution 5-25m)
- Simulation solaire unique : ombres portées en temps réel sur le relief 3D — voyez exactement quand une vallée, un bivouac ou un sentier est à l'ombre ou au soleil
- Calendrier solaire Pro : simulez les ombres pour n'importe quelle date (passé et futur)
- Multi-tracés GPX avec profil d'élévation interactif (D+/D-, pente, VAM)
- Station météo (Open-Meteo) avec particules pluie/neige shader
- Recherche hybride : géocodage + sommets + filtres (villes, montagnes, pays)
- Enregistrement GPS avec Foreground Service Android + récupération après crash
- Mode offline complet (PWA + zones téléchargeables + PMTiles)
- Inclinomètre numérique Pro avec panel de danger interactif
- Panels déplaçables (timeline, profil d'élévation, coordonnées)
- Tutoriel onboarding intégré (6 slides)

**Différenciateurs :**
- Seule app rando avec simulation solaire topographique (ombres projetées sur le relief réel, pas une carte plate)
- 3D réelle avec LOD adaptatif (zoom 6→18) et caméra terrain-aware
- Données officielles : SwissTopo + Plan IGN v2 + OpenTopoMap
- Offline-first : fonctionne sans réseau une fois les tuiles en cache
- Accessibilité : Lighthouse 100/100/100 (a11y, best practices, SEO)
- 4 langues : FR / DE / IT / EN

**Marchés :** 🇨🇭 Suisse · 🇫🇷 France · 🌍 Monde (OpenTopoMap + MapTiler)

## Modèle Freemium

| Tier Gratuit | Tier Pro |
|---|---|
| Carte topo (Auto) (CH+FR+IT) | LOD 18 + Satellite HD + Bâtiments 3D |
| GPS live + météo 12h | Météo 3 jours + alertes montagne |
| Simulation solaire (jour actuel) | Calendrier illimité (dates passées/futures) |
| Analyse solaire de base | Analyse Pro complète (azimut, élévation, graphique 24h, phase lunaire) |
| 1 tracé GPX + REC illimité | Multi-tracés + export GPX + stats VAM/Naismith |
| Pentes visuelles 30°/35°/40° | Inclinomètre numérique Pro (panel danger interactif) |
| Vue 2D/3D | Bâtiments 3D réalistes |
| Alertes sécurité (toutes) | Alertes sécurité (toutes) |
| Cotation simplifiée + durée Munter | Cotation CAS T1-T6 + temps/segment + tracé coloré |
| Score condition (étoiles) | Score détaillé + heure départ optimale + physio |
| Offline 1 zone | Offline illimité + PMTiles |
| Recherche de lieux | Recherche de lieux |
| SOS d'urgence | SOS d'urgence |

> Prix dynamiques localisés via RevenueCat (devise locale du Play Store). Plans : mensuel, annuel (7j gratuits), lifetime.

## Features techniques

- Moteur Three.js WebGL avec LOD adaptatif (zoom 6→18) et caméra terrain-aware
- WebWorkers pool (4 mobile / 8 desktop) pour fetch tuiles et calcul normal maps
- Touch controls Google Earth (pinch/zoom/rotation/tilt via PointerEvents)
- Presets GPU auto-détectés (52 patterns) : eco / balanced / performance / ultra
- Deep Sleep réel (`setAnimationLoop(null)` sur visibilitychange)
- Idle throttle 20fps + accumulateurs eau/météo (20fps max)
- Adaptive DPR sur interaction mobile (1.0 pendant pan/zoom)
- Ghost tiles pour transitions LOD fluides (fondu 1.2s)
- AbortController sur tous les fetches de tuiles
- Boussole 3D Three.js synchronisée avec la caméra en temps réel
- Profil d'élévation SVG interactif avec marqueur 3D
- Analyse solaire par ray-casting terrain (SunCalc) — soleil mondial (suit le centre de la carte)
- Particules météo GPU-driven (ShaderMaterial, 15k particules)
- Végétation bio-fidèle par altitude (InstancedMesh, déterministe)
- Recherche hybride (MapTiler + Nominatim + Overpass peaks) avec classification et zoom adaptatif
- Panels déplaçables (hold 300ms + drag, double-tap reset)
- Récupération automatique des enregistrements GPS après crash Android
- i18n : FR / DE / IT / EN (fallback automatique)
- PWA (Service Worker, Workbox, cache 30 jours)
- Android natif via Capacitor (Foreground Service GPS, RevenueCat IAP)
- WCAG 2.1 AA : aria-labels, focus-visible, contraste, touch targets 48px+
- Protection anti-spam API : backoff exponentiel Overpass/MapTiler/OSM, rotation de clés MapTiler

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
git tag v5.19.2
git push origin v5.19.2
```

Le CI (`.github/workflows/release.yml`) build l'AAB signé et crée une GitHub Release automatiquement. 6 secrets GitHub requis. Voir [RELEASE.md](./docs/RELEASE.md) pour le workflow complet.

## Sources de données

| Source | Couverture | Licence |
|---|---|---|
| SwissTopo WMTS | 🇨🇭 Suisse | OGD — gratuit |
| SwissTopo Vector Tiles | 🇨🇭 Suisse | OGD — gratuit |
| Plan IGN v2 | 🇫🇷 France | Etalab 2.0 — gratuit |
| OpenTopoMap | 🌍 Mondial (LOD ≤ 10) | CC-BY-SA |
| OpenStreetMap | 🌍 Mondial | ODbL — gratuit |
| MapTiler Cloud | Satellite + topo mondial | Commercial (clé requise) |
| Open-Meteo | 🌍 Météo mondiale | CC-BY 4.0 — sans clé |
| Overpass API (OSM) | 🌍 Bâtiments, POI, sommets | ODbL |

## Documentation

| Document | Contenu |
|---|---|
| [CLAUDE.md](./CLAUDE.md) | Guide IA principal — règles critiques, conventions, structure (point d'entrée pour tous les agents) |
| [RELEASE.md](./docs/RELEASE.md) | Workflow de publication + historique versionCode |
| [CHANGELOG.md](./docs/CHANGELOG.md) | Historique détaillé des versions |
| [FEATURES.md](./docs/FEATURES.md) | Liste des fonctionnalités |
| [TESTS.md](./docs/TESTS.md) | Infrastructure de tests (398 tests, 36 fichiers) |
| [ANDROID.md](./docs/ANDROID.md) | Guide build Android |
| [MONETIZATION.md](./docs/MONETIZATION.md) | Stratégie business |
| [ROADMAP_TRAIL_INTELLIGENCE.md](./docs/ROADMAP_TRAIL_INTELLIGENCE.md) | Roadmap analyse intelligente (v6.0→v6.3) |

## Licence

MIT + Commons Clause — code source disponible pour étude et usage personnel. Commercialisation interdite. Voir [LICENSE](./LICENSE).
