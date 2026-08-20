import type { Guild, Role } from "discord.js";
import { PermissionsBitField } from "discord.js";

export interface ChannelVisibility {
  channelName: string;
  visible: boolean;
  canMentionEveryone: boolean;
}

/**
 * Simule la visibilité des salons pour un rôle donné en résolvant les
 * permission overwrites (rôle + @everyone), sans tenir compte des
 * overwrites par membre individuel.
 */
export async function auditRoleVisibility(guild: Guild, role: Role): Promise<ChannelVisibility[]> {
  const channels = await guild.channels.fetch();
  const results: ChannelVisibility[] = [];

  for (const channel of channels.values()) {
    if (!channel || !("permissionsFor" in channel)) continue;
    const perms = channel.permissionsFor(role);
    if (!perms) continue;
    results.push({
      channelName: channel.name,
      visible: perms.has(PermissionsBitField.Flags.ViewChannel),
      canMentionEveryone: perms.has(PermissionsBitField.Flags.MentionEveryone),
    });
  }

  return results;
}
