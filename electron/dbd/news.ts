import { net } from 'electron';
import type { DbdPatchNote } from '../../shared/dbd';
import { DBD_STEAM_APP } from '../../shared/dbd';
import { cleanBbcode } from './text';

/**
 * DbD's official patch notes from Steam's public news feed (no key). Only Behaviour's own announcements
 * (feed "steam_community_announcements"); news-site articles are skipped.
 */

interface SteamNewsItem {
  gid: string;
  title: string;
  url: string;
  contents: string;
  feedname: string;
  date: number;
}

const NEWS_URL = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${DBD_STEAM_APP}&count=80&maxlength=0&feeds=steam_community_announcements&format=json`;

/** Patch notes, PTB notes and developer updates; not merch or sweepstakes posts. */
const PATCHY = /\d+\.\d+\.\d+|patch|ptb|developer update|dev update|hotfix|bug ?fix/i;

export async function fetchPatchNotes(): Promise<DbdPatchNote[]> {
  const res = await net.fetch(NEWS_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Steam news answered ${res.status}`);
  const j = (await res.json()) as { appnews?: { newsitems?: SteamNewsItem[] } };
  return (j.appnews?.newsitems ?? [])
    .filter((n) => n.feedname === 'steam_community_announcements' && PATCHY.test(n.title))
    .map((n) => ({
      id: n.gid,
      title: n.title.trim(),
      version: n.title.match(/\b(\d+\.\d+\.\d+[a-z]?)\b/i)?.[1]?.toLowerCase() ?? null,
      ptb: /\bptb\b/i.test(n.title),
      date: n.date * 1000,
      url: n.url,
      html: cleanBbcode(n.contents),
    }))
    .sort((a, b) => b.date - a.date);
}
