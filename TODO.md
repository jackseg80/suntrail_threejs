# SunTrail — TODO (v5.90.1 ; publication Play séparée)

> Dernière mise à jour : 2026-09-15

## ✅ v5.90.1 — luminosité 3D en heure dorée

Correctif de sensibilité : la scène reste proche du plein jour quand le soleil est bas mais encore
levé, sans surbrillance au zénith, et le réglage est identique au lever et au coucher. APK
diagnostic `5.90.1` (code 912) installé sur S23. Aucune release GitHub ni upload Play revendiqué.

## ✅ v5.90 — refonte UI fonctionnellement clôturée

Plan de référence : [audit, concepts et migration révisés](docs/plans/V5_90_UI_REDESIGN.md).

- [x] Auditer les systèmes UI actifs et comparer trois concepts de refonte.
- [x] Compléter l'audit sur S23 en Free, avec captures des barres actives et comparaison
      Fluide/Équilibré ; consigner les limites de cette observation.
- [x] Réviser le plan : auto-hide contextuel, effets selon preset, profil agrandi,
      superpositions, retours et lisibilité ; définir les lots et la matrice de validation.
- [x] Valider la direction UX recommandée avant de commencer les changements de code.
- [x] Implémenter la première tranche du pilote Préparer : Configuration structurée, surfaces
      lisibles selon preset, auto-hide contextuel, retour Android/Escape, profil ancré et
      redimensionné, Analyse solaire en sous-vue.
- [x] Installer le paquet séparé `5.89.1-diagnostic` / 910 sur Galaxy S23 et valider le pilote en
      Free, Fluide, thème Auto, police 115 % : panneaux et barres après 10 s, Retour Android,
      profil agrandi et navigation Profil → Analyse → Profil sur un parcours temporaire de 0,24 km.
- [x] Intégrer le retour propriétaire du pilote S23 : supprimer tout déplacement du profil et
      récupérer les anciennes positions hors écran, protéger le titre et la croix de Configuration
      lorsque le clavier est ouvert, puis harmoniser Annuler/Rétablir. Rebuild, réinstallation et
      rejeu sur le paquet diagnostic effectués sur le même S23 en Free/Fluide.
- [x] Commencer le lot 2 commun : unifier les titres et sélections de Recherche, remplacer la
      rupture Connectivité → Packs par un retour parent explicite, restaurer défilement/focus et
      aligner flèche, Retour Android et Escape. Les 1 807 tests, le build Android et le rejeu S23
      Free/Fluide passent sans téléchargement de pack.
- [x] Simplifier Plus/Réglages à grande police : catégories Essentiels/Carte/Avancé compactes et
      synchronisées au défilement ; offre Pro ouverte en sous-vue avec Plus actif et restauration
      exacte de Réglages par flèche, Retour Android ou Escape. APK diagnostic rejoué sans achat.
- [x] Sortir les paramètres avancés de la page principale : Avancé ouvre une page dédiée avec
      titre et flèche, tandis que Retour Android/Escape restaurent le défilement et le focus de
      Réglages. Le parcours est rejoué sur S23 à 115 %.
- [x] Harmoniser Couches, Météo et SOS : fermeture commune, retour Couches → Pro → Couches,
      en-tête SOS standard, états traduits et SMS désactivé pendant la localisation. Rebuild et
      rejeu S23 Free/Fluide effectués sans SMS ni achat ; aucun pack ne reste installé.
- [x] Simplifier Bibliothèque vide et remplie : actions côte à côte, un GPX préparé affiché comme
      un seul parcours, bilan/options repliés et source complète conservée. Les imports sans parcours
      restent visibles « À préparer ». Les 1 810 tests, le build et le rejeu S23 Free/Fluide passent.
- [x] Clarifier Sortie avec une route consultée : nom de GPX lisible dans le bandeau et la carte,
      Suivre comme seule action du parcours, REC indépendant, Profil réservé au guidage et changement
      de parcours par l'onglet Bibliothèque. Le profil de Préparer se ferme en quittant cette
      destination. Les 1 811 tests, le build Android et le contrôle S23 Free/Fluide passent sans
      lancer Guidage ni REC.
- [x] Simplifier le guidage actif : nom de trace lisible, trois hauteurs accessibles par Bandeau,
      Détails/Réduire et Agrandir sans geste vertical, actions Enregistrer et Arrêter le guidage
      explicites, arrêt secondaire limité aux sessions combinées, profil et retour harmonisés. Les
      1 812 tests, le build Android et le rejeu S23 Free/Fluide passent sur une session statique ;
      REC n'a pas été lancé.
- [x] Retirer Pause du guidage affiché et de sa notification Android : il suspendait seulement le
      guidage pendant que REC continuait. Réorganiser Profil sur toute la largeur et réserver une
      éventuelle vraie pause REC au lot d'enregistrement. Rebuild et rejeu S23 effectués.
- [x] Remplacer la languette et le glissement vertical du guidage par des commandes explicites :
      Bandeau depuis les panneaux normal et détaillé, Agrandir depuis le bandeau minimal, et
      Détails/Réduire entre les deux autres hauteurs. Rebuild et rejeu des trois états sur S23.
- [x] Raccourcir le bouton du profil à Retour tout en conservant « Retour au guidage » pour les
      lecteurs d'écran, et renommer Ouvrir en Agrandir dans le bandeau minimal.
- [x] Valider sur S23 la vraie Pause/Reprendre du REC : durée figée, alternances pause/reprise,
      maintien en arrière-plan, reprise sans saut signalé et STOP avec récapitulatif. Le test terrain
      Free/Fluide du 2026-09-11 a produit 12 points sur 0,07 km et la trace diagnostic a été supprimée.
- [x] Afficher cette même Pause/Reprendre dans le panneau Guidance uniquement lorsqu'un REC est
      actif. Elle suspend l'enregistrement et sa durée sans suspendre le guidage ; en guidage seul,
      aucune commande Pause n'est affichée. Les anciens libellés UI de pause du guidage sont retirés.
      L'APK diagnostic a été installée et le fonctionnement Guidance + REC confirmé sur le S23.
- [x] Contrôler le cœur Pro sur S23/Fluide : statut Pro Actif, options avancées, fond Satellite sans
      paywall et météo complète sur trois jours. Corriger au passage Sunrise/Sunset avec les libellés
      traduits ; les passages Maximum → Fluide et Clair → Auto restent lisibles et sans état résiduel.
      Les 1 817 tests, le build Android et le rejeu diagnostic passent le 2026-09-11.
- [x] Compléter la baseline du lot 0 : la matrice A53 Free est contrôlée en portrait, paysage,
      polices 100/110/130 % et sur Endurance/Équilibré/Fluide/Maximum/personnalisé. Le libellé
      « Personnalisé » apparaît désormais dès qu'un réglage piloté par le profil est modifié. La
      couverture cartographique blanche après rotation est corrigée et validée sans geste sur l'APK
      diagnostic. Le contrôle A53 Pro n'est pas répété : le cœur Pro est déjà qualifié sur S23 et le
      correctif de rotation est indépendant des droits.
