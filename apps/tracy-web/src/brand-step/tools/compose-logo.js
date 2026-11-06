// compose_logo(mark, name): mark on the left, name on the right, transparent, per side and per name variant:
//   logo.<side>.png     name on one line: mark height M = 400, name letter height 0.42 M, centred
//   logo-2l.<side>.png  name on two lines (when set_name made them): the two-line block is 0.9 M high, centred, so
//                       each line's letter height is 0.9 M x 160 / 368 (set_name's line gap 0.3 kept)
// nameOnly (no mark): the name alone, no gap, and the canvas is as high as the name (168 px; the two-line block 360 px).
// Gap between mark and name 0.22 M. Writes logo/logo.json beside the logos (fit_logo needs it).
// Never overwrites: the first run writes logo/logo.<side>.png, logo/logo-2l.<side>.png, logo/logo.json; run N >= 2
// writes logo.<side>.vN.png, logo-2l.<side>.vN.png, logo.vN.json, so a failed version is kept. `run` and every file
// name are reported: point the brand file at the files of the final run.
// Grounds checked: the kit's logo-spot grounds of the side (backgrounds never change, so these are the grounds).
//   name   HARD rule: the name colour must reach 3:1 on every ground of its side (`nameReads`).
//   mark   ADVISORY only: share of the mark's pixels at 3:1 per ground (`markAdvice`: reads | weak). The look_logo
//          reviewer decides whether a mark reads; this number never overrides the reviewer.
import {
  BrandToolError,
  contrastHex,
  hex,
  imageBytes,
  raw,
  readJson,
  runOf,
  runSuffix,
  sharp,
  sideGrounds,
  sidecarsIn,
  writeJson
} from './common.js'

const M = 400
const LH = Math.round(M * 0.42)
const GAP = Math.round(M * 0.22)
const BLOCK2 = Math.round(M * 0.9)
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

async function markAdvice(bytes, grounds) {
  const { data, w, h } = await raw(bytes)
  const px = []
  for (let i = 0; i < w * h; i += 2)
    if (data[i * 4 + 3] > 200) px.push(hex(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]))
  const bucket = new Map()
  for (const p of px) {
    const k = p
      .slice(1)
      .match(/../g)
      .map((x) => Number.parseInt(x, 16) >> 4)
      .join(',')
    const e = bucket.get(k) ?? { n: 0, p }
    e.n++
    bucket.set(k, e)
  }
  const dom = [...bucket.values()].sort((x, y) => y.n - x.n)[0]?.p
  return grounds.map((g) => {
    let ok = 0
    for (const p of px) if (contrastHex(p, g) >= 3) ok++
    const share = px.length ? +(ok / px.length).toFixed(3) : 0
    return {
      ground: g,
      dominant: dom,
      dominantRatio: dom ? contrastHex(dom, g) : null,
      shareAt3: share,
      advice: share >= 0.6 ? 'reads' : 'weak'
    }
  })
}

/** The name sidecar: its path, or the folder holding name.json files (the latest run is taken). */
function nameSidecar(files, ref) {
  if (typeof ref === 'string' && ref.endsWith('.json')) return readJson(files, ref)
  const dir = typeof ref === 'string' && ref ? ref.replace(/\/$/, '') : 'name'
  const all = sidecarsIn(files, dir, 'name')
  if (!all.length)
    throw new BrandToolError('no name.json found: run set_name first and pass its sidecar path')
  return readJson(files, all.at(-1))
}

