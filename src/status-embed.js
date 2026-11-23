const { EmbedBuilder } = require('discord.js');

const green = 0x32c878;
const red = 0xed4245;
const amber = 0xf1b642;
const pink = 0xf23891;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unavailable';
  const gb = bytes / (1024 ** 3);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

function makeStatusEmbed({ serverName, snapshot, settings, nextRestartText, updatedAt, logoUrl = null, bannerUrl = null }) {
  const { fivem, panel, online } = snapshot;
  const color = online === true ? green : online === false ? red : amber;
  const headline = online === true ? '🟢 ONLINE' : online === false ? '🔴 OFFLINE' : '🟡 SETUP REQUIRED';
  const liveName = fivem.serverName || serverName;
  const playerLine = fivem.players === null || fivem.players === undefined
    ? 'Unavailable'
    : `${fivem.players}${fivem.maxPlayers ? ` / ${fivem.maxPlayers}` : ''}${fivem.maxPlayers ? ` (${Math.round((fivem.players / fivem.maxPlayers) * 100)}%)` : ''}`;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${liveName} • LIVE SERVER STATUS`)
    .setDescription(`${headline}${settings.pendingRestart ? ' • **RESTART IN PROGRESS**' : ''}`)
    .addFields(
      {
        name: 'Players',
        value: playerLine,
        inline: true,
      },
      { name: 'Response', value: fivem.latencyMs === undefined ? 'Unavailable' : `${fivem.latencyMs} ms`, inline: true },
      { name: 'Panel state', value: panel.state || (panel.configured ? 'Unavailable' : 'Not connected'), inline: true },
      { name: 'Game mode', value: fivem.gameType || '—', inline: true },
      { name: 'Map', value: fivem.mapName || '—', inline: true },
      { name: 'Next restart', value: nextRestartText || 'Not scheduled', inline: true },
    );
  if (logoUrl) embed.setThumbnail(logoUrl);
  if (bannerUrl) embed.setImage(bannerUrl);

  if (fivem.resourceCount !== null && fivem.resourceCount !== undefined) {
    embed.addFields({ name: 'Resources', value: String(fivem.resourceCount), inline: true });
  }

  if (settings.connectAddress) {
    embed.addFields({ name: 'Connect', value: `\`connect ${settings.connectAddress}\``, inline: false });
  }
  if (panel.configured && panel.state) {
    embed.addFields({
      name: 'Pterodactyl resources',
      value: `CPU ${panel.cpu === null ? '—' : `${panel.cpu.toFixed(1)}%`} • Memory ${formatBytes(panel.memoryBytes)} • Disk ${formatBytes(panel.diskBytes)}`,
      inline: false,
    });
  }
  if (!fivem.configured) {
    embed.addFields({ name: 'Setup', value: 'An administrator can configure the public server address with `/setupserver`.', inline: false });
  } else if (!fivem.online && fivem.error) {
    embed.addFields({ name: 'Status check', value: 'The FiveM status endpoints did not respond. Check that the public address and port are reachable.', inline: false });
  }

  return embed
    .setFooter({ text: `Auto-refreshes • Last checked ${updatedAt}` })
    .setTimestamp();
}

module.exports = { makeStatusEmbed };
