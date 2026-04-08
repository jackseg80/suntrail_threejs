# SunTrail 3D — Historique des Tâches Complétées

> Ce document archive les étapes majeures de développement franchies avant la version 5.26.6.

## ✅ Phase de Stabilisation Finale (v5.26.x)
- **Distance Haversine** : Correction de l'erreur de 44% (v5.26.0).
- **D+ / D- (Hystérésis 2m)** : Algorithme harmonisé (Garmin/Suunto style) (v5.26.1).
- **Lissage Altitude** : Moyenne mobile 3 pts sur le GPS (v5.26.0).
- **REC GPS (Fiabilité)** : Flush buffer, re-start service, recovery après crash (v5.26.0).
- **Nettoyage Dette Technique** : Suppression des scripts JS et GPX orphelins (v5.26.6).
- **RevenueCat ↔ Google Play** : Liaison complète effectuée.
- **Enregistrement GPS (REC) LIBRE** : Pas de limite 30min.
- **Verrou Solaire PRO** : Calendrier bloqué pour non-Pro.
- **Limite Offline** : Plafond à 1 zone gratuite.
- **Inclinomètre PRO** : Widget opérationnel.
- **Upsell LOD 14** : Toast automatique.
- **Ghost tiles LOD** : Flash blanc supprimé.

## 🧪 Refactoring & Architecture
- **Refactoring Architectural Terrain** : Extraction de `TileCache`, `GeometryCache` et `TileLoader`.
- **Normal Map Pre-computation (Worker)** : Déportation du relief vers les WebWorkers.
- **Material Pooling (Shader Reuse)** : Suppression des micro-freezes de compilation.
- **Système Offline-First Complet** : Service Worker + PMTiles.
- **Design Tokens CSS** : Variables systématiques (glassmorphism, radius).
- **Navigation Tactile Google Earth** : Module `touchControls.ts` (PointerEvents).

## 🐛 Bugs Critiques Résolus
- **Perte de données REC (Android killing app)** : Restauration des points après crash via Cache snapshot.
- **SOS bloqué "Localisation en cours"** : Pattern EventBus pour résoudre les coords à l'ouverture.
- **Timeline invisible au démarrage** : Hydratation des widgets synchronisée avec launchScene.
- **Tuiles plates LOD 14+** : Cache invalidé si tuiles 2D fetchées sans élévation.
- **Conformité Play Store** : Disclaimer + URLs sources.
