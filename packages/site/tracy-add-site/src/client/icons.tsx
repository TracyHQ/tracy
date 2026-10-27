/**
 * The tab's icon. One inline `<svg>`, `currentColor`, no dependencies.
 *
 * Why not dsh's or better-sidebar's icon set: both are runtime dependencies this
 * plugin does not need, and a wrong import path in the client bundle is a blank pane with no
 * explanation. A 12-line drawing is cheaper than that risk.
 *
 * `strokeWidth` fixed at 1.8 rather than following `size`: the tab bar draws icons at 16–20px, and a stroke
 * that scales with size in that range gets so thin it vanishes on non-HiDPI screens.
 */
import type { JSX } from 'react'

export function AddSiteIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* The globe: a site living on the open web. */}
      <circle cx="10.5" cy="10.5" r="7.5" />
      <path d="M3 10.5h15M10.5 3a12 12 0 0 1 0 15 12 12 0 0 1 0-15" />
      {/* The plus: add one more. */}
      <path d="M18 15v6M15 18h6" />
    </svg>
  )
}
