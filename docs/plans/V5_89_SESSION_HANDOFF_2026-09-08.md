# v5.89 — Relais du diagnostic des tuiles, 8 septembre 2026

Statut : travail local non commité. Les serveurs de prévisualisation ont été arrêtés avant
la fin de session. Aucun déploiement, installation Android, achat ou téléchargement de pack.

## Ce qui est établi

- Le défaut est reproduit à Grindelwald, LOD 14, mode 2D, preset Équilibré : après un
  panoramique horizontal de 440 px, une bande blanche d'environ 110 px est visible à droite,
  puis la carte la remplit au relevé suivant.
- Le profil du navigateur interne ne contient aucun pack installé. Le test ci-dessous mesure
  donc un mélange de cache de navigation, archive distante et réseau. Il ne mesure pas OPFS.
- Le libellé « Pack disponible » ne prouve pas une lecture locale. L'instrumentation distingue
  désormais `country-pack-opfs` de `country-pack-cdn`.
- Un état déclaré installé dont le fichier OPFS manque ne peut plus être présenté comme une
  lecture offline : le repli CDN reste utilisable en ligne, mais `getOfflineTileFromPacks()`
  le refuse.

## Mesure instrumentée avant l'expérience 2D

Environnement : build de production local 5.88.0, navigateur intégré Codex, viewport
791 x 1274, DPR et GPU propres à ce navigateur, mode 2D, LOD 14, preset `balanced`, droits
Pro actifs dans le laboratoire local. Une seule répétition exploratoire, donc pas de verdict
de performance définitif.

Panoramique vers une zone voisine :

- 1 147 traces de création de tuiles retenues ; 38 chargements réellement commencés ;
  18 constructions de mesh ; 17 premières soumissions au rendu.
- Première soumission au rendu : minimum 719 ms, médiane 1 198 ms, p90 exploratoire
  2 124,7 ms, maximum 2 514,3 ms.
- Attente `queued` → `load-started` sur les 38 chargements : médiane 220,7 ms,
  p90 1 356,3 ms, maximum 1 665,2 ms.
- `load-started` → envoi au worker : médiane 152 ms, maximum 800,6 ms.
- Aller-retour worker : médiane 61,8 ms, maximum 844,3 ms.
- Attente de construction : médiane 4,2 ms. Construction mesurée : médiane 0 ms.
  Mesh → première soumission : médiane 7 ms.
- Couleur issue du cache de navigation : 17 lectures, médiane 3,1 ms.
- Relief issu du cache de navigation : 17 lectures, médiane 5,1 ms.
- Couleur issue de l'archive distante : 21 lectures, médiane 2,2 ms.
- Relief issu du réseau : 21 lectures, médiane 158,4 ms, maximum 836,9 ms.

Le résultat attribue le délai observé surtout à l'attente de la file et au relief réseau.
Le build du mesh et la soumission immédiate ne dominent pas ce run. Il confirme aussi qu'en
mode 2D au LOD 14, le chemin 5.88 demande encore le relief.

Retour vers la zone déjà vue, sans recharger la page :

- 9 tuiles rendues par le chemin mémoire, avec 18 ressources `memory-texture` ;
- première soumission : 201,3 à 298,7 ms, médiane 201,5 ms ;
- 17 chargements ont néanmoins commencé pour compléter la vue.

Cette répétition atteint approximativement la cible proposée de 250 ms à la médiane, mais pas
pour toutes les tuiles. Elle prouve des hits mémoire ; elle ne prouve pas encore une couverture
utile à 95 % ni l'absence d'évictions.

## Instrumentation ajoutée

`src/modules/tileDiagnostics.ts` fournit une instrumentation désactivée par défaut, activée
avec `?tileDiagnostics=1`. Elle suit la file, la lecture par ressource et sa provenance, le
worker, la construction, l'ajout du mesh et la première soumission. L'API de page est
`window.suntrailTileDiagnostics` avec `enable`, `disable`, `clear`, `snapshot` et `download`.

Le worker renvoie les durées de lookup cache, lecture, réseau et décodage. Le gestionnaire de
packs renvoie la provenance réelle OPFS/CDN. Un petit bouton technique, uniquement présent en
mode diagnostic, permet aux outils de test isolés de publier le JSON dans
`#suntrail-tile-diagnostics-data`.

Limites : `first-render-submitted` signifie que la frame Three.js a été soumise après l'ajout
du mesh. Ce n'est pas une mesure directe de présentation GPU. Les 1 147 demandes mises en file
pour un seul geste sont un signal à examiner : il faut vérifier si elles correspondent à des
objets rapidement remplacés ou à des créations redondantes avant de corriger la file.

## Expérience locale non encore comparée

`Tile.load()` utilise maintenant provisoirement `zoom <= 10 || state.IS_2D_MODE` pour
`fetchAs2D`. L'objectif est de supprimer la lecture et le décodage du relief quand le rendu est
réellement plat. Deux tests unitaires vérifient le booléen transmis en 2D et en 3D.

Cette modification n'a pas encore reçu son run navigateur après comparaison. Elle doit rester
une expérience jusqu'aux contrôles suivants : retour 2D → 3D au LOD 14, reconstruction réelle
du relief, solaire, pentes, inclinomètre, cache et absence de damier plat. Un incident historique
avait précisément conduit à conserver le relief au LOD élevé ; ne pas valider cette expérience
sur le seul gain de chargement 2D.

## Validation effectuée

- Après l'expérience 2D : `npm run check` passé ; 40 tests ciblés passés ; build de production
  passé ; suite complète passée avec 157 fichiers et 1 758 tests ; budget PWA passé à 2,36 MiB.
- La suite complète affiche deux avertissements Happy DOM connus sur le chargement désactivé de
  `/src/main.ts` dans `init_integrity.test.ts`, puis se termine avec le code 0.

## Reprise recommandée

1. Relancer `npm run preview -- --host 127.0.0.1`, ouvrir
   `app.html?tileDiagnostics=1`, vérifier `balanced`, 2D, LOD 14 et Grindelwald.
2. Refaire trois panoramiques comparables avec l'expérience 2D. Vérifier que la ressource
   `elevation` disparaît du chemin froid et comparer file, couverture et première soumission.
3. Tester immédiatement la bascule 2D → 3D au même LOD et les fonctions dépendantes du relief.
   Revenir à l'ancien comportement si une tuile plate ou un cache incomplet apparaît.
4. Examiner les créations en file très nombreuses et la déduplication avant d'augmenter toute
   concurrence ou taille de cache.
5. Faire ensuite le test prioritaire sur un appareil possédant réellement le pack Suisse :
   provenance `country-pack-opfs`, réseau absent pour les couches du pack, première visite puis
   retour mémoire. L'A53 n'était pas connecté ; seul le S23 `SM_S911B` était visible par ADB.
6. Refaire Équilibré sur A53, puis même protocole sur S23 et Brave/Intel HD. Ne conclure sur
   Three.js, WebGL ou WebGPU qu'après ces contrôles locaux.
