import type { Guild } from "discord.js";

export async function snapshotRoles(guild: Guild) {
  const roles = await guild.roles.fetch();
  return [...roles.values()]
    .filter((r) => r.id !== guild.id) // exclut @everyone du diff par rôle nommé
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      mentionable: r.mentionable,
      permissions: r.permissions.bitfield.toString(),
      position: r.position,
    }));
}

export async function snapshotChannels(guild: Guild) {
  const channels = await guild.channels.fetch();
  return [...channels.values()]
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: String(c.type),
      parentId: "parentId" in c ? c.parentId : null,
      topic: "topic" in c ? (c.topic ?? null) : null,
      position: "position" in c ? c.position : 0,
      nsfw: "nsfw" in c ? Boolean(c.nsfw) : false,
      rateLimitPerUser: "rateLimitPerUser" in c ? (c.rateLimitPerUser ?? 0) : 0,
    }));
}
