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

module.exports = { makeUpdateEmbed, brandFiles, makeLaunchEmbed, launchFiles, statusFiles, statusImageName };
