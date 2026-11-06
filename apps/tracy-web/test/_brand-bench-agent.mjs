// What the scripted words-only brand agent reads from the conversation and writes as its brand file (the script itself is
// _brand-bench-script.mjs). Used by the end-to-end test (brand step trial bench, #320). No network, no real model.
import { faviconBlockOf } from '../src/brand-step/brand-safe-version.js'

export const CHECKS = ['the name reads exactly as given', 'nothing but the mark and the name is in it']
export const NAME = 'Glen Bay Swim Academy'
/** What each tool answered so far, by tool name, read back from the conversation the model is sent. */
export function resultsOf(messages) {
  const names = new Map()
  for (const m of messages) for (const c of m.tool_calls ?? []) names.set(c.id, c.function.name)
  const out = {}
  for (const m of messages) {
    if (m.role !== 'tool') continue
    const text =
      typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p.text ?? '').join('')
    try {
      const name = names.get(m.tool_call_id)
      out[name] = [...(out[name] ?? []), JSON.parse(text)]
    } catch {
      /* a text that is not JSON is of no use to the script */
    }
  }
  return out
}

/** The icon make_icon drew, when one came out; else null (every call failed and the lettermark is the fallback). */
export const iconOf = (r) => (r.make_icon ?? []).find((x) => x.ok) ?? null
/** The mark file of the brand: the icon, else the lettermark. */
export const markFileOf = (r) => iconOf(r)?.file ?? r.make_lettermark[0].file

/** The look_logo files for what the spots show: each shown variant on the ground of its spot, once. */
export function looksOf(kit, r) {
  const composed = r.compose_logo[0].sides
  const seen = new Map()
  r.fit_logo.forEach((fit, i) => {
    const spot = kit.site.logoSpots[i]
    const side = spot.ground.side
    const file =
      fit.shows === 'logo'
        ? composed[side].file
        : fit.shows === 'logo-2-lines'
          ? composed[side].variants.twoLines.file
          : markFileOf(r)
    seen.set(`${file}@${spot.ground.colour}`, { file, ground: spot.ground.colour })
  })
  return [...seen.values()]
}

/** The brand file a plausible agent writes from what the tools answered (kept template accent, lettermark). */
export function brandFileFrom(kit, r) {
  const accent = kit.site.brandColours.primary.value
  const set = r.set_name[0]
  const mark = { file: markFileOf(r) }
  const icon = iconOf(r)
  const composed = r.compose_logo[0].sides
  const logos = { light: null, dark: null, twoLines: null }
  const spots = r.fit_logo.map((fit, i) => {
    const spot = kit.site.logoSpots[i]
    const side = spot.ground.side
    if (fit.shows === 'logo') logos[side] = composed[side].file
    if (fit.shows === 'logo-2-lines') {
      logos.twoLines ??= { light: null, dark: null }
      logos.twoLines[side] = composed[side].variants.twoLines.file
    }
    return {
      spot: spot.id,
      file: fit.file,
      shows: fit.shows,
      ground: spot.ground.colour,
      writable: spot.setting != null
    }
  })
  return {
    kind: 'brand-file',
    version: 10,
    kit: `${kit.quickstart.product}@${kit.quickstart.version}`,
    name: { value: NAME, from: 'brief.brand.name', slots: r.name_slots[0].slots },
    colours: {
      decision: 'kept-template',
      why: 'The brief has no logo and no brand colour, so the template accent stays and nothing is built.',
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
      mark: {
        decision: icon ? 'icon' : 'lettermark',
        why: icon
          ? 'There is no logo, so an icon in the site accent shows what the business does.'
          : 'Four make_icon calls gave no icon, so the initials are the last fallback.',
        letters: icon ? null : 'GB',
        icon: {
          subject: icon ? icon.subject : 'a swimmer in goggles',
          colours: [accent],
          coloursFrom: 'accent',
          provider: icon ? icon.provider : 'none',
          model: icon ? icon.model : 'none',
          attempts: icon ? [iconAttempt(icon)] : toolFailures(r)
        },
        file: mark.file,
        recoloured: { light: null, dark: null }
      },
      name: {
        text: set.text,
        rendersAs: set.rendersAs,
        files: set.files,
        twoLines: set.twoLines ? { lines: set.twoLines.lines, files: set.twoLines.files } : null
      },
      logos,
      look: r.look_logo.flatMap((l) =>
        l.results.map(({ file, ground, verdict, checks, shownAt }) => ({
          file,
          ground,
          verdict,
          checks,
          ...(shownAt ? { shownAt } : {})
        }))
      ),
      spots
    },
    favicon: faviconBlockOf(r.make_favicon[0], mark.file),
    ownerTasks: [
      {
        kind: 'replace-temporary-logo',
        say: icon
          ? 'This is a temporary logo: an icon in the site colour beside your name. Replace it with your own logo when you have one.'
          : 'This is a temporary logo made from the initials of the name. Replace it with your own logo when you have one.'
      }
    ]
  }
}

/** The icon's attempt record. */
function iconAttempt(icon) {
  return { file: icon.file, raw: icon.raw, subject: icon.subject, verdict: 'pass', plate: icon.plate }
}

/** Every make_icon call failed: four tool failures, none a drawing attempt. */
const toolFailures = (r) =>
  (r.make_icon ?? []).map((x, i) => ({ verdict: 'tool-failed', subject: x.subject ?? `try ${i + 1}` }))
