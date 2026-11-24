require('dotenv').config();

const configuredRefreshSeconds = Number(process.env.STATUS_REFRESH_SECONDS || 30);
const configuredRestartTimes = process.env.DEFAULT_RESTART_TIMES || '08:00';

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  serverName: process.env.SERVER_NAME || 'Midtown RP',
  discordInviteUrl: process.env.DISCORD_INVITE_URL || 'https://discord.gg/wt98VaUHF',
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  defaultRestartTimes: configuredRestartTimes.split(',').map((time) => time.trim()).filter(Boolean),
  statusChannelId: process.env.STATUS_CHANNEL_ID || '1554672512556732566',
  defaultServerEndpoint: process.env.FIVEM_SERVER_ADDRESS || process.env.FIVEM_STATUS_URL || '51.79.162.71:28348',
  defaultConnectAddress: process.env.FIVEM_CONNECT_ADDRESS || '51.79.162.71:28348',
  managerRoleIds: (process.env.MANAGER_ROLE_IDS || '1554467538291916820,1564884642757345362')
    .split(/[\s,;]+/)
    .map((id) => id.trim())
    .filter(Boolean),
  pterodactylPanelUrl: process.env.PTERODACTYL_PANEL_URL || '',
  pterodactylServerId: process.env.PTERODACTYL_SERVER_ID || '',
  pterodactylApiKey: process.env.PTERODACTYL_API_KEY || '',
  statusRefreshMs: Math.max(30_000, (Number.isFinite(configuredRefreshSeconds) ? configuredRefreshSeconds : 60) * 1000),
  restartWebhookUrl: process.env.FIVEM_RESTART_WEBHOOK_URL || '',
  restartWebhookToken: process.env.FIVEM_RESTART_WEBHOOK_TOKEN || '',
};
