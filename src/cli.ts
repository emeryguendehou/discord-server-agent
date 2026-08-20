import { writeFileSync, mkdirSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { Command } from "commander";
import chalk from "chalk";
import { configFilesPresent, loadConfig } from "./config/schema.js";
import { loginAndFetchGuild } from "./discord/client.js";
import { snapshotRoles, snapshotChannels } from "./discord/snapshot.js";
import { loadState, saveState } from "./provision/state.js";
import { planRoles, planChannels, manualActionChecklist, type PlannedAction } from "./provision/plan.js";
import { resolvePermissionOverwrites } from "./provision/resolve.js";
import {
  applyRoles,
  applyChannels,
  applyAutomod,
  applyOnboarding,
  applyServerSettings,
  type ApplyResult,
} from "./provision/apply.js";
import { findUntrackedChannels, pruneChannels } from "./provision/prune.js";
import { auditRoleVisibility } from "./audit/index.js";

loadEnv();

const CONFIG_DIR = "config";
const STATE_PATH = "reports/state.json";

const program = new Command();
program
  .name("provision")
  .description("Provisioner IaC pour serveur Discord (config déclarative -> dry-run/apply/audit)")
  .option("--dry-run", "calcule le plan de changements sans rien appliquer (défaut)")
  .option("--apply", "applique le plan calculé sur le serveur Discord")
  .option("--audit", "vérifie la visibilité des salons par rôle")
  .option("--role <name>", "restreint --audit à un seul rôle (par nom)")
  .option("--prune", "liste puis supprime les salons présents sur Discord mais absents de reports/state.json")
  .parse();

const opts = program.opts<{ dryRun?: boolean; apply?: boolean; audit?: boolean; role?: string; prune?: boolean }>();

function printPlan(actions: PlannedAction[]) {
  const color: Record<string, (s: string) => string> = {
    CREATE: chalk.green,
    UPDATE: chalk.yellow,
    MOVE: chalk.cyan,
    NO_CHANGE: chalk.gray,
    MANUAL_ACTION: chalk.red,
  };
  for (const action of actions) {
    const c = color[action.type] ?? ((s: string) => s);
    console.log(c(`[${action.type}] ${action.label}`));
    if (action.diff) {
      for (const [field, { from, to }] of Object.entries(action.diff)) {
        console.log(chalk.dim(`    ${field}: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`));
      }
    }
  }
  const summary = actions.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1;
    return acc;
  }, {});
  console.log("");
  console.log(chalk.bold("Résumé:"), JSON.stringify(summary));
}

function printApplyResults(label: string, results: ApplyResult[]) {
  const color: Record<ApplyResult["status"], (s: string) => string> = {
    created: chalk.green,
    updated: chalk.yellow,
    unchanged: chalk.gray,
    degraded: chalk.magenta,
    skipped: chalk.gray,
    failed: chalk.red,
  };
  console.log(chalk.bold(`\n${label}:`));
  for (const r of results) {
    const c = color[r.status];
    console.log(c(`  [${r.status}] ${r.label}`));
    if (r.detail) console.log(chalk.dim(`      ${r.detail}`));
  }
}

