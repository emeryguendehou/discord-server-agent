import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { load as loadYaml } from "js-yaml";
import { z } from "zod";

const PermissionOverwriteSchema = z.object({
  targetKey: z.string(),
  targetType: z.enum(["role", "member"]).default("role"),
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
});
export type PermissionOverwrite = z.infer<typeof PermissionOverwriteSchema>;

export const RoleConfigSchema = z.object({
  key: z.string(),
  name: z.string(),
  color: z.string().optional(),
  hoist: z.boolean().default(false),
  mentionable: z.boolean().default(false),
  permissions: z.array(z.string()).default([]),
  note: z.string().optional(),
});

export const ChannelConfigSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.enum(["category", "text", "voice", "announcement", "forum", "stage"]),
  categoryKey: z.string().optional(),
  topic: z.string().optional(),
  nsfw: z.boolean().default(false),
  slowmodeSeconds: z.number().default(0),
  forumTags: z.array(z.string()).default([]),
  /** Groupe (clé de permissions.yml groups) autorisé à VOIR ce salon ; hérité de la catégorie si absent. */
  viewGroup: z.string().optional(),
  /** Groupe autorisé à ENVOYER des messages / créer des posts de forum ; hérité de la catégorie si absent. */
  sendGroup: z.string().optional(),
  /** Pour les forums : groupe autorisé à répondre dans les fils existants sans pouvoir créer de nouveau sujet. */
  replyGroup: z.string().optional(),
  /** Overwrites explicites supplémentaires, appliqués après résolution des groupes ci-dessus. */
  extraOverwrites: z.array(PermissionOverwriteSchema).default([]),
  /** Rempli par la résolution des groupes (src/provision/resolve.ts) ; ne pas renseigner à la main. */
  permissionOverwrites: z.array(PermissionOverwriteSchema).default([]),
});

export const ServerConfigSchema = z.object({
  name: z.string(),
  verificationLevel: z.enum(["none", "low", "medium", "high", "very_high"]).optional(),
  explicitContentFilter: z.enum(["disabled", "members_without_roles", "all_members"]).optional(),
  afkTimeoutSeconds: z.number().optional(),
  community: z
    .object({
      rulesChannelKey: z.string(),
      publicUpdatesChannelKey: z.string(),
    })
    .optional(),
  everyone: z
    .object({
      allow: z.array(z.string()).default([]),
      deny: z.array(z.string()).default([]),
    })
    .optional(),
  // Messages système à couper — section 10.1. Bits préservés en plus de l'existant (pas d'écrasement).
  systemMessages: z
    .object({
      suppressJoinNotifications: z.boolean().default(true),
      suppressJoinNotificationReplies: z.boolean().default(true),
      suppressGuildReminderNotifications: z.boolean().default(true),
    })
    .optional(),
  onboarding: z
    .object({
      enabled: z.boolean().default(true),
      mode: z.enum(["default", "advanced"]).default("default"),
      defaultChannelKeys: z.array(z.string()).default([]),
      prompts: z
        .array(
          z.object({
            title: z.string(),
            singleSelect: z.boolean().default(false),
            required: z.boolean().default(false),
            options: z.array(
              z.object({
                title: z.string(),
                description: z.string().optional(),
                roleKeys: z.array(z.string()).default([]),
                channelKeys: z.array(z.string()).default([]),
              })
            ),
          })
        )
        .default([]),
    })
    .optional(),
  palette: z.record(z.string(), z.string()).default({}),
});

export const AutomodRuleConfigSchema = z.object({
  key: z.string(),
  name: z.string(),
  eventType: z.string(),
  triggerType: z.string(),
  presetType: z.array(z.string()).default([]),
  regexPatterns: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
  alertChannelKey: z.string().optional(),
  exemptRoleKeys: z.array(z.string()).default([]),
  exemptChannelKeys: z.array(z.string()).default([]),
  note: z.string().optional(),
});

export const IntegrationConfigSchema = z.object({
  key: z.string(),
  provider: z.string(),
  description: z.string().optional(),
  grantsRoleKeys: z.array(z.string()).default([]),
  automatable: z.boolean().default(false),
  manualSteps: z.array(z.string()).default([]),
  completed: z.boolean().default(false),
});

export const PanelConfigSchema = z.object({
  key: z.string(),
  channelKey: z.string(),
  title: z.string(),
  content: z.string(),
  maintainedBy: z.string().optional(),
});

export const PartnerConfigSchema = z.object({
  key: z.string(),
  name: z.string(),
  url: z.string(),
  offer: z.string(),
});

export const CatalogItemConfigSchema = z.object({
  key: z.string(),
  name: z.string(),
  priceLabel: z.string().optional(),
  patreonUrl: z.string().optional(),
});

export const GroupsConfigSchema = z.object({
  groups: z.record(z.string(), z.array(z.string())).default({}),
});

export const RootConfigSchema = z.object({
  server: ServerConfigSchema.optional(),
  roles: z.array(RoleConfigSchema).default([]),
  channels: z.array(ChannelConfigSchema).default([]),
  automod: z.array(AutomodRuleConfigSchema).default([]),
  integrations: z.array(IntegrationConfigSchema).default([]),
  panels: z.array(PanelConfigSchema).default([]),
  partners: z.array(PartnerConfigSchema).default([]),
  catalog: z.array(CatalogItemConfigSchema).default([]),
  groups: z.record(z.string(), z.array(z.string())).default({}),
});

export type RootConfig = z.infer<typeof RootConfigSchema>;
export type RoleConfig = z.infer<typeof RoleConfigSchema>;
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

function loadYamlFile<T>(configDir: string, filename: string): T | undefined {
  const path = join(configDir, filename);
  if (!existsSync(path)) return undefined;
  const raw = readFileSync(path, "utf8");
  return loadYaml(raw) as T;
}

export function configFilesPresent(configDir: string): string[] {
  const expected = [
    "server.yml",
    "roles.yml",
    "channels.yml",
    "permissions.yml",
    "automod.yml",
    "integrations.yml",
    "panels.yml",
    "partners.yml",
    "catalog.yml",
  ];
  return expected.filter((f) => existsSync(join(configDir, f)));
}

export function loadConfig(configDir: string): RootConfig {
  const server = loadYamlFile<unknown>(configDir, "server.yml");
  const roles = loadYamlFile<unknown>(configDir, "roles.yml") ?? [];
  const channels = loadYamlFile<unknown>(configDir, "channels.yml") ?? [];
  const automod = loadYamlFile<unknown>(configDir, "automod.yml") ?? [];
  const integrations = loadYamlFile<unknown>(configDir, "integrations.yml") ?? [];
  const panels = loadYamlFile<unknown>(configDir, "panels.yml") ?? [];
  const partners = loadYamlFile<unknown>(configDir, "partners.yml") ?? [];
  const catalog = loadYamlFile<unknown>(configDir, "catalog.yml") ?? [];
  const permissions = loadYamlFile<{ groups?: Record<string, string[]> }>(configDir, "permissions.yml");

  return RootConfigSchema.parse({
    server,
    roles,
    channels,
    automod,
    integrations,
    panels,
    partners,
    catalog,
    groups: permissions?.groups ?? {},
  });
}
