import type { RootConfig, ChannelConfig, PermissionOverwrite } from "../config/schema.js";

const EVERYONE = "everyone";

function overwrite(targetKey: string, allow: string[], deny: string[]): PermissionOverwrite {
  return { targetKey, targetType: "role", allow, deny };
}

/**
 * Résout viewGroup/sendGroup/replyGroup (hérités de la catégorie si absents sur le salon)
 * en overwrites Discord concrets. Un salon ne "sync" pas automatiquement avec sa catégorie
 * côté API : chaque salon reçoit donc sa propre copie explicite des overwrites voulus.
 */
export function resolvePermissionOverwrites(config: RootConfig): ChannelConfig[] {
  const groups = config.groups;
  const categories = new Map(config.channels.filter((c) => c.type === "category").map((c) => [c.key, c]));

  const groupMembers = (groupKey?: string): string[] => {
    if (!groupKey || groupKey === EVERYONE) return [];
    return groups[groupKey] ?? [];
  };

  return config.channels.map((channel) => {
    const category = channel.categoryKey ? categories.get(channel.categoryKey) : undefined;
    const viewGroup = channel.viewGroup ?? category?.viewGroup;
    const sendGroup = channel.sendGroup ?? category?.sendGroup;
    const replyGroup = channel.replyGroup ?? category?.replyGroup;

    const overwrites: PermissionOverwrite[] = [];
    const viewers = groupMembers(viewGroup);
    const isViewRestricted = Boolean(viewGroup && viewGroup !== EVERYONE);

    if (isViewRestricted) {
      overwrites.push(overwrite(EVERYONE, [], ["ViewChannel"]));
      for (const roleKey of viewers) {
        overwrites.push(overwrite(roleKey, ["ViewChannel"], []));
      }
    }

    if (sendGroup) {
      const senders = groupMembers(sendGroup);
      const sendPerm = channel.type === "forum" ? "SendMessages" : "SendMessages";

      if (isViewRestricted) {
        for (const roleKey of viewers) {
          if (!senders.includes(roleKey)) overwrites.push(overwrite(roleKey, [], [sendPerm]));
        }
      } else {
        overwrites.push(overwrite(EVERYONE, [], [sendPerm]));
      }
      for (const roleKey of senders) {
        overwrites.push(overwrite(roleKey, [sendPerm], []));
      }
    }

    if (replyGroup && channel.type === "forum") {
      for (const roleKey of groupMembers(replyGroup)) {
        overwrites.push(overwrite(roleKey, ["SendMessagesInThreads"], []));
      }
    }

    return {
      ...channel,
      permissionOverwrites: mergeOverwrites([...overwrites, ...channel.extraOverwrites]),
    };
  });
}

/** Fusionne les overwrites par cible (un salon ne peut avoir qu'un seul overwrite par rôle côté API). */
function mergeOverwrites(list: PermissionOverwrite[]): PermissionOverwrite[] {
  const byTarget = new Map<string, PermissionOverwrite>();
  for (const ow of list) {
    const existing = byTarget.get(ow.targetKey);
    if (!existing) {
      byTarget.set(ow.targetKey, { ...ow, allow: [...ow.allow], deny: [...ow.deny] });
      continue;
    }
    for (const perm of ow.allow) {
      if (!existing.allow.includes(perm)) existing.allow.push(perm);
      existing.deny = existing.deny.filter((p) => p !== perm);
    }
    for (const perm of ow.deny) {
      if (!existing.deny.includes(perm)) existing.deny.push(perm);
      existing.allow = existing.allow.filter((p) => p !== perm);
    }
  }
  return [...byTarget.values()];
}
