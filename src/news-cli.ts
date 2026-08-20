import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import chalk from "chalk";
import { loadNewsSources } from "./news/sources.js";
import { fetchAllSources, filterRecent } from "./news/fetch.js";
import { loadSeenLedger, saveSeenLedger, filterUnseen, markSeen } from "./news/dedupe.js";
import { summarizeDigest } from "./news/summarize.js";
import { formatDigest } from "./news/post.js";
import { loginAndFetchGuild } from "./discord/client.js";

loadEnv();

const SOURCES_PATH = "config/news_sources.yml";
const LEDGER_PATH = "reports/news-seen.json";
const MAX_AGE_HOURS = 30; // fenêtre glissante pour un run quotidien, avec marge

const TARGET_HOUR = Number(process.env.NEWS_HOUR ?? "12");
const TARGET_TZ = process.env.NEWS_TIMEZONE ?? "Europe/Paris";
const CHANNEL_KEY = process.env.NEWS_CHANNEL_KEY;
const ROLE_KEY = process.env.NEWS_ROLE_KEY;
const SERVER_NAME = process.env.SERVER_NAME ?? "ce serveur";
const NEWS_TOPICS = process.env.NEWS_TOPICS ?? "actualités générales";

function isTargetHour(): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: TARGET_TZ, hour: "numeric", hour12: false }).format(new Date())
  );
  return hour === TARGET_HOUR;
}

async function main() {
  // Le cron GitHub Actions est en UTC fixe (pas d'ajustement heure d'été/hiver) : programmer le workflow
  // pour se déclencher 2x/jour (couvrant les deux cas de décalage) et laisser ce garde-fou n'agir que sur
  // le run tombant réellement sur NEWS_HOUR / NEWS_TIMEZONE.
  if (!isTargetHour() && process.env.FORCE_RUN !== "true") {
    console.log(chalk.dim(`Hors fenêtre ${TARGET_HOUR}h ${TARGET_TZ} -- run ignoré (FORCE_RUN=true pour forcer).`));
    return;
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!token || !guildId) throw new Error("DISCORD_BOT_TOKEN et DISCORD_GUILD_ID requis dans .env");
  if (!geminiKey) throw new Error("GEMINI_API_KEY requis dans .env (clé gratuite sur aistudio.google.com/apikey)");
  if (!CHANNEL_KEY || !ROLE_KEY) {
    throw new Error(
      "NEWS_CHANNEL_KEY et NEWS_ROLE_KEY requis dans .env -- doivent correspondre aux clés utilisées dans " +
        "config/channels.yml et config/roles.yml pour le salon et le rôle de veille."
    );
  }

  const sources = loadNewsSources(SOURCES_PATH);
  console.log(chalk.dim(`Sources chargées : ${sources.length}`));

  const allItems = await fetchAllSources(sources);
  console.log(chalk.dim(`Items collectés : ${allItems.length}`));

  const recent = filterRecent(allItems, MAX_AGE_HOURS);
  const ledger = loadSeenLedger(LEDGER_PATH);
  const unseen = filterUnseen(recent, ledger);
  console.log(chalk.dim(`Nouveaux items (récents + jamais vus) : ${unseen.length}`));

  if (unseen.length === 0) {
    console.log(chalk.yellow("Rien de nouveau -- aucun appel Gemini, aucune publication."));
    return;
  }

  const digestItems = await summarizeDigest(unseen, geminiKey, process.env.GEMINI_MODEL, SERVER_NAME, NEWS_TOPICS);
  console.log(chalk.dim(`Items retenus : ${digestItems.length}`));

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/news-latest.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), candidates: unseen.length, digestItems }, null, 2) + "\n",
    "utf8"
  );

  if (digestItems.length === 0) {
    console.log(chalk.yellow("Aucune info jugée assez forte aujourd'hui -- pas de publication (objectif qualitatif)."));
    saveSeenLedger(LEDGER_PATH, markSeen(ledger, unseen));
    return;
  }

  const state = JSON.parse(readFileSync("reports/state.json", "utf8")) as Record<string, string>;
  const channelId = state[`channel:${CHANNEL_KEY}`];
  const roleId = state[`role:${ROLE_KEY}`];
  if (!channelId || !roleId) {
    throw new Error(`channel:${CHANNEL_KEY} ou role:${ROLE_KEY} absent de reports/state.json -- lance --apply d'abord.`);
  }

  const { client, guild } = await loginAndFetchGuild(token, guildId);
  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel?.isTextBased()) throw new Error("Salon de veille introuvable ou non textuel");
    const digest = formatDigest(digestItems, roleId);
    await channel.send({
      content: digest.content,
      embeds: [{ title: digest.embedTitle, description: digest.embedDescription, color: digest.embedColor }],
    });
    console.log(chalk.green(`Digest publié (${digestItems.length} info(s)).`));
    saveSeenLedger(LEDGER_PATH, markSeen(ledger, unseen));
  } finally {
    client.destroy();
  }
}

main().catch((err) => {
  console.error(chalk.red("Erreur:"), err);
  process.exitCode = 1;
});
