import {
  ChannelType,
  PermissionsBitField,
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  AutoModerationRuleKeywordPresetType,
  GuildOnboardingMode,
  SystemChannelFlagsBitField,
  type Guild,
  type ColorResolvable,
} from "discord.js";
import type { RoleConfig, ChannelConfig, AutomodRuleConfigSchema, ServerConfigSchema } from "../config/schema.js";
import type { z } from "zod";
import type { StateMap } from "./state.js";

type AutomodRuleConfig = z.infer<typeof AutomodRuleConfigSchema>;
type ServerConfig = z.infer<typeof ServerConfigSchema>;

export interface ApplyResult {
  key: string;
  label: string;
  status: "created" | "updated" | "unchanged" | "degraded" | "failed" | "skipped";
  detail?: string;
}

const CHANNEL_TYPE_MAP: Record<ChannelConfig["type"], ChannelType> = {
  category: ChannelType.GuildCategory,
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
  stage: ChannelType.GuildStageVoice,
};

const PRESET_MAP: Record<string, AutoModerationRuleKeywordPresetType> = {
  PROFANITY: AutoModerationRuleKeywordPresetType.Profanity,
  SEXUAL_CONTENT: AutoModerationRuleKeywordPresetType.SexualContent,
  SLURS: AutoModerationRuleKeywordPresetType.Slurs,
};

const TRIGGER_MAP: Record<string, AutoModerationRuleTriggerType> = {
  SPAM: AutoModerationRuleTriggerType.Spam,
  KEYWORD_PRESET: AutoModerationRuleTriggerType.KeywordPreset,
  KEYWORD: AutoModerationRuleTriggerType.Keyword,
};

function resolveTarget(targetKey: string, guild: Guild, state: StateMap): string | undefined {
  return targetKey === "everyone" ? guild.id : state[`role:${targetKey}`];
}

/**
 * Position Discord = index dans le groupe (catégories entre elles ; salons au sein de leur catégorie),
 * calculé depuis l'ordre d'apparition dans channels.yml. Sans ça, Discord place chaque nouveau salon/
 * catégorie tout en haut de son groupe à la création, ce qui inverse l'ordre voulu (constaté en prod).
 */
function computePositions(channels: ChannelConfig[]): Map<string, number> {
  const positions = new Map<string, number>();
  let categoryIndex = 0;
  const siblingIndex = new Map<string, number>();
  for (const c of channels) {
    if (c.type === "category") {
      positions.set(c.key, categoryIndex++);
    } else {
      const bucket = c.categoryKey ?? "__root__";
      const idx = siblingIndex.get(bucket) ?? 0;
      positions.set(c.key, idx);
      siblingIndex.set(bucket, idx + 1);
    }
  }
  return positions;
}

export async function applyRoles(guild: Guild, roles: RoleConfig[], state: StateMap): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const botHasAdministrator = me.permissions.has(PermissionsBitField.Flags.Administrator);

  for (const role of roles) {
    const stateKey = `role:${role.key}`;
    const existingId = state[stateKey];
    let requestedPermissions = [...role.permissions];
    let degradedReason: string | undefined;

    if (requestedPermissions.includes("Administrator") && !botHasAdministrator) {
      requestedPermissions = requestedPermissions.filter((p) => p !== "Administrator");
      degradedReason =
        "Le bot n'a pas Administrator : impossible de l'accorder via l'API à ce rôle. " +
        "MANUAL_ACTION : cocher Administrator manuellement (Paramètres du serveur > Rôles).";
    }

    try {
      const payload = {
        name: role.name,
        color: (role.color ?? "Default") as ColorResolvable,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: new PermissionsBitField(requestedPermissions as never),
        reason: "discord-server-agent provisioner --apply",
      };

      const existing = existingId ? await guild.roles.fetch(existingId).catch(() => null) : null;
      if (existing) {
        await existing.edit(payload);
        results.push({ key: role.key, label: role.name, status: "updated", detail: degradedReason });
        continue;
      }

      const created = await guild.roles.create(payload);
      state[stateKey] = created.id;
      results.push({
        key: role.key,
        label: role.name,
        status: degradedReason ? "degraded" : "created",
        detail: degradedReason,
      });
    } catch (err) {
      results.push({ key: role.key, label: role.name, status: "failed", detail: String(err) });
    }
  }

  return results;
}

