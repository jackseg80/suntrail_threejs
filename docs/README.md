# Documentation SunTrail

Cet index sépare les références qui décrivent la version actuelle, les spécifications techniques
encore applicables, les plans futurs et les archives historiques.

## Commencer ici

1. [README du projet](../README.md) : présentation, plateformes, installation et limites.
2. [Fonctionnalités actuelles](FEATURES.md) : inventaire canonique de la version 5.90.1.
3. [Guide IA et état de release](../CLAUDE.md) : règles de travail, version et garde-fous.
4. [Architecture](AI_ARCHITECTURE.md) : services, événements, état et stockages.
5. [Navigation et UX](AI_NAVIGATION_UX.md) : Explorer, Préparer, Sortie, Bibliothèque et Plus.

## Références actives

| Domaine                | Document                                                                 | Rôle                                                             |
| :--------------------- | :----------------------------------------------------------------------- | :--------------------------------------------------------------- |
| Fonctionnalités        | [FEATURES.md](FEATURES.md)                                               | Ce qui existe, où, pour qui et avec quelles limites.             |
| Architecture           | [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md)                                 | Modules, flux, événements et persistance.                        |
| Rendu/performance      | [AI_PERFORMANCE.md](AI_PERFORMANCE.md)                                   | Constantes, budgets, cache, rendu et mesures 5.88–5.89.          |
| Navigation/UX          | [AI_NAVIGATION_UX.md](AI_NAVIGATION_UX.md)                               | Contrats d'interaction et responsabilités des écrans.            |
| UI                     | [AI_UI_STYLE_GUIDE.md](AI_UI_STYLE_GUIDE.md)                             | Composants, accessibilité et responsive.                         |
| Débogage               | [AI_DEBUGGING.md](AI_DEBUGGING.md)                                       | Diagnostic des symptômes et outils de développement.             |
| Monétisation           | [MONETIZATION.md](MONETIZATION.md)                                       | Matrice Free/Pro et décisions commerciales.                      |
| Traces                 | [TRACK_STORAGE.md](TRACK_STORAGE.md)                                     | Archives REC/import pleine fidélité et migration legacy.         |
| Guidage Android        | [GUIDANCE_ANDROID.md](GUIDANCE_ANDROID.md)                               | Service natif, Room, notification et reprise.                    |
| Fallback Web           | [GUIDANCE_FOREGROUND.md](GUIDANCE_FOREGROUND.md)                         | Moteur TypeScript utilisé hors Android ou si le natif est coupé. |
| Préparation hors ligne | [READINESS_OFFLINE.md](READINESS_OFFLINE.md)                             | Rapport avant départ, corridor et responsabilités de cache.      |
| Android                | [ANDROID_LINT.md](ANDROID_LINT.md)                                       | Edge-to-edge, R8 et avertissements connus.                       |
| Publication            | [RELEASE.md](RELEASE.md)                                                 | Préflight, versions, AAB et actions externes.                    |
| Fiche Store            | [STORE_LISTING.md](STORE_LISTING.md)                                     | Texte marketing multilingue aligné sur les capacités actuelles.  |
| Protocoles             | [protocols/PROTOCOL_TEST_RAPIDE.md](protocols/PROTOCOL_TEST_RAPIDE.md)   | Contrôle fonctionnel court.                                      |
| Protocoles             | [protocols/PROTOCOL_TEST_COMPLET.md](protocols/PROTOCOL_TEST_COMPLET.md) | Contrôle fonctionnel/terrain étendu.                             |
| Performance mobile     | [PROTOCOL_TEST_PERF_MOBILE.md](PROTOCOL_TEST_PERF_MOBILE.md)             | Mesures A53/S23 reproductibles.                                  |

Les priorités se trouvent dans [TODO.md](../TODO.md) et la séquence produit dans
[ROADMAP.md](../ROADMAP.md). Le [CHANGELOG](../CHANGELOG.md) reste la chronologie des versions.

## Statut des autres dossiers

