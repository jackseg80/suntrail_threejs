# Plan : Redesign "SunTrail Immersive Onboarding" (v6.0)

## 1. Vision & Objectifs
L'onboarding actuel est trop passif et ne met pas assez en valeur la plus-value unique de SunTrail (la 3D et le solaire). Le nouveau système doit être :
- **Immersif** : Plein écran avec flou d'arrière-plan.
- **Vendeur** : Le simulateur solaire arrive en 2ème position.
- **Pédagogique** : Illustrations animées (CSS/SVG) pour les gestes complexes (Tilt).
- **Actionnable** : Menu de démarrage final pour guider l'utilisateur vers sa première action.

## 2. Structure des Slides (Sequence)

1.  **Immersion & Liberté**
    - Message : La montagne en 3D réelle.
    - Focus : Gestes (Pan, Zoom, Tilt 2 doigts).
    - Visuel : Animation SVG "Main qui incline le terrain".

2.  **Maîtrisez la Lumière (Plus-value)**
    - Message : Anticipez l'ensoleillement et les ombres.
    - Focus : Timeline solaire, ombres portées.
    - Visuel : Animation "Soleil tournant autour d'un sommet".
    - *Note : Annonce de l'analyse solaire sur tracés (v6.2).*

3.  **Tracez votre Aventure**
    - Message : Planifiez, importez ou enregistrez.
    - Focus : Planificateur d'itinéraire, Import GPX, REC GPS.
    - Visuel : Animation "Ligne de tracé qui se dessine".

4.  **L'Oeil de l'Expert**
    - Message : Analysez le relief en détail.
    - Focus : Inclinomètre, Pentes >30°, Profil d'élévation.
    - Visuel : Schéma SVG de pente avec indicateur de degrés.

5.  **Conditions & Cartographie**
    - Message : Bulletin météo expert et cartes officielles.
    - Focus : Météo montagne, SwissTopo/IGN, Boussole.
    - Visuel : Icône météo dynamique (Soleil/Pluie) + mini-carte topo.

6.  **Sécurité & Autonomie**
    - Message : Bouton SOS et mode 100% hors-ligne.
    - Focus : SOS Coordonnées, Packs Pays Offline.
    - Action : Menu final (Explorer / Importer / Packs).

## 3. Spécifications Techniques

### UI / UX
- **Backdrop** : `fixed inset-0` avec `backdrop-filter: blur(20px)`.
- **Responsive** :
    - Portrait : Layout Stack (Visuel / Texte / Actions).
    - Landscape/Desktop : Layout Side-by-Side.
- **Animations** : CSS Keyframes légères (opacity, transform translate3d).
- **Haptique** : Vibrations discrètes au changement de slide.

### Composants CSS/SVG
- Utilisation de `<svg>` inline pour les animations afin de rester léger.
- Variables CSS pour le thème (Clair/Sombre).

## 4. Roadmap de l'implémentation
1.  **Phase 1** : Mise à jour des traductions (`fr.json`).
2.  **Phase 2** : Refonte de la structure HTML/CSS dans `onboardingTutorial.ts`.
3.  **Phase 3** : Création des mini-animations SVG.
4.  **Phase 4** : Implémentation du menu de démarrage final.
5.  **Phase 5** : Tests de responsivité et validation finale.
