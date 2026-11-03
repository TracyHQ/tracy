// Gate section: the attempts of the icon record (at most 3 drawn, 4 make_icon calls), each with its blind record and
// plate fallback. The blind verdict is recomputed with the blind match rule (no model).
import { blindVerdict } from './blind-match.js'
import { PLATE_MIN_RATIO, contrastHex } from './colour-math.js'

export function checkAttempts(ctx, IC) {
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
