# Midtown RP FiveM Discord bot

The bot posts a persistent live status card in channel `1554672512556732566`, refreshes it on a timer, shows the next restart in its Discord activity, sends scheduled restart alerts, and offers optional Pterodactyl power controls. The provided logo and banner are used in the status card, restart announcements, and DM opt-in embed. Admin actions are restricted to roles `1554467538291916820` and `1564884642757345362`.

## First run

1. Install Node.js 24.17 or newer.
2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `CLIENT_ID`. Keep this file private.
3. Enable **Server Members Intent** in the Discord Developer Portal under **Bot → Privileged Gateway Intents**. `/dmusers` uses it to load human members. No Message Content intent is needed.
4. Install packages and register the slash commands:

   ```powershell
   npm install
   npm run deploy
   npm start
   ```

   Set `GUILD_ID` during development for immediate command updates. Leave it blank for global commands.
5. Invite the bot with the `bot` and `applications.commands` scopes. Give it view/send message, embed, and attach-file permissions in the status and update channels.

The bot tries to create the live status card in channel `1554672512556732566` on startup. If that ID is not in the bot's server or it cannot post there, use `/setupserver` and choose the channel.

## Connect your FiveM server

Run `/setupserver` as a member with one of the two manager roles and the public FiveM host and port, for example `203.0.113.10:30120`. The configured address is `51.79.162.71:28348`. The bot reads `/info.json` and `/dynamic.json` from that address to show online status, players/max slots, game mode, map, and response time. These endpoints must be reachable from the machine running the bot. Cfx.re documents the server's `/info.json` endpoint and reachability requirements [here](https://docs.fivem.net/docs/support/server-issues/).

Live server status and player counts work without Pterodactyl credentials. Pterodactyl is only needed for server power buttons and panel CPU, memory, and disk details. If you later choose to connect it, set these in `.env`:

- `PTERODACTYL_PANEL_URL` — the panel base URL, such as `https://panel.example.com`
- `PTERODACTYL_SERVER_ID` — the identifier shown in the server's panel URL
- `PTERODACTYL_API_KEY` — a client API key with resource-read and power permissions

The key stays in `.env`; do not send it in Discord or commit it. Pterodactyl's client API accepts `start`, `stop`, and `restart` power signals at its server power endpoint ([API reference](https://docs.pterodactyl.io/v2/api/client-api/clientSendPowerAction)).

## Configure restarts

The default schedule is **08:00 Asia/Kolkata**. Use `/setrestart` to change the daily time(s), timezone, or announcement channel. Times use 24-hour `HH:MM` format, separated by commas (example `04:00,16:00`). The bot announces 15, 5, and 1 minute before the restart. If Pterodactyl is configured, it sends a restart action at the scheduled time. Without panel credentials, staff must restart the server in the host panel; the bot detects it going offline and returning, then posts completion. `/restartdone` is the manual fallback.

Run `/updates` to post the branded opt-in panel. Members can subscribe or stop DMs from its buttons. Subscribers receive restart notices and online/offline alerts.

## Commands

- `/setupserver` — connect a public FiveM address and choose the live status channel.
- `/setrestart` — configure daily restart times, timezone, and announcement channel.
- `/status` — fetch and show current live server status.
- `/restartnow` — announce and request a restart immediately.
- `/restartdone` — manually announce that the server is back online.
- `/serverpower` — start or stop the server through Pterodactyl, with a confirmation button.
- `/updates` — post the DM subscription panel.
- `/dmusers` — prepare a message, preview the member count, and confirm before DMing every human member in this Discord server.

The live card includes buttons to refresh, subscribe/unsubscribe, restart, start, stop, mark a restart complete, open the member DM composer, set the server address, and set the restart schedule. Pterodactyl start/stop buttons appear when panel credentials are configured. Power actions show a confirmation prompt. Every admin command and button checks the two manager role IDs; only those roles can execute the action. The live status card edits the same saved message each refresh instead of posting a new message every 30 seconds. Per-server schedules, subscriptions, and message IDs are stored in `data/guilds.json`.
