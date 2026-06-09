# SunTrail — Guide IA (v5.61.3)

> Point d'entrée unique pour tous les agents IA.
> Mis à jour le 2026-06-09 — v5.62.1 : Cache offline partitionné, index CacheStorage O(1), Overview Q80, Élévation WebP lossless, Normalmap RG compact, Pools adaptatifs. 1087 tests.

## Projet

App cartographique 3D mobile-first spécialisée randonnée (Three.js + Capacitor).
- **Chaîne YouTube** : [@SunTrail3D](https://www.youtube.com/@SunTrail3D) (Démos & Tutoriels)
- **Architecture Multi-Page (v5.53.5)** : `index.html` (Landing), `app.html` (App 3D), `login.html` (Auth).
- **Authentification** : Supabase. Sync PRO via RevenueCat (`appUserId` = Supabase UID).
- **Simulation Solaire** : Calcul d'ombres en temps réel sur relief, forêts (InstancedMesh) et bâtiments 3D.
- **Analyse Topographique** : Profil d'élévation, stats (D+/D-, VAM) et inclinomètre numérique.
- **Offline-first** : LOD adaptatif, PMTiles, zones mises en cache.
- **Hydrologie & Végétation** : Vector Tiles PBF (SwissTopo/MapTiler). Zéro Z-fighting, précision pixel.
- **Frontières & Sources HD (v5.56.0)** : Système data-driven (55 pays via Natural Earth).
  - CH (SwissTopo), FR (IGN), AT (basemap.at), DE (BKG), ES (IGN España), NO (Kartverket).
  - Auto-détection du pays → HD si dispo, sinon fallback global (OpenTopoMap).
  - Détails des flux (Couleur/Elevation) : [docs/AI_PERFORMANCE.md](docs/AI_PERFORMANCE.md).
- **Historique GPX (v5.56.2)** : 5 derniers tracés persistants avec mini-cartes et geocoding auto.
- **Météo & Particules (v5.56.4)** : Particules 3D (pluie/neige) via `ShaderMaterial` + Open-Meteo.
- **Offline Zones (v5.57.0)** : Sélection visuelle interactive (rectangle vert), slider LOD 5-18, toolbar avec compteur de tuiles. Détails : [docs/AI_NAVIGATION_UX.md](docs/AI_NAVIGATION_UX.md).
- **Foreground Service** : Architecture processus séparé `:tracking` pour GPS continu.

## UI & Design (v5.53.8)

- **Modernisation** : Icônes SVG vectorielles dual-tone remplaçant les emojis dans les contrôles critiques.
- **Icon Module** : `src/modules/ui/icons.ts` centralise les SVGs standards.
- **Consistance** : UpgradeSheet, AcceptanceWall et SettingsSheet refondus.
- **Réglages (v5.60.1)** : Clé MapTiler, Clé ORS, GPU/CPU/Preset, ID Testeur déplacés dans `⚙️ Paramètres Avancés`. Les clés API ont disparu de "Système & Données" et du panneau itinéraire.
- Guide de style complet : [docs/AI_UI_STYLE_GUIDE.md](docs/AI_UI_STYLE_GUIDE.md).

### ⚠️ Règles Windows/PowerShell (SÉCURITÉ)
1. **Zéro BOM** : Ne jamais utiliser `Out-File` sans précaution sur les fichiers système Android.
2. **Méthode .NET** : Préférer `[System.IO.File]::WriteAllText` pour l'UTF-8 sans signature.
3. **Double-Échappement** : Attention aux guillemets dans les commandes Shell.

### 🚀 Protocole de Release (IMPÉRATIF)
1. **Pre-check** : `npm run check` + `npm test`.
2. **Version** : Incrémenter `package.json` ET `android/app/build.gradle` (`versionCode` + `versionName`).
3. **Docs** : Update `CHANGELOG.md`, `TODO.md`, `CLAUDE.md`, `GEMINI.md`.
4. **Git** : Commit, tag (`git tag vX.Y.Z`), push avec tags.

### 📚 Index de Documentation

| Domaine | Document de Référence | Contenu |
| :--- | :--- | :--- |
| **État & Logique** | [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | Proxy State, EventBus, Services. |
| **Rendu & Batterie** | [docs/AI_PERFORMANCE.md](docs/AI_PERFORMANCE.md) | Magic Numbers, Data Flows, Benchmarking. |
| **Design & UI** | [docs/AI_UI_STYLE_GUIDE.md](docs/AI_UI_STYLE_GUIDE.md) | Grilles, Icônes, Variables CSS. |
| **Business & Gates** | [docs/MONETIZATION.md](docs/MONETIZATION.md) | RevenueCat, Grille Free/Pro, Offline limits. |
| **Interface & UX** | [docs/AI_NAVIGATION_UX.md](docs/AI_NAVIGATION_UX.md) | TouchControls, Offline interaction, Modules. |
| **Débogage** | [docs/AI_DEBUGGING.md](docs/AI_DEBUGGING.md) | Simulation, Troubleshooting. |

### Monétisation & Gates (v5.57.0)
- **Pack Suisse HD** : Gratuit sur le Web. PRO sur Android.
- **Solaire** : 24h gratuit. Calendrier = PRO.
- **Offline** : 1 zone gratuite. Illimité = PRO.
- **LOD** : Plafond LOD 14 pour les gratuits (PRO → LOD 18).
- **REC GPS** : Toujours gratuit (Sécurité).

### Calculs & Précision
- **Distance** : Haversine.
- **D+ / D-** : Hystérésis 5m (v5.29.30).
- **Lissage** : Moyenne mobile 5 pts.
- **Thickness GPX** : Exponentiel zoom-based (v5.40.40).
- **Deep Sleep** : ~1.5 FPS après 30s d'inactivité (v5.29.7).
