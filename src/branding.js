const path = require('node:path');
const fs = require('node:fs');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');

const logoPath = path.join(__dirname, '..', 'logo.png');
const bannerPath = path.join(__dirname, '..', 'ralshadow.png');
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

module.exports = { makeUpdateEmbed, brandFiles };
