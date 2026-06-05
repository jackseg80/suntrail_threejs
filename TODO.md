# SunTrail — TODO (v5.56.24)

> Dernière mise à jour : 2026-06-05

## 🔴 Critique (next release)

- [x] **Frontières vectorielles (polygones OSM)** — Polygone Suisse 54 points, multi-point tile check, LOD cap Swisstopo 14 (v5.55.4)

## 🟡 Court terme (v5.56.x)

- **Debug OAuth Google** — Résoudre les problèmes de stabilité et réactiver l'UI
- [x] **Refactoring SolarProbeSheet.ts** (896 lignes) — Extraire les sous-composants UI et handlers en modules séparés (v5.56.4)
- **Refactoring SettingsSheet.ts** (715 lignes) — Découper par section (résolution, carte, GPS, etc.)
- [x] **ESLint + Prettier configurés** — Linting et formatage automatique (v5.56.4)
- [x] **Détection doublon GPX** — Hash des points + toast + refus (v5.56.4)
- [x] **Tests tileSources.ts** — 26 tests (URL builders + COUNTRY_SOURCES) (v5.56.4)
- [x] **Tests benchmark.ts** — 5 tests (seuils de scoring) (v5.56.4)
- **Tests poi.ts** — Couverture partielle : tester la détection de catégories avec PBF mockés
- **Alertes Sécurité v6.0** — Toujours gratuites (météo extrême, avalanches) — prévu v6.0

## 🟢 Long terme (v6.x)

- **Trail Intelligence** — Module d'analyse IA des itinéraires (repoussé à v6.0-v6.3)
- **Coverage pays** — Slovénie, Italie, Norvège, UK (voir ROADMAP.md)
- **Offline Alertes** — Système d'alertes sécurité hors-ligne (v6.0+)
- **Abonnement familial** — Pack famille RevenueCat (v6.1+)

## ✅ Récemment complété (v5.56.15)

- [x] **Fix double chargement démarrage** — Benchmark GPU attendu avant création scène (v5.56.15)
- [x] **Fix tuiles frontières CH (Bonfol, Aigle, Monthey)** — Fusion polygones OSM+Natural Earth, logique pro-CH, strictAtHighZoom assoupli (v5.56.15)
- [x] **Démarrage accéléré** — Clé MapTiler fast-path, fetchCatalog fire-and-forget (v5.56.15)
- [x] **Fuite canvas DOM** — Nettoyage canvas dans disposeScene() (v5.56.15)

## ✅ Récemment complété (v5.56.14)

- [x] **Historique GPX persistant** — 5 derniers imports/REC en localStorage avec mini-carte (v5.56.2)
- [x] **Fusion panneaux GPX** — Liste unifiée "Parcours" (historique + layers actifs + routes manuelles) (v5.56.2)
- [x] **Reverse geocoding GPX** — Nom de lieu automatique (MapTiler/Nominatim) + fallback pays 55 pays (v5.56.2)
- [x] **Bouton profil toggle** — Icône active bleue, ouvrir/fermer le panneau d'élévation (v5.56.2)
- [x] **Types GPX centralisés** — `gpxTypes.ts`, `GeoPoint`, `GPXRawData`, `getElevation()` (v5.56.2)
- [x] **Robustesse mesh REC** — Build avant dispose, plus de perte si erreur (v5.56.2)
- [x] **Dette technique** — Extraction `disposeTrackMesh`, `getPerformanceEpsilonMultiplier`, `createGlassModal`, cache localStorage, guard GPX_COLORS (v5.56.2)

## ✅ Récemment complété (v5.56.x)

- [x] **Sources HD pays** — Autriche (basemap.at), Allemagne (BKG TopPlusOpen), Espagne (IGN España) (v5.56.0)
- [x] **Frontières vectorielles** — Polygone Suisse OSM 54 points, multi-point tile check, LOD cap Swisstopo 14 (v5.55.4)
- [x] **Fix carte noire démarrage** — Résolution race condition benchmark/terrain (v5.55.1)
- [x] **Fix initialLon typo** — Coordonnées de départ correctes (v5.55.1)
- [x] **Auto-reload WebGL lost** : Récupération automatique sur perte de contexte GPU (v5.55.1)
- [x] **Benchmark de performance v2.0** — Micro-benchmark matériel au 1er boot (v5.55.0)
- [x] **Calibration presets** — Presets basés sur le score réel CPU/GPU (v5.55.0)
- [x] **Masquage temporaire Auth Google** — UI et tests ignorés pour stabilité (v5.54.4)
- [x] **Robustesse OAuth Supabase** — Redirection fragments + handshake localStorage (v5.54.4)
- [x] **Sync cache tuiles v30** — Alignement worker et loader principal (v5.54.4)
- [x] **Fix fuites listeners orientation** — Cleanup listeners DeviceOrientation (v5.54.4)
- [x] **Profil/pentes cleanup au nettoyage GPX** — closeElevationProfile() + 6 tests removeGPXLayer (v5.54.3)
- [x] **Hardening listeners Capacitor** — nativeGPSService._listenerHandles (v5.54.2)
- [x] **iapService cleanup** — message listener + pagehide guard (v5.54.2)
- [x] **Storage constants centralisés** — src/constants/storage.ts, 14 clés (v5.54.2)
- [x] **Tests haptics, theme, toast, weatherUtils** — +66 tests (814 total) (v5.54.2)
- [x] **npm audit** — 7 vulnérabilités corrigées → 0 (v5.54.2)
- [x] **Freemium multi-tracés GPX** — index-based locking (v5.54.0)
- [x] **Free Trials natifs RevenueCat** — Suppression trials locaux (v5.53.7)
- [x] **Architecture multi-page** — index.html / app.html / login.html (v5.53.5)
- [x] **Foreground Service** — RecordingService processus isolé :tracking (v5.53.0)
