// Gate section: the name logos, the look records, the spots and the variants a spot really shows (decisions 1, 11, 12).
// Only SHOWN logo variants are listed: logo.logos.<side> is set exactly when a spot of that side shows the one-line
// logo, logo.logos.twoLines.<side> exactly when one shows the two-line logo; the last look of every shown variant,
// and of the side's mark when a spot shows the mark alone, passes. Unused variants need no look.
import { HEX } from './gate-context.js'

export function checkNameLogos(ctx) {
  const { L, exact, bad, png } = ctx
  const N = L.name ?? {}
  ctx.N = N
  if (N.text !== exact) bad('logo.name.text', `must be exactly "${exact}"`)
  if (exact && ![exact, exact.toUpperCase()].includes(N.rendersAs))
    bad('logo.name.rendersAs', `"${exact}" or its capitals "${exact.toUpperCase()}"`)
  for (const s of ['light', 'dark']) {
    png(`logo.name.files.${s}`, N.files?.[s])
    if (L.logos?.[s] !== null) png(`logo.logos.${s}`, L.logos?.[s])
  }
  const words = (exact ?? '').trim().split(/\s+/).length
  if (N.twoLines === undefined) bad('logo.name.twoLines', '{ lines, files } or null (one-word name)')
  else if (N.twoLines !== null) {
    const ln = N.twoLines.lines
    if (!Array.isArray(ln) || ln.length !== 2 || ln.join(' ') !== exact?.trim().split(/\s+/).join(' ')) {
      bad('logo.name.twoLines.lines', 'the exact name split in two at a word boundary')
    }
    for (const s of ['light', 'dark']) png(`logo.name.twoLines.files.${s}`, N.twoLines.files?.[s])
  } else if (words > 1) bad('logo.name.twoLines', 'the name has several words: record the two-line variant')
  const twoLogos = L.logos?.twoLines
  ctx.twoLogos = twoLogos
  if (twoLogos === undefined)
    bad(
      'logo.logos.twoLines',
      '{ light, dark } (each a file or null) or null when no spot shows a two-line logo'
    )
  if (twoLogos) {
    for (const s of ['light', 'dark']) {
      if (!(s in twoLogos)) bad(`logo.logos.twoLines.${s}`, 'missing: a file or null')
      else if (twoLogos[s] !== null) png(`logo.logos.twoLines.${s}`, twoLogos[s])
    }
  }
}

/** The look records: shape, and the last look of every final file (and of every file on a ground) passes. */
export function checkLooks(ctx) {
  const { L, bad, fileOk, norm } = ctx
  const lastLook = new Map()
  const lastLookOn = new Map()
  ctx.lastLook = lastLook
  ctx.lastLookOn = lastLookOn
  if (!Array.isArray(L.look) || !L.look.length) bad('logo.look', 'non-empty array')
  else {
    L.look.forEach((l, i) => {
      if (fileOk(`logo.look[${i}].file`, l.file)) lastLook.set(norm(l.file), l.verdict)
      if (!HEX.test(l.ground ?? '')) bad(`logo.look[${i}].ground`, '#rrggbb the image was shown on')
      if (!['pass', 'fail'].includes(l.verdict)) bad(`logo.look[${i}].verdict`, 'pass|fail')
      if (!Array.isArray(l.checks) || !l.checks.length) bad(`logo.look[${i}].checks`, 'non-empty array')
      else {
        l.checks.forEach((c, j) => {
          if (
            typeof c !== 'object' ||
            !c ||
            typeof c.check !== 'string' ||
            !['pass', 'fail'].includes(c.verdict) ||
            typeof c.reason !== 'string'
          ) {
            bad(
              `logo.look[${i}].checks[${j}]`,
              '{ "check": "<check text>", "verdict": "pass|fail", "reason": "<reviewer reason>" }'
            )
          }
        })
      }
      if (Array.isArray(l.checks) && l.verdict === 'pass' && l.checks.some((c) => c?.verdict !== 'pass')) {
        bad(`logo.look[${i}].verdict`, 'pass only when every check passed')
      }
    })
  }
  if (Array.isArray(L.look)) {
    for (const l of L.look) {
      if (typeof l.file === 'string' && typeof l.ground === 'string')
        lastLookOn.set(`${norm(l.file)}@${l.ground.toLowerCase()}`, l.verdict)
    }
  }
}