- [x] Réaliser la première passe fonctionnelle des parcours couverts par les lots 2 à 5, sans
      réécriture des moteurs. Cette validation fonctionnelle ne clôt pas leur migration visuelle.
- [x] Terminer le lot 1, langage visuel, sur toutes les surfaces actives. Une première tranche
      locale unifie la barre supérieure, les commandes carte, les en-têtes et fermetures de feuilles,
      Points, Configuration et Profil. Elle retire aussi les gestes cachés de déplacement de la
      timeline et des coordonnées, ainsi que le doublon Fermer de SOS. Les dialogues partagent le
      même style ; Entrée suit le bouton focalisé et le focus est restauré. TypeScript, lint,
      formatage, 157 fichiers/1 805 tests, build Web, budget bundle, synchronisation Capacitor et
      APK Android passent. Une première inspection S23 à 420 dpi et police 115 % confirme la barre
      supérieure, Plus et Configuration, puis révèle une collision dans Bibliothèque, des éléments
      décoratifs hérités dans SOS/Profil et une ancienne ressource Web servie par le Service Worker.
      La collision est corrigée, les libellés/toasts/SOS sont harmonisés et le Service Worker est
      désormais réservé au Web/PWA. Les profils automatiques n'affichent plus de message au
      démarrage ; un choix manuel utilise son nom traduit. L'APK corrigée est construite ; le rejeu
      final Bibliothèque/SOS sur le S23 passe. Le défaut signalé ensuite sur le bandeau supérieur
      replié est corrigé : les boutons invisibles deviennent inertes et la flèche reste seule
      cliquable ; le rejeu replier/déplier n'ouvre plus Météo. Le premier bloc Réglages/Compte ne
      tronque plus son texte et les choix Profil/Thème utilisent une casse normale. Le lot reste
      ouvert pour les surfaces héritées suivantes. Une passe groupée supplémentaire masque le bloc
      Compte lorsqu'il ne contient aucune action, place le profil de performance en premier et
      réduit la promotion Pro de Réglages aux trois options réellement réglables. L'offre Pro place
      les formules et la restauration avant le catalogue. Connexion, Packs et Couches reprennent les
      mêmes titres, cartes, boutons, états et focus ; l'import PMTiles reste disponible dans un détail
      technique replié et les doublons d'icônes sont retirés. Le sous-lot suivant ancre le
      résumé de l'inclinomètre tout en conservant le déplacement utile de son viseur, désormais
      accessible au clavier, et retire ses styles/pictogrammes hérités. Météo conserve les icônes de
      conditions utiles, mais traduit ses états, remplace les jours Pro et aides cliquables par de
      vrais boutons et centralise ses alertes et espacements. Le rejeu groupé S23 Free puis Pro,
      Fluide, 115 % et 420 dpi valide Réglages, offre Pro, Connexion, Packs, Couches, inclinomètre et
      Météo. Les feuilles deviennent presque opaques, MapTiler est masqué, l'état tactile résiduel de
      l'inclinomètre est corrigé, le confort météo est espacé et Copier le rapport reprend le bouton
      secondaire commun. La carte Réglages décrit désormais correctement l'état Pro actif. Le dernier
      APK est installé ; TypeScript, lint, formatage, build Web/Capacitor, assemblage Android,
      1 813 tests et quatre catalogues alignés sur 964 clés passent. Réglages avancés devient une
      page interne et le tutoriel rejoint les styles et icônes communs ; ses trois écrans sont
      contrôlés sur S23 à 115 %. Le choix de langue quitte ensuite le sélecteur natif au rendu
      variable pour une grille 2 × 2 cohérente avec les autres réglages. Analyse solaire retire
      ses capitales, émojis système et styles injectés, agrandit les aides et choix de mode, puis
      aligne cartes, alertes, verrouillages, promotion Pro et copie du rapport sur les composants
      communs. Le rendu Pro complet est contrôlé sur S23 à 115 % ; 531 suites/1 814 tests, le
      typage, le lint, les 968 clés de chaque langue, le build, le budget bundle, Capacitor et
      l'APK diagnostic passent.
- [x] Reconcevoir le tutoriel dans une passe UX dédiée : la carte réelle reste visible et active,
      la prise en main tient en deux étapes adaptatives et la sécurité redondante ainsi que le menu
      final abstrait disparaissent. La version 3 est proposée une fois à tous les utilisateurs ;
      Préparer, REC et le premier accès Pro disposent d'aides attachées à leurs vraies commandes.
      L'interstitiel Pro chronométré au démarrage n'est plus déclenché. Contrôles statiques, quatre
      langues, 100 tests ciblés, build Web et deux scénarios E2E Chromium passent. Le rejeu S23
      Free à 420 dpi et police 115 % a déplacé l'étape 2 vers le haut pour dégager les commandes
      latérales, puis rendu toute aide contextuelle implicitement terminée quand l'utilisateur
      poursuit ailleurs. Après correction et réinstallation, le parcours carte → 3D, la transition
      Préparer → aide REC et Satellite Pro → Plus tard passent sans REC, achat ni changement de
      droit. `npm run check`, 14 tests ciblés, 158 fichiers/1 826 tests, Capacitor, Android et les
      deux scénarios E2E repassent.
- [x] Commencer le lot 6 : centraliser Pause/Reprendre REC pour Sortie et Guidance, retirer 25 noms
      de sélecteurs CSS sans référence active et supprimer les anciens libellés de pause Guidance.
      Le CSS produit passe de 107,42 à 104,61 Ko ; TypeScript sans symboles inutilisés, lint,
      formatage, audit des quatre langues, 1 818 tests, bundle et APK diagnostic passent.
- [x] Traiter les deux collisions révélées par la balade S23 du 2026-09-12 : pendant Guidance, le
      contrôle de pente existant rejoint le panneau au lieu de rester caché derrière lui ; pendant
      Guidance + REC, la pastille REC de la barre haute disparaît et le bandeau minimal affiche un
      état REC compact avec durée. Aucun moteur GPS, REC ou Guidance n'est modifié. Les 531
      suites/1 815 tests, le typage, le lint, le formatage, le build, le budget bundle, Capacitor et
      l'APK diagnostic passent.
- [x] Rejouer ce correctif sur S23 Pro à 115 % et 420 dpi : Guidance seule puis Guidance + REC dans
      les trois hauteurs, pente activée en suivi continu et au viseur libre. Le même contrôle reste
      dans le panneau, la pastille REC haute est masquée, le bandeau compact affiche REC et sa durée,
      Pause/Reprendre fonctionne et la sortie restitue le contrôle de pente à la carte. Le REC court
      créé pour la qualification a été arrêté puis écarté.
- [x] Reconcevoir la Timeline solaire en deux niveaux lisibles : heure/phase/date puis
      lecture/curseur/vitesse, cibles tactiles communes, icônes SVG, mesures Pro immédiates et
      transparence adaptée au preset. L'heure reprend la phase solaire avec des couleurs distinctes
      en thèmes clair et sombre, sans supprimer le libellé. La date complète, le crépuscule et les
      mesures Azimut/Élévation sont contrôlés sur S23 Pro à 115 % et 420 dpi. Les 157 fichiers/1 817
      tests, le typage, le lint, le formatage, le build Capacitor et l'APK diagnostic passent.
