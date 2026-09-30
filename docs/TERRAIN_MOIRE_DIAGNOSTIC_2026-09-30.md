# Diagnostic du quadrillage et des taches 3D — 30 septembre 2026

Statut : qualification locale et S23 acceptée ; release 5.92.2 / 920 autorisée, AAB à contrôler
dans la CI avant remise. Base : `dfd736bc` (5.92.1 / 919).
Worktree isolé : `C:\Users\jacks\.codex\worktrees\swiss-terrain-moire\suntrail_threejs`.
Les travaux Cesium et `ROADMAP.md` du dépôt principal sont conservés sans modification.

## Conclusion et niveau de preuve

Deux défauts numériques distincts sont reproduits et corrigés. Le quadrillage du pack réduit
est expliqué par l'expansion de l'altitude en escaliers. Les grandes taches sans pack sont
compatibles avec un défaut commun d'encodage des normales, démontré sur WebGL. Après le
repositionnement S23 par le propriétaire, leurs contours artificiels ne sont plus retrouvés
dans le même champ aux LOD17/18 ; le propriétaire confirme un rendu satisfaisant. Cela reste
une qualification visuelle ciblée, pas une validation altimétrique indépendante de tous les DEM.

| Hypothèse                                                        | Probabilité actuelle                             | Preuve et limite                                                                                                                                                                 |
| :--------------------------------------------------------------- | :----------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expansion au plus proche de l'élévation z12 du v6                | Très élevée pour le quadrillage avec v6          | Un plan incliné constant devient alternativement plat et raide ; disparition de cet artefact après interpolation des hauteurs, mêmes octets source.                              |
| Quantification de la composante verticale des normales compactes | Élevée pour les plaques sans pack                | Le vrai GLSL transforme 5° en 0,318°, puis 5,25° en 6,989°. Nouveau décodeur : erreur maximale de 0,318° sur les cas testés. Le lien avec chaque tache réelle reste à qualifier. |
| Microrelief réel/artefacts du DEM natif ou exagération visuelle  | Reste ouverte pour les bosses qui subsisteraient | L'absence de bosses en 2D n'est pas une validation altimétrique : la 2D est plate. Comparer aux altitudes physiques et à un relief visuel ×1 avant de conclure.                  |
| Ombres portées / seul GPU du S23 / compression couleur           | Moins probable                                   | Le propriétaire observe aussi le défaut sur le Web et rapporte des essais avec ombres/presets. Ce témoignage n'est pas un A/B complet instrumenté.                               |
| Nouvelle corruption lossless du pack                             | Non étayée dans les échantillons                 | Tous leurs DEM sont lisibles et identiques aux sources décodées. Cela ne constitue pas un audit exhaustif du pack Suisse complet.                                                |

La corruption historique du v4 (Terrain-RGB encodé avec pertes) et une archive OPFS illisible
sont des incidents distincts. Aucune nouvelle preuve ne les relie aux taches actuelles.

## 1. Parent d'élévation réduit : des escaliers, puis des normales fausses

Le commit `b588a514` du 29 septembre introduit la lecture des parents d'élévation du v6.
L'ancien `cropParentElevationPixels` répétait chaque pixel z12 dans un bloc de 4 × 4 pixels z14.
La différentiation de cette image donne une pente nulle dans les blocs, puis un saut à leur bord.
Un plan synthétique affine reproduit donc un quadrillage sans aucune corruption de PMTiles.

Correction : décoder les altitudes, les interpoler bilinéairement avec centres de texels alignés,
puis réencoder une seule fois à 0,1 m. **Ne jamais interpoler les canaux RGB séparément** : une
retenue entre canaux peut créer une altitude sans rapport avec les valeurs voisines.
Les normales utilisent les hauteurs interpolées non quantifiées et un halo d'un pixel pour
conserver la continuité aux limites des enfants à l'intérieur du même parent.

