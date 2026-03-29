# SunTrail 3D — Stratégie Business & Monétisation

> ✅ **Document finalisé — Décisions actées le 29 mars 2026**
> Toutes les décisions D1–D6 sont tranchées. Ce document sert de référence pour Sprint 7 et la roadmap.

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
| **~100 users Pro actifs** | Bascule vers plan Starter ($25/mois) | **$25** (rentable : 100 Pro × €20/an = €167/mois) |

**Bridage LOD gratuit** : LOD ≤ 14 en tier Gratuit ≈ 150 tiles/session → ~660 sessions/mois dans le quota free.

---

## 3. Analyse Concurrentielle

| App | Modèle | Prix | Forces | Faiblesses |
|-----|--------|------|--------|------------|
| **AllTrails** | Freemium | $35.99/an | Communauté massive, avis | Pas de 3D réel |
| **Komoot** | Par région | €3.99/région | Navigation turn-by-turn | Pas de 3D, pas de solaire |
| **Gaia GPS** | Subscription | $39.99/an | Hors-ligne complet, USA | UI datée, pas de 3D |
| **Swisstopo** | Gratuit | $0 | Données officielles CH | 2D uniquement, CH seulement |
| **OsmAnd** | Freemium | $0–10 | Open source, offline | UI complexe, pas de 3D |
| **Google Earth** | Gratuit | $0 | 3D mondial | Pas de topo pro, pas GPX |

**Conclusion** : SunTrail occupe un espace unique (3D + données officielles + offline + solaire). Prix de référence marché : **€20–40/an**. SunTrail se positionne en dessous pour faciliter l'adoption initiale.

---

## 4. Modèles de Monétisation — Tiers Définis

**Modèle retenu : Freemium (IAP anonyme via Play Store)**
Pas de backend utilisateur pour Sprint 7 — les achats sont gérés par les stores (Google Play Billing), sans création de compte.

### 4.1 — Tier Gratuit (Forever Free)

| Feature | Limite |
|---------|--------|
| **Cartographie** | Plan IGN v2 (FR) + SwissTopo (CH) + OSM — LOD ≤ 14 |
| **Vue 3D** | ✅ Accessible (hook d'acquisition) |
| **GPS live** | ✅ Position en temps réel |
| **Météo** | ✅ Basique |
| **Simulation solaire** | ⏱ Fenêtre ±2h autour de l'heure réelle |
| **GPX** | 1 tracé actif, import uniquement (pas d'export) |
| **Enregistrement REC** | Limité à 30 min |
| **Offline** | 1 zone de 10km × 10km max |
| **Publicité** | ❌ Aucune |

### 4.2 — Tier Pro

**Prix cible** : €19.99/an ou €2.99/mois *(à affiner selon taux de conversion observé)*

| Feature | Détail |
|---------|--------|
| **Cartographie** | LOD 18 (détail maximum) + couche Satellite MapTiler |
| **Simulation solaire** | 24h/24, curseur temporel libre, export image |
| **GPX** | Multi-tracés illimités, enregistrement illimité, export GPX |
| **Offline / PMTiles** | Zones illimitées, support fichiers .pmtiles locaux |
| **Analyse de pentes** | Coloration avancée + inclinomètre |
| **Presets Performance & Ultra** | Accès aux presets haute qualité GPU |
| **Publicité** | ❌ Aucune |

---

## 5. Architecture Technique Sprint 7

### 5.1 — IAP Anonyme (sans backend)

- **Google Play Billing** : `com.android.billingclient:billing:7.x`
- **Plugin Capacitor** : `@capacitor-community/in-app-purchases`
- **Gate features** : `state.isPro: boolean` — vérification via receipt Play Store côté client
- **Pas de Supabase/Firebase** pour Sprint 7 → zéro RGPD, zéro friction d'inscription

> Imposer un login fait perdre ~40% des utilisateurs à l'installation. Avec SwissTopo + Plan IGN v2 en open data, aucun tracking utilisateur n'est légalement requis.

### 5.2 — Clé MapTiler bundlée

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

---

## 8. Roadmap Distribution

| Phase | Canal | Marché | Notes |
|-------|-------|--------|-------|
| **Sprint 7** | Google Play Store | 🇨🇭 CH + 🇫🇷 FR | Lancement principal |
| **Sprint 7** | PWA Web | Mondial | Démo gratuite, acquisition organique |
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
