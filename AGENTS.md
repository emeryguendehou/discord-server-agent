# Instructions pour l'agent IA

Tu es l'agent de provisionnement de ce dépôt. Ta mission : faire créer par l'utilisateur un serveur
Discord vide, puis construire et appliquer une configuration déclarative qui correspond exactement à
ce qu'il veut — rien de plus, rien de moins. Ce document s'applique à n'importe quel agent IA
(Claude Code, Codex, ou autre) et à n'importe quel serveur Discord, pas à un projet particulier.

## Règle d'or

**N'invente jamais** une permission, une couleur, un rôle, un salon ou une intégration que
l'utilisateur n'a pas demandée. Si une information manque, demande-la ou marque-la
`DECISION_REQUIRED` dans les documents générés plutôt que de deviner.

## Étape 0 — Prérequis à faire faire à l'utilisateur (tu ne peux pas le faire toi-même)

1. **Serveur Discord vide** : `+` → Créer un serveur → Communauté → nom de son choix. Aucune
   catégorie/rôle/salon créé à la main.
2. **Application + bot dédiés** : [discord.com/developers/applications](https://discord.com/developers/applications)
   → New Application → onglet Bot → Reset Token (copié une seule fois) → dans `.env` local
   (`DISCORD_BOT_TOKEN`), jamais dans le code ni dans le chat. **Jamais le token du compte
   utilisateur Discord de la personne.**
3. **Permissions à l'invitation** (OAuth2 URL Generator, scope `bot`) : View Channels, Manage Roles,
   Manage Channels, Manage Server, Manage Webhooks. **Pas Administrator** — jamais nécessaire en
   pratique, même temporairement (confirmé en conditions réelles sur un premier déploiement complet).
4. Récupérer l'ID du serveur (mode développeur activé, clic droit sur le serveur → Copier l'ID) →
   `DISCORD_GUILD_ID` dans `.env`.

## Étape 1 — Mener l'entretien

Pose ces questions à l'utilisateur, en langage naturel, pas comme un formulaire rigide. Chaque
bloc au-delà du premier est **optionnel** — ne le génère que si demandé.

**Toujours** :
- Nom du serveur, thème/sujet général, langue principale.
- Catégories et salons souhaités, avec leur fonction (lecture seule ? qui peut y écrire ?).
- Rôles souhaités (staff, rôles thématiques...) et leurs permissions.
- Règlement : texte fourni par l'utilisateur, ou à rédiger ensemble à partir de ses règles de
  conduite habituelles.

**Si mentionné** :
- Monétisation (Patreon, YouTube Memberships, autre) : quels paliers, quels avantages, quels rôles
  associés ?
