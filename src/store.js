const fs = require('node:fs/promises');
const path = require('node:path');

const dataDirectory = path.join(__dirname, '..', 'data');
const dataPath = path.join(dataDirectory, 'guilds.json');
let state = { guilds: {} };
let writeQueue = Promise.resolve();

async function loadStore() {
  await fs.mkdir(dataDirectory, { recursive: true });
  try {
    const raw = await fs.readFile(dataPath, 'utf8');
    const parsed = JSON.parse(raw);
    state = parsed && parsed.guilds ? parsed : { guilds: {} };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await saveStore();
  }
}

function saveStore() {
  const snapshot = JSON.stringify(state, null, 2);
  const write = writeQueue.catch(() => {}).then(async () => {
    await fs.mkdir(dataDirectory, { recursive: true });
    const temporaryPath = `${dataPath}.tmp`;
    await fs.writeFile(temporaryPath, snapshot, 'utf8');
    await fs.rename(temporaryPath, dataPath);
  });
  writeQueue = write;
  return write;
}

function getGuild(guildId) {
  return state.guilds[guildId] || null;
}

function getOrCreateGuild(guildId, defaults = {}) {
  if (!state.guilds[guildId]) {
    state.guilds[guildId] = {
      channelId: defaults.channelId || null,
      statusChannelId: defaults.statusChannelId || null,
      statusMessageId: null,
      timezone: defaults.timezone || 'Asia/Kolkata',
      times: defaults.times || [],
      serverName: defaults.serverName || 'Midtown RP',
      serverEndpoint: defaults.serverEndpoint || '',
      connectAddress: defaults.connectAddress || '',
      subscribers: {},
      lastNotifications: {},
      pendingRestart: null,
      lastKnownOnline: null,
    };
  }
  const settings = state.guilds[guildId];
  for (const [key, value] of Object.entries({
    channelId: defaults.channelId || null,
    statusChannelId: defaults.statusChannelId || null,
    statusMessageId: null,
    serverEndpoint: defaults.serverEndpoint || '',
    connectAddress: defaults.connectAddress || '',
    subscribers: {},
    lastNotifications: {},
    pendingRestart: null,
    lastKnownOnline: null,
  })) {
    if (settings[key] === undefined) settings[key] = value;
  }
  return settings;
}

function allGuilds() {
  return Object.entries(state.guilds);
}

module.exports = { loadStore, saveStore, getGuild, getOrCreateGuild, allGuilds };
