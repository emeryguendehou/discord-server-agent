# discord-server-agent

Crée et fais évoluer un serveur Discord avec un agent IA (Claude Code, Codex, ou tout autre agent
capable de lire des instructions et d'exécuter des commandes) comme bras technique — pas de clic
manuel de rôles/salons/permissions un par un.

Tu décris le serveur que tu veux, l'agent transforme ça en configuration déclarative
(Infrastructure as Code), te montre un plan complet avant toute modification, puis l'applique.
Rien n'est jamais fait en douce : chaque changement passe par un `--dry-run` visible avant un
`--apply`.

## Ce que ça fait

- Rôles, catégories, salons, permissions, AutoMod, Onboarding Discord — tout par configuration.
- Deux passes automatiques : les salons qui dépendent de la fonctionnalité Community de Discord
  (forums, annonces) attendent que Community soit activée, sans bloquer le reste.
- `--audit` : vérifie qui voit quoi avant d'inviter qui que ce soit.
- Modules optionnels activables uniquement si tu les demandes : monétisation (Patreon, YouTube
  Memberships), bot de modération tiers.

## Prérequis

1. Un serveur Discord vide (tu le crées toi-même — Discord ne permet plus à un bot de créer un
   serveur depuis juillet 2025).
2. Une application Discord dédiée avec un bot, invitée avec des permissions ciblées (jamais
   Administrator). Détail complet dans [AGENTS.md](./AGENTS.md).
3. Node.js 20+, et l'agent IA de ton choix (Claude Code, Codex...).

## Démarrage rapide

```bash
npm install
cp .env.example .env   # renseigne DISCORD_BOT_TOKEN et DISCORD_GUILD_ID
```

Puis lance ton agent IA dans ce dossier et dis-lui ce que tu veux comme serveur — il lit
[AGENTS.md](./AGENTS.md), mène l'entretien, génère `docs/specifications.md` et
`docs/cahier_execution.md`, produit la configuration, te montre le plan, et applique une fois
validé.

Commandes disponibles une fois la configuration prête :

```bash
npm run provision -- --dry-run   # calcule le plan, ne modifie rien (par défaut)
npm run provision -- --apply     # applique le plan validé
npm run provision -- --audit     # vérifie la visibilité des salons par rôle
```

## Structure

```
AGENTS.md            Instructions complètes pour l'agent IA -- à lire en premier
templates/            Gabarits des 2 documents de spécification générés par l'entretien
docs/                 specifications.md + cahier_execution.md générés pour TON serveur
config/               server.yml, roles.yml, channels.yml, permissions.yml, automod.yml,
                       integrations.yml, panels.yml, partners.yml, catalog.yml
src/config/            schémas de validation (zod) + chargeur YAML
src/discord/            client discord.js, lecture de l'état réel du serveur
src/provision/          moteur de plan (CREATE/UPDATE/MOVE/NO_CHANGE/MANUAL_ACTION) + application
src/audit/              simulation de visibilité des salons par rôle
reports/                state.json (mapping clé -> ID Discord) et rapports générés
```

## Philosophie

- Rien n'est inventé : toute valeur de configuration vient soit de ce que tu as demandé, soit d'une
  décision que tu as explicitement validée.
- Toute action que l'agent ne peut pas faire lui-même (comptes tiers, dashboards externes) est
  signalée clairement, jamais présentée comme faite si elle ne l'est pas.
- Modulaire : pas de dépendance imposée à un service payant. Patreon, YouTube, un bot de modération
  tiers — tout est optionnel et n'existe dans ta configuration que si tu l'as demandé.
