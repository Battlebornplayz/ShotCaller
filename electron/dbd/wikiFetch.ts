import { net } from 'electron';
import type { DbdData } from '../../shared/dbd';
import { buildData, DUMPS, MODULES, USER_AGENT, WIKI, type DumpName } from './wiki';

/** Downloads the wiki's data modules (one request) and text dumps (one each, with a pause). */


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, body?: URLSearchParams): Promise<unknown> {
  const res = await net.fetch(url, {
    method: body ? 'POST' : 'GET',
    body,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
  });
  if (!res.ok) throw new Error(`The DbD wiki answered ${res.status}`);
  const text = await res.text();
  if (text.startsWith('<')) throw new Error('The DbD wiki asked to slow down; trying again later');
  return JSON.parse(text);
}

async function fetchModules(): Promise<Record<string, string>> {
  const q = new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', format: 'json', formatversion: '2', titles: MODULES.join('|') });
  const j = (await getJson(`${WIKI}/api.php?${q}`)) as { query?: { pages?: { title: string; revisions?: { slots: { main: { content: string } } }[] }[] } };
  const out: Record<string, string> = {};
  for (const p of j.query?.pages ?? []) {
    const c = p.revisions?.[0]?.slots.main.content;
    if (c) out[p.title] = c;
  }
  for (const m of MODULES) if (!out[m]) throw new Error(`The DbD wiki didn't send ${m}`);
  return out;
}

async function fetchDump(fn: DumpName): Promise<Record<string, string>> {
  const body = new URLSearchParams({ action: 'expandtemplates', prop: 'wikitext', format: 'json', formatversion: '2', text: `{{#invoke:API|${fn}}}` });
  const j = (await getJson(`${WIKI}/api.php`, body)) as { expandtemplates?: { wikitext?: string } };
  const w = j.expandtemplates?.wikitext;
  if (!w) throw new Error(`The DbD wiki didn't send ${fn}`);
  const parsed = JSON.parse(w) as unknown;
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
}

export async function fetchWikiData(steamBuild: string | null, onStep?: (step: string) => void): Promise<DbdData> {
  onStep?.('game data');
  const src = await fetchModules();
  const texts: Partial<Record<DumpName, Record<string, string>>> = {};
  for (const fn of DUMPS) {
    await sleep(1500);
    onStep?.(fn.replace('dumpAll', '').toLowerCase());
    texts[fn] = await fetchDump(fn);
  }
  return buildData(src, texts, steamBuild);
}

