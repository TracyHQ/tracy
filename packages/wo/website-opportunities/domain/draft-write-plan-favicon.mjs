// The site icon of the draft write (ticket #597, gate run 7): the kit declares where the template's pages take their
// favicon from (`look.favicon {from: "logo", fallback: "initials", path}`, docs/references/ai-quickstart-contract.md),
// and the write left the template's own icon there. The plan makes one op that writes the file at the declared path:
// from the logo the plan uploads (its stored bytes), or from the business initials on the accent when the plan has no
// logo picture (a text logo, no logo at all). The file format is the path's: `.ico` (16, 32 and 48 pixel PNG
// entries) or `.png` (one 32 pixel square); a path the write cannot make (`.svg`) is flagged
// `favicon_format_unknown` and written nowhere. A kit with no `look.favicon` writes no icon. Pure; part of `opsOf`.
import { initialsOf } from './person-avatar.mjs'

/** The square sizes each file format the write makes holds. */
export const FAVICON_SIZES = Object.freeze({ ico: [16, 32, 48], png: [32] })

/** The logo picture the plan uploads, with its stored bytes, or null. */
function logoOf(state) {
  for (const p of state.pictures.values()) {
    const stored = state.stored?.[p.id]
    if ((p.kind === 'logo' || p.picture?.reason === 'logo_from_brand_step') && stored?.id)
      return { picture: p.id, stored }
  }
  return null
}

/** The business name of the order (its `business.name` fact). */
const nameOf = (order) =>
  (Array.isArray(order.facts) ? order.facts : []).find((f) => f.kind === 'business.name')?.value ?? ''

/**
 * The favicon op, or null when the kit declares none or its path names a format the write cannot make.
 * @returns {object | null}
 */
export function faviconOp(state) {
  const declared = state.kit.mapping.look?.favicon
  if (!declared?.path) return null
  const format = String(declared.path).split('.').pop().toLowerCase()
  if (!Object.hasOwn(FAVICON_SIZES, format)) {
    state.sink.unproven.push({ code: 'favicon_format_unknown', path: declared.path, format })
    return null
  }
  // The brand step's own icon in the path's format (`look.favicon` among the stored pictures, #575 P3 of the brand
  // audit): its set was made from the logo and checked by the bench (`favicon-check.js`), so it is written as it is.
  const brand = declared.from === 'logo' ? state.stored?.['look.favicon'] : null
  const logo = declared.from === 'logo' ? logoOf(state) : null
  const initials = declared.fallback === 'initials' ? initialsOf(nameOf(state.order)) : ''
  const draw = { initials, colours: [state.order.look?.accent].filter(Boolean) }
  // A brand icon that fails its check at write time falls back to the logo, then to the initials (`fallback`).
  if (brand?.id)
    return {
      key: 'look.favicon',
      kind: 'look.favicon',
      path: declared.path,
      format,
      sizes: FAVICON_SIZES[format],
      from: 'brand',
      stored: brand,
      fallback: logo ? { from: 'logo', ...logo } : { from: 'initials', draw },
      entries: [],
      rules: ['favicon_from_brand_file']
    }
  if (!logo && !initials) {
    state.sink.unproven.push({ code: 'favicon_without_source', path: declared.path })
    return null
  }
  return {
    key: 'look.favicon',
    kind: 'look.favicon',
    path: declared.path,
    format,
    sizes: FAVICON_SIZES[format],
    from: logo ? 'logo' : 'initials',
    ...logo,
    ...(logo ? {} : { draw }),
    entries: [],
    rules: [logo ? 'favicon_from_logo' : 'favicon_from_initials']
  }
}
