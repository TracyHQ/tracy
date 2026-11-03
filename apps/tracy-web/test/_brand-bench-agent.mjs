// A scripted words-only brand agent for the end-to-end test (brand step trial bench, #320): a fake model that reads the
// conversation it is sent and calls the REAL tools in a plausible order, a fake reviewer that passes every check it is
// asked, and a fake Google Fonts that serves the Teko face already in the repo. No network, no real model.
import { faviconBlockOf } from '../src/brand-step/brand-safe-version.js'
import { finalReply, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'

const CHECKS = ['the name reads exactly as given', 'nothing but the mark and the name is in it']
const NAME = 'Glen Bay Swim Academy'
/** What each tool answered so far, by tool name, read back from the conversation the model is sent. */
function resultsOf(messages) {
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

/** The look_logo files for what the spots show: each shown variant on the ground of its spot, once. */
function looksOf(kit, r) {
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
          : r.make_lettermark[0].file
    seen.set(`${file}@${spot.ground.colour}`, { file, ground: spot.ground.colour })
  })
  return [...seen.values()]
}

/** The brand file a plausible agent writes from what the tools answered (kept template accent, lettermark). */
export function brandFileFrom(kit, r) {
  const accent = kit.site.brandColours.primary.value
  const set = r.set_name[0]
  const mark = r.make_lettermark[0]
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
        decision: 'lettermark',
        why: 'Four make_icon calls gave no icon, so the initials are the last fallback.',
        letters: 'GB',
        icon: {
          businessType: 'swim school',
          businessTypeFrom: 'brand.name',
          accept: ['swimming school'],
          neighbour: 'surf school',
          neighbourAccept: [],
          distinguishing: 'a swimmer in goggles',
          subject: 'a swimmer in goggles',
          colours: [accent],
          coloursFrom: 'accent',
          provider: 'none',
          model: 'none',
          attempts: [1, 2, 3, 4].map((n) => ({
            verdict: 'tool-failed',
            subject: `a swimmer in goggles, try ${n}`
          }))
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
        l.results.map(({ file, ground, verdict, checks }) => ({ file, ground, verdict, checks }))
      ),
      spots
    },
    favicon: faviconBlockOf(r.make_favicon[0], mark.file),
    ownerTasks: [
      {
        kind: 'replace-temporary-logo',
        say: 'This is a temporary logo made from the initials of the name. Replace it with your own logo when you have one.'
      }
    ]
  }
}

/** The scripted agent: each request gets the next step, chosen by how many assistant turns the conversation holds. */
export function scriptedAgent(kit, { wrongName = false } = {}) {
  const steps = [
    () => [
      ['open_image', { id: 'page-home-1440' }],
      ['set_name', { text: NAME }]
    ],
    () => [1, 2, 3, 4].map((n) => ['make_icon', { subject: `a swimmer in goggles, try ${n}` }]),
    () => [['make_lettermark', { letters: 'GB', accent: kit.site.brandColours.primary.value }]],
    (r) => [['compose_logo', { mark: r.make_lettermark[0].file, name: r.set_name[0].sidecar }]],
    (r) =>
      kit.site.logoSpots.map((spot) => [
        'fit_logo',
        { logo: r.compose_logo[0].sides[spot.ground.side].file, spot: spot.id }
      ]),
    (r) => [['look_logo', { files: looksOf(kit, r), checks: CHECKS }]],
    (r) => [['make_favicon', { mark: r.make_lettermark[0].file }]],
    () => [['name_slots', {}]],
    (r) => {
      const brandFile = brandFileFrom(kit, r)
      if (wrongName) brandFile.name.value = 'Another Name'
      return [['save_brand_file', { brandFile }]]
    }
  ]
  return (body) => {
    const turn = body.messages.filter((m) => m.role === 'assistant').length
    const usage = usageOf({ cost: 0.01 })
    const step = steps[turn]
    return step
      ? toolCallReply({ calls: step(resultsOf(body.messages)), usage }).body
      : finalReply({ content: 'Saved.', usage }).body
  }
}
