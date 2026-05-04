# SunTrail — Roadmap

## v5.53.4+ (Court terme)

### Paiements Web — Restauration par Email

**Problème critique :** Un utilisateur qui paie via Stripe sur web perd l'accès s'il change de navigateur ou vide le cache (App User ID aléatoire en localStorage).

**Solution :** Email-based restauration sans login obligatoire.

**Logique :**
1. Après paiement Stripe → proposer d'entrer son email (optionnel mais recommandé)
2. Stocker email dans `localStorage` + utiliser comme App User ID RevenueCat
3. À chaque démarrage web → vérifier email en localStorage ; si présent, l'utiliser
4. Ajouter bouton "Restaurer achats par email" dans UpgradeSheet pour retrouver les achats

**Fichiers :**
- `src/modules/iapService.ts` : post-paiement demander email, initialisation App User ID depuis email localStorage
- `src/modules/ui/components/UpgradeSheet.ts` : bouton "Restaurer par email"
- `src/modules/packManager.ts` : même logique pour les packs

**Avantages :**
- ✅ Non-invasif (pas de login obligatoire)
- ✅ Protège immédiatement les utilisateurs qui entrent email
- ✅ Permet restauration si cache vidé
- ✅ Fondation pour OAuth optionnel plus tard

**Effort :** 2-3h

---

## v6.0+ (Moyen terme)

### Authentification Utilisateur Optionnelle

**Objectif :** Accès cross-device transparent aux achats (navigateur → navigateur, app → web, etc.).

**Approches :**
1. **Login Email Léger** : email + lien de confirmation (sans password)
2. **OAuth** : Google/Apple Sign-in (transparent, UX meilleure)
3. **WebAuthn** : biométrie/clé sécurité (futur)

**Bénéfices :**
- Utilisateur login → retrouve Pro/packs sur tous les appareils
- Sync avec Android via même email RevenueCat
- Préparation pour sync cloud (sauvegardes traces, préférences, etc.)
- Analytics utilisateur (améliore monétisation)

---

## v6.0+ (Moyen-long terme)

### Autres Features Payantes

- **Intégration Strava/Komoot** : auto-import traces (Pro)
- **Cloud Sync** : sauvegardes traces/marque-pages (Pro)
- **API Publique** : accès données via webhook (Professionnel/B2B)
- **Marque-pages Collaboratifs** : partage itinéraires entre randonneurs (Pro)

---

## Notes

- **RevenueCat :** Documenté [docs/MONETIZATION.md](docs/MONETIZATION.md)
- **Production Stripe :** À faire lors passage en prod (clés live, domaine production, etc.)
- **Tests :** 750 tests passent (iapService mocké dans `src/test/setup.ts`)
