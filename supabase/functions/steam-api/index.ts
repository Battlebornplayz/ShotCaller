// Steam Web API proxy. The app calls this with the user's JWT; the Steam key stays server-side.
//
//   POST /steam-api  { "method": "GetOwnedGames", "params": { "steamid": "7656..." } }
//
// Only the methods and parameters listed below are forwarded, and every value is validated.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { json, STEAM_API, steamKey } from '../_shared/steam.ts';

type Check = (v: string) => boolean;
const steamId: Check = (v) => /^\d{17}$/.test(v);
const steamIds: Check = (v) => v.split(',').length <= 100 && v.split(',').every(steamId);
const appId: Check = (v) => /^\d{1,10}$/.test(v);
const flag: Check = (v) => v === '0' || v === '1' || v === 'true' || v === 'false';
const lang: Check = (v) => /^[a-z]{2,20}$/.test(v);
const count: Check = (v) => /^\d{1,3}$/.test(v);

interface Method {
  path: string;
  params: Record<string, Check>;
  required: string[];
}

const METHODS: Record<string, Method> = {
  GetPlayerSummaries: { path: 'ISteamUser/GetPlayerSummaries/v2', params: { steamids: steamIds }, required: ['steamids'] },
  GetFriendList: { path: 'ISteamUser/GetFriendList/v1', params: { steamid: steamId }, required: ['steamid'] },
  GetOwnedGames: {
    path: 'IPlayerService/GetOwnedGames/v1',
    params: { steamid: steamId, include_appinfo: flag, include_played_free_games: flag },
    required: ['steamid'],
  },
  GetRecentlyPlayedGames: { path: 'IPlayerService/GetRecentlyPlayedGames/v1', params: { steamid: steamId, count }, required: ['steamid'] },
  GetPlayerAchievements: {
    path: 'ISteamUserStats/GetPlayerAchievements/v1',
    params: { steamid: steamId, appid: appId, l: lang },
    required: ['steamid', 'appid'],
  },
  GetUserStatsForGame: { path: 'ISteamUserStats/GetUserStatsForGame/v2', params: { steamid: steamId, appid: appId }, required: ['steamid', 'appid'] },
  GetSchemaForGame: { path: 'ISteamUserStats/GetSchemaForGame/v2', params: { appid: appId, l: lang }, required: ['appid'] },
  GetGlobalAchievementPercentagesForApp: {
    path: 'ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2',
    params: { gameid: appId },
    required: ['gameid'],
  },
};

const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // The gateway already checked the JWT (verify_jwt = true); this makes sure it's a real user, not just the anon key.
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: user } = await auth.auth.getUser(jwt);
  if (!user.user) return json({ error: 'not_signed_in' }, 401);

  let body: { method?: unknown; params?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const method = typeof body.method === 'string' ? METHODS[body.method] : undefined;
  if (!method) return json({ error: 'unknown_method' }, 400);

  const params = body.params && typeof body.params === 'object' ? (body.params as Record<string, unknown>) : {};
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    const check = method.params[name];
    const v = typeof value === 'number' || typeof value === 'boolean' ? String(value) : value;
    if (!check || typeof v !== 'string' || !check(v)) return json({ error: 'bad_param', param: name }, 400);
    query.set(name, v);
  }
  for (const r of method.required) if (!query.has(r)) return json({ error: 'missing_param', param: r }, 400);

  query.set('key', steamKey());
  query.set('format', 'json');
  const res = await fetch(`${STEAM_API}/${method.path}/?${query}`);
  const text = await res.text();
  // Steam answers 403 for private profiles and 400 for games without stats; pass the status through.
  return new Response(text, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'private, max-age=60' },
  });
});
