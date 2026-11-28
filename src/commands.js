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
const { statusJoinCode } = require('./server-address');

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
    .setName('updates')
    .setDescription('Post the Midtown RP status DM opt-in panel.'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show live FiveM server status and the connect address.'),

  new SlashCommandBuilder()
    .setName('dmusers')
    .setDescription('Prepare a confirmed DM broadcast to every human member (management roles only).'),

  new SlashCommandBuilder()
    .setName('sentlaunch')
    .setDescription('Preview and send the Midtown RP launch announcement to all human members (management roles only).')
    .addStringOption((option) => option
      .setName('website')
      .setDescription('GTA5 website URL to include in the launch DM')
      .setMaxLength(200)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('connect_address')
      .setDescription('Optional game host:port; defaults to the saved server address')
      .setMaxLength(100)
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('sentlaunchuser')
    .setDescription('Preview and send the Midtown RP launch announcement to one member (management roles only).')
    .addUserOption((option) => option
      .setName('member')
      .setDescription('Server member who should receive the launch DM')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('website')
      .setDescription('GTA5 website URL to include in the launch DM')
      .setMaxLength(200)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('connect_address')
      .setDescription('Optional game host:port; defaults to the saved server address')
      .setMaxLength(100)
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('sendlaunchnotice')
    .setDescription('Preview and DM all human members that Midtown RP launches tomorrow (management roles only).'),
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

function connectRow(connectAddress) {
  const code = statusJoinCode(connectAddress);
  if (!code) return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Connect')
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://cfx.re/join/${code}`),
  )];
}

function statusButtons(connectAddress) {
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
  ), ...connectRow(connectAddress)];
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

function broadcastButtons(nonce, type = 'dmusers') {
  const labels = {
    dmusers: 'Send to all human members',
    launch: 'Send launch DM to all members',
    launchuser: 'Send launch DM to this member',
    launchnotice: 'Send launch notice to all members',
  };
  const prefix = Object.hasOwn(labels, type) ? type : 'dmusers';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}:confirm:${nonce}`)
      .setLabel(labels[prefix])
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${prefix}:cancel:${nonce}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
}

function launchNoticeLinkButton(inviteUrl) {
  if (!inviteUrl) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Join the Midtown Discord')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Link)
      .setURL(inviteUrl),
  );
}

module.exports = {
  commands,
  updatesButtons,
  connectRow,
  statusButtons,
  dmUsersModal,
  broadcastButtons,
  launchNoticeLinkButton,
};
