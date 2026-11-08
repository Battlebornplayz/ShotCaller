// Shared helpers for the Steam Edge Functions. The Steam Web API key only ever lives here,
// as the STEAM_API_KEY function secret.

export const STEAM_API = 'https://api.steampowered.com';

export function steamKey(): string {
  const key = Deno.env.get('STEAM_API_KEY');
  if (!key) throw new Error('STEAM_API_KEY is not set on the server');
  return key;
}

export interface PlayerSummary {
  steamid: string;
  personaname?: string;
  avatarfull?: string;
  communityvisibilitystate?: number;
}

export async function playerSummary(steamId: string): Promise<PlayerSummary | null> {
  const url = `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/?key=${steamKey()}&steamids=${steamId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = await res.json();
  return body?.response?.players?.[0] ?? null;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