- [x] Remplacer l'ancienne carte verticale de sélection par un bandeau compact : coordonnées
      complètes, altitude en 3D, action Soleil explicite et vraie fermeture. Le doublon SOS masqué et
      son ancien temporisateur disparaissent. Quand une sélection est visible, l'inclinomètre remonte
      automatiquement et conserve un espace lisible avec le bandeau ; la colonne de commandes à
      droite reste libre. Le rendu S23 Pro à 115 % et 420 dpi est contrôlé, les interactions sont
      couvertes par les tests et les 157 fichiers/1 816 tests passent.
- [x] Dissocier l'analyse solaire astronomique de la simulation du relief : un toucher 2D sélectionne
      maintenant un vrai point et ouvre Soleil. Lever, coucher, midi solaire, durée du jour, azimut,
      élévation et graphique restent calculés sans relief ; ombre, premier rayon, ensoleillement et
      frise d'exposition ne sont affichés que lorsque les altitudes existent. Le message devient une
      information non bloquante et aucun résultat de relief plat n'est présenté comme réel. Le
      parcours est rejoué par toucher réel sur S23 Pro à 115 % ; 531 suites/1 819 tests, contrôles
      statiques, quatre langues, bundle, Capacitor et APK diagnostic passent.
- [x] Nettoyer les dernières commandes cartographiques ponctuelles : remplacer la roue dentée texte
      de Préparer par l'icône SVG commune, retirer les styles HTML du bouton 2D/3D et faire utiliser
      aux outils de diagnostic l'état masqué natif. La nouvelle APK diagnostic est installée sur le
      S23 ; 531 suites/1 820 tests, contrôles statiques, bundle et Capacitor passent.
- [x] Clore la passe principale S23 des dernières surfaces actives : chargement, reprise hors ligne,
      recherche, import GPX, REC et unités de statistiques utilisent les états masqués et styles
      communs. Le sélecteur de zone hors ligne adopte les composants du système, remplace l'action
      Free par un vrai bouton avec icône SVG et masque les commandes carte concurrentes pendant la
      sélection. Son message Free reste au-dessus du panneau et ne recouvre plus Annuler ou
      Télécharger. Le rendu final est contrôlé sur S23 Free à 115 % et 420 dpi en portrait/paysage,
      ainsi que dans Réglages en thèmes clair et sombre avant retour à Auto ; le parcours Pro avait
      été rejoué sur la version immédiatement précédente et le contrat Free/Pro reste couvert par
      les tests. Une seule emprise géographique est désormais visible : orange avant validation,
      verte pendant le téléchargement puis bleue lorsqu'elle est disponible. L'emprise est
      recalculée au toucher de Télécharger et reste ensuite figée, même si la carte est orientée.
      L'APK diagnostic finale est installée ; 157 fichiers/1 825 tests, contrôles
      statiques, build Web, budget bundle, Capacitor et assemblage Android passent.
- [ ] Candidat 5.90.1 — fiabiliser la pente du chemin en suivi. Séparer explicitement la pente locale
      du terrain au viseur et la pente longitudinale du parcours ; rattacher la position à la trace
      quand Guidance est active, lisser sur une distance pertinente, tenir compte de la précision GPS
      et afficher un état incertain plutôt qu'une valeur extrême non fiable. Traiter ce chantier dans
      une discussion fonctionnelle dédiée avec cas terrain reproductibles.
- [x] Terminer la qualification groupée du lot 6 : la matrice Web 320/360/390/412/899/900/1280 px
      et zoom 200 %, l'A53 Free et l'arbre d'accessibilité Android passent. L'essai TalkBack réel a
      été interrompu car il rendait le téléphone trop difficile à utiliser ; il n'est pas bloquant
      pour ce lot. La rotation recharge maintenant son nouveau champ visible sans attendre un geste,
      tout en conservant le repos du moteur après stabilisation. Les catalogues de langue sont
      séparés et le budget bundle repasse au vert.
- [x] Rejouer après la refonte du tutoriel le sélecteur hors ligne sur S23 Free avec une carte
      orientée. À environ 61°, l'unique contour orange suit le déplacement de la carte, le panneau
      conserve ses deux actions dégagées et le message Free reste au-dessus. Le contrôle a été
      annulé sans téléchargement ; le compteur de zones reste à 0.

### Clôture fonctionnelle

Le périmètre produit et la qualification de la refonte 5.90 sont terminés localement. La pente du
chemin reste volontairement dans le candidat 5.90.1 et sa discussion fonctionnelle dédiée ; elle ne
bloque pas cette clôture. Les actions GitHub de livraison (commit, tag, push et release) sont
autorisées le 2026-09-13. L'upload Play reste séparé et impose de vérifier le maximum réel de
`versionCode` dans la console.

## v5.89.1 — simplification terrain

- [x] Simplifier et réordonner le bandeau Préparer ; conserver boucle et inversion dans
      Configuration avec des icônes unifiées.
- [x] Ajouter les accès directs Points et Profil altimétrique ; gérer les points dans un panneau
      dédié avec centrage, déplacement carte, glissement, ordre, suppression et effacement complet.
- [x] Distinguer visuellement et pour les lecteurs d'écran les états GPS localiser, position et
      suivi continu.
- [x] Ajouter les modes bandeau supérieur, compact et détails au panneau Guidance, pilotés par
      une seule languette, sans boutons redondants, avec retour explicite depuis Profil. Cette
      interaction historique est remplacée en 5.90 par trois commandes textuelles explicites.
- [x] Terminer Guidance et REC ensemble depuis l'action principale combinée, y compris dans la
      notification Android, sans supprimer les commandes indépendantes.
- [x] Enrichir le choix de fin de REC avec aperçu de trace et métriques ; rendre l'abandon
      obligatoirement explicite.
- [x] Rafraîchir immédiatement la trace et ses couleurs solaires après toute modification des
      points, puis borner Guidance sous la barre haute avec une commande toujours accessible.
- [x] Rendre visible le plafond souple Free au-delà du détail 14 par un indicateur HD Pro
      persistant et explicatif, sans bloquer le zoom cartographique.
- [x] Construire, installer et démarrer `5.89.1-diagnostic` / 910 sur Galaxy S23 SM-S911B sous
      Android 16, sans toucher au paquet de production.
- [x] Installer et démarrer la révision corrigée sur Galaxy A53 SM-A536B en 1080 × 2400 avec une
      police Android à 110 %.
- [x] Valider les gestes, tailles et libellés sur Galaxy A53 et Galaxy S23.
- [x] Passer les six tests instrumentés Android sur Galaxy A53, en plus des tests JVM et du build
      release signé.
- [x] Commit, tag, push et release GitHub `v5.89.1` autorisés et clôturés le 2026-09-10.
- [ ] Vérifier le maximum `versionCode` dans Play Console avant tout upload de 910.

## v5.89 — réactivité cartographique et architecture, clôture en cours

