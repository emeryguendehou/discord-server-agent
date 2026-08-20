import type { RoleConfigSchema, ChannelConfigSchema, RootConfig } from "../config/schema.js";
import type { z } from "zod";
import type { StateMap } from "./state.js";

export type ActionType = "CREATE" | "UPDATE" | "MOVE" | "NO_CHANGE" | "MANUAL_ACTION";

export interface PlannedAction {
  type: ActionType;
  kind: "role" | "channel" | "server" | "automod" | "integration";
  key: string;
  label: string;
  reason?: string;
  diff?: Record<string, { from: unknown; to: unknown }>;
}

type RoleConfig = z.infer<typeof RoleConfigSchema>;
type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

interface ActualRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  permissions: string;
  position: number;
}

interface ActualChannel {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  topic: string | null;
  position: number;
  nsfw: boolean;
  rateLimitPerUser: number;
}

export function planRoles(
  desired: RoleConfig[],
  actual: ActualRole[],
  state: StateMap
): PlannedAction[] {
  const actions: PlannedAction[] = [];

  for (const role of desired) {
    const knownId = state[`role:${role.key}`];
    const existing = knownId ? actual.find((r) => r.id === knownId) : undefined;

    if (!existing) {
      actions.push({
        type: "CREATE",
        kind: "role",
        key: role.key,
        label: `CREATE rôle "${role.name}"`,
      });
      continue;
    }

    const diff: Record<string, { from: unknown; to: unknown }> = {};
    if (existing.name !== role.name) diff.name = { from: existing.name, to: role.name };
    if (existing.hoist !== role.hoist) diff.hoist = { from: existing.hoist, to: role.hoist };
    if (existing.mentionable !== role.mentionable)
      diff.mentionable = { from: existing.mentionable, to: role.mentionable };

    if (Object.keys(diff).length > 0) {
      actions.push({
        type: "UPDATE",
        kind: "role",
        key: role.key,
        label: `UPDATE rôle "${role.name}"`,
        diff,
      });
    } else {
      actions.push({
        type: "NO_CHANGE",
        kind: "role",
        key: role.key,
        label: `NO_CHANGE rôle "${role.name}"`,
      });
    }
  }

  return actions;
}

export function planChannels(
  desired: ChannelConfig[],
  actual: ActualChannel[],
  state: StateMap
): PlannedAction[] {
  const actions: PlannedAction[] = [];

  for (const channel of desired) {
    const knownId = state[`channel:${channel.key}`];
    const existing = knownId ? actual.find((c) => c.id === knownId) : undefined;

    if (!existing) {
      actions.push({
        type: "CREATE",
        kind: "channel",
        key: channel.key,
        label: `CREATE ${channel.type} "${channel.name}"`,
      });
      continue;
    }

    const supportsTopic = channel.type === "text" || channel.type === "announcement" || channel.type === "forum" || channel.type === "stage";

    const diff: Record<string, { from: unknown; to: unknown }> = {};
    if (existing.name !== channel.name) diff.name = { from: existing.name, to: channel.name };
    if (supportsTopic && (existing.topic ?? "") !== (channel.topic ?? ""))
      diff.topic = { from: existing.topic, to: channel.topic };

    const expectedParentId = channel.categoryKey ? state[`channel:${channel.categoryKey}`] : null;
    if ((existing.parentId ?? null) !== (expectedParentId ?? null)) {
      actions.push({
        type: "MOVE",
        kind: "channel",
        key: channel.key,
        label: `MOVE "${channel.name}" -> catégorie "${channel.categoryKey ?? "(racine)"}"`,
      });
      continue;
    }

    if (Object.keys(diff).length > 0) {
      actions.push({
        type: "UPDATE",
        kind: "channel",
        key: channel.key,
        label: `UPDATE ${channel.type} "${channel.name}"`,
        diff,
      });
    } else {
      actions.push({
        type: "NO_CHANGE",
        kind: "channel",
        key: channel.key,
        label: `NO_CHANGE ${channel.type} "${channel.name}"`,
      });
    }
  }

  return actions;
}

/**
 * Points nécessitant une action manuelle (dashboard tiers) ou une décision du propriétaire,
 * dérivés du contenu réel de config/*.yml — jamais inventés.
 */
export function manualActionChecklist(config: RootConfig): PlannedAction[] {
  const actions: PlannedAction[] = [];

  // community_activation : fait (Community active, vérifié via guild.features).
  // native_welcome_message : automatisé (voir applyServerSettings, server.yml.systemMessages).
  // bot_role_hierarchy : pas nécessaire en pratique — la création a réussi sans Administrator avec un
  //   jeu de permissions plus étroit (ManageRoles/ManageChannels/ManageGuild/ManageWebhooks).

  // rules_screening : résolu -- vérifié en direct via guild.features (aucun MEMBER_VERIFICATION_GATE_ENABLED,
  // l'ancien mécanisme séparé). Sur les serveurs Onboarding modernes (notre cas : GUILD_ONBOARDING actif +
  // rulesChannelId défini), l'acceptation du règlement est intégrée au flux Onboarding lui-même.

  // Onboarding est désormais géré automatiquement par --apply (guild.editOnboarding), voir server.yml.onboarding.

  actions.push({
    type: "MANUAL_ACTION",
    kind: "server",
    key: "verification_level_decision",
    label: "Vérifier verificationLevel / explicitContentFilter (déjà définis par l'assistant Community de Discord)",
    reason:
      "Non précisés par une valeur exacte dans les documents (spec section 9). Discord les a déjà positionnés " +
      "lors de l'activation de Community (constaté : verificationLevel=Low, explicitContentFilter=AllMembers) — " +
      "à durcir toi-même si tu veux un niveau plus strict, je n'invente pas une valeur à ta place.",
  });

  for (const rule of config.automod) {
    if (rule.note?.startsWith("DECISION_REQUIRED")) {
      actions.push({
        type: "MANUAL_ACTION",
        kind: "automod",
        key: rule.key,
        label: `DECISION_REQUIRED : ${rule.name}`,
        reason: rule.note,
      });
    }
  }

  for (const integration of config.integrations) {
    if (integration.completed) continue;
    actions.push({
      type: "MANUAL_ACTION",
      kind: "integration",
      key: integration.key,
      label: `${integration.provider} — ${integration.description ?? integration.key}`,
      reason: integration.manualSteps.join(" | "),
    });
  }

  return actions;
}
