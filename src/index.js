const crypto = require('node:crypto');
const {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
} = require('discord.js');
const { DateTime } = require('luxon');
const config = require('./config');
const store = require('./store');
const {
  makeUpdateEmbed,
  brandFiles,
  makeLaunchEmbed,
  makeLaunchNoticeEmbed,
  launchFiles,
  statusFiles,
  statusImageName,
} = require('./branding');
const { makeStatusEmbed } = require('./status-embed');
const {
  fetchFiveMStatus,
  fetchPterodactylStatus,
  normalizeServerEndpoint,
  pterodactylConfigured,
  pterodactylPower,
  requestRestart,
} = require('./fivem');
const {
  commands,
  updatesButtons,
  statusButtons,
  dmUsersModal,
  broadcastButtons,
  launchNoticeLinkButton,
  powerButtons,
} = require('./commands');
const {
  countdown,
  formatDateTime,
  isValidTimezone,
  nextRestart,
  occurrencesNearNow,
  parseDailyTimes,
} = require('./schedule');
const { deploy: deployCommands } = require('./deploy-commands');

if (!config.token) {
  console.error('DISCORD_TOKEN is missing. Copy .env.example to .env and add your bot token.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
const pendingBroadcasts = new Map();
const pendingPowerActions = new Map();
const latestStatuses = new Map();
const statusRefreshes = new Set();
const manualRefreshAt = new Map();
let schedulerBusy = false;
let defaultStatusGuildId = null;

function guildDefaults(guildId = null) {
  const isStatusGuild = guildId && guildId === defaultStatusGuildId;
  return {
    channelId: isStatusGuild ? config.statusChannelId : null,
    statusChannelId: isStatusGuild ? config.statusChannelId : null,
    timezone: config.defaultTimezone,
    times: config.defaultRestartTimes,
    serverName: config.serverName,
    serverEndpoint: config.defaultServerEndpoint,
    connectAddress: config.defaultConnectAddress,
  };
}

function hasManagerRole(interaction) {
  if (!interaction.guild) return false;
  const memberRoles = interaction.member?.roles;
  if (memberRoles?.cache) return config.managerRoleIds.some((roleId) => memberRoles.cache.has(roleId));
  if (Array.isArray(memberRoles)) return config.managerRoleIds.some((roleId) => memberRoles.includes(roleId));
  return false;
}

function requireGuild(interaction) {
  if (interaction.guild) return true;
  void interaction.reply({ content: 'Use this command inside a server.', ephemeral: true });
  return false;
}

function requireAdmin(interaction) {
  if (hasManagerRole(interaction)) return true;
  void interaction.reply({ content: 'Only the configured Midtown RP management roles can use this command.', ephemeral: true });
  return false;
}

async function promptPowerAction(interaction, action) {
  if (action !== 'restart' && !pterodactylConfigured()) {
    await safeReply(interaction, 'Pterodactyl is not configured. Set PTERODACTYL_PANEL_URL, PTERODACTYL_SERVER_ID, and PTERODACTYL_API_KEY in the private .env file first.');
    return;
  }
  const settings = store.getGuild(interaction.guildId);
  if (!settings?.channelId) {
    await safeReply(interaction, 'Configure the server and update channel first with /setupserver.');
    return;
  }
  if (action === 'restart' && settings.pendingRestart) {
    await safeReply(interaction, 'A restart is already marked as in progress.');
    return;
  }
  const nonce = crypto.randomUUID();
  pendingPowerActions.set(nonce, {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    action,
  });
  const actionName = action === 'restart' ? 'restart' : action;
  const manualRestartNote = action === 'restart'
    && !pterodactylConfigured()
    && !config.restartWebhookUrl
    ? ' No panel integration is configured, so staff must perform the actual restart manually.'
    : '';
  await interaction.reply({
    content: `Confirm **${actionName}** for **${settings.serverName || config.serverName}**.${manualRestartNote}`,
    components: [powerButtons(nonce, action)],
    ephemeral: true,
  });
}

async function showDmUsersModal(interaction) {
  const nonce = crypto.randomUUID();
  pendingBroadcasts.set(nonce, { guildId: interaction.guildId, userId: interaction.user.id });
  await interaction.showModal(dmUsersModal(`dmusers:modal:${nonce}`));
}

async function safeReply(interaction, content) {
  const payload = { content, ephemeral: true };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => {});
  return interaction.reply(payload).catch(() => {});
}

function normalizeWebsiteUrl(input) {
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Enter the GTA5 website as a full URL starting with https://.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('The website must be a public http(s) URL without login credentials.');
  }
  return url.toString();
}

