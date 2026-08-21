# SunTrail 3D — Stratégie de Monétisation (v5.86.2)

> Objectif : Offrir une valeur alpine gratuite indispensable (sécurité) tout en incitant à l'abonnement Pro pour l'analyse et le confort.

---

## 1. Modèle Freemium (v5.57.0 — Hybride)

SunTrail utilise un modèle **Freemium avec abonnement**. La sécurité est offerte à tous, l'expertise est réservée aux abonnés Pro.

**Passage au Trial Natif (v5.53.7)**
*   **Transition** : Suppression des trials locaux. Utilisation exclusive des essais gratuits natifs RevenueCat/Stores (7 jours avec CB).

### 📊 Comparaison Free / Pro (Gate Logic)

| Domaine | Version GRATUITE (Randonneur) | Version PRO (Alpiniste+) | Gate Technique |
|---------|------------------------------|--------------------------|----------------|
| **Rendu Terrain** | LOD 14 (1:50k) | **LOD 18 (1:5k)** | `scene.ts` |
| **Enregistrement GPS**| **Illimité, nom personnalisé, stats et résumé essentiels** | **Identique + export fichier GPX** | `recordingService.ts` |
| **Parcours actifs sur la carte** | 1 parcours de Bibliothèque affiché à la fois | **« Ajouter à la carte », jusqu'à 10 calques** | `TrackSheet.ts` |
| **Bibliothèque locale préparée** | **Illimitée selon stockage appareil** | **Illimitée** | `RouteRepository` (v5.83) |
| **Export fichier GPX** | Bloqué avant Blob et écriture | **Documents / téléchargement** | `recordingService.ts` |
| **Guidage essentiel** | Indication, distance, écart, restant, ETA et alertes sécurité | **Identique** | `GuidanceForegroundService` |
| **Solaire** | Jour actuel (24h) | **Calendrier complet** | `TimelineComponent.ts` |
| **Cartographie** | SwissTopo / IGN / basemap.at / BKG / IGN España / Kartverket / OSM | **Satellite HD** | `terrain.ts` |
| **Mode Hors-ligne** | 1 zone gratuite (Sélection visuelle) | **Zones illimitées** | `ZoneSelector.ts` |
| **Corridor de la route active** | **1 corridor remplaçable, largeur 1 km** | **Corridors multiples, 0,5/1/2 km** | prévu v5.86 |
| **Synchronisation cloud** | 5 routes choisies en écriture | **Illimitée** | prévu v6.0 |
| **Inclinomètre** | — | **Numérique (° / %)** | `InclinometerWidget.ts`|
| **Alertes Sécurité** | **Toutes (Avalanche, etc.)** | **Toutes** | (FREE) |
| **Analyse Trail** | REC : durée réelle, distance, allure, D+, altitude, D−, GPS | **Analyses avancées lorsqu'elles existent** | `outingDashboard.ts` |

> v5.83.0 ne modifie aucun prix. Sauvegarder, rouvrir, dupliquer, mettre en favori et supprimer
> une route locale reste disponible en Free comme en Pro. Dans l'interface grand public, les plafonds
> techniques sont présentés comme des niveaux de détail cartographique ; les valeurs LOD
> restent documentées ici et dans le Laboratoire développeur. Le mode Planifier, l'inversion,
> l'effacement et le parcours débutant restent gratuits.

---

## 2. Tarification & Produits (RevenueCat)

- **Abonnement Annuel** : **€29.99/an** (inclut Trial 7 jours gratuits)
- **Abonnement Mensuel** : **€3.99/mois**
- **Achat Unique (Lifetime)** : **€99.99** (One-time purchase)

### Implémentation (`iapService.ts`)
- **Entitlement** : `SunTrail 3D Pro`
- **SDK** : `@revenuecat/purchases-capacitor`
- **Sync** : Le statut `state.isPro` est synchronisé au démarrage et via les listeners en temps réel.

---

## 3. Décisions Stratégiques Actées

- **D1 — REC Libre** : Sécurité d'abord. On ne coupe jamais une trace GPS. Le nom personnalisé,
  les statistiques essentielles en direct et le résumé simple de fin restent Free ; l'export GPX
  fichier est le levier Pro et doit être refusé avant toute écriture.
