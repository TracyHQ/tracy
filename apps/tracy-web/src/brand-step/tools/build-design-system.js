// build_design_system({ accent }): ACCENT ONLY. The template's backgrounds, heading colour, body text colour and fonts
// never change; the module replaces only the template's accent (primary: buttons, links, emphasised text) and its
// family (hover, pressed, accent words, the button text on the accent, the focus ring, accent bands). A ground or a
// text colour is refused. Only true neutrals are refused: black, grey, white (OKLCH chroma under 0.03). A dark or
// light colour with a visible hue is a real brand colour: when it reads under 3:1 on the template's opening ground,
// liftAccent moves its HSL lightness (hue and saturation kept) until it reads, aiming at both sides' grounds. The
// agent never picks the numbers. The result reports `brandColour`, `lift` and `accent` (the colour built).
// Inside: the Design system slot in accent-only mode (tracy-ds-slot): brandProfile({ accent }, ..., { accentOnly: true })
// then joomlaSlot(profile, base, contract, { accentOnly: true }).
// Guard (kept from the lab): the same build with the template's own accent is made too; every non-accent role of
// every side must be identical in both, else the tool fails (the brand would have changed something besides the accent).
import { contrastHex, liftAccent, neutralReason } from '../colour-math.js'
import { templateGrounds } from '../kit-grounds.js'
import { BrandToolError } from './common.js'
import { contrastTable, slotDriftOf } from './design-system-report.js'

const ACCENT_ROLES = [
  'accent',
  'accent-on',
  'accent-hover',
  'accent-active',
  'accent-text',
  'accent-text-hover',
  'accent-on-ink',
  'accent-band',
  'on-accent-band',
  'focus-ring'
]
const SLOT_MODULES = ['library', 'joomla', 'brand']

async function dsSlot() {
  const { dsSlotModule, DS_ROOT } = await import('../../lib/ds-slot.js')
  const [library, joomla, brand] = await Promise.all(SLOT_MODULES.map((m) => dsSlotModule(m)))
  return { library, joomla, brand, root: DS_ROOT }
}

/** The ds-slot contract of the kit's template: ctx.dsContract, else joomla-<product>-modes, else joomla-<product>. */
function contractOf(ctx, library) {
  const product = ctx.kit.quickstart?.product
  for (const name of [ctx.dsContract, `joomla-${product}-modes`, `joomla-${product}`].filter(Boolean)) {
    try {
      return { name, contract: library.loadContract(name) }
    } catch {
      /* try the next name */
    }
  }
  throw new BrandToolError(
    `the Design system has no template contract for ${product}: no accent can be built`
  )
}