function normalizeConnectAddress(input) {
  const address = String(input || '').trim();
  if (!address || address.length > 100 || /[\s`]/.test(address)) {
    throw new Error('Set a valid game connect address with /setupserver or provide host:port.');
  }
  return address;
}

async function getAnnouncementChannel(guild, settings) {
  if (!settings?.channelId) return null;
  const channel = await guild.channels.fetch(settings.channelId).catch(() => null);
  return channel?.isTextBased() ? channel : null;
}

async function sendChannelUpdate(guild, settings, title, description) {
  const channel = await getAnnouncementChannel(guild, settings);
  if (!channel) {
    console.warn(`No accessible announcement channel is set for guild ${guild.id}.`);
    return false;
  }
  try {
    await channel.send({
      embeds: [makeUpdateEmbed({ title, description, serverName: settings.serverName, includeBanner: true })],
      files: brandFiles(true),
      allowedMentions: { parse: [] },
    });
    return true;
  } catch (error) {
    console.error(`Could not post a restart update in guild ${guild.id}:`, error.message || error);
    return false;
  }
}

function queueSubscriberDms(guildId, settings, title, description) {
  const subscriberIds = Object.keys(settings.subscribers || {});
  if (subscriberIds.length === 0) return;

  void (async () => {
    for (const userId of subscriberIds) {
      try {
        const user = await client.users.fetch(userId);
        await user.send({
          embeds: [makeUpdateEmbed({ title, description, serverName: settings.serverName, includeLogo: false })],
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        if (error.code !== 50007) console.warn(`Could not send restart update DM in guild ${guildId}:`, error.message || error);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  })().catch((error) => console.error('Subscriber DM queue failed:', error));
}

async function startRestart(guild, settings, target, source) {
  settings.pendingRestart = {
    startedAt: DateTime.utc().toISO(),
    scheduledAt: target ? target.toUTC().toISO() : null,
    source,
    sawOffline: false,
  };
  await store.saveStore();

  const action = await requestRestart(settings, target);
  let description;
  if (action.ok) {
    description = `The restart request was accepted by ${action.provider}. I will post again when the server is back online.`;
  } else if (action.configured) {
    description = `The restart request could not be sent to ${action.provider || 'the configured panel'}${action.status ? ` (HTTP ${action.status})` : ''}. Staff can restart it manually; use **/restartdone** when it is back online.`;
  } else {
    description = 'The restart window has started. Configure Pterodactyl in `.env` to trigger it automatically, or staff can restart it manually and use **/restartdone** when it is back online.';
  }
  await sendChannelUpdate(guild, settings, `${settings.serverName} restart started`, description);
  queueSubscriberDms(guild.id, settings, `${settings.serverName} restart started`, description);
  return action;
}

async function finishRestart(guild, settings, reason = 'The FiveM server is back online.') {
  if (!settings.pendingRestart) return false;
  settings.pendingRestart = null;
  await store.saveStore();
  await sendChannelUpdate(guild, settings, `${settings.serverName} is back online`, reason);
  queueSubscriberDms(guild.id, settings, `${settings.serverName} is back online`, reason);
  return true;
}

async function fetchServerSnapshot(settings) {
  const [fivemResult, panelResult] = await Promise.allSettled([
    fetchFiveMStatus(settings),
    fetchPterodactylStatus(),
  ]);
  const fivem = fivemResult.status === 'fulfilled'
    ? fivemResult.value
    : { configured: Boolean(settings.serverEndpoint || config.defaultServerEndpoint), online: false, error: fivemResult.reason?.message || 'FiveM status request failed.' };
  const panel = panelResult.status === 'fulfilled'
    ? panelResult.value
    : { configured: pterodactylConfigured(), state: null, error: panelResult.reason?.message || 'Pterodactyl status request failed.' };
  const online = fivem.configured
    ? fivem.online
    : panel.state
      ? panel.state === 'running'
      : null;
  return { fivem, panel, online };
}

async function getStatusChannel(guild, settings) {
  if (!settings?.statusChannelId) return null;
  const channel = await guild.channels.fetch(settings.statusChannelId).catch(() => null);
  return channel?.isTextBased() ? channel : null;
}

async function refreshGuildStatus(guild, settings) {
  if (statusRefreshes.has(guild.id)) return latestStatuses.get(guild.id) || null;
  statusRefreshes.add(guild.id);
  try {
    const snapshot = await fetchServerSnapshot(settings);
    const hadRestartInProgress = Boolean(settings.pendingRestart);
    const previousOnline = settings.lastKnownOnline;

    if (hadRestartInProgress && snapshot.online !== null) {
      if (!snapshot.online && !settings.pendingRestart.sawOffline) {
        settings.pendingRestart.sawOffline = true;
      } else if (snapshot.online && settings.pendingRestart.sawOffline) {
        await finishRestart(guild, settings, 'The FiveM server is responding again after its restart.');
      }
    } else if (!hadRestartInProgress && previousOnline !== null && snapshot.online !== null && previousOnline !== snapshot.online) {
      const title = snapshot.online ? `${settings.serverName} is online` : `${settings.serverName} went offline`;
      const description = snapshot.online
        ? 'The FiveM server is responding again and players can connect.'
        : 'The FiveM server stopped responding. Staff have been notified.';
      await sendChannelUpdate(guild, settings, title, description);
      queueSubscriberDms(guild.id, settings, title, description);
    }

    if (snapshot.online !== null && settings.lastKnownOnline !== snapshot.online) {
      settings.lastKnownOnline = snapshot.online;
      await store.saveStore();
    } else if (hadRestartInProgress && settings.pendingRestart) {
      await store.saveStore();
    }

    latestStatuses.set(guild.id, snapshot);
    const channel = await getStatusChannel(guild, settings);
    if (channel) {
      const target = nextRestart(settings);
      const nextText = target
        ? `${countdown(target)} • ${formatDateTime(target)}`
        : null;
      let statusMessage = null;
      if (settings.statusMessageId) {
        statusMessage = await channel.messages.fetch(settings.statusMessageId).catch(() => null);
      }
      const logoAttachment = statusMessage?.attachments.find((attachment) => attachment.name === 'logo.png');
      const imageName = statusImageName();
      const statusImageAttachment = statusMessage?.attachments.find((attachment) => attachment.name === imageName);
      const embed = makeStatusEmbed({
        serverName: settings.serverName || config.serverName,
        snapshot,
        settings,
        nextRestartText: nextText,
        updatedAt: DateTime.utc().toFormat('HH:mm:ss') + ' UTC',
        logoUrl: logoAttachment?.url || 'attachment://logo.png',
        bannerUrl: statusImageAttachment?.url || `attachment://${imageName}`,
      });
      if (statusMessage) {
        const edit = { embeds: [embed], components: statusButtons(), allowedMentions: { parse: [] } };
        if (!logoAttachment || !statusImageAttachment) {
          edit.files = statusFiles();
          edit.attachments = [];
        }
        await statusMessage.edit(edit);
      } else {
        statusMessage = await channel.send({
          embeds: [embed],
          files: statusFiles(),
          components: statusButtons(),
          allowedMentions: { parse: [] },
        });
        settings.statusMessageId = statusMessage.id;
        await store.saveStore();
      }
    }
    return snapshot;
  } catch (error) {
    console.error(`Could not refresh live status for guild ${guild.id}:`, error.message || error);
    return null;
  } finally {
    statusRefreshes.delete(guild.id);
  }
}