/** The spots (every kit logo spot once, on the kit ground) and the variants they show, with their last look. */
export function checkSpotsAndShown(ctx) {
  const { L, K, N, mk, twoLogos, spots, bad, png, norm, lastLook, lastLookOn, sideMark } = ctx
  const passed = (field, f) => {
    if (typeof f === 'string' && lastLook.get(norm(f)) !== 'pass')
      bad(field, 'its last look_logo is not a pass')
  }
  const shown = { logo: new Set(), 'logo-2-lines': new Set(), mark: new Set() }
  if (!Array.isArray(L.spots)) bad('logo.spots', 'array')
  else {
    const seen = new Map()
    L.spots.forEach((s, i) => {
      const k = spots.find((x) => x.id === s.spot)
      if (!k) bad(`logo.spots[${i}].spot`, `"${s.spot}" is not a kit logoSpots id`)
      seen.set(s.spot, (seen.get(s.spot) ?? 0) + 1)
      png(`logo.spots[${i}].file`, s.file)
      if (/images\/joomlart\//.test(s.file ?? '')) bad(`logo.spots[${i}].file`, 'a demo logo file')
      if (!['logo', 'logo-2-lines', 'mark'].includes(s.shows))
        bad(`logo.spots[${i}].shows`, 'logo | logo-2-lines | mark (as fit_logo reported)')
      if (s.shows === 'logo-2-lines' && !N.twoLines)
        bad(`logo.spots[${i}].shows`, 'no two-line name recorded')
      if (k && shown[s.shows]) shown[s.shows].add(k.ground.side)
      if (k && (s.ground ?? '').toLowerCase() !== k.ground.colour.toLowerCase())
        bad(`logo.spots[${i}].ground`, `the kit spot ground ${k.ground.colour} (backgrounds never change)`)
      if (k && s.writable !== (k.setting !== null))
        bad(`logo.spots[${i}].writable`, `kit setting is ${k.setting === null ? 'null: false' : 'set: true'}`)
    })
    for (const k of spots) {
      const n = seen.get(k.id) ?? 0
      if (n !== 1) bad('logo.spots', `spot ${k.id} appears ${n} times (must be once)`)
    }
  }
  // shown variants only: listed exactly when a spot shows them, and their last look passes
  for (const s of ['light', 'dark']) {
    const one = L.logos?.[s] ?? null
    const two = twoLogos?.[s] ?? null
    if (shown.logo.has(s)) {
      if (!one) bad(`logo.logos.${s}`, `a ${s} spot shows the one-line logo: give its file`)
      else passed(`logo.logos.${s}`, one)
    } else if (one)
      bad(`logo.logos.${s}`, `no ${s} spot shows the one-line logo: null (unused variants are not listed)`)
    if (shown['logo-2-lines'].has(s)) {
      if (!two) bad(`logo.logos.twoLines.${s}`, `a ${s} spot shows the two-line logo: give its file`)
      else passed(`logo.logos.twoLines.${s}`, two)
    } else if (two)
      bad(
        `logo.logos.twoLines.${s}`,
        `no ${s} spot shows the two-line logo: null (unused variants are not listed)`
      )
    // judged per ground (one mark file can pass on one side's ground and fail on the other's before its recolour)
    if (shown.mark.has(s) && mk.decision !== 'icon') {
      const g = K.site.brandColours.sides.find((x) => x.groundSide === s)?.ground?.toLowerCase()
      const f = sideMark(s)
      if (typeof f === 'string' && lastLookOn.get(`${norm(f)}@${g}`) !== 'pass')
        bad(
          `logo.mark (shown alone on ${s})`,
          `its last look_logo on the ${s} side's ground ${g} is not a pass`
        )
    }
  }
  checkMarkLooks(ctx, passed)
}

/** The mark's own looks: a cut mark on its material ground, an icon's blind looks and its per-side looks. */
function checkMarkLooks(ctx, passed) {
  const { L, K, mk, twoLogos, bad, norm, lastLookOn, sideMark, materialLookGround } = ctx
  if (
    mk.decision === 'cut' &&
    materialLookGround &&
    typeof mk.file === 'string' &&
    lastLookOn.get(`${norm(mk.file)}@${materialLookGround}`) !== 'pass'
  ) {
    bad(
      'logo.mark.file',
      `the last look of the cut mark on the material's ground ${materialLookGround} is not a pass`
    )
  }
  if (mk.decision === 'icon' && typeof mk.file === 'string' && Array.isArray(L.look)) {
    const blindLooks = L.look.filter(
      (l) =>
        typeof l.file === 'string' &&
        norm(l.file) === norm(mk.file) &&
        (l.checks ?? []).some((c) => String(c?.check ?? '').startsWith('blind:'))
    )
    const bl = blindLooks.flatMap((l) =>
      (l.checks ?? []).filter((c) => String(c?.check ?? '').startsWith('blind:'))
    )
    if (!bl.length || bl[bl.length - 1].verdict !== 'pass')
      bad('logo.mark.file', 'the icon\'s look has no passing "blind:" check')
    else if (blindLooks.some((l) => l.shownAt !== 128))
      bad('logo.look (blind)', 'every blind look of the icon is shown at 128 px (shownAt: 128)')
  }
  if (twoLogos && !twoLogos.light && !twoLogos.dark)
    bad('logo.logos.twoLines', 'no spot shows a two-line logo: null')
  if (mk.decision === 'cut' && !materialLookGround) passed('logo.mark.file', mk.file) // with material, judged on its ground above
  if (mk.decision === 'icon') {
    for (const s of ['light', 'dark']) {
      const g = K.site.brandColours.sides.find((x) => x.groundSide === s)?.ground?.toLowerCase()
      const f = sideMark(s)
      if (g && typeof f === 'string' && lastLookOn.get(`${norm(f)}@${g}`) !== 'pass')
        bad(`logo.mark (icon on ${s})`, `the last look_logo of the ${s} side's mark on ${g} is not a pass`)
    }
  }
}