export const tool = {
  name: 'compose_logo',
  description:
    'Places mark and name side by side, for each side and each name variant (one-line logo, two-line logo). It checks the name against every ground of its side (3:1, a hard rule) and gives a pixel measurement of the mark on those grounds, which is advice only.',
  inputSchema: {
    type: 'object',
    properties: {
      mark: {
        type: 'string',
        description: 'Path of the mark image in the run folder. Not needed with nameOnly.'
      },
      nameOnly: { type: 'boolean', description: 'The name alone, with no mark (the safe version).' },
      name: { type: 'string', description: 'The `sidecar` path set_name returned (name/name.json).' },
      markLight: { type: 'string', description: 'Optional: the mark to use on the light side.' },
      markDark: { type: 'string', description: 'Optional: the mark to use on the dark side.' }
    },
    required: ['name'],
    additionalProperties: false
  },
  async run({ mark, name, markLight, markDark, nameOnly = false }, ctx) {
    if (!name || (!mark && !nameOnly)) throw new BrandToolError('usage: compose_logo(mark, name)')
    const nameInfo = nameSidecar(ctx.files, name)
    const SUF = runSuffix(ctx.files, 'logo/logo.json')
    // markImg null: the name alone (nameOnly), as high as the name itself.
    const lockup = async (markImg, mw, nameFile, nameH, hint) => {
      const nameBytes = ctx.files.read(nameFile)
      const meta = await sharp(nameBytes).metadata()
      const nw = Math.round((meta.width * nameH) / meta.height)
      const nameImg = await sharp(nameBytes).resize(nw, nameH).png().toBuffer()
      const gap = markImg ? GAP : 0
      const H = markImg ? M : nameH
      const W = mw + gap + nw
      const top = Math.round((H - nameH) / 2)
      const png = await sharp({ create: { width: W, height: H, channels: 4, background: CLEAR } })
        .composite([
          ...(markImg ? [{ input: markImg, left: 0, top: 0 }] : []),
          { input: nameImg, left: mw + gap, top }
        ])
        .png()
        .toBuffer()
      return {
        file: ctx.files.write(hint, png),
        width: W,
        height: H,
        markBox: markImg ? [0, 0, mw, H] : null,
        nameBox: [mw + gap, top, nw, nameH]
      }
    }
    const out = {
      ok: true,
      run: runOf(SUF),
      sidecar: `logo/logo${SUF}.json`,
      nameOnly: Boolean(nameOnly),
      layout: { markHeight: M, gap: GAP, oneLineLetterHeight: LH, twoLineBlock: BLOCK2 },
      sides: {}
    }
    for (const side of ['light', 'dark']) {
      const markFile = nameOnly ? null : ((side === 'light' ? markLight : markDark) ?? mark)
      const markBytes = markFile ? imageBytes(ctx.files, markFile) : null
      const grounds = sideGrounds(ctx.kit, side)
      let mw = 0
      let markImg = null
      if (markBytes) {
        const markT = await sharp(markBytes).trim({ threshold: 0 }).toBuffer({ resolveWithObject: true })
        mw = Math.round((markT.info.width * M) / markT.info.height)
        markImg = await sharp(markT.data).resize(mw, M).png().toBuffer()
      }
      const nameFiles = nameInfo.oneLine?.files ?? nameInfo.files
      const one = await lockup(markImg, mw, nameFiles[side], LH, `logo/logo.${side}${SUF}.png`)
      one.letterHeight = LH
      let two = null
      if (nameInfo.twoLines) {
        two = await lockup(
          markImg,
          mw,
          nameInfo.twoLines.files[side],
          BLOCK2,
          `logo/logo-2l.${side}${SUF}.png`
        )
        two.letterHeight = +((BLOCK2 * nameInfo.letterHeightPx) / nameInfo.twoLines.height).toFixed(1)
        two.lines = nameInfo.twoLines.lines
      }
      const nameColour = nameInfo.colours[side]
      const nameOn = grounds.map((g) => ({
        ground: g,
        ratio: contrastHex(nameColour, g),
        ok: contrastHex(nameColour, g) >= 3
      }))
      const advice = markBytes ? await markAdvice(markBytes, grounds) : null
      out.sides[side] = {
        file: one.file,
        width: one.width,
        height: one.height,
        markBox: one.markBox,
        nameBox: one.nameBox,
        mark: markFile,
        variants: { oneLine: one, twoLines: two },
        nameColour,
        nameOn,
        nameReads: nameOn.every((x) => x.ok),
        markAdvice: advice,
        markAdviceSummary: advice ? (advice.every((c) => c.advice === 'reads') ? 'reads' : 'weak') : null,
        markAdviceNote: advice ? 'advisory only: the look_logo reviewer decides whether the mark reads' : null
      }
      if (!out.sides[side].nameReads) out.ok = false
    }
    if (!out.ok) out.error = 'the name does not reach 3:1 on a ground of its side (hard rule)'
    writeJson(ctx.files, `logo/logo${SUF}.json`, out)
    return out
  }
}
