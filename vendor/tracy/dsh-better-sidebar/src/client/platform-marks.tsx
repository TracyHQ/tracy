/**
 * The platforms' own marks for the Browser tab's title (Tracy, 01/10/2026, edit-mode review card 5):
 * the same drawings as Tracy's platform picker, in each brand's own colour, where the title used to
 * draw one-colour `react-icons/si` glyphs.
 *
 * 🔁 KEEP IN SYNC BY HAND. This fork may not import Tracy packages, so the SVG data is COPIED from:
 *   - WordPress: TCH `packages/ui/tracy-ui/src/components/icons/platforms/wordpress/light.tsx`
 *     (Simple Icons path, `#21759B`); on a dark surface the white W, as the picker does
 *     (`packages/ui/tracy-mode-picker/src/client/styles.ts`: the blue W is about 2.3:1 there, and
 *     WordPress's own logo kit offers the W in white for dark grounds).
 *   - Joomla: `.../platforms/joomla/light.tsx` (Simple Icons path, `#5091CD`; about 3.5:1 on dark, kept).
 *   - EmDash: `.../platforms/emdash/light.tsx`, EmDash's official icon mark, copied there unmodified
 *     from `vendor/emdash/emdash/packages/admin/src/components/Logo.tsx` (LogoIcon), MIT licence,
 *     Copyright 2026 Cloudflare Inc. One drawing for both themes, as EmDash's own admin shows it.
 * The picker draws them through `packages/ui/tracy-mode-picker/src/client/platform-logo.tsx`. Change
 * a mark there first, then copy it here.
 */
import { useEffect, useId, useState, type ReactElement } from 'react'
import { isDarkScheme, subscribeColorScheme } from './theme.ts'

/** The WordPress W's blue, and the white W for dark surfaces. */
export const WORDPRESS_BLUE = '#21759B'
export const WORDPRESS_ON_DARK = '#FFFFFF'
export const JOOMLA_BLUE = '#5091CD'

const WORDPRESS_PATH = 'M21.469 6.825c.84 1.537 1.318 3.3 1.318 5.175 0 3.979-2.156 7.456-5.363 9.325l3.295-9.527c.615-1.54.82-2.771.82-3.864 0-.405-.026-.78-.07-1.11m-7.981.105c.647-.03 1.232-.105 1.232-.105.582-.075.514-.93-.067-.899 0 0-1.755.135-2.88.135-1.064 0-2.85-.15-2.85-.15-.585-.03-.661.855-.075.885 0 0 .54.061 1.125.09l1.68 4.605-2.37 7.08L5.354 6.9c.649-.03 1.234-.1 1.234-.1.585-.075.516-.93-.065-.896 0 0-1.746.138-2.874.138-.2 0-.438-.008-.69-.015C4.911 3.15 8.235 1.215 12 1.215c2.809 0 5.365 1.072 7.286 2.833-.046-.003-.091-.009-.141-.009-1.06 0-1.812.923-1.812 1.914 0 .89.513 1.643 1.06 2.531.411.72.89 1.643.89 2.977 0 .915-.354 1.994-.821 3.479l-1.075 3.585-3.9-11.61.001.014zM12 22.784c-1.059 0-2.081-.153-3.048-.437l3.237-9.406 3.315 9.087c.024.053.05.101.078.149-1.12.393-2.325.609-3.582.609M1.211 12c0-1.564.336-3.05.935-4.39L7.29 21.709C3.694 19.96 1.212 16.271 1.211 12M12 0C5.385 0 0 5.385 0 12s5.385 12 12 12 12-5.385 12-12S18.615 0 12 0'