export async function applyChannels(
  guild: Guild,
  channels: ChannelConfig[],
  state: StateMap
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  const ordered = [...channels].sort((a) => (a.type === "category" ? -1 : 1));
  const positions = computePositions(channels);

  for (const channel of ordered) {
    const stateKey = `channel:${channel.key}`;
    const existingId = state[stateKey];
    const parentId = channel.categoryKey ? state[`channel:${channel.categoryKey}`] : undefined;

    if (channel.categoryKey && !parentId) {
      results.push({
        key: channel.key,
        label: channel.name,
        status: "failed",
        detail: `Catégorie parente "${channel.categoryKey}" introuvable dans l'état local — créer les catégories d'abord.`,
      });
      continue;
    }

    const permissionOverwrites = channel.permissionOverwrites
      .map((ow) => {
        const id = resolveTarget(ow.targetKey, guild, state);
        if (!id) return null;
        return { id, allow: ow.allow as never, deny: ow.deny as never };
      })
      .filter((x): x is { id: string; allow: never; deny: never } => x !== null);

    const hasTopic = channel.type === "text" || channel.type === "announcement" || channel.type === "forum" || channel.type === "stage";

    try {
      const basePayload = {
        name: channel.name,
        parent: parentId ?? null,
        topic: hasTopic ? channel.topic : undefined,
        nsfw: channel.nsfw,
        rateLimitPerUser: channel.slowmodeSeconds || undefined,
        position: positions.get(channel.key),
        permissionOverwrites,
        reason: "discord-server-agent provisioner --apply",
      };

      const existing = existingId ? await guild.channels.fetch(existingId).catch(() => null) : null;
      if (existing) {
        await existing.edit(basePayload as never);
        results.push({ key: channel.key, label: channel.name, status: "updated" });
        continue;
      }

      const created = await guild.channels.create({
        ...basePayload,
        type: CHANNEL_TYPE_MAP[channel.type] as never,
        ...(channel.type === "forum" && channel.forumTags.length > 0
          ? { availableTags: channel.forumTags.map((name) => ({ name })) }
          : {}),
      } as never);
      state[stateKey] = created.id;
      results.push({ key: channel.key, label: channel.name, status: "created" });
    } catch (err) {
      results.push({ key: channel.key, label: channel.name, status: "failed", detail: String(err) });
    }
  }

  return results;
}

