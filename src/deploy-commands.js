const { REST, Routes } = require('discord.js');
const config = require('./config');
const { commands } = require('./commands');

async function deploy() {
  if (!config.token || !config.clientId) {
    throw new Error('Set DISCORD_TOKEN and CLIENT_ID in your .env file first.');
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);
  const result = await rest.put(route, { body: commands });
  console.log(`Registered ${result.length} commands${config.guildId ? ` in guild ${config.guildId}` : ' globally'}.`);
}

deploy().catch((error) => {
  console.error('Command deployment failed:', error.message || error);
  process.exitCode = 1;
});
