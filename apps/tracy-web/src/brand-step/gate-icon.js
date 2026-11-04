// Gate section: the icon record of the mark (subject, colours, provider, model) and its
// attempts (gate-icon-attempts.js). Fills ctx.IC and ctx.iconColours for the sections after it.
import { HEX } from './gate-context.js'
import { checkAttempts } from './gate-icon-attempts.js'

export function checkIcon(ctx) {
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
    checkAttempts(ctx, IC)
  }
  if (mk.decision === 'lettermark' && !Array.isArray(IC?.attempts))
    bad('logo.mark.icon', 'a lettermark is only the last fallback; record the three failed icon attempts')
}
