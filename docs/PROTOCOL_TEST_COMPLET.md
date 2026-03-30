# SunTrail 3D — Protocole de Test Complet
**Récompense : 1 an d'abonnement Pro offert**
**Durée estimée : 1h30 – 2h (en plusieurs sessions si besoin)**

---

Merci pour ton engagement dans les tests de SunTrail 3D ! Ce protocole couvre l'ensemble des fonctionnalités de l'application en détail. Plus tes retours sont précis, plus ils nous aident à livrer une expérience parfaite à des milliers de randonneurs.

> **Conseil** : fais les tests en extérieur ou dans un endroit avec une bonne connexion. Le GPS et le chargement des cartes fonctionnent mieux ainsi.

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
- [ ] **Toggle 2D/3D** : bascule plusieurs fois entre les deux modes
  - Le relief 3D apparaît-il correctement ?
  - Le switch est-il instantané ou lent ?
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
- [ ] Glisse vers une heure matinale (ex: 7h) → les ombres changent-elles ?
- [ ] Glisse vers midi → ciel au-dessus des crêtes
- [ ] Glisse vers le soir (ex: 19h) → ombres longues
- [ ] Zoome sur une vallée et observe comment le soleil l'éclaire selon l'heure
- [ ] La simulation te semble-t-elle réaliste par rapport à ce que tu connais du terrain ?

---

## Partie 7 — Mode testeur Pro (10 min)

> Cette fonctionnalité vous permet de tester les features Pro sans payer.

- [ ] Va dans **Réglages → Avancés**
- [ ] Trouve le numéro de version (ex: `v5.16.0`)
- [ ] Tape **7 fois rapidement** dessus → un message confirme l'activation du mode Pro
- [ ] Vérifie que les fonctionnalités Pro se débloquent :
  - [ ] **LOD 18** : peut-on zoomer plus que d'habitude ?
  - [ ] **Couche Satellite** : disponible dans les couches ?
  - [ ] **Inclinomètre** : un widget de pente apparaît-il en bas ?
  - [ ] **Importer un 2e tracé GPX** : possible ?
- [ ] Retape 7 fois → le mode Pro se désactive

---

## Partie 8 — Fonctionnalités de sécurité (5 min)

- [ ] Ouvre le panneau **🆘 SOS** (bouton haut-droite)
- [ ] Tes coordonnées GPS s'affichent-elles ? (latitude, longitude, altitude)
- [ ] Un bouton SMS est-il présent ? (si tu l'appuies, ça ouvre l'appli SMS sans envoyer réellement)
- [ ] Les informations de secours (numéro 112) sont-elles visibles ?

---

## Partie 9 — Réglages & Langue (10 min)

- [ ] Va dans **Réglages**
- [ ] Change la langue en **Deutsch** → l'interface bascule-t-elle entièrement ?
- [ ] Change en **English** → idem
- [ ] Reviens en **Français**
- [ ] Teste le slider **Exagération du relief** : monte-le à 3.0 → le relief est-il bien plus prononcé ?
- [ ] Remets-le à 2.0 (valeur par défaut)

---

## Partie 10 — Test d'achat (simulé) (5 min)

> ℹ️ En phase de test fermé, les achats sont **gratuits et fictifs**. Aucune carte bancaire n'est débitée.

- [ ] Ouvre l'**UpgradeSheet** (bouton "Passer à Pro" depuis les Réglages ou en touchant une feature verrouillée)
- [ ] Vérifie que les 3 plans sont affichés avec leurs prix (mensuel, annuel, à vie)
- [ ] Lance l'achat **mensuel**
- [ ] Un seul message de confirmation apparaît-il ? (il ne doit PAS apparaître 3 fois)
- [ ] Le statut Pro s'active-t-il correctement ?

---

## Partie 11 — Performance & Batterie (15 min)

Navigue librement pendant 15 minutes : change de zones, importe un GPX, active la timeline.

- [ ] L'application est-elle restée fluide tout au long ?
- [ ] Y a-t-il eu des saccades notables ? À quel moment ?
- [ ] Y a-t-il eu des plantages ? Si oui, décris ce que tu faisais
- [ ] Le téléphone a-t-il chauffé de manière inhabituelle ?
- [ ] Note la batterie au début et à la fin des 15 min : ____% → ____%

---

## Partie 12 — Rapport détaillé

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

*Ton retour détaillé est inestimable. Merci de consacrer autant de temps à améliorer SunTrail 3D — c'est grâce à des testeurs comme toi que l'app sera vraiment à la hauteur sur le terrain.*