async function initializeConfiguredStatusChannel() {
  if (!config.statusChannelId) return;
  const channel = await client.channels.fetch(config.statusChannelId).catch((error) => {
    console.error(`Could not access configured status channel ${config.statusChannelId}:`, error.message || error);
    return null;
  });
  if (!channel?.guild || !channel.isTextBased()) {
    console.error(`Configured status channel ${config.statusChannelId} is missing or is not a text channel.`);
    return;
  }
  defaultStatusGuildId = channel.guildId;
  const settings = store.getOrCreateGuild(channel.guildId, guildDefaults(channel.guildId));
  settings.statusChannelId = channel.id;
  if (!settings.channelId) settings.channelId = channel.id;
  if (!Array.isArray(settings.times) || settings.times.length === 0) settings.times = config.defaultRestartTimes;
  if (!settings.timezone) settings.timezone = config.defaultTimezone;
  if (!settings.serverEndpoint && config.defaultServerEndpoint) settings.serverEndpoint = config.defaultServerEndpoint;
  if (!settings.connectAddress && config.defaultConnectAddress) settings.connectAddress = config.defaultConnectAddress;
  await store.saveStore();
}

async function saveServerConfiguration(guild, { address, connectAddress, serverName, statusChannel }) {
  const endpoint = normalizeServerEndpoint(address);
  const settings = store.getOrCreateGuild(guild.id, guildDefaults(guild.id));
  let selectedChannel = statusChannel;
  if (!selectedChannel) {
    const channelId = settings.statusChannelId
      || (defaultStatusGuildId === guild.id ? config.statusChannelId : null);
    if (channelId) selectedChannel = await guild.channels.fetch(channelId).catch(() => null);
  }
  if (!selectedChannel?.isTextBased()) throw new Error('Choose a text channel for the live status card.');

  const previousChannelId = settings.statusChannelId;
  settings.serverEndpoint = endpoint;
  settings.connectAddress = connectAddress?.trim()
    || address.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  settings.serverName = serverName?.trim() || settings.serverName || config.serverName;
  settings.statusChannelId = selectedChannel.id;
  if (!settings.channelId) settings.channelId = selectedChannel.id;
  if (previousChannelId !== selectedChannel.id) settings.statusMessageId = null;
  await store.saveStore();
  const snapshot = await refreshGuildStatus(guild, settings);
  return { settings, channel: selectedChannel, snapshot };
}

async function saveRestartConfiguration(guild, { timesInput, timezoneInput, channel }) {
  const times = parseDailyTimes(timesInput);
  const timezone = timezoneInput?.trim() || config.defaultTimezone;
  if (!isValidTimezone(timezone)) throw new Error(`“${timezone}” is not a recognized IANA timezone.`);
  const settings = store.getOrCreateGuild(guild.id, guildDefaults(guild.id));
  let announcementChannel = channel;
  if (!announcementChannel) {
    const channelId = settings.channelId || settings.statusChannelId
      || (defaultStatusGuildId === guild.id ? config.statusChannelId : null);
    if (channelId) announcementChannel = await guild.channels.fetch(channelId).catch(() => null);
  }
  if (!announcementChannel?.isTextBased()) throw new Error('Choose a text channel for restart announcements.');

  settings.times = times;
  settings.timezone = timezone;
  settings.channelId = announcementChannel.id;
  await store.saveStore();
  await updatePresence();
  return { settings, channel: announcementChannel, next: nextRestart(settings) };
}

