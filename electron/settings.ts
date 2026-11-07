import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Channel, Settings } from '../shared/types';

const DEFAULTS: Settings = { channel: 'stable' };

let cache: Settings | null = null;

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function sanitize(raw: Partial<Settings>): Settings {
  const channel: Channel = raw.channel === 'beta' ? 'beta' : 'stable';
  return { ...DEFAULTS, channel };
}

export function getSettings(): Settings {
  if (cache) return cache;
  try {
    cache = sanitize(JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as Partial<Settings>);
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function setSettings(patch: Partial<Settings>): Settings {
  cache = sanitize({ ...getSettings(), ...patch });
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save settings:', err);
  }
  return cache;
}