- Modération avancée (AutoMod, bot de modération tiers type Sapphire) ?
- Contenu automatisé (notifications YouTube, veille d'actualités par IA) ?
- Communauté payante commune à plusieurs offres (type "Espace Membres") ?

## Étape 2 — Générer les deux documents de spécification

À partir de `templates/specifications.template.md` et `templates/cahier_execution.template.md`,
génère les deux documents réels dans `docs/specifications.md` et `docs/cahier_execution.md`, en
retirant toutes les sections optionnelles non demandées (ne les laisse pas comme sections vides).
Ces deux documents Markdown remplacent les `.docx` du modèle original — même rôle (spéc
fonctionnelle + méthode/garde-fous), format plus simple à générer et à faire évoluer.

Présente les documents générés à l'utilisateur avant de continuer — c'est la source de vérité, elle
doit être validée avant de devenir de la configuration.

## Étape 3 — Transformer en configuration déclarative

Depuis `docs/specifications.md`, remplis `config/*.yml` (schéma complet dans
`src/config/schema.ts`) :
- `server.yml`, `roles.yml`, `channels.yml`, `permissions.yml` (groupes de rôles réutilisables —
  regarde `resolve.ts` pour comprendre comment `viewGroup`/`sendGroup`/`replyGroup` se résolvent),
  `automod.yml`, `integrations.yml`, `panels.yml`, `partners.yml`, `catalog.yml`.
- `config/news_sources.yml` **seulement** si la veille automatisée a été demandée — et seulement
  avec des flux vérifiés individuellement (voir Étape 6).

## Étape 4 — Dry-run puis validation

```bash
npm run provision -- --dry-run
```

Présente le plan complet (CREATE/UPDATE/MOVE/NO_CHANGE/MANUAL_ACTION) à l'utilisateur. Aucune
modification réelle tant qu'il n'a pas validé explicitement.

## Étape 5 — Application (deux passes)

Certains éléments (salons forum, annonces, stage) échouent tant que **Community** n'est pas activé
sur le serveur (action manuelle utilisateur : Paramètres du serveur → Activer la Communauté, après
que règles + salon de mises à jour existent déjà).

```bash
npm run provision -- --apply
```

Lance une première fois avant Community (rôles, catégories, salons classiques, AutoMod, messages
système) ; l'outil détecte automatiquement si Community est actif et inclut les salons dépendants
dans ce cas. Relance après activation manuelle si besoin.

## Étape 6 — Intégrations tierces (toutes manuelles, aucune API tierce accessible à un bot)

- **Patreon** : se règle entièrement sur patreon.com (Benefits d'un palier → Advanced → Connect
  Discord → mapping palier→rôle existant). Rien dans Paramètres du serveur Discord.
- **YouTube Memberships** : User Settings > Connections (compte personnel) puis Paramètres du
  serveur > Intégrations > YouTube. **Discord crée automatiquement ses propres rôles gérés**
  (`YouTube Member`, `YouTube Member : <palier>`) — impossible de mapper sur des rôles existants.
  Renomme/recolore les rôles auto-créés après coup pour matcher le style voulu, mets à jour
  `reports/state.json`, relance `--apply`, supprime les rôles placeholder devenus doublons.
- **Bot de modération tiers (Sapphire ou autre)** : installation + configuration 100% manuelle. Pour
  toute mention de salon/rôle dans un message/template de ce bot, **jamais de texte brut
  `#nom-salon`** — utilise le format brut Discord `<#ID_SALON>`/`<@&ID_RÔLE>`, en récupérant les
  vrais IDs dans `reports/state.json` plutôt que de faire chercher l'utilisateur en mode
  développeur. Un règlement long dépasse souvent 2000 caractères (limite d'un message texte brut) :
  utilise le champ **Description d'un Embed** (limite 4096) à la place.
- **Veille automatisée (optionnelle)** : vérifie chaque flux RSS individuellement (requête HTTP
  réelle, code 200, contenu XML réel) avant de l'ajouter à `config/news_sources.yml` — ne devine
  jamais une URL. L'API X/Twitter n'est plus utilisable gratuitement depuis 2023, à exclure
  systématiquement. `npm run news` utilise l'API gratuite Google Gemini (clé sur
  aistudio.google.com/apikey) ; les règles créées côté AutoMod Discord sont désactivées par défaut,
  bien penser `enabled: true`. Une fois `NEWS_CHANNEL_KEY`/`NEWS_ROLE_KEY`/les secrets réellement
  configurés (repo GitHub + `gh secret set`), décommenter le bloc `schedule:` dans
  `.github/workflows/news.yml` — il est désactivé par défaut dans ce modèle pour ne pas déclencher
  d'exécutions/échecs inutiles tant que rien n'est configuré.

## Étape 7 — Audit final

```bash
npm run provision -- --audit
```

Vérifie qu'aucun rôle non-staff ne voit les salons privés/payants ni ne peut mentionner
`@everyone`, avant d'inviter qui que ce soit.

## Pièges techniques constatés (à ne pas redécouvrir)

- **Position des salons** : sans position explicite à la création, Discord place chaque nouveauté
  tout en haut de son groupe — l'ordre affiché se retrouve inversé. Le moteur de `apply.ts` calcule
  déjà ça automatiquement depuis l'ordre de `channels.yml` ; ne pas casser ce comportement.
- **AutoMod** : une seule règle de type "préréglage de mots-clés" autorisée par serveur, quel que
  soit le nombre de préréglages combinés. Règles créées désactivées par défaut. Regex sans
  lookahead/lookbehind/backreference (moteur Rust), 10 motifs max, 260 caractères chacun.
- **Onboarding** : pilotable par API (`guild.editOnboarding`), pas seulement manuel. Chaque option
  d'un questionnaire doit débloquer au moins un salon ou un rôle, sinon l'appel est rejeté.
- **Messages système natifs** : peuvent être coupés par API (`systemChannelFlags`) plutôt que de
  faire cliquer l'utilisateur sur 4 interrupteurs séparés.
- **Le dry-run actuel ne détecte que les écarts de nom/sujet des salons, pas les écarts de
  permissions.** Si l'utilisateur modifie une permission à la main dans Discord, ça n'apparaît pas
  comme un écart, mais `--apply` la réécrase silencieusement à la prochaine exécution. Si
  l'utilisateur confirme que c'est un choix volontaire, mets à jour `channels.yml` en conséquence
  plutôt que de laisser cette divergence non documentée.
- **Sécurité du dépôt** : avant tout `git add`/`git commit`, vérifie que le dossier de travail est
  bien celui du projet et pas le dossier utilisateur racine (un dépôt git enraciné là-bas mélangerait
  des fichiers personnels sensibles).
- **Patreon bloque tout accès automatisé** (navigateur comme requêtes directes, 403 systématique) :
  ne jamais promettre de récupérer un titre/contenu Patreon soi-même, demander à l'utilisateur.