Plan : [évaluation bornée](docs/plans/V5_89_MAP_ARCHITECTURE_EVALUATION.md).

- [x] Observation navigateur initiale : effet de couverture progressive visible en 2D Équilibré,
      Suisse LOD14, RTX, sans pack installé ; confirmation visuelle du propriétaire. Pas encore
      de timing ni de scénario pack local qualifié. [Compte rendu](docs/plans/V5_89_BROWSER_INITIAL_OBSERVATION.md).
- [x] Instrumenter création, file, provenance, worker, mesh et première soumission ; distinguer
      `country-pack-opfs` du repli CDN et ajouter un panoramique reproductible. Le filtre avant
      construction supprime 253 objets inutiles en 2D et 913 pendant une bascule 3D sur le run
      navigateur. [Progression du 9 septembre](docs/plans/V5_89_SESSION_PROGRESS_2026-09-09.md).
- [x] Corriger le préchargement au repos qui était affamé par `needsUpdate`. Une couronne au LOD
      courant améliore le contrôle chaud (médiane 121 ms contre 249 ms), mais reste derrière
      `?tileSameLodPrefetch=1` jusqu'aux gates mémoire et appareils.
- [x] Reproduire sur A53/Équilibré au LOD14 : trou blanc au panoramique en ligne, puis secours bleu
      persistant plus de 3 s en hors ligne malgré le pack déclaré installé. Le zoom/déplacement
      relance de nouvelles clés et fait revenir la carte sans réparer l'ancienne tuile.
- [x] Corriger l'état fantôme `installed` quand le fichier OPFS manque, ne plus mettre le secours
      couleur en cache et redemander uniquement les secours visibles au retour du réseau.
- [x] Auditer le pack Suisse v3 : couleurs LOD14 présentes sur l'échantillon Grindelwald, mais
      grands identifiants relief/overlay corrompus par le writer 32 bits et bloqués par l'en-tête
      maxZoom 14. Corriger writer, en-tête et échec silencieux du builder.
- [ ] Reconstruire un pack Suisse v4 local, vérifier couleur/relief/overlay et son manifeste, puis
      demander séparément l'autorisation de l'envoyer. Le pack v3 publié reste invalide pour les
      couches décalées.
- [x] Préparer et installer après autorisation un APK diagnostic avec identifiant séparé ; passer
      Pro, confirmer sur A53 la reprise automatique de neuf secours sans geste et le retour
      immédiat à textures chaudes.
- [x] Installer le pack Suisse v3 dans l'application diagnostic et confirmer sur A53 la provenance
      `country-pack-opfs` des couleurs. Le chemin complet passe à 1 074 ms et la couleur seule à
      254 ms de médiane ; relief et overlay attendent toujours le pack v4 corrigé.
- [x] Exposer les entrées actives/inactives et l'estimation des octets décodés du cache ; limiter
      le préchargement mobile à 8/20/24/32 entrées selon le preset et attendre deux secondes de
      stabilité. Un nouvel APK diagnostic nommé explicitement a été installé après autorisation.
- [x] Séparer les caches 2D/3D, charger la couleur seule au LOD 14 et promouvoir sa texture au
      retour 3D. Sur A53 Équilibré, la médiane avec pack passe de 1 074 à 254 ms et le retour 3D
      reste visuellement fonctionnel.
- [x] Valider sur A53 la promotion 2D → 3D qui partage la texture couleur et évite sa seconde
      lecture : image correcte, aucune tuile noire, trois processus neufs par scénario. Médiane
      après repos 814 Mo pour le chemin actuel contre 690 Mo pour la transition corrigée.
- [x] Activer la couleur d'abord par défaut dans le code local après acceptation visuelle A53 ;
      167 tests ciblés carte/altitude et 1 783 tests complets passent. APK diagnostic final prêt.
- [x] Installer après autorisation l'APK final et faire un essai réel sans paramètre spécial.
      Le propriétaire rapporte des essais positifs sur A53 et S23. Le paquet diagnostic démarre
      aussi sur Tab S8 ; sur Galaxy S7/Android 8, la carte et la 3D fonctionnent lors d'un contrôle
      court alors que l'ancienne version plantait. Aucun essai en balade n'est revendiqué sur S7.
- [ ] Ajouter les octets de ressources en vol et comparer sur A53 l'ancien relevé de 103
      préchargements invisibles au nouveau budget Équilibré de 20.
- [ ] Relever preset effectif, GPU/backend, DPR, qualité, files de chargement et pic mémoire.
      Brave/Intel HD et navigateur intégré/RTX sont des environnements distincts.
- [x] Attribuer les délais et limiter le changement retenu au chargement couleur d'abord avec
      promotion de texture, sans changement de moteur.
- [x] Décider : conserver Three.js/WebGL. Les attentes couleur/relief, le pack et la rétention des
      textures dominaient avant le GPU ; WebGPU ne répond pas au défaut reproduit.
- [x] Après bilan, répartir les lots experts/lumière en 5.90+ ; réserver une future 6.0 à un
      saut d'expérience démontré. Compte/sync reste différé.

## ✅ Documentation actuelle — audit du 2026-09-07

- [x] Remplacer le README 5.84 par une présentation 5.88 fondée sur le code actif.
- [x] Créer `docs/FEATURES.md` comme inventaire canonique et marquer l'ancien fichier 5.53 comme
      archive historique.
- [x] Ajouter `docs/README.md` pour séparer références actives, plans et archives.
- [x] Mettre à jour les protocoles, la fiche Store, la matrice Free/Pro et les documents de
      guidage/readiness/stockage.
- [x] Corriger dans les quatre langues les textes obsolètes sur la sauvegarde des routes et le
      guidage Android/Web.

Cet audit ne change ni version, ni droit Free/Pro, ni état Play. Il n'autorise aucune publication.

## ✅ v5.88.0 — Stabilisation performance A53/S23

- [x] Corriger les animations CSS invisibles (barre de chargement et fiches fermées),
      avec contrôle navigateur avant/après et1751tests verts.
- [x] Installer après accord et contrôler le lot animations surA53 : pause/reprise validées,
      traces préservées et CPU observé plus bas (comparaison indicative).
      [Contrôle](outputs/v5.88-a53-resources-20260906-1249/ANIMATIONS_INSTALLED.md).
- [x] Profiler brièvement le CPU résiduel2D : coût du cadencement continu identifié par
      deux pauses temporaires, avec reprise confirmée ; aucune correction produit acquise.
      [Profil](outputs/v5.88-a53-resources-20260906-1249/RESIDUAL_CPU.md).
- [ ] Suivi post-release : qualifier un éventuel arrêt complet du cycle repos/réveil seulement
      si un nouveau profil montre un gain matériel sans régression gestes/GPS/fondus.
      [Correctif](outputs/v5.88-a53-resources-20260906-1249/ANIMATIONS_READY.md).
      Mesures ressources A53 sauvegardées :
      [RESULTATS.md](outputs/v5.88-a53-resources-20260906-1249/RESULTATS.md).

