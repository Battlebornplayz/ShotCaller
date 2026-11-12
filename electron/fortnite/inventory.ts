import { nativeImage } from 'electron';
import slotDigits from '../../games/fortnite/slotDigits.json';
import type { FnInventory, FnLoadoutItem, FnSlot } from '../../shared/fortnite';
import { BARS_AREA, HELD_LABEL_AREA, HOTBAR_AREA, parseHeldLabel, readBars, readHotbarSlots, type SlotDigits } from '../../shared/fortniteInventory';
import { hudScale, resizeBgra } from '../../shared/fortniteVision';
import type { WindowArea } from '../skillshot/screenCapture';
import { readText } from '../ocr';
import { gameSpace, grabGame } from './gameArea';

/**
 * Live inventory from the screen (Phase F4): the 5 hotbar slots (rarity, count, held), health and shield,
 * read twice a second during a match while you're alive; the held item's name is read with Windows' text
 * reader when you switch to it, and kept for that slot until the slot changes. Never touches the game.
 */

const READ_MS = 500;
/** Re-read the held label at least this often (ammo in the gun changes as you shoot). */
const LABEL_MS = 2500;
const digits = slotDigits as unknown as SlotDigits;

const emptySlots = (): FnSlot[] => [1, 2, 3, 4, 5].map((slot) => ({ slot, empty: true, rarity: null, count: null, held: false, name: null, mag: null }));

let inv: FnInventory = { seen: false, slots: emptySlots(), held: null, heldName: null, health: null, shield: null, materials: null, at: 0 };
/** The last read that showed items: what you carried, for the loadout at the end of the match. */
let lastGood: FnSlot[] | null = null;
let lastReadAt = 0;
let lastLabelAt = 0;
let lastLabelHeld: number | null = null;
let labelBusy = false;
/** Name reads per slot: the spelling read most often wins (the reader sometimes gets a letter wrong). */
const nameVotes = new Map<number, Map<string, number>>();

