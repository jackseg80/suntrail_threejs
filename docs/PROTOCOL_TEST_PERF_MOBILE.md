# Protocole de Test Performance Mobile (v5.26.13)

> Objectif : Valider la fluidité (60 FPS) et la vitesse de chargement sur Galaxy S23 (High) et A53 (STD).

## 🛠️ Outils de mesure
1. Brancher le mobile en USB.
2. Ouvrir `chrome://inspect/#devices` sur PC.
3. Cliquer sur "Inspect" pour voir les logs et l'onglet "Performance".

## 📋 Scénarios de Test

### 1. Démarrage à froid (Cold Boot)
- **Action** : Lancer l'app.
- **Vérification** : 
    - Est-ce que les premières tuiles s'affichent en < 1s ?
    - Est-ce que la vue se complète toute seule sans bouger la carte ? (Test du système de "pulses").
    - Présence de `[Violation]` dans la console ?

### 2. Navigation Rapide (Stress Test)
- **Action** : Panoramique et Zoom/Dézoom agressif pendant 10s.
- **Vérification** :
    - Présence de saccades visuelles (Jank) ?
    - Le chargement progressif (12 tuiles sur S23 / 8 sur A53) permet-il de garder une navigation fluide ?

### 3. Rotation 3D & Ombres
- **Action** : Incliner la vue à 45° et tourner autour d'un sommet.
- **Vérification** :
    - Impact des ombres portées sur le framerate.
    - Vérifier si le passage automatique en basse résolution pendant le mouvement fonctionne (Adaptive Resolution).

### 4. Deep Sleep & Background
- **Action** : Mettre l'app en arrière-plan et revenir.
- **Vérification** :
    - Log `[Render] Loop Stopped` / `[Render] Loop Started`.
    - Pas de freeze lors de la reprise.

## 📈 Seuils de tolérance
- **S23 (Performance)** : 60 FPS constant. Temps de frame < 16ms.
- **A53 (Balanced)** : 30-60 FPS. Temps de frame < 33ms acceptable en chargement lourd.
