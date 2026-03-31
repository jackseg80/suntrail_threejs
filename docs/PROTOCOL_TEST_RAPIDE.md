# SunTrail 3D — Protocole de Test Rapide
**Récompense : 3 mois d'abonnement Pro offerts**
**Durée estimée : 20-30 minutes**

---

Merci de participer aux tests de SunTrail 3D ! Ce protocole rapide couvre les fonctionnalités essentielles de l'application. Il suffit de suivre les étapes dans l'ordre et de noter ce qui fonctionne ou non.

---

## 1. Installation & Premier lancement

- [ ] Installe l'application depuis le lien fourni
- [ ] Lance l'application pour la première fois
- [ ] Lis et accepte les conditions d'utilisation
- [ ] Parcours le tutoriel de démarrage (les 6 slides) — ou appuie sur "Passer" si tu préfères

**À noter :** le tutoriel était-il clair ? Oui / Non / Partiellement

> ℹ️ **Temps de chargement de la carte :** Au premier lancement (cache vide), la carte peut mettre **10 à 60 secondes** à s'afficher complètement selon ta connexion. Un indicateur de chargement (barre en haut de l'écran) est visible pendant ce temps — c'est normal. Les ouvertures suivantes sont quasi-instantanées. Plus tu es zoomé sur une zone précise, plus il y a de tuiles à charger.

---

## 2. Navigation 3D

Essaie chacun de ces gestes sur la carte :

- [ ] **Déplacer** la carte — glisse avec 1 doigt
- [ ] **Zoomer / Dézoomer** — pince avec 2 doigts
- [ ] **Rotation** — place 2 doigts et fais-les tourner
- [ ] **Incliner la vue** — pose 2 doigts côte à côte (horizontalement) et glisse vers le haut ou le bas
- [ ] **Double tap** sur un sommet ou un point de la carte

**À noter :** les gestes étaient-ils fluides ? Y a-t-il eu des bugs ou des blocages ?

---

## 3. Boutons de contrôle (côté droit)

- [ ] **Boussole** (en haut) — appuie dessus pour réorienter vers le Nord
- [ ] **Couches** — appuie pour changer le type de carte, essaie au moins 2 styles différents
- [ ] **2D / 3D** — bascule entre la vue plate et le relief 3D *(voir note ci-dessous)*
- [ ] **GPS** — appuie pour centrer la carte sur ta position

> ℹ️ **À propos du mode 2D / 3D :**
> Le relief 3D n'est disponible que lorsque tu es **suffisamment zoomé** (vue régionale ou locale — par exemple une vallée ou un massif). À faible zoom (vue de la Suisse entière), le bouton est grisé et la carte est automatiquement en 2D car les données d'élévation détaillées ne sont pas encore chargées.
>
> 💡 **Conseil d'usage :** Le mode 3D est idéal pour **visualiser le relief, analyser les ombres et vérifier les pentes** avant une sortie. En randonnée active, il est recommandé de passer en **mode 2D** : la carte se lit mieux d'un coup d'œil et la batterie dure bien plus longtemps.

**À noter :** les boutons étaient-ils bien visibles ? Compréhensibles sans explication ?

---

## 4. Timeline solaire

- [ ] Appuie sur le bouton **☀️ Timeline** en bas de l'écran
- [ ] Glisse le curseur d'heure pour voir évoluer les ombres sur le terrain
- [ ] Ferme la timeline

**À noter :** la simulation était-elle réaliste et fluide ?

---

## 5. Bouton SOS

