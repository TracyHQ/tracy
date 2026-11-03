// Gate section: the logo material (what the brief found), the mark decision (cut, icon, lettermark) and the icon
// record with its blind attempts (decisions 13, 14, 15, 18, 19, 20). Fills ctx.L, mat, mk, rec, IC, iconColours,
// materialLookGround and sideMark for the sections after it.
import { HEX } from './gate-context.js'
import { blindVerdict } from './blind-match.js'
import { PLATE_MIN_RATIO, contrastHex } from './colour-math.js'

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

function checkIcon(ctx) {
  const { brief, bad, mk, mat } = ctx
  const IC = mk.icon
  ctx.IC = IC
  const C = ctx.C
  const logoColours =
    brief?.brand?.colorsFrom === 'logo'
      ? (brief?.brand?.colors ?? [])
          .map((c) => c.hex?.toLowerCase())
          .filter(Boolean)
          .slice(0, 2)
      : []
  ctx.iconColours = null
  if (mk.decision === 'icon' && (!IC || typeof IC !== 'object'))
    bad('logo.mark.icon', 'an icon mark records { subject, colours, coloursFrom, provider, model, attempts }')
  else if (mk.decision === 'cut' && IC != null) bad('logo.mark.icon', 'null for a cut mark')
  if (IC && typeof IC === 'object' && mk.decision !== 'cut') {
    if (typeof IC.subject !== 'string' || !IC.subject.trim())
      bad('logo.mark.icon.subject', 'the last subject given to make_icon')
    if (!['logo', 'accent'].includes(IC.coloursFrom)) bad('logo.mark.icon.coloursFrom', 'logo | accent')
    const got = Array.isArray(IC.colours) ? IC.colours.map((c) => String(c).toLowerCase()) : null
    if (!got || !got.length || got.length > 2 || got.some((c) => !HEX.test(c)))
      bad('logo.mark.icon.colours', '1 or 2 #rrggbb')
    else if (IC.coloursFrom === 'logo') {
      if (!mat)
        bad('logo.mark.icon.coloursFrom', 'logo needs material: with no logo the icon takes the accent')
      else if (!logoColours.length)
        bad('logo.mark.icon.coloursFrom', 'the brief has no colours measured from the logo: accent')
      else if (got.join() !== logoColours.join())
        bad('logo.mark.icon.colours', `exactly the logo's colours in order: ${JSON.stringify(logoColours)}`)
    } else if (IC.coloursFrom === 'accent') {
      if (mat && logoColours.length)
        bad(
          'logo.mark.icon.coloursFrom',
          `the logo has colours ${JSON.stringify(logoColours)}: the icon takes them (logo)`
        )
      if (got.length !== 1 || got[0] !== (C.accent ?? '').toLowerCase())
        bad('logo.mark.icon.colours', `no logo: one colour, colours.accent (${C.accent})`)
    }
    ctx.iconColours = got
    for (const k of ['provider', 'model'])
      if (typeof IC[k] !== 'string' || !IC[k]) bad(`logo.mark.icon.${k}`, 'as make_icon reported')
    for (const k of ['businessType', 'businessTypeFrom', 'neighbour', 'distinguishing']) {
      if (typeof IC[k] !== 'string' || !IC[k].trim())
        bad(`logo.mark.icon.${k}`, 'written once at step start (see the prompt, step 3 Icon)')
    }
    if (!Array.isArray(IC.accept))
      bad('logo.mark.icon.accept', 'array of close synonyms of the business type (may be empty)')
    if (!Array.isArray(IC.neighbourAccept))
      bad(
        'logo.mark.icon.neighbourAccept',
        'array of other names of the neighbouring business (may be empty)'
      )
    checkAttempts(ctx, IC)
  }
  if (mk.decision === 'lettermark' && !Array.isArray(IC?.attempts))
    bad('logo.mark.icon', 'a lettermark is only the last fallback; record the three failed icon attempts')
}

