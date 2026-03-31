# SunTrail 3D — Protocole de Test Complet
**Récompense : 1 an d'abonnement Pro offert**
**Durée estimée : 1h30 – 2h (en plusieurs sessions si besoin)**

---

Merci pour ton engagement dans les tests de SunTrail 3D ! Ce protocole couvre l'ensemble des fonctionnalités de l'application en détail. Plus tes retours sont précis, plus ils nous aident à livrer une expérience parfaite à des milliers de randonneurs.

> **Conseil** : fais les tests en extérieur ou dans un endroit avec une bonne connexion. Le GPS et le chargement des cartes fonctionnent mieux ainsi.

---

## 📋 Comment aborder ce protocole

**Tu n'as pas à tout tester.** Ce document est exhaustif par design — il liste toutes les fonctionnalités de l'application. Tu n'es pas obligé de le faire d'une traite ni de cocher chaque case.

Fais ce que tu peux, quand tu peux, en plusieurs sessions si besoin.

### ✅ Minimum requis pour recevoir l'abonnement annuel Pro

Pour valider ta récompense, tu dois avoir testé au minimum **ces 6 parties** et soumis un retour pour chacune :

| # | Partie | Durée ~|
|---|--------|--------|
| Partie 1 | Installation & premier lancement | 10 min |
| Partie 2 | Navigation & gestes (pan, zoom, rotation, inclinaison) | 10 min |
| Partie 5 | Import d'un tracé GPX | 10 min |
| Partie 6 | Timeline solaire | 5 min |
| Partie 9 | Mode testeur Pro (activation + vérification des features Pro) | 10 min |
| Partie 12 | Test d'achat simulé (transaction Google Play fictive) | 5 min |

**Total minimum : ~50 minutes.** Le reste est un bonus — chaque section supplémentaire testée t'aide directement à façonner les prochaines versions.

> 💡 Si tu es limité en temps, commence par le **Protocole de Test Rapide** (20-30 min) — il couvre l'essentiel et donne droit à 3 mois Pro. Le présent protocole donne accès à **1 an Pro** en échange d'un retour plus approfondi.

---

## Partie 1 — Installation & Onboarding (10 min)

- [ ] Installe l'application depuis le lien fourni
- [ ] Lance l'application pour la première fois
- [ ] Lis attentivement les **conditions d'utilisation** — les informations de sécurité alpine te semblent-elles claires et utiles ?
- [ ] Parcours le **tutoriel complet** (6 slides) sans appuyer sur "Passer"
  - Les gestes expliqués étaient-ils clairs ?
  - Les boutons FAB expliqués dans la slide 3 correspondent-ils à ce que tu vois à l'écran ?
  - Le tutoriel était-il trop long / trop court / bien dosé ?
- [ ] Ferme l'app, rouvre-la → le tutoriel ne doit PAS réapparaître
- [ ] Va dans **Réglages → bas de page** → appuie sur **"Aide & Tutoriel"** → le tutoriel s'affiche à nouveau

> ℹ️ **Temps de chargement de la carte :** Au premier lancement (cache vide), la carte peut mettre **10 à 60 secondes** à s'afficher entièrement. Un indicateur de chargement (barre shimmer en haut de l'écran) est visible pendant ce temps — c'est attendu. Les sessions suivantes sont quasi-instantanées grâce au cache local. Plus le niveau de zoom est élevé (vue détaillée d'une vallée vs vue nationale), plus il y a de tuiles haute résolution à charger.

- [ ] Le chargement initial a-t-il duré moins de 15 secondes (WiFi) ou moins de 30 secondes (4G) ?
- [ ] Y avait-il un indicateur visuel de chargement ?

---

## Partie 2 — Navigation & Gestes (15 min)

Explore une zone montagneuse (Alpes suisses chargées par défaut).

- [ ] **1 doigt** : déplace la carte dans toutes les directions
- [ ] **Pinch** : zoom avant (jusque LOD 14) et zoom arrière (vue Suisse entière)
- [ ] **2 doigts rotation** : fais pivoter la carte à 45°, 90°, 180°
- [ ] **Inclinaison** : 2 doigts côte à côte + glisse vers le haut → vue rasante ; vers le bas → vue zénithale
- [ ] **Boussole** : incline la vue, puis appuie sur la boussole → la carte doit se réorienter vers le Nord
- [ ] **Double tap** sur un sommet → vérifie que l'altitude s'affiche correctement
- [ ] **Comparaison altitude** : note l'altitude affichée pour un sommet connu (ex: Mont Blanc ~4808m). Est-elle cohérente ?