- [ ] Repère le bouton **🆘** en haut à droite
- [ ] Appuie dessus
- [ ] Vérifie que tes coordonnées GPS s'affichent dans le panneau
- [ ] Ferme le panneau sans appeler (c'est juste un test !)

**À noter :** le panneau s'est-il ouvert rapidement ? Les coordonnées s'affichaient-elles ?

---

## 6. Test d'achat (simulé)

> ℹ️ En phase de test fermé, les achats sont **gratuits et fictifs** — Google Play simule la transaction en quelques secondes, aucune carte bancaire n'est débitée.

L'écran d'achat ("Passer à Pro ✨") s'ouvre automatiquement quand tu touches une fonctionnalité réservée aux abonnés. Voici comment y accéder :

- [ ] Appuie sur le bouton **Couches** (🗺️, côté droit de l'écran)
- [ ] Repère la tuile **"Satellite"** (avec un badge Pro) et appuie dessus → la feuille "Passer à Pro ✨" s'ouvre
- [ ] Vérifie que les **3 plans** s'affichent avec leurs prix (mensuel, annuel, à vie)
- [ ] Lance un achat (le plan **annuel** est mis en avant avec 7 jours gratuits)
- [ ] Attends quelques secondes que la transaction se confirme via Google Play
- [ ] Vérifie qu'un **message de confirmation** apparaît

**À noter :** le processus d'achat était-il clair ? Un message de succès s'est-il affiché ?

---

## 7. Performance & Batterie

Navigue librement pendant 5 minutes — zoom, dézoom, change de région.

- [ ] L'application était-elle fluide (pas de saccades importantes) ?
- [ ] Y a-t-il eu des plantages ou blocages ?
- [ ] La carte se chargeait-elle correctement ?
- [ ] Note le niveau de batterie **au début** et **à la fin** des 5 min, en mode 3D actif : ____% → ____%

> ℹ️ **Conso batterie attendue :** Le mode 3D avec ombres sollicite davantage le GPU. Sur un smartphone récent, attends-toi à ~10-15%/heure en navigation active écran allumé. En mode 2D, la consommation est bien réduite.

---

## 8. Rapport final

Réponds aux questions suivantes dans le formulaire de retour (lien fourni séparément) :

1. **Note globale** : /5
2. **3 choses qui fonctionnent bien**
3. **3 problèmes rencontrés ou améliorations souhaitées**
4. **Ton appareil** : modèle + version Android
5. **Remarques libres**

---

## 9. Récupération de ta récompense

> ⚠️ **À faire APRÈS le déploiement en production** (tu recevras un message)

Une fois l'application disponible publiquement sur le Play Store :

1. Installe/mets à jour la version production
2. Ouvre l'application
3. Va dans **Réglages → Avancés**
4. Copie ton **ID Testeur** (champ en bas de page)
5. Envoie-le par message — ton accès **Pro 3 mois** sera activé sous 24h

---

## 🗺️ Ce qui arrive ensuite — Roadmap

SunTrail est en développement actif. En tant que testeur de la première heure, voici ce que tu verras arriver :

### Bientôt (v5.17 – v5.18)
- 🔍 **Recherche de sommets** — trouver n'importe quel point par nom, zoom automatique
- 🏔️ **Visibilité 360°** — quels sommets peut-on voir depuis ta position exacte ?
- 🌍 **Autriche + nord de l'Italie** — mêmes données haute qualité qu'en CH/FR
- 📸 **Mode Photo Pro** — capture sans UI + watermark GPS/altitude

### Version 6.0 — Connexion aux outils que tu utilises déjà
- 🚵 **Strava** — import automatique de toutes tes activités
- 🧭 **Komoot** — synchronise tes tours planifiés
- ⌚ **Garmin Connect / Suunto / Polar** — données GPS, fréquence cardiaque, cadence
- 📂 **Format FIT natif** — les fichiers `.fit` de ta montre Garmin, directement dans SunTrail

### Version 6.x — Analyse performance & AR
- ❤️ **Overlay fréquence cardiaque** — colorise ton tracé par zone cardiaque (Z1–Z5)
- ⛰️ **Corrélation terrain/effort** — croise la pente, l'altitude et tes données physio
- 📊 **Dashboard post-effort** — VAM, dénivelé par bpm, zones d'effort par segment
- 📷 **Réalité augmentée** — pointe ton téléphone vers un sommet pour voir son nom

*Tes retours de testeur influencent l'ordre de ces priorités. Merci pour ton temps !*

---

*Merci pour ton aide ! Chaque retour compte pour améliorer l'expérience de tous les randonneurs.*
