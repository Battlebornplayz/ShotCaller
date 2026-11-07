import type { Channel, PatchNote } from '../shared/types';

export const GITHUB_OWNER = 'Battlebornplayz';
export const GITHUB_REPO = 'ShotCaller';

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

/**
 * Patch notes come straight from the GitHub release bodies.
 * Stable shows only full releases; beta shows pre-releases too.
 */
export async function fetchPatchNotes(channel: Channel): Promise<PatchNote[]> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=15`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ShotCaller-Launcher',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub responded with ${res.status}`);
  }
  const releases = (await res.json()) as GitHubRelease[];
  return releases
    .filter((r) => !r.draft)
    .filter((r) => channel === 'beta' || !r.prerelease)
    .slice(0, 8)
    .map((r) => ({
      version: r.tag_name.replace(/^v/, ''),
      name: r.name || r.tag_name,
      date: r.published_at,
      body: r.body ?? '',
      prerelease: r.prerelease,
    }));
}
