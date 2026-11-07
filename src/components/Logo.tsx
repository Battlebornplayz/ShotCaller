/** Placeholder megaphone / "callout" mark. Final artwork arrives in the polish phase (Phase 11). */
export function Logo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="ShotCaller logo" role="img">
      <defs>
        <linearGradient id="sc-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fb0ff" />
          <stop offset="1" stopColor="#4f8cff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#1a1c3a" stroke="rgba(79,140,255,0.4)" />
      <path d="M14 26h8l18-10v28l-18-10h-8z" fill="url(#sc-logo)" />
      <path d="M46 24c3 3 3 13 0 16" fill="none" stroke="#7fb0ff" strokeWidth="3" strokeLinecap="round" />
      <path d="M50 19c5 5 5 21 0 26" fill="none" stroke="#7fb0ff" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
