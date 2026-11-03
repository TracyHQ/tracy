// The safe version (brand step trial bench, #320): when the gate still rejects after two fix rounds, or the run hits
// its cost cap, code builds a brand file that needs no judgement: the template's own accent, an initials lettermark
// beside the name in the template's heading font (a name-only logo, since fit_logo works on a composed lockup), the
// favicon from that mark, and an owner task to replace the temporary logo. It is not the agent's work and it is not
// run through the agent's gate: the run is marked `safe-version` with its reason (`gate` or `cost-cap`). It calls only
// the tools that are code, no model: name_slots, set_name, make_lettermark, compose_logo, fit_logo and make_favicon,
// and reads the shapes those tools really answer (brand-step/tools/): name_slots { slots, ownerTasks }, set_name
// { text, rendersAs, files, twoLines: { lines, files } | null, sidecar }, make_lettermark { file }, compose_logo
// { sides: { light, dark: { file, variants: { twoLines } } } }, fit_logo { file, shows }, make_favicon { ok, files,
// tabIcons, tileGround, tileMark, tileMarkRecoloured, phoneMark, phoneGround, check, candidates }.
import { kitIdOf } from './brand-first-message.js'

const parsed = (result) => {
  if (typeof result === 'string') {
    try {
      return JSON.parse(result)
    } catch {
      return null
    }
  }
  return result && typeof result === 'object' ? result : null
}

const initialsOf = (name) =>
  String(name)
    .split(/[\s\-_.]+/)
    .filter(Boolean)
    .map((w) => [...w][0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

const siteLanguage = (brief) =>
  String(brief?.brand?.voice ?? '')
    .split(/[;,]/)[0]
    .trim() || 'English'

/** The brand file's favicon block from what make_favicon reported (the gate recomputes every number from the files). */
export function faviconBlockOf(made, mark) {
  const shares = Object.fromEntries(Object.entries(made.check.tabs).map(([t, v]) => [t, v.contrastShare]))
  return {
    from: 'mark',
    mark,
    phoneMark: made.phoneMark,
    phoneGround: made.phoneGround,
    tabIcons: made.tabIcons,
    tileGround: made.tileGround,
    tileMark: made.tileMark,
    tileMarkRecoloured: made.tileMarkRecoloured,
    check: {
      final: { bboxShare: made.check.bboxShare, contrastShare: shares, pass: made.check.pass },
      candidates: made.candidates.map((c) => ({
        kind: c.kind,
        png32: c.png32,
        bboxShare: c.bboxShare,
        contrastShare: c.contrastShare,
        pass: c.pass
      }))
    },
    ico: made.files.ico,
    png32: made.files.png32,
    png512: made.files.png512,
    phone180: made.files.phone180
  }
}

/**
 * @param {{ tools: Array<{ name: string, run: Function }>, ctx: object, kit: { doc: any }, brief: any, reason: 'gate' | 'cost-cap' }} input
 * @returns {Promise<object>} the safe brand file; throws when a tool it needs fails
 */
export async function buildSafeVersion({ tools, ctx, kit, brief, reason }) {
  const call = async (name, args) => {
    const tool = tools.find((t) => t.name === name)
    if (!tool) throw new Error(`BRAND_SAFE_VERSION: the tool ${name} is missing`)
    const out = parsed(await tool.run(args, ctx))
    if (!out || out.ok === false || out.error) {
      throw new Error(
        `BRAND_SAFE_VERSION: ${name} failed: ${String(out?.reason ?? out?.error ?? 'no answer').slice(0, 200)}`
      )
    }
    return out
  }
  const doc = kit.doc
  const accent = doc.site.brandColours.primary?.value
  const name = typeof brief.brand?.name === 'string' && brief.brand.name.trim() ? brief.brand.name : null
  const slots = await call('name_slots', {})
  const tasks = [...(slots.ownerTasks ?? [])]
  const logos = { light: null, dark: null, twoLines: null }
  const spots = []
  let nameBlock = null
  let mark = null
  let favicon = null
  if (name) {
    const set = await call('set_name', { text: name })
    nameBlock = {
      text: set.text,
      rendersAs: set.rendersAs,
      files: set.files,
      twoLines: set.twoLines ? { lines: set.twoLines.lines, files: set.twoLines.files } : null
    }
    mark = await call('make_lettermark', { letters: initialsOf(name), accent })
    const composed = await call('compose_logo', { mark: mark.file, name: set.sidecar })
    for (const spot of doc.site.logoSpots) {
      const side = spot.ground.side
      const oneLine = composed.sides[side].file
      const fitted = await call('fit_logo', { logo: oneLine, spot: spot.id })
      spots.push({
        spot: spot.id,
        file: fitted.file,
        shows: fitted.shows,
        ground: spot.ground.colour,
        writable: spot.setting != null
      })
      if (fitted.shows === 'logo') logos[side] = oneLine
      else if (fitted.shows === 'logo-2-lines') {
        logos.twoLines ??= { light: null, dark: null }
        logos.twoLines[side] = composed.sides[side].variants.twoLines.file
      }
    }
    favicon = faviconBlockOf(await call('make_favicon', { mark: mark.file }), mark.file)
    tasks.push({
      kind: 'replace-temporary-logo',
      say: `This is a temporary logo made from the name of the business (${siteLanguage(brief)}). Replace it with your own logo when you have one.`
    })
  }
  return {
    kind: 'brand-file',
    version: 10,
    safeVersion: { reason },
    kit: kitIdOf(kit),
    name: { value: name, from: 'brief.brand.name', slots: slots.slots ?? [] },
    colours: {
      decision: 'kept-template',
      why: 'Safe version: the template keeps its own accent.',
      brandColour: null,
      lift: null,
      accent,
      replaces: accent,
      keeps: 'template',
      builds: 0,
      shifts: [],
      module: null
    },
    logo: {
      material: null,
      mark: name
        ? {
            decision: 'lettermark',
            why: 'Safe version: the initials of the name.',
            letters: initialsOf(name),
            icon: null,
            file: mark.file,
            recoloured: { light: null, dark: null }
          }
        : null,
      name: nameBlock,
      logos,
      look: [],
      spots
    },
    favicon,
    ownerTasks: tasks
  }
}
