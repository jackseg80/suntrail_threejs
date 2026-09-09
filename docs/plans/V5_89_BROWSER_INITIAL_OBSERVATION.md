# v5.89 — Observation initiale dans le navigateur

Date : 2026-09-08. Résultat : apparition par blocs reproduite visuellement au LOD 14,
après exclusion d'un premier essai dans un état réseau incohérent. Une seconde session locale
a ensuite fourni un premier relevé instrumenté ; voir le
[relais du 8 septembre](V5_89_SESSION_HANDOFF_2026-09-08.md).

## Environnement et limites

- URL fournie : https://jackseg80.github.io/suntrail_threejs/app.html.
- Version visible : 5.88.0. Navigateur intégré Codex, distinct de Brave.
- Diagnostic matériel affiché : NVIDIA GeForce RTX 4080 Laptop GPU, Direct3D11,
  32 processeurs logiques affichés. Ce relevé ne représente pas Brave/Intel HD.
- Preset initial Maximum : résolution nominale 256, rayon 12. Contrôle en Équilibré :
  résolution nominale 64, rayon 5, vérifiés dans les réglages et par le toast.
- Pro activé par le propriétaire pour le premier essai ; après rechargement, retour à Free
  (activation test non persistante). Le LOD 14 reste disponible. Les essais avant/après
  rechargement ne constituent donc pas une comparaison à droits identiques.
- Aucun pack installé dans ce profil selon la liste des packs. Le libellé « Suisse HD · Pack
  disponible » ne prouve pas une lecture locale. Aucun achat ou téléchargement de pack lancé.
- Cache non effacé, pas de trace réseau : « ressources nouvelles pour le viewport » est établi
  visuellement, mais ni cache intégralement froid ni provenance réseau de chaque tuile ne sont prouvés.
- Le propriétaire a vu les déplacements en direct et confirme la zone blanche puis les tuiles
  successives. Il précise qu'aucun pack Suisse n'est installé ici et que l'application télécharge.
  Cette confirmation renforce la reproduction du cas réseau ; elle ne valide pas le cas pack local.

## Première tentative exclue

Recherche Grindelwald, résultat dans le canton de Berne, arrivée au LOD 12 puis ajustement au
LOD 14 après passage transitoire par 17/15. L'application a indiqué OFFLINE et une couverture
quasi absente. Le switch hors ligne a été remis à zéro, mais le statut réseau est resté OFFLINE.
Le viewport a aussi changé et des gestes ultérieurs n'ont pas conservé le LOD.

Ce passage est invalide pour mesurer la vitesse des tuiles ou comparer presets/2D/3D. Les
compteurs instantanés de textures/FPS observés ne permettent aucune conclusion mémoire ou GPU.
Le propriétaire confirme que Grindelwald fonctionne sur son mobile et dans Brave : l'incident
de cette tentative ne démontre pas un défaut général de recherche ou de disponibilité du lieu.
Sa cause n'est pas établie. Ne pas en faire le diagnostic du signalement initial.

## Deuxième tentative : reproduction visuelle

1. Rechargement sans effacement de données. Retour à ONLINE, hors ligne forcé désactivé,
   carte générale affichée et preset Équilibré conservé.
2. Recherche Grindelwald, sélection du résultat bernois. À l'arrivée au LOD 12, capture d'une
   mosaïque partiellement remplie sur fond blanc ; le chargement reprend bien.
3. Zoom au LOD 14 puis viewport fixé à 1200 × 800 pour les gestes comparés. Avant déplacement,
   carte détaillée couvrant l'écran. Le DOM `body.mode-2d` confirme le mode 2D ; ne pas déduire
   le mode actif du seul texte « 3D » du bouton, qui propose la bascule.
4. Déplacement horizontal de (900,350) vers (300,350) : grande bande blanche à droite dans la
   première capture. Capture suivante : tuiles supplémentaires apparues, trous rectangulaires
   encore présents à droite. LOD 14 conservé et icône réseau verte.
5. Déplacement vertical de (580,600) vers (580,200) : partie basse non couverte avec une tuile
   centrale déjà apparue. Capture suivante, sans nouveau geste : couverture remplie.
6. Geste vertical inverse : la capture suivante montre une carte couverte sur la zone déjà
   consultée. C'est un indice d'amélioration lors du retour, pas la preuve instrumentée d'un
   hit texture ni une mesure d'affichage instantané.

Captures locales, conservées hors Git dans `outputs/` :

- [Après le déplacement vertical](../../outputs/v5.89-browser-20260908/01-pan-vertical.png).
- [Même vue ensuite remplie](../../outputs/v5.89-browser-20260908/02-pan-vertical-apres.png).
- [Retour vers la zone déjà vue](../../outputs/v5.89-browser-20260908/03-retour-vertical.png).

Ces captures sont séparées par le contrôle de l'outil : elles établissent une succession
d'états, pas une durée de chargement. Le temps d'exécution d'un appel outil n'est pas une mesure
de SunTrail. Un seul parcours exploratoire ne remplace pas trois répétitions instrumentées.

## Conclusion utile au plan

L'effet de couverture progressive décrit par le propriétaire est visible aussi dans ce contexte
RTX, en 2D Équilibré au LOD 14. Il n'est donc pas nécessaire de commencer par une installation A53
pour le reproduire. Cela ne démontre pas quelle étape est lente ni que WebGL est responsable.
La durée propre au téléchargement n'a pas été isolée : aucune lenteur de lecture de pack local
ne peut être déduite de ce passage, et aucun temps fournisseur n'est attribué au moteur.

La comparaison prioritaire porte sur première visite, pack réellement local, cache persistant
et retour à textures chaudes, avec temps jusqu'à couverture utile et budgets mémoire/presets.
Après observation, le propriétaire précise que cache et pack local sont les tests décisifs :
le cas réseau reproduit ici devient un contrôle secondaire. Le retour visuellement complet
constitue seulement une première observation ; les hits cache n'ont pas été instrumentés.
L'absence de fond de remplacement dans la zone nouvellement découverte doit être mesurée
séparément du temps nécessaire à afficher le détail cible.

Restent non mesurés : timings par ressource, débit, coût du décodage et de construction, temps
GPU, pic mémoire total, performances Brave/Intel HD, pack Suisse OPFS, 3D et WebView Android.
Les instruments du navigateur accessibles pendant cet essai ne fournissaient pas de trace
réseau/performance exploitable. Une instrumentation applicative désactivable a été ajoutée ensuite ;
ses premiers résultats sont consignés dans le relais, sans acquitter le test pack OPFS.

En fin d'essai : preset Maximum restauré, override de viewport retiré, Stats revenues désactivées
après rechargement, onglet conservé ouvert. Aucun changement de code produit, GPU système,
cache utilisateur, archive, REC ou Guidance. Le mode Pro test du premier essai n'a pas été réactivé.

Suite : [plan v5.89](V5_89_MAP_ARCHITECTURE_EVALUATION.md), phases A/B pour attribution avant
au plus deux expériences ciblées puis décision d'architecture.
