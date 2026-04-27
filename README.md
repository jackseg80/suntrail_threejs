# ⛰️ SunTrail 3D

**v5.40.18** · **MIT + Commons Clause**

L'application de randonnée 3D ultime avec simulation solaire avancée. Terrain ultra-réaliste, ombres portées dynamiques sur le relief, les forêts et les bâtiments, GPS haute précision et analyse topographique.

## Pourquoi SunTrail 3D ?

SunTrail n'est pas une simple carte 2D inclinée. C'est un véritable moteur de terrain 3D WebGL conçu pour la montagne.

### 🌑 Simulation Solaire & Ombre (Unique)
Le cœur de SunTrail est son **module d'analyse solaire**. Contrairement aux autres applications, SunTrail calcule en temps réel les **ombres portées** sur le relief réel.
- **Forêts & Bâtiments** : Les ombres sont projetées non seulement sur le sol, mais aussi sur les massifs forestiers et les structures 3D pour un réalisme saisissant.
- **Analyse Prédictive** : Voyez exactement quand une face rocheuse, un sentier ou un bivouac passera à l'ombre.
- **Calendrier Solaire** : Simulez l'éclairage pour n'importe quelle date de l'année (passée ou future) pour planifier vos sorties en fonction de l'ensoleillement.

### 🏔️ Analyse Topographique Avancée
- **Profil Interactif** : Graphique d'élévation dynamique avec marqueur 3D synchronisé.
- **Stats de Précision** : D+/D-, pente en temps réel, VAM (Vitesse Ascensionnelle Moyenne) et cotations de difficulté.
- **Inclinomètre Pro** : Un véritable instrument numérique pour mesurer les pentes sur le terrain et anticiper les zones de danger.

## Fonctionnalités

- **Moteur 3D natif** : LOD adaptatif (zoom 6→18) avec une fluidité exceptionnelle.
- **Multi-tracés GPX** : Importez et analysez plusieurs parcours simultanément.
- **Mode Offline Complet** : Téléchargement de zones et support des fichiers PMTiles pour une utilisation sans réseau.
- **Météo Montagne** : Station météo intégrée avec particules de pluie et neige gérées par shader GPU.
- **Enregistrement GPS** : Service de suivi robuste en arrière-plan avec protection contre les crashs système.

> **Note sur la disponibilité** : Le projet est en constante évolution. Certaines fonctionnalités avancées (comme la précision extrême des bâtiments ou la signalétique spécifique) peuvent varier d'un pays à l'autre selon la disponibilité des données sources (SwissTopo, IGN, MapTiler). Nous travaillons chaque jour pour étendre la couverture HD.

## Marchés Prioritaires
🇨🇭 **Suisse** (Données HD SwissTopo) · 🇫🇷 **France** (IGN) · 🇮🇹 **Italie** · 🌍 **Monde** (Satellite & OpenTopo)

## Modèle Freemium

| Tier Gratuit | Tier Pro |
|---|---|
| Carte topo (Auto) (CH+FR+IT) | LOD 18 + Satellite HD + Bâtiments 3D |
| Simulation solaire (jour actuel) | Calendrier illimité (dates passées/futures) |
| Ombre portée sur le relief | **Ombres sur forêts et bâtiments 3D** |
| 1 tracé GPX + REC illimité | Multi-tracés + export GPX + stats avancées |
| Vue 2D/3D | Inclinomètre numérique Pro |
| Alertes sécurité | Analyse solaire complète (Azimut, Élevation) |
| Offline 1 zone | Offline illimité + PMTiles |

## Stack technique

Three.js r160 · TypeScript (strict) · Vite 5 · Capacitor 8 · RevenueCat · Vitest (600+ tests)

## Installation & Dev

```bash
npm install
npm run dev        # Serveur dev Vite (HMR)
npm test           # 604 tests unitaires
npm run check      # TypeScript strict
npm run deploy     # check + build + cap sync
```

## Licence

MIT + Commons Clause — code source disponible pour étude et usage personnel. Commercialisation interdite. Voir [LICENSE](./LICENSE).
