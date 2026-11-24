const path = require('node:path');
const fs = require('node:fs');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');

const logoPath = path.join(__dirname, '..', 'logo.png');
const bannerPath = path.join(__dirname, '..', 'ralshadow.png');
const launchImagePath = path.join(__dirname, '..', 'carislove.png');
const pink = 0xf23891;

function makeUpdateEmbed({ title, description, serverName = 'Midtown RP', includeLogo = true, includeBanner = false }) {
  const embed = new EmbedBuilder()
    .setColor(pink)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `${serverName} • FiveM server updates` })
    .setTimestamp();

  if (includeLogo && fs.existsSync(logoPath)) embed.setThumbnail('attachment://logo.png');
  if (includeBanner && fs.existsSync(bannerPath)) embed.setImage('attachment://ralshadow.png');
  return embed;
}

function brandFiles(includeBanner = false) {
  const files = [];
  if (fs.existsSync(logoPath)) files.push(new AttachmentBuilder(logoPath, { name: 'logo.png' }));
  if (includeBanner && fs.existsSync(bannerPath)) {
    files.push(new AttachmentBuilder(bannerPath, { name: 'ralshadow.png' }));
  }
  return files;
}

function makeLaunchEmbed({ serverName = 'Midtown RP', websiteUrl, connectAddress }) {
  const embed = new EmbedBuilder()
    .setColor(pink)
    .setTitle(`${serverName} is finally live!`)
    .setURL(websiteUrl)
    .setDescription(`The wait is over — **${serverName} has officially launched!**\n\nThe city is open. Bring your friends, create your story, and join us in Los Santos.`)
    .addFields(
      { name: '🌐 GTA5 website', value: `[Visit ${serverName}](${websiteUrl})`, inline: true },
      { name: '🎮 Join the city', value: `\`\`\`connect ${connectAddress}\`\`\``, inline: true },
    )
    .setFooter({ text: `${serverName} • FiveM launch` })
    .setTimestamp();

  if (fs.existsSync(logoPath)) embed.setThumbnail('attachment://logo.png');
  if (fs.existsSync(launchImagePath)) embed.setImage('attachment://carislove.png');
  else if (fs.existsSync(bannerPath)) embed.setImage('attachment://ralshadow.png');
  return embed;
}

function makeLaunchNoticeEmbed({ serverName = 'Midtown RP', discordInviteUrl }) {
  const embed = new EmbedBuilder()
    .setColor(pink)
    .setAuthor({ name: `${serverName.toUpperCase()} • OFFICIAL LAUNCH` })
    .setTitle('THE CITY OPENS TOMORROW')
    .setDescription(
      '**One more night. Then it’s yours.**\n\n'
      + `The lights are coming on, the engines are ready, and **${serverName} launches tomorrow.**\n\n`
      + 'Your next story starts in Los Santos. Keep an eye on Discord for launch-day details.',
    )
    .addFields({
      name: 'GET IN THE LOOP',
      value: discordInviteUrl
        ? `[Join the Midtown Discord →](${discordInviteUrl})\nBe there when the gates open.`
        : 'Watch this Discord for the official launch details.',
    })
    .setFooter({ text: `${serverName.toUpperCase()} • LOS SANTOS AWAITS` });

  if (discordInviteUrl) embed.setURL(discordInviteUrl);
  if (fs.existsSync(logoPath)) embed.setThumbnail('attachment://logo.png');
  if (fs.existsSync(launchImagePath)) embed.setImage('attachment://carislove.png');
  else if (fs.existsSync(bannerPath)) embed.setImage('attachment://ralshadow.png');
  return embed;
}

function launchFiles() {
  return statusFiles();
}

function statusImageName() {
  return fs.existsSync(launchImagePath) ? path.basename(launchImagePath) : path.basename(bannerPath);
}

function statusFiles() {
  const files = [];
  if (fs.existsSync(logoPath)) files.push(new AttachmentBuilder(logoPath, { name: 'logo.png' }));
  const imagePath = statusImageName() === path.basename(launchImagePath) ? launchImagePath : bannerPath;
  if (fs.existsSync(imagePath)) {
    files.push(new AttachmentBuilder(imagePath, { name: path.basename(imagePath) }));
  }
  return files;
}

module.exports = {
  makeUpdateEmbed,
  brandFiles,
  makeLaunchEmbed,
  makeLaunchNoticeEmbed,
  launchFiles,
  statusFiles,
  statusImageName,
};
