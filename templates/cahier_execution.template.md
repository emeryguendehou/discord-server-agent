# Cahier d'exécution — [NOM DU SERVEUR]

Méthode de travail et garde-fous de l'agent IA pour ce projet. `specifications.md` est la source de
vérité fonctionnelle ; ce document décrit comment l'agent doit l'appliquer.

## 1. Sources de vérité et gestion des conflits

`docs/specifications.md` est la référence fonctionnelle. En cas d'ambiguïté ou de conflit, l'agent
ne tranche pas seul : il marque `DECISION_REQUIRED` et demande au propriétaire plutôt que
d'inventer.

## 2. Principes de sécurité

- Jamais le token de compte utilisateur Discord — uniquement le token du bot dédié, dans `.env`,
  jamais commité.
- Permissions ciblées, pas Administrator, même temporairement pendant le provisionnement.
- Toute opération destructive (suppression) est précédée d'un état des lieux et d'un plan explicite.

## 3. Modèle de contrôle — Infrastructure as Code

Configuration déclarative (`config/*.yml`) → `--dry-run` (plan sans modification) → validation
explicite du propriétaire → `--apply` (application idempotente) → `--audit` (vérification des
permissions réelles). L'agent ne considère jamais Discord comme la seule source d'état : il compare
l'état désiré au dépôt à l'état réel du serveur et n'applique que le delta nécessaire.

## 4. Ordre d'exécution

1. Lire `docs/specifications.md` intégralement.
2. Transformer en `config/*.yml`.
3. `--dry-run`, présenter le plan complet.
4. Validation explicite du propriétaire.
5. `--apply` (potentiellement en deux passes si des salons dépendent de Community).
6. Actions manuelles listées clairement (jamais prétendre qu'une action manuelle est faite).
7. `--audit` avant d'ouvrir le serveur à la communauté.

## 5. Contrôles de conformité (avant d'inviter du monde)

- Aucun rôle non-staff ne voit les salons privés/payants.
- Aucun rôle non-staff ne peut mentionner `@everyone`/`@here`.
- Les espaces payants sont invisibles sans le rôle correspondant.
- Le staff junior (modérateurs) ne voit pas les salons réservés aux administrateurs.

## 6. Gestion des opérations manuelles

Toute action que l'agent ne peut pas effectuer lui-même (compte tiers, dashboard externe, OAuth
personnel) est signalée `MANUAL_ACTION` avec l'étape exacte à suivre — jamais marquée comme faite
si elle ne l'est pas réellement.

## 7. Interdictions

- Ne jamais inventer une permission, une couleur, un rôle ou une intégration absente de
  `specifications.md`.
- Ne jamais exécuter `--apply` sans validation explicite du plan `--dry-run` correspondant.
- Ne jamais demander ou manipuler le token de compte utilisateur Discord du propriétaire.
- Ne jamais committer/pousser du code sans confirmation explicite du propriétaire.

## 8. Procédure de modification future

Toute nouvelle idée est d'abord ajoutée à `docs/specifications.md` (section Journal des décisions)
avant d'être traduite en configuration, puis appliquée via le cycle habituel (`--dry-run` → validation
→ `--apply` → `--audit`).

## 9. Livrables attendus

- `config/*.yml` à jour et cohérent avec `docs/specifications.md`.
- `reports/state.json` (mapping clé → ID Discord réel) tenu à jour après chaque `--apply`.
- Un résumé clair de ce qui a été appliqué, de ce qui reste en `MANUAL_ACTION`, et de tout écart
  volontaire par rapport à la spécification initiale (documenté, pas silencieux).
