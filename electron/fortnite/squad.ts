import { randomBytes } from 'node:crypto';
import { nativeImage } from 'electron';
import mqtt, { type MqttClient } from 'mqtt';
import { captureScreen, type WindowArea } from '../skillshot/screenCapture';
import type { FnFriend, FnMapState, FnSquadState } from '../../shared/fortnite';
import { getSettings } from '../settings';
import { getLiveMap, onLiveMap, setSquadDots } from './liveMap';

/**
 * Squad link (early F5 build): "Start squad" makes a short code, a friend types it, and each app sends its own
 * map dot (read from its own minimap) to the other through a public MQTT relay. The code is the channel name,
 * so only people with the code see the dots. Nothing secret is sent: a random id, the Epic name (or "Friend")
 * and map pixel positions.
 */

const BROKER = 'mqtts://broker.emqx.io:8883';
const TOPIC = (code: string) => `shotcaller/squad/v1/${code}`;
const SEND_EVERY_MS = 500;
const HEARTBEAT_MS = 5000;
/** A friend not heard from for this long is dropped. */
const FORGET_MS = 90_000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

interface Message {
  id: string;
  name: string;
  dot: FnMapState['dot'];
  /** Our match start, so a friend's path restarts when we start a new match. */
  match: number | null;
  leaving?: boolean;
  /** The sender's hotbar picture (JPEG data URL), sent on its own about every 2 s. */
  inv?: string;
}

const myId = randomBytes(6).toString('hex');
let client: MqttClient | null = null;
let state: FnSquadState = { status: 'off', code: null, error: null, friends: [], mine: null };
const inventories = new Map<string, string>();
let lastHotbarAt = 0;
const HOTBAR_EVERY_MS = 2000;
const friends = new Map<string, FnFriend & { match: number | null }>();
const listeners = new Set<(s: FnSquadState) => void>();
let lastSentAt = 0;
let lastSentKey = '';
let timer: NodeJS.Timeout | null = null;
let matchMarker: number | null = null;

export function getSquad(): FnSquadState {
  return state;
}

