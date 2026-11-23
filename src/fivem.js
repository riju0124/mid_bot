const config = require('./config');

function normalizeServerEndpoint(input) {
  if (!input || !input.trim()) return '';
  let url;
  try {
    const value = input.trim();
    url = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`);
  } catch {
    throw new Error('Enter a public host:port such as 203.0.113.10:30120.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use a public http(s) server address without credentials or query parameters.');
  }
  if (!url.port && url.protocol === 'http:') url.port = '30120';
  url.pathname = url.pathname
    .replace(/\/(info|dynamic|players)\.json\/?$/i, '')
    .replace(/\/+$/, '');
  return url.origin + url.pathname;
}

async function readJson(url, timeoutMs = 6000) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function readVar(vars, ...keys) {
  if (!vars || typeof vars !== 'object') return undefined;
  const pairs = Object.entries(vars);
  for (const key of keys) {
    const match = pairs.find(([name]) => name.toLowerCase() === key.toLowerCase());
    if (match) return match[1];
  }
  return undefined;
}

async function fetchFiveMStatus(settings) {
  const baseUrl = normalizeServerEndpoint(settings?.serverEndpoint || config.defaultServerEndpoint);
  if (!baseUrl) {
    return { configured: false, online: null, error: 'Server address is not configured.' };
  }

  const startedAt = Date.now();
  const [infoResult, dynamicResult] = await Promise.allSettled([
    readJson(`${baseUrl}/info.json`),
    readJson(`${baseUrl}/dynamic.json`),
  ]);
  const info = infoResult.status === 'fulfilled' ? infoResult.value : null;
  const dynamic = dynamicResult.status === 'fulfilled' ? dynamicResult.value : null;
  if (!info && !dynamic) {
    const error = infoResult.reason?.message || dynamicResult.reason?.message || 'Status endpoints did not respond.';
    return { configured: true, online: false, baseUrl, error, latencyMs: Date.now() - startedAt };
  }

  const vars = info?.vars || {};
  const rawPlayers = Number(dynamic?.clients);
  const rawMaxPlayers = Number(
    dynamic?.sv_maxclients
      ?? readVar(vars, 'sv_maxclients', 'sv_maxClients')
      ?? 0,
  );
  return {
    configured: true,
    online: true,
    baseUrl,
    serverName: dynamic?.hostname || readVar(vars, 'sv_hostname') || '',
    players: Number.isFinite(rawPlayers) ? rawPlayers : null,
    maxPlayers: Number.isFinite(rawMaxPlayers) && rawMaxPlayers > 0 ? rawMaxPlayers : null,
    gameType: dynamic?.gametype || readVar(vars, 'gametype', 'sv_projectName') || '',
    mapName: dynamic?.mapname || '',
    resourceCount: Array.isArray(info?.resources) ? info.resources.length : null,
    latencyMs: Date.now() - startedAt,
    error: null,
  };
}

function pterodactylConfigured() {
  if (!config.pterodactylPanelUrl || !config.pterodactylServerId || !config.pterodactylApiKey) return false;
  try {
    const panelUrl = new URL(config.pterodactylPanelUrl);
    const localHttp = panelUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(panelUrl.hostname);
    return (panelUrl.protocol === 'https:' || localHttp) && !panelUrl.username && !panelUrl.password;
  } catch {
    return false;
  }
}

function pterodactylUrl(pathname) {
  const base = config.pterodactylPanelUrl.replace(/\/+$/, '');
  const server = encodeURIComponent(config.pterodactylServerId);
  return `${base}/api/client/servers/${server}${pathname}`;
}

function pterodactylHeaders(json = false) {
  return {
    authorization: `Bearer ${config.pterodactylApiKey}`,
    accept: 'application/json',
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}

async function fetchPterodactylStatus() {
  if (!pterodactylConfigured()) return { configured: false, state: null };
  try {
    const response = await fetch(pterodactylUrl('/resources'), {
      headers: pterodactylHeaders(),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { configured: true, state: null, error: `Pterodactyl HTTP ${response.status}` };
    const body = await response.json();
    const attrs = body.attributes || body.data?.attributes || {};
    const resources = attrs.resources || {};
    return {
      configured: true,
      state: attrs.current_state || null,
      suspended: Boolean(attrs.is_suspended),
      cpu: Number.isFinite(Number(resources.cpu_absolute)) ? Number(resources.cpu_absolute) : null,
      memoryBytes: Number.isFinite(Number(resources.memory_bytes)) ? Number(resources.memory_bytes) : null,
      diskBytes: Number.isFinite(Number(resources.disk_bytes)) ? Number(resources.disk_bytes) : null,
      error: null,
    };
  } catch (error) {
    return { configured: true, state: null, error: error.message || 'Pterodactyl request failed.' };
  }
}

async function pterodactylPower(signal) {
  if (!pterodactylConfigured()) return { configured: false, ok: false, error: 'Pterodactyl settings are incomplete.' };
  try {
    const response = await fetch(pterodactylUrl('/power'), {
      method: 'POST',
      headers: pterodactylHeaders(true),
      body: JSON.stringify({ signal }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return { configured: true, ok: false, status: response.status, error: detail.slice(0, 300) };
    }
    return { configured: true, ok: true, status: response.status };
  } catch (error) {
    return { configured: true, ok: false, error: error.message || 'Pterodactyl request failed.' };
  }
}

async function requestRestart(settings, target) {
  if (pterodactylConfigured()) {
    return { ...(await pterodactylPower('restart')), provider: 'Pterodactyl' };
  }
  if (!config.restartWebhookUrl) return { configured: false, ok: false };

  try {
    const headers = { 'content-type': 'application/json' };
    if (config.restartWebhookToken) headers.authorization = `Bearer ${config.restartWebhookToken}`;
    const response = await fetch(config.restartWebhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: 'restart',
        serverName: settings.serverName,
        scheduledAt: target ? target.toUTC().toISO() : new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return { configured: true, ok: response.ok, status: response.status, provider: 'restart webhook' };
  } catch (error) {
    return { configured: true, ok: false, error: error.message || 'Restart webhook request failed.' };
  }
}

module.exports = {
  normalizeServerEndpoint,
  fetchFiveMStatus,
  fetchPterodactylStatus,
  pterodactylConfigured,
  pterodactylPower,
  requestRestart,
};
