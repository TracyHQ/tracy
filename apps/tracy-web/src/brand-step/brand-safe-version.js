// The safe version (brand step trial bench, #320): when the gate still rejects after two fix rounds, or the run hits
// its cost cap, code builds a brand file that needs no judgement: the template's own accent, a name-only logo per
// spot, an initials favicon in the template's accent, and an owner task to replace the temporary logo. It is not the
// agent's work and it is not run through the agent's gate: the run is marked `safe-version` with its reason (`gate` or
// `cost-cap`). It calls only the tools that are code, no model: set_name, fit_logo, make_lettermark, make_favicon and
// name_slots. A tool answers a JSON object (or its text): set_name { text, rendersAs, files: { light, dark },
// twoLines }, fit_logo { file, shows }, make_lettermark { file }, make_favicon (the brand file's favicon block),
// name_slots { slots, ownerTasks }.
import { kitIdOf } from './brand-first-message.js'

const parsed = (result) => {
  if (typeof result === 'string') {
    try {
      return JSON.parse(result)
    } catch {
      return null
    }
  }
  if (!result || typeof result !== 'object') return null
  // A tool that returns pictures answers { text: '<json>', images }; any other object is the answer itself.
  return typeof result.text === 'string' && result.text.trim().startsWith('{') ? parsed(result.text) : result
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
  const spots = []
  const logos = { light: null, dark: null, twoLines: { light: null, dark: null } }
  let nameBlock = null
  let mark = null
  let favicon = null
  if (name) {
    nameBlock = await call('set_name', { text: name })
    mark = await call('make_lettermark', { letters: initialsOf(name), accent })
    for (const spot of doc.site.logoSpots) {
      const side = spot.ground.side
      const logo = nameBlock.files?.[side]
      const fitted = await call('fit_logo', { logo, spot: spot.id })
      spots.push({
        spot: spot.id,
        file: fitted.file,
        shows: fitted.shows,
        ground: spot.ground.colour,
        writable: spot.setting != null
      })
      if (fitted.shows === 'logo-2-lines') logos.twoLines[side] = nameBlock.twoLines?.files?.[side] ?? null
      else if (fitted.shows === 'logo') logos[side] = logo
    }
    favicon = await call('make_favicon', { mark: mark.file, sideMarks: { light: null, dark: null } })
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
