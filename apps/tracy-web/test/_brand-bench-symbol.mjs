// The scripted agent of the symbol-logo end-to-end case (#321): the brief has a found logo with a standalone symbol, so
// the script measures it, cuts the mark, recolours it for the dark side, composes, fits, makes the favicon and looks.
// It calls the REAL tools and reads what each answered from the conversation it is sent. No network, no real model.
import { finalReply, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { CHECKS, resultsOf } from './_brand-bench-agent.mjs'

const MARK_CHECKS = [
  'the whole symbol is there, nothing cut off',
  'no ground or words left around it',
  'it is the same symbol as in the original'
]
const SIDE_CHECK = ['the mark reads clearly on this ground']

const groundOf = (kit, side) => kit.site.brandColours.sides.find((s) => s.groundSide === side).ground
const last = (r, name) => r[name].at(-1)

/** The look_logo files for what the spots show: the dark side uses the recoloured mark and its own logo. */
function spotLooks(kit, r) {
  const light = r.compose_logo[0].sides
  const dark = last(r, 'compose_logo').sides
  const rec = r.recolour_mark[0].file
  const seen = new Map()
  r.fit_logo.forEach((fit, i) => {
    const spot = kit.site.logoSpots[i]
    const side = spot.ground.side
    const sides = side === 'dark' ? dark : light
    const file =
      fit.shows === 'logo'
        ? sides[side].file
        : fit.shows === 'logo-2-lines'
          ? sides[side].variants.twoLines.file
          : side === 'dark'
            ? rec
            : r.cut_mark[0].file
    seen.set(`${file}@${spot.ground.colour}`, { file, ground: spot.ground.colour })
  })
  return [...seen.values()]
}

/** The brand file a plausible agent writes for a cut mark that is recoloured for the dark side. */
export function symbolBrandFile(kit, brief, r) {
  const accent = kit.site.brandColours.primary.value
  const set = r.set_name[0]
  const cut = r.cut_mark[0]
  const rec = r.recolour_mark[0]
  const light = r.compose_logo[0].sides
  const dark = last(r, 'compose_logo').sides
  const logos = { light: null, dark: null, twoLines: null }
  const spots = r.fit_logo.map((fit, i) => {
    const spot = kit.site.logoSpots[i]
    const side = spot.ground.side
    const sides = side === 'dark' ? dark : light
    if (fit.shows === 'logo') logos[side] = sides[side].file
    if (fit.shows === 'logo-2-lines') {
      logos.twoLines ??= { light: null, dark: null }
      logos.twoLines[side] = sides[side].variants.twoLines.file
    }
    return {
      spot: spot.id,
      file: fit.file,
      shows: fit.shows,
      ground: spot.ground.colour,
      writable: spot.setting != null
    }
  })
  const m = r.measure_logo[0]
  return {
    kind: 'brand-file',
    version: 10,
    kit: `${kit.quickstart.product}@${kit.quickstart.version}`,
    name: { value: brief.brand.name, from: 'brief.brand.name', slots: r.name_slots[0].slots },
    colours: {
      decision: 'kept-template',
      why: 'Both brand colours have no visible hue, so the template accent stays and nothing is built.',
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
      material: {
        mediaId: brief.brand.logo,
        width: m.width,
        height: m.height,
        hasAlpha: false,
        readsAs: brief.brand.name.toUpperCase(),
        ground: m.ground.colour
      },
      mark: {
        decision: 'cut',
        why: 'The logo has a standalone symbol (a ring around a bar) above the words, so it was cut out.',
        letters: null,
        icon: null,
        file: cut.file,
        recoloured: { light: null, dark: rec.file }
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
    favicon: r.faviconBlock,
    ownerTasks: [
      {
        kind: 'approve-rebuilt-logo',
        say: "Your site logo was rebuilt from your logo's symbol and your name; please check it and tell us if you want it changed."
      }
    ]
  }
}

/**
 * The scripted agent: each request gets the next step, chosen by how many assistant turns the conversation holds.
 * `faviconBlockOf` and the brief come from the caller so the file stays free of imports from src/.
 */
export function symbolAgent(kit, { brief, faviconBlockOf }) {
  const dark = groundOf(kit, 'dark')
  const steps = [
    () => [
      ['open_image', { id: 'page-home-1440' }],
      ['set_name', { text: brief.brand.name }],
      ['measure_logo', { mediaId: brief.brand.logo }]
    ],
    (r) => {
      const symbol = r.measure_logo[0].shapes.find((s) => s.kind === 'symbol')
      return [
        [
          'cut_mark',
          { mediaId: brief.brand.logo, box: { x: symbol.x, y: symbol.y, w: symbol.w, h: symbol.h } }
        ]
      ]
    },
    (r) => [
      [
        'look_logo',
        {
          files: [{ file: r.cut_mark[0].file, ground: r.measure_logo[0].ground.colour }],
          checks: MARK_CHECKS,
          original: brief.brand.logo
        }
      ],
      ['recolour_mark', { mark: r.cut_mark[0].file, side: 'dark' }],
      ['compose_logo', { mark: r.cut_mark[0].file, name: r.set_name[0].sidecar }]
    ],
    (r) => [['compose_logo', { mark: r.recolour_mark[0].file, name: r.set_name[0].sidecar }]],
    (r) =>
      kit.site.logoSpots.map((spot) => {
        const sides = spot.ground.side === 'dark' ? last(r, 'compose_logo').sides : r.compose_logo[0].sides
        return ['fit_logo', { logo: sides[spot.ground.side].file, spot: spot.id }]
      }),
    (r) => [
      ['look_logo', { files: spotLooks(kit, r), checks: CHECKS }],
      ['look_logo', { files: [{ file: r.recolour_mark[0].file, ground: dark }], checks: SIDE_CHECK }]
    ],
    (r) => [['make_favicon', { mark: r.cut_mark[0].file, sideMarks: { dark: r.recolour_mark[0].file } }]],
    () => [['name_slots', {}]],
    (r) => {
      const file = symbolBrandFile(kit, brief, {
        ...r,
        faviconBlock: faviconBlockOf(r.make_favicon[0], r.cut_mark[0].file)
      })
      return [['save_brand_file', { brandFile: file }]]
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
