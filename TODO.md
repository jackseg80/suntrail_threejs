# SunTrail — TODO (v5.78.7)

> Dernière mise à jour : 2026-06-19

## 🔴 Critique (next release)

- **Refactoring SettingsSheet.ts** (951 lignes) — Découper par section (résolution, carte, GPS, etc.)
- **Refactoring SolarProbeSheet.ts** (1190 lignes, 5% couverture) — Continuer l'extraction des sous-composants UI
- **Refactoring tileLoader.ts** — Split logique métier en tileService.ts (912 lignes)

## 🟡 Court terme

- **Zones noires AT/ES/NO LOD 14+** — Pixel noirs hors-frontière sur basemap.at, IGN España, Kartvertek. Explorer chroma key dans le worker.
- **Timeout retry (v5.72.0)** — Les tuiles timeoutées (30s) restent en statut `failed` sans retry automatique. Ajouter un mécanisme de retry progressif.
- **Paiements Web — Restauration par Email** — Restauration de l'accès après changement de navigateur.
- **Rapport de couverture** — Atteindre 60% lignes (actuel 57.16%)

## 🟢 Long terme (v6.x)

- **Trail Intelligence** — Module d'analyse IA des itinéraires (repoussé à v6.0-v6.3)
- **Coverage pays** — Slovénie, Italie, Norvège, UK (voir ROADMAP.md)
- **Offline Alertes** — Système d'alertes sécurité hors-ligne (v6.0+)
- **Abonnement familial** — Pack famille RevenueCat (v6.1+)
- **Tests scene.ts** — 942 lignes, 7% couverture, cœur du rendu 3D
- **Tests weather.ts** — 380 lignes, 55% couverture
- **Tests SearchSheet.ts** — 422 lignes, 34% couverture
- **E2E Playwright** — Météo, Solaire, GPX, Offline zones, REC
- **CI Pipeline** — GitHub Actions avec npm test + npm run check

## ✅ Récemment complété (v5.78.x)

- [x] **Audit tests complet** — 20 fichiers de test, 277 tests ajoutés
- [x] **Bug getElevation()** — Retournait NaN si `ele=NaN` au lieu de fallback
- [x] **Bug revokeProAccess()** — Ne réinitialisait pas les flags Pro
- [x] **Couverture activée** — seuil 50%, rapport HTML, 57.16% actuels
- [x] **Tests ajoutés** : gpxTypes, iap, packCatalog, packTypes, storage, SolarLockedItem, SolarTimeline, autoHide, SharedAPIKeyComponent, UpsellModal, SOSSheet, draggablePanel, NavigationBar, LayersSheet, SearchSheet, mobile, WidgetsComponent, ConnectivitySheet, TrackSheet, WeatherSheet, SolarProbeSheet, Tile
- [x] **Tests enrichis** : compass (2→14), utils (2→16), buildings.integration (1→6), hydrology.integration (1→7), poi.integration (1→6), tileQueue (+14)
