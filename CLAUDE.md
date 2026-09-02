# SunTrail — Guide IA (version source v5.87.0 — dépôt de traces pleine fidélité)

> Point d'entrée unique pour tous les agents IA.
> Mis à jour le 2026-09-02 — v5.87.0 / Android 907 est clôturée pour publication GitHub.
> v5.85.1 est figée au commit local `b30a1c1` ; ses validations Android/E2E et terrain restent
> séparées et ouvertes. v5.86.0 est clôturée sur GitHub et son AAB `versionCode 904` a été importé
> dans Google Play. v5.86.1 / `versionCode 905` est également visible dans Play Console ;
> v5.86.2 / `versionCode 906` est publiée sur GitHub et a été envoyée en test Play selon le
> propriétaire. Aucun upload Play de v5.87.0 / `versionCode 907` n'est inclus.
> Aucun commit, tag, push, téléversement Play Console ni déploiement n'est implicite. Prepared
> Routes, REC, Guidance, récupération native, offline/corridors et Free/Pro sont préservés.

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
- **Prepared Routes (v5.83.0)** : `PreparedRouteV1` et `RouteRepository` IndexedDB ; géométrie
  complète, réouverture locale, difficulté/effort/ETA/soleil et legacy approximatif explicite.
- **Suivi foreground (v5.84.0, jalon interne clôturé)** : `GuidanceEngine` TypeScript pur, `GuidancePlanV1`
  séparé, indications ORS/OSRM/GPX, progression/ETA/écart et alertes visuelles/haptiques écran
  actif. Aucun guidage natif/background, notification ou reprise après fermeture.
- **Guidage Android (v5.85.0 clôturée)** : port Java du matcher, route/session Room v2, modes
  recording/guidance/both, snapshot et notification persistante avec reprise.
- **Optimisation terrain (v5.85.1)** : deep sleep boussole, REC long/persistance bornés, cache et
  préchargement LOD corrigés, travaux UI permanents supprimés et guidage natif moins bavard.
- **Readiness & corridor mesuré (v5.86.0 clôturée)** : rapport déterministe en cinq sections ;
  route/lumière immédiates, corridor Free 1 km planifié LOD 5→14, couverture locale mesurée sans
  réseau, téléchargement/progression/annulation dans la Bibliothèque et remplacement persistant ;
  météo/appareil restent inconnus sans preuve. Voir [docs/READINESS_OFFLINE.md](docs/READINESS_OFFLINE.md).
- **Android 15/16, R8 & mémoire terrain (v5.86.1)** : insets Capacitor/WebView unifiés sur quatre
  côtés, mode immersif conservé, provenance AndroidX du cutout documentée, règles R8 globales
  supprimées et cache Android inactif borné ; un compteur de références protège les textures
  affichées de l'éviction, qui ne libère que les textures inactives (bitmaps conservés pour
  ré-upload, tuiles noires du mode suivi corrigées).
  Voir [docs/ANDROID_LINT.md](docs/ANDROID_LINT.md).
- **Sortie contextuelle (v5.86.2)** : un view-model pur sépare repos, route, Guidance, REC,
  Guidance + REC et résumé de fin. Bibliothèque réunit les itinéraires « À suivre » et activités
  « Enregistré » dans « Mes parcours » ; nom et résumé REC essentiels restent Free, tandis que
  l'export fichier et l'ajout multi-carte sont Pro.
- **Dépôt de traces (v5.87.0)** : `StoredTrackV1` et
  `TrackRepository` IndexedDB conservent les imports/REC en pleine fidélité, migrent l'historique
  legacy sans le supprimer et n'acquittent le REC natif qu'après archivage durable. Free garde
  toutes ses traces une par une ; Pro ajoute multi-affichage/export. Voir
  [docs/TRACK_STORAGE.md](docs/TRACK_STORAGE.md).
- **Météo & Particules (v5.56.4)** : Particules 3D (pluie/neige) via `ShaderMaterial` + Open-Meteo.
- **Offline Zones (v5.57.0)** : Sélection visuelle interactive (rectangle vert), slider LOD 5-18, toolbar avec compteur de tuiles. Détails : [docs/AI_NAVIGATION_UX.md](docs/AI_NAVIGATION_UX.md).
- **Foreground Service** : Architecture processus séparé `:tracking` pour GPS continu.

## UI & Design (v5.53.8)

- **Modernisation** : Icônes SVG vectorielles dual-tone remplaçant les emojis dans les contrôles critiques.
- **Icon Module** : `src/modules/ui/icons.ts` centralise les SVGs standards.
- **Consistance** : UpgradeSheet, AcceptanceWall et SettingsSheet refondus ; catégories Réglages et compte/RGPD isolés en composants dédiés.
- **Navigation (v5.86.2)** : quatre destinations principales ; `data-tab="track"` reste l'adaptateur
  de Sortie contextuelle et `library` ouvre le même `TrackSheet` sur « Mes parcours ». Les origines
  GPX, création SunTrail et REC restent secondaires. Aucun catalogue n'est rendu dans Sortie.
- **Contrat des traces (v5.83.0)** : Préparer possède un unique brouillon nommé, la sélection
  Bibliothèque/Sortie ne change que la trace consultée (carte/profil), et REC reste indépendant.
  Toute substitution d'un brouillon modifié demande Sauvegarder, Remplacer ou Annuler.