function voteName(slot: number, name: string): string {
  const votes = nameVotes.get(slot) ?? new Map<string, number>();
  nameVotes.set(slot, votes);
  votes.set(name, (votes.get(name) ?? 0) + 1);
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
const listeners = new Set<(s: FnInventory) => void>();

export function getInventory(): FnInventory {
  return inv;
}

export function onInventory(fn: (s: FnInventory) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function push(): void {
  for (const fn of listeners) fn(inv);
}

/** A HUD corner box (given at 1080p) in game space: the hotbar hangs off the bottom-right, the bars off the bottom-left. */
function cornerBox(g: { width: number; height: number }, box: { x: number; y: number; width: number; height: number }, right: boolean) {
  const k = hudScale(g.width, g.height);
  return {
    x: Math.round(right ? g.width - (1920 - box.x) * k : box.x * k),
    y: Math.round(g.height - (1080 - box.y) * k),
    width: Math.max(1, Math.round(box.width * k)),
    height: Math.max(1, Math.round(box.height * k)),
  };
}

function grab1080(area: WindowArea, box: { x: number; y: number; width: number; height: number }, right: boolean): Uint8Array | null {
  const g = gameSpace(area);
  const b = cornerBox(g, box, right);
  const raw = grabGame(area, g, b);
  return raw ? resizeBgra(raw, b.width, b.height, box.width, box.height) : null;
}

/** Called by the screen reader on each look while you're alive in a match. */
export function readInventory(area: WindowArea): void {
  const now = Date.now();
  if (now - lastReadAt < READ_MS) return;
  lastReadAt = now;
  const hb = grab1080(area, HOTBAR_AREA, true);
  const bars = grab1080(area, BARS_AREA, false);
  if (!hb) return;
  const read = readHotbarSlots(hb, digits);
  const hp = bars ? readBars(bars) : { health: null, shield: null };
  if (!read.seen) {
    if (inv.seen) {
      inv = { ...inv, seen: false, at: now };
      push();
    }
    return;
  }
  const slots: FnSlot[] = read.slots.map((s, i) => {
    const before = inv.slots[i];
    // Same item while the slot stays filled with the same rarity: keep its name and the last mag read.
    const same = !s.empty && !before.empty && (s.rarity === null || before.rarity === null || s.rarity === before.rarity);
    return {
      ...s,
      rarity: s.rarity ?? (same ? before.rarity : null),
      // A count that didn't read this time keeps the last one for the same item.
      count: s.count ?? (same ? before.count : null),
      name: same ? before.name : null,
      mag: same ? before.mag : null,
    };
  });
  for (const s of slots) if (s.name === null) nameVotes.delete(s.slot);
  const heldChanged = read.held !== inv.held;
  inv = {
    seen: true,
    slots,
    held: read.held,
    heldName: heldChanged ? null : inv.heldName,
    health: hp.health ?? inv.health,
    shield: hp.shield ?? inv.shield,
    materials: null,
    at: now,
  };
  if (slots.some((s) => !s.empty)) lastGood = slots.map((s) => ({ ...s }));
  push();
  if (read.held !== null && (read.held !== lastLabelHeld || now - lastLabelAt > LABEL_MS)) void readHeldLabel(area, read.held);
}

/** The held item's name (and gun ammo) from the label left of the hotbar, with Windows' text reader. */
async function readHeldLabel(area: WindowArea, held: number): Promise<void> {
  if (labelBusy) return;
  labelBusy = true;
  lastLabelAt = Date.now();
  lastLabelHeld = held;
  try {
    const px = grab1080(area, HELD_LABEL_AREA, true);
    if (!px) return;
    const { width, height } = HELD_LABEL_AREA;
    // 3x bigger reads far better. First as it is ("SLURP JUICE" read that way on the recordings); when no name
    // comes back, again as black text on white (white HUD text kept, the game behind it dropped), which
    // reads labels over busy backgrounds ("SKYLINE DEPLOYER").
    const big = (pixels: Uint8Array) =>
      nativeImage.createFromBitmap(Buffer.from(pixels), { width, height }).resize({ width: width * 3, height: height * 3, quality: 'best' }).toPNG();
    const opaque = new Uint8Array(px);
    for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
    let lines = await readText(big(opaque));
    let label = parseHeldLabel((lines ?? []).map((l) => l.text).join(' '));
    if (!label.name) {
      const ink = new Uint8Array(px.length);
      for (let i = 0; i < px.length; i += 4) {
        const mn = Math.min(px[i], px[i + 1], px[i + 2]);
        const mx = Math.max(px[i], px[i + 1], px[i + 2]);
        const v = mx - mn < 70 ? Math.min(1, Math.max(0, (mn - 160) / 50)) : 0;
        ink[i] = ink[i + 1] = ink[i + 2] = Math.round(255 - v * 255);
        ink[i + 3] = 255;
      }
      lines = await readText(big(ink));
      const again = parseHeldLabel((lines ?? []).map((l) => l.text).join(' '));
      label = { ...again, mag: label.mag ?? again.mag, reserve: label.reserve ?? again.reserve };
    }
    if (inv.held !== held) return;
    const name = label.name && held >= 1 && held <= 5 ? voteName(held, label.name) : label.name;
    label = { ...label, name };
    inv = { ...inv, heldName: label.name };
    if (held >= 1 && held <= 5) {
      const slots = inv.slots.map((s) => (s.slot === held && !s.empty ? { ...s, name: label.name ?? s.name, rarity: s.rarity ?? label.rarity, mag: label.reserve !== null ? label.mag : s.mag } : s));
      inv = { ...inv, slots };
      if (lastGood) lastGood = lastGood.map((s) => (s.slot === held ? { ...s, name: label.name ?? s.name } : s));
    }
    push();
  } finally {
    labelBusy = false;
  }
}

/** What you carried at the end (the last read with items in it), for the match record. */
export function takeLoadout(): FnLoadoutItem[] | undefined {
  const l = lastGood;
  return l ? l.filter((s) => !s.empty).map((s) => ({ slot: s.slot, name: s.name, rarity: s.rarity, count: s.count })) : undefined;
}

/** A new match (or leaving one): start from an empty hotbar. */
export function resetInventory(): void {
  inv = { seen: false, slots: emptySlots(), held: null, heldName: null, health: null, shield: null, materials: null, at: Date.now() };
  lastGood = null;
  lastLabelHeld = null;
  nameVotes.clear();
  push();
}
