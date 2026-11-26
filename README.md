# Midtown RP FiveM Discord bot

The bot posts a persistent live status card in channel `1554672512556732566` and sends online/offline alerts. Admin actions are restricted to roles `1554467538291916820` and `1564884642757345362`.

## First run

1. Install Node.js 24.17 or newer.
2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`. `DISCORD_INVITE_URL` is used by the launch notice and defaults to the Midtown invite. Add `CLIENT_ID` if you plan to run `npm run deploy` manually. Keep this file private.
3. Enable **Server Members Intent** in the Discord Developer Portal under **Bot → Privileged Gateway Intents**. `/dmusers` uses it to load human members. No Message Content intent is needed.
4. Install packages, register the slash commands, and start the bot:

   ```powershell
   npm install
   npm run deploy
   npm start
   ```

   The bot also syncs slash commands when it starts. Set `GUILD_ID` during development for immediate command updates. Leave it blank for global commands.
5. Invite the bot with the `bot` and `applications.commands` scopes. Give it view/send message, embed, and attach-file permissions in the status and update channels.

The bot tries to create the live status card in channel `1554672512556732566` on startup. If that ID is not in the bot's server or it cannot post there, use `/setupserver` and choose the channel. For Bot-Hosting, use root `index.js` as the entry file (it forwards to `src/index.js`); if uploading only the `src` folder, set the entry file to `src/index.js`.

## Connect your FiveM server

Run `/setupserver` as a member with one of the two manager roles and the public FiveM host and port, for example `203.0.113.10:30120`. The configured address is `15.235.180.174:25991`. The bot reads `/info.json` and `/dynamic.json` from that address to show online status, players/max slots, game mode, map, and response time. These endpoints must be reachable from the machine running the bot. Cfx.re documents the server's `/info.json` endpoint and reachability requirements [here](https://docs.fivem.net/docs/support/server-issues/).

Live server status and player counts work without Pterodactyl credentials. Pterodactyl optionally supplies panel CPU, memory, and disk details. If you later choose to connect it, set these in `.env`:

- `PTERODACTYL_PANEL_URL` — the panel base URL, such as `https://panel.example.com`
- `PTERODACTYL_SERVER_ID` — the identifier shown in the server's panel URL
- `PTERODACTYL_API_KEY` — a client API key with resource-read permission

Run `/updates` to post the branded opt-in panel. Members can subscribe or stop DMs from its buttons. Subscribers receive online/offline alerts.

## Commands

- `/setupserver` — connect a public FiveM address and choose the live status channel.
- `/status` — fetch and show current live server status.
- `/updates` — post the DM subscription panel.
- `/dmusers` — prepare a message, preview the member count, and confirm before DMing every human member in this Discord server.
- `/sentlaunch website:<URL> connect_address:<optional host:port>` — preview a branded launch DM with the GTA5 website and connect address, then confirm before sending it to every human member. It uses the saved game address if no connect address is supplied and sends `carislove.png` as its background.
- `/sentlaunchuser member:<member> website:<URL> connect_address:<optional host:port>` — preview the same launch DM and confirm before sending it only to the selected human member.
- `/sendlaunchnotice` — preview and confirm a cinematic, branded DM to every human member saying Midtown RP launches tomorrow, with the server artwork, logo, and Discord invite button. The previewed member list is reused when sending to avoid another gateway member-fetch request.

The public live card has two buttons: refresh status and get DM updates. It uses `carislove.png` as its banner and places the Instagram and YouTube links at the bottom. Server setup and member broadcasts are available through management slash commands. Admin commands check the two manager role IDs. The card edits the same saved message every 30 seconds by default (configurable with `STATUS_REFRESH_SECONDS`) instead of posting a new message. Per-server settings, subscriptions, and message IDs are stored in `data/guilds.json`.