- **Planification (v5.82.0)** : `state.isRoutePlanningMode` rend l'ajout par tap explicite ; hors mode, le tap sélectionne et l'appui long reste un raccourci expert.
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
| **Suivi foreground** | [docs/GUIDANCE_FOREGROUND.md](docs/GUIDANCE_FOREGROUND.md) | Algorithme, seuils, payload, cues et limites v5.84. |
| **Guidage Android** | [docs/GUIDANCE_ANDROID.md](docs/GUIDANCE_ANDROID.md) | Java/Room, bridge, notification, reprise, seuils et gates v5.85. |
| **Readiness & corridor** | [docs/READINESS_OFFLINE.md](docs/READINESS_OFFLINE.md) | Contrat en couches, état réel et responsabilités de stockage v5.86. |
| **Android 15/16 & R8** | [docs/ANDROID_LINT.md](docs/ANDROID_LINT.md) | Edge-to-edge, cutout fusionné et règles de réduction release v5.86.1. |
| **Stockage des traces** | [docs/TRACK_STORAGE.md](docs/TRACK_STORAGE.md) | Modèle, chunks IndexedDB, migration legacy, finalisation REC et gates v5.87. |
| **Batterie & mémoire S23** | [docs/plans/V5_86_BATTERY_VALIDATION.md](docs/plans/V5_86_BATTERY_VALIDATION.md) | Protocole `batterystats`, parsing UID et historique des runs REC. |
| **Programme produit** | [ROADMAP.md](ROADMAP.md) | Versions v5.82→v6.1 révisées, gates et prompts autonomes. |
| **Débogage** | [docs/AI_DEBUGGING.md](docs/AI_DEBUGGING.md) | Simulation, Troubleshooting. |

### Monétisation & Gates (décision v5.87 incluse)
- **Pack Suisse HD** : Gratuit sur le Web. PRO sur Android.
- **Solaire** : 24h gratuit. Calendrier = PRO.
- **Offline** : 1 zone gratuite. Illimité = PRO.
- **LOD** : Plafond LOD 14 pour les gratuits (PRO → LOD 18).
- **REC GPS** : Toujours gratuit (Sécurité).
- **Nom + résumé REC essentiel** : gratuits ; export fichier GPX = PRO, bloqué avant toute écriture.
- **Parcours affichés** : tous accessibles ; 1 à la fois en Free, « Ajouter à la carte » jusqu'à
  10 calques en Pro.
- **Archives REC/import** : pleine fidélité et toutes accessibles en Free comme en Pro ; aucune
  suppression ou simplification au downgrade. Le stockage réel de l'appareil est la seule limite.

### Packs Pays (Country Packs — v5.70.0)

**Architecture** : Archives PMTiles régionales achetables (pays ou zones de rando).
- **2 packs** : `switzerland` (CH, 664 MB) et `france_alps` (Alpes FR, 515 MB).
- **Format** : `PackMeta { id, productId, name, bounds, lodRange, version, sizeMB, cdnUrl, regionCheck }` — voir `packTypes.ts`.
- **3 types de données** par tuile : color (WebP Q60), elevation (WebP lossy Q40), overlay (PNG palette 64).

**Ajouter un nouveau pack** (pays ou région) :
1. Éditer `PACKS` dans `scripts/build-country-pack.ts` (bounds, zooms, source, countryCode optionnel)
2. Générer l'archive : `npx tsx scripts/build-country-pack.ts --pack <id> --maptiler-key <key> --clean`
3. Uploader sur Cloudflare R2 via `scripts/upload-to-r2.ts`
4. Ajouter l'entrée dans l'`EMBEDDED_CATALOG` de `packManager.ts` avec :
   - `regionCheck` : code ISO 2 lettres pour raffiner par polygone, ou absent pour région (bbox seule)
   - `bounds` : bbox de couverture (identique au PACKS)
5. Déployer le `catalog.json` sur CDN (`.env VITE_PACKS_CATALOG_URL`)
6. Ajouter les clés i18n `fr.json`/`en.json`/`de.json`/`it.json` → `packs.*`

**Ajouter une région** (pas de code ISO) : omettre `countryCode` dans `PACKS` → filtrage par bbox seule.

**Cache source** (`./cache/pack-<id>-v4/`) : les téléchargements bruts sont conservés en `.raw`. Pour modifier la compression (qualité, format), changer les réglages dans le script et relancer **sans `--clean`** → re-encodage seul, pas de re-téléchargement.

**Note** : Le build filtre avec Natural Earth seul (conservateur). L'app runtime utilise OSM+NE fusionné pour CH. Les tuiles absentes du pack tombent sur le réseau.

**Détection automatique du pack courant** (`packManager.findPackContaining(lat, lon)`) :
- Vérifie la bbox de chaque pack, puis raffine par polygone si `regionCheck` est un code ISO à 2 lettres
- Utilisée par : badge LOD (clic → PacksSheet si pack trouvé, sinon LayersSheet) et badge `Système & Données`

**Badge LOD** (`#top-pill-lod`) : clic adaptatif + indicateur visuel
- 📦 `SWISS · LVL 12` (bleu) → pack disponible sur la zone, non installé
- ✓ `SWISS · LVL 12` (vert, `data-pack-state="installed"`) → pack installé
- `SWISS · LVL 12` (défaut) → aucun pack
- Clic → PacksSheet si pack trouvé, sinon `layers-sheet`

**EventBus** : `packHighlight: { packId }` pour scroll/surligner un pack dans PacksSheet.

### Calculs & Précision
- **Distance** : Haversine.
- **D+ / D-** : Hystérésis 5m (v5.29.30).
- **Lissage** : Moyenne mobile 5 pts.
- **Thickness GPX** : Exponentiel zoom-based (v5.40.40).
- **Deep Sleep** : ~1.5 FPS après 30s d'inactivité (v5.29.7).
