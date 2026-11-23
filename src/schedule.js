const { DateTime } = require('luxon');

function parseDailyTimes(input) {
  const values = input.split(',').map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) throw new Error('Enter at least one restart time, such as 04:00.');

  const unique = new Set();
  for (const value of values) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new Error(`“${value}” is not a valid 24-hour time. Use HH:MM, for example 04:00.`);
    }
    unique.add(value);
  }
  return [...unique].sort();
}

function isValidTimezone(timezone) {
  return Boolean(timezone) && DateTime.now().setZone(timezone).isValid;
}

function targetForDate(date, time, timezone) {
  const [hour, minute] = time.split(':').map(Number);
  return DateTime.fromObject(
    { year: date.year, month: date.month, day: date.day, hour, minute, second: 0, millisecond: 0 },
    { zone: timezone },
  );
}

function nextRestart(config, nowUtc = DateTime.utc()) {
  if (!config || !config.times?.length || !config.timezone) return null;
  const localNow = nowUtc.setZone(config.timezone);
  if (!localNow.isValid) return null;

  for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
    const date = localNow.plus({ days: dayOffset });
    for (const time of config.times) {
      const candidate = targetForDate(date, time, config.timezone);
      if (candidate.isValid && candidate.toMillis() > nowUtc.toMillis()) return candidate;
    }
  }
  return null;
}

function occurrencesNearNow(config, nowUtc = DateTime.utc()) {
  if (!config || !config.times?.length || !config.timezone) return [];
  const localNow = nowUtc.setZone(config.timezone);
  if (!localNow.isValid) return [];
  const results = [];

  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    const date = localNow.plus({ days: dayOffset });
    for (const time of config.times) {
      const target = targetForDate(date, time, config.timezone);
      if (target.isValid) results.push(target);
    }
  }
  return results;
}

function countdown(target, nowUtc = DateTime.utc()) {
  const totalMinutes = Math.max(0, Math.floor((target.toMillis() - nowUtc.toMillis()) / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDateTime(target) {
  return `${target.toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY)} (${target.zoneName})`;
}

module.exports = {
  parseDailyTimes,
  isValidTimezone,
  nextRestart,
  occurrencesNearNow,
  countdown,
  formatDateTime,
};
