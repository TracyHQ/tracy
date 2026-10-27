import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { bandColours, bandRules, groundCandidates, kindOf, wordsOn, wornBands } from '../src/bands.mjs'
import { contrast } from '../src/colour.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { gate } from '../src/normalise.mjs'
import { histogramProbe, leftShare, paintsBehind, signature } from '../src/remnant.mjs'
import { tokens56 } from '../src/tokens56.mjs'
import { variationCss, wordpressVariation, wpKebab } from '../src/wordpress.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const HI = ':root:root:root:root:root:root'
const SYSTEMS = resolve(ROOT, 'vendor/tracy/od-design-system/packages/design/tracy-od-design-system/systems')

const light = {
  '--bg': '#ffffff',
  '--surface': '#f5f5f5',
  '--surface-warm': '#fafafa',
  '--fg': '#262626',
  '--accent': '#1c69d4',
  '--accent-on': '#ffffff',
  '--accent-hover': '#0653b6',
  '--accent-active': '#1652a5'
}

test('a band is read off its ground: a dark neutral is ink, a dark colour is brand, a light one a panel', () => {
  assert.equal(kindOf('#14171a'), 'ink')
  assert.equal(kindOf('#14483a'), 'brand')
  assert.equal(kindOf('#eceae4'), 'panel')
  assert.equal(kindOf('not a colour'), null)
})

test('a dark band takes the system ink, deepened until every word it shows still reads', () => {
  // WordPress Tracy Business's footer under BMW: #7f8080 read 4.47 on #14171a; BMW's own ink (#262626)
  // gives it 3.9, so the ink is deepened — the same grey, never another hue
  const c = bandColours(light, { ground: '#14171a', texts: ['#b9b5ac', '#f5f3ee', '#7f8080'] })
  assert.ok(c)
  assert.equal(c.kind, 'ink')
  for (const x of ['#b9b5ac', '#f5f3ee', '#7f8080'])
    assert.ok(contrast(x, c.ground) >= Math.min(4.5, contrast(x, '#14171a') - 0.01), x)
  assert.ok(groundCandidates(light, 'ink').includes(c.ground))
  // the accent as a word on the new ground reads at 4.5:1, as a fill at 3:1
  assert.ok(contrast(c.accent, c.ground) >= 4.5)
  assert.ok(contrast(c.accentFill, c.ground) >= 3)
})

