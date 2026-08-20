import type { DigestItem } from "./summarize.js";

export interface FormattedDigest {
  content: string;
  embedTitle: string;
  embedDescription: string;
  embedColor: number;
}

export function formatDigest(items: DigestItem[], actualitesRoleId: string): FormattedDigest {
  const date = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });

  const embedDescription = items
    .map(
      (item) =>
        `**${item.title}**\n` +
        `📌 Ce qui change : ${item.whatChanges}\n` +
        `💡 Pourquoi c'est important : ${item.whyImportant}\n` +
        `🎯 Pour qui : ${item.forWhom}\n` +
        `🔗 Source : ${item.sourceLink}`
    )
    .join("\n\n");

  return {
    content: `<@&${actualitesRoleId}>`,
    embedTitle: `📰 Actualités IA — ${date}`,
    embedDescription,
    embedColor: 0x4dB7FF,
  };
}