function checkAttempts(ctx, IC) {
  const { bad, mk, same, fileOk, iconColours } = ctx
  const at = IC.attempts
  const drawn = Array.isArray(at) ? at.filter((t) => t?.verdict !== 'tool-failed') : []
  if (!Array.isArray(at) || !at.length || at.length > 4 || drawn.length > 3) {
    bad(
      'logo.mark.icon.attempts',
      'at most 3 drawn attempts (tool failures not counted) and at most 4 make_icon calls, in order'
    )
    return
  }
  at.forEach((t, i) => {
    if (t?.verdict !== 'tool-failed') checkBlind(ctx, IC, t, i)
    if (!['pass', 'fail', 'tool-failed'].includes(t?.verdict))
      bad(`logo.mark.icon.attempts[${i}].verdict`, 'pass | fail | tool-failed')
    if (typeof t?.subject !== 'string' || !t.subject)
      bad(`logo.mark.icon.attempts[${i}].subject`, 'the subject of that attempt')
    if (t?.verdict !== 'tool-failed') {
      fileOk(`logo.mark.icon.attempts[${i}].file`, t?.file)
      fileOk(`logo.mark.icon.attempts[${i}].raw`, t?.raw)
    }
    if (t?.verdict !== 'tool-failed' && t?.plate != null) {
      const pl = t.plate
      const f = `logo.mark.icon.attempts[${i}].plate`
      if (!['circle', 'rounded-square'].includes(pl.shape)) bad(`${f}.shape`, 'circle | rounded-square')
      if (
        iconColours &&
        [pl.iconColour, pl.plateColour]
          .map((c) => String(c).toLowerCase())
          .sort()
          .join() !== [...iconColours].sort().join()
      ) {
        bad(f, 'iconColour and plateColour are the two icon colours')
      } else if (iconColours) {
        const r = contrastHex(pl.iconColour, pl.plateColour)
        if (r !== pl.ratio) bad(`${f}.ratio`, `recomputed ${r}`)
        if (r < PLATE_MIN_RATIO)
          bad(`${f}.ratio`, `the plate fallback needs ${PLATE_MIN_RATIO}:1 between icon and plate`)
      }
    } else if (t?.verdict !== 'tool-failed' && !('plate' in (t ?? {})))
      bad(`logo.mark.icon.attempts[${i}].plate`, 'null, or the plate fallback make_icon reported')
  })
  const last = drawn[drawn.length - 1]
  if (mk.decision === 'icon') {
    if (last?.verdict !== 'pass' || !same(last?.file, mk.file))
      bad('logo.mark.icon.attempts', 'the last attempt is logo.mark.file, verdict pass')
    if (at[at.length - 1] !== last) bad('logo.mark.icon.attempts', 'nothing after the passing attempt')
    drawn.slice(0, -1).forEach((t, i) => {
      if (t?.verdict === 'pass')
        bad(`logo.mark.icon.attempts (drawn ${i + 1})`, 'only the last attempt can pass')
    })
  } else if (mk.decision === 'lettermark') {
    if (!(drawn.length === 3 || at.length === 4) || at.some((t) => t?.verdict === 'pass')) {
      bad(
        'logo.mark.icon.attempts',
        'a lettermark after icons: three failed drawings, or four make_icon calls with no pass'
      )
    }
  }
}

/** The blind record of one drawn attempt: its verdict is recomputed with the blind match rule (no model). */
function checkBlind(ctx, IC, t, i) {
  const { bad } = ctx
  const bl = t?.blind
  if (
    !bl ||
    typeof bl.answer !== 'string' ||
    !Array.isArray(bl.guesses) ||
    !['pass', 'fail'].includes(bl.verdict)
  ) {
    bad(`logo.mark.icon.attempts[${i}].blind`, '{ answer, guesses, verdict } from the blind look_logo')
    return
  }
  const want = blindVerdict({
    answer: bl.answer,
    guesses: bl.guesses,
    businessType: IC.businessType,
    accept: Array.isArray(IC.accept) ? IC.accept : [],
    neighbour: IC.neighbour,
    neighbourAccept: Array.isArray(IC.neighbourAccept) ? IC.neighbourAccept : []
  })
  if (want.verdict !== bl.verdict)
    bad(
      `logo.mark.icon.attempts[${i}].blind.verdict`,
      `the code comparison of the guesses ${JSON.stringify(bl.guesses)} gives ${want.verdict}`
    )
  if (want.matchedPosition !== (bl.matchedPosition ?? null))
    bad(
      `logo.mark.icon.attempts[${i}].blind.matchedPosition`,
      `the code comparison gives ${want.matchedPosition}`
    )
  if (bl.size !== 128)
    bad(
      `logo.mark.icon.attempts[${i}].blind.size`,
      '128 (the blind check runs on the icon rendered at 128 px, header size)'
    )
  if (bl.verdict === 'fail' && t.verdict === 'pass')
    bad(`logo.mark.icon.attempts[${i}].verdict`, 'failed the blind check: fail')
}