Le zoom métrique après rééchantillonnage est celui du raster cible (`min(zoom, 14)`), pas z12.
Remplacer simplement ce zoom par 12 sous-estimerait la pente moyenne d'un facteur quatre à z14.
Le DEM natif non rééchantillonné conserve, lui, son `elevSourceZoom`.

Preuve analytique : variation moyenne des normales voisines de 27,889 à 0 sur le plan constant.
Sur sources suisses figées, z12 → z14 : Yverdon 3,609 → 0,439 ; Davos 10,748 → 0,831.
Ces nombres sont des écarts moyens d'octets de normales, pas des mètres ni un gain de FPS.

## 2. Normales compactes : perte de précision près d'un terrain plat

Le terrain est Y-up. L'ancien contrat stockait X et la verticale Y en RG, puis le shader
reconstruisait Z avec `sqrt(1-X²-Y²)` et un signe dans B. Arrondir Y proche de 1 à huit bits
fait disparaître des faibles pentes, puis les fait réapparaître brutalement. Les changements
de signe rendent en outre l'interpolation de B instable près de Z = 0.

Nouveau contrat : RG contient les deux composantes horizontales X/Z ; le shader reconstruit
la verticale positive Y. Encodeur worker et décodeurs vertex/fragment sont modifiés ensemble.
La formule de hauteur du DEM natif, les offsets PMTiles et les versions de pack ne changent pas.
Les normales sont calculées à l'exécution : aucun nouveau format de pack n'est requis.

Le mode compact existait déjà et était actif par défaut. Le commit `3867a2c0` du 17 septembre
(5.91.4) a supprimé son interrupteur et l'a rendu obligatoire. Il est inconnu si le propriétaire
l'avait auparavant désactivé : ce commit est un indice chronologique, pas la preuve de son cas.

Le contrôle `check-terrain-normal-webgl.ts` compile et exécute réellement les deux décodeurs :

| Pente physique | Ancien contrat | Nouveau contrat |
| :------------- | -------------: | --------------: |
| 4,75°          |         0,318° |          4,713° |
| 5°             |         0,318° |          5,199° |
| 5,25°          |         6,989° |          5,199° |

Sur les treize cas 0–30° du banc : erreur maximale ancienne 4,682°, corrigée 0,318°.
La lecture du résultat est elle-même quantifiée sur huit bits. Ce banc n'est pas une mesure
de toutes les directions/pentes possibles ni une qualification du GPU Android.

## Fichiers modifiés ou ajoutés

- Rendu : `src/modules/elevationParentTile.ts`, `src/workers/tileWorker.ts`,
  `src/workers/terrainNormals.ts`, `src/modules/terrain/normalEncoding.ts`,
  `src/modules/terrain/Tile.ts`.
- Régressions : `src/modules/elevationParentTile.test.ts`, `src/workers/terrainNormals.test.ts`.
- Échantillons : preset `switzerland_moire_test` dans `scripts/build-country-pack.ts` ;
  `scripts/prepare-moire-validation-cache.ts` prépare uniquement leurs sources de validation.
- Preuves : `scripts/diagnose-parent-elevation.ts`, `scripts/check-terrain-normal-webgl.ts`,
  `scripts/check-terrain-app.mjs`, `scripts/check-s23-terrain.mjs`.
- Documentation : ce rapport, `docs/AI_DEBUGGING.md`, lien de suivi dans `CLAUDE.md`.

Les différences de chemins absolus générées par Capacitor ont été ramenées aux chemins relatifs.
`src/style.css` a seulement été normalisé LF pour le test historique de texte brut : diff Git nul.
Aucune source Cesium ou archive de production modifiée. La préparation de release porte
ensuite npm/Android à 5.92.2 / 920, après confirmation du maximum Play 919.
Aucune donnée utilisateur ni aucun cache du téléphone supprimé. L'application diagnostic et ses
réglages de vue ont été modifiés pour les essais ; la production est restée intacte.

## Validations automatiques