async function main() {
  const present = configFilesPresent(CONFIG_DIR);
  if (present.length === 0) {
    console.log(
      chalk.yellow(
        "Aucun fichier de configuration trouvé dans config/ (server.yml, roles.yml, channels.yml, permissions.yml, " +
          "automod.yml, integrations.yml, panels.yml, partners.yml, catalog.yml)."
      )
    );
    console.log(
      "Ces fichiers doivent être générés à partir des documents source (Spécifications maître + Cahier d'exécution) déposés dans docs/."
    );
    process.exitCode = 1;
    return;
  }

  const desired = loadConfig(CONFIG_DIR);
  desired.channels = resolvePermissionOverwrites(desired);

  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) {
    console.log(chalk.red("DISCORD_BOT_TOKEN et DISCORD_GUILD_ID doivent être définis dans .env"));
    process.exitCode = 1;
    return;
  }

  const { client, guild } = await loginAndFetchGuild(token, guildId);

  try {
    if (opts.audit) {
      const roleFilter = opts.role;
      const roles = [...(await guild.roles.fetch()).values()].filter(
        (r) => !roleFilter || r.name === roleFilter
      );
      for (const role of roles) {
        console.log(chalk.bold(`\nRôle: ${role.name}`));
        const visibility = await auditRoleVisibility(guild, role);
        for (const v of visibility) {
          const mark = v.visible ? chalk.green("visible") : chalk.gray("masqué");
          console.log(`  #${v.channelName}: ${mark}${v.canMentionEveryone ? chalk.red(" (peut @everyone)") : ""}`);
        }
      }
      return;
    }

    if (opts.prune) {
      const state = loadState(STATE_PATH);
      const untracked = await findUntrackedChannels(guild, state);
      if (untracked.length === 0) {
        console.log(chalk.green("Aucun salon hors config trouvé."));
        return;
      }
      console.log(chalk.bold(`${untracked.length} salon(s) hors config (probablement le template Discord) :`));
      for (const u of untracked) console.log(`  - ${u.name} (type ${u.type})`);
      const results = await pruneChannels(guild, untracked);
      for (const r of results) {
        const c = r.status === "deleted" ? chalk.green : chalk.red;
        console.log(c(`  [${r.status}] ${r.name}${r.detail ? " — " + r.detail : ""}`));
      }
      return;
    }

    const state = loadState(STATE_PATH);
    const [actualRoles, actualChannels] = await Promise.all([
      snapshotRoles(guild),
      snapshotChannels(guild),
    ]);

    const actions = [
      ...planRoles(desired.roles, actualRoles, state),
      ...planChannels(desired.channels, actualChannels, state),
      ...manualActionChecklist(desired),
    ];

    printPlan(actions);

    mkdirSync("reports", { recursive: true });
    const report = {
      generatedAt: new Date().toISOString(),
      guildId,
      actions,
    };
    writeFileSync("reports/plan-latest.json", JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(chalk.dim("\nPlan écrit dans reports/plan-latest.json"));

    if (opts.apply) {
      const isCommunity = guild.features.includes("COMMUNITY");
      const COMMUNITY_GATED_TYPES = new Set(["forum", "announcement", "stage"]);

      console.log(
        chalk.bold.red(
          isCommunity
            ? "\n=== APPLY (passe 2 : Community active — forums, annonces, stage inclus) ==="
            : "\n=== APPLY (passe 1 : rôles, catégories, salons classiques, AutoMod) ==="
        )
      );
      if (!isCommunity) {
        console.log(
          chalk.dim(
            "Les salons forum/announcement/stage sont exclus de cette passe : confirmé empiriquement que Discord " +
              "les refuse (Invalid Form Body / 'Cannot execute action on this channel type') tant que Community " +
              "n'est pas activée (voir MANUAL_ACTION 'community_activation'). Relance --apply après l'avoir activée."
          )
        );
      }

      const serverResults = await applyServerSettings(guild, desired.server);

      const roleResults = await applyRoles(guild, desired.roles, state);
      saveState(STATE_PATH, state);

      const classicChannels = isCommunity
        ? desired.channels
        : desired.channels.filter((c) => !COMMUNITY_GATED_TYPES.has(c.type));
      const skippedForums = isCommunity ? [] : desired.channels.filter((c) => COMMUNITY_GATED_TYPES.has(c.type));
      const channelResults = await applyChannels(guild, classicChannels, state);
      saveState(STATE_PATH, state);

      const automodResults = await applyAutomod(guild, desired.automod, state);
      saveState(STATE_PATH, state);

      const onboardingResults = isCommunity
        ? await applyOnboarding(guild, desired.server, state)
        : [{ key: "onboarding", label: "Community Onboarding", status: "skipped" as const, detail: "En attente de Community." }];

      printApplyResults("Paramètres serveur", serverResults);
      printApplyResults("Rôles", roleResults);
      printApplyResults("Salons", channelResults);
      printApplyResults("AutoMod", automodResults);
      printApplyResults("Onboarding", onboardingResults);

      for (const gated of skippedForums) {
        console.log(chalk.yellow(`[skipped] ${gated.type} "${gated.name}" — en attente de Community (passe 2).`));
      }

      const allResults = [...serverResults, ...roleResults, ...channelResults, ...automodResults, ...onboardingResults];
      const applySummary = allResults.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});
      console.log("\n" + chalk.bold("Résumé apply:"), JSON.stringify(applySummary));

      writeFileSync(
        "reports/apply-latest.json",
        JSON.stringify(
          { generatedAt: new Date().toISOString(), guildId, results: allResults, skippedForums: skippedForums.map((f) => f.key) },
          null,
          2
        ) + "\n",
        "utf8"
      );
      console.log(chalk.dim("Rapport écrit dans reports/apply-latest.json ; état dans reports/state.json"));

      if (allResults.some((r) => r.status === "failed")) process.exitCode = 1;
    }
  } finally {
    client.destroy();
  }
}

main().catch((err) => {
  console.error(chalk.red("Erreur:"), err);
  process.exitCode = 1;
});
