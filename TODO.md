# SunTrail — TODO (v5.73.0)

> Dernière mise à jour : 2026-06-13

## 🔴 Critique (next release)

- **Refactoring SettingsSheet.ts** (951 lignes) — Découper par section (résolution, carte, GPS, etc.)
- **Refactoring WeatherSheet.ts** (867 lignes, 0% couverture) — Extraire logique météo en service et sous-composants
- **Refactoring SolarProbeSheet.ts** (1190 lignes, 0% couverture) — Continuer l'extraction des sous-composants UI
- **Tests UI components** — PacksSheet (1.8%), UpgradeSheet (1.7%), TrackSheet (10.7%), SolarProbeSheet (0%), WeatherSheet (0%)

## 🟡 Court terme

- **Zones noires AT/ES/NO LOD 14+** — Pixel noirs hors-frontière sur basemap.at, IGN España, Kartvertek. Explorer chroma key dans le worker.
- **Timeout retry (v5.72.0)** — Les tuiles timeoutées (30s) restent en statut `failed` sans retry automatique. Ajouter un mécanisme de retry progressif.
- **Debug OAuth Google** — Résoudre les problèmes de stabilité et réactiver l'UI
- **Paiements Web — Restauration par Email** — Un utilisateur qui paie via Stripe sur web perd l'accès s'il change de navigateur (App User ID aléatoire en localStorage).
- **Tests poi.ts** — Couverture partielle : tester la détection de catégories avec PBF mockés

## 🟢 Long terme (v6.x)

- **Trail Intelligence** — Module d'analyse IA des itinéraires (repoussé à v6.0-v6.3)
- **Coverage pays** — Slovénie, Italie, Norvège, UK (voir ROADMAP.md)
- **Offline Alertes** — Système d'alertes sécurité hors-ligne (v6.0+)
- **Abonnement familial** — Pack famille RevenueCat (v6.1+)
- **Refactoring packManager.ts** — Split en packCatalog + packDownloader + packMounter (770 lignes, 10% couverture)
- **Refactoring tileLoader.ts** — Split logique métier en tileService.ts (912 lignes)

## ✅ Récemment complété (v5.73.0)

- [x] **Pack Autriche v2 multi-source** — OpenTopoMap LOD 8-11 + basemap.at HD LOD 12-14
- [x] **Data-driven inPackZone** — `hasInstalledPackForCountry()` remplace `(inCH||inFR)` codé en dur
- [x] **Race condition cache** — `initCacheLayer()` appelé avant `loadTerrain()`
- [x] **Seuil pack LOD 8** — `getMinPackZoom()` au lieu de LOD 12 hardcodé
- [x] **npm audit fix** — 0 vulnérabilités (uuid via overrides)
- [x] **i18n** — Clé `terrain.toast.noRelief3D` ajoutée dans fr/en/de/it
- [x] **Tests P0** — `initCacheLayer`, `resetTileLoaderState`, `hasInstalledPackForCountry`, `getMinPackZoom`, `inPackZone` data-driven (+20 tests)

## ✅ Récemment complété (v5.72.0)

- [x] **Timeout 30s** sur `tile.load()` — empêche le blocage infini
- [x] **Drapeau pack** — PacksSheet affiche le bon drapeau via `countryCodeToFlag()`

## ✅ Récemment complété (v5.71.0)

- [x] **Pack Suisse v3** — 664 Mo, elevation lossy WebP Q40

## ✅ Récemment complété (v5.70.0)

- [x] **Badge LOD cliquable** — Packs/disponible détecté automatiquement
- [x] **`packManager.findPackContaining(lat, lon)`** — détection publique du pack couvrant une position
- [x] **Système & Données restructuré** — section "Données embarquées"

## ✅ Récemment complété (v5.62.x)

- [x] **Pools matériaux+géométries adaptatifs par preset** (v5.62.1)
- [x] **Cache partitionné + index O(1) + Overview Q80 + Normalmap RG compact** (v5.62.0)
- [x] **Race condition cleanup caches au démarrage** — `await` séquentiel (v5.62.2)
- [x] **Pastille REC** — position corrigée (v5.62.3→v5.62.8)
