/**
 * ShotCaller mark: a megaphone inside two crossed orbits (logo "variant 2", chosen in Phase 3).
 * Same artwork as resources/icon.png and build/icon.png. `tile={false}` draws the mark without
 * its navy background, for placing on a colored button.
 */
export function Logo({ size = 64, tile = true }: { size?: number; tile?: boolean }) {
  const small = size <= 20;
  const orbit = small ? 4.5 : 2.4;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="ShotCaller logo" role="img">
      {tile && <rect width="64" height="64" rx="16" fill="#1a1c3a" />}
      <ellipse cx="32" cy="32" rx="25" ry="9" transform="rotate(30 32 32)" fill="none" stroke="#7fb2ff" strokeWidth={orbit} />
      <ellipse cx="32" cy="32" rx="25" ry="9" transform="rotate(-30 32 32)" fill="none" stroke="#7fb2ff" strokeWidth={orbit} />
      <path d="M18 28h6l12-8v24l-12-8h-6z" fill="#fff" />
      {!small && <path d="M40 27c2 3 2 7 0 10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  );
}
