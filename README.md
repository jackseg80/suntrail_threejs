# ⛰️ SunTrail 3D

**v5.84.0 — jalon interne clôturé** · **MIT + Commons Clause**

L'application de randonnée 3D mobile-first avec simulation solaire avancée. Terrain
ultra-réaliste, ombres portées dynamiques sur le relief, les forêts et les bâtiments,
GPS haute précision, analyse topographique et suivi de trace hors ligne au premier plan. Disponible sur
**Android** (Capacitor) et **Web** (Three.js).

## Pourquoi SunTrail 3D ?

SunTrail n'est pas une simple carte 2D inclinée. C'est un véritable moteur de terrain 3D
WebGL conçu pour la montagne, pensé pour être simple pour le débutant et complet pour le
randonneur avancé.

### 🌑 Simulation Solaire & Ombre (Unique)

Le cœur de SunTrail est son **module d'analyse solaire**. Contrairement aux autres
applications, SunTrail calcule en temps réel les **ombres portées** sur le relief réel.

- **Forêts & Bâtiments** : Les ombres sont projetées non seulement sur le sol, mais aussi
  sur les massifs forestiers et les structures 3D pour un réalisme saisissant.
- **Analyse Prédictive** : Voyez exactement quand une face rocheuse, un sentier ou un
  bivouac passera à l'ombre.
- **Calendrier Solaire** : Simulez l'éclairage pour n'importe quelle date de l'année
  (passée ou future) pour planifier vos sorties en fonction de l'ensoleillement.

### 🏔️ Analyse Topographique Avancée

- **Profil Interactif** : Graphique d'élévation dynamique avec marqueur 3D synchronisé.
- **Stats de Précision** : D+/D-, pente en temps réel, VAM (Vitesse Ascensionnelle
  Moyenne) et cotations de difficulté.
- **Inclinomètre Pro** : Un véritable instrument numérique pour mesurer les pentes sur le
  terrain et anticiper les zones de danger.

## Fonctionnalités

- **Moteur 3D natif** : LOD adaptatif (zoom 6→18) avec une fluidité exceptionnelle.
- **Préparation de randonnées** : mode Planifier explicite, waypoints, sauvegarde locale
  des itinéraires préparés, difficulté/effort et heure d'arrivée estimée.
- **Multi-tracés GPX** : Importez et analysez plusieurs parcours simultanément.
- **Mode Offline Complet** : Téléchargement de zones et support des fichiers PMTiles pour
  une utilisation sans réseau.
- **Météo Montagne** : Station météo intégrée avec particules de pluie et neige gérées par
  shader GPU.
- **Enregistrement GPS** : Service de suivi robuste en arrière-plan avec protection contre
  les crashs système.
- **Suivi écran actif (bêta interne)** : progression, distance/ETA restantes, écart et prochaine
  indication tant que l'application reste ouverte. Aucune promesse écran éteint ou après fermeture.

> **Note sur la disponibilité** : Le projet est en constante évolution. Certaines
> fonctionnalités avancées (comme la précision extrême des bâtiments ou la signalétique
> spécifique) peuvent varier d'un pays à l'autre selon la disponibilité des données
> sources (SwissTopo, IGN, MapTiler). Nous travaillons chaque jour pour étendre la
> couverture HD.

## Marchés Prioritaires

🇨🇭 **Suisse** · 🇫🇷 **France** · 🇦🇹 **Autriche** · 🇩🇪 **Allemagne** · 🇪🇸 **Espagne** · 🇮🇹 **Italie** · 🌍 **Monde**

## Modèle Freemium

| Tier Gratuit | Tier Pro |
|---|---|
| Carte topo (Auto) (CH+FR+IT) | LOD 18 + Satellite HD + Bâtiments 3D |
| Simulation solaire (jour actuel) | Calendrier illimité (dates passées/futures) |
| Ombre portée sur le relief | **Ombres sur forêts et bâtiments 3D** |
| 1 tracé GPX actif + REC illimité | Multi-tracés + export GPX + stats avancées |
| Bibliothèque de routes préparées illimitée | Inclinomètre numérique Pro |
| Alertes sécurité | Analyse solaire complète (Azimut, Élévation) |
| Offline 1 zone + 1 corridor 1 km | Offline illimité + corridors multiples + PMTiles |

## Stack technique

Three.js r184 · TypeScript 6 (strict) · Vite 8 · Capacitor 8 · RevenueCat · Supabase ·
Vitest · Playwright (E2E)

## Ressources & Médias

- 📺 **Chaîne YouTube Officielle** : [@SunTrail3D](https://www.youtube.com/@SunTrail3D) —
  Démonstrations vidéo des fonctionnalités (Solaire, Inclinomètre, 3D).

## Installation & Dev

```bash
npm install
npm run dev        # Serveur dev Vite (HMR)
npm test           # 1551 tests unitaires
npm run check      # TypeScript strict + lint + format
npm run test:e2e:smoke  # Smoke E2E Playwright
npm run deploy     # check + build + cap sync
```

## Licence

MIT + Commons Clause — code source disponible pour étude et usage personnel.
Commercialisation interdite. Voir [LICENSE](./LICENSE).