async function updatePresence(nowUtc = DateTime.utc()) {
  if (!client.user) return;
  const pending = store.allGuilds().find(([, settings]) => settings.pendingRestart);
  if (pending) {
    client.user.setPresence({ activities: [{ name: 'a server restart in progress', type: ActivityType.Watching }], status: 'dnd' });
    return;
  }

  const upcoming = store.allGuilds()
    .map(([guildId, settings]) => ({ guildId, settings, target: nextRestart(settings, nowUtc) }))
    .filter((item) => item.target)
    .sort((left, right) => left.target.toMillis() - right.target.toMillis())[0];

  const upcomingStatus = upcoming ? latestStatuses.get(upcoming.guildId) : null;
  const availability = upcomingStatus?.online === true
    ? 'Online • '
    : upcomingStatus?.online === false
      ? 'Offline • '
      : '';
  const activity = upcoming
    ? `${availability}restart in ${countdown(upcoming.target, nowUtc)}`
    : `${config.serverName} | /status`;
  client.user.setPresence({ activities: [{ name: activity, type: ActivityType.Watching }], status: 'online' });
}

async function processSchedules() {
  if (schedulerBusy) return;
  schedulerBusy = true;
  const nowUtc = DateTime.utc();
  try {
    for (const [guildId, settings] of store.allGuilds()) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;

      if (settings.pendingRestart) continue;

      for (const target of occurrencesNearNow(settings, nowUtc)) {
        const eventId = target.toUTC().toISO({ suppressMilliseconds: true });
        const milestones = [
          { name: '15m', minutes: 15, title: 'Restart in 15 minutes', text: 'The scheduled FiveM server restart is in 15 minutes.' },
          { name: '5m', minutes: 5, title: 'Restart in 5 minutes', text: 'The scheduled FiveM server restart is in 5 minutes.' },
          { name: '1m', minutes: 1, title: 'Restart in 1 minute', text: 'The scheduled FiveM server restart is in 1 minute.' },
        ];

        for (const milestone of milestones) {
          const key = `${eventId}:${milestone.name}`;
          const due = target.minus({ minutes: milestone.minutes }).toMillis();
          const elapsed = nowUtc.toMillis() - due;
          if (!settings.lastNotifications[key] && elapsed >= 0 && elapsed <= 90_000) {
            settings.lastNotifications[key] = nowUtc.toISO();
            await store.saveStore();
            await sendChannelUpdate(guild, settings, milestone.title, milestone.text);
            if (milestone.name === '15m' || milestone.name === '1m') {
              queueSubscriberDms(guild.id, settings, milestone.title, milestone.text);
            }
          }
        }

        const startKey = `${eventId}:start`;
        const elapsed = nowUtc.toMillis() - target.toMillis();
        if (!settings.lastNotifications[startKey] && elapsed >= 0 && elapsed <= 90_000) {
          settings.lastNotifications[startKey] = nowUtc.toISO();
          await store.saveStore();
          await startRestart(guild, settings, target, 'scheduled');
          break;
        }
      }
    }
    await updatePresence(nowUtc);
  } catch (error) {
    console.error('Restart schedule update failed:', error);
  } finally {
    schedulerBusy = false;
  }
}

async function refreshAllStatuses() {
  for (const [guildId, settings] of store.allGuilds()) {
    const guild = client.guilds.cache.get(guildId);
    if (guild && settings.statusChannelId) await refreshGuildStatus(guild, settings);
  }
  await updatePresence();
}