export async function applyAutomod(
  guild: Guild,
  rules: AutomodRuleConfig[],
  state: StateMap
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  for (const rule of rules) {
    if (rule.triggerType === "KEYWORD" && rule.regexPatterns.length === 0) {
      results.push({
        key: rule.key,
        label: rule.name,
        status: "skipped",
        detail: rule.note ?? "Aucun mot-clé/regex fourni — règle non créée (DECISION_REQUIRED).",
      });
      continue;
    }

    const stateKey = `automod:${rule.key}`;
    const existingId = state[stateKey];
    const alertChannelId = rule.alertChannelKey ? state[`channel:${rule.alertChannelKey}`] : undefined;
    const exemptRoles = rule.exemptRoleKeys.map((k) => state[`role:${k}`]).filter((v): v is string => Boolean(v));

    const actions = rule.actions
      .map((a) => {
        if (a === "BlockMessage") return { type: AutoModerationActionType.BlockMessage };
        if (a === "SendAlert" && alertChannelId)
          return { type: AutoModerationActionType.SendAlertMessage, metadata: { channel: alertChannelId } };
        if (a === "Timeout") return { type: AutoModerationActionType.Timeout, metadata: { durationSeconds: 300 } };
        return null;
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    const triggerType = TRIGGER_MAP[rule.triggerType];
    if (!triggerType) {
      results.push({ key: rule.key, label: rule.name, status: "failed", detail: `triggerType inconnu: ${rule.triggerType}` });
      continue;
    }

    try {
      const payload = {
        name: rule.name,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType,
        triggerMetadata:
          rule.triggerType === "KEYWORD_PRESET"
            ? { presets: rule.presetType.map((p) => PRESET_MAP[p]).filter((p): p is AutoModerationRuleKeywordPresetType => p !== undefined) }
            : rule.triggerType === "KEYWORD"
              ? { regexPatterns: rule.regexPatterns }
              : undefined,
        actions,
        exemptRoles,
        enabled: true,
        reason: "discord-server-agent provisioner --apply",
      };

      const existing = existingId ? await guild.autoModerationRules.fetch(existingId).catch(() => null) : null;
      if (existing) {
        await existing.edit(payload as never);
        results.push({ key: rule.key, label: rule.name, status: "updated" });
        continue;
      }

      const created = await guild.autoModerationRules.create(payload as never);
      state[stateKey] = created.id;
      results.push({ key: rule.key, label: rule.name, status: "created" });
    } catch (err) {
      results.push({ key: rule.key, label: rule.name, status: "failed", detail: String(err) });
    }
  }

  return results;
}

export async function applyServerSettings(guild: Guild, server: ServerConfig | undefined): Promise<ApplyResult[]> {
  if (!server?.systemMessages) return [];
  const wanted = server.systemMessages;

  const current = new SystemChannelFlagsBitField(guild.systemChannelFlags ?? 0n);
  const next = new SystemChannelFlagsBitField(current);
  if (wanted.suppressJoinNotifications) next.add(SystemChannelFlagsBitField.Flags.SuppressJoinNotifications);
  if (wanted.suppressJoinNotificationReplies) next.add(SystemChannelFlagsBitField.Flags.SuppressJoinNotificationReplies);
  if (wanted.suppressGuildReminderNotifications) next.add(SystemChannelFlagsBitField.Flags.SuppressGuildReminderNotifications);

  if (next.bitfield === current.bitfield) {
    return [{ key: "system_messages", label: "Messages système natifs", status: "unchanged" }];
  }

  try {
    await guild.edit({ systemChannelFlags: next, reason: "discord-server-agent provisioner --apply" });
    return [{ key: "system_messages", label: "Messages système natifs", status: "updated" }];
  } catch (err) {
    return [{ key: "system_messages", label: "Messages système natifs", status: "failed", detail: String(err) }];
  }
}

export async function applyOnboarding(
  guild: Guild,
  server: ServerConfig | undefined,
  state: StateMap
): Promise<ApplyResult[]> {
  if (!server?.onboarding) return [];
  const onboarding = server.onboarding;

  const channelId = (key: string) => state[`channel:${key}`];
  const roleId = (key: string) => state[`role:${key}`];

  const defaultChannels = onboarding.defaultChannelKeys.map(channelId).filter((v): v is string => Boolean(v));

  const prompts = onboarding.prompts.map((prompt) => ({
    title: prompt.title,
    singleSelect: prompt.singleSelect,
    required: prompt.required,
    inOnboarding: true,
    options: prompt.options.map((opt) => ({
      title: opt.title,
      description: opt.description ?? null,
      roles: opt.roleKeys.map(roleId).filter((v): v is string => Boolean(v)),
      channels: opt.channelKeys.map(channelId).filter((v): v is string => Boolean(v)),
    })),
  }));

  try {
    await guild.editOnboarding({
      enabled: onboarding.enabled,
      mode: onboarding.mode === "advanced" ? GuildOnboardingMode.OnboardingAdvanced : GuildOnboardingMode.OnboardingDefault,
      defaultChannels,
      prompts: prompts as never,
      reason: "discord-server-agent provisioner --apply",
    });
    return [{ key: "onboarding", label: "Community Onboarding", status: "updated" }];
  } catch (err) {
    return [{ key: "onboarding", label: "Community Onboarding", status: "failed", detail: String(err) }];
  }
}
