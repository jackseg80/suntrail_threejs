# SunTrail 3D

**Version source 5.91.2 · Android 915 · MIT avec Commons Clause**

SunTrail est une application de randonnée mobile-first qui combine cartographie 2D/3D,
relief, lumière solaire, préparation d'itinéraires et suivi GPS. Android est la plateforme
terrain principale ; la version Web permet aussi d'explorer, préparer et analyser un parcours.

La version 5.91.2 rend la trace immédiatement lisible : couleur unique réglable (magenta par défaut)
avec casing contrasté, coloration solaire de la trace devenue optionnelle, et double voie avec
chevrons pour les allers-retours. Elle fiabilise l'analyse solaire du parcours (relief préchargé,
ombres inconnues signalées, raycast borné), affine le profil (pente en bandes façon Openrunner,
cadrage caméra, informations sur une ligne) et conserve les surfaces unifiées de 5.90 : commandes
cartographiques,
feuilles, dialogues, Réglages, Bibliothèque, Sortie, guidage, météo, analyse solaire et Timeline.
La prise en main reste une visite de deux étapes sur la vraie carte, complétée par des aides
contextuelles pour Préparer, REC et les fonctions Pro. La version conserve les fonctions livrées
depuis 5.83 : itinéraires préparés,
guidage Android, vérification avant départ, corridors hors ligne, tableau de bord Sortie et
bibliothèque de traces pleine fidélité. Elle stabilise également le suivi 3D, le mode 2D, les
transitions de tuiles, le cache et l'arrêt d'un REC. La carte 2D affiche désormais la couleur sans
attendre le relief, puis réutilise cette texture lors du passage en 3D afin de réduire l'attente et
la pression mémoire sur les appareils modestes. En paysage, la rotation recharge maintenant les
tuiles nouvellement visibles sans nécessiter un geste ; les cinq commandes latérales partagent une
empreinte tactile commune.

## Ce que fait l'application aujourd'hui

- **Explorer le terrain** : carte 2D ou relief 3D, gestes tactiles, recherche de lieux et de
  sommets, points d'intérêt, sentiers, pentes, bâtiments, végétation et hydrologie selon les
  données disponibles.
- **Comprendre la lumière** : ombres solaires sur le relief, timeline sur 24 h, sonde solaire,
  profil d'élévation et analyse de l'exposition d'un parcours.
- **Préparer une sortie** : ajout explicite de points A/B, calcul ORS avec repli OSRM,
  distance, dénivelé, durée, effort, difficulté documentée et sauvegarde locale de
  l'itinéraire.
- **Retrouver ses parcours** : Bibliothèque unique pour les itinéraires « À suivre » et les
  activités « Enregistré ». Imports GPX et REC sont archivés localement avec leur géométrie
  complète.
- **Suivre une route** : progression, prochaine indication, distance restante, ETA, écart à la
  trace, alertes hors trace/arrivée, pause et reprise. Sur Android, un service natif maintient
  le guidage avec notification lorsque l'écran est éteint ou que l'interface est fermée.
- **Enregistrer un REC** : GPS Android dans un processus séparé, modes REC seul, guidage seul
  ou combiné, récupération après interruption et finalisation durable avant nettoyage des
  points natifs.
- **Préparer le hors-ligne** : zones manuelles, packs PMTiles et corridor associé à une route.
  L'application mesure la couverture locale réellement lisible et signale les résultats
  partiels ; elle ne promet pas une couverture hors ligne en dehors des données téléchargées.
- **Consulter les conditions et outils terrain** : météo Open-Meteo, particules pluie/neige,
  boussole, inclinomètre Pro, profil topographique et fiche SOS.

La liste détaillée, les limites et les preuves dans le code sont dans
[docs/FEATURES.md](docs/FEATURES.md).

## Android et Web

