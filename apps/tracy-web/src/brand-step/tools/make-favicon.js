// make_favicon(mark, sideMarks): NO model looks at the favicon. The tab icon is checked by code (favicon-check.js):
// the shape fills enough of the 32 px square (bboxShare >= 0.2) and at least half of its pixels read 3:1 against a
// light tab (#ffffff) and a dark tab (#202124). The tab icons are decided in this order, first that passes:
//   1. "transparent": only when no side has its own mark: the mark on a transparent ground (4% margin).
//   2. "tile": the opening side's mark on a rounded tile (radius 22%, 14% margin) filled with the template's opening
//      background; checked as the mark against the tile (the tile edge vs the tab is advice).
//   3. "tile" with a favicon-only recolour: the opening side's mark recoloured for the opening side by the
//      recolour_mark tool (ctx.recolourMark, ticket #321), on the same tile. The logo is not changed.
//   None passes: ok false with every measurement. Every candidate's 32 px png and measurement is kept and reported.
//   apple-touch-icon-180.png: the opening side's mark on a SOLID square of the template's opening background (kit
//   brandColours.opensOn.ground); no look: that mark already passed look_logo on that ground.
// Never overwrites: run N >= 2 writes every file with ".vN" before the extension. Files go to favicon/.
import { checkFavicon } from '../favicon-check.js'
import { sideText } from '../kit-grounds.js'
import { BrandToolError, imageBytes, imagePath, runOf, runSuffix, sharp } from './common.js'
import { pngsToIco } from './ico.js'

const NONE = { r: 0, g: 0, b: 0, alpha: 0 }

