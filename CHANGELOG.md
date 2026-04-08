# Changelog

Toutes les modifications notables de ce projet seront documentées ici.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère à [Semantic Versioning](https://semver.org/lang/fr/).

## [5.26.0] - 2025-04-08

### Fixed

#### REC (Enregistrement GPS)
- **Bug critique distance** : Correction de la formule de calcul (44% d'erreur). Passage de l'approximation planaire à Haversine.
- **Lissage altitude** : Ajout d'une moyenne mobile sur 3 points pour réduire le bruit GPS vertical (D+/D- plus réalistes).
- **2ème REC qui ne fonctionnait pas** : Fix du callback natif qui n'était pas ré-enregistré après l'arrêt du service.
- **GPX non créé après coupure** : Ajout de `saveGPXToFile()` lors de la recovery.
- **Points perdus au STOP** : Flush du buffer natif avant l'arrêt du service.

#### Stats et Affichage
- **Différence entre Parcours et Tracés importés** : Uniformisation des calculs (même formule Haversine + dédoublonnage).
- **Distance dans le profil** : Correction pour afficher la distance Haversine (0.24km) au lieu de la distance 3D (0.35km).
- **Décimales manquantes** : Passage à 2 décimales partout (consistance avec Garmin).
- **Tracés à 0km** : Validation des points avant création du layer.

#### UI/UX
- **Bouton export GPX** : Ajout d'un bouton 💾 dans "Tracés importés" pour exporter les GPX (visible dans Documents).
- **Message GPX sauvegardé** : Clarification pour utilisateurs gratuits ("dans l'app" vs "Documents").

### Technical

- Nettoyage des logs de debug
- Suppression des toasts de debug `[REC] ...`
- Ratio de conversion distance 3D → Haversine dans le profil

## [5.25.0] - 2025-04-01

### Added
- Feature X
- Feature Y

### Changed
- Modification Z

### Fixed
- Bug A
- Bug B
