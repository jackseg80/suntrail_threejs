# SunTrail — TODO (v5.56.1)

> Dernière mise à jour : 2026-05-26

## 🔴 Critique (next release)

- [x] **Frontières vectorielles (polygones OSM)** — Polygone Suisse 54 points, multi-point tile check, LOD cap Swisstopo 14 (v5.55.4)

## 🟡 Court terme (v5.56.x)

- **Debug OAuth Google** — Résoudre les problèmes de stabilité et réactiver l'UI
- **Refactoring SolarProbeSheet.ts** (896 lignes) — Extraire les sous-composants UI et handlers en modules séparés
- **Refactoring SettingsSheet.ts** (711 lignes) — Découper par section (résolution, carte, GPS, etc.)
- **Tests poi.ts** — Couverture partielle : tester la détection de catégories avec PBF mockés
- **Alertes Sécurité v6.0** — Toujours gratuites (météo extrême, avalanches) — prévu v6.0

## 🟢 Long terme (v6.x)

- **Trail Intelligence** — Module d'analyse IA des itinéraires (repoussé à v6.0-v6.3)
- **Coverage pays** — Slovénie, Italie, Norvège, UK (voir ROADMAP.md)
- **Offline Alertes** — Système d'alertes sécurité hors-ligne (v6.0+)
- **Abonnement familial** — Pack famille RevenueCat (v6.1+)

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
