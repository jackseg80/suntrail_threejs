/**
 * SunTrail 3D — Créateur de formulaire Google Forms
 * 
 * UTILISATION :
 * 1. Va sur https://script.google.com
 * 2. Crée un nouveau projet (bouton "+ Nouveau projet")
 * 3. Colle tout ce code dans l'éditeur (remplace le contenu existant)
 * 4. Clique sur ▶ Exécuter → fonction "createSunTrailForm"
 * 5. Autorise les permissions Google si demandé
 * 6. Le lien du formulaire s'affiche dans les Logs (Ctrl+Entrée)
 *
 * Le script crée un formulaire avec :
 * - Choix initial : Protocole Rapide (20-30 min) ou Complet (1h30-2h)
 * - Branchement automatique vers la bonne section
 * - Toutes les questions structurées avec cases à cocher
 * - Section rapport final adaptée à chaque protocole
 */

function createSunTrailForm() {
  const form = FormApp.create('SunTrail 3D — Protocole de Test');
  form.setDescription(
    'Merci de participer aux tests de SunTrail 3D !\n\n' +
    'Choisis le protocole selon le temps dont tu disposes :\n' +
    '• Rapide (20-30 min) → 3 mois Pro offerts\n' +
    '• Complet (1h30-2h) → 1 AN Pro offert\n\n' +
    'Tu peux faire le test en plusieurs sessions. ' +
    'Chaque question est facultative — réponds à ce que tu peux.'
  );
  form.setCollectEmail(false);
  form.setAllowResponseEdits(true);
  form.setProgressBar(true);

  // ── PAGE D'ACCUEIL : Choix du protocole ─────────────────────────────────
  const choixSection = form.addPageBreakItem()
    .setTitle('Quel protocole souhaites-tu suivre ?')
    .setHelpText('Les deux donnent accès à une récompense Pro. Le protocole Complet demande plus de temps mais offre 1 an au lieu de 3 mois.');

  const choixItem = form.addMultipleChoiceItem()
    .setTitle('Choix du protocole')
    .setRequired(true);

  // ── SECTIONS PROTOCOLE RAPIDE ────────────────────────────────────────────

  const sR1 = form.addPageBreakItem()
    .setTitle('📱 Rapide — 1. Installation & Premier lancement')
    .setHelpText('Durée estimée : ~5 min\n\n' +
      "ℹ️ Temps de chargement normal : au premier lancement (cache vide), la carte peut mettre 10 à 60 secondes à s'afficher selon ta connexion. Les ouvertures suivantes sont quasi-instantanées.");

  addCheckboxes(form, 'Cases à cocher — Installation', [
    'Application installée depuis le lien fourni',
    'Première ouverture réussie',
    "Conditions d'utilisation lues et acceptées",
    'Tutoriel de démarrage parcouru (ou "Passer" appuyé)',
  ]);
  form.addParagraphTextItem()
    .setTitle('Le tutoriel était-il clair ?')
    .setHelpText('Oui / Non / Partiellement — détaille si besoin');

  const sR2 = form.addPageBreakItem()
    .setTitle('🗺️ Rapide — 2. Navigation 3D')
    .setHelpText('Durée estimée : ~5 min');

  addCheckboxes(form, 'Gestes testés', [
    '1 doigt : déplacer la carte',
    '2 doigts pinch : zoom avant / zoom arrière',
    '2 doigts rotation : faire pivoter la carte',
    '2 doigts côte à côte + glisser : incliner la vue',
    'Double tap sur un sommet ou point de la carte',
  ]);
  form.addParagraphTextItem()
    .setTitle('Les gestes étaient-ils fluides ?')
    .setHelpText('Y a-t-il eu des bugs ou des blocages ?');

  const sR3 = form.addPageBreakItem()
    .setTitle('🎛️ Rapide — 3. Boutons de contrôle')
    .setHelpText(
      'ℹ️ Mode 2D/3D : le relief 3D n\'est disponible qu\'en zoom suffisant (vue régionale ou locale). ' +
      'À faible zoom, le bouton est grisé — c\'est normal.\n\n' +
      '💡 Le mode 3D est idéal pour préparer une rando. En randonnée active, ' +
      'restez en 2D : meilleure lisibilité et bien moins de consommation batterie.'
    );

  addCheckboxes(form, 'Boutons testés', [
    'Boussole (haut) : réoriente la carte vers le Nord',
    'Couches 🗺️ : au moins 2 styles différents testés',
    'Couches → toggle Sentiers activé (LOD ≥ 11) → sentiers balisés visibles',
    'Couches → toggle Pentes activé → zones colorées selon la déclivité (> 30° = orange/rouge)',
    '2D/3D : bascule entre vue plate et relief 3D',
    'GPS 📍 : centre la carte sur ta position',
  ]);
  form.addParagraphTextItem()
    .setTitle('Les boutons étaient-ils bien visibles et compréhensibles ?');

  const sR4 = form.addPageBreakItem()
    .setTitle('☀️ Rapide — 4. Timeline solaire')
    .setHelpText('Durée estimée : ~3 min');

  addCheckboxes(form, 'Timeline testée', [
    'Bouton Timeline ouvert (bas de l\'écran)',
    'Curseur glissé vers une heure matinale (7h) — ombres visibles',
    'Curseur glissé vers le soir (19h) — ombres longues',
    'Tentative de changement de date → message "Passer à Pro" apparaît (normal — calendrier est Pro)',
    'Timeline fermée',
  ]);
  form.addMultipleChoiceItem()
    .setTitle('La simulation solaire te semblait-elle réaliste ?')
    .setChoiceValues(['Oui, très réaliste', 'Plutôt oui', 'Difficile à dire', 'Non, pas convaincant']);

  const sR5 = form.addPageBreakItem()
    .setTitle('🆘 Rapide — 5. Bouton SOS')
    .setHelpText('Durée estimée : ~2 min — Ne pas appuyer sur le bouton d\'appel réel !');

  addCheckboxes(form, 'SOS testé', [
    'Bouton 🆘 (haut-droite) appuyé',
    'Coordonnées GPS affichées dans le panneau',
    'Panneau fermé sans appel',
  ]);
  form.addMultipleChoiceItem()
    .setTitle('Le panneau SOS s\'est-il ouvert rapidement ?')
    .setChoiceValues(['Oui, instantané', 'Quelques secondes', 'Lent (> 5s)', 'Erreur ou non ouvert']);

  const sR6 = form.addPageBreakItem()
    .setTitle('💳 Rapide — 6. Test d\'achat (simulé)')
    .setHelpText(
      'ℹ️ En phase de test fermé, les achats sont GRATUITS et FICTIFS. ' +
      'Google Play simule la transaction, aucune carte bancaire n\'est débitée.\n\n' +
      'L\'écran d\'achat s\'ouvre quand tu touches une fonctionnalité Pro.'
    );

  addCheckboxes(form, 'Test d\'achat', [
    'Bouton Couches 🗺️ appuyé',
    'Tuile "Satellite" (badge Pro) appuyée → feuille "Passer à Pro ✨" ouverte',
    '3 plans affichés avec leurs prix (mensuel, annuel, à vie)',
    'Achat du plan annuel lancé',
    'Transaction confirmée par Google Play',
    'Message de confirmation apparu (une seule fois)',
  ]);
  form.addMultipleChoiceItem()
    .setTitle('Le processus d\'achat était-il clair ?')
    .setChoiceValues(['Oui, très clair', 'Plutôt clair', 'Confus', 'Erreur rencontrée']);

  const sR7 = form.addPageBreakItem()
    .setTitle('🔋 Rapide — 7. Performance & Batterie')
    .setHelpText(
      'Navigue librement pendant 5 minutes — zoom, dézoom, change de région.\n\n' +
      'ℹ️ Conso attendue en mode 3D actif : ~10-15%/heure. En mode 2D, bien moins.\n\n' +
      '🔬 Optionnel (power user) : tu peux activer les Stats de performance dans ' +
      'Réglages → ⚙️ Paramètres Avancés (désactivé par défaut) pour obtenir des données FPS/GPU. ' +
      'Lance ⏺, navigue 5 min, arrête ⏹ → colle le JSON dans tes remarques.'
    );

  addCheckboxes(form, 'Performance', [
    'Application fluide (pas de saccades importantes)',
    'Aucun plantage ni blocage',
    'Carte se chargeant correctement',
  ]);
  form.addTextItem()
    .setTitle('Batterie au début des 5 min (mode 3D) : ____%')
    .setHelpText('Ex: 82%');
  form.addTextItem()
    .setTitle('Batterie à la fin des 5 min : ____%')
    .setHelpText('Ex: 79%');
  form.addParagraphTextItem()
    .setTitle('Saccades ou plantages rencontrés ?')
    .setHelpText('Décris brièvement ce qui s\'est passé, ou laisse vide si tout va bien');

  const sR8 = form.addPageBreakItem()
    .setTitle('📋 Rapide — 8. Rapport final')
    .setHelpText('Dernière étape — merci pour ton temps !');

  form.addScaleItem()
    .setTitle('Note globale de l\'application')
    .setBounds(1, 5)
    .setLabels('Décevant', 'Excellent');
  form.addParagraphTextItem()
    .setTitle('3 choses qui fonctionnent bien')
    .setHelpText('Une par ligne si possible');
  form.addParagraphTextItem()
    .setTitle('3 problèmes ou améliorations souhaitées')
    .setHelpText('Une par ligne si possible');
  form.addTextItem()
    .setTitle('Ton appareil')
    .setHelpText('Ex: Samsung Galaxy A53, Android 13');
  form.addParagraphTextItem()
    .setTitle('Remarques libres');

  const sR9 = form.addPageBreakItem()
    .setTitle('🎁 Récupération de ta récompense (3 mois Pro)')
    .setHelpText(
      '⚠️ À faire APRÈS le déploiement en production (tu recevras un message).\n\n' +
      '1. Installe/mets à jour la version production\n' +
      '2. Va dans Réglages → Avancés\n' +
      '3. Copie ton ID Testeur (champ en bas)\n' +
      '4. Envoie-le par message → ton accès Pro 3 mois sera activé sous 24h'
    );
  form.addTextItem()
    .setTitle('Ton ID Testeur (optionnel maintenant, à fournir plus tard)')
    .setHelpText('Format : $RCAnonymousID:xxxxxxxx — visible dans Réglages → Avancés → tout en bas');

  // ── SECTIONS PROTOCOLE COMPLET ───────────────────────────────────────────

  // ── INTRO PROTOCOLE COMPLET : minimum requis ────────────────────────────
  const sCIntro = form.addPageBreakItem()
    .setTitle('📋 Avant de commencer — Protocole Complet')
    .setHelpText(
      'Ce protocole couvre toutes les fonctionnalités de l\'application (15 parties).\n' +
      'Tu n\'es pas obligé de tout tester — fais ce que tu peux, en plusieurs sessions si besoin.\n\n' +
      '✅ MINIMUM REQUIS POUR RECEVOIR TON AN PRO :\n' +
      '   • Partie 1  — Installation & Onboarding        (~10 min)\n' +
      '   • Partie 2  — Navigation & Gestes              (~10 min)\n' +
      '   • Partie 5  — Import d\'un tracé GPX            (~10 min)\n' +
      '   • Partie 6  — Timeline solaire                 (~5 min)\n' +
      '   • Partie 9  — Mode testeur Pro                 (~10 min)\n' +
      '   • Partie 12 — Test d\'achat simulé              (~5 min)\n\n' +
      'Total minimum : ~50 minutes.\n\n' +
      '💡 Si tu manques de temps, le Protocole Rapide (20-30 min) donne droit à 3 mois Pro.'
    );

  const sC1 = form.addPageBreakItem()
    .setTitle('📱 Complet — Partie 1 : Installation & Onboarding')
    .setHelpText(
      'Durée estimée : ~10 min\n\n' +
      'ℹ️ Temps de chargement normal : 10 à 60 secondes au 1er lancement selon ta connexion.'
    );

  addCheckboxes(form, '[P1] Cases à cocher — Onboarding', [
    'Application installée depuis le lien fourni',
    'Conditions d\'utilisation lues — les infos de sécurité alpine semblent claires',
    'Tutoriel complet parcouru (6 slides, sans "Passer")',
    'Gestes expliqués dans le tutoriel semblaient clairs',
    'Boutons FAB décrits dans slide 3 correspondent à ce qui est visible à l\'écran',
    'App fermée puis rouverte → tutoriel n\'est PAS réapparu',
    'Réglages → bas de page → "Aide & Tutoriel" → tutoriel s\'affiche à nouveau',
    'Chargement initial < 15s (WiFi) ou < 30s (4G)',
  ]);
  form.addMultipleChoiceItem()
    .setTitle('[P1] Le tutoriel était-il bien dosé ?')
    .setChoiceValues(['Trop court', 'Bien dosé', 'Un peu long', 'Trop long']);
  form.addParagraphTextItem()
    .setTitle('[P1] Commentaires sur l\'onboarding')
    .setHelpText('Ce qui était clair, ce qui manquait, etc.');

  const sC2 = form.addPageBreakItem()
    .setTitle('🗺️ Complet — Partie 2 : Navigation & Gestes')
    .setHelpText('Durée estimée : ~15 min — Explore une zone montagneuse.');

  addCheckboxes(form, '[P2] Gestes testés', [
    '1 doigt : déplace la carte dans toutes les directions',
    'Pinch : zoom avant jusqu\'au LOD 14 et zoom arrière (vue Suisse entière)',
    '2 doigts rotation : pivote à 45°, 90°, 180°',
    '2 doigts côte à côte + glisse vers le haut → vue rasante',
    '2 doigts côte à côte + glisse vers le bas → vue zénithale',
    'Boussole : incline la vue puis appuie → réorientation Nord',
    'Double tap sur sommet → altitude affichée correctement',
    'Zoom rapide répété 10× → aucun crash ni freeze',
    'Pan rapide → tuiles se chargent correctement',
  ]);
  form.addTextItem()
    .setTitle('[P2] Altitude affichée pour un sommet connu')
    .setHelpText('Ex: Mont Blanc → app affiche ____m (attendu ~4808m)');
  form.addParagraphTextItem()
    .setTitle('[P2] Gestes fluides ? Bugs rencontrés ?');

  const sC3 = form.addPageBreakItem()
    .setTitle('🎛️ Complet — Partie 3 : Boutons FAB')
    .setHelpText(
      'ℹ️ Le mode 3D consomme ~2-3× plus de batterie que le mode 2D. ' +
      'Il est conçu pour préparer une rando, pas pour naviguer pendant.'
    );

  addCheckboxes(form, '[P3] FABs testés', [
    'Couches : tous les styles disponibles testés',
    'Couches : aucun style ne refuse de charger',
    'Couches → toggle Sentiers activé (zoom LOD ≥ 11) → sentiers balisés visibles sur la carte',
    'Couches → toggle Sentiers : tracés nets et bien positionnés par rapport au terrain',
    'Couches → toggle Pentes activé → zones colorées selon la déclivité (orange/rouge sur pentes raides)',
    'Couches → toggle Pentes : couleurs cohérentes avec le terrain (zones dangereuses > 30° bien identifiées)',
    'Toggle 2D/3D : bascule plusieurs fois — relief apparaît correctement',
    'Toggle 2D/3D : switch instantané (pas de latence)',
    'Toggle 2D/3D : bouton grisé à faible zoom (comportement attendu)',
    'GPS : localisation autorisée',
    'GPS : carte centrée sur ta position',
    'GPS : position précise à ~10-50m en extérieur',
  ]);
  form.addTextItem()
    .setTitle('[P3] Quel style de carte préfères-tu pour la randonnée ?');

  const sC4 = form.addPageBreakItem()
    .setTitle('⚙️ Complet — Partie 4 : Presets de performance')
    .setHelpText('Va dans Réglages → Profils de performance');

  addCheckboxes(form, '[P4] Presets testés', [
    'Éco : carte en 2D, animations réduites',
    'Équilibré : qualité correcte, fluidité acceptable',
    'Performance (ou Ultra si dispo) : meilleur détail visible',
    'Retour sur le profil auto-détecté',
  ]);
  form.addTextItem()
    .setTitle('[P4] Quel profil a été sélectionné automatiquement au démarrage ?')
    .setHelpText('Ex: Équilibré (STD)');

  const sC5 = form.addPageBreakItem()
    .setTitle('🥾 Complet — Partie 5 : Import de tracé GPX')
    .setHelpText(
      'Si tu n\'as pas de fichier GPX, télécharge-en un sur wikiloc.com ou openrunner.com ' +
      '(choisis une randonnée en Suisse ou en Savoie).'
    );

  addCheckboxes(form, '[P5] GPX testé', [
    'Onglet Parcours → Import GPX → fichier sélectionné',
    'Tracé affiché en 3D sur le terrain',
    'Appui sur le tracé → profil d\'élévation affiché en bas',
    'Position du tracé correcte (pas décalée)',
    'Zoom LOD 13-14 → tracé suit bien le relief',
  ]);
  form.addParagraphTextItem()
    .setTitle('[P5] Commentaires sur l\'import GPX');

  const sC6 = form.addPageBreakItem()
    .setTitle('☀️ Complet — Partie 6 : Timeline solaire')
    .setHelpText('Durée estimée : ~10 min');

  addCheckboxes(form, '[P6] Timeline testée', [
    'Bouton Timeline ouvert',
    'Curseur → 7h matin → ombres changent',
    'Curseur → midi → ciel au-dessus des crêtes',
    'Curseur → 19h → ombres longues',
    'Observation dans une vallée selon l\'heure',
    'Champ de date légèrement grisé en version gratuite (comportement attendu)',
    'Tentative de changement de date → message "Passer à Pro" apparaît et date revient à aujourd\'hui',
    '(Pro) Changement de date (ex: 21 juin) → ombres changent radicalement',
  ]);
  form.addMultipleChoiceItem()
    .setTitle('[P6] La simulation solaire te semblait-elle réaliste ?')
    .setChoiceValues(['Oui, très réaliste', 'Plutôt oui', 'Difficile à juger', 'Non, pas convaincant']);

  const sC7 = form.addPageBreakItem()
    .setTitle('🌤️ Complet — Partie 7 : Bulletin météo')
    .setHelpText(
      'La météo se charge automatiquement lors de la navigation. ' +
      'Accès : pastille météo en haut de l\'écran (température + icône).'
    );

  addCheckboxes(form, '[P7] Météo version gratuite', [
    'Panneau s\'ouvre depuis le HAUT (pas depuis le bas)',
    '4 données de base affichées : température, ressenti, vent, humidité',
    'Défilement horizontal "12 prochaines heures" fonctionne',
    'Jours 2 et 3 grisés avec badge PRO',
    'Bannière upsell "Météo 3 jours" visible en bas',
  ]);
  addCheckboxes(form, '[P7] Météo version Pro (activer mode testeur — Partie 9 d\'abord)', [
    'Affichage depuis le HAUT à chaque ouverture',
    'Données avancées : rosée, UV colorisé, nébulosité, vent+flèche, rafales, visibilité, limite neige/pluie, prob. précip.',
    'Graphique de température 24h avec barres de précipitation',
    'Prévision 3 jours complète',
    'Bloc "Alerte montagne" avec limite pluie/neige et indice de confort',
    'Bouton "Copier le rapport" → données dans presse-papier',
  ]);
  form.addParagraphTextItem()
    .setTitle('[P7] Données météo cohérentes avec la réalité ? Problèmes ?');

  const sC8 = form.addPageBreakItem()
    .setTitle('☀️ Complet — Partie 8 : Analyse solaire')
    .setHelpText(
      'Nécessite d\'abord un double-tap sur la carte pour afficher les coordonnées, ' +
      'puis appuyer sur le bouton "☀ Solaire".'
    );

  addCheckboxes(form, '[P8] Analyse solaire gratuite', [
    'Double-tap sur la carte → pastille coordonnées apparaît',
    'Bouton "☀ Solaire" appuyé',
    'Panneau s\'ouvre depuis le HAUT',
    'Durée du jour affichée',
    'Heure du premier rayon affichée',
    'Barre chronologique (48 segments nuit/ombre/soleil) visible',
  ]);
  addCheckboxes(form, '[P8] Analyse solaire Pro (activer mode testeur — Partie 9 d\'abord)', [
    'Panneau depuis le HAUT à chaque ouverture',
    'Bloc 1 : lever/coucher, midi solaire, heures dorées, durée ensoleillement',
    'Bloc 2 : azimut + boussole SVG rotative, élévation + barre de progression, phase de lune',
    'Bloc 3 : graphique élévation 24h (courbe, zones bleues/rouges, ligne heure actuelle)',
    'Bloc 4 : barre chronologique colorée',
    'Bloc 5 : bouton "Copier le rapport" → données dans presse-papier',
    'Timeline modifiée → boussole et élévation mis à jour en temps réel',
  ]);

  const sC9 = form.addPageBreakItem()
    .setTitle('🔓 Complet — Partie 9 : Mode testeur Pro')
    .setHelpText(
      'Ce mode permet de tester toutes les features Pro sans payer. ' +
      'Il est actif en RAM uniquement — se réinitialise au redémarrage.'
    );

  addCheckboxes(form, '[P9] Activation mode testeur', [
    'Réglages → défilement bas → ligne dorée "⚙️ PARAMÈTRES AVANCÉS" appuyée (accordéon déplié)',
    'Bloc "Sources de données & Légal" visible en bas de la section',
    'Texte grisé "v5.16.x" visible tout en bas',
    '7 taps rapides sur le numéro de version → message "🔓 Mode testeur Pro activé"',
  ]);
  addCheckboxes(form, '[P9] Vérification features Pro débloquées', [
    'LOD 18 : zoom maximum → détail plus fin qu\'avant (bâtiments, sentiers, végétation)',
    'Couches → tuile "Satellite" disponible (plus de badge PRO bloquant)',
    'Inclinomètre : widget ▲ XX° (XX%) visible en bas-gauche au LOD ≥ 13',
    'Inclinomètre : couleur change selon la pente (blanc → jaune → orange → rouge)',
    'Analyse solaire Pro : 5 blocs visibles',
    'Météo Pro : données avancées + graphique visibles',
    '2e tracé GPX importé sans message de blocage',
    'Retap 7× → "🔒 Mode testeur Pro désactivé"',
  ]);

  const sC10 = form.addPageBreakItem()
    .setTitle('🆘 Complet — Partie 10 : Fonctionnalités de sécurité')
    .setHelpText('Durée estimée : ~5 min');

  addCheckboxes(form, '[P10] SOS testé', [
    'Panneau 🆘 ouvert (bouton haut-droite)',
    'Coordonnées GPS affichées (latitude, longitude, altitude)',
    'Bouton SMS présent → ouvre l\'app SMS sans envoyer',
    'Numéro 112 visible dans le panneau',
  ]);

  const sC11 = form.addPageBreakItem()
    .setTitle('⚙️ Complet — Partie 11 : Réglages & Langue')
    .setHelpText('Durée estimée : ~10 min');

  addCheckboxes(form, '[P11] Réglages testés', [
    'Langue → Deutsch → interface entièrement en allemand',
    'Langue → English → interface entièrement en anglais',
    'Retour en Français',
    'Slider "Exagération du relief" → 3.0 → relief plus prononcé',
    'Slider remis à 2.0 (défaut)',
  ]);
  form.addParagraphTextItem()
    .setTitle('[P11] Problèmes de traduction ou de réglages ?');

  const sC12 = form.addPageBreakItem()
    .setTitle('💳 Complet — Partie 12 : Test d\'achat (simulé)')
    .setHelpText(
      'ℹ️ En test fermé, les achats sont GRATUITS et FICTIFS. Aucune carte bancaire débitée.\n\n' +
      'La feuille d\'achat s\'ouvre en touchant une feature verrouillée — ' +
      'pas de bouton dédié dans les Réglages (intentionnel).'
    );

  addCheckboxes(form, '[P12] Test achat', [
    'Couches 🗺️ → tuile Satellite appuyée → feuille "Passer à Pro ✨" ouverte',
    '3 plans affichés avec leurs prix (mensuel, annuel, à vie)',
    'Plan annuel mis en avant avec badge "⭐ 7 jours gratuits"',
    'Achat mensuel lancé',
    'Un seul message de confirmation (pas plusieurs fois)',
    'Statut Pro activé correctement',
    'Autres points d\'entrée testés : Timeline date, 2e GPX, météo jours 2-3',
  ]);
  form.addMultipleChoiceItem()
    .setTitle('[P12] Le processus d\'achat était-il clair ?')
    .setChoiceValues(['Oui, très clair', 'Plutôt clair', 'Confus', 'Erreur rencontrée']);

  const sC13 = form.addPageBreakItem()
    .setTitle('🔋 Complet — Partie 13 : Performance & Batterie')
    .setHelpText(
      'Navigue librement 15 minutes : change de zones, importe un GPX, active la timeline.\n\n' +
      'Valeurs attendues : 3D actif ~10-15%/h · 2D ~5-8%/h · REC écran éteint ~2-4%/h'
    );

  addCheckboxes(form, '[P13] Performance', [
    'Application fluide sur les 15 minutes',
    'Aucune saccade notable',
    'Aucun plantage',
    'Téléphone pas anormalement chaud',
  ]);
  form.addTextItem().setTitle('[P13] Batterie début (mode 3D, 15 min) : ____%');
  form.addTextItem().setTitle('[P13] Batterie fin : ____%');
  form.addTextItem().setTitle('[P13] REC GPS — batterie départ : ____%');
  form.addTextItem().setTitle('[P13] REC GPS — batterie après 10 min écran éteint : ____%');
  addCheckboxes(form, '[P13] Test REC GPS', [
    'Enregistrement GPS lancé (bouton REC dans Parcours)',
    'Écran éteint (bouton power) — enregistrement continue en arrière-plan',
    'Après 10 min, écran rallumé — tracé GPS enregistré sans interruption',
  ]);
  form.addParagraphTextItem()
    .setTitle('[P13] Saccades, plantages ou surchauffe ? Décris le contexte');

  // Section optionnelle power user — stats de perf
  form.addSectionHeaderItem()
    .setTitle('🔬 Optionnel — Stats de performance (power user)')
    .setHelpText(
      'Cette section est FACULTATIVE et ne conditionne pas ta récompense.\n\n' +
      'Les stats sont désactivées par défaut. Pour les activer :\n' +
      'Réglages → ⚙️ Paramètres Avancés → toggle "Stats de performance (FPS)"\n\n' +
      'Un panneau apparaît avec FPS, VRAM, draw calls, triangles.\n' +
      'Appuie sur ⏺ pour enregistrer, navigue 5 min, puis ⏹ → JSON dans presse-papier.'
    );
  addCheckboxes(form, '[P13-OPT] Stats de perf testées (si tu veux aller plus loin)', [
    'Toggle "Stats de performance" activé dans Paramètres Avancés',
    'Panneau FPS/VRAM visible à l\'écran',
    'Enregistrement ⏺ lancé',
    'Navigation 5 min effectuée (libre + immobile + GPX + écran verrouillé)',
    'Export ⏹ → JSON copié dans presse-papier',
  ]);
  form.addParagraphTextItem()
    .setTitle('[P13-OPT] Colle ici le JSON exporté (optionnel)')
    .setHelpText('Le JSON contient FPS, VRAM, drawCalls, triangles, isProcessingTiles — très utile pour diagnostiquer les ralentissements');

  const sC14 = form.addPageBreakItem()
    .setTitle('📶 Complet — Partie 14 : Téléchargement offline')
    .setHelpText('SunTrail peut fonctionner entièrement sans réseau une fois une zone téléchargée.');

  addCheckboxes(form, '[P14] Offline testé', [
    'Réglages → ⚙️ Paramètres Avancés → bouton "Télécharger Zone" appuyé',
    'Barre de progression visible pendant le téléchargement',
    'Mode Avion activé après téléchargement',
    'Navigation dans la zone téléchargée → tuiles chargées depuis le cache',
    'Aucune tuile noire ou manquante dans la zone téléchargée',
    'Zone non téléchargée → tuiles grisées ou manquantes (comportement normal)',
    'Réseau réactivé',
  ]);
  form.addTextItem()
    .setTitle('[P14] Durée du téléchargement de la zone')
    .setHelpText('En secondes approximativement');

  const sC15 = form.addPageBreakItem()
    .setTitle('📊 Complet — Partie 15 : Rapport détaillé')
    .setHelpText('Merci pour le temps consacré — c\'est inestimable !');

  form.addTextItem()
    .setTitle('[P15] Modèle du téléphone')
    .setHelpText('Ex: Samsung Galaxy S23, Pixel 8 Pro');
  form.addTextItem()
    .setTitle('[P15] Version Android')
    .setHelpText('Ex: Android 14');
  form.addMultipleChoiceItem()
    .setTitle('[P15] Connexion pendant le test')
    .setChoiceValues(['WiFi', '4G', '5G', 'Mixte']);
  form.addScaleItem()
    .setTitle('[P15] Navigation & gestes')
    .setBounds(1, 5).setLabels('Mauvais', 'Excellent');
  form.addScaleItem()
    .setTitle('[P15] Qualité des cartes')
    .setBounds(1, 5).setLabels('Mauvais', 'Excellent');
  form.addScaleItem()
    .setTitle('[P15] Timeline solaire')
    .setBounds(1, 5).setLabels('Mauvais', 'Excellent');
  form.addScaleItem()
    .setTitle('[P15] Import GPX')
    .setBounds(1, 5).setLabels('Mauvais', 'Excellent');
  form.addScaleItem()
    .setTitle('[P15] Tutoriel d\'onboarding')
    .setBounds(1, 5).setLabels('Mauvais', 'Excellent');
  form.addScaleItem()
    .setTitle('[P15] Performance générale')
    .setBounds(1, 5).setLabels('Mauvais', 'Excellent');
  form.addScaleItem()
    .setTitle('[P15] Design & lisibilité')
    .setBounds(1, 5).setLabels('Mauvais', 'Excellent');
  form.addScaleItem()
    .setTitle('[P15] Note globale')
    .setBounds(1, 5).setLabels('Décevant', 'Excellent');
  form.addParagraphTextItem()
    .setTitle('[P15] Ce qui t\'a le plus impressionné');
  form.addParagraphTextItem()
    .setTitle('[P15] Ce qui t\'a le plus frustré ou semblé peu clair');
  form.addParagraphTextItem()
    .setTitle('[P15] Fonctionnalité manquante que tu utilises dans d\'autres apps de rando');
  form.addMultipleChoiceItem()
    .setTitle('[P15] Recommanderais-tu SunTrail à un ami randonneur ?')
    .setChoiceValues(['Oui, sans hésiter', 'Probablement oui', 'Peut-être', 'Non']);
  form.addParagraphTextItem()
    .setTitle('[P15] Remarques libres');
  form.addTextItem()
    .setTitle('[P15] Ton ID Testeur (optionnel maintenant, à fournir plus tard)')
    .setHelpText('Format : $RCAnonymousID:xxxxxxxx — visible dans Réglages → Avancés → tout en bas');

  // ── CONFIRMATION FINALE ─────────────────────────────────────────────────
  const sFin = form.addPageBreakItem()
    .setTitle('✅ Merci !')
    .setHelpText(
      'Ton retour est reçu — merci pour le temps consacré !\n\n' +
      '⚠️ Récupération de ta récompense (à faire APRÈS le déploiement en production) :\n' +
      '1. Installe la version production depuis le Play Store\n' +
      '2. Va dans Réglages → Avancés → copie ton ID Testeur\n' +
      '3. Envoie-le par message → accès Pro activé sous 24h'
    );

  // ── BRANCHEMENT CONDITIONNEL ─────────────────────────────────────────────
  // Configure les choix avec le bon branchement de section
  choixItem.setChoices([
    choixItem.createChoice('⚡ Protocole Rapide (20-30 min) — 3 mois Pro', sR1),
    choixItem.createChoice('🏆 Protocole Complet (1h30-2h) — 1 an Pro', sCIntro),
  ]);

  // Navigations de fin de section Rapide → section finale
  sR9.setGoToPage(sFin);

  // Log du lien
  const url = form.getPublishedUrl();
  const editUrl = form.getEditUrl();
  Logger.log('═══════════════════════════════════════════');
  Logger.log('✅ Formulaire créé avec succès !');
  Logger.log('');
  Logger.log('🔗 Lien pour les testeurs (à partager) :');
  Logger.log(url);
  Logger.log('');
  Logger.log('✏️  Lien d\'édition (pour toi uniquement) :');
  Logger.log(editUrl);
  Logger.log('═══════════════════════════════════════════');

}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Ajoute une question avec cases à cocher (choix multiples).
 * @param {GoogleAppsScript.Forms.Form} form
 * @param {string} title
 * @param {string[]} items
 */
function addCheckboxes(form, title, items) {
  form.addCheckboxItem()
    .setTitle(title)
    .setChoiceValues(items);
}
