/**
 * The three verdicts a finding gets (`classify.mjs`), and their shape: `auto` with its rewrite (the
 * role variable with the literal as its fallback), `flag` with the roles it could be, `keep` with why.
 * PURE.
 */
import { roleOrNull } from './hints.mjs'
import { tailwindFallback, tailwindReplacement } from './tailwind.mjs'

const c = (r) => `--ds-c-${r}`

export function auto(f, role, reason, ctx) {
  if (f.source === 'tailwind') {
    const fb = tailwindFallback(f, ctx.twMajor, ctx.twConfig)
    if (!fb)
      return flag(
        role,
        [role],
        `Tailwind ${ctx.twMajor || '?'}: the class's own value cannot be read from the class`
      )
    return { class: 'auto', role, reason, replacement: tailwindReplacement(f, role, fb) }
  }
  if (f.valueType === 'colour') return { class: 'auto', role, reason, replacement: `var(${role}, ${f.text})` }
  const m = /^(.*?)(\s*!important)?$/i.exec(f.text)
  return { class: 'auto', role, reason, replacement: `var(${role}, ${m[1]})${m[2] ?? ''}` }
}

export const keep = (reason) => ({ class: 'keep', role: null, reason })
export const flag = (role, candidates, reason) => ({
  class: 'flag',
  role: null,
  candidates: [
    ...new Set(
      candidates.map((r) =>
        r.startsWith('--') ? r : r.includes('radius') || r.startsWith('font') ? `--ds-${r}` : c(r)
      )
    )
  ].filter((r) => roleOrNull(r)),
  reason: role ? `${reason} (best guess ${role})` : reason
})
