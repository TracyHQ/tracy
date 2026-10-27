/**
 * A cascade as `CSS.getMatchedStylesForNode` hands it, for the shorthand cases of `page.look {style}`
 * (`resolveStyles`, look-style.mjs) and `look.set` (look-set.mjs).
 *
 * THE CASE (dskeepwp, WordPress Tracy Base wearing a design system, 09/10/2026): the slot's button
 * rule (`packages/design/tracy-ds-slot/src/wordpress.mjs`, `:root`×6 + two classes = (0,8,0)) sets
 * `padding-top`/`-right`/`-bottom`/`-left`; the agent's own Additional CSS for the hero button
 * ((0,7,0)) wrote `padding:14px 25px`. All three rules below stand in `global-styles-inline-css`,
 * in the order CDP lists them (ascending: specificity, then source order). Written from those rules'
 * text — the slot's profile on the stand has changed since, so this is not a capture.
 */

/**
 * A matched rule as CDP hands it: each declaration as written (with a source range), and — after a
 * shorthand — the longhands Chromium expands it into, without one.
 * @param {string} selector
 * @param {[string, string][]} written
 * @param {Record<string, string[]>} [expands]
 * @param {string} [sheet]
 * @param {{ layers?: string[], nesting?: string[], spec?: [number, number, number] }} [where] - the
 *   cascade layer it stands in, the selectors of the rules it is nested in (nearest first) and the
 *   specificity the browser gives its selector, as CDP reports each (`layers`, `nestingSelectors`,
 *   `selectors[].specificity`; Chromium 153, checked 10/10/2026).
 */
export const cdpRule = (selector, written, expands = {}, sheet = 'gs', where = {}) => ({
  matchingSelectors: [0],
  rule: {
    origin: 'regular',
    styleSheetId: sheet,
    selectorList: {
      text: selector,
      selectors: [
        {
          text: selector,
          range: { startLine: 0 },
          ...(where.spec ? { specificity: { a: where.spec[0], b: where.spec[1], c: where.spec[2] } } : {})
        }
      ]
    },
    ...(where.nesting ? { nestingSelectors: where.nesting } : {}),
    layers: (where.layers ?? []).map((text) => ({ text })),
    style: {
      // a minified `x:1px!important` arrives with the flag inside the value, as CDP hands it
      cssProperties: written.flatMap(([name, value]) => [
        {
          name,
          value,
          range: { startLine: 0 },
          ...(value.endsWith('!important') ? { important: true } : {})
        },
        ...(expands[name] ?? []).map((longhand) => ({ name: longhand, value }))
      ])
    }
  }
})

const SIDES = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']
const CORNERS = [
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius'
]

/** The design-system slot's button rule on WordPress, (0,8,0). */
export const SLOT_BUTTON = ':root:root:root:root:root:root .tracy .wp-block-button__link'

/** The agent's own Additional CSS for the hero button on dskeepwp, (0,7,0). */
export const AGENT_HERO =
  '.tracy.home .tracy-hero .wp-block-button:not(.wp-block-button + .wp-block-button) .wp-block-button__link'

/** …as the cascade answer names it: a rule's selectors are cut at 100 characters (`ruleName`). */
export const AGENT_HERO_BY = `${AGENT_HERO.slice(0, 99)}…`

/**
 * The hero button's cascade: global styles' own button padding, the agent's rule, the slot's rule.
 * @param {string[]} [slotSides] - the paddings the slot's rule sets (all four on the stand).
 */
export const heroCascade = (slotSides = SIDES) => ({
  matchedCSSRules: [
    cdpRule(':root :where(.wp-element-button, .wp-block-button__link)', [
      ['padding-top', 'calc(0.667em + 2px)'],
      ['padding-right', 'calc(1.333em + 2px)'],
      ['padding-bottom', 'calc(0.667em + 2px)'],
      ['padding-left', 'calc(1.333em + 2px)']
    ]),
    cdpRule(
      AGENT_HERO,
      [
        ['padding', '14px 25px'],
        ['font-size', '18px'],
        ['border-radius', '1000px']
      ],
      { padding: SIDES, 'border-radius': CORNERS }
    ),
    cdpRule(
      SLOT_BUTTON,
      [
        ['border-radius', '999px'],
        ['font-weight', '500'],
        ...slotSides.map(
          (side) => /** @type {[string, string]} */ ([side, /left|right/.test(side) ? '21px' : '7px'])
        )
      ],
      { 'border-radius': CORNERS }
    )
  ]
})

/**
 * The dskeepem hero button (EmDash Tracy Business wearing Moxie, 10/10/2026), as CDP read it on the
 * stand: Tailwind v4's preflight in `@layer base`, `.btn-primary` in `@layer components`, and the
 * button's own `!px-[…]`/`!py-[…]` utilities — `padding-inline`/`padding-block` with `!important` in
 * `@layer utilities`. Computed: `19px 38px`, from the utilities.
 */
export const EM_PX = '.\\!px-\\[calc\\(var\\(--ds-btn-pad-x\\,30px\\)\\+17px\\)\\]'
export const EM_PY = '.\\!py-\\[calc\\(var\\(--ds-btn-pad-y\\,15px\\)\\+12px\\)\\]'
export const emHeroCascade = () => ({
  matchedCSSRules: [
    cdpRule('*, ::after, ::before, ::backdrop', [['padding', '0']], {}, 'astro', { layers: ['base'] }),
    cdpRule(
      '.btn-primary',
      [['padding', 'var(--ds-btn-pad-y,15px) var(--ds-btn-pad-x,30px)']],
      { padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
      'astro',
      { layers: ['components'], spec: [0, 1, 0] }
    ),
    cdpRule(
      EM_PX,
      [['padding-inline', 'calc(var(--ds-btn-pad-x,30px) + 17px)!important']],
      { 'padding-inline': ['padding-inline-start', 'padding-inline-end'] },
      'astro',
      { layers: ['utilities'], spec: [0, 1, 0] }
    ),
    cdpRule(
      EM_PY,
      [['padding-block', 'calc(var(--ds-btn-pad-y,15px) + 12px)!important']],
      { 'padding-block': ['padding-block-start', 'padding-block-end'] },
      'astro',
      { layers: ['utilities'], spec: [0, 1, 0] }
    )
  ]
})
