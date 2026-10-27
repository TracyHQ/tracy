import type { SVGProps } from 'react'
import { useId, useState } from 'react'

/**
 * Hand-written, not generated: EmDash's official icon mark, the one Tracy draws everywhere it shows
 * EmDash (Design inspiration, My Sites, the platform picker). The drawing is copied unmodified from
 * vendor/emdash/emdash/packages/admin/src/components/Logo.tsx (LogoIcon), MIT licence,
 * Copyright 2026 Cloudflare Inc.
 *
 * Why it is not an SVG under icons/platforms/: the mark is two gradients, and a gradient is reached
 * by url(#id). The generator would bake one fixed id into every copy, so two marks on one page (a
 * filter chip and a card, the picker pill and its open menu) would resolve to whichever copy came
 * first, and break as soon as that copy is hidden or removed. useId alone is not enough either: every
 * Tracy plugin mounts its own React root, and two roots count useId from the same start, so the picker
 * and Design inspiration can mint the same id on one page. So each drawing adds a random
 * suffix, drawn once per mount, to its useId.
 *
 * One drawing for both themes: EmDash's own admin shows this mark on light and dark alike, so this
 * directory has no dark.tsx (the generator treats it like providers/opencode: a manual logo dir).
 */
const EmdashLight = (props: SVGProps<SVGSVGElement>) => {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [salt] = useState(() => Math.random().toString(36).slice(2, 8))
  const id = `${reactId}-${salt}`
  const border = `emdash-icon-border-${id}`
  const dash = `emdash-icon-dash-${id}`
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 75 75"
      fill="none"
      width="1em"
      height="1em"
      {...props}
    >
      <rect x="3" y="3" width="69" height="69" rx="10.518" stroke={`url(#${border})`} strokeWidth="6" />
      <rect x="18" y="34" width="39.3661" height="6.56101" fill={`url(#${dash})`} />
      <defs>
        <linearGradient
          id={border}
          x1="-42.9996"
          y1="124"
          x2="92.4233"
          y2="-41.7456"
          gradientUnits="userSpaceOnUse"
        >
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
        <linearGradient
          id={dash}
          x1="91.4992"
          y1="27.4982"
          x2="28.1217"
          y2="54.1775"
          gradientUnits="userSpaceOnUse"
        >
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

export { EmdashLight }
export default EmdashLight