async function handleSlashCommand(interaction) {
  if (!interaction.isChatInputCommand()) return false;
  const { commandName } = interaction;

  if (commandName === 'setupserver') {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) return true;
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await saveServerConfiguration(interaction.guild, {
        address: interaction.options.getString('address', true),
        connectAddress: interaction.options.getString('connect_address'),
        serverName: interaction.options.getString('server_name'),
        statusChannel: interaction.options.getChannel('status_channel'),
      });
      await interaction.editReply(result.snapshot
        ? `Server details saved. The live status card is in ${result.channel}. Pterodactyl controls are ${pterodactylConfigured() ? 'connected' : 'not configured; status and restart notices still work'}.`
        : `Server details saved. The live card could not refresh; check the bot log and server address.`);
    } catch (error) {
      await interaction.editReply(error.message || 'Could not save the server details.');
    }
    return true;
  }

  if (commandName === 'setrestart') {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) return true;
    await interaction.deferReply({ ephemeral: true });
    try {
      const settings = store.getOrCreateGuild(interaction.guildId, guildDefaults(interaction.guildId));
      const result = await saveRestartConfiguration(interaction.guild, {
        timesInput: interaction.options.getString('times', true),
        timezoneInput: interaction.options.getString('timezone') || settings.timezone,
        channel: interaction.options.getChannel('channel', true),
      });
      const serverName = interaction.options.getString('server_name') || settings.serverName || config.serverName;
      settings.serverName = serverName;
      await store.saveStore();
      await interaction.editReply(`Restart schedule saved. Daily times: **${settings.times.join(', ')}** (${settings.timezone}). Updates go to ${result.channel}. Next restart: **${formatDateTime(result.next)}**.`);
    } catch (error) {
      await interaction.editReply(error.message || 'Could not save the restart schedule.');
    }
    return true;
  }

  if (commandName === 'updates') {
    if (!requireGuild(interaction)) return true;
    const settings = store.getGuild(interaction.guildId);
    const serverName = settings?.serverName || config.serverName;
    await interaction.deferReply();
    await interaction.editReply({
      embeds: [makeUpdateEmbed({
        title: `${serverName} restart DMs`,
        description: 'Choose **DM me updates** to receive restart reminders and online-again messages. Choose **Stop DMs** any time to unsubscribe.',
        serverName,
        includeBanner: true,
      })],
      files: brandFiles(true),
      components: [updatesButtons()],
      allowedMentions: { parse: [] },
    });
    return true;
  }

  if (commandName === 'status') {
    if (!requireGuild(interaction)) return true;
    const settings = store.getOrCreateGuild(interaction.guildId, guildDefaults(interaction.guildId));
    await interaction.deferReply({ ephemeral: true });
    let snapshot = latestStatuses.get(interaction.guildId);
    if (settings.statusChannelId) snapshot = await refreshGuildStatus(interaction.guild, settings) || snapshot;
    if (!snapshot) snapshot = await fetchServerSnapshot(settings);
    latestStatuses.set(interaction.guildId, snapshot);
    const target = nextRestart(settings);
    const embed = makeStatusEmbed({
      serverName: settings.serverName || config.serverName,
      snapshot,
      settings,
      nextRestartText: target ? `${countdown(target)} • ${formatDateTime(target)}` : null,
      updatedAt: DateTime.utc().toFormat('HH:mm:ss') + ' UTC',
    });
    await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    return true;
  }

  if (commandName === 'restartnow') {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) return true;
    await promptPowerAction(interaction, 'restart');
    return true;
  }

  if (commandName === 'restartdone') {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) return true;
    const settings = store.getGuild(interaction.guildId);
    if (!settings?.pendingRestart) {
      await safeReply(interaction, 'There is no restart marked as in progress.');
      return true;
    }
    await interaction.deferReply({ ephemeral: true });
    await finishRestart(interaction.guild, settings, 'Staff confirmed that the FiveM server is back online.');
    await interaction.editReply('Restart completion announced to the update channel and DM subscribers.');
    return true;
  }

  if (commandName === 'dmusers') {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) return true;
    await showDmUsersModal(interaction);
    return true;
  }

  if (commandName === 'sendlaunchnotice') {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) return true;
    const settings = store.getGuild(interaction.guildId);
    await showLaunchNoticePreview(interaction, settings?.serverName || config.serverName);
    return true;
  }

  if (commandName === 'sentlaunch') {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) return true;
    try {
      const websiteUrl = normalizeWebsiteUrl(interaction.options.getString('website', true));
      const settings = store.getOrCreateGuild(interaction.guildId, guildDefaults(interaction.guildId));
      const connectAddress = normalizeConnectAddress(
        interaction.options.getString('connect_address') || settings.connectAddress || config.defaultConnectAddress,
      );
      await showLaunchPreview(interaction, {
        websiteUrl,
        connectAddress,
        serverName: settings.serverName || config.serverName,
      });
    } catch (error) {
      await safeReply(interaction, error.message || 'Could not prepare the launch announcement.');
    }
    return true;
  }

  if (commandName === 'sentlaunchuser') {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) return true;
    try {
      const targetUser = interaction.options.getUser('member', true);
      const websiteUrl = normalizeWebsiteUrl(interaction.options.getString('website', true));
      if (targetUser.bot) throw new Error('Choose a human server member; bots cannot receive launch DMs.');
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) throw new Error('That user is not currently a member of this server.');
      const settings = store.getOrCreateGuild(interaction.guildId, guildDefaults(interaction.guildId));
      const connectAddress = normalizeConnectAddress(
        interaction.options.getString('connect_address') || settings.connectAddress || config.defaultConnectAddress,
      );
      await showSingleLaunchPreview(interaction, {
        websiteUrl,
        connectAddress,
        serverName: settings.serverName || config.serverName,
        targetUserId: targetMember.id,
        targetName: targetMember.displayName || targetMember.user.username,
      });
    } catch (error) {
      await safeReply(interaction, error.message || 'Could not prepare the launch announcement.');
    }
    return true;
  }

  if (commandName === 'serverpower') {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) return true;
    const action = interaction.options.getString('action', true);
    await promptPowerAction(interaction, action);
    return true;
  }

  return false;
}