const JOOMLA_PATH = 'M16.719 14.759L14.22 17.26l-2.37 2.37-.462.466c-1.368 1.365-3.297 1.83-5.047 1.397-.327 1.424-1.604 2.49-3.13 2.49C1.438 23.983 0 22.547 0 20.772c0-1.518 1.055-2.789 2.469-3.123-.446-1.76.016-3.705 1.396-5.08l.179-.18 2.37 2.37-.184.181c-.769.779-.769 2.024 0 2.789.771.78 2.022.78 2.787 0l.465-.465 2.367-2.371 2.502-2.506 2.368 2.372zm.924 6.652c-1.822.563-3.885.12-5.328-1.318l-.18-.185 2.365-2.369.18.184c.771.768 2.018.768 2.787 0 .765-.765.769-2.01-.004-2.781l-.466-.465-2.365-2.37-2.502-2.503 2.37-2.369 2.499 2.505 2.367 2.37.464.464c1.365 1.36 1.846 3.278 1.411 5.021 1.56.224 2.759 1.56 2.759 3.18 0 1.784-1.439 3.21-3.209 3.21-1.545 0-2.851-1.096-3.135-2.565l-.013-.009zM6.975 9.461l2.508-2.505 2.37-2.369.462-.461C13.74 2.7 15.772 2.251 17.58 2.79c.212-1.561 1.555-2.775 3.179-2.775 1.772 0 3.211 1.437 3.211 3.209 0 1.631-1.216 2.978-2.79 3.186.519 1.799.068 3.816-1.35 5.234l-.182.184-2.369-2.369.184-.184c.769-.77.769-2.016 0-2.783-.766-.766-2.011-.768-2.781.003l-.462.461-2.37 2.369-2.505 2.502-2.37-2.366zm-2.653 2.647l-.461-.462C2.43 10.215 1.986 8.17 2.529 6.358 1.1 6.029.03 4.754.03 3.224.03 1.454 1.47.015 3.24.015c1.596 0 2.92 1.166 3.17 2.691 1.73-.405 3.626.065 4.979 1.415l.184.185-2.37 2.37-.183-.181c-.77-.765-2.016-.765-2.785 0-.771.781-.77 2.025-.005 2.79l.465.466 2.37 2.369 2.505 2.505-2.367 2.37-2.51-2.505-2.371-2.37v-.012z'

/** Whether dsh's page is dark now, following its theme switch live. */
function useDarkScheme(): boolean {
  const [dark, setDark] = useState(isDarkScheme)
  useEffect(() => subscribeColorScheme(() => { setDark(isDarkScheme()) }), [])
  return dark
}

/** WordPress's W: its blue on a light surface, white on a dark one. */
export function WordpressMark({ size }: { size: number }): ReactElement {
  const dark = useDarkScheme()
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" data-mark="wordpress">
      <path fill={dark ? WORDPRESS_ON_DARK : WORDPRESS_BLUE} d={WORDPRESS_PATH} />
    </svg>
  )
}

/** Joomla's mark in its blue, in both themes. */
export function JoomlaMark({ size }: { size: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" data-mark="joomla">
      <path fill={JOOMLA_BLUE} d={JOOMLA_PATH} />
    </svg>
  )
}

/**
 * EmDash's official mark: two gradients, reached by url(#id), so each drawing gets its own ids
 * (`useId`) — the tab title and the open site menu can show it at once.
 */
export function EmdashMark({ size }: { size: number }): ReactElement {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const border = `emdash-icon-border-${id}`
  const dash = `emdash-icon-dash-${id}`
  return (
    <svg viewBox="0 0 75 75" fill="none" width={size} height={size} aria-hidden="true" data-mark="emdash">
      <rect x="3" y="3" width="69" height="69" rx="10.518" stroke={`url(#${border})`} strokeWidth="6" />
      <rect x="18" y="34" width="39.3661" height="6.56101" fill={`url(#${dash})`} />
      <defs>
        <linearGradient id={border} x1="-42.9996" y1="124" x2="92.4233" y2="-41.7456" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0F006B" />
          <stop offset="0.0833" stopColor="#281A81" />
          <stop offset="0.1667" stopColor="#5D0C83" />
          <stop offset="0.25" stopColor="#911475" />
          <stop offset="0.3333" stopColor="#CE2F55" />
          <stop offset="0.4167" stopColor="#FF6633" />
          <stop offset="0.5" stopColor="#F6821F" />
          <stop offset="0.5833" stopColor="#FBAD41" />
          <stop offset="0.6667" stopColor="#FFCD89" />
          <stop offset="0.75" stopColor="#FFE9CB" />
          <stop offset="0.8333" stopColor="#FFF7EC" />
          <stop offset="0.9167" stopColor="#FFF8EE" />
          <stop offset="1" stopColor="white" />
        </linearGradient>
        <linearGradient id={dash} x1="91.4992" y1="27.4982" x2="28.1217" y2="54.1775" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" />
          <stop offset="0.1293" stopColor="#FFF8EE" />
          <stop offset="0.6171" stopColor="#FBAD41" />
          <stop offset="0.848" stopColor="#F6821F" />
          <stop offset="1" stopColor="#FF6633" />
        </linearGradient>
      </defs>
    </svg>
  )
}