- [x] Installer le lot finalisation REC + cache2D avec accord et vérifier STOP/export surA53 :
      10points archivés et exportés identiques.1744tests/7E2E verts.
      [Contrôle du6septembre](outputs/v5.88-morning-20260906/INSTALLATION.md).
- [x] Reprendre après recharge : A53 48%, Équilibré/DPR1,2 confirmés, cache2D sans rechargement.
- [x] Installer avec accord et valider le correctif cache3D surA53 :22puis20restaurations
      avec mêmes textures, archives préservées.1751tests/7E2E verts.
      [État exact](outputs/v5.88-morning-20260906/CACHE3D_INSTALLED.md).
- [x] Améliorer la couverture du dézoom : ancienne image retenue jusqu'au parent opaque, cache2D
      et cache3D réutilisés ; dernière sortie A53 jugée correcte sans zones bleues observées.
      [COVERAGE_RESULTS.md](outputs/v5.88-a53-return-20260905/COVERAGE_RESULTS.md).
- [x] Préserver le worktree et relever la baseline USB A53 2D/3D sans effacer de données.
- [x] Reproduire le rebond 3D et isoler le terrain absent traité comme zéro ; corriger continuité
      de hauteur et contraintes de suivi, avec vrais MapControls dans les tests.
- [x] Vérifier la stabilité sur la copie Android isolée : p95 renderer 109,4 → 23,8 ms sur le
      défaut de rebond, LOD 17 stable ; confirmation visuelle du propriétaire.
- [x] Désactiver ombres/météo/animation eau inutiles en 2D, sans changer les presets.
- [x] Corriger le verrou STOP conservé après abandon d'un REC ; regression test avant/après.
- [x] Corriger la baisse indue du DPR au repos, reproduite sur S23 et par tests ; conserver
      l'adaptation lors d'une vraie surcharge.
- [x] Valider 1 724 tests / 153 fichiers, check, build, budget, i18n et dix parcours Chromium.
- [x] Installer la dernière copie Diagnostic surS23 et valider un REC terrain contre Garmin :
      2,76km, écart0,72m, p95 spatial5,01m, aucune portion perdue, arrêt propre.
      [Comparaison](outputs/v5.88-s23-walk-20260906/RESULTATS.md).
- [x] Contrôler la 2D allégée et STOP UI sur A53 après installation Diagnostic.
- [ ] Suivi post-release : rejouer 30 minutes route + Guidance + REC en mouvement dans une zone
      de faible réseau avec zone téléchargée, puis comparer T0/T15/T30 et l'autonomie.
- [ ] Maintenance séparée : actualiser l'audit réseau des dépendances avant toute mise à jour.

Le lot est clôturé par décision du propriétaire en `5.88.0` / Android `908`. Les mesures USB
locales restent hors Git car elles contiennent des informations d'appareil et de localisation.
Aucun téléversement Play n'est inclus ; vérifier que le code 908 est libre avant l'envoi manuel.

## ✅ v5.87.0 — Dépôt de traces pleine fidélité

- [x] Ajouter `StoredTrackV1` et `TrackRepository` IndexedDB séparé de `RouteRepository`, avec
      blocs atomiques, erreurs typées et géométrie complète des imports et REC.
- [x] Migrer l'historique legacy en copy-first idempotent et reprenable, sans supprimer le
      `localStorage`, inventer des champs absents ni dédupliquer sur le seul nom.
- [x] Faire de Bibliothèque le catalogue unique : toutes les traces accessibles une par une en
      Free ; multi-affichage et export fichier réservés à Pro ; downgrade sans perte.
- [x] Finaliser les STOP REC après flush Room et écriture durable, avec reprise en cas d'échec et
      abandon explicite sans archive.
- [x] Couvrir CRUD, concurrence, rollback, quota, corruption, Unicode, 12 345 points, migration
      interrompue/reprise, import/reload/offline et frontières Free/Pro.
- [x] Valider sur S23/API 36 trois traces complètes et une route préservées après mise à jour,
      ouverture Free une à la fois, export verrouillé, renommage et STOP notification sauvegardé.
- [x] Remplacer le libellé visible de renommage par l'icône crayon compacte, avec `aria-label` et
      infobulle conservés.
- [x] Aligner la release sur `5.87.0` / Android `versionCode 907`, puis publier commit, tag,
      release GitHub et AAB signé le 2026-09-02.
- [x] Rejouer les gates de release : check, 1 710 tests/152 fichiers, couverture 64,48 %, build,
      budget PWA 2,35 MiB, i18n, sept pages Capacitor, sync, JVM, lint et APK debug.
- [x] Installer l'APK `5.87.0` / 907 sur le S23 avec `adb install -r`, sans désinstallation ; la
      date de première installation reste inchangée et l'application redémarre sans crash.
- [ ] Retest terrain recommandé : confirmer que « Arrêter REC » ramène directement l'application
      au premier plan avec le correctif Android 14+ installé.
- [ ] Téléversement et publication Play : hors périmètre ; revérifier le maximum global et obtenir
      une autorisation séparée avant tout upload.

## ✅ v5.86.2 — Tableau de bord Sortie et contrat Free/Pro honnête

- [x] Vérifier le maximum global dans Play App Bundle Explorer (`905`) et attribuer localement
      `versionName 5.86.2` / `versionCode 906`, sans upload ni action de publication.
- [x] Introduire un view-model pur repos/route/Guidance/REC/combiné/terminé et conserver la priorité
      des mesures REC réelles : durée, distance, allure, D+, altitude, D− et qualité GPS.
- [x] Réunir import GPX, itinéraires à suivre et activités REC dans « Mes parcours » ; limiter
      Sortie à la route consultée/suivie, au guidage et à l'activité actuelle.
- [x] Autoriser le nom personnalisé et la sauvegarde interne d'un REC Free ; bloquer l'export fichier
      avant Blob/écriture et ne jamais afficher un faux toast de téléchargement.
- [x] Retirer l'upsell permanent en activité et les textes `éphémère` / `recWarning5min` des quatre
      locales ; Free affiche un parcours à la fois et Pro peut en ajouter jusqu'à dix à la carte.
- [x] Corriger le build mobile qui avait synchronisé la base GitHub Pages
      `/suntrail_threejs/` : `cap:sync` reconstruit avec `CAPACITOR=true` et refuse désormais toute
      URL locale absolue ou référence d'actif absente avant la copie Android.
- [x] Unifier l'import en route préparée prête à suivre, distinguer les sources import/REC dans les
      droits Free et remplacer l'import affiché sans verrouiller les activités enregistrées.
- [x] Unifier tous les STOP REC avec arrêt natif immédiat, traitement visible, nom géolocalisé et
      récupération du dernier lot Room depuis la notification.
- [x] Activer le guidage natif validé sur Android et conserver un seul service adaptatif
      REC/Guidance/both ; calculer distance/vitesse côté natif et retirer le nombre de points des
      notifications.
- [x] Ajouter le basculement persistant Allure/Vitesse et une ligne REC compacte au panneau de
      Guidance combiné.
