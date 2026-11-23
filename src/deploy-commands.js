const { REST, Routes } = require('discord.js');
const config = require('./config');
const { commands } = require('./commands');

async function deploy(applicationId = config.clientId) {
  if (!config.token || !applicationId) {
    throw new Error('Set DISCORD_TOKEN and CLIENT_ID in your .env file first.');
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(applicationId, config.guildId)
    : Routes.applicationCommands(applicationId);
  const result = await rest.put(route, { body: commands });
  console.log(`Registered ${result.length} commands${config.guildId ? ` in guild ${config.guildId}` : ' globally'}.`);
  return result;
}

if (require.main === module) {
  deploy().catch((error) => {
    console.error('Command deployment failed:', error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { deploy };
