# SunTrail — Guide IA (version source v5.88.0 — stabilisation performance)

> Point d'entrée unique pour tous les agents IA.
> Mis à jour le 2026-09-06 — v5.88.0 / Android 908 est clôturée pour publication GitHub ; l'AAB
> signé est attaché à la release. Aucun upload Play de cette version n'est inclus.
> v5.85.1 est figée au commit local `b30a1c1` ; ses validations Android/E2E et terrain restent
> séparées et ouvertes. v5.86.0 est clôturée sur GitHub et son AAB `versionCode 904` a été importé
> dans Google Play. v5.86.1 / `versionCode 905` est également visible dans Play Console ;
> v5.86.2 / `versionCode 906` est publiée sur GitHub et a été envoyée en test Play selon le
> propriétaire. Aucun upload Play de v5.87.0 / `versionCode 907` n'est inclus.
> Aucun commit, tag, push, téléversement Play Console ni déploiement n'est implicite. Prepared
> Routes, REC, Guidance, récupération native, offline/corridors et Free/Pro sont préservés.
> État final v5.88 : suivi 3D stabilisé, 2D allégée, cache/transitions/préchargement fiabilisés,
> STOP REC et animations cachées corrigés. Les contrôles A53/S23 et la comparaison terrain
> S23/Garmin sont positifs. Le contrôle long faible réseau reste un suivi post-release accepté.
> Aucun téléversement Play n'est inclus ; les rapports USB restent locaux car ils contiennent des
> informations d'appareil et de localisation.
> Le journal détaillé ci-dessous conserve les étapes du chantier v5.88. Le rebond 3D A53 a une cause
> reproduite et un correctif caméra validé dans une copie isolée ; les effets 2D et STOP REC
> sont corrigés et testés. La performance combinée longue, l'intégrité native et le contrôle
> S23 restent ouverts. Les contrôles S23 repris ont confirmé un blocage cache et un fondu
> trop lent, corrigés dans Diagnostic : environ0,9s au lieu de16–17s sur les transitions mesurées.
> Les derniers correctifs sont aussi installés et mesurés sur A53 dans Diagnostic : suivi stable,
> chargement rétabli, mais blocages récurrents en route + Guidance + REC. Le contrôle long a été
> interrompu après ce constat ; aucun gate30min acquis. REC et Guidance arrêtés, A53 rendu en2D.
> Reprise exacte et limites : [REPRISE.md](outputs/v5.88-a53-return-20260905/REPRISE.md).
> Derniers profils courts A53 : panneau Stats caché encore dessiné, corrigé localement (1728tests,
> 7E2E verts), sans nouvelle installation. Préchargements répétés112loads/20s à traiter ;
> les saccades globales persistent. Voir [PROFILS_COURTS.md](outputs/v5.88-a53-return-20260905/PROFILS_COURTS.md).
> Suite : préchargement borné au cache et compteur de chargement corrigés localement,
> 1734tests/7E2E verts. APK Diagnostic prête, validation appareil et autorisation d'installation
> encore attendues : [PREFETCH_READY.md](outputs/v5.88-a53-return-20260905/PREFETCH_READY.md).
> Installation ensuite autorisée/réussie surA53 : barre au repos rétablie, archive préservée.
> Modecombiné encore15longtasks/20s, couverture des zooms et S23 ouverts. État actuel :
> [INSTALLATION_RESULTS.md](outputs/v5.88-a53-return-20260905/INSTALLATION_RESULTS.md).

## Projet

Contrôle terrain S23 du6septembre : REC Diagnostic comparé au Garmin sur2,76km.
Écart de distance0,72m ; écart spatial médian1,50m/p955,01m, aucun saut ni portion perdue.
Les deux intervalles>30s correspondent à des arrêts.714points intacts, session/services arrêtés,
aucun crash/ANR disponible. Dénivelé cohérent avec le même filtre. Guidance/FPS non prouvés
par l'archive seule ; gate combiné reste ouvert.
[RESULTATS.md](outputs/v5.88-s23-walk-20260906/RESULTATS.md).

Dernier contrôle6septembre : profil CPU résiduel A53 terminé, Pro/Équilibré/2D/LOD14.
Pause temporaire du cadencement Three.js : CPU cumulé76,5→57%, puis71,5→61%, avec retour
à74,5% après reprise. Fenêtres courtes, indice de coût et non gain produit acquis.
Aucun changement produit ; correction du cycle repos/réveil et gates généraux ouverts.
[RESIDUAL_CPU.md](outputs/v5.88-a53-resources-20260906-1249/RESIDUAL_CPU.md).

Dernier lot6septembre : animations cachées installé avec accord surA53, CSS vérifié
paused→running→paused. Pro/Équilibré/2D, trois archives intactes, aucun service actif.
CPU observé101,75→73,75% d'un cœur ; comparaison indicative après redémarrage/cache différent,
pas gain universel acquis. CPU résiduel et gates globaux restent ouverts.
[ANIMATIONS_INSTALLED.md](outputs/v5.88-a53-resources-20260906-1249/ANIMATIONS_INSTALLED.md).