- Suite complète : **1 979 / 1 979** (`output/terrain-moire/tests-final.json`).
- Dernière suite ciblée altitude/normales/Tile/validation pack : **50 / 50**, quatre fichiers.
- TypeScript et ESLint : passent. Prettier avec `--end-of-line auto` : passe sur `src/`.
  `npm run check` brut reste en échec sur 339 fichiers du checkout CRLF ; il n'est pas présenté
  comme vert et aucun reformatage global n'a été appliqué. `git diff --check` passe.
- Build Capacitor, contrôle des assets, Gradle `assembleDebug` : passent.
- Budget bundle : passe, précache PWA 2,47 MiB.
- Banc GLSL WebGL : passe ; comparaison historique/corrigée conservée dans `webgl-normals.json`.
- Préparation 5.92.2 : export Git de l'index en LF, sans `.env` ni pack diagnostic.
  `npm run check` et `audit:i18n` passent ; couverture : **1 979 / 1 979**, 170 fichiers,
  lignes 73,92 %, branches 61,30 %. Le problème CRLF ci-dessus reste propre au checkout Windows.
  Build de production, budget (précache 2,46 MiB), chemins Capacitor et synchronisation Android
  passent ; le banc GLSL est réexécuté et passe. Gradle `testDebugUnitTest` et `lintRelease`
  passent également sur cet export. L'AAB signé reste soumis à la CI du tag.
- Application complète locale, Chromium/SwiftShader : menus configurés et passages 2D → 3D
  vérifiés avec sources figées à Delémont, Yverdon et Davos ; erreurs JS/shader recherchées.
  Voir `web-app-smoke.json` et les captures `web-*.png`.
- Les deux scénarios pack utilisent un contexte neuf, puis le bouton hors connexion interne
  **avant** le premier chargement d'élévation. Les traces 3D prouvent des lectures
  `country-pack-asset`, sans lecture d'élévation réseau. Il ne s'agit pas d'un test S23.
  La couleur peut avoir été chargée en 2D et les bords hors échantillon restent incomplets.

## Petits packs : plateau et montagne, loin des frontières nationales

Zones : Yverdon (46,72–46,77 / 6,64–6,72), Davos (46,77–46,82 / 9,78–9,86).
Couleur et overlay z12–14 ; variante réduite avec élévation z12, témoin avec élévation z12–14.
Construits uniquement depuis le cache source existant, sans téléchargement ni construction CH complète.

| Archive locale dans `output/`                 |    Taille exacte | DEM validés | Écart source/archive |
| :-------------------------------------------- | ---------------: | ----------: | -------------------: |
| `suntrail-pack-switzerland-moire-z12.pmtiles` | 2 183 489 octets |       8 / 8 |                  0 m |
| `suntrail-pack-switzerland-moire-z14.pmtiles` | 5 495 653 octets |     56 / 56 |                  0 m |

Hashes SHA-256 :

```text
z12 b4ffbed8cf7dd94eef5c773191329c6c1f293c3635f302e335d2fabc029c1591
z14 2ae50d99f63627db0bbaa37802a7276c0d59bd02dd63f6ebf461d2deb4759277
```

Les deux rapports de validation n'ont ni erreur ni avertissement, tuile illisible, pixel impossible
ou no-data. Gradient maximal 41,7 m ; écart maximal entre pixels de bord voisins 19,5 m
(8 paires z12, 77 paires témoin) ; témoin inter-zoom : 48 paires, maximum 4,8 m.
Un écart de pixels voisins n'est pas à lui seul une fissure géométrique : leurs centres sont distincts.
Les rapports sont `pack-z12-validation.json` et `pack-z14-validation.json`.

## S23 : préparation initiale et qualification finale

Capture de production conservée dans `s23-spots-3d.png` : grandes plaques grises au milieu des
champs à La Beuchille, distinctes des ombres d'arbres/bâtiments. Le 2D/3D et le témoignage Web
du propriétaire sont conservés séparément des tests automatiques.

