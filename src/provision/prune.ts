import type { Guild } from "discord.js";
import type { StateMap } from "./state.js";

export interface UntrackedChannel {
  id: string;
  name: string;
  type: string;
}

/** Salons/catégories présents sur le serveur mais absents de reports/state.json (donc pas créés par ce provisioner). */
export async function findUntrackedChannels(guild: Guild, state: StateMap): Promise<UntrackedChannel[]> {
  const trackedIds = new Set(Object.entries(state).filter(([k]) => k.startsWith("channel:")).map(([, v]) => v));
  const channels = [...(await guild.channels.fetch()).values()].filter((c) => c !== null);
  return channels.filter((c) => !trackedIds.has(c.id)).map((c) => ({ id: c.id, name: c.name, type: String(c.type) }));
}

export async function pruneChannels(guild: Guild, targets: UntrackedChannel[]): Promise<{ id: string; name: string; status: "deleted" | "failed"; detail?: string }[]> {
  const results: { id: string; name: string; status: "deleted" | "failed"; detail?: string }[] = [];
  // catégories en dernier (les enfants doivent être supprimés avant, sinon Discord bloque/orpheline le salon)
  const ordered = [...targets].sort((a, b) => (a.type === "4" ? 1 : 0) - (b.type === "4" ? 1 : 0));
  for (const t of ordered) {
    try {
      const channel = await guild.channels.fetch(t.id).catch(() => null);
      if (channel) await channel.delete("discord-server-agent provisioner --prune : salon hors config (template Discord)");
      results.push({ id: t.id, name: t.name, status: "deleted" });
    } catch (err) {
      results.push({ id: t.id, name: t.name, status: "failed", detail: String(err) });
    }
  }
  return results;
}