Correctif courant6septembre : animations CSS invisibles mises en pause (7lignes CSS),
reprise conservée à l'affichage. Régression navigateur reproduite avant/passe après,
1751tests verts. APK Diagnostic en préparation, installation soumise à accord distinct.
[ANIMATIONS_READY.md](outputs/v5.88-a53-resources-20260906-1249/ANIMATIONS_READY.md).

Derniers relevés6septembre après refroidissement : Diagnostic A53 Pro/Équilibré,LOD16,
PSS hôte+WebView≈887MiB en2D /1086MiB en3D, Graphics incluse≈349/433MiB.
Ce sont deux modes actuels, pas un avant/après de versions. CPU résiduel en2D malgré0rendu :
animations CSS invisibles identifiées, pause temporaire réduit le CPU cumulé97,25→80,5%.
Pas encore de correctif produit pour ce point. Profil complémentaire non démarré carPC enveille.
[RESULTATS.md](outputs/v5.88-a53-resources-20260906-1249/RESULTATS.md).

Retour utilisateur après lot cache3D : fonctionnement jugé bon, zones bleues non revues
dans ses manipulations. A53 chaud : statut thermique1 léger,AP41°C,batterie32,6°C.
Contrôle passif2D8s : zéro rendu/chargement/longtask, aucun service actif.
Pas de nouveau benchmark lourd à chaud ; S23 et qualification combinée/offline restent ouverts.
Voir le haut de [CACHE3D_INSTALLED.md](outputs/v5.88-morning-20260906/CACHE3D_INSTALLED.md).

Dernier contrôle6septembre : lot cache3D installé avec accord surA53, Pro/Équilibré.
22puis20tuiles restaurées sans rechargement des textures ; trois archives inchangées.
Pauses de transition et bords sans carte persistent ; chantier non clôturé.
[CACHE3D_INSTALLED.md](outputs/v5.88-morning-20260906/CACHE3D_INSTALLED.md).

Reprise après recharge du6septembre : A53 à48%, Pro/Équilibré/DPR1,2 vérifiés.
Cache2D confirmé sans rechargement. Pixels CPU du relief3D restaurés localement depuis
le bitmap conservé,1751tests/7E2E verts ; nouvelle installation Diagnostic à autoriser.
Couverture bleue et gains globaux toujours ouverts. État actuel :
[CACHE3D_READY.md](outputs/v5.88-morning-20260906/CACHE3D_READY.md).
Les paragraphes suivants conservent les validations antérieures.

Dernière validation6septembre : APK finalisation REC + cache2D installée avec accord surA53.
STOP+Guidance réel : archive10points/export10points identiques ; services arrêtés. Batterie
sous20% et ECO automatique : benchmarks suspendus jusqu'à recharge et preset vérifié.
Voir [INSTALLATION.md](outputs/v5.88-morning-20260906/INSTALLATION.md).

Dernier état6septembre : balade dans la version publiée via raccourci habituel, pas Diagnostic.
371points archivés contre368dans l'exportSTOP : correctif local testé1744tests/7E2E,
APK Diagnostic prête non installée, incluant cache2D. Aucun changement du GPS natif.
Voir [RESULTATS.md](outputs/v5.88-morning-20260906/RESULTATS.md).

État ultérieur : APK couverture installée avec accord mais bleu toujours confirmé par captures
natives. Cache2D corrigé localement (1741tests), non installé ; téléphone sans session active.
Voir [COVERAGE_RESULTS.md](outputs/v5.88-a53-return-20260905/COVERAGE_RESULTS.md).

Dernier lot v5.88 : trou au dézoom A53 confirmé, rétention des anciennes tuiles corrigée
localement,1739tests/7E2E verts. APK non installée, accord distinct attendu :
[COVERAGE_READY.md](outputs/v5.88-a53-return-20260905/COVERAGE_READY.md).

App cartographique 3D mobile-first spécialisée randonnée (Three.js + Capacitor).
- **Chaîne YouTube** : [@SunTrail3D](https://www.youtube.com/@SunTrail3D) (Démos & Tutoriels)
- **Architecture Multi-Page (v5.53.5)** : `index.html` (Landing), `app.html` (App 3D), `login.html` (Auth).
- **Compte & synchronisation** : aucun compte requis aujourd'hui. La continuité PC–Android est
  reportée après v6.1 ; RevenueCat reste indépendant de ce futur compte optionnel.
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
- **Audit et stabilisation performance (v5.88.0 clôturée)** : coûts 3D/2D, tuiles, cache,
  préchargement, STOP REC et animations cachées corrigés à partir de mesures A53/S23, sans
  nouvelle fonction ni perte de fidélité. Voir
  [docs/plans/prompts/V5_88_PERFORMANCE_STABILIZATION.md](docs/plans/prompts/V5_88_PERFORMANCE_STABILIZATION.md).
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
| **Programme produit** | [ROADMAP.md](ROADMAP.md) | Versions v5.82→v6.2 révisées, gates et prompts autonomes. |
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