Un premier APK corrigé a été installé avec `adb install -r` uniquement dans
`com.suntrail.threejs.diagnostic`. La production `com.suntrail.threejs` reste 5.92.1 / 919.
Les traces ont lu des élévations natives, mais le cadrage/LOD/heure n'était pas identique à
la capture de production : **aucune conclusion de disparition des taches**.

Ce premier build isolé n'avait pas reçu les variables publiques Supabase du dépôt principal :
`supabaseUrl is required` empêchait l'hydratation des menus. Ce défaut de préparation du
diagnostic a été identifié, puis le build local a été refait avec les variables VITE existantes,
sans copier ni utiliser les secrets R2. Les menus sont vérifiés dans le test Web configuré.
Le nouvel APK configuré a ensuite été réinstallé avec succès, uniquement dans le package
diagnostic ; les menus sont attachés et les panneaux utilisés pour les contrôles. Le premier
diagnostic mal configuré n'est pas utilisé pour qualifier le rendu final.

APK prêt : `output/terrain-moire/suntrail-5.92.1-moire-diagnostic.apk`.
Application ID `com.suntrail.threejs.diagnostic`, version 5.92.1-diagnostic / 919.
Taille 37 642 555 octets ; SHA-256
`3d851a106e31474f2b355ae14413eb97fac6168075e2aa260c809e263c8d1244`.
L'ancien APK diagnostic est conservé dans `diagnostic-before.apk` pour un A/B ultérieur.

Les captures CDP WebView se sont révélées blanches malgré un rendu réel : elles sont non
concluantes. Les captures Android valides utilisent `adb screencap`, pas une extraction du canvas.
Les coordonnées du bas de la capture sont celles du point sélectionné, pas nécessairement
le centre caméra : ne pas les présenter comme un cadrage A/B exact.

### Contrôle final du 30 septembre, 21 h 34–21 h 37 (Europe/Zurich)

- Le propriétaire replace le diagnostic sur La Beuchille/La Metz. Métadonnées de la vue :
  latitude 47,348614, longitude 7,354353, source swisstopo, résolution 160, portée 2.
- Captures `s23-final-beuchille-noon-no-shadows` et `...evening-no-shadows` : LOD17 réel,
  12 h puis 18 h, ombres désactivées, relief ×2. Les grandes plaques à contours irréguliers
  de `s23-spots-3d.png` ne sont plus observées ; l'éclairage doux varie encore avec l'heure.
- `s23-final-beuchille-relief1` : contrôle à ×1, LOD17. La pente affichée diminue ; les hauteurs
  du DEM natif ne sont pas réécrites. Des bâtiments apparaissent décalés pendant ce changement
  de relief/cadrage : suivre séparément leur ancrage, non modifié par ce lot.
- `s23-final-beuchille-lod18-3d` : LOD18 confirmé. La transition 3D → 2D → 3D fonctionne,
  mais revient ici au LOD17 ; les noms `...lod18-2d`/`...return3d` décrivent le scénario,
  **pas** leur LOD effectif. Les fichiers `*-view.json` contiennent la vérité de capture.
- Les élévations du champ final viennent du cache de navigation/mémoire, pas de l'asset
  diagnostic Yverdon/Davos qui ne couvre pas cette région. C'est un test du rendu natif,
  pas une nouvelle preuve de téléchargement du pack Suisse complet.
- Yverdon et Davos : lectures LOD14 `country-pack-asset`, respectivement 36 et 37 traces
  d'élévation dans les captures de portée 2, aucune lecture d'élévation réseau. Le mode hors
  connexion interne est activé **avant** le passage 3D. La couleur a été préchargée en 2D ;
  aucun cache utilisateur n'a été effacé.
- Les bandes hors échantillon sont conservées comme couverture partielle. Le contrôle strict
  d'attente de toutes les tuiles expire sur ces bords (Davos, et Yverdon à portée 6) ; il n'est
  pas présenté comme un test de viewport intégral réussi. Les compteurs de traces incluent
  des reconstructions et ne sont pas un nombre de tuiles géographiques uniques.