| Capacité | Android | Web |
| :--- | :---: | :---: |
| Exploration 2D/3D, solaire, météo, préparation et bibliothèque locale | Oui | Oui |
| Import GPX et stockage local des parcours | Oui | Oui |
| REC et guidage avec l'application visible | Oui | Selon les garanties du navigateur |
| REC/guidage écran éteint, notification et reprise native | Oui | Non |
| Export GPX | Téléchargements Android | Téléchargement navigateur |

Aucun compte n'est requis. Le compte optionnel et la synchronisation PC–Android sont planifiés
pour une version ultérieure et sont désactivés dans la version actuelle.

## Free et Pro

| Gratuit | Pro |
| :--- | :--- |
| Données cartographiques nettes jusqu'au détail 14 ; zoom plus proche signalé « HD Pro » | Données jusqu'au détail 18 et satellite |
| Solaire pour le jour courant | Calendrier solaire complet |
| Toutes les routes et traces locales, une affichée à la fois | Superposition jusqu'à 10 calques |
| REC, nom, résumé et guidage essentiel | Export GPX et analyses avancées disponibles |
| Une zone hors ligne et un corridor remplaçable de 1 km | Zones/corridors multiples et largeurs 0,5/1/2 km |
| Outils de sécurité essentiels | Météo détaillée et inclinomètre |

La matrice contractuelle complète est maintenue dans
[docs/MONETIZATION.md](docs/MONETIZATION.md). Les droits Pro et les flags de déploiement sont
deux mécanismes distincts.

## Cartographie et couverture

SunTrail sélectionne ses sources selon la position : swisstopo (CH), IGN (FR), basemap.at
(AT), BKG (DE), IGN España (ES), Kartverket (NO), avec OpenTopoMap/MapTiler/OSM en repli.
La précision, le niveau de détail et la disponibilité des bâtiments, sentiers ou données
satellite varient donc selon le pays, la source, la connexion et les données téléchargées.

Le catalogue embarqué contient actuellement les packs Suisse HD, Alpes françaises HD et
Autriche HD. Un catalogue distant peut compléter ou remplacer cette liste.

## Architecture

- Three.js 0.184 et WebGL pour le rendu cartographique
- TypeScript 6 en mode strict, Vite 8 et PWA Workbox
- Capacitor 8 et service Android Java/Room pour REC et guidage natifs
- IndexedDB pour les itinéraires, traces et manifestes de corridors
- CacheStorage et OPFS/PMTiles pour les données cartographiques locales
- RevenueCat pour les droits Pro
- Vitest et Playwright pour les tests

Le dépôt est multi-page : `index.html` est la vitrine, `app.html` l'application, et les pages
de connexion/achat restent présentes comme infrastructure désactivée tant que le compte et la
liaison Web ne sont pas remis en service.

## Installation locale

Prérequis : Node.js compatible avec les dépendances verrouillées dans `package-lock.json`.

```bash
npm ci
Copy-Item .env.example .env
npm run dev
```

`VITE_MAPTILER_KEY` améliore la couverture cartographique. Les clés RevenueCat sont nécessaires
pour tester les achats ; les variables Supabase ne concernent que l'infrastructure de compte
actuellement désactivée.

Commandes principales :

```bash
npm run check            # TypeScript, format et lint
npm test                 # tests unitaires et d'intégration
npm run test:e2e:smoke   # parcours Chromium essentiels
npm run build            # build Web
npm run cap:sync         # build Capacitor, contrôle des assets et sync Android
```

`npm run deploy` prépare et synchronise les assets Android ; cette commande ne publie rien sur
Google Play. Le workflow de version et de publication est décrit dans
[docs/RELEASE.md](docs/RELEASE.md).

## Documentation

L'index des documents actifs, des spécifications de version et des archives se trouve dans
[docs/README.md](docs/README.md). Pour contribuer, commencer par [CLAUDE.md](CLAUDE.md), qui
contient les règles de travail et l'état de release.

## Licence

Le code est distribué sous licence MIT avec Commons Clause : lecture, étude, modification et
distribution non commerciale sont permises ; la vente du logiciel ou d'un service dont la valeur
provient substantiellement de SunTrail ne l'est pas. Voir [LICENSE](LICENSE).