async function handleBroadcast(interaction, nonce, message) {
  const pending = pendingBroadcasts.get(nonce);
  if (!pending || pending.guildId !== interaction.guildId || pending.userId !== interaction.user.id) {
    await safeReply(interaction, 'This broadcast prompt expired. Run /dmusers again.');
    return;
  }
  pendingBroadcasts.delete(nonce);
  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply('Loading server members and preparing the broadcast…');

  const guild = interaction.guild;
  let members;
  try {
    members = await guild.members.fetch();
  } catch (error) {
    await interaction.editReply(`Could not load all server members. Check that the Guild Members intent is enabled in the Developer Portal. (${error.message || error})`);
    return;
  }
  const recipients = [...members.values()].filter((member) => !member.user.bot);
  const confirmNonce = crypto.randomUUID();
  pendingBroadcasts.set(confirmNonce, {
    guildId: guild.id,
    userId: interaction.user.id,
    message,
    memberCount: recipients.length,
    memberIds: recipients.map((member) => member.id),
  });
  await interaction.editReply({
    content: `**Broadcast preview**\n> ${message.replace(/\n/g, '\n> ')}\n\nThis will DM **${recipients.length} human members** in **${guild.name}**. Members with DMs closed may not receive it. Confirm to send.`,
    components: [broadcastButtons(confirmNonce)],
    allowedMentions: { parse: [] },
  });
}

async function showLaunchPreview(interaction, launchDetails) {
  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply('Loading server members and preparing the launch announcement…');

  let members;
  try {
    members = await interaction.guild.members.fetch();
  } catch (error) {
    await interaction.editReply(`Could not load all server members. Check that the Guild Members intent is enabled in the Developer Portal. (${error.message || error})`);
    return;
  }

  const recipients = [...members.values()].filter((member) => !member.user.bot);
  const recipientCount = recipients.length;
  const nonce = crypto.randomUUID();
  pendingBroadcasts.set(nonce, {
    ...launchDetails,
    type: 'launch',
    guildId: interaction.guildId,
    userId: interaction.user.id,
    memberCount: recipientCount,
    memberIds: recipients.map((member) => member.id),
  });

  await interaction.editReply({
    content: `**Launch DM preview**\nThis announcement will be sent to **${recipientCount} human members** in **${interaction.guild.name}**. Members with DMs closed may not receive it. Confirm to send.`,
    embeds: [makeLaunchEmbed(launchDetails)],
    files: launchFiles(),
    components: [broadcastButtons(nonce, 'launch')],
    allowedMentions: { parse: [] },
  });
}

async function showLaunchNoticePreview(interaction, serverName) {
  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply('Loading server members and preparing the launch notice…');

  let members;
  try {
    members = await interaction.guild.members.fetch();
  } catch (error) {
    await interaction.editReply(`Could not load all server members. Check that the Guild Members intent is enabled in the Developer Portal. (${error.message || error})`);
    return;
  }

  const recipients = [...members.values()].filter((member) => !member.user.bot);
  const recipientCount = recipients.length;
  const nonce = crypto.randomUUID();
  pendingBroadcasts.set(nonce, {
    type: 'launchnotice',
    guildId: interaction.guildId,
    userId: interaction.user.id,
    serverName,
    memberCount: recipientCount,
    memberIds: recipients.map((member) => member.id),
  });

  await interaction.editReply({
    content: `**Launch notice preview**\nThis cinematic notice will DM **${recipientCount} human members** in **${interaction.guild.name}**. Members with DMs closed may not receive it. Confirm to send.`,
    embeds: [makeLaunchNoticeEmbed({ serverName, discordInviteUrl: config.discordInviteUrl })],
    files: launchFiles(),
    components: [broadcastButtons(nonce, 'launchnotice'), launchNoticeLinkButton(config.discordInviteUrl)].filter(Boolean),
    allowedMentions: { parse: [] },
  });
}

async function showSingleLaunchPreview(interaction, launchDetails) {
  const nonce = crypto.randomUUID();
  pendingBroadcasts.set(nonce, {
    ...launchDetails,
    type: 'launchuser',
    guildId: interaction.guildId,
    userId: interaction.user.id,
  });

  await interaction.reply({
    content: `**Launch DM preview**\nThis message will be sent only to **${launchDetails.targetName}** (<@${launchDetails.targetUserId}>). Confirm to send.`,
    embeds: [makeLaunchEmbed(launchDetails)],
    files: launchFiles(),
    components: [broadcastButtons(nonce, 'launchuser')],
    allowedMentions: { parse: [] },
    ephemeral: true,
  });
}

