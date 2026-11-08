import { useState, type CSSProperties, type ReactNode } from 'react';
import { moduleById } from '../../../games';
import type { LibraryGame } from '../../../shared/types';

const STEAM_CDN = 'https://cdn.akamai.steamstatic.com/steam/apps';

/** Portrait cover candidates, best first. */
export function coverSources(g: LibraryGame): string[] {
  const id = g.steamAppId ?? g.achievementAppId;
  const out: string[] = [];
  if (id) out.push(`${STEAM_CDN}/${id}/library_600x900.jpg`);
  if (g.poster) out.push(g.poster);
  return out;
}

/** Wide banner candidates, best first. */
export function bannerSources(g: LibraryGame): string[] {
  const id = g.steamAppId ?? g.achievementAppId;
  const mod = moduleById(g.moduleId);
  const out: string[] = [];
  if (mod.headerArt) out.push(mod.headerArt);
  if (id) out.push(`${STEAM_CDN}/${id}/header.jpg`);
  if (g.poster) out.push(g.poster);
  return out;
}

/** An image that walks down a list of sources on error, then shows the fallback. */
export function Art({ sources, alt = '', style, fallback }: { sources: string[]; alt?: string; style?: CSSProperties; fallback: ReactNode }) {
  const key = sources.join('|');
  // Failure count per source list, so a new list starts again from its first source.
  const [failed, setFailed] = useState<{ key: string; n: number }>({ key, n: 0 });
  const i = failed.key === key ? failed.n : 0;
  if (i >= sources.length) return <>{fallback}</>;
  return (
    <img
      src={sources[i]}
      alt={alt}
      loading="lazy"
      onError={() => setFailed({ key, n: i + 1 })}
      style={{ objectFit: 'cover', display: 'block', ...style }}
    />
  );
}
