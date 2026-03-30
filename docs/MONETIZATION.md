# SunTrail 3D — Stratégie Business & Monétisation

> ✅ **Document mis à jour — 30 mars 2026 (v2)**
> Révision Sprint 8 : nouveaux prix, feature split révisé, stratégie trial, plan d'implémentation.
> Décisions initiales D1–D6 inchangées. Nouvelles décisions D7–D10 ajoutées.

---

## 1. Contexte & Positionnement

### Ce que SunTrail est
- Outil **professionnel de randonnée alpine** — terrain 3D, GPX multi-tracés, simulation solaire
- Qualité de données officielle : SwissTopo, Plan IGN v2, MapTiler
- Marché cible : randonneurs exigeants, alpinistes, géographes amateurs — Suisse, France, Autriche, Allemagne
- Différenciateur clé : **3D véritable** (pas une 2D avec ombrage) + simulation solaire unique + offline-first

### Ce que SunTrail n'est pas
- Un réseau social de randonnée (≠ Komoot, Strava)
- Une app de navigation turn-by-turn (≠ OsmAnd, Maps.me)
- Un simple visualiseur GPX (≠ AllTrails, Wikiloc)

---

## 2. Licences & Coûts des Données

### 2.1 — Sources de données et licences

| Source | Licence | Coût | Sert quoi |
|--------|---------|------|-----------|
| **SwissTopo** | OGD (Open Data) | **0€** | Topo CH — usage commercial & offline illimité |
| **Plan IGN v2** | Etalab 2.0 (Open) | **0€** | Topo FR via Géoplateforme — usage commercial libre |
| **SCAN 25®** | Propriétaire IGN | ~6€/user/an | Non retenu (voir D6) |
| **OSM Standard** | ODbL | **0€** | Fallback mondial |
| **MapTiler Cloud** | Commercial Flex | **0€** jusqu'à 100k tiles/mois, puis $0.05/1k | Satellite, topo mondial, zones hors CH/FR |

> **Point clé** : SwissTopo et Plan IGN v2 sont servis depuis leurs APIs officielles (`geo.admin.ch` et `data.geopf.fr`). Ils **ne consomment aucun quota MapTiler**. Pour le marché CH+FR, la consommation MapTiler est quasi nulle.

### 2.2 — Stratégie MapTiler : Flex, zéro engagement

| Phase | Configuration | Coût mensuel |
|-------|--------------|-------------|
| **Sprint 7 — Lancement** | Clé unique bundlée, free tier 100k tiles/mois | **$0** |
| **Quelques users Pro** | Flex auto-overage (carte bancaire ajoutée) | **$0–10** |
| **~100 users Pro actifs** | Bascule vers plan Starter ($25/mois) | **$25** (rentable : 100 Pro × €30/an = €250/mois) |

**Bridage LOD gratuit** : LOD ≤ 14 en tier Gratuit ≈ 150 tiles/session → ~660 sessions/mois dans le quota free.

---

## 3. Analyse Concurrentielle (2026)

> Données vérifiées — Adapty State of In-App Subscriptions 2026 + sites officiels.

| App | Modèle | Prix annuel | Prix mensuel | Forces | Faiblesses |
|-----|--------|-------------|--------------|--------|------------|
| **AllTrails Plus** | Freemium | **$35.99** | ~$3 | Masse, offline, Lifeline safety | Pas de 3D réel, pas de solaire |
| **AllTrails Peak** | Freemium | **$79.99** | ~$6.67 | 3D terrain, Smart Routes IA | Prix élevé, US-centric |
| **Komoot** | Freemium | **€59.99** | €4.99 | Navigation turn-by-turn, Apple Watch | Pas de 3D, pas de solaire, prix critiqué |
| **Wikiloc** | Freemium | **€59.99** | €4.99 | Communauté massive GPX | Pas de 3D, interface vieillissante |
| **Gaia GPS** | Subscription | **$39.99** | ~$3.33 | Hors-ligne complet, terres publiques/privées | UI datée, pas de 3D, US uniquement |
| **CalTopo** | Subscription | **$50** | ~$4.17 | Slope angle pro, outils SAR | Web-first, pas natif mobile |
| **Iphigénie** | Freemium | **€29.99** | €4.99 | IGN 1:25 000 offline, 75+ couches | CH limité, pas de 3D |
| **Outdooractive Pro** | Freemium | **€29.99** | ~€2.50 | 3D photorealistic, hiver | Pas de simulation solaire |
| **PeakFinder** | One-time | **€4.99** (unique) | — | AR pics offline, 1M+ sommets | Pas de carte topo, pas de GPX |
| **Swisstopo** | Gratuit | $0 | — | Données officielles CH | 2D uniquement, CH seulement |
| **Google Earth** | Gratuit | $0 | — | 3D mondial | Pas de topo pro, pas GPX |

