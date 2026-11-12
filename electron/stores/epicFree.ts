import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { EpicFreeGame } from '../../shared/types';

/**
 * Epic's free games of the week (L-Q40, L-Q60), from Epic's public store promotions feed (no
 * sign-in, no key). Kept for a few hours so Home doesn't ask every time it opens.
 */

const FEED = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US';
const TTL = 3 * 3600_000;

let cache: { at: number; games: EpicFreeGame[] } | null = null;
let loading: Promise<EpicFreeGame[]> | null = null;

const file = () => path.join(app.getPath('userData'), 'epic-free.json');

interface Offer {
  startDate?: string;
  endDate?: string;
  discountSetting?: { discountPercentage?: number };
}
interface Element {
  title?: string;
  productSlug?: string | null;
  urlSlug?: string;
  offerType?: string;
  keyImages?: { type?: string; url?: string }[];
  catalogNs?: { mappings?: { pageSlug?: string; pageType?: string }[] | null };
  offerMappings?: { pageSlug?: string; pageType?: string }[] | null;
  price?: { totalPrice?: { discountPrice?: number } };
  promotions?: { promotionalOffers?: { promotionalOffers?: Offer[] }[]; upcomingPromotionalOffers?: { promotionalOffers?: Offer[] }[] } | null;
}

function parse(json: unknown): EpicFreeGame[] {
  const els = (json as { data?: { Catalog?: { searchStore?: { elements?: Element[] } } } })?.data?.Catalog?.searchStore?.elements ?? [];
  const out: EpicFreeGame[] = [];
  for (const e of els) {
    if (!e?.title || !e.promotions) continue;
    const now = (e.promotions.promotionalOffers ?? []).flatMap((p) => p.promotionalOffers ?? []);
    const next = (e.promotions.upcomingPromotionalOffers ?? []).flatMap((p) => p.promotionalOffers ?? []);
    const free = (o: Offer) => o.discountSetting?.discountPercentage === 0;
    const current = now.find(free);
    const upcoming = !current ? next.find(free) : undefined;
    const offer = current ?? upcoming;
    if (!offer?.startDate || !offer.endDate) continue;
    if (current && (e.price?.totalPrice?.discountPrice ?? 0) !== 0) continue;
    const slug =
      e.catalogNs?.mappings?.find((m) => m.pageType === 'productHome')?.pageSlug ??
      e.offerMappings?.find((m) => m.pageType === 'productHome')?.pageSlug ??
      e.productSlug?.replace(/\/home$/, '') ??
      e.urlSlug;
    const img = (t: string) => e.keyImages?.find((k) => k.type === t)?.url;
    const image = img('OfferImageWide') ?? img('DieselStoreFrontWide') ?? img('Thumbnail') ?? img('OfferImageTall');
    out.push({
      title: e.title,
      image: image?.startsWith('https://') ? image : undefined,
      url: slug ? `https://store.epicgames.com/p/${slug}` : 'https://store.epicgames.com/free-games',
      launcherUrl: slug ? `com.epicgames.launcher://store/p/${slug}` : 'com.epicgames.launcher://store/free-games',
      start: Date.parse(offer.startDate),
      end: Date.parse(offer.endDate),
      upcoming: !current,
    });
  }
  return out.sort((a, b) => Number(a.upcoming) - Number(b.upcoming) || a.end - b.end);
}

function readSaved(): { at: number; games: EpicFreeGame[] } | null {
  try {
    const v = JSON.parse(fs.readFileSync(file(), 'utf8')) as { at: number; games: EpicFreeGame[] };
    return typeof v.at === 'number' && Array.isArray(v.games) ? v : null;
  } catch {
    return null;
  }
}

/** This week's free games and next week's (upcoming). Old offers are dropped. */
export async function getEpicFreeGames(): Promise<EpicFreeGame[]> {
  cache ??= readSaved();
  const live = (list: EpicFreeGame[]) => list.filter((g) => g.end > Date.now());
  if (cache && Date.now() - cache.at < TTL) return live(cache.games);
  loading ??= (async () => {
    try {
      const res = await fetch(FEED, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const games = parse(await res.json());
      cache = { at: Date.now(), games };
      try {
        fs.writeFileSync(file(), JSON.stringify(cache), 'utf8');
      } catch {
        // not saved; fine
      }
      return games;
    } catch (err) {
      console.error('Epic free games failed:', err);
      return cache?.games ?? [];
    } finally {
      loading = null;
    }
  })();
  return live(await loading);
}