- [x] Consigner les gates : check, 1 684 tests, build/budget/i18n/cap sync, tests JVM, lint
      release, R8 et AAB 906 signé localement. Les E2E Chromium
      restent non exécutés : `spawn EPERM`, puis préflight Playwright bloqué hors sandbox.
- [x] Valider les parcours terrain par le propriétaire sur Galaxy S23 ; la reprise arrière-plan est
      aussi vérifiée directement après retour dans l'application et ouverture de Météo.
- [x] Commit, tag, push et GitHub Release autorisés explicitement le 2026-08-21.
- [ ] Téléversement et publication Play : hors périmètre de cette clôture, à autoriser séparément.

## 🟡 v5.86.1 — Android 15/16 edge-to-edge et R8

- [x] Attribuer `versionName 5.86.1` / `versionCode 905` ; le code 904 de v5.86.0 est déjà
      consommé par son import Google Play et ne doit pas être réutilisé.
- [x] Relier les safe areas WebView aux quatre insets natifs injectés par Capacitor 8, sans changer
      le mode immersif, `adjustResize` ni les contrats terrain.
- [x] Identifier `shortEdges` dans `androidx.core:core-splashscreen:1.2.0` et ne pas ajouter de
      surcharge manifeste/thème sans preuve d'un thème actif concerné.
- [x] Remplacer les règles R8 globales par les règles consumer des dépendances et les seules
      informations source/ligne nécessaires aux traces.
- [x] Borner le cache terrain Android inactif (120 entrées en Équilibré/Fluide, 160 en Ultra manuel)
      et protéger les tuiles affichées par un compteur de références : l'éviction LRU ne libère que
      les textures réellement inactives, sans fermer les `ImageBitmap` (ré-upload possible, tuiles
      noires du mode suivi corrigées).
- [x] Avant le correctif mémoire, valider check, 1 662 tests, builds web/Capacitor, budget 2,31 MiB
      et `cap:sync`.
- [x] Avant le correctif mémoire, valider AAB release R8 905, 6 tests unitaires Android, lint
      (0 erreur), compilation des tests instrumentés et inspection bundletool ; `shortEdges` est
      absent de l'AAB réduit.
- [x] Exécuter sur Galaxy S23/API 36 les 4 tests instrumentés non destructifs Room/Guidance et
      contexte. Le test `TrackingServiceInstrumentedTest`, qui vide Room et `TrackingPrefs`, reste
      volontairement exclu pour préserver les données terrain du téléphone.
- [x] Valider physiquement sur Galaxy S23 Android 16 les orientations, l'encoche, les gestes et la
      navigation trois boutons, l'IME, la carte et les feuilles Exploration, Préparer,
      Bibliothèque, Sortie/REC et Réglages.
- [x] Valider Guidance sur le build release R8 : démarrage, interface, notification foreground et
      actions Pause/Arrêter, puis arrêt propre sans modifier la route préparée.
- [x] Après le correctif mémoire, valider check, 1 666 tests Vitest, build web, budget bundle et
      `cap:sync`.
