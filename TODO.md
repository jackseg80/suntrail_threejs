# SunTrail — TODO (v5.78.2)

> Dernière mise à jour : 2026-06-19

## 🔴 Critique (next release)

- **Refactoring SettingsSheet.ts** (951 lignes) — Découper par section (résolution, carte, GPS, etc.)
- **Refactoring WeatherSheet.ts** (867 lignes, 0% couverture) — Extraire logique météo en service et sous-composants
- **Refactoring SolarProbeSheet.ts** (1190 lignes, 0% couverture) — Continuer l'extraction des sous-composants UI
- **Tests UI components** — PacksSheet (35%), UpgradeSheet (56%), TrackSheet (10%), SolarProbeSheet (2%), WeatherSheet (2%)

## 🟡 Court terme

- **Zones noires AT/ES/NO LOD 14+** — Pixel noirs hors-frontière sur basemap.at, IGN España, Kartvertek. Explorer chroma key dans le worker.
- **Timeout retry (v5.72.0)** — Les tuiles timeoutées (30s) restent en statut `failed` sans retry automatique. Ajouter un mécanisme de retry progressif.
- **Debug OAuth Google** — Résoudre les problèmes de stabilité et réactiver l'UI
- **Paiements Web — Restauration par Email** — Un utilisateur qui paie via Stripe sur web perd l'accès s'il change de navigateur (App User ID aléatoire en localStorage).
- **Tests poi.ts** — Couverture partielle : tester la détection de catégories avec PBF mockés
- **Rapport de couverture** — Atteindre 60% lignes (actuel 51.7%)

## 🟢 Long terme (v6.x)

- **Trail Intelligence** — Module d'analyse IA des itinéraires (repoussé à v6.0-v6.3)
- **Coverage pays** — Slovénie, Italie, Norvège, UK (voir ROADMAP.md)
- **Offline Alertes** — Système d'alertes sécurité hors-ligne (v6.0+)
- **Abonnement familial** — Pack famille RevenueCat (v6.1+)
- **Refactoring packManager.ts** — Split en packCatalog + packDownloader + packMounter (770 lignes, 10% couverture)
- **Refactoring tileLoader.ts** — Split logique métier en tileService.ts (912 lignes)
- **Tests Tile.ts** — 671 lignes, 0% couverture, cœur du rendu 3D
- **Tests draggablePanel.ts** — 230 lignes, 20% couverture, machine à états pointer
- **Tests mobile.ts** — 141 lignes, 6% couverture, Capacitor lifecycle + OAuth

## ✅ Récemment complété (v5.78.1)

- [x] **Bug getElevation()** — Retournait NaN si `ele=NaN` au lieu de fallback vers `alt` ou `0`
- [x] **Bug revokeProAccess()** — Ne réinitialisait pas les flags Pro (buildings, inclinometer, weather_pro)
- [x] **10 fichiers de tests ajoutés** (100 tests) : gpxTypes, iap, packCatalog, packTypes, storage, autoHide, SharedAPIKeyComponent, UpsellModal, SolarLockedItem, SolarTimeline
- [x] **Couverture activée** : seuil 50% lignes, rapport HTML dans ./coverage/
