import { nativeImage } from 'electron';
import type { WindowArea } from '../skillshot/screenCapture';
import { resizeBgra } from '../../shared/fortniteVision';
import { FullMapLocator, defaultView, heightAt1920, VIEW_THRESHOLD, isFullMap, readFullMapMarks, readMapPanel, readStorm, type MapView } from '../../shared/fortniteFullMap';
import { currentFrame, gameSpace, grabGame } from './gameArea';
import { getSeasonMapStatus, getSeasonMapGrey, onSeasonMap } from './seasonMap';
import { fromFullMap, getSquadColors, setFullMapView, setMapPanel } from './liveMap';
import { getSettings } from '../settings';
import { placeMapLayer } from './mapLayerWindow';

/**
 * Fortnite's full map (M). While it's open: works out where the season map is drawn on it (size and position;
 * you can zoom and pan), then reads what Fortnite shows there: your arrow (checks and fixes the live dot),
 * teammates' arrows and markers in their squad colours, and the storm (next circle and current edge). The map
 * layer window draws ShotCaller's own map on top using the same view. Screen copies only.
 */

/** Heavy reads (marks, storm) at most this often while the map is open. */
const MARKS_EVERY_MS = 700;
const STORM_EVERY_MS = 2000;
/** A kept view is re-checked on every look; below this it's searched again. */
const KEEP_SCORE = 0.45;

let locator: FullMapLocator | null = null;
let locatorFor: string | null = null;
let view: MapView | null = null;
let open = false;
let searching = false;
let lastMarksAt = 0;
let lastStormAt = 0;

function getLocator(): FullMapLocator | null {
  const id = getSeasonMapStatus().id;
  if (!id) return null;
  if (locatorFor !== id) {
    const grey = getSeasonMapGrey();
    if (!grey) return null;
    locator = new FullMapLocator(grey);
    locatorFor = id;
  }
  return locator;
}

/** The whole game picture scaled to 1920 wide (1920x1080 on 16:9, 1920x1200 on 16:10), from this look's copy. */
function frame1920(area: WindowArea): Uint8Array | null {
  const g = gameSpace(area);
  const raw = grabGame(area, g, { x: 0, y: 0, width: g.width, height: g.height });
  if (!raw) return null;
  const h = heightAt1920(g.width, g.height);
  return g.width === 1920 && g.height === h ? raw : resizeBgra(raw, g.width, g.height, 1920, h);
}

let height = 1080;

function setOpen(next: boolean): void {
  if (!next) placeMapLayer(null, null);
  if (open === next) return;
  open = next;
  setFullMapView(open ? view : null, open, height);
}

/**
 * Called on each look while a match is on. Returns true when the full map is open (the HUD readers then skip
 * this look: the map covers the HUD).
 */
export function readFullMapScreen(area: WindowArea): boolean {
  const f = currentFrame();
  if (!f || !getSettings().fortnite.liveMap) return false;
  // Cheap test on the raw copy first: a handful of pixels.
  if (!isFullMap(f.pixels, f.area.width)) {
    setOpen(false);
    return false;
  }
  const g = gameSpace(area);
  height = heightAt1920(g.width, g.height);
  setOpen(true);
  placeMapLayer(area, g);
  const loc = getLocator();
  if (!loc || searching) return true;
  const px = frame1920(area);
  if (!px) return true;

  // Is the map still where it was? (one quick check); else search near it; else everywhere, spread over time.
  const kept = view ? loc.locate(px, view, true) : null;
  if (kept && kept.score >= KEEP_SCORE) {
    if (kept.scale !== view!.scale || kept.x !== view!.x || kept.y !== view!.y) {
      view = kept;
      setFullMapView(view, true, height);
    }
  } else {
    const near = loc.locate(px, view ?? defaultView(Math.round(px.length / (1920 * 4))));
    if (near && near.score >= VIEW_THRESHOLD) {
      view = near;
      setFullMapView(view, true, height);
    } else {
      searching = true;
      void loc
        .locateAsync(px)
        .then((v) => {
          if (v && v.score >= VIEW_THRESHOLD) {
            view = v;
            if (open) setFullMapView(view, true, height);
          }
        })
        .finally(() => {
          searching = false;
        });
      return true;
    }
  }

  const now = Date.now();
  if (now - lastMarksAt >= MARKS_EVERY_MS) {
    lastMarksAt = now;
    const colours = getSquadColors();
    // Yours too: your own marker is a pin in your colour.
    const squad = colours.me ? [...colours.mates, colours.me] : colours.mates;
    const marks = readFullMapMarks(px, view!, squad, loc.greySampler(view!));
    let storm: ReturnType<typeof readStorm> | null = null;
    if (now - lastStormAt >= STORM_EVERY_MS) {
      lastStormAt = now;
      storm = readStorm(px, view!);
    }
    fromFullMap(marks, storm);
    readPanel(px, now);
  }
  return true;
}

/** Name pictures are cut again at most this often (they don't change in a match, but rows can reorder). */
const NAMES_EVERY_MS = 15000;
let names: { at: number; list: (string | null)[] } = { at: 0, list: [] };

/** The left panel: storm timer, players left, each squad member's eliminations with their name as a picture. */
function readPanel(px: Uint8Array, now: number): void {
  const p = readMapPanel(px);
  if (p.stormSecs === null && p.playersLeft === null) return;
  if (p.elims.length !== names.list.length || now - names.at > NAMES_EVERY_MS) {
    names = { at: now, list: p.elims.map((e) => cutOut(px, e.name)) };
  }
  setMapPanel({
    stormSecs: p.stormSecs,
    playersLeft: p.playersLeft,
    teamsLeft: p.teamsLeft,
    squad: p.elims.map((e, i) => ({ count: e.count, name: names.list[i] ?? null })),
    at: now,
  });
}

/** A box of the 1920-wide picture as a PNG data URL. */
function cutOut(px: Uint8Array, b: { x: number; y: number; width: number; height: number }): string | null {
  const h = Math.round(px.length / (1920 * 4));
  if (b.x < 0 || b.y < 0 || b.x + b.width > 1920 || b.y + b.height > h) return null;
  const out = Buffer.alloc(b.width * b.height * 4);
  for (let y = 0; y < b.height; y++) {
    const from = ((b.y + y) * 1920 + b.x) * 4;
    out.set(px.subarray(from, from + b.width * 4), y * b.width * 4);
  }
  return nativeImage.createFromBitmap(out, { width: b.width, height: b.height }).toDataURL();
}

export function initFullMap(): void {
  onSeasonMap(() => {
    locator = null;
    locatorFor = null;
    view = null;
  });
}