test("a dark band takes the system's strongest ink, wherever the template put it", () => {
  // JA Nova WordPress under MotherDuck: its headings take --fg-2, so MotherDuck's #383838 sits there and
  // #676665 at --fg; the bands took #676665 and the sky-blue button read 2.96:1 on them (13/10/2026)
  const c = loadContract('wordpress-ja-nova')
  const { tokens } = tokens56(
    loadProfile(ROOT, 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567'),
    contractBase(ROOT, c)
  )
  assert.equal(tokens['--fg-2'], '#383838')
  // an ink band of the template (its own dark ground, light words); JA Nova's .jn-cta-bar itself became a brand band
  // that wears the accent in #1317, so the band here is the dark one the rule is about
  const band = bandColours(tokens, { ground: '#1a1a1a', texts: ['#ffffff'] })
  assert.equal(band.ground, '#383838')
  assert.ok(contrast(tokens['--accent'], band.ground) >= 3)
})

test("a hueless accent on a dark band is the system's own words there, never a switched-off grey", () => {
  // Tracy Business WordPress's hero under Airbnb (Airbnb.org's Carbon Ink #222222 is its only accent):
  // moved until it read on #181818 it was #838383, and "next-generation plants" looked disabled (13/10/2026)
  const c = loadContract('wordpress-tracy-business')
  const { tokens } = tokens56(
    loadProfile(ROOT, 'refero:194faa2f-2f69-4bbf-9e29-290f28fa8ca2'),
    contractBase(ROOT, c)
  )
  const hero = bandColours(tokens, c.bands['.wtb-hero:not(.wtb-hero--404)'])
  assert.equal(hero.accent, wordsOn(tokens, hero.ground))
  assert.ok(contrast(hero.accent, hero.ground) >= 7)
})

test('a brand band that repaints its words takes the system accent with the accent own text', () => {
  const c = bandColours(light, { ground: '#14483a', texts: ['#bfd4cb'], kind: 'brand', repaint: true })
  assert.equal(c.ground, '#1c69d4')
  assert.equal(c.text, '#ffffff')
  assert.ok(contrast(c.text2, c.ground) >= 4.5)
  // without repaint the template's pale green words bind the ground: the accent fails them, ink wins
  const kept = bandColours(light, { ground: '#14483a', texts: ['#bfd4cb'], kind: 'brand' })
  assert.notEqual(kept.ground, '#1c69d4')
  assert.ok(contrast('#bfd4cb', kept.ground) >= 4.5)
})

test('a band no colour of the system can carry stays the template’s (null), and words are never left unreadable', () => {
  // a mid grey text that read 4.6 on its black band: no ground of a mid-grey system keeps it readable
  const grey = { '--bg': '#808080', '--fg': '#7a7a7a', '--surface': '#858585', '--accent': '#888888' }
  assert.equal(bandColours(grey, { ground: '#000000', texts: ['#767676'] }), null)
  assert.equal(wordsOn(light, '#1c69d4'), '#ffffff')
  assert.equal(wordsOn(light, '#262626'), '#ffffff')
})

test('bandRules: the ground, the roles of the template variables and paints, inside the band only; unsafe input ignored', () => {
  const contract = {
    keepScopes: ['.hero', '.cta'],
    bands: {
      '.hero:not(.hero--404)': {
        ground: '#14171a',
        texts: ['#f5f3ee'],
        vars: { '--ink': 'ground', '--orange': 'accent', 'not-a-var': 'ground', '--x': 'nope' },
        paint: {
          '&': { color: 'text-2' },
          'h1 em, :is(.a, .b)': { color: 'accent' },
          'x{': { color: 'accent' }
        }
      },
      '.cta': {
        ground: '#eceae4',
        texts: ['#14171a'],
        root: false,
        important: true,
        paint: { '.inner': { 'background-color': 'ground' } }
      },
      '.elsewhere': { ground: '#000000', texts: [] }
    }
  }
  const { rules, grounds } = bandRules(contract, light, HI)
  assert.deepEqual(Object.keys(grounds), ['.hero:not(.hero--404)', '.cta'])
  const hero = rules.find((r) => r.startsWith(`${HI} .hero:not(.hero--404){`))
  assert.match(hero, /background-color:#[0-9a-f]{6};--ink:#[0-9a-f]{6};--orange:#[0-9a-f]{6}\}$/)
  assert.ok(!hero.includes('not-a-var') && !hero.includes('--x'))
  assert.ok(
    rules.includes(
      `${HI} .hero:not(.hero--404){color:${bandColours(light, contract.bands['.hero:not(.hero--404)']).text2}}`
    )
  )
  assert.ok(
    rules.some((r) =>
      // a text paint stops at buttons (an accent word inside an accent button)
      r.startsWith(
        `${HI} .hero:not(.hero--404) h1 em:where(:not(.btn, .btn *, [class*=button], [class*=button] *)),${HI} .hero:not(.hero--404) :is(.a, .b):where(:not(.btn, .btn *, [class*=button], [class*=button] *)){color:`
      )
    )
  )
  assert.ok(!rules.some((r) => r.includes('x{')))
  // a panel painted by an inner element, !important (T4's generated palettes)
  assert.ok(rules.includes(`${HI} .cta .inner{background-color:${grounds['.cta']}!important}`))
  assert.ok(!rules.some((r) => r.startsWith(`${HI} .cta{`)))
  assert.deepEqual(wornBands({ keepScopes: [], bands: contract.bands }), [])
})

test('WordPress Tracy Business: under every system of the library, every band either wears a ground its words read on, or stays', () => {
  const c = loadContract('wordpress-tracy-business')
  const base = contractBase(ROOT, c)
  let n = 0
  let worn = 0
  for (const id of readdirSync(SYSTEMS)) {
    let profile
    try {
      profile = loadProfile(ROOT, `od:${id}`)
    } catch {
      continue
    }
    if (!gate(profile).ok) continue
    const { tokens } = tokens56(profile, base)
    for (const [key, , spec] of wornBands(c)) {
      n++
      const got = bandColours(tokens, spec)
      if (!got) continue
      worn++
      if (spec.repaint) assert.ok(contrast(got.text, got.ground) >= 4.5, `${id} ${key}`)
      else
        for (const x of spec.texts)
          assert.ok(
            contrast(x, got.ground) >= Math.min(4.5, contrast(x, spec.ground) - 0.01),
            `${id} ${key} ${x}`
          )
    }
  }
  // measured 12/10/2026: 652 of 654 band × system pairs wear the system (Discord's hero and footer stay)
  assert.ok(n > 600 && worn / n > 0.99, `${worn}/${n}`)
})

test('remnant: the share of a worn page still in the template’s own colours, pictures already left out', () => {
  const def = { '16,16,24': 600, '16,72,56': 100, '248,248,248': 300 }
  const sig = signature(def, 1000)
  assert.deepEqual(sig.sort(), ['16,16,24', '16,72,56', '248,248,248'])
  // the green band kept, the dark hero now the system's navy, white page the system's own white
  const worn = { '0,24,48': 600, '16,72,56': 100, '248,248,248': 300 }
  const r = leftShare(worn, 1000, sig, ['#061b31', '#ffffff', '#533afd'])
  assert.equal(r.share, 0.1)
  assert.equal(r.worst[0].bin, 'rgb(16,72,56)')
  assert.equal(leftShare(worn, 0, sig, []).share, null)
})

test('remnant: a picture laid behind the page masks only where nothing opaque is drawn over it', () => {
  // JA Social II (14/10/2026): #features-bg, a fixed backdrop photo at z-index -1, covers the whole
  // first screen; the white sections drawn over it are not inside it, so they were masked with it and
  // every view read null ("all pictures") while most of the first screen was the template's white
  assert.equal(paintsBehind({ position: 'fixed', zIndex: '-1' }), true)
  assert.equal(paintsBehind({ position: 'absolute', zIndex: '-10' }), true)
  // a static box ignores z-index; auto or positive is drawn over the flow, not under it
  assert.equal(paintsBehind({ position: 'static', zIndex: '-1' }), false)
  assert.equal(paintsBehind({ position: 'fixed', zIndex: 'auto' }), false)
  assert.equal(paintsBehind({ position: 'relative', zIndex: '2' }), false)
  // in the page: a picture behind the page takes every opaque box over it as a hole, not its own only
  const p = histogramProbe('PNG', 0.25, 900, [])
  assert.match(p, /function paintsBehind/)
  assert.match(p, /paintsBehind\(getComputedStyle\(e\)\)/)
})

test('variationCss prints what WordPress prints for a style variation: presets, custom, elements, then styles.css', () => {
  assert.equal(wpKebab('gutterDesktop'), 'gutter-desktop')
  assert.equal(wpKebab('sectionY'), 'section-y')
  assert.equal(wpKebab('2xl'), '2-xl')
  const c = loadContract('wordpress-tracy-business')
  const v = wordpressVariation(loadProfile(ROOT, 'od:stripe'), contractBase(ROOT, c), c).variation
  const css = variationCss(v)
  assert.ok(css.startsWith(':root{--wp--preset--color--bg:'))
  // the layout metrics stay the theme's: no container gutters, no section rhythm (15/10/2026)
  assert.ok(!css.includes('--wp--custom--container--'))
  assert.ok(!css.includes('--wp--custom--section-y--'))
  assert.ok(css.includes('--wp--custom--ds--profile:od:stripe'))
  // a system that states its button shape gets WordPress's button element rule (Stripe states none)
  assert.equal(
    css.includes(':root :where(.wp-element-button, .wp-block-button__link){'),
    Boolean(v.styles.elements?.button)
  )
  const shaped = variationCss({
    settings: {},
    styles: {
      elements: {
        button: {
          border: { radius: '0px' },
          spacing: { padding: { top: '8px', bottom: '8px', left: '16px', right: '16px' } }
        },
        heading: { typography: { fontWeight: '300' } },
        link: { color: { text: '#1c69d4' }, ':hover': { color: { text: '#0653b6' } } }
      },
      css: '.x{color:red}'
    }
  })
  assert.equal(
    shaped,
    [
      ':root{}',
      ':root :where(.wp-element-button, .wp-block-button__link){border-radius:0px;padding-top:8px;padding-right:16px;padding-bottom:8px;padding-left:16px}',
      'h1, h2, h3, h4, h5, h6{font-weight:300}',
      ':root :where(a:where(:not(.wp-element-button))){color:#1c69d4}',
      ':root :where(a:where(:not(.wp-element-button)):hover){color:#0653b6}',
      '.x{color:red}'
    ].join('\n')
  )
  // the variation's own sheet comes last, as WordPress appends a theme.json `styles.css`
  assert.ok(css.endsWith(v.styles.css))
  assert.ok(!/<\/style/i.test(css))
})

test('a fill outside the kept bands takes the system accent and repaints its own words on it', () => {
  const contract = {
    keepScopes: [],
    bands: { '.promo': { ground: '#c9504a', texts: ['#ffffff'], fill: true, important: true } }
  }
  const { rules, grounds } = bandRules(contract, light, HI)
  assert.equal(grounds['.promo'], '#1c69d4')
  assert.ok(rules.includes(`${HI} .promo{background-color:#1c69d4!important}`))
  const words = rules.find((r) => r.startsWith(`${HI} .promo,`))
  assert.ok(words.endsWith('{color:#ffffff!important}'), words)
  assert.ok(contrast('#ffffff', '#1c69d4') >= 4.5)
})

test('a worn kept band with no keptButtons gets the template primary buttons in the system pair, judged on its new ground', async () => {
  const { keptButtonRules } = await import('../src/tokens56.mjs')
  const contract = {
    keepScopes: ['.acm-hero'],
    bands: { '.acm-hero': { ground: '#101010', texts: ['#ffffff'] } }
  }
  const { grounds } = bandRules(contract, light, HI)
  const rules = keptButtonRules(contract, light, HI, grounds, ['.tracy .btn-primary'])
  const rule = rules.find((r) => r.startsWith(`${HI} .acm-hero .btn-primary,`))
  assert.ok(rule, rules.join('\n'))
  const fill = /background-color:(#[0-9a-f]{6})/.exec(rule)[1]
  assert.ok(contrast(fill, grounds['.acm-hero']) >= 3)
  // without a worn ground nothing is added
  assert.deepEqual(keptButtonRules({ keepScopes: ['.acm-hero'] }, light, HI, {}, ['.btn-primary']), [])
})

test('a label filled with the accent takes words that read on the fill; outline buttons in a fill take the fill words', () => {
  const dark = {
    '--bg': '#121212',
    '--fg': '#ffffff',
    '--surface': '#181818',
    '--accent': '#1ed760',
    '--accent-on': '#000000'
  }
  const contract = {
    keepScopes: ['.panel'],
    bands: {
      '.panel': {
        ground: '#f8f9fa',
        texts: ['#212529'],
        paint: { '.pill': { 'background-color': 'accent-fill' } }
      },
      '.promo': { ground: '#198754', texts: ['#ffffff'], fill: true }
    }
  }
  const { rules } = bandRules(contract, dark, HI)
  const pill = rules.find((r) => r.startsWith(`${HI} .panel .pill{`))
  const fill = /background-color:(#[0-9a-f]{6})/.exec(pill)[1]
  const text = /;color:(#[0-9a-f]{6})/.exec(pill)[1]
  assert.ok(contrast(text, fill) >= 4.5, pill)
  const outline = rules.find((r) => r.includes('.promo :is([class*=btn-outline]'))
  assert.ok(outline.includes('color:#000000') && outline.includes('border-color:#000000'), outline)
})

test('a fill with a card inside repaints only the words it names; with none named, its words bind its new ground', () => {
  const card = { ground: '#ec4e4f', texts: ['#ffffff', '#585858'], fill: true }
  const named = bandRules(
    { keepScopes: [], bands: { '.sec': { ...card, words: ['.title'] } } },
    light,
    HI
  ).rules
  assert.ok(
    named.some((r) => r.startsWith(`${HI} .sec .title:where(:not(.btn, .btn *`) && r.includes('{color:'))
  )
  assert.ok(!named.some((r) => r.includes(`${HI} .sec :is(h1`)))
  const bare = bandRules({ keepScopes: [], bands: { '.sec': card } }, light, HI)
  assert.ok(!bare.rules.some((r) => r.includes('{color:') && !r.includes('btn-outline')))
  // its white words still read on whatever ground it takes
  assert.ok(contrast('#ffffff', bare.grounds['.sec']) >= Math.min(4.5, contrast('#ffffff', '#ec4e4f') - 0.01))
})

test('a band limited to some widths wears the system there only, and its buttons wear the pair there only', async () => {
  const contract = {
    keepScopes: ['.hdr'],
    bands: {
      '.hdr': { ground: '#222c54', texts: ['#ffffff'], media: '(max-width: 991px)' },
      '.bad': { ground: '#000000', texts: [], media: 'screen{' }
    }
  }
  const { rules, grounds } = bandRules(contract, light, HI)
  assert.equal(rules.length, 1)
  assert.match(
    rules[0],
    /^@media \(max-width: 991px\)\{:root(:root){5} \.hdr\{background-color:#[0-9a-f]{6}\}\}$/
  )
  assert.deepEqual(grounds, {})
  // its buttons: the pair on its ground at those widths, nothing elsewhere (JA Mood's phone header)
  const { keptButtonRules } = await import('../src/tokens56.mjs')
  const { media } = bandRules(contract, light, HI)
  assert.deepEqual(Object.keys(media), ['.hdr'])
  const buttons = keptButtonRules(contract, light, HI, grounds, ['.btn-primary'], media)
  assert.equal(buttons.length, 1)
  assert.ok(buttons[0].startsWith('@media (max-width: 991px){'), buttons[0])
  const fill = /background-color:(#[0-9a-f]{6})/.exec(buttons[0])[1]
  assert.ok(contrast(fill, media['.hdr'].ground) >= 3)
})

test('a card inside a band steps away from the band words, or toward them on a ground at the end', () => {
  const contract = {
    keepScopes: ['.foot'],
    bands: {
      '.foot': { ground: '#403d75', texts: ['#ffffff'], paint: { '.card': { 'background-color': 'card' } } }
    }
  }
  const { rules, grounds } = bandRules(contract, light, HI)
  const card = /\.foot \.card\{background-color:(#[0-9a-f]{6})\}/.exec(rules.join('\n'))?.[1]
  assert.ok(card, rules.join('\n'))
  const words = '#ffffff'
  assert.ok(contrast(words, grounds['.foot']) >= 4.5)
  // never worse for the words than the band itself, unless the band is already at the end
  assert.ok(contrast(words, card) >= Math.min(contrast(words, grounds['.foot']), 4.5), card)
  assert.notEqual(card, grounds['.foot'])
})

test('a picture band keeps its ground and photo; its accent marks take the system accent readable on that ground', () => {
  const contract = {
    keepScopes: ['.hero'],
    bands: {
      '.hero': {
        ground: '#000000',
        texts: ['#ffffff'],
        picture: true,
        paint: { '.eyebrow': { color: 'accent' } }
      }
    }
  }
  const { rules, grounds } = bandRules(contract, light, HI)
  // its buttons are judged on the photo's dark with the accents' margin (30% toward its words)
  assert.ok(contrast(grounds['.hero'], '#000000') < contrast(grounds['.hero'], '#ffffff'), grounds['.hero'])
  assert.ok(!rules.some((r) => r.includes('background-color')))
  const eyebrow = rules.find((r) => r.includes('.hero .eyebrow'))
  const color = /color:(#[0-9a-f]{6})/.exec(eyebrow)[1]
  assert.ok(contrast(color, '#000000') >= 4.5, eyebrow)
})

test('a band whose words do not read on what was read under it is an overlay: ground kept, accents judged on its words side', () => {
  const contract = {
    keepScopes: ['#header'],
    bands: {
      '#header': {
        ground: '#ffffff',
        texts: ['#ffffff'],
        root: false,
        paint: { '.title': { color: 'accent' }, '.inner': { 'background-color': 'ground' } }
      }
    }
  }
  const { rules } = bandRules(contract, light, HI)
  assert.ok(!rules.some((r) => r.includes('background-color')), rules.join('\n'))
  const title = rules.find((r) => r.includes('#header .title'))
  assert.ok(contrast(/color:(#[0-9a-f]{6})/.exec(title)[1], '#222222') >= 4.5, title)
})

test("a box a band fills with its accent gives the fill's words to the words inside it too", () => {
  const contract = {
    keepScopes: ['.stats'],
    bands: {
      '.stats': {
        ground: '#323183',
        texts: ['#ffffff'],
        paint: { '.bubble': { 'background-color': 'accent-fill' } }
      }
    }
  }
  const { rules } = bandRules(contract, light, HI)
  const box = rules.find((r) => r.includes('.stats .bubble{'))
  const inner = rules.find((r) => r.includes('.stats .bubble :is('))
  assert.ok(box && inner, rules.join('\n'))
  assert.equal(/color:(#[0-9a-f]{6})/.exec(inner.split('{')[1])[1], /;color:(#[0-9a-f]{6})/.exec(box)[1])
})

test('a fill repaints the headings a template draws by class (JA Alpha: div.title.h4 on its call band)', () => {
  const contract = loadContract('joomla-ja-alpha')
  const linear = 'refero:90ce5883-bb24-4466-93f7-801cd617b0d1'
  const { tokens } = tokens56(loadProfile(ROOT, linear), contractBase(ROOT, contract))
  const { rules, grounds } = bandRules(contract, tokens, HI)
  const words = rules.find((r) => r.startsWith(`${HI} .bg-primary,`))
  assert.ok(words, rules.join('\n'))
  assert.match(words, /:is\([^)]*\.h4[^)]*\)/)
  const colour = /\{color:(#[0-9a-f]{6})/.exec(words)[1]
  assert.ok(contrast(colour, grounds['.bg-primary']) >= 4.5, `${colour} on ${grounds['.bg-primary']}`)
})

test("a paint the contract names for one element wins over the band's words: the button guard adds no weight (Tracy Business's footer monogram)", () => {
  const contract = {
    keepScopes: ['.foot'],
    bands: {
      '.foot': {
        ground: '#14171a',
        texts: ['#b9b5ac', '#f5f3ee'],
        paint: { ':is(a, p)': { color: 'text-2' }, '.mark': { 'background-color': 'text', color: 'ground' } }
      }
    }
  }
  const { rules } = bandRules(contract, light, HI)
  const words = rules.find((r) => r.includes(':is(a, p)'))
  const mark = rules.find((r) => r.startsWith(`${HI} .foot .mark{`))
  assert.ok(words && mark, rules.join('\n'))
  // the guard wraps in :where(): `.foot :is(a, p)` weighs (0,1,1) beside the mark's (0,2,0), so the mark's own
  // colour holds on the fill it turns
  assert.match(words, /:is\(a, p\):where\(:not\(\.btn/)
  assert.doesNotMatch(words, /\):not\(\.btn/)
})

test('dropPicture: a band whose ground is a flat-colour picture drops it, so the worn ground shows', () => {
  // JA Impact's "Helping hands" panel: an opaque navy texture over its fill hid the system's ink (14/10/2026)
  const band = { ground: '#1d3677', texts: ['#ffffff'], fill: true, kind: 'ink', words: ['.title'] }
  const own = (spec) =>
    bandRules({ bands: { '.panel': spec } }, light, HI).rules.find((r) => r.startsWith(`${HI} .panel{`))
  assert.match(own({ ...band, dropPicture: true }), /background-image:none/)
  assert.doesNotMatch(own(band), /background-image/)
  // a photo band keeps its picture whatever the flag says
  const photo = bandRules({ bands: { '.panel': { ...band, picture: true, dropPicture: true } } }, light, HI)
  assert.ok(!photo.rules.some((r) => r.includes('background-image:none')))
})

test('a panel the template set apart from its page keeps a step off the worn page, by its ground or a line', async () => {
  const { PANEL_STEP } = await import('../src/bands.mjs')
  // a system whose surface is its page (Mailchimp: #ffffff both): a light masthead vanished (14/10/2026)
  const flat = {
    '--bg': '#ffffff',
    '--surface': '#ffffff',
    '--surface-warm': '#ffffff',
    '--fg': '#241c15',
    '--border': '#e3e0d8',
    '--accent': '#ffe01b',
    '--accent-on': '#241c15'
  }
  const masthead = { ground: '#f4f6f8', texts: ['#212529'], kind: 'panel' }
  const c = bandColours(flat, masthead, { page: '#ffffff' })
  assert.ok(contrast(c.ground, '#ffffff') >= PANEL_STEP - 0.005, `${c.ground} stands off the page`)
  assert.ok(contrast('#212529', c.ground) >= 4.5, 'its words still read')
  assert.equal(c.line, null)
  // without the template's page the rule is not asked: the old choice
  assert.equal(bandColours(flat, masthead).ground, '#ffffff')
  // a white card of grey words (2.68:1) on a dark template page: no grey ground keeps its words, so a line
  const card = { ground: '#ffffff', texts: ['#222222', '#9e9e9e'], kind: 'panel' }
  const lined = bandColours(flat, card, { page: '#111111' })
  assert.equal(lined.ground, '#ffffff')
  assert.ok(lined.line && contrast(lined.line, '#ffffff') >= 1.15, `line ${lined.line}`)
  const rule = bandRules({ bands: { '.card': { ...card, fill: true } } }, flat, HI, { page: '#111111' })
    .rules[0]
  assert.match(rule, /outline:1px solid #[0-9a-f]{6};outline-offset:-1px/)
})

test('accentLarge: a band whose accent words are large takes the 3:1 accent, at every width or from a min-width up', () => {
  const stripe = {
    '--bg': '#ffffff',
    '--surface': '#f8fafd',
    '--fg': '#061b31',
    '--accent': '#533afd',
    '--accent-on': '#ffffff'
  }
  const photo = {
    ground: '#2b2b2b',
    texts: ['#ffffff'],
    picture: true,
    paint: { '.slider-content h1 span': { color: 'accent' } }
  }
  const c = bandColours(stripe, photo)
  assert.ok(contrast(c.accentLarge, '#6b6b6b') >= 3 && contrast(c.accent, '#6b6b6b') >= 4.5)
  assert.notEqual(c.accentLarge, c.accent, 'the large accent keeps more of the hue')
  const rulesOf = (accentLarge) =>
    bandRules(
      { keepScopes: ['.acm-slideshow'], bands: { '.acm-slideshow': { ...photo, accentLarge } } },
      stripe,
      HI
    ).rules
  assert.ok(rulesOf(true).some((r) => r.includes(`{color:${c.accentLarge}}`) && !r.startsWith('@media')))
  const media = rulesOf('(min-width: 1200px)')
  assert.ok(media.some((r) => r.startsWith('@media (min-width: 1200px){') && r.includes(c.accentLarge)))
  assert.ok(
    media.some((r) => r.includes(`{color:${c.accent}}`)),
    'the phone keeps the 4.5:1 accent'
  )
  // anything but a min-width query is ignored
  assert.ok(!rulesOf('(max-width: 600px)').some((r) => r.includes(c.accentLarge)))
})

test("kept-band buttons belong to the innermost band: an outer band's rule leaves the inner band's buttons", async () => {
  const { keptButtonRules } = await import('../src/tokens56.mjs')
  const tokens = { '--accent': '#533afd', '--accent-on': '#ffffff', '--accent-hover': '#4434d4' }
  const rules = keptButtonRules(
    {
      keepScopes: ['#Section98', '.cta-showcase-item'],
      keptButtons: {
        '#Section98': { ground: '#f5f3ee', buttons: ['.btn'] },
        '.cta-showcase-item': { ground: '#f5f3ee', buttons: ['.btn'] }
      }
    },
    tokens,
    ':root'
  )
  assert.ok(
    rules.includes(
      ':root #Section98 .btn:where(:not(#Section98 :is(.cta-showcase-item) *)){background-color:#533afd;background-image:none;border-color:#533afd;color:#ffffff}'
    )
  )
  assert.ok(
    rules.some((r) =>
      r.startsWith(':root .cta-showcase-item .btn:where(:not(.cta-showcase-item :is(#Section98) *)){')
    )
  )
})

test("the page's accent words carried into a worn band take the band's accent, unless the band paints them (T4 blank's eyebrows)", () => {
  const dark = {
    '--bg': '#000000',
    '--surface': '#1a1a1a',
    '--fg': '#f4efd4',
    '--fg-2': '#b7b39f',
    '--accent': '#84acfb',
    '--accent-on': '#000000'
  }
  const panel = { ground: '#f8f9fa', texts: ['#212529'], important: true }
  const contract = {
    keepScopes: ['.bg-light', '.t4-footer'],
    followRules: {
      'h3.fs-sm.text-uppercase': { color: 'accent-text!' },
      '.item-readmore a': { color: 'fg' }
    },
    bands: { '.bg-light': panel, '.t4-footer': { ground: '#212529', texts: ['#6c757d'] } }
  }
  const c = bandColours(dark, panel)
  assert.ok((contrast(c.accent, c.ground) ?? 0) >= 4.5, 'judged on the band ground')
  const { rules } = bandRules(contract, dark, HI)
  const eyebrow = rules.find((r) => r.startsWith(`${HI} .bg-light h3.fs-sm.text-uppercase`))
  assert.ok(eyebrow, rules.join('\n'))
  assert.ok(eyebrow.endsWith(`{color:${c.accent}!important}`))
  assert.ok(eyebrow.includes(':where(:not(.bg-light :is(.t4-footer) *))'), 'the innermost band wins')
  assert.ok(!rules.some((r) => r.includes('.item-readmore')), 'only accent words are carried')
  // a band that paints the same words itself keeps its paint
  const paint = { 'h3.fs-sm.text-uppercase': { color: 'text' } }
  const painted = bandRules(
    { ...contract, bands: { ...contract.bands, '.bg-light': { ...panel, paint } } },
    dark,
    HI
  )
  const own = painted.rules.filter((r) => r.startsWith(`${HI} .bg-light h3.fs-sm.text-uppercase`))
  assert.equal(own.length, 1)
  assert.ok(own[0].endsWith(`{color:${c.text}!important}`))
})
