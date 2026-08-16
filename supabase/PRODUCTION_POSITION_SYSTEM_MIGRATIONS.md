# Refonte institutionnelle des postes — migrations de production

Projet Supabase : `fuvqhdhgilkltqwqitcr`
Date de déploiement : 2026-08-16

Ce registre consigne les migrations effectivement appliquées par Supabase lors de la refonte du système institutionnel des postes. Les numéros ci-dessous proviennent de `supabase_migrations.schema_migrations` et constituent la référence de production.

| Version Supabase | Nom |
|---|---|
| `20260816085421` | `institutional_position_operating_system_schema` |
| `20260816085522` | `institutional_position_operating_system_structure` |
| `20260816085631` | `position_scoped_protection_gender_correspondence` |
| `20260816085807` | `position_scoped_reports_and_team_meetings_v2` |
| `20260816085932` | `my_position_workspace_support_rpcs` |
| `20260816085956` | `case_position_scope_insert_policy` |
| `20260816090934` | `institutional_position_system_self_test` |

## Périmètre fonctionnel

Ces migrations installent notamment :

- les cases de postes indépendantes des personnes (`position_slots`) ;
- la matrice de capacités et privilèges par poste ;
- la structure des 11 organes subsidiaires dans les 10 régions du Cameroun ;
- les postes régionaux, projets et le blueprint complet des antennes ;
- la chaîne de supervision hiérarchique et technique ;
- l’affectation d’un profil à une case de poste avec héritage des droits ;
- l’espace de travail `Mon poste` et ses RPC de synthèse ;
- le registre numérique du courrier entrant/sortant/interne ;
- les analyses Genre & Inclusion ;
- l’intégration du coffre des cas sensibles avec les tâches/activités/projets ;
- les agrégats anonymisés de cas pour le rapportage ;
- les validations de rapports fondées sur les lignes de poste ;
- les réunions d’équipe avec invitation des collaborateurs/subordonnés ;
- l’autotest transactionnel privé réservé au PCA avec MFA AAL2.

## Principe documentaire

Le référentiel différencie les fonctions explicitement documentées par les textes internes disponibles des fonctions techniques complémentaires créées comme référentiel opérationnel. Les documents catalogués mais non encore présents dans le coffre documentaire de production sont marqués `source_library` et ne sont pas présentés comme des fichiers téléchargeables depuis le coffre.

## Règle de sécurité

Aucune personne fictive n’est créée pour remplir une case de poste. Les cases restent `vacant` jusqu’à une nomination/affectation réelle. Les données nominatives des cas Protection/VBG restent dans le périmètre sensible et les rapports généraux n’utilisent que les agrégats autorisés.
