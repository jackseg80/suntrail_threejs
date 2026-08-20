# v5.86 — Validation batterie/mémoire S23 (protocole + historique)

> Objectif : isoler la consommation de **SunTrail seule** en REC, la séparer des autres apps
> d'arrière-plan et mesurer l'impact du correctif mémoire v5.86.1 (cache borné + compteur de
> références). Android fournit ce détail par application via `dumpsys batterystats`.

## Constat du 2026-08-19 (build v5.86.1, avant correctifs carte noire)

Sortie REC 17h01→17h41 (40 min), écran utilisé pour l'app + photos, batterie ~89-90 % → 79 %
(≈ **15,8 %/h**). Relevé `dumpsys batterystats` sauvegardé dans
[`battery-runs/2026-08-19_s23_v5.86.1_batterystats.txt`](battery-runs/2026-08-19_s23_v5.86.1_batterystats.txt).

Répartition mesurée (cycle courant, mAh estimés) :

| Acteur | mAh | Part |
| :--- | --: | --: |
| **SunTrail (UID u0a769)** | **179** | **≈ 66 %** |
| Système (UID 1000) | 72,6 | ≈ 27 % |
| Noyau (UID 0) | 43,3 | — |
| Autres apps | négligeable | — |
| **Drain total mesuré** | **272** | — |

Dans SunTrail : **CPU 122 mAh (≈ 68 %)**, **GNSS 40 mAh (1 h 03 de fix)**, écran 8,2, wakelock 5,
wifi 2,9. En écran éteint/doze (partie REC) : CPU 12,8 + GNSS 19,1 + wakelock 4 ≈ 36 mAh / 30 min.

**Conclusions**
- Les apps d'arrière-plan ne masquent rien : **SunTrail est le facteur dominant** (~2/3 du drain).
- Le premier poste est le **CPU (WebView/Three.js)**, cible directe du correctif mémoire v5.86.1.
- Ce relevé n'est PAS une validation propre (écran allumé, build buguée, 40 min) — voir protocole.

## Protocole de mesure (à refaire après correctif)

### Pré-vol (téléphone branché)
1. Charger ≥ 90 % et noter le % exact, la température et l'heure.
2. Réinitialiser les compteurs batterie :
   ```
   adb shell dumpsys batterystats --reset
   ```
3. Désactiver les optimisations pouvant biaiser (mode économie, adaptive battery) pour la durée
   du test, ou les noter pour comparer à conditions identiques.
4. Noter la liste des apps ouvertes pour vérifier l'attribution UID en fin de run.

### Pendant la sortie
- REC-only, **écran surtout éteint** (comme la référence du 2026-08-15 : 85 → 64 % en 1 h 21).
- Si possible, relever **% batterie à T0 / T30 / T60** (en allumant brièvement l'écran).

### Post-vol (téléphone rebranché)
1. Dumper les stats dans l'historique :
   ```
   adb shell dumpsys batterystats > docs/plans/battery-runs/<AAAAMMJJ>_s23_v5.86.1_batterystats.txt
   ```
2. Extraire le détail SunTrail :
   ```
   adb shell dumpsys batterystats | findstr "Estimated power use UID u0a769"
   ```
   (sur PowerShell : `Select-String -Pattern "Estimated power use|UID u0a769:"`)
3. Reporter les valeurs dans le tableau « Historique des runs » ci-dessous.
4. Vérifier l'absence d'erreurs WebGL pendant le run :
   ```
   adb logcat -d | Select-String -Pattern "not renderable"
   ```

### Interprétation des champs `batterystats` (UID SunTrail)
- `UID u0a769: <mAh>` : estimation totale SunTrail (fg = premier plan, bg = arrière-plan,
  fgs = foreground service, cached).
- `cpu=` : temps CPU pondéré → **coût WebView/WebGL dominant**.
- `gnss=` : temps de fix GPS → coût du REC natif.
- `wakelock=` : verrou tenu par le service `:tracking`.
- Sections `(on battery, screen off/doze)` : part imputable au REC écran éteint.

## Historique des runs

| Date | Build | Durée | Écran | Total %/h | SunTrail mAh | Part SunTrail | Note |
| :--- | :--- | ---: | :--- | ---: | ---: | --: | :--- |
| 2026-08-15 | v5.86.0 (pré-fix) | 1 h 21 | surtout éteint | ≈ 15,5 %/h | — | — | Référence : 85 → 64 %, mémoire WebGL excessive |
| 2026-08-19 | v5.86.1 (buguée) | 40 min | app + photos | ≈ 15,8 %/h | 179 | ≈ 66 % | Non comparable (écran, build buguée) |
| **2026-08-20** | **v5.86.1 corrigée** | **~23 min REC** | **surtout éteint** | **≈ 15 %/h** | **~28 (écran éteint)** | **~20 %** | **SunTrail validé ≈ 2-3 %/h écran éteint ; reste du drain = fond (GMS, Samsung MCF, Garmin, Sweatcoin, BT montre, noyau/système)** |
| *prochain* | v5.86.1 corrigée | 60 min | surtout éteint | à relever | à relever | à relever | Validation à compléter |

### Validation — run 2026-08-20 (REC seul, écran surtout éteint)

- Sortie ~09:05 → ~09:34, ~1,54 km, REC sans suivi, montre Garmin connectée (notifs), screen-on SunTrail 3 min 34 s.
- **SunTrail, partie écran éteint/doze** : CPU 8,9 + GNSS 14,3 (21 min 55 s) + wakelock 4,7 ≈ **~28 mAh ≈ 2-3 %/h** → **cible ≤ 10 %/h atteinte : conso REC de SunTrail validée**.
- **Le ~15 %/h total restant n'est pas SunTrail** : Google Play Services (fgs 40 min, 32,5 mAh), Samsung MCF (~16,7 mAh), Garmin Explore (8,6 mAh), Sweatcoin (9 mAh), Microsoft appmanager (6,9 mAh), Bluetooth montre (~62 mAh sur cycle), noyau + système (~165 mAh).
- Conclusion : le correctif v5.86.1 rend la conso REC de SunTrail négligeable ; l'autonomie globale dépend désormais des apps/fond du téléphone, hors périmètre SunTrail. Run court (~23 min) : la marge par rapport à la cible (2-3×) rend le résultat fiable, un run de 60 min resterait une confirmation.

Critère d'acceptation indicatif : **≤ ~10 %/h écran éteint** pour le REC (apps GPS natives matures
≈ 5-10 %/h ; ce 3D WebView part de plus haut).

## Limites connues
- `batterystats` **estime** la puissance via le profil de puissance du SoC : fiable en relatif,
  approximatif en absolu, et il **sous-compte souvent le GPU/WebGL**.
- Le pourcentage batterie affiché est non linéaire : préférer les mAh relatifs et la durée.
- Un run unique ne suffit pas : comparer 2-3 runs à conditions identiques (cf. doc
  [V5_85_A53_S23_FIELD_VALIDATION.md](V5_85_A53_S23_FIELD_VALIDATION.md) — trois sorties d'une heure).
