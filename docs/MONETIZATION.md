# SunTrail 3D — Stratégie Business & Monétisation

> ⚠️ **Document de réflexion stratégique — à finaliser avant Sprint 7 (publication Play Store)**
> Les décisions prises ici impactent directement l'architecture technique (IAP, clé API, paywall).

---

## 1. Contexte & Positionnement

### Ce que SunTrail est
- Outil **professionnel de randonnée alpine** — terrain 3D, GPX multi-tracés, simulation solaire
- Qualité de données officielle : SwissTopo, IGN France, MapTiler
- Marché cible : randonneurs exigeants, alpinistes, géographes amateurs — Suisse, France, Autriche, Allemagne
- Différenciateur clé : **3D véritable** (pas une 2D avec ombrage) + simulation solaire unique + offline-first

### Ce que SunTrail n'est pas
- Un réseau social de randonnée (≠ Komoot, Strava)
- Une app de navigation turn-by-turn (≠ OsmAnd, Maps.me)
- Un simple visualiseur GPX (≠ AllTrails, Wikiloc)

---

## 2. Le Problème Structurel : La Clé MapTiler

**Situation actuelle** : l'utilisateur doit fournir sa propre clé MapTiler pour accéder aux tuiles de qualité. Sans clé, fallback OSM (dégradé).

**Problème** : un randonneur lambda ne s'inscrit pas sur MapTiler. Cette friction tue la conversion.

### Options architecturales (décision bloquante)

| Option | Coût mensuel estimé | Expérience utilisateur | Complexité |
|--------|:------------------:|:---------------------:|:----------:|
| **A — Clé bundlée dans l'app** | ~$50-150/mois (1k DAU) | ✅ Zero friction | Faible — mais clé exposable |
| **B — Proxy serveur** | ~$20/mois serveur + tiles | ✅ Zero friction | Élevée — infra à maintenir |
| **C — Clé utilisateur obligatoire** | $0 | ❌ Friction maximale | Faible |
| **D — Clé bundlée tier gratuit, utilisateur pour Pro** | $20-50/mois | ✅ Bon compromis | Moyenne |

**Recommandation à valider** : Option D — clé bundlée avec quota limité (LOD ≤ 14, tuiles OSM/topo-v2 uniquement) pour le tier gratuit. Clé utilisateur débloque SwissTopo + LOD 18.

> MapTiler free tier : 100k tiles/mois. Un utilisateur casual consomme ~500-2000 tiles/session.
> → ~50-200 sessions gratuites/mois avant surcoût.

---

## 3. Analyse Concurrentielle

| App | Modèle | Prix | Forces | Faiblesses |
|-----|--------|------|--------|------------|
| **AllTrails** | Freemium | $35.99/an | Communauté massive, avis | Pas de 3D réel |
| **Komoot** | Par région | €3.99/région | Navigation turn-by-turn | Pas de 3D, pas de solaire |
| **Gaia GPS** | Subscription | $39.99/an | Hors-ligne complet, USA | UI datée, pas de 3D |
| **Swisstopo** | Gratuit | $0 | Données officielles CH | 2D uniquement, CH seulement |
| **CalTopo** | Freemium | $20/an | Pro rescue/ski patrol | Desktop-first, pas de 3D |
| **OsmAnd** | Freemium | $0-10 | Open source, offline | UI complexe, pas de 3D |
| **Google Earth** | Gratuit | $0 | 3D mondial | Pas de topo pro, pas GPX |

**Conclusion** : SunTrail occupe un espace unique (3D + données officielles + offline + solaire). Le prix de référence du marché est **€20-40/an** pour un outil Pro.

---

## 4. Modèles de Monétisation — Options

### 4.1 — Gratuit Total
- Pas de revenus.
- Viable si objectif = visibilité / porfolio / open-source.
- **Non recommandé** si coûts MapTiler à absorber.

### 4.2 — Application Payante (One-Shot)
- Prix : €4.99 — €9.99
- Avantage : simple, pas d'abonnement fatigue
- Inconvénient : revenu one-shot, pas de MRR
- Compatible avec : pas de clé bundlée (utilisateur se débrouille)
- **Viable pour un lancement test** avant d'itérer

### 4.3 — Freemium (Recommandé)
Tier gratuit solide pour l'acquisition, tier Pro pour le revenu.

**Tier Gratuit (Forever Free)**
- Cartes OSM + MapTiler topo-v2 (LOD ≤ 14)
- 1 tracé GPX simultané
- GPS basique (pas de REC illimité)
- Vue 2D par défaut
- Pas de simulation solaire
- Offline : zone basique uniquement

**Tier Pro (€2.99/mois ou €24.99/an)**
- SwissTopo + IGN France (tuiles officielles)
- LOD jusqu'à 18 (détail maximum)
- GPX multi-tracés illimités
- Enregistrement REC illimité + export GPX
- Simulation solaire complète
- Offline : zones illimitées + PMTiles
- Présets Performance & Ultra
- Pas de publicité

### 4.4 — Cartes Régionales (Modèle Komoot)
- App gratuite de base
- Pack "Alpes Suisses" : €4.99 (tuiles SwissTopo offline)
- Pack "Alpes Françaises" : €4.99 (tuiles IGN offline)
- Pack "Europe Alpine" : €14.99
- Avantage : achat unique, pas d'abonnement
- Inconvénient : complexe à implémenter (IAP par région)

### 4.5 — B2B / Licensing
- Licences pour guides de montagne, écoles d'alpinisme, SAC/CAS
- Prix : €50-200/an/professionnel
- Avantage : revenu stable, moins d'utilisateurs à gérer
- Inconvénient : cycle de vente long

---

## 5. Publicité

