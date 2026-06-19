# SunTrail — TODO (v5.78.0)

> Dernière mise à jour : 2026-06-19

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

## ✅ Récemment complété (v5.78.0)

- [x] **Mesh 3D gelé silencieusement** — `console.warn` sur scene/camera/originTile null + test
- [x] **Spam broadcast GPS** — Broadcast supprimé sur fixes individuels, notifié qu'aux flushs DB

## ✅ Récemment complété (v5.77.0)

- [x] **Sync REC bloquée (perf)** — `syncPoints()` incrémental (contexte de bordure au lieu de tout le dataset) + mutex `_syncing`
- [x] **Normalisation types REC** — `NativeGPSPoint→LocationPoint` avant stockage
- [x] **Temps aberrant notification REC** — Protection `getElapsedTimeString()` contre `mStartTime` corrompu
- [x] **`calculateTrackStats()` skipCleaning** — Paramètre pour éviter le re-calcul `cleanGPSTrack` complet toutes les 10s
- [x] **Tests REC** — +7 tests (lock, sync incrémental, normalisation, bordures, skipCleaning)

## ✅ Récemment complété (v5.76.0)

- [x] **Race condition clé MapTiler/ORS** — `await resolveMapTilerKey()` au lieu de `void` ; `isMapTilerDisabled` reset sur succès Gist
- [x] **État DÉGRADÉ carte Réseau** — 3ᵉ statut jaune entre ONLINE et OFFLINE
- [x] **Tests config.ts** — Reset `isMapTilerDisabled` sur Gist valide + cas Gist vide
- [x] **i18n** — Clés `connectivity.status.degraded` (fr/en)
- [x] **CSS** — Classe `.conn-status-degraded` (warning)
