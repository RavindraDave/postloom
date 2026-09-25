/** The Postloom brand mark: woven threads (three warp, two weft). */
export function LoomMark({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" strokeOpacity={0.55} />
      <path d="M4 17h16" />
      <path d="M8 4v16" strokeOpacity={0.55} />
      <path d="M16 4v16" />
    </svg>
  );
}