export function onSquad(fn: (s: FnSquadState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setState(patch: Partial<FnSquadState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

function publishFriends(): void {
  const list: FnFriend[] = [...friends.values()].map((f) => ({ id: f.id, name: f.name, dot: f.dot, route: f.route, seenAt: f.seenAt }));
  setSquadDots(list);
  setState({ friends: list.map((f) => ({ id: f.id, name: f.name, seenAt: f.seenAt, inventory: inventories.get(f.id) ?? null })) });
}

function makeCode(): string {
  const b = randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[b[i] % CODE_CHARS.length];
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

/** Turns what the user typed into the code form (case, spaces and dashes don't matter). */
function cleanCode(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 6) return null;
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

function myName(): string {
  return getSettings().fortnite.epicName.trim() || 'Friend';
}

function send(force = false): void {
  if (!client || !state.code || state.status !== 'on') return;
  const live = getLiveMap();
  const dot = live.dot;
  const key = dot ? `${dot.x},${dot.y},${dot.state}` : 'none';
  const now = Date.now();
  if (!force && now - lastSentAt < SEND_EVERY_MS) return;
  if (!force && key === lastSentKey && now - lastSentAt < HEARTBEAT_MS) return;
  lastSentAt = now;
  lastSentKey = key;
  const msg: Message = { id: myId, name: myName(), dot, match: matchMarker };
  client.publish(TOPIC(state.code), JSON.stringify(msg), { qos: 0 });
}

function receive(raw: Buffer): void {
  let msg: Message;
  try {
    msg = JSON.parse(raw.toString('utf8')) as Message;
  } catch {
    return;
  }
  if (!msg || typeof msg.id !== 'string' || msg.id === myId) return;
  if (msg.leaving) {
    friends.delete(msg.id);
    inventories.delete(msg.id);
    publishFriends();
    return;
  }
  const name = String(msg.name ?? 'Friend').slice(0, 32);
  let f = friends.get(msg.id);
  if (!f || f.match !== msg.match) {
    f = { id: msg.id, name, dot: null, route: [], seenAt: 0, match: msg.match ?? null };
    friends.set(msg.id, f);
  }
  f.name = name;
  f.seenAt = Date.now();
  if (typeof msg.inv === 'string') {
    if (msg.inv.startsWith('data:image/jpeg;base64,') && msg.inv.length < 200_000) inventories.set(msg.id, msg.inv);
    publishFriends();
    return;
  }
  const d = msg.dot;
  if (d && Number.isFinite(d.x) && Number.isFinite(d.y)) {
    f.dot = { x: d.x, y: d.y, state: d.state === 'sure' ? 'sure' : 'unsure', at: f.seenAt };
    const last = f.route[f.route.length - 1];
    if (d.state === 'sure' && (!last || Math.hypot(last[0] - d.x, last[1] - d.y) >= 2)) f.route.push([d.x, d.y]);
  } else {
    f.dot = null;
  }
  publishFriends();
}

function connect(code: string): void {
  disconnect(false);
  setState({ status: 'connecting', code, error: null, friends: [] });
  const c = mqtt.connect(BROKER, {
    clientId: `shotcaller_${myId}_${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 3000,
    connectTimeout: 10_000,
    clean: true,
  });
  client = c;
  c.on('connect', () => {
    c.subscribe(TOPIC(code), { qos: 0 }, (err) => {
      if (err) {
        setState({ status: 'error', error: `Couldn't join: ${err.message}` });
        return;
      }
      setState({ status: 'on', error: null });
      send(true);
    });
  });
  c.on('message', (_topic, payload) => receive(payload));
  c.on('reconnect', () => state.code && setState({ status: 'connecting' }));
  c.on('error', (err) => setState({ status: 'error', error: err.message }));
  c.on('offline', () => state.code && setState({ status: 'connecting', error: 'Offline, retrying…' }));
}

function disconnect(clearState = true): void {
  const c = client;
  client = null;
  if (c) {
    if (state.code && c.connected) {
      const bye: Message = { id: myId, name: myName(), dot: null, match: null, leaving: true };
      c.publish(TOPIC(state.code), JSON.stringify(bye), { qos: 0 }, () => c.end(true));
    } else {
      c.end(true);
    }
  }
  friends.clear();
  inventories.clear();
  setSquadDots([]);
  if (clearState) setState({ status: 'off', code: null, error: null, friends: [] });
}

/**
 * Crops your hotbar (pickaxe, 5 slots and the Q item, with their rarity colours and ammo) from the screen about
 * every 2 s, keeps it as "your inventory" and sends it to linked friends. A picture, not a reading: no item
 * recognition needed. Measured at 1920x1080, default HUD; scaled for other heights.
 */
export function readHotbar(area: WindowArea): void {
  const now = Date.now();
  if (now - lastHotbarAt < HOTBAR_EVERY_MS) return;
  lastHotbarAt = now;
  const k = area.height / 1080;
  const box = {
    x: Math.round(area.width - (1920 - 1310) * k),
    y: Math.round(area.height - (1080 - 830) * k),
    width: Math.round(580 * k),
    height: Math.round(190 * k),
  };
  const pixels = captureScreen({ x: area.x + box.x, y: area.y + box.y, width: box.width, height: box.height });
  if (!pixels) return;
  const opaque = Buffer.from(pixels);
  for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  let img = nativeImage.createFromBitmap(opaque, { width: box.width, height: box.height });
  if (k !== 1) img = img.resize({ width: 580, height: 190 });
  const url = `data:image/jpeg;base64,${img.toJPEG(70).toString('base64')}`;
  setState({ mine: url });
  if (client && state.code && state.status === 'on') {
    const msg: Message = { id: myId, name: myName(), dot: getLiveMap().dot, match: matchMarker, inv: url };
    client.publish(TOPIC(state.code), JSON.stringify(msg), { qos: 0 });
  }
}

export function startSquad(): FnSquadState {
  connect(makeCode());
  return state;
}

export function joinSquad(raw: string): FnSquadState {
  const code = cleanCode(raw);
  if (!code) {
    setState({ error: 'A code is 6 letters/numbers, like K7F-2QX.' });
    return state;
  }
  connect(code);
  return state;
}

export function leaveSquad(): FnSquadState {
  disconnect(true);
  return state;
}

export function initSquad(): void {
  onLiveMap((s) => {
    // A new match on our side clears our path on the friend's map.
    if (s.route.length === 0 && s.dot === null) matchMarker = Date.now();
    send();
  });
  timer = setInterval(() => {
    send();
    const now = Date.now();
    let changed = false;
    for (const [id, f] of friends) {
      if (now - f.seenAt > FORGET_MS) {
        friends.delete(id);
        changed = true;
      } else if (f.dot && f.dot.state === 'sure' && now - f.seenAt > 10_000) {
        f.dot = { ...f.dot, state: 'unsure' };
        changed = true;
      }
    }
    if (changed) publishFriends();
  }, 2000);
  timer.unref?.();
}

export function stopSquad(): void {
  if (timer) clearInterval(timer);
  timer = null;
  disconnect(true);
}
