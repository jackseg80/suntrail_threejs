# SunTrail 3D — Stratégie de Monétisation (v5.40.37)

> Objectif : Offrir une valeur alpine gratuite indispensable (sécurité) tout en incitant à l'abonnement Pro pour l'analyse et le confort.

---

## 1. Modèle Freemium (v5.29 — Hybride)

SunTrail utilise un modèle **Freemium avec abonnement**. La sécurité est offerte à tous, l'expertise est réservée aux abonnés Pro.

**Nouveau (v5.29) : Discovery Trial (3 jours)**
*   **Objectif** : Permettre de tester les fonctions Pro immédiatement après installation sans saisir de carte bancaire (zéro friction).
*   **Activation** : Locale, stockée dans `localStorage`.
*   **Transition** : Une fois l'essai de 3 jours expiré, l'utilisateur est redirigé vers l'essai standard RevenueCat (7 jours avec CB).

### 📊 Comparaison Free / Pro (Gate Logic)

| Domaine | Version GRATUITE (Randonneur) | Version PRO (Alpiniste+) | Gate Technique |
|---------|------------------------------|--------------------------|----------------|
| **Rendu Terrain** | LOD 14 (1:50k) | **LOD 18 (1:5k)** | `scene.ts` |
| **Enregistrement GPS**| **ILLIMITÉ (Libre)** | **ILLIMITÉ (Libre)** | — |
| **Import GPX** | 1 tracé max | **Multi-tracés (illimité)** | `TrackSheet.ts` |
| **Solaire** | Jour actuel (24h) | **Calendrier complet** | `TimelineComponent.ts` |
| **Cartographie** | SwissTopo / IGN / OSM | **Satellite HD** | `terrain.ts` |
| **Mode Hors-ligne** | 1 zone de 10km² | **Zones illimitées** | `ConnectivitySheet.ts` |
| **Inclinomètre** | — | **Numérique (° / %)** | `InclinometerWidget.ts`|
| **Alertes Sécurité** | **Toutes (Avalanche, etc.)** | **Toutes** | (FREE) |
| **Analyse Trail** | Résumé (Munter) | **Segments, Physio, VAM** | `TrackSheet.ts` |

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

- **D1 — REC Libre** : Sécurité d'abord. On ne coupe jamais une trace GPS. L'export GPX fichier est le levier Pro.
- **D2 — Sécurité Gratuite** : Toutes les alertes vitales (avalanche, météo, nuit) sont gratuites. C'est le contrat de confiance.
- **D3 — Verrou Solaire** : La simulation 24h démontre la puissance. Le calendrier (planification future) convertit.
- **D4 — Upsells Contextuels** : Déclenchés au moment de la friction (ex: toast zoom 14, verrou calendrier).

---

## 4. Analyse Concurrentielle (Benchmark 2026)

| App | Prix Annuel | Point Fort | Point Faible (vs SunTrail) |
|-----|-------------|------------|----------------------------|
| **Iphigénie** | €29.99 | Cartes IGN 25k | Pas de 3D, pas de solaire |
| **Outdooractive Pro**| €29.99 | Rendu 3D photo | Pas de simulation solaire |
| **AllTrails Plus** | $35.99 | Communauté | 3D limitée, pas de solaire |
| **Komoot Premium** | €59.99 | Guidage vocal | Prix élevé, pas de 3D |

**Positionnement** : SunTrail est la seule app combinant **3D Haute Performance + Données Officielles + Simulation Solaire** au prix standard de marché de €29.99.