export const tool = {
  name: 'make_favicon',
  description:
    'The full set: favicon.ico (16, 32, 48), PNG 32 and 512, and the phone icon PNG 180. `sideMarks` is the mark that passed for each side (the recoloured mark of a side that has one). No reviewer looks at the favicon: code checks the 32 px tab icon and keeps the first of: transparent, tile, tile with a favicon-only recoloured mark.',
  inputSchema: {
    type: 'object',
    properties: {
      mark: { type: 'string', description: 'Path of the mark file (logo.mark.file).' },
      sideMarks: {
        type: 'object',
        description: 'The mark that passed for each side; a side without its own mark can be left out.',
        properties: { light: { type: 'string' }, dark: { type: 'string' } },
        additionalProperties: false
      }
    },
    required: ['mark'],
    additionalProperties: false
  },
  async run({ mark, sideMarks = {} }, ctx) {
    if (!mark) throw new BrandToolError('usage: make_favicon(mark, sideMarks)')
    const { files } = ctx
    imagePath(files, mark)
    const SUF = runSuffix(files, 'favicon/favicon.ico')
    const ground = ctx.kit.site.brandColours.opensOn.ground
    const opens = sideText(ctx.kit).opens
    const sideMark = { light: sideMarks.light ?? mark, dark: sideMarks.dark ?? mark }
    const same = (a, b) => imagePath(files, a) === imagePath(files, b)
    const unchanged = ['light', 'dark'].every((s) => same(sideMark[s], mark))
    const phoneMark = sideMark[opens]
    const put = (stem, ext, bytes) => files.write(`favicon/${stem}${SUF}.${ext}`, bytes)

    const square = async (ref, n, margin, bg) => {
      const m0 = await sharp(imageBytes(files, ref)).trim({ threshold: 0 }).png().toBuffer()
      const inner = Math.max(1, Math.round(n * (1 - margin * 2)))
      const m = await sharp(m0).resize(inner, inner, { fit: 'contain', background: NONE }).png().toBuffer()
      return sharp({ create: { width: n, height: n, channels: 4, background: bg ?? NONE } })
        .composite([{ input: m, gravity: 'centre' }])
        .png()
        .toBuffer()
    }
    const tile = async (ref, n) => {
      const r = Math.round(n * 0.22)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"><rect width="${n}" height="${n}" rx="${r}" ry="${r}" fill="${ground}"/></svg>`
      const base = await sharp(Buffer.from(svg)).png().toBuffer()
      return sharp(base)
        .composite([{ input: await square(ref, n, 0.14) }])
        .png()
        .toBuffer()
    }

    const candidates = []
    const tryCandidate = async (kind, ref, render, tileGround) => {
      const bytes = await render(ref, 32)
      const p = put(`candidate-${kind}-32`, 'png', bytes)
      const check = await checkFavicon(bytes, { tileGround })
      candidates.push({ kind, mark: ref, png32: p, check })
      return check.pass
    }
    let chosen = null
    if (unchanged && (await tryCandidate('transparent', mark, (f, n) => square(f, n, 0.04), null)))
      chosen = { tabIcons: 'transparent', tileMark: null, recoloured: false }
    if (!chosen && (await tryCandidate('tile', phoneMark, tile, ground)))
      chosen = { tabIcons: 'tile', tileMark: phoneMark, recoloured: false }
    let recolour = null
    if (!chosen) {
      if (typeof ctx.recolourMark !== 'function') {
        recolour = { ok: false, error: 'recolour_mark is not available in this run' }
      } else {
        try {
          recolour = await ctx.recolourMark({
            mark: phoneMark,
            side: opens,
            nameHint: `favicon/tile-mark.${opens}${SUF}.png`
          })
        } catch (e) {
          recolour = { ok: false, error: String(e?.message ?? e).slice(0, 400) }
        }
        if (
          recolour?.ok !== false &&
          recolour?.file &&
          files.has(recolour.file) &&
          (await tryCandidate('tile-recoloured', recolour.file, tile, ground))
        )
          chosen = { tabIcons: 'tile', tileMark: recolour.file, recoloured: true }
      }
    }
    const why = !chosen
      ? 'no candidate passed the code check'
      : chosen.tabIcons === 'transparent'
        ? 'the mark passed on both sides unchanged and its 32 px icon passes the code check on both tabs: transparent tab icons'
        : !unchanged && !chosen.recoloured
          ? `a side has its own mark: the ${opens} (opening) side's mark on a rounded tile of the opening background ${ground}`
          : !chosen.recoloured
            ? `the transparent icon fails the code check on a tab: the ${opens} (opening) side's mark on a rounded tile of the opening background ${ground}`
            : `the ${opens} side's mark does not stand out on the tile at 32 px: favicon-only recolour of that mark (recolour_mark, ${opens} side) on the tile; the logo is unchanged`
    const summary = candidates.map((c) => ({
      kind: c.kind,
      png32: c.png32,
      pass: c.check.pass,
      bboxShare: c.check.bboxShare,
      contrastShare: Object.fromEntries(Object.entries(c.check.tabs).map(([t, v]) => [t, v.contrastShare]))
    }))
    if (!chosen)
      return {
        ok: false,
        run: runOf(SUF),
        error: 'favicon code check failed for every candidate',
        candidates: summary,
        checks: candidates.map((c) => c.check),
        recolour
      }

    const tabMark = chosen.tileMark ?? mark
    const pngs = {}
    for (const n of [16, 32, 48, 512])
      pngs[n] = await (chosen.tabIcons === 'tile' ? tile(tabMark, n) : square(mark, n, 0.04))
    const written = {}
    for (const n of [16, 32, 48, 512]) written[n] = put(`favicon-${n}`, 'png', pngs[n])
    const out = {
      png32: written[32],
      png512: written[512],
      phone180: put(
        'apple-touch-icon-180',
        'png',
        await sharp(await square(phoneMark, 180, 0.14, ground))
          .flatten({ background: ground })
          .png()
          .toBuffer()
      )
    }
    out.ico = put('favicon', 'ico', pngsToIco([16, 32, 48].map((n) => pngs[n])))
    const finalCheck = await checkFavicon(pngs[32], {
      tileGround: chosen.tabIcons === 'tile' ? ground : null
    })
    return {
      ok: finalCheck.pass,
      run: runOf(SUF),
      files: out,
      icoSizes: [16, 32, 48],
      mark,
      sideMarks: sideMark,
      phoneMark,
      phoneSide: opens,
      tabIcons: chosen.tabIcons,
      tabIconsWhy: why,
      tileMark: chosen.tileMark,
      tileMarkRecoloured: chosen.recoloured,
      tileGround: chosen.tabIcons === 'tile' ? ground : null,
      phoneGround: ground,
      phoneGroundFrom: 'kit brandColours.opensOn.ground (template opening background)',
      check: finalCheck,
      candidates: summary,
      recolour: recolour
        ? { ok: recolour.ok, palette: recolour.palette ?? null, mode: recolour.mode ?? null }
        : null,
      note: 'no look_logo on the favicon or the phone icon; the code check above decides the tab icons'
    }
  }
}