**Test de fluidité :**
- [ ] Zoom rapide répété 10× → pas de crash ni de freeze
- [ ] Pan rapide sur toute la carte → les tuiles se chargent-elles correctement ?

---

## Partie 3 — Boutons de contrôle FAB (10 min)

- [ ] **Couches (🗺️)** : teste chaque style de carte disponible (Topo, Satellite si Pro, etc.)
  - Laquelle tu préfères pour la randonnée ?
  - Y a-t-il des styles qui ne chargent pas ?
- [ ] **Sentiers de randonnée** : dans le menu Couches, active le toggle **"Sentiers"**
  - Zoome à LOD 11+ (vue vallée) → les sentiers balisés apparaissent-ils sur la carte ?
  - Les tracés sont-ils nets et bien positionnés par rapport au terrain ?
  - Désactive le toggle → sentiers disparaissent
- [ ] **Pentes dangereuses >30°** : active le toggle **"Pentes"**
  - Zoome sur une zone montagneuse → les zones en pente apparaissent-elles colorées ?
  - Les couleurs correspondent-elles à la réalité du terrain (zones raides = rouge/orange) ?
  - Désactive le toggle → overlay de pente disparaît
- [ ] **Toggle 2D/3D** : bascule plusieurs fois entre les deux modes
  - Le relief 3D apparaît-il correctement ?
  - Le switch est-il instantané ou lent ?

> ℹ️ **À propos du mode 2D / 3D :**
> Le relief 3D n'est disponible que lorsque tu es **suffisamment zoomé** (vue régionale ou locale). À faible zoom (vue de la Suisse entière), le bouton est automatiquement grisé car les tuiles sont plates par nature.
>
> 💡 **Conseil terrain :** Le mode 3D est conçu pour **préparer une randonnée** — visualiser le relief, les ombres portées à telle heure, repérer les pentes. En **randonnée active**, il vaut mieux rester en **2D** : la carte est plus lisible d'un coup d'œil et la batterie tient plus longtemps. Le mode 3D consomme ~2-3× plus de batterie que le mode 2D en navigation active.
- [ ] **GPS (📍)** :
  - Autorise la localisation si demandé
  - La carte se centre-t-elle sur ta position ?
  - Ta position est-elle précise (à ~10-50m près en extérieur) ?

---

## Partie 4 — Presets de performance (15 min)

Va dans **Réglages → Profils de performance** et teste chaque profil :

- [ ] **Éco** : la carte est-elle en 2D ? Les animations sont-elles réduites ?
- [ ] **Équilibré** : qualité visuelle correcte ? Fluidité acceptable ?
- [ ] **Performance** (ou Ultra si disponible) : meilleur détail visible ?
- [ ] Reviens sur le profil **auto-détecté** à la fin

**Ton appareil :** quel profil a été sélectionné automatiquement au démarrage ?

---

## Partie 5 — Import de tracé GPX (15 min)

> Si tu n'as pas de fichier GPX, tu peux en télécharger un sur [wikiloc.com](https://fr.wikiloc.com) ou [openrunner.com](https://www.openrunner.com) — choisis une randonnée en Suisse ou en Savoie.

- [ ] Va dans **Parcours → Import GPX**
- [ ] Importe un fichier GPX de randonnée
- [ ] Le tracé s'affiche-t-il en 3D sur le terrain ?
- [ ] Appuie sur le tracé → le profil d'élévation s'affiche-t-il en bas ?
- [ ] La position du tracé sur la carte est-elle correcte (pas décalée) ?
- [ ] Zoome sur une section du tracé au LOD 13-14 → le tracé suit-il bien le relief ?

---

## Partie 6 — Timeline solaire (10 min)