### AdMob / Google Ads
- **Fortement déconseillé** pour ce positionnement.
- Incompatible avec une image "outil professionnel / premium".
- Dégradation UX dans un contexte terrain (mains mouillées, soleil).
- Revenus typiques : €0.002-0.01 par impression → négligeable sans millions de DAU.

### Publicité native sponsorisée (si Free)
- Partenaire matériel (Garmin, Suunto) → bannière discrète dans l'écran de démarrage
- Acceptable uniquement si partenariat officiel + contenu pertinent
- À évaluer au cas par cas

**Décision recommandée : Zéro publicité intrusive.**

---

## 6. Partenariats Potentiels

### 6.1 MapTiler
- **Contact** : partnerships@maptiler.com
- **Objectif** : accord revendeur ou tarif développeur — réduction de coût tiles
- **Levier** : SunTrail est une vitrine de leur stack (promotion organique)
- **Bénéfice potentiel** : -50% sur les coûts tiles, badge "Powered by MapTiler"

### 6.2 Swisstopo / Office fédéral de topographie
- **Contact** : géodonnées@swisstopo.ch
- **Objectif** : accord de distribution officiel → crédibilité maximale en CH
- **Bénéfice** : logo officiel, potentiel subvention innovation Innosuisse

### 6.3 IGN France / Géoplateforme
- **Contact** : partenariats@ign.fr
- **Objectif** : accord similaire côté France

### 6.4 Club Alpin Suisse (SAC/CAS)
- **Contact** : info@sac-cas.ch
- **Objectif** : partenariat outil officiel pour membres → 150 000 membres
- **Modèle** : licence bulk à tarif préférentiel pour membres SAC

### 6.5 Club Alpin Français (CAF/FFCAM)
- **Contact** : contact@ffcam.fr
- ~380 000 membres — marché énorme

### 6.6 Brands outdoor
- Mammut, Salomon, Arc'teryx, Millet, La Sportiva
- Modèle : co-branding sur écran de démarrage, ou contenu sponsorisé (refuges partenaires)
- À approcher après 10k+ téléchargements (levier de négociation)

### 6.7 Intégrations API (revenu indirect)
- Komoot / Strava : accord d'affiliation → commission si l'utilisateur s'inscrit depuis SunTrail
- Garmin Connect IQ : distribution sur l'écosystème Garmin

---

## 7. Distribution

| Canal | Priorité | Notes |
|-------|:--------:|-------|
| **Google Play Store** | ✅ Sprint 7 | Marché primaire |
| **PWA Web** | ✅ Existant | Démo / acquisition gratuite |
| **App Store iOS** | 🔵 v6.x | Nécessite build séparé (Capacitor iOS) |
| **F-Droid** | ⬜ Optionnel | Seulement si open-source intégral (sans clé bundlée) |
| **Huawei AppGallery** | ⬜ Futur | Marché asiatique — faible priorité |

---

## 8. Analyse d'Impact Architectural

Selon le modèle choisi, les modifications techniques varient :

### Si Freemium (recommandé)
- **Google Play Billing** : `com.android.billingclient:billing:7.x` dans Capacitor
- **Plugin IAP Capacitor** : `@capacitor-community/in-app-purchases` ou `@capgo/capacitor-purchases`
- **Gate features** : `state.isPro: boolean` — vérification côté client (avec validation serveur pour éviter le crack)
- **Clé MapTiler bundlée** : variable d'environnement dans `.env` (hors Git) → injectée au build
- **Effort estimé** : Sprint dédié ~3-5 jours

### Si One-Shot payant
- Aucune modification d'architecture
- L'app est simplement publiée en payant sur Play Console
- **Effort estimé** : 0

### Si Gratuit total
- Aucune modification
- **Effort estimé** : 0

---

## 9. Décisions à Prendre

> Ces 5 questions **doivent être répondues** avant de lancer Sprint 7.

| # | Question | Options | Décision |
|---|----------|---------|----------|
| D1 | Modèle de base | Gratuit / Payant / Freemium | ⬜ À décider |
| D2 | Clé MapTiler | Bundlée / Utilisateur / Proxy | ⬜ À décider |
| D3 | Publicité | Aucune / Native sponsorisée | ⬜ À décider |
| D4 | Marché initial | CH only / FR+CH / Europe alpine | ⬜ À décider |
| D5 | iOS | Ignoré / v6.x / simultané Android | ⬜ À décider |

---

## 10. Recommandation Initiale (à valider)

**Phase 1 — Lancement test (Sprint 7)**
→ Application **payante one-shot à €3.99** sur Play Store
→ Clé MapTiler utilisateur (évite tout coût initial)
→ Zéro publicité
→ Marché : CH + FR + DE + AT

**Pourquoi one-shot pour commencer ?**
- Zéro infrastructure supplémentaire
- Valide la disposition à payer avant d'investir dans l'IAP
- Permet d'obtenir de vrais avis et données d'usage
- Réversible : passage en Freemium sur v5.12 si les données le justifient

**Phase 2 — v5.12 (si traction confirmée)**
→ Migration vers Freemium avec clé bundlée (tier gratuit limité)
→ Approche SAC/CAS + MapTiler pour partenariats
→ IAP Capacitor implémenté

---

## 11. Questions Ouvertes pour la Prochaine Discussion

1. Quelle est ta tolérance aux coûts récurrents (tiles MapTiler) ?
2. As-tu une cible de revenu ? (couvrir les coûts / revenus complémentaires / produit principal)
3. Envisages-tu iOS à terme, ou Android only ?
4. Y a-t-il un ancrage pro (guides, écoles d'alpi) dans ton réseau ?
5. Open source ou propriétaire ?
6. Le modèle SAC/CAS t'intéresse-t-il comme canal de distribution ?
