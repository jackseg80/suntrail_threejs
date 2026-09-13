# SunTrail 3D — Protocole de test complet (v5.90.0)

> Durée indicative : 1 h 30 à 2 h hors marche terrain. Ce protocole couvre les fonctions actuelles
> sans supprimer les données existantes. Les achats et actions de publication ne font pas partie du
> test fonctionnel.

## Contexte à relever

- Appareil et version Android/navigateur :
- Version SunTrail et `versionCode` :
- Mode Free ou Pro :
- Preset et 2D/3D :
- Zone cartographique et source affichée :
- Réseau : Wi-Fi, cellulaire, faible réseau ou avion :
- Batterie et température de départ :

## 1. Installation, reprise et onboarding

- [ ] Mettre à jour sans désinstaller et vérifier que routes, traces, zones et packs restent présents.
- [ ] Sur un profil neuf seulement, parcourir les deux étapes d'onboarding sur la carte réelle et
      tester Passer/Échap.
- [ ] Vérifier la récupération sûre après mise en arrière-plan, rotation et retour au premier plan.

## 2. Navigation 2D/3D

- [ ] Tester pan à un doigt, pinch, rotation, tilt, double-tap et recentrage GPS.
- [ ] Alterner plusieurs fois 2D/3D ; vérifier ombres, eau et météo au retour en 3D.
- [ ] Zoomer/dézoomer rapidement ; vérifier absence de trou persistant, écran bleu ou blocage du
      compteur de chargement.
- [ ] En Free, dépasser le détail 14 sans blocage : l'indicateur orange « HD Pro » reste visible,
      explique au toucher l'agrandissement du niveau 14, puis disparaît en dézoomant.
- [ ] Répéter en portrait et paysage, avec les zones sûres Android 15/16.

## 3. Explorer et données cartographiques

- [ ] Rechercher une adresse, une localité et un sommet.
- [ ] Ouvrir un POI et vérifier la cohérence de l'altitude/du nom disponible.
- [ ] Activer/désactiver sentiers, pentes et bâtiments selon le niveau de détail.
- [ ] Tester une frontière de pays : un repli mondial est préférable à une tuile blanche.

## 4. Solaire, météo et outils

- [ ] Déplacer la timeline sur 24 h et contrôler les ombres sur le relief.
- [ ] Poser une sonde, vérifier lever/coucher, azimut, altitude et limites affichées.
- [ ] Avec un parcours, contrôler le profil et l'analyse d'exposition sans confondre estimation et
      observation terrain.
- [ ] Ouvrir Météo, boussole, inclinomètre si Pro et SOS ; vérifier les états sans GPS/réseau.

## 5. Préparer une route

- [ ] Poser A/B par taps, ouvrir Points, centrer/déplacer/réordonner/supprimer un waypoint et
      inverser la route depuis Configuration.
- [ ] Après chaque modification, vérifier que géométrie puis couleurs solaires se rafraîchissent
      sans devoir déplacer la carte.
- [ ] Fermer et rouvrir le profil depuis son bouton direct ; vérifier l'ordre du bandeau et les
      icônes Boucle/Inverser unifiées.
- [ ] Tester un calcul ORS avec clé puis le repli OSRM ou l'erreur explicite sans réseau.
- [ ] Vérifier distance, D+/D-, durée, effort, heure d'arrivée, lumière et difficulté.
- [ ] Modifier le brouillon puis ouvrir une autre route : tester Sauvegarder, Remplacer et Annuler.
- [ ] Sauvegarder, dupliquer, mettre en favori, renommer et supprimer uniquement une copie de test.

## 6. Bibliothèque et traces

- [ ] Importer un GPX avec suffisamment de points pour contrôler la fidélité et le profil.
- [ ] Fermer complètement puis rouvrir : le GPX et la route préparée doivent rester disponibles.
- [ ] En Free, ouvrir plusieurs parcours successivement sans perte d'archive.
- [ ] En Pro, ajouter plusieurs traces à la carte, masquer les autres puis tout masquer.
- [ ] Tester Renommer et Refaire ; une trace legacy approximative doit rester identifiée comme telle.
- [ ] Tester l'export GPX en Pro. En Free, vérifier que le verrou intervient avant toute création de
      fichier et que le parcours reste consultable.

## 7. Guidage

- [ ] Démarrer une route complète puis une route approximative avec confirmation.
- [ ] Vérifier acquisition, sur-trace, pause/reprise, prochaine indication, restant, ETA et flèche.
- [ ] Parcourir les trois états du panneau par sa seule languette : détails, compact et bandeau
      supérieur ; toucher le bandeau pour rouvrir. Répéter avec une grande police.
- [ ] Simuler seulement si c'est sûr un petit écart à la trace, puis un retour ; relever les délais
      d'alerte sans inventer un résultat si le GPS est imprécis.
- [ ] En mode combiné, vérifier que Terminer la sortie coupe Guidance et REC ensemble. Dans les
      détails, vérifier aussi que les deux commandes indépendantes restent disponibles.
- [ ] Sur Android, tester écran éteint, retour depuis notification et reprise après fermeture de
      l'interface. Sur le Web, ne pas attendre de garantie arrière-plan.

## 8. REC et finalisation

- [ ] Enregistrer une courte marche avec écran actif puis écran éteint sur Android.
- [ ] Vérifier durée, distance, allure/vitesse, D+/D-, altitude, précision et nombre de points.
- [ ] Arrêter depuis l'interface et vérifier avant choix l'aperçu de trace, distance, durée,
      dénivelés, allure et nombre de points ; nommer, enregistrer, relancer et retrouver l'archive.
- [ ] Faire un second REC jetable et choisir Ne pas enregistrer ; aucune ancienne archive ne doit
      disparaître.
- [ ] Si la notification Android propose STOP, vérifier le retour dans l'app et la même finalisation.

## 9. Readiness et hors ligne

- [ ] Ouvrir le rapport d'une route et vérifier les cinq sections indépendantes.
- [ ] Confirmer que conditions/appareil restent inconnus sans preuve fraîche.
- [ ] Télécharger un corridor court sur Wi-Fi, annuler un second essai puis reprendre.
- [ ] En Free, vérifier la confirmation avant remplacement d'un corridor différent.
- [ ] Télécharger une petite zone manuelle distincte du corridor.
- [ ] En mode avion après relance complète, contrôler la carte, la route, le profil et le guidage
      dans la couverture réellement mesurée. Noter tout résultat partiel.

## 10. Free/Pro et robustesse

- [ ] En Free : données plafonnées au LOD 14 avec zoom plus proche signalé « HD Pro », une trace
      affichée, une zone et un corridor 1 km.
- [ ] En Pro : LOD 18, satellite, calendrier, météo détaillée, inclinomètre et multi-affichage.
- [ ] Vérifier qu'un changement de droit ne supprime, ne simplifie ni ne cache une archive locale.
- [ ] Tester perte/retour réseau, rotation, mise en arrière-plan et faible batterie sans purger les
      caches ni forcer l'arrêt du service.

## 11. Compte rendu

Pour chaque scénario, classer le résultat en réussi, échec reproductible, résultat partiel ou non
testé. Joindre les étapes, l'heure, le contexte et les preuves. Distinguer clairement :

- contrôle automatisé ;
- observation sur appareil ;
- comparaison chiffrée ;
- impression utilisateur ;
- hypothèse à reproduire.

Utiliser [PROTOCOL_TEST_PERF_MOBILE.md](../PROTOCOL_TEST_PERF_MOBILE.md) pour toute conclusion de
performance ou d'autonomie.
