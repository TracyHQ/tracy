// Gate section: the logo material (what the brief found) and the mark decision (cut, icon, lettermark), decisions
// 13, 14, 15, 18, 19, 20. Fills ctx.L, mat, mk, rec and sideMark, then hands the icon record to gate-icon.js
// (which fills IC, iconColours; its blind attempts live in gate-icon-attempts.js).
import { HEX } from './gate-context.js'
import { checkIcon } from './gate-icon.js'

export function checkMaterialAndMark(ctx) {
  const { b, brief, bad, png } = ctx
  const L = b.logo ?? {}
  ctx.L = L
  const mat = L.material
  ctx.mat = mat
  const briefLogo = brief?.brand?.logo ?? null
  if (briefLogo === null) {
    if (mat !== null) bad('logo.material', 'brief.brand.logo is null: null')
  } else if (!mat || typeof mat !== 'object')
    bad('logo.material', '{ mediaId, width, height, hasAlpha, readsAs }')
  else {
    if (mat.mediaId !== briefLogo) bad('logo.material.mediaId', 'must be brief.brand.logo')
    for (const k of ['width', 'height']) if (!Number.isInteger(mat[k])) bad(`logo.material.${k}`, 'integer')
    if (typeof mat.hasAlpha !== 'boolean') bad('logo.material.hasAlpha', 'boolean')
    if (typeof mat.readsAs !== 'string') bad('logo.material.readsAs', "string (the asset's readsAs)")
    if (!(HEX.test(mat.ground ?? '') || mat.ground === 'transparent'))
      bad('logo.material.ground', '"#rrggbb" or "transparent": the ground measure_logo found')
  }
  ctx.materialLookGround =
    mat && typeof mat === 'object'
      ? mat.ground === 'transparent'
        ? '#ffffff'
        : (mat.ground ?? '').toLowerCase()
      : null
  const mk = L.mark ?? {}
  ctx.mk = mk
  if (!['cut', 'icon', 'lettermark'].includes(mk.decision))
    bad('logo.mark.decision', 'cut | icon | lettermark')
  if (!mk.why) bad('logo.mark.why', 'one sentence')
  if (mk.decision === 'lettermark' && !/^[\p{L}\p{N}]{1,2}$/u.test(mk.letters ?? ''))
    bad('logo.mark.letters', '1 or 2 letters')
  if (['cut', 'icon'].includes(mk.decision) && mk.letters !== null)
    bad('logo.mark.letters', `null for ${mk.decision === 'cut' ? 'a cut mark' : 'an icon'}`)
  if (mk.decision === 'cut' && !mat?.mediaId) bad('logo.mark.decision', 'cut needs material')
  png('logo.mark.file', mk.file)
  const rec = mk.recoloured
  ctx.rec = rec
  if (!rec || typeof rec !== 'object' || Array.isArray(rec))
    bad('logo.mark.recoloured', '{ "light": "<file>" | null, "dark": "<file>" | null }')
  else {
    for (const s of ['light', 'dark']) {
      if (!(s in rec)) bad(`logo.mark.recoloured.${s}`, 'missing: a file or null')
      else if (rec[s] !== null) png(`logo.mark.recoloured.${s}`, rec[s])
    }
  }
  ctx.sideMark = (s) => (rec && rec[s]) || mk.file
  checkIcon(ctx)
}