- [ ] Ouvre la **Timeline** (bouton bas de l'écran)
- [ ] Glisse le curseur vers une heure matinale (ex: 7h) → les ombres changent-elles ?
- [ ] Glisse vers midi → soleil au-dessus des crêtes
- [ ] Glisse vers le soir (ex: 19h) → ombres longues
- [ ] Zoome sur une vallée et observe comment le soleil l'éclaire selon l'heure
- [ ] La simulation te semble-t-elle réaliste par rapport à ce que tu connais du terrain ?

**Sélecteur de date (calendrier solaire) :**
- [ ] Le champ de date est-il légèrement grisé (opacity réduite) en version gratuite ?
- [ ] Essaie de changer la date pour un autre jour → un message "Passer à Pro" apparaît-il et la date revient-elle à aujourd'hui ?
- [ ] *(Pro — après Partie 9)* : change la date (ex: solstice d'été 21 juin) → les ombres changent-elles radicalement ?

> ℹ️ **Gate Pro — Calendrier solaire :** En version gratuite, la simulation est limitée à la **journée actuelle**. Le sélecteur de date est visuellement grisé et toute tentative de changer la date ouvre la feuille d'upgrade. La version Pro débloque l'accès à toutes les dates passées et futures — utile pour planifier une sortie à une date précise ou analyser l'ensoleillement saisonnier.

---

## Partie 7 — Bulletin météo (10 min)

> ℹ️ La météo se charge automatiquement lorsque tu navigues vers une zone. Si rien ne s'affiche, déplace la carte sur une ville ou un sommet puis attends quelques secondes.

**Accès :** appuie sur la **pastille météo** en haut de l'écran (température + icône), ou ouvre l'onglet météo depuis la TopBar.

**Version gratuite :**
- [ ] Le panneau météo s'ouvre-t-il depuis le haut (pas depuis le bas) ?
- [ ] Les 4 données de base sont-elles affichées : **température**, **ressenti**, **vent**, **humidité** ?
- [ ] Le défilement horizontal **"12 prochaines heures"** fonctionne-t-il ?
- [ ] Les jours 2 et 3 apparaissent-ils grisés avec un badge **PRO** ?
- [ ] Une bannière d'upsell "Météo 3 jours" est-elle visible en bas ?

**Version Pro** *(active le mode testeur d'abord — Partie 8)* :
- [ ] L'affichage commence-t-il bien depuis le **haut du panneau** ?
- [ ] Les données avancées sont-elles affichées : **point de rosée**, **UV** (colorisé), **nébulosité**, **vitesse de vent + flèche direction**, **rafales**, **visibilité**, **limite pluie/neige**, **prob. précipitations** ?
- [ ] Le **graphique de température 24h** est-il visible avec les barres de précipitation ?
- [ ] La **prévision 3 jours** complète s'affiche-t-elle ?
- [ ] Le bloc **"Alerte montagne"** apparaît-il avec la limite pluie/neige et l'indice de confort ?
- [ ] Le bouton **"Copier le rapport"** copie-t-il les données dans le presse-papier ?

**À noter :** l'affichage démarrait-il bien depuis le haut à chaque ouverture ? Y a-t-il eu des données manquantes ou incohérentes avec la météo réelle ?

---

## Partie 8 — Analyse solaire (10 min)

> ℹ️ L'analyse solaire avancée nécessite d'abord de **cliquer sur un point de la carte** pour afficher les coordonnées, puis de tapper le bouton **☀ Solaire**.

**Préparation :**
- [ ] Zoom sur une vallée alpine (LOD 12-14)
- [ ] **Double-tape** sur un point de la carte → la pastille de coordonnées apparaît en bas avec latitude, longitude et altitude

**Analyse solaire de base (gratuite) :**
- [ ] Appuie sur le bouton **"☀ Solaire"** dans la pastille de coordonnées
- [ ] Le panneau d'analyse s'ouvre-t-il depuis le **haut** ?
- [ ] Les informations suivantes sont-elles affichées : **durée du jour**, **heure du premier rayon**, **barre chronologique** (48 segments nuit/ombre/soleil) ?

**Analyse solaire avancée (Pro)** *(active le mode testeur — Partie 9)* :
- [ ] Le panneau commence-t-il bien depuis le **haut** ?
- [ ] **Bloc 1 — Données du jour** : lever/coucher, midi solaire, heures dorées matin/soir, durée totale d'ensoleillement
- [ ] **Bloc 2 — Temps réel** : azimut (°) + flèche de boussole SVG rotative, élévation (°) + barre de progression, phase de lune (emoji + %)
- [ ] **Bloc 3 — Graphique élévation 24h** : courbe de l'arc solaire, zones bleues/rouges (ombre terrain), ligne pointillée heure actuelle
- [ ] **Bloc 4 — Barre chronologique** : segments colorés correspondant aux blocs 1 et 3
- [ ] **Bloc 5 — Rapport** : bouton "Copier le rapport" → données complètes dans le presse-papier
- [ ] Change l'heure dans la **Timeline** → la boussole SVG et l'élévation se mettent-elles à jour en temps réel ?

**À noter :** les deux panneaux (météo et solaire avancée) démarraient-ils bien depuis le haut à chaque ouverture ?

---

## Partie 9 — Mode testeur Pro (10 min)

> Cette fonctionnalité permet de tester les features Pro sans payer. Le mode est actif en RAM uniquement — il se réinitialise au redémarrage de l'app.

- [ ] Va dans **Réglages** (onglet navigation en bas)
- [ ] Fais défiler vers le bas jusqu'à voir la ligne dorée **"⚙️ PARAMÈTRES AVANCÉS"**
- [ ] **Appuie dessus** pour déplier la section (c'est un accordéon — fermé par défaut, rien n'est visible avant de tapper dessus)
- [ ] La section se déplie avec tous les réglages avancés : sliders, boutons cache, et en bas un bloc **"Sources de données & Légal"**
- [ ] Tout en bas de ce bloc, tu verras un texte grisé centré avec le numéro de version (ex: **`v5.16.7`**)
- [ ] Tape **7 fois rapidement** sur ce numéro de version (vibration discrète dès le 4e tap)
  → Au 7e tap : message "🔓 Mode testeur Pro activé (RAM — non persisté)" + le texte bleuit
- [ ] Vérifie que les fonctionnalités Pro se débloquent :
  - [ ] **LOD 18** : zoome au maximum → le zoom va-t-il plus loin qu'avant (détail extrême des bâtiments, sentiers, végétation) ?
  - [ ] **Couche Satellite** : disponible dans le menu Couches (🗺️) ?
  - [ ] **Inclinomètre** : zoom jusqu'au LOD 13 minimum → un widget `▲ XX° (XX%)` apparaît-il en bas à gauche de la carte ?
    - La couleur change-t-elle selon la pente (blanc < 30°, jaune ≥ 30°, orange ≥ 35°, rouge ≥ 40°) ?
    - Se met-il à jour quand tu déplaces la carte ?
  - [ ] **Analyse solaire Pro** : le bouton "☀ Solaire" ouvre-t-il les 5 blocs décrits en Partie 8 ?
  - [ ] **Météo Pro** : le panneau météo montre-t-il les données avancées (graphique, 3 jours, alertes) ?
  - [ ] **Importer un 2e tracé GPX** : possible sans message de blocage ?
- [ ] Retape 7 fois sur le numéro de version → "🔒 Mode testeur Pro désactivé"

---

## Partie 10 — Fonctionnalités de sécurité (5 min)

- [ ] Ouvre le panneau **🆘 SOS** (bouton haut-droite)
- [ ] Tes coordonnées GPS s'affichent-elles ? (latitude, longitude, altitude)
- [ ] Un bouton SMS est-il présent ? (si tu l'appuies, ça ouvre l'appli SMS sans envoyer réellement)
- [ ] Les informations de secours (numéro 112) sont-elles visibles ?

---

## Partie 11 — Réglages & Langue (10 min)

- [ ] Va dans **Réglages**
- [ ] Change la langue en **Deutsch** → l'interface bascule-t-elle entièrement ?
- [ ] Change en **English** → idem
- [ ] Reviens en **Français**
- [ ] Teste le slider **Exagération du relief** : monte-le à 3.0 → le relief est-il bien plus prononcé ?
- [ ] Remets-le à 2.0 (valeur par défaut)

---

## Partie 12 — Test d'achat (simulé) (5 min)

> ℹ️ En phase de test fermé, les achats sont **gratuits et fictifs**. Aucune carte bancaire n'est débitée.

La feuille d'achat ("Passer à Pro ✨") s'ouvre en touchant n'importe quelle fonctionnalité verrouillée. Il n'y a pas de bouton dédié dans les Réglages — c'est intentionnel (l'app ne fait pas de push commercial intrusif).

- [ ] Appuie sur le bouton **Couches** (🗺️) → tape sur la tuile **Satellite** (badge Pro) → la feuille "Passer à Pro ✨" s'ouvre
- [ ] Vérifie que les **3 plans** sont affichés avec leurs prix (mensuel, annuel, à vie)
- [ ] Vérifie que le plan annuel est mis en avant avec le badge **"⭐ 7 jours gratuits"**
- [ ] Lance l'achat **mensuel**
- [ ] **Un seul** message de confirmation apparaît-il ? (il ne doit PAS apparaître plusieurs fois)
- [ ] Le statut Pro s'active-t-il correctement ?

> 💡 D'autres points d'entrée à tester : changer la date dans la Timeline (calendrier solaire) ; essayer d'importer un 2e fichier GPX ; appuyer sur les prévisions météo jours 2 et 3.

---

## Partie 13 — Performance & Batterie (15 min)

Navigue librement pendant 15 minutes : change de zones, importe un GPX, active la timeline.

- [ ] L'application est-elle restée fluide tout au long ?
- [ ] Y a-t-il eu des saccades notables ? À quel moment ?
- [ ] Y a-t-il eu des plantages ? Si oui, décris ce que tu faisais
- [ ] Le téléphone a-t-il chauffé de manière inhabituelle ?

**Test batterie — navigation intensive 3D :**
- [ ] Niveau de batterie au début (mode 3D, écran allumé, navigation active) : ____%
- [ ] Niveau de batterie après 15 min : ____%
- [ ] Consommation calculée : ____% en 15 min (soit ~____% /heure)

**Test batterie — enregistrement GPS écran éteint :**
- [ ] Lance un enregistrement GPS (bouton REC dans l'onglet Parcours)
- [ ] Éteins l'écran (bouton power) — l'enregistrement doit continuer en arrière-plan
- [ ] Attends 10 min, rallume l'écran
- [ ] Le tracé GPS s'est-il bien enregistré sans interruption ? Oui / Non
- [ ] Batterie au départ du REC : ____% → après 10 min écran éteint : ____%

> ℹ️ **Valeurs de référence attendues :** Navigation 3D active ~10-15%/heure · Navigation 2D ~5-8%/heure · REC GPS écran éteint ~2-4%/heure. Des valeurs bien supérieures indiquent un problème de throttling ou de Deep Sleep.

**🔬 Optionnel — Stats de performance (power user)**

> Cette section est **facultative** et réservée aux utilisateurs à l'aise avec les outils techniques. Elle n'est pas nécessaire pour valider ta récompense.

Si tu veux fournir des données GPU/FPS détaillées pour aider à l'optimisation :

- [ ] Va dans **Réglages → ⚙️ Paramètres Avancés** → active le toggle **"Stats de performance (FPS)"**
  → Un panneau de monitoring apparaît en haut de l'écran avec FPS, VRAM, draw calls, triangles
- [ ] Clique sur le bouton **⏺** (enregistrer) dans le panneau
- [ ] Navigue pendant 5 minutes : 1 min navigation libre, 1 min immobile, 1 min import GPX, 1 min hydrologie active, 1 min écran verrouillé
- [ ] Clique sur **⏹** → les données sont copiées dans ton presse-papier
- [ ] Colle le JSON dans ta réponse ou envoie-le par message séparé

> ⚠️ Les stats de performance sont **désactivées par défaut** pour ne pas perturber l'expérience normale. Active-les uniquement pour ce test optionnel, puis désactive-les.

---

## Partie 14 — Téléchargement offline & test hors réseau (10 min)

> ℹ️ SunTrail peut fonctionner **entièrement sans réseau** une fois une zone téléchargée. Ce test vérifie que le téléchargement fonctionne et que les cartes restent accessibles hors-ligne.

**Préparation :**
- [ ] Navigue vers une zone que tu connais (vallée, massif) et zoome à un niveau détaillé (LOD 12-13)

**Téléchargement de la zone :**
- [ ] Appuie sur le bouton **réseau** (icône WiFi en haut à droite) → dans le panneau "Système & Données", cherche le bouton **"Télécharger Zone"**
- [ ] Appuie dessus → une barre de progression apparaît-elle ?
- [ ] Attends la fin du téléchargement (quelques secondes à quelques minutes selon la taille de la zone)
- [ ] Note combien de temps ça a pris : ____s

**Test hors réseau :**
- [ ] Active le **mode Avion** sur ton téléphone (coupes WiFi + données mobiles)
- [ ] Reviens dans SunTrail
- [ ] Navigate dans la zone téléchargée → les tuiles se chargent-elles depuis le cache ? Oui / Non
- [ ] Zoome et dézoome → pas de tuile noire ou manquante ?
- [ ] Va dans une zone **non téléchargée** → les tuiles doivent apparaître grisées ou manquantes (comportement normal)
- [ ] Réactive le réseau

> ℹ️ **À noter :** Le premier chargement de la carte (sans cache) peut prendre **10 à 60 secondes** selon la qualité du réseau et le niveau de zoom. À LOD 14 (détail maximum gratuit), une zone de 5×5 km représente environ 50-100 tuiles à charger. Les chargements suivants sont **quasi-instantanés** grâce au cache.

---

## Partie 15 — Rapport détaillé

À remplir dans le formulaire de retour (lien fourni séparément) :

### Informations appareil
- Modèle du téléphone :
- Version Android :
- Connexion pendant le test : WiFi / 4G / 5G

### Évaluation par fonctionnalité (1 = Mauvais · 5 = Excellent)
| Fonctionnalité | Note /5 | Commentaire |
|---|---|---|
| Navigation & gestes | | |
| Qualité des cartes | | |
| Timeline solaire | | |
| Import GPX | | |
| Boutons FAB | | |
| Tutoriel d'onboarding | | |
| Réglages | | |
| Performance générale | | |
| Design & lisibilité | | |

### Questions ouvertes
1. Qu'est-ce qui t'a le plus impressionné dans l'application ?
2. Qu'est-ce qui t'a le plus frustré ou semblé peu clair ?
3. Manque-t-il une fonctionnalité que tu utilises dans d'autres apps de rando ?
4. Recommanderais-tu SunTrail à un ami randonneur ? Pourquoi ?
5. Note globale : /5

---

## Récupération de ta récompense

> ⚠️ **À faire APRÈS le déploiement en production** (tu recevras un message)

Une fois l'application disponible publiquement sur le Play Store :

1. Installe/mets à jour la version production
2. Ouvre l'application
3. Va dans **Réglages → Avancés**
4. Copie ton **ID Testeur** (champ en bas de page)
5. Envoie-le par message — ton accès **Pro 1 AN** sera activé sous 24h

---

## 🗺️ Ce qui arrive ensuite — Roadmap

SunTrail est en développement actif. En tant que testeur de la première heure, tu verras ces fonctionnalités arriver dans les prochaines semaines et mois :

### Bientôt (v5.18+)
| Fonctionnalité | Description |
|---|---|
| 🏔️ Visibilité 360° | Quels sommets peut-on voir exactement depuis ta position ? |
| 🌍 Autriche + nord Italie | Mêmes données haute qualité qu'en CH/FR |
| 📸 Mode Photo Pro | Capture sans UI avec watermark GPS/altitude optionnel |

### Version 6.0 — Connexion aux outils que tu utilises déjà
| Fonctionnalité | Description |
|---|---|
| 🚵 **Strava** | Import automatique de toutes tes activités |
| 🧭 **Komoot** | Synchronise tes tours planifiés et réalisés |
| ⌚ **Garmin Connect / Suunto / Polar / Apple Health** | GPS, fréquence cardiaque, cadence, puissance |
| 📂 **Format FIT natif** | Les fichiers `.fit` de ta montre Garmin, directement dans SunTrail |
| 📡 **Alertes météo montagne** | Orages, vent fort, chute de visibilité sur ton itinéraire |

### Version 6.x — Analyse performance & AR
| Fonctionnalité | Description |
|---|---|
| ❤️ **Overlay fréquence cardiaque** | Colorise ton tracé par zone cardiaque (Z1–Z5) |
| ⛰️ **Corrélation terrain/effort** | Croise pente, altitude, vitesse et données physio |
| 📊 **Dashboard post-effort** | VAM, dénivelé/bpm, zones d'effort par segment, estimation Naismith |
| ⌚ **Analyse montre** | HR, SpO2, cadence, puissance depuis Garmin/Apple Watch/Polar |
| 📷 **Réalité augmentée** | Pointe ton téléphone vers un sommet → son nom en surimpression |
| 🏔️ **Occlusion topographique AR** | Les étiquettes passent derrière le relief réel en AR |

*Tes retours influencent directement l'ordre de ces priorités. Qu'est-ce qui te donnerait envie de rester ?*

---

*Ton retour détaillé est inestimable. Merci de consacrer autant de temps à améliorer SunTrail 3D — c'est grâce à des testeurs comme toi que l'app sera vraiment à la hauteur sur le terrain.*