- [x] Corriger sur S23 les tuiles noires du mode suivi (textures encore affichées libérées par
      l'éviction + `ImageBitmap.close()` empêchant la ré-upload) et revalider le suivi réel.
- [x] Isoler la conso SunTrail via `dumpsys batterystats` (sortie 2026-08-19) : SunTrail ≈ 66 % du
      drain mesuré, dominé par le CPU (WebView/WebGL) puis GNSS. Voir
      [docs/plans/V5_86_BATTERY_VALIDATION.md](docs/plans/V5_86_BATTERY_VALIDATION.md).
- [x] Valider la conso REC de SunTrail écran éteint sur le run 2026-08-20 : ~2-3 %/h (cible
      ≤ 10 %/h atteinte) ; le ~15 %/h total restant provient des apps/fond du téléphone (GMS,
      Samsung MCF, Garmin, Sweatcoin, Bluetooth montre), hors périmètre SunTrail.
- [ ] Reconstruire l'AAB release R8 actuel, l'inspecter puis l'installer sur le S23. Le wrapper
      Gradle doit d'abord pouvoir télécharger sa distribution dans un environnement autorisé.
- [ ] Valider séparément un REC réel avec notification/reprise et une reprise Guidance après mort
      de processus normale. Le scénario `force-stop` restaure l'interface Guidance mais Android
      interdit la relance du service foreground ; il ne constitue pas une preuve de reprise native.
- [x] Rejouer sur S23 un REC comparatif écran éteint et relever la conso SunTrail via
      `dumpsys batterystats --reset`/dump : run 2026-08-20 ≈ 2-3 %/h pour SunTrail (cible
      ≤ ~10 %/h atteinte). Le run était de ~23 min (le protocole recommande 60 min) : la marge
      est large (2-3×), mais un run plus long resterait une confirmation. Voir l'historique
      `docs/plans/V5_86_BATTERY_VALIDATION.md`.
- [ ] Commit, tag, push, GitHub Release et upload Play uniquement après autorisation explicite.

## ✅ v5.86.0 — prêt à partir et corridor hors ligne

- [x] Rapport readiness local en couches : route, lumière et offline immédiats ; données réseau et
      appareil explicitement inconnues sans preuve.
- [x] Corridor mondial Free 1 km LOD 5→14, rayon Pro 0,5/1/2 km, progression, annulation et reprise.
- [x] Manifeste IndexedDB séparé, CacheStorage, remplacement Free atomique et protection des zones
      manuelles ; Prepared Routes, REC et guidage restent inchangés.
- [x] Préflight données mobiles/quota et fonctionnement local-only sans réseau.
- [x] E2E Chromium réel : téléchargement, fermeture, rechargement sans réseau externe et couverture
      à 100 % ; Prepared Routes 6/6 verts.
- [x] Validation terrain propriétaire : Norvège, fermeture complète, relance hors connexion,
      bibliothèque et suivi disponibles jusqu'au LOD 14.
- [x] Correctif d'affichage Signal GPS à deux décimales, couvert par test ciblé.
- [x] Release GitHub v5.86.0 réalisée et AAB `versionCode 904` importé dans Google Play ; ce code
      est consommé et reste associé à v5.86.0.

## 🟡 v5.85.1 — performance et autonomie terrain

- [x] Boussole rendue uniquement avec une frame carte utile ; deep sleep préservé.
- [x] Remplacement du cache LRU libérant les anciennes textures ; préchargement LOD réellement
      chargé, réutilisable par la source active, non épinglé et dédupliqué ; zoom sortant corrigé.
- [x] Mesh REC live borné à 2 500 points, reconstruction longue débouncée à 5 s et trace complète
      conservée pour récupération/export.
- [x] Snapshot de récupération REC débouncé à 15 s avec flush background/STOP ; stats notification
      recalculées seulement si les points ont changé et au plus toutes les 30 s.
- [x] Stats REC de la feuille Sortie non recalculées lorsqu'elle est fermée.
- [x] Polling Free de l'inclinomètre, polling stockage et timer permanent de focus recherche supprimés.
- [x] Météo initiale et lecture de session native dupliquées supprimées ; `gpxparser` différé ; packs
      prêts avant terrain et feuilles secondaires lancées après le chemin critique WebGL.
- [x] Guidage TS/Java : projection bornée avec fallback exact ; ticker natif silencieux si inchangé,
      persistance des positions acceptées limitée à 10 s et notification à snapshot unique.
- [x] Version source `5.85.1` figée au commit local `b30a1c1`, sans release ni attribution Play.
- [x] Web final : `npm run check`, 1 607 tests Vitest, build, budget bundle 2,27 MiB, audit i18n
      sans clé manquante et `npm run cap:sync` réussis.
- [ ] Rejouer les 24 E2E Chromium sur un runner autorisant le lancement navigateur (`spawn EPERM`
      sur l'hôte Codex, avant exécution du code des tests).
- [ ] Exécuter tests/lint/assemblage Android avec un JDK ; cet hôte n'a ni `JAVA_HOME` ni `java`.
- [ ] Mesurer idle/carte/REC/Guidance+REC sur A53 et S23, trois runs homogènes face à v5.85.0.
- [ ] Vérifier absence de fuite WebGL/texture après 30 min de pan/zoom et changements LOD.
- [ ] Conserver les validations E2E/Gradle/A53/S23 de v5.85.1 séparées de v5.86.1 ; ne pas les
      déclarer closes à partir des preuves de cette release corrective.

## ✅ v5.85.0 — guidage Android natif clôturé

La clôture de v5.85.0 a été confirmée par le propriétaire du projet le 2026-08-13. Le détail
historique du protocole reste dans
[docs/plans/V5_85_A53_S23_FIELD_VALIDATION.md](docs/plans/V5_85_A53_S23_FIELD_VALIDATION.md) ;
v5.85.1 est désormais le chantier actif.

## ✅ v5.84.0 — moteur de suivi interne clôturé

- [x] `GuidanceEngine` pur : projection, progression robuste, restant/ETA, écart, bearing/look-ahead.
- [x] Accuracy/fraîcheur, hystérésis, cooldown et sept états de session testés.
- [x] Fixtures droite, boucle, aller-retour, épingles, croisement, bruit, saut, récupération, arrivée.
- [x] `GuidancePlanV1` séparé et migration IndexedDB v2→v3 additive.
- [x] Cues ORS/OSRM, points GPX nommés proches et dérivés approximatifs filtrés.
- [x] UI foreground, alertes visuelles/haptiques, recentrage et REC indépendant.
- [x] Qualités `full` / confirmation `approximate` / refus `not-ready` couvertes en E2E.
- [x] Gates automatisés, synchronisation Capacitor et contrôles Android consignés (0 erreur).
- [x] Validation manuelle Galaxy S23 application ouverte/mode avion/GPS bruité/lacets/REC
      acceptée par le testeur ; limites foreground confirmées.
- [x] Commit, tag et pré-release GitHub interne autorisés ; aucun téléversement Play Console.

## ✅ Correctifs CI + produit (même version 5.83.3, non publiés)

- [x] Suppression de compte (RGPD) fonctionnelle sur iOS : `confirmDialog` (modale HTML custom)
      remplace `window.confirm()` qui retourne toujours `false` sur WebKit/iOS.
- [x] Bouton timeline visible sur iPhone 12/13/14 : media query `max-width: 389px` au lieu de 390px.
- [x] Disclaimer + onboarding affichés même si la scène WebGL ne devient pas prête.
- [x] Suite E2E stabilisée : SW bloqué, preset forcé en mode test, langue `fr` forcée en test.
- [x] `npm audit` clean (override `nanoid ^3.3.17`).
- [x] `npm run check` (tsc + prettier + eslint), 1551 tests unitaires et E2E 3 navigateurs verts.

## ✅ v5.82.0 — Fondations UX finalisées

- [x] Mode Planifier, navigation, recherche, onboarding, réglages et accessibilité implémentés dans le worktree.
- [x] `npm run check` et 1 491 tests unitaires validés le 2026-08-08.
- [x] Les 6/6 smoke Chromium et le scénario débutant Planifier isolé passent.
- [x] Revue visuelle validée en 360, 390, 768, 900 et 1280 px, y compris textes longs DE/IT et états transitoires.
- [x] Bibliothèque annonce honnêtement les traces récentes et ne promet pas encore la persistance des routes planifiées.
- [x] Build de production, budget bundle et audit i18n validés le 2026-08-08.
- [x] Synchronisation Capacitor, tests Android, lint Android et APK debug validés.
- [x] Changelog daté et versions alignées à `5.82.0` / Android `897` après les gates.

## ✅ Validation terrain v5.82.0 clôturée

- [x] Validation manuelle Galaxy S23 acceptée le 2026-08-09 : aucun P0/P1 signalé.
- [x] Observation Sortie/Bibliothèque classée P2 : redondance transitoire prévue, à résoudre
      fonctionnellement par la bibliothèque locale `PreparedRoute` de v5.83.

## ✅ Publication externe v5.82.0 — clôturée

- [x] Play Console vérifiée : le plus grand `versionCode` réellement utilisé est `896` ; `897` est
      donc attribué à v5.82.0 et le bundle signé a été généré.
- [x] Commit, tag `v5.82.0`, CI et release GitHub publique avec AAB signé vérifiés le 2026-08-09.
- [x] Publication v5.82 clôturée ; v5.83 peut démarrer.

Protocole : [docs/plans/V5_82_S23_FIELD_VALIDATION.md](docs/plans/V5_82_S23_FIELD_VALIDATION.md).
Prompt de clôture :
[docs/plans/prompts/V5_82_FIELD_RELEASE.md](docs/plans/prompts/V5_82_FIELD_RELEASE.md).

État détaillé : [docs/plans/V5_82_RESUME_STATUS.md](docs/plans/V5_82_RESUME_STATUS.md).

## ✅ v5.83.0 — Prepared Routes implémentée localement

- [x] `PreparedRouteV1`, `RouteRepository` IndexedDB et migration additive v1→v2.
- [x] Bibliothèque locale : sauvegarder, rouvrir sans réseau externe, dupliquer, favori, supprimer.
- [x] A/B accessible, waypoints éditables, inversion, ordre, suppression et undo/redo.
- [x] Difficulté ORS complète/partielle, inconnue OSRM/absente, effort, ETA et soleil.
- [x] Legacy localStorage préservé ; conversion explicite et approximative uniquement.
- [x] Release flags séparés des entitlements et traductions FR/EN/DE/IT.
- [x] 1 536 tests unitaires, build, bundle 2,20 MiB et audit i18n validés.
- [x] Runner Playwright officiel Chromium : 6 smoke et 4 scénarios Prepared Routes validés.
- [x] Correctifs terrain S23 : Boucle persistée, conflit GPX/route annulé, nom GPX et A/B
      synchronisés, difficulté inconnue sans faux pourcentage, largeur mobile et traductions dynamiques.
- [x] Deuxième passe terrain : cadrage des routes préparées, remplacement visible du GPX Free,
      protection des boucles GPX contre le recalcul A/B et contenus Bibliothèque bornés au panneau.
- [x] Build Android, tests unitaires, lint, APK debug et installation S23 (`versionCode 898`) validés.
- [x] Retest S23 du thème natif : sélecteur, calendrier et confirmation de suppression compacts,
      sans visuel SplashScreen ni contenu hors écran ; changements de langue validés sur appareil.
- [x] Retest S23 du conflit GPX/Bibliothèque : import visible sans sauvegarde préalable,
      nom/statistiques immédiats et réouverture d'une route préparée avec fly et géométrie correcte.
- [x] Contrat de trace clarifié : brouillon Préparer, trace consultée et REC indépendant ; aucune
      sélection de bibliothèque ne remplace automatiquement le brouillon.
- [x] Bandeau Préparer nommé, action explicite « Préparer cette trace », protection
      Sauvegarder/Remplacer/Annuler et commandes de visibilité avec compteur.
- [x] Tests unitaires ciblés sur arbitrage, protection du brouillon, visibilité et priorité REC.
- [x] E2E Chromium final : 4/4 Prepared Routes/IndexedDB/legacy/GPX boucle et 6/6 smoke.
- [x] `cap:sync` sans diff suivi inattendu, puis tests Android, lint et APK debug validés.
- [x] Contrat GPX clarifié : géométrie complète distincte des jalons ; boucle détectée avec
      départ, deux passages intermédiaires et arrivée superposée au départ.
- [x] Régression automatisée GPX boucle → sauvegarde → réouverture du profil ajoutée sur la
      vraie IndexedDB Chromium ; boutons Prepared Routes/visibilité unifiés avec le thème.
- [x] Retest Galaxy S23 des jalons de boucle, de la réouverture du profil et des boutons unifiés.
- [x] Correctif v5.83.1 : résumé Préparer lisible en portrait et mode carte au second clic,
      validés sur Galaxy S23.
- [x] v5.83.2 : détection de la langue système au premier démarrage (fr/de/it/en, repli fr),
      préférence sauvegardée prioritaire, tests ajoutés (1551 au total) et `npm run check` OK.
- [x] Autorisation explicite reçue : CI, AAB et publication v5.83.2 (tag + push).
- [x] v5.83.3 : langue par défaut passée au français → anglais (`state.lang`, constructeur i18n,
      repli `detectSystemLocale()`, chaîne de repli `t()` et noms de packs).

## 🟡 Programme produit engagé

- [x] **v5.83.1** — correctif d'interface Préparer ; routes, brouillon et contrat de traces
      validés sur Galaxy S23.
- [x] **v5.83.2** — détection de la langue système au premier démarrage, publiée.
- [x] **v5.83.3** — anglais par défaut, publiée.
- [x] **v5.84.0 interne** — clôturée par pré-release GitHub interne, sans déploiement Play.
- [x] **v5.85.0** — clôture confirmée ; base de référence de v5.85.1.
- [ ] **v5.85.1** — optimisations implémentées localement ; web vert, Android/E2E et terrain ouverts.
- [x] **v5.86.0** — rapport Prêt à partir et corridor cartographique hors ligne, clôturée sur GitHub.
- [x] **v5.88.0** — stabilisation mesurée du mode 3D, de la 2D, des tuiles et de STOP REC ;
      contrôles A53/S23 et comparaison terrain S23/Garmin terminés.
- [ ] **v5.89** — évaluation cartographique, presets et mémoire avant décision d'architecture.
- [ ] **5.90+ (ex-v6.0)** — outils experts et finition professionnelle locale, après bilan v5.89.
- [ ] **5.90+ (ex-v6.1)** — lumière utile et préparation photo sobre, après bilan v5.89.
- [ ] **Compte/sync différé (ex-v6.2)** — synchronisation PC–Android, après décision active.

Voir [ROADMAP.md](ROADMAP.md) et
[docs/plans/prompts/README.md](docs/plans/prompts/README.md) pour les scopes, gates et prompts.

## 🟠 Dette à traiter dans la version qui touche le domaine

- **SettingsSheet.ts** (983 lignes) — compte/RGPD et navigation par catégories extraits en v5.82.0 ; poursuivre l'extraction des réglages de rendu lors de la prochaine modification de ce domaine.
- **SolarProbeSheet.ts** (1052 lignes, 5 % couverture) — extraire pendant v6.1 si le lot touche ce domaine.
- **tileLoader.ts** (844 lignes) — extraire le service avant le corridor offline v5.86.
- **Zones noires AT/ES/NO LOD 14+** — corriger sans bloquer le programme produit.
- **Couverture** — atteindre au moins 60 % sans tests artificiels.
- **CI** — automatiser check, tests, build, bundle, i18n et smoke E2E.

## 🟢 Horizons ultérieurs — numérotation à décider

- couverture Slovénie/Italie/UK et nouvelles sources officielles ;
- communauté, partage live et intégrations externes ;
- guidage vocal et Wear OS ;
- photo/astro avancé au-delà de la préparation lumière v6.1 ;
- WebGPU : prototype possible dès que l'évaluation v5.89 le justifie ; production uniquement
  après comparaison et validation appareil, sans dépendance obligatoire au compte/sync.

## ✅ Récemment complété (v5.82.0)

- [x] **Fondations UX** — Planifier explicite, navigation par intention, recherche contextualisée, onboarding en trois écrans, réglages structurés et accessibilité renforcée.
- [x] **PWA et E2E stabilisés** — navigation multi-page préservée au rechargement et smoke Chromium validé sur build de production.

- [x] **Section Compte RGPD conservée** — La section reste visible sans session, avec un statut neutre ; les contrôles invité et Google restent masqués et sont couverts par le smoke E2E.

- [x] **Parcours invité / Google masqués** — UI OAuth, liaison Google et achat invité Web suspendus jusqu'à la fiabilisation du retour OAuth et de la restauration d'achats ; Android natif inchangé.

- [x] **Démarrage carte progressif** — l'overlay disparaît dès la première tuile 3D construite ; le reste du chargement reste visible dans la barre fine.
- [x] **Chemin critique allégé** — RevenueCat différé, double scan des packs supprimé, purge de caches non bloquante et fetch Gist mutualisé.

- [x] **Audit tests complet** — 20 fichiers de test, 277 tests ajoutés
- [x] **Bug getElevation()** — Retournait NaN si `ele=NaN` au lieu de fallback
- [x] **Bug revokeProAccess()** — Ne réinitialisait pas les flags Pro
- [x] **Couverture activée** — seuil 50%, rapport HTML, 58.25% actuels
- [x] **Tests ajoutés** : gpxTypes, iap, packCatalog, packTypes, storage, SolarLockedItem, SolarTimeline, autoHide, SharedAPIKeyComponent, UpsellModal, SOSSheet, draggablePanel, NavigationBar, LayersSheet, SearchSheet, mobile, WidgetsComponent, ConnectivitySheet, TrackSheet, WeatherSheet, SolarProbeSheet, Tile
- [x] **Tests enrichis** : compass (2→14), utils (2→16), buildings.integration (1→6), hydrology.integration (1→7), poi.integration (1→6), tileQueue (+14)
