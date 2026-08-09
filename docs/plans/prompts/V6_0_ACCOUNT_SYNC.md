# Prompt autonome — SunTrail v6.0.0 Compte optionnel & synchronisation

Travaille après v5.86. Réalise la continuité PC–Android sans rendre le compte nécessaire et
sans perdre routes ni entitlements. N'expose aucun bouton Google avant validation E2E.

## Audit et infrastructure d'abord

Lis instructions, roadmap, plan, audit decisions, AuthService/mobile deep links, RevenueCat,
PreparedRoute/RouteRepository, confidentialité et monétisation. Vérifie l'absence/présence réelle
de `supabase/`. Cartographie les environnements web, debug Android, Play internal et production.

## Supabase

- Ajouter CLI/config et migrations versionnées reproductibles depuis une base vide.
- Table routes owner-only, données métier et métadonnées sync séparées, soft-delete/tombstone.
- RLS SELECT/INSERT/UPDATE/DELETE ; aucun service-role client.
- Tests locaux avec utilisateurs A/B : lecture/modification croisée refusée.
- RPC suppression compte cohérente et politique de rétention documentée.
- Ne déployer aucune migration de production sans autorisation explicite.

## OAuth PKCE et magic link

- Authorization Code + PKCE ; custom scheme Android et redirects Supabase autorisés.
- Documenter Google provider, clients web/Android, package, SHA-1/SHA-256 debug et Play signing,
  callback, environnements et procédure de vérification sans secrets.
- Tests callback froid/chaud, annulation, code expiré/réutilisé, réseau perdu, session restaurée,
  logout et suppression.
- Magic link comme fallback web/Android avec le même niveau de reprise.

## RevenueCat sans perte

- Android : partir de l'ID anonyme courant, appeler `Purchases.logIn(Supabase UID)`, comparer
  CustomerInfo avant/après et resynchroniser l'entitlement.
- Vérifier/documenter le transfer behavior du dashboard compatible compte optionnel.
- Web : implémenter une liaison/restauration réelle ; ne pas utiliser l'e-mail comme App User ID
  et ne pas considérer `configure(newId)` comme une fusion.
- E2E bloquants : achat anonyme → login → autre appareil → restore → logout/relogin → changement
  de compte. Ne jamais révoquer Pro sur une erreur réseau transitoire.

## Synchronisation

- `RouteSyncEnvelope` séparé de PreparedRoute.
- `RouteSyncService` seul client Supabase ; repository local reste prioritaire.
- Premier upload avec consentement, push debounced, pull incrémental, reprise offline et tombstones.
- Conflit sans écrasement : distant conservé, copie locale nommée, résolution ultérieure.
- Événement `syncStatusChanged` typé.
- Ne synchroniser ni traces REC, position, cartes/packs, clés API, ni réglages développeur.

## Free/Pro et downgrade décidés

- Free choisit jusqu'à cinq routes synchronisées en écriture.
- Pro illimité.
- Downgrade : aucune suppression ; surplus cloud lisible/téléchargeable, modifications locales
  conservées, choix des cinq slots explicite.
- Retour Pro réactive la sync sans écrasement.

## Tests/gates

- App sans compte identique à v5.86.
- PC→Android nominal <10 s en ligne puis route offline.
- Conflit, suppression, downgrade, cinq slots, données hors scope.
- Migrations/RLS réelles ; si Supabase local indisponible, version non validée.
- Deep links sur build signé/internal track, pas seulement navigateur desktop.
- Tous gates standard, Capacitor/Gradle et E2E multi-contexte.

Ajouter flag `accountSync`, runbooks Supabase/OAuth/RevenueCat, architecture, RGPD, monétisation et
store listing. Aucun déploiement/secret/commit/tag/push sans autorisation. Le bilan fournit preuves
RLS, CustomerInfo/restore, scénarios sync et actions dashboard restantes.