### Positionnement SunTrail

SunTrail occupe un espace unique (**3D + données officielles + offline + solaire**). Le concurrent le plus proche fonctionnellement est **Outdooractive Pro+ (€59.99/an)** pour la 3D, mais sans la simulation solaire. Sur le marché alpin FR/CH, **Iphigénie (€29.99/an)** est le benchmark de prix acceptable.

**Prix de référence marché : €29–60/an.** SunTrail se positionne en entrée de gamme premium pour maximiser l'adoption initiale, sans brader.

---

## 4. Modèles de Monétisation — Tiers Définis

**Modèle retenu : Freemium (IAP anonyme via Play Store)**
Pas de backend utilisateur — les achats sont gérés par les stores (Google Play Billing), sans création de compte.

### Philosophie de segmentation : Sécurité (Gratuit) vs Expertise (Pro)

Le tier Gratuit couvre tout ce dont un randonneur a besoin pour **être en sécurité**. Le tier Pro est réservé à l'utilisateur qui veut **planifier, analyser et documenter** comme un expert.

---

### 4.1 — Tier Gratuit (Forever Free)

| Domaine | Feature | Détail |
|---------|---------|--------|
| **Cartographie** | Carte topo CH+FR | LOD ≤ 14 (standard) — SwissTopo + Plan IGN v2 + OSM |
| **Cartographie** | Vue 3D | ✅ Accessible — hook d'acquisition principal |
| **Cartographie** | Analyse des pentes | Calques visuels de danger : 30° / 35° / 40° |
| **GPS** | Position live | ✅ En temps réel |
| **Météo** | Prévisions | Prochaines **12 heures** (4 stats : T°, vent, précipitations, UV) |
| **Simulation solaire** | Timeline | Curseur libre sur les **24h du jour actuel** — durée d'ensoleillement, premier/dernier rayon |
| **GPX** | Import & visualisation | 1 tracé actif à la fois |
| **Enregistrement REC** | Durée | **Illimité** — statistiques de base (distance, D+, durée) |
| **Peaks** | Identification | Top 10 des sommets visibles depuis la position |
| **Sécurité** | SOS SMS | ✅ Pour tous — valeur éthique non négociable |
| **Offline** | Cache | 1 zone de 10 km × 10 km |
| **Publicité** | — | ❌ Aucune |

---

### 4.2 — Tier Pro

**Prix cible (D7) :**
- **€29.99/an** (↑ depuis €19.99 — parité Iphigénie/Outdooractive, -17% AllTrails Plus)
- **€3.99/mois** (↑ depuis €2.99)
- **€99.99 lifetime** (option one-time — breakeven à 3.3 ans vs annuel, ratio standard 3–5× pour les achats uniques)
- **Trial 7 jours gratuit** sur le plan annuel (D8 — voir section 4.3)

| Domaine | Feature | Détail |
|---------|---------|--------|
| **Cartographie** | LOD 18 | Détail maximum — normal maps haute précision |
| **Cartographie** | Couche Satellite | MapTiler Satellite HD |
| **Cartographie** | Inclinomètre numérique | Pente exacte (°/%) détectée sous le curseur central |
| **Cartographie** | Gradient haute précision | Coloration toutes les 2° (vs 5° calques visuels) |
| **Cartographie** | Exposition N/S/E/O | Calque colorant le terrain selon l'orientation |
| **Météo** | Prévisions | **3 à 5 jours** complets |
| **Météo** | Données avancées | UV Index ANSES, Isotherme 0°C, Direction vent (SVG), Indice Confort Rando |
| **Météo** | Alertes Montagne | Alerte Isotherme vs Altitude du tracé |
| **Simulation solaire** | Calendrier illimité | Accès à toutes les dates — passées et futures |
| **Simulation solaire** | Données avancées | Azimut, boussole SVG, graphique élévation 24h, phase lunaire, heures dorées |
| **Simulation solaire** | Raccourcis saisons | Solstices été/hiver + équinoxes en un tap |
| **GPX** | Multi-tracés | Import illimité — comparer plusieurs sorties |
| **GPX** | Export | Format GPX standard |
| **Enregistrement REC** | Stats avancées | VAM, pentes moyennes, estimation Naismith, FC zones (si capteur) |
| **Peaks** | Index complet | Moteur de recherche — tous les sommets de la zone |
| **Offline** | Zones illimitées | + support fichiers .pmtiles locaux |
| **Mode Photo** | Screenshot pro | Capture sans UI + watermark (coordonnées GPS, altitude, logo SunTrail) |
| **Qualité rendu** | Presets Performance & Ultra | Accès aux presets haute qualité GPU |
| **Publicité** | — | ❌ Aucune |