- **D2 — Sécurité Gratuite** : Toutes les alertes vitales (avalanche, météo, nuit) sont gratuites. C'est le contrat de confiance.
- **D3 — Verrou Solaire** : La simulation 24h démontre la puissance. Le calendrier (planification future) convertit.
- **D4 — Upsells Contextuels** : Déclenchés au moment de la friction (ex: toast zoom 14, verrou calendrier).
- **D5 — Offline Visuel** : La sélection visuelle de zone facilite l'usage hors-ligne. Limite à 1 zone pour les gratuits (v5.57.0). Le compteur est stocké en `localStorage` (soft limit client-side) et peut être réinitialisé lors d'une mise à jour de l'application ou d'un vidage de cache. L'objectif est l'incitation, pas le hard-gating.
- **D6 — Bibliothèque ≠ multi-affichage** : importer, enregistrer et rouvrir un parcours local est
  gratuit et non limité artificiellement. Free affiche un parcours de Bibliothèque à la fois ; Pro
  expose l'action explicite « Ajouter à la carte » jusqu'à dix calques. Aucun élément sauvegardé
  n'est verrouillé selon sa date, son origine ou sa position dans la liste.
- **D7 — Corridor sécurité séparé** : un utilisateur Free dispose d'un corridor actif de
  1 km, remplaçable après confirmation, en plus de sa zone manuelle. Pro conserve plusieurs
  corridors et choisit la largeur. Aucun téléchargement automatique sur réseau mobile.
- **D8 — Downgrade cloud sans suppression** : après passage Pro→Free, aucune route n'est
  supprimée. L'utilisateur choisit jusqu'à cinq routes synchronisées en écriture ; les autres
  restent lisibles/téléchargeables et les modifications locales restent locales jusqu'à libération
  d'un slot ou retour Pro.
- **D9 — Identité RevenueCat** : Android doit appeler `Purchases.logIn` depuis l'identité
  anonyme et vérifier le `CustomerInfo` après fusion. Le projet RevenueCat doit utiliser le
  comportement de transfert adapté aux comptes optionnels. Le web doit disposer d'un flux de
  liaison/restauration testé ; recréer le SDK avec un nouvel ID n'est pas considéré comme une fusion.
- **D10 — Pas d'upsell permanent en activité** : Sortie n'affiche aucune bannière Pro permanente
  pendant REC ou Guidance. Les propositions restent contextuelles et liées à une action réellement
  verrouillée : export fichier, « Ajouter à la carte » ou analyse avancée disponible.

### Frontière Sortie / Bibliothèque (v5.86.2)

- **Sortie** ne montre que la route actuellement consultée/suivie, Guidance, REC et le résumé
  temporaire de fin. Elle ne contient ni import, ni catalogue, ni historique.
- **Bibliothèque** présente un seul catalogue « Mes parcours ». Les itinéraires importés ou créés
  portent l'état « À suivre » ; les REC portent « Enregistré ». GPX, création SunTrail et REC sont
  des origines secondaires, jamais des catégories ni des gates.
- Les cinq activités historiques à géométrie simplifiée restent une limite technique commune. Leur
  action « Refaire » crée une route explicitement approximative ; elle ne constitue ni une archive
  pleine fidélité ni un avantage Pro.
- Les routes préparées locales restent illimitées en Free et Pro. Le futur `TrackRepository` et sa
  migration sont explicitement reportés à v5.87.

---

## 4. Analyse Concurrentielle (Benchmark 2026)

| App | Prix Annuel | Point Fort | Point Faible (vs SunTrail) |
|-----|-------------|------------|----------------------------|
| **Iphigénie** | €29.99 | Cartes IGN 25k | Pas de 3D, pas de solaire |
| **Outdooractive Pro**| €29.99 | Rendu 3D photo | Pas de simulation solaire |
| **AllTrails Plus** | $35.99 | Communauté | 3D limitée, pas de solaire |
| **Komoot Premium** | €59.99 | Guidage vocal | Prix élevé, pas de 3D |

**Positionnement** : SunTrail est la seule app combinant **3D Haute Performance + Données Officielles + Simulation Solaire** au prix standard de marché de €29.99.