export const tool = {
  name: 'build_design_system',
  description:
    "Runs the template's Design system slot in brand mode with the accent only. Give the brand colour exactly as the brief has it; a ground or a text colour is refused. Black, grey and white are refused (no visible hue). A dark or light colour with a visible hue is lifted by code until it reads, keeping hue and saturation. Reports `brandColour`, `lift` and `accent`; checks that nothing but the accent family changed. Returns the module file, its size, the accent's contrast table and every accent shift.",
  inputSchema: {
    type: 'object',
    properties: { accent: { type: 'string', description: 'The brand colour, #rrggbb.' } },
    required: ['accent'],
    additionalProperties: false
  },
  async run(input, ctx) {
    if (input.bg) throw new BrandToolError('bg is not taken: backgrounds never change, only the accent')
    if (input.fg) throw new BrandToolError('fg is not taken: text colours never change, only the accent')
    if (!input.accent) throw new BrandToolError('usage: build_design_system({ accent })')
    if (!/^#[0-9a-f]{6}$/i.test(input.accent)) throw new BrandToolError('accent must be #rrggbb')
    const brandColour = input.accent.toLowerCase()
    const neutral = neutralReason(brandColour)
    if (neutral)
      throw new BrandToolError(
        `accent ${brandColour} is ${neutral}: black, grey and white are never an accent. Try the brand's other colour; none left: keep the template's accent and build nothing`,
        { brandColour, refusedBy: 'neutral' }
      )
    const grounds = templateGrounds(ctx.kit)
    const lift = liftAccent(brandColour, grounds.opening, grounds.other)
    if (!lift.to)
      throw new BrandToolError(`accent ${brandColour}: ${lift.refused}. Try the brand's other colour`, {
        brandColour,
        refusedBy: 'lift',
        lift
      })
    const accent = lift.to

    const ds = await dsSlot()
    const { name, contract } = contractOf(ctx, ds.library)
    const base = ds.library.contractBase(ds.root, contract)
    const K = ctx.kit
    const tplAccent = K.site.brandColours.primary?.value?.toLowerCase() ?? base['--accent']

    const build = (a) => {
      const r = ds.brand.brandProfile({ accent: a }, contract, base, { accentOnly: true })
      if (r.refused) throw new BrandToolError('profile refused', { refused: r.refused })
      const s = ds.joomla.joomlaSlot(r.profile, base, contract, { accentOnly: true })
      if (s.refused) throw new BrandToolError('slot refused', { refused: s.refused })
      const sides = {}
      for (const m of (s.sheet ?? s.html).matchAll(/([^{}]*)\{([^{}]*--ds-c-bg:#[0-9a-fA-F]{6}[^{}]*)\}/g)) {
        const side = /:not\(:has\(> body\.dark-active\)\)/.test(m[1]) ? 'light' : 'dark'
        if (sides[side]) continue
        sides[side] = Object.fromEntries(
          [...m[2].matchAll(/--ds-c-([\w-]+):(#[0-9a-fA-F]{6})/g)].map((x) => [x[1], x[2].toLowerCase()])
        )
      }
      return { r, s, sides, opens: s.mode === 'light' ? 'light' : 'dark' }
    }
    const brand = build(accent)
    const baseline = build(tplAccent)

    // guard: nothing but the accent family may differ from the template-accent build
    const nonAccentChanged = []
    for (const [side, w] of Object.entries(brand.sides))
      for (const [role, v] of Object.entries(w))
        if (!ACCENT_ROLES.includes(role) && baseline.sides[side]?.[role] !== v)
          nonAccentChanged.push({ side, role, template: baseline.sides[side]?.[role] ?? null, module: v })
    if (nonAccentChanged.length)
      throw new BrandToolError(
        "the build changes more than the accent: this accent is refused (try the other brand colour, else keep the template's accent)",
        { brandColour, refusedBy: 'guard', accentTried: accent, lift, nonAccentChanged }
      )

    const file = ctx.files.write('design-system/module.html', Buffer.from(brand.s.html))
    const bytes = Buffer.byteLength(brand.s.html)
    const opens = brand.opens
    const accentOf = (w) => Object.fromEntries(ACCENT_ROLES.filter((k) => w[k]).map((k) => [k, w[k]]))
    const sides = Object.fromEntries(
      Object.entries(brand.sides).map(([side, w]) => [side, { bg: w.bg, surface: w.surface, ...accentOf(w) }])
    )
    const shifts = []
    for (const [side, w] of Object.entries(brand.sides))
      for (const colour of ['accent', 'accent-text'])
        if (w[colour] && w[colour] !== accent)
          shifts.push({
            side,
            opens: side === opens,
            colour,
            from: accent,
            to: w[colour],
            on: w.bg,
            ratio: contrastHex(w[colour], w.bg)
          })

    const { contrast, contrastOk } = contrastTable(brand.sides)
    const slotDrift = slotDriftOf(K, baseline.sides)

    return {
      ok: contrastOk,
      ...(contrastOk ? {} : { error: 'an accent pair is under 3:1 (hard rule for text and buttons)' }),
      // "<slot contract id>@<version>" is the form the gate wants: the contract that built it, for this template version.
      module: { file, bytes, limit: 64000, slot: `${name}@${K.quickstart.version}` },
      profileId: brand.r.profile.id,
      opensOn: opens,
      brandColour,
      accent,
      replaces: tplAccent,
      lift: lift.lifted
        ? {
            from: lift.from,
            to: lift.to,
            direction: lift.direction,
            hue: lift.hue,
            saturation: lift.saturation,
            lightnessFrom: lift.lightnessFrom,
            lightnessTo: lift.lightnessTo,
            grounds: lift.grounds,
            before: lift.before,
            after: lift.after,
            tier: lift.tier,
            forTheOwner: `the brand colour ${lift.from} was made ${lift.direction} (${lift.to}, same hue) so buttons and links stand out on the template's ${grounds.opens} opening ground`
          }
        : null,
      keeps:
        'template backgrounds, heading colour, body text colour, fonts (checked: every non-accent role equals the template-accent build)',
      sides,
      contrast,
      shifts,
      slotRecords: [...brand.r.adjusted.map((x) => `profile:${x}`), ...brand.s.adjusted].filter((x) =>
        /accent/.test(x)
      ),
      slotDrift,
      slotDriftNote: slotDrift.length
        ? 'advisory, not for the brand file: the slot code renders these template colours differently even with the template accent; a slot code matter, not a brand change'
        : null
    }
  }
}