> **Non gated (décision Sprint 8) :** Vidéo 3D (survol automatique) → backlog v5.15+ — complexité technique trop élevée pour Sprint 8.

---

### 4.3 — Stratégie Trial & Conversion (D8)

> Données Adapty 2026 ($3B+ de revenus analysés) : un trial 7 jours multiplie le LTV par **×6.4** vs achat direct (LTV $54.50 vs $7.40). 90% des trials démarrent J0.

**Trial 7 jours sur plan annuel** — implémentation RevenueCat :
- Démarré automatiquement sur le premier tap "Essayer Pro"
- Converti automatiquement à J7 sauf annulation
- Aucun paywall bloquant pendant le trial

**Timing du paywall (D9) :**

Ne jamais montrer le paywall à l'installation. Le montrer **après le premier "wow moment" 3D** :
1. L'utilisateur ouvre l'app → voit la vue 3D Suisse
2. Premier zoom/rotation du terrain (≈30-60 secondes)
3. → Affichage non-bloquant : "Ce que vous voyez est gratuit. Voici ce que Pro débloque." + liste 5 features + trial 7 jours
4. Dismissable — ne réapparaît qu'à la première friction (gate LOD, gate calendrier, etc.)

**Upsell contextuel (au moment de la friction) :**
- LOD 14 → zoom bloqué : toast *"Passez à LOD 18 avec Pro — 7 jours gratuits"*
- Calendrier solaire → icône verrouillée : sheet upgrade complet
- GPX 2e tracé : *"Comparez vos sorties côte à côte avec Pro"*
- Météo jours 2-3 : grisés avec badge 🔒 PRO visible sans tap
- Post-REC : bannière *"Débloquez VAM, Naismith et l'export GPX avec Pro"*

---

### 4.4 — Métriques de Succès

| Métrique | Benchmark marché (Adapty 2026) | Objectif SunTrail |
|----------|-------------------------------|-------------------|
| Conversion freemium→paid | 2.18% médian, 6-8% top 10% | **≥ 3%** |
| Trial-to-paid | 27.8% médian, 40%+ top quartile | **≥ 35%** |
| Install LTV (Utilities) | $1.09 médian | **$1.50+** (CH premium) |
| Ratio annuel/mensuel | Variable | **≥ 60% annuel** |
| J0 purchase rate | 44.5% | Maximiser via onboarding paywall |

---

## 5. Architecture Technique

### 5.1 — IAP Anonyme (sans backend)

- **Google Play Billing** : `com.android.billingclient:billing:7.x`
- **Plugin RevenueCat** : `@revenuecat/purchases-capacitor` v12.3.0
- **Gate features** : `state.isPro: boolean` — vérification via entitlement RevenueCat
- **Pas de Supabase/Firebase** → zéro RGPD, zéro friction d'inscription

> Imposer un login fait perdre ~40% des utilisateurs à l'installation. Avec SwissTopo + Plan IGN v2 en open data, aucun tracking utilisateur n'est légalement requis.

### 5.2 — Produits IAP (Play Console)

| Produit | ID Play Store | Prix |
|---------|---------------|------|
| Abonnement annuel | `suntrail_pro_annual` | **€29.99/an** |
| Abonnement mensuel | `suntrail_pro_monthly` | **€3.99/mois** |
| Achat unique lifetime | `suntrail_pro_lifetime` | **€79.99** |

### 5.3 — Clé MapTiler bundlée

- Variable d'environnement `.env` (hors Git) : `VITE_MAPTILER_KEY=xxx`
- Injectée au build, jamais exposée en clair dans le repo
- Plan MapTiler : Flex (carte bancaire ajoutée pour overage automatique)

---

## 6. Légal & Sécurité

### 6.1 — Acceptance Wall (premier lancement)

Écran bloquant au premier démarrage et après chaque mise à jour majeure. L'utilisateur doit accepter explicitement :

