const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('setupserver')
    .setDescription('Connect the live FiveM status card to your server.')
    .addStringOption((option) => option
      .setName('address')
      .setDescription('Public FiveM host and port, such as 203.0.113.10:30120')
      .setMaxLength(200)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('connect_address')
      .setDescription('Player join address; defaults to the public host and port')
      .setMaxLength(100)
      .setRequired(false))
    .addStringOption((option) => option
      .setName('server_name')
      .setDescription('Name shown on the live status card')
      .setMaxLength(80)
      .setRequired(false))
    .addChannelOption((option) => option
      .setName('status_channel')
      .setDescription('Channel for the automatically refreshed status card')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('setrestart')
    .setDescription('Set daily FiveM restart times and the announcement channel.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Where restart updates should be posted')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('times')
      .setDescription('Daily restart times in 24-hour format, separated by commas (example: 04:00,16:00)')
      .setMaxLength(100)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('timezone')
      .setDescription('IANA timezone, for example Asia/Kolkata or America/New_York')
      .setMaxLength(80)
      .setRequired(false))
    .addStringOption((option) => option
      .setName('server_name')
      .setDescription('Name shown on restart updates')
      .setMaxLength(80)
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('updates')
    .setDescription('Post the Midtown RP restart DM opt-in panel.'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show the next restart and updater status.'),

  new SlashCommandBuilder()
    .setName('restartnow')
    .setDescription('Request a restart and announce it (management roles only).'),

  new SlashCommandBuilder()
    .setName('restartdone')
    .setDescription('Mark the server restart as complete (management roles only).'),

  new SlashCommandBuilder()
    .setName('serverpower')
    .setDescription('Start or stop the FiveM server through Pterodactyl (management roles only).')
    .addStringOption((option) => option
      .setName('action')
      .setDescription('Power action to send to Pterodactyl')
      .addChoices(
        { name: 'Start server', value: 'start' },
        { name: 'Stop server', value: 'stop' },
      )
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('dmusers')
    .setDescription('Prepare a confirmed DM broadcast to every human member (management roles only).'),
].map((command) => command.toJSON());

function updatesButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('updates:subscribe')
      .setLabel('DM me updates')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🔔'),
    new ButtonBuilder()
      .setCustomId('updates:unsubscribe')
      .setLabel('Stop DMs')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔕'),
  );
}

function statusButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('status:refresh')
      .setLabel('Refresh status')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId('updates:subscribe')
      .setLabel('Get DM updates')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🔔'),
    new ButtonBuilder()
      .setCustomId('updates:unsubscribe')
      .setLabel('Unsubscribe')
      .setStyle(ButtonStyle.Secondary),
  )];
}

function dmUsersModal(customId) {
  const input = new TextInputBuilder()
    .setCustomId('message')
    .setLabel('Message to send to server members')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(2000)
    .setRequired(true)
    .setPlaceholder('Write the announcement...');

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Prepare a member DM broadcast')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function broadcastButtons(nonce) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dmusers:confirm:${nonce}`)
      .setLabel('Send to all human members')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`dmusers:cancel:${nonce}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
}

function powerButtons(nonce, action) {
  const actionLabel = action === 'stop' ? 'Confirm stop' : action === 'restart' ? 'Confirm restart' : 'Confirm start';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`serverpower:confirm:${action}:${nonce}`)
      .setLabel(actionLabel)
      .setStyle(action === 'start' ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`serverpower:cancel:${nonce}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
}

module.exports = {
  commands,
  updatesButtons,
  statusButtons,
  dmUsersModal,
  broadcastButtons,
  powerButtons,
};