async function runMemberBroadcast(interaction, pending) {
  await interaction.deferReply({ ephemeral: true });
  const isLaunch = pending.type === 'launch';
  const isLaunchNotice = pending.type === 'launchnotice';
  const label = isLaunch ? 'Launch DM' : pending.type === 'launchnotice' ? 'Launch notice' : 'DM broadcast';
  const guild = interaction.guild;
  if (!Array.isArray(pending.memberIds)) {
    await interaction.editReply('This preview expired before the member list was saved. Run the command again to prepare a fresh preview.');
    return;
  }

  const recipients = pending.memberIds
    .map((memberId) => guild.members.cache.get(memberId))
    .filter((member) => member && !member.user.bot);
  if (!recipients.length) {
    await interaction.editReply('No human members from the preview are still available to message. Run the command again to prepare a fresh preview.');
    return;
  }
  await interaction.editReply(`Starting the ${label.toLowerCase()} to ${recipients.length} human members…`);
  let sent = 0;
  let failed = 0;
  let lastProgressAt = Date.now();
  for (const member of recipients) {
    try {
      const payload = isLaunch
        ? {
          embeds: [makeLaunchEmbed(pending)],
          files: launchFiles(),
          allowedMentions: { parse: [] },
        }
        : isLaunchNotice
          ? {
            embeds: [makeLaunchNoticeEmbed({
              serverName: pending.serverName,
              discordInviteUrl: config.discordInviteUrl,
            })],
            files: launchFiles(),
            components: [launchNoticeLinkButton(config.discordInviteUrl)].filter(Boolean),
            allowedMentions: { parse: [] },
          }
          : { content: pending.message, allowedMentions: { parse: [] } };
      await member.send(payload);
      sent += 1;
    } catch {
      failed += 1;
    }

    if (Date.now() - lastProgressAt >= 15_000) {
      await interaction.editReply(`${label} in progress: **${sent} sent**, **${failed} could not be delivered**, ${recipients.length - sent - failed} remaining.`).catch(() => {});
      lastProgressAt = Date.now();
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  await interaction.editReply(`${label} finished in **${guild.name}**: **${sent} sent**, **${failed} could not be delivered**.`).catch(() => {});
}

async function runSingleLaunch(interaction, pending) {
  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply(`Sending the launch DM to **${pending.targetName}**…`);
  const member = await interaction.guild.members.fetch(pending.targetUserId).catch(() => null);
  if (!member || member.user.bot) {
    await interaction.editReply('The selected human member is no longer in this server, so no DM was sent.');
    return;
  }
  try {
    await member.send({
      embeds: [makeLaunchEmbed(pending)],
      files: launchFiles(),
      allowedMentions: { parse: [] },
    });
    await interaction.editReply(`Launch DM sent to **${member.displayName || member.user.username}**.`);
  } catch (error) {
    const reason = error.code === 50007
      ? 'their DMs are closed or they do not accept messages from this server.'
      : 'Discord could not deliver the message.';
    await interaction.editReply(`Could not DM **${member.displayName || member.user.username}** because ${reason}`);
  }
}

async function handleComponent(interaction) {
  if (!interaction.isButton()) return false;

  if (interaction.customId === 'status:refresh') {
    if (!interaction.guild) {
      await safeReply(interaction, 'Use this button in the server.');
      return true;
    }
    const previous = manualRefreshAt.get(interaction.guildId) || 0;
    const remaining = 15_000 - (Date.now() - previous);
    if (remaining > 0) {
      await interaction.reply({ content: `The status was just checked. Try again in ${Math.ceil(remaining / 1000)} seconds.`, ephemeral: true });
      return true;
    }
    manualRefreshAt.set(interaction.guildId, Date.now());
    await interaction.deferUpdate();
    const settings = store.getGuild(interaction.guildId);
    if (settings) await refreshGuildStatus(interaction.guild, settings);
    await interaction.followUp({ content: 'Server status refreshed.', ephemeral: true }).catch(() => {});
    return true;
  }

  if (interaction.customId === 'updates:subscribe' || interaction.customId === 'updates:unsubscribe') {
    if (!interaction.guild) {
      await safeReply(interaction, 'Use this button in the server where you want restart updates.');
      return true;
    }
    const settings = store.getOrCreateGuild(interaction.guildId, guildDefaults(interaction.guildId));
    if (interaction.customId === 'updates:subscribe') {
      settings.subscribers[interaction.user.id] = { subscribedAt: DateTime.utc().toISO() };
      await store.saveStore();
      await interaction.reply({ content: 'You are subscribed. I’ll DM you restart reminders and the online-again update.', ephemeral: true });
    } else {
      delete settings.subscribers[interaction.user.id];
      await store.saveStore();
      await interaction.reply({ content: 'You are unsubscribed from restart DMs for this server.', ephemeral: true });
    }
    return true;
  }

  if (interaction.customId.startsWith('dmusers:confirm:')
    || interaction.customId.startsWith('launch:confirm:')
    || interaction.customId.startsWith('launchnotice:confirm:')
    || interaction.customId.startsWith('launchuser:confirm:')) {
    const nonce = interaction.customId.split(':').at(-1);
    const pending = pendingBroadcasts.get(nonce);
    const expectedType = interaction.customId.split(':')[0];
    if (!pending || (pending.type || 'dmusers') !== expectedType || pending.guildId !== interaction.guildId || pending.userId !== interaction.user.id || !hasManagerRole(interaction)) {
      await safeReply(interaction, 'This broadcast prompt expired or you do not have permission to use it.');
      return true;
    }
    pendingBroadcasts.delete(nonce);
    if (expectedType === 'launchuser') {
      void runSingleLaunch(interaction, pending).catch(async (error) => {
        console.error('Individual launch DM failed:', error);
        await safeReply(interaction, 'The launch DM stopped because of an unexpected error. Check the bot log.');
      });
      return true;
    }
    void runMemberBroadcast(interaction, pending).catch(async (error) => {
      console.error('Member DM broadcast failed:', error);
      await safeReply(interaction, 'The DM broadcast stopped because of an unexpected error. Check the bot log.');
    });
    return true;
  }

  if (interaction.customId.startsWith('dmusers:cancel:')
    || interaction.customId.startsWith('launch:cancel:')
    || interaction.customId.startsWith('launchnotice:cancel:')
    || interaction.customId.startsWith('launchuser:cancel:')) {
    const nonce = interaction.customId.split(':').at(-1);
    const pending = pendingBroadcasts.get(nonce);
    if (pending?.userId !== interaction.user.id) {
      await safeReply(interaction, 'Only the administrator who prepared this broadcast can cancel it.');
      return true;
    }
    pendingBroadcasts.delete(nonce);
    await interaction.update({ content: 'Broadcast cancelled.', components: [] });
    return true;
  }

  if (interaction.customId.startsWith('serverpower:confirm:')) {
    const [, , action, nonce] = interaction.customId.split(':');
    const pending = pendingPowerActions.get(nonce);
    if (!pending || pending.guildId !== interaction.guildId || pending.userId !== interaction.user.id || !hasManagerRole(interaction)) {
      await safeReply(interaction, 'This power prompt expired or you do not have permission to use it.');
      return true;
    }
    pendingPowerActions.delete(nonce);
    await interaction.deferReply({ ephemeral: true });
    if (action === 'restart') {
      const settings = store.getGuild(interaction.guildId);
      if (!settings?.channelId || settings.pendingRestart) {
        await interaction.editReply(settings?.pendingRestart ? 'A restart is already in progress.' : 'Configure the server first with /setupserver.');
        return true;
      }
      const result = await startRestart(interaction.guild, settings, DateTime.utc(), 'manual');
      await interaction.editReply(result.ok
        ? `Restart announced and accepted by ${result.provider}. I’ll post when the server is back online.`
        : result.configured
          ? `Restart announced, but ${result.provider || 'the panel'} rejected the request. Staff can restart manually and use /restartdone.`
          : 'Restart announced. Configure Pterodactyl in .env for automatic restarts, or restart manually and use /restartdone.');
      void refreshGuildStatus(interaction.guild, settings);
      return true;
    }
    const result = await pterodactylPower(action);
    if (!result.ok) {
      await interaction.editReply(`Pterodactyl could not ${action} the server: ${result.error || `HTTP ${result.status || 'error'}`}`);
      return true;
    }
    const settings = store.getOrCreateGuild(interaction.guildId, guildDefaults(interaction.guildId));
    if (action === 'start') {
      settings.lastKnownOnline = false;
      await store.saveStore();
    }
    const title = action === 'stop' ? `${settings.serverName} server stopping` : `${settings.serverName} server starting`;
    const description = action === 'stop'
      ? 'The stop request was accepted by Pterodactyl.'
      : 'The start request was accepted by Pterodactyl. I’ll post again when the server is online.';
    await sendChannelUpdate(interaction.guild, settings, title, description);
    queueSubscriberDms(interaction.guildId, settings, title, description);
    await interaction.editReply(`Pterodactyl accepted the **${action}** request.`);
    void refreshGuildStatus(interaction.guild, settings);
    return true;
  }

  if (interaction.customId.startsWith('serverpower:cancel:')) {
    const nonce = interaction.customId.split(':').at(-1);
    const pending = pendingPowerActions.get(nonce);
    if (pending?.userId !== interaction.user.id) {
      await safeReply(interaction, 'Only the administrator who opened this prompt can cancel it.');
      return true;
    }
    pendingPowerActions.delete(nonce);
    await interaction.update({ content: 'Power action cancelled.', components: [] });
    return true;
  }

  return false;
}

async function handleModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  if (!interaction.guild || !hasManagerRole(interaction)) {
    await safeReply(interaction, 'Only the configured Midtown RP management roles can use this form.');
    return true;
  }

  if (interaction.customId.startsWith('dmusers:modal:')) {
    const nonce = interaction.customId.split(':').at(-1);
    if (pendingBroadcasts.get(nonce)?.userId !== interaction.user.id) {
      await safeReply(interaction, 'This broadcast prompt expired. Run /dmusers again.');
      return true;
    }
    const message = interaction.fields.getTextInputValue('message').trim();
    if (!message) {
      await safeReply(interaction, 'The broadcast message cannot be empty.');
      return true;
    }
    await handleBroadcast(interaction, nonce, message);
    return true;
  }

  return false;
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  try {
    await deployCommands(readyClient.user.id);
  } catch (error) {
    console.error('Could not sync slash commands on startup:', error.message || error);
  }
  await initializeConfiguredStatusChannel();
  await refreshAllStatuses();
  await updatePresence();
  setInterval(() => void processSchedules(), 15_000);
  setInterval(() => void refreshAllStatuses(), config.statusRefreshMs);
  void processSchedules();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (await handleSlashCommand(interaction)) return;
    if (await handleModal(interaction)) return;
    await handleComponent(interaction);
  } catch (error) {
    console.error('Interaction failed:', error);
    await safeReply(interaction, 'Something went wrong while handling that request. Check the bot log.');
  }
});

client.on(Events.Error, (error) => console.error('Discord client error:', error));

store.loadStore()
  .then(() => client.login(config.token))
  .catch((error) => {
    console.error('Bot startup failed:', error);
    process.exitCode = 1;
  });