- SunTrail est un **outil d'aide à la navigation** — pas un dispositif de sauvetage
- Les données 3D et le GPS peuvent comporter des erreurs (imprécision signal, décalage relief)
- La simulation solaire est indicative (météo et obstacles locaux non modélisés)
- Les pentes (>30°) ne remplacent pas l'analyse 3×3 anti-avalanche terrain

### 6.2 — Mentions légales obligatoires (dans l'app)

- `Source : Federal Office of Topography swisstopo` (toute vue utilisant SwissTopo)
- `Source : IGN — Plan IGN v2` (toute vue utilisant les données IGN)
- `Powered by MapTiler` (si couche MapTiler active)

### 6.3 — EULA & Conformité Store

- **EULA** : Clause de non-responsabilité complète (accident, égarement, mauvaise interprétation)
- **Positionnement Store** : Catégorie "Loisir/Planification" — jamais "Sécurité/Navigation Critique"
- **Privacy Policy** : Requise même sans backend (collecte implicite via Google Play Billing)
- **Avertissement batterie** : Message conseillant batterie externe + carte papier avant toute sortie

---

## 7. Décisions Actées

| # | Question | Décision | Justification |
|---|----------|----------|---------------|
| **D1** | Modèle de base | ✅ **Freemium** | Tier gratuit pour l'acquisition, Pro pour les revenus. Pas de pub. |
| **D2** | Clé MapTiler | ✅ **Bundlée + Flex** | Clé unique dans l'app. Flex pay-as-you-go, zéro engagement initial. |
| **D3** | Publicité | ✅ **Aucune** | Incompatible avec le positionnement pro/premium. |
| **D4** | Marché initial | ✅ **FR + CH** | Plan IGN v2 = 0€ → France aussi viable que la Suisse dès Sprint 7. |
| **D5** | iOS | ✅ **v6.x (futur)** | Build Capacitor iOS séparé. Pas de blocage Sprint 7. |
| **D6** | IGN France | ✅ **Plan IGN v2 (0€)** | Licence ouverte Etalab, vector tiles, qualité suffisante pour la rando alpine. SCAN 25 écarté (coût + complexité). |
| **D7** | Prix Pro | ✅ **€29.99/an · €3.99/mois · €79.99 lifetime** | Parité Iphigénie/Outdooractive. -17% AllTrails Plus. +50% revenu/Pro vs €19.99. La Suisse = LTV mondial le plus élevé ($28.50). |
| **D8** | Trial | ✅ **7 jours gratuits sur plan annuel** | Adapty 2026 : trial × LTV = +636% ($54.50 vs $7.40). 90% des trials démarrent J0. |
| **D9** | Timing paywall | ✅ **Après premier "wow moment" 3D** | Paywall avant valeur = rejet. Paywall après = continuation naturelle. |
| **D10** | Vidéo 3D | ✅ **Backlog v5.15+** | Complexité technique (WebGL → encoder vidéo) trop élevée pour Sprint 8. Feature de roadmap long terme. |

---

## 8. Roadmap Distribution

| Phase | Canal | Marché | Notes |
|-------|-------|--------|-------|
| **Sprint 7** | Google Play Store | 🇨🇭 CH + 🇫🇷 FR | Lancement principal |
| **Sprint 7** | PWA Web | Mondial | Démo gratuite, acquisition organique |
| **Sprint 8** | Play Store update | CH + FR | Gates calendrier, météo, REC stats, inclinomètre, pricing v2 |
| **v5.12** | Play Store update | + 🇦🇹 AT | BEV partiellement open, cœur alpin |
| **v6.x** | App Store iOS | CH + FR + AT | Build Capacitor iOS |
| **v6.x** | Play Store update | + 🇩🇪 DE | Bayern — marché important, données AdV |
| **v7.x+** | Expansion | 🇳🇴 NO / 🇸🇪 SE | Kartverket/Lantmäteriet 100% open, excellente qualité |

---

## 9. Partenariats Potentiels (Post-lancement)

À approcher **après 10k téléchargements** (levier de négociation) :

| Partenaire | Objectif | Bénéfice |
|-----------|----------|---------|
| **MapTiler** | Accord revendeur / tarif startup | -50% coût tiles, badge officiel |
| **Swisstopo** | Distribution officielle CH | Logo officiel, potentiel Innosuisse |
| **SAC/CAS** | Licence bulk membres (150k) | Revenu B2B stable, crédibilité alpine |
| **FFCAM/CAF** | Licence bulk membres (380k) | Marché FR énorme |
| **Mammut / Salomon** | Co-branding discret | Notoriété — à approcher après 50k users |
