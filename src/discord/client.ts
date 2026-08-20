import { Client, GatewayIntentBits } from "discord.js";

export function createProvisionerClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds],
  });
}

export async function loginAndFetchGuild(token: string, guildId: string) {
  const client = createProvisionerClient();
  await client.login(token);
  const guild = await client.guilds.fetch(guildId);
  return { client, guild };
}