Plan actif : [SunTrail 5.90 — refonte UI](plans/V5_90_UI_REDESIGN.md), révisé après l'audit S23
du 2026-09-10. La direction est validée et le pilote Préparer est validé sur le paquet diagnostic
S23 en Free/Fluide. Le retour propriétaire sur le profil, le clavier de Configuration et les boutons
Annuler/Rétablir a été intégré puis rejoué sur cet appareil. Le lot commun a ensuite commencé avec
Recherche et la navigation Connectivité → Packs : flèche, Retour Android et Escape rendent le
parent avant de fermer la feuille. Plus/Réglages propose désormais trois catégories compactes et
conserve son défilement lors d'un aller-retour vers l'offre Pro. Couches, Météo et SOS partagent
ensuite la même fermeture ; Couches retrouve son état après Pro et SOS utilise l'en-tête commun.
Bibliothèque a aussi été simplifiée puis contrôlée avec un GPX réel : une seule carte visible par
parcours, bilan et options repliés, fichier source complet conservé. Sortie reprend désormais son
nom lisible avec Suivre comme seule action du parcours et REC séparé ; l'onglet Bibliothèque change
de parcours et Profil reste disponible pendant le guidage. Quitter Préparer ferme son profil pour
éviter de le laisser derrière une autre feuille. Le guidage actif a aussi été rejoué sur le S23 :
nom lisible, trois hauteurs accessibles sans geste vertical par Bandeau, Détails/Réduire et Agrandir,
arrêt non dupliqué et retour depuis le profil. Pause a ensuite été retiré du panneau et de la
notification de guidage, car il suspendait uniquement le guidage sans suspendre REC. Sortie possède
maintenant une vraie Pause/Reprendre REC : les points et la durée active se figent, y compris après
reprise du processus. Le panneau de guidage expose la même commande uniquement lorsqu'un REC est
actif ; le guidage continue pendant la pause. La validation physique S23 Free/Fluide du 2026-09-11 couvre plusieurs
pauses/reprises, un passage en arrière-plan, le chronomètre figé, la reprise sans saut signalé et le
récapitulatif STOP ; la trace de diagnostic a ensuite été supprimée. Le nouveau bouton a aussi été
confirmé sur le S23 dans une session combinant guidage et REC. Cette validation ne couvre pas
l'A53. Le cœur Pro a ensuite été contrôlé sur le même S23 en
Fluide : statut Pro Actif, options avancées, fond Satellite et prévisions météo sur trois jours. Le
libellé météo anglais « Sunset » découvert pendant ce rejeu est maintenant traduit en « Coucher ».
Les transitions Maximum → Fluide et Clair → Auto rendent le bon état immédiatement, sans classe
visuelle résiduelle ; les panneaux restent lisibles avec la transparence propre au matériel puissant.
Le premier nettoyage structurel 5.90 centralise aussi Pause/Reprendre REC entre Sortie et Guidance
et retire 25 noms de sélecteurs CSS absents des composants actifs. Le CSS produit diminue de
107,42 à 104,61 Ko ; les contrats Android de reprise historique restent conservés.
Une relecture du plan a ensuite corrigé le suivi : les parcours validés ne signifient pas que le
langage visuel est terminé. La reprise locale du lot 1 unifie la barre supérieure, les commandes
carte, les en-têtes, les fermetures et les dialogues ; elle ancre aussi la timeline et les coordonnées
en supprimant leurs gestes cachés. Les tests, contrôles statiques, build Web, synchronisation
Capacitor et construction Android passent. Une première inspection S23 confirme les principales
commandes et révèle puis fait corriger le chevauchement de Bibliothèque, les éléments hérités de
SOS/Profil et la conservation indue d'un ancien bundle PWA dans l'application native. Les presets
automatiques deviennent silencieux et les choix manuels utilisent leur nom traduit. La dernière APK
valide ensuite Bibliothèque, SOS et Profil sur le S23. Le bandeau supérieur replié est également
corrigé et rejoué : ses boutons invisibles ne capturent plus la pression sur la flèche et Météo ne
s'ouvre plus au dépliage. Le premier bloc Réglages/Compte accepte maintenant les grandes polices
sans troncature. La passe locale suivante masque ce bloc lorsqu'il ne contient aucune action,
commence Réglages par le profil de performance et retire la répétition du catalogue Pro. L'offre
présente d'abord ses formules et la restauration. Connexion, Packs et Couches partagent maintenant
la même hiérarchie, les mêmes cartes, actions, états et focus clavier ; l'import PMTiles reste dans
un détail technique replié. Les contrôles statiques, 1 808 tests, le build Web, le budget bundle, la
synchronisation Capacitor et l'APK diagnostic passent. L'inclinomètre est ensuite simplifié : résumé
ancré et ouvrable au clavier, viseur déplaçable conservé et accessible aux flèches, styles adaptés au
preset. Météo garde ses icônes de conditions, mais utilise des boutons réels pour les aides et jours
Pro, traduit tous ses états et reprend les alertes/espacements communs. Les 1 810 tests, contrôles
statiques, quatre catalogues alignés sur 961 clés, build Web, budget de 2,40 Mio, synchronisation
Capacitor et nouvelle APK diagnostic passent. Ces dernières passes attendent leur rejeu groupé sur
S23. La Timeline est ensuite réorganisée en deux niveaux et l'heure conserve un repère coloré lisible
selon la phase solaire. La sélection cartographique abandonne sa carte verticale historique pour un
bandeau compact avec coordonnées entières, Soleil et fermeture explicites ; l'inclinomètre remonte
automatiquement au-dessus. Ces deux surfaces sont contrôlées sur S23 Pro à 420 dpi et police 115 %.
Les 157 fichiers/1 816 tests, les contrôles statiques, le build Capacitor et l'APK diagnostic passent.
L'analyse solaire d'un point est ensuite rendue accessible en 2D : les données astronomiques restent
affichées et seules les mesures dépendantes du relief sont retirées lorsque les altitudes manquent.
Le parcours est rejoué par un vrai toucher sur le même S23 Pro ; 531 suites/1 819 tests, quatre
langues, build Capacitor et nouvelle APK diagnostic passent.
Les dernières commandes cartographiques ponctuelles rejoignent ensuite l'iconographie et les états
communs ; la nouvelle APK installée passe 531 suites/1 820 tests.
La passe principale S23 se ferme avec l'harmonisation des derniers états actifs et du sélecteur de
zone hors ligne. Celui-ci masque les commandes concurrentes et conserve ses actions visibles, y
compris sous le message Free. Le rendu est contrôlé en portrait/paysage, à 115 %, ainsi qu'en thèmes
clair et sombre avant retour à Auto. Le sélecteur n'affiche plus deux cadres concurrents : une seule
emprise géographique passe de l'orange au vert puis au bleu et reste figée dès le lancement du
téléchargement. L'APK diagnostic finale est installée et 158 fichiers/1 830
tests passent. Le tutoriel et la qualification A53/Web ont ensuite été clôturés. La révision source
5.90.1 relève ensuite la luminosité 3D en heure dorée et clarifie l'analyse solaire d'un point :
frise sous le graphique, légende, couleur d'ombre bleu-gris, curseur glissant et phases solaires
unifiées dans `solarPhases.ts`. La pente GPS reste un lot séparé, sans numéro engagé.

- `plans/` contient des décisions, protocoles de version et travaux futurs. Une version dans le
  titre décrit le périmètre du plan, pas nécessairement l'état courant du produit.
- `plans/prompts/` contient des prompts d'implémentation ou des relais. Les prompts 5.x terminés
  sont des preuves historiques, pas des instructions actives.
- `archives/` contient des documents volontairement figés. Leurs chiffres, flags, limites et
  checklists ne doivent jamais être utilisés pour décrire la version actuelle.
- `outputs/` à la racine contient des preuves locales d'appareils ou de performance et n'est pas
  une documentation produit stable.

## Règle de mise à jour

Lorsqu'une fonction change, mettre à jour au minimum `FEATURES.md`, le document technique du
domaine, les quatre traductions si le texte est visible dans l'application, puis `README.md` si la
promesse utilisateur change. Une release modifie aussi `CHANGELOG.md`, `TODO.md`, `CLAUDE.md`,
`GEMINI.md` et les versions Android/npm conformément à `RELEASE.md`.
