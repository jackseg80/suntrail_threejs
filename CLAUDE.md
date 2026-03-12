# SunTrail - Guide Développeur (v3.9.3)

## Architecture Technique (Full TypeScript)
- **State Management :** État global centralisé dans `state.ts` avec interface `State` stricte.
- **GPS :** Migration vers `@capacitor/geolocation`. Permission système requise sur Android.
- **Cycle Solaire :** Basé sur `suncalc`. Interpolation des couleurs pour les Heures Magiques (Dorée/Bleue).
- **Rendu Terrain :** Custom shader injecté dans `MeshStandardMaterial`. Supporte la fusion dynamique Base/Overlay (Sentiers).

## Gestion de la Mémoire (Crucial pour Mobile)
- **Nettoyage :** Toujours appeler `disposeScene()` avant de recréer un renderer.
- **Cache GPU (LRU) :**
  - Mobile : 100 tuiles (Protection VRAM agressive).
  - PC : 400 tuiles (Confort de navigation).
- **LOD :** Utilisation de l'hystérésis (seuil de 16) pour éviter le clignotement lors des calculs de résolution.

## Commandes de Développement
- `npm run dev` : Serveur de dev Vite.
- `npm run check` : Vérification des types TS.
- `npm run deploy` : **Commande recommandée** pour synchroniser avec Android.
- `npm run cap:assets` : Régénération des ressources visuelles Android.

## Workflow Mobile
Les modifications Web sont compilées dans `dist/` puis injectées dans `android/app/src/main/assets/public/`. Ne jamais modifier manuellement les fichiers dans le dossier Android.
