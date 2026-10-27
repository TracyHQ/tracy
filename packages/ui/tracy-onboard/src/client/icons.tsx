/** The mock's line icons (`ICON` in tasks/evidence/desktop-onboard/mock/onboard.html), as components. */
import type { JSX, ReactNode } from 'react'

function Line({
  size,
  width = 2,
  children
}: {
  size: number
  width?: number
  children: ReactNode
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const Check = (): JSX.Element => (
  <Line size={10} width={3.5}>
    <path d="M20 6 9 17l-5-5" />
  </Line>
)
export const External = (): JSX.Element => (
  <Line size={12}>
    <path d="M7 17 17 7M7 7h10v10" />
  </Line>
)
export const Refresh = (): JSX.Element => (
  <Line size={12}>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </Line>
)
export const Monitor = (): JSX.Element => (
  <Line size={14}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Line>
)
export const Moon = (): JSX.Element => (
  <Line size={14}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </Line>
)
export const Sun = (): JSX.Element => (
  <Line size={14}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Line>
)
export const Sliders = (): JSX.Element => (
  <Line size={14}>
    <path d="M20 7h-9M14 17H5" />
    <circle cx="17" cy="17" r="3" />
    <circle cx="7" cy="7" r="3" />
  </Line>
)
export const Bell = (): JSX.Element => (
  <Line size={14}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Line>
)
export const ChevronLeft = (): JSX.Element => (
  <Line size={16}>
    <path d="m15 18-6-6 6-6" />
  </Line>
)
/** The connect panel's "not connected yet" mark (the mock's `plug`). */
export const Plug = (): JSX.Element => (
  <Line size={14}>
    <path d="M9 2v4M15 2v4M6 6h12v4a6 6 0 0 1-12 0zM12 16v6" />
  </Line>
)
/** The connect panel's and the blocked card's warning mark (an exclamation). */
export const Alert = (): JSX.Element => (
  <Line size={14} width={2.4}>
    <path d="M12 6v8M12 18v.5" />
  </Line>
)

/** The header's "Hide from account menu": lucide `eye-off`, 13px beside the words. */
export const EyeOff = (): JSX.Element => (
  <Line size={13}>
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <path d="m2 2 20 20" />
  </Line>
)
/** "Show in account menu": lucide `eye`, the open twin of `EyeOff`. */
export const Eye = (): JSX.Element => (
  <Line size={13}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Line>
)
/** The header's close button: lucide `x`, 14px as Settings' `.ts-close`. */
export const X = (): JSX.Element => (
  <Line size={14}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Line>
)
