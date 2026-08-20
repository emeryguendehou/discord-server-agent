# Configuration déclarative

Fichiers générés par l'agent IA à partir de `docs/specifications.md` (voir `AGENTS.md`). Schémas
complets dans [`../src/config/schema.ts`](../src/config/schema.ts).

Chaque rôle/salon porte une `key` stable (pas le nom affiché) — c'est cette clé qui permet de
retrouver l'ID Discord réel dans `../reports/state.json` après un `--apply`, pour que les
renommages ne créent pas de doublons (principe idempotent).

`permissions.yml` définit des groupes de rôles réutilisables, référencés par `channels.yml` via
`viewGroup`/`sendGroup`/`replyGroup` — voir `../src/provision/resolve.ts` pour la logique de
résolution.