- Les premiers essais nommés `native-delemont-...z17/z18` avaient parfois un LOD limité à 14
  ou étaient déplacés pendant le contrôle. Ils ne qualifient pas le LOD indiqué dans leur nom.
  Seules les captures finales du champ, avec leurs métadonnées, servent à cette conclusion.
- Le mode testeur existant permet les LOD17/18 sans achat ; le propriétaire active aussi Pro
  pour ses essais. Aucun achat, changement des droits du compte de production ou installation
  de production n'est fait.
- La production conserve 5.92.1 / 919 et sa date de mise à jour ; le diagnostic seul est mis à
  jour. Le propriétaire reprend la main, confirme « tout bien » et autorise la release.

Les anciennes et nouvelles captures ne constituent pas un A/B binaire à caméra/heure strictement
identiques (ombres actives dans l'ancienne capture). La reproduction numérique et le banc GLSL
isolent le défaut ; le contrôle S23 et le retour du propriétaire qualifient son résultat visible.

## Risques résiduels et décision

1. Le champ repositionné et les petits packs sont contrôlés, mais pas tous les DEM ou sources
   couleur possibles. Le DEM natif ne doit pas être modifié pour masquer un effet d'éclairage.
2. Le LOD13 pack et un viewport hors ligne intégral sans couleur préchargée restent hors de
   cette qualification. Le seul fait de couper le Wi-Fi est insuffisant.
3. Le v6 z12 ne retrouve pas les détails d'un DEM natif z14 : interpolation ≠ nouvelles données.
4. Aux bords externes d'un parent, l'absence des texels du parent voisin impose encore un clamp.
   Le halo corrige les frontières entre enfants du même parent, pas toutes les jonctions inter-parents.
5. Le coût CPU/mémoire additionnel du rééchantillonnage n'a pas été qualifié sur appareils modestes.
   Les durées desktop du script ne constituent pas une mesure de performances S23/A53.
6. Si des bosses physiques subsistent, contrôler le DEM source et les gradients sur la zone exacte
   avec une référence altimétrique indépendante. Le correctif des normales ne change pas ces hauteurs.

**GO pour préparer la release applicative 5.92.2**, avec les contrôles de production/CI et l'AAB
signé avant remise. Le propriétaire accepte la qualification S23 et autorise commit, push, tag
et release ; 919 est son maximum Play confirmé, donc nouveau code 920. Aucun nouveau pack Suisse
n'est requis. Reconstruction/publication de pack, déploiement Pages et upload Play restent des
actions distinctes, non effectuées pour ce lot. Aucun cache utilisateur effacé, aucune application
de production remplacée et aucun test Android instrumenté lancé.

## Reproduire les contrôles locaux (PowerShell)

Depuis ce worktree, avec les dépendances déjà présentes :

```powershell
npm exec --offline -- tsx scripts/check-terrain-normal-webgl.ts
npm exec --offline -- tsx scripts/diagnose-parent-elevation.ts --cache-dir 'D:\Python\suntrail_pack_artifacts\switzerland-v5-cache'
# Dans un terminal, servir le build diagnostic configuré ; aucun déploiement :
node node_modules/vite/bin/vite.js preview --base / --host 127.0.0.1 --port 4187 --strictPort
# Dans un second terminal :
node scripts/check-terrain-app.mjs 'D:\Python\suntrail_pack_artifacts\switzerland-v5-cache'
```

Le build du worktree doit recevoir les mêmes paramètres publics VITE que le dépôt principal,
notamment Supabase, et pointer `VITE_DIAGNOSTIC_PACK_URL` sur le petit z12. Le script ne fait
pas de test sur le site public et bloque les services externes dans ses propres contextes.
`check-s23-terrain.mjs` refuse une WebView qui n'est pas celle du package diagnostic et exige
le téléphone diagnostic au premier plan. Il ne désinstalle rien et ne vide aucun cache.
