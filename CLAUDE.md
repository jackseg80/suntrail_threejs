# SunTrail - Guide Développeur (v3.3)

## Architecture UI Tactile
- **Barre de Recherche :** Flottante (top-left), accès direct via MapTiler Geocoding.
- **Sélecteur de Calques :** Menu visuel (top-right) avec vignettes. Fusion dynamique Base/Overlay dans le shader.
- **Barre Temporelle :** Contrôle au pouce en bas de l'écran.
- **Bouton GPS :** Centrage dynamique via `navigator.geolocation`.
- **Réglages :** Panneau coulissant (left) pour les paramètres techniques.

## Contraintes Actives
- **Performance :** Cache LRU limité à 400 tuiles (Protection VRAM).
- **Stabilité :** Vérification systématique de l'existence des éléments DOM dans `sun.js`.
- **LOD :** Hystérésis de 16 unités pour éviter les micro-saccades de reconstruction.
- **GPU :** Forçage recommandé de la puce Haute Performance (RTX) dans les paramètres OS/Navigateur.

## Commandes Utiles
- `npm run dev` : Lancement serveur local.
- `npm run build` : Compilation production.
