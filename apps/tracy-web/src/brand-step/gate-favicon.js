// Gate section: the favicon set (decisions 16 and 19). The favicon comes from the mark; the phone icon from the
// opening side's mark on the template's opening ground. No model looks at the favicon: favicon.check records the
// code check of make_favicon (favicon-check.js) for every candidate tried and for the final favicon-32; each is
// recomputed here from the image bytes and must match, the final must pass, and the tab icon choice must follow the
// order transparent -> tile -> tile with a favicon-only recoloured mark.
import { checkFavicon } from './favicon-check.js'

const near = (x, y) => typeof x === 'number' && Math.abs(x - y) < 0.0015

export async function checkFaviconSet(ctx) {
  const { b, K, mk, rec, opens, bad, fileOk, png, same, sideMark, files } = ctx
  const F = b.favicon ?? {}
  const tplGround = K.site.brandColours.opensOn?.ground?.toLowerCase()
  if (F.from !== 'mark') bad('favicon.from', 'must be "mark"')
  if (!same(F.mark, mk.file)) bad('favicon.mark', 'must be logo.mark.file')
  if (!same(F.phoneMark, sideMark(opens)))
    bad(
      'favicon.phoneMark',
      `the mark of the side the site opens on (${opens}): logo.mark.recoloured.${opens} when set, else logo.mark.file`
    )
  if ((F.phoneGround ?? '').toLowerCase() !== tplGround)
    bad('favicon.phoneGround', `the template's opening background ${tplGround}`)
  fileOk('favicon.ico', F.ico)
  png('favicon.png32', F.png32)
  png('favicon.png512', F.png512)
  png('favicon.phone180', F.phone180, false)
  const anyRecoloured = !!(rec && (rec.light || rec.dark))
  if (!['transparent', 'tile'].includes(F.tabIcons))
    bad('favicon.tabIcons', 'transparent | tile (as make_favicon reported)')
  if (F.tabIcons === 'tile' && (F.tileGround ?? '').toLowerCase() !== tplGround)
    bad('favicon.tileGround', `the template's opening background ${tplGround}`)
  if (F.tabIcons === 'transparent' && F.tileGround != null)
    bad('favicon.tileGround', 'null for transparent tab icons')
  if (F.tabIcons === 'transparent' && anyRecoloured) bad('favicon.tabIcons', 'a side has its own mark: tile')
  if (F.tabIcons === 'transparent' && (F.tileMark != null || F.tileMarkRecoloured))
    bad('favicon.tileMark', 'null (and tileMarkRecoloured false) for transparent tab icons')
  if (F.tabIcons === 'tile') {
    if (typeof F.tileMarkRecoloured !== 'boolean')
      bad('favicon.tileMarkRecoloured', 'boolean, as make_favicon reported')
    else if (!F.tileMarkRecoloured && !same(F.tileMark, sideMark(opens)))
      bad('favicon.tileMark', `the ${opens} (opening) side's mark`)
    else if (F.tileMarkRecoloured) png('favicon.tileMark', F.tileMark)
  }
  const sameCheck = (field, recorded, got) => {
    if (!recorded || typeof recorded !== 'object') {
      bad(field, '{ bboxShare, contrastShare: { "#ffffff", "#202124" }, pass } from make_favicon')
      return
    }
    if (!near(recorded.bboxShare, got.bboxShare)) bad(`${field}.bboxShare`, `recomputed ${got.bboxShare}`)
    for (const t of ['#ffffff', '#202124']) {
      if (!near(recorded.contrastShare?.[t], got.tabs[t].contrastShare))
        bad(`${field}.contrastShare.${t}`, `recomputed ${got.tabs[t].contrastShare}`)
    }
    if (recorded.pass !== got.pass) bad(`${field}.pass`, `recomputed ${got.pass}`)
  }
  const measure = async (rel, tileGround) => checkFavicon(await files.read(ctx.norm(rel)), { tileGround })
  const FC = F.check
  if (!FC || typeof FC !== 'object') {
    bad(
      'favicon.check',
      '{ final, candidates } from make_favicon (code check; no model looks at the favicon)'
    )
    return
  }
  if (typeof F.png32 === 'string' && files.has(ctx.norm(F.png32))) {
    const got = await measure(F.png32, F.tabIcons === 'tile' ? tplGround : null)
    sameCheck('favicon.check.final', FC.final, got)
    if (!got.pass) bad('favicon.check.final', 'the final 32 px favicon fails the code check')
  }
  const cands = Array.isArray(FC.candidates) ? FC.candidates : null
  if (!cands || !cands.length) {
    bad('favicon.check.candidates', 'every candidate make_favicon tried, in order')
    return
  }
  for (const [i, c] of cands.entries()) {
    if (!['transparent', 'tile', 'tile-recoloured'].includes(c?.kind)) {
      bad(`favicon.check.candidates[${i}].kind`, 'transparent | tile | tile-recoloured')
      continue
    }
    if (!fileOk(`favicon.check.candidates[${i}].png32`, c.png32)) continue
    sameCheck(
      `favicon.check.candidates[${i}]`,
      c,
      await measure(c.png32, c.kind === 'transparent' ? null : tplGround)
    )
  }
  const kinds = cands.map((c) => c?.kind)
  const want =
    F.tabIcons === 'transparent'
      ? ['transparent']
      : F.tileMarkRecoloured
        ? [...(anyRecoloured ? [] : ['transparent']), 'tile', 'tile-recoloured']
        : [...(anyRecoloured ? [] : ['transparent']), 'tile']
  if (kinds.join() !== want.join())
    bad('favicon.check.candidates', `the order make_favicon follows gives ${JSON.stringify(want)}`)
  else {
    cands.forEach((c, i) => {
      if (c.pass !== (i === cands.length - 1))
        bad(
          `favicon.check.candidates[${i}].pass`,
          i === cands.length - 1 ? 'the chosen candidate passes' : 'a candidate before the chosen one failed'
        )
    })
  }
}
