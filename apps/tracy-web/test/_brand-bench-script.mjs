// The scripted words-only brand agent of the end-to-end test (brand step trial bench, #320): a fake model that calls the
// REAL tools in a plausible order, reading what each tool answered from the conversation it is sent.
import { finalReply, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { brandFileFrom, CHECKS, iconOf, looksOf, markFileOf, NAME, resultsOf } from './_brand-bench-agent.mjs'

const ICON_CHECKS = [
  'there are no letters, numbers or words in it',
  'it reads as one clear shape on this ground'
]

/** After make_icon: a drawn icon is looked at on both opening grounds; else the lettermark fallback. */
const afterIcons = (kit, r) => {
  const icon = iconOf(r)
  if (!icon) return [['make_lettermark', { letters: 'GB', accent: kit.site.brandColours.primary.value }]]
  return [
    [
      'look_logo',
      {
        files: ['#ffffff', '#121111'].map((ground) => ({ file: icon.file, ground })),
        checks: ICON_CHECKS
      }
    ]
  ]
}

/**
 * The scripted agent: each request gets the next step, chosen by how many assistant turns the conversation holds.
 * `icon: true` draws one icon (the picture door answers it) and looks at it; else make_icon is called four
 * times, and the script goes on with the lettermark whatever the picture door answered.
 */
export function scriptedAgent(kit, { wrongName = false, icon = false } = {}) {
  const steps = [
    () => [
      ['open_image', { id: 'page-home-1440' }],
      ['set_name', { text: NAME }]
    ],
    () =>
      Array.from({ length: icon ? 1 : 4 }, (_, n) => [
        'make_icon',
        { subject: `a swimmer in goggles, try ${n + 1}`, colours: [kit.site.brandColours.primary.value] }
      ]),
    (r) => afterIcons(kit, r),
    (r) => [['compose_logo', { mark: markFileOf(r), name: r.set_name[0].sidecar }]],
    (r) =>
      kit.site.logoSpots.map((spot) => [
        'fit_logo',
        { logo: r.compose_logo[0].sides[spot.ground.side].file, spot: spot.id }
      ]),
    (r) => [['look_logo', { files: looksOf(kit, r), checks: CHECKS }]],
    (r) => [['make_favicon', { mark: markFileOf(r) }]],
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
