const { EmbedBuilder } = require('discord.js');

const green = 0x32c878;
const red = 0xed4245;
const amber = 0xf1b642;
const pink = 0xf23891;
const socialLinks = [
  '[Instagram](https://www.instagram.com/gta5midtown/)',
  '[YouTube](https://www.youtube.com/channel/UCIk4CSELavYzGS2LRsPn51g)',
].join(' • ');

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unavailable';
  const gb = bytes / (1024 ** 3);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

function makeStatusEmbed({ serverName, snapshot, settings, updatedAt, logoUrl = null, bannerUrl = null }) {
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
    .setDescription(headline);
  if (logoUrl) embed.setThumbnail(logoUrl);
  if (bannerUrl) embed.setImage(bannerUrl);

  const fields = [
    { name: '👥 Players', value: playerLine, inline: true },
    { name: '📶 Response', value: fivem.latencyMs === undefined ? 'Unavailable' : `${fivem.latencyMs} ms`, inline: true },
    { name: '🎭 Game mode', value: fivem.gameType || '—', inline: true },
    { name: '🗺️ Map', value: fivem.mapName || '—', inline: true },
  ];

  if (settings.connectAddress) {
    fields.push({ name: '🎮 Connect', value: `\`connect ${settings.connectAddress}\``, inline: false });
  }
  if (panel.configured && panel.state) {
    fields.push({
      name: '🖥️ Panel',
      value: `CPU ${panel.cpu === null ? '—' : `${panel.cpu.toFixed(1)}%`} • Memory ${formatBytes(panel.memoryBytes)} • Disk ${formatBytes(panel.diskBytes)}`,
      inline: false,
    });
  }
  if (!fivem.configured) {
    fields.push({ name: 'Connection', value: 'Server status is not configured yet.', inline: false });
  } else if (!fivem.online && fivem.error) {
    fields.push({ name: 'Connection', value: 'Status endpoint is temporarily unavailable.', inline: false });
  }

  fields.push({ name: '🌐 Socials', value: socialLinks, inline: false });
  embed.addFields(fields);

  return embed
    .setFooter({ text: `Auto-refreshes every 30 seconds • Last checked ${updatedAt}` });
}

module.exports = { makeStatusEmbed };
