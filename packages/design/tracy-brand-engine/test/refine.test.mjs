/**
 * Tracy's refine rules, pinned on the three sites that showed the need (06/09) plus the case where
 * a rule must NOT fire. Material fixtures are the harvester's real numbers, trimmed.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  googleFontsUrlFor,
  guessGoogleFontsUrl,
  hostOf,
  isAchromatic,
  pickFont,
  pickName,
  refineBrand,
  topChromatic,
  isDarkModeOnly,
  headingFont,
  isChromeHeading,
  decodeText,
  taglineFrom
} from '../src/host/refine.mjs'

const brand = (over = {}) => ({
  name: 'X',
  colors: [
    { role: 'background', hex: '#ffffff' },
    { role: 'foreground', hex: '#000000' },
    { role: 'accent', hex: '#0071e3' }
  ],
  typography: {
    display: { family: 'Inter', fallbacks: [], weights: [400, 700] },
    body: { family: 'Inter', fallbacks: [], weights: [400, 700] }
  },
  ...over
})

test('pickName: og:site_name wins; a title with a separator yields its shortest name-like segment; a sentence yields the host', () => {
  assert.deepEqual(
    pickName({ siteName: 'New Balance', title: 'New Balance Athletic Shoes' }, 'newbalance.com'),
    {
      name: 'New Balance',
      from: 'site-name'
    }
  )
  assert.deepEqual(
    pickName({ title: 'Stripe | Financial Infrastructure to Grow Your Revenue' }, 'stripe.com'),
    {
      name: 'Stripe',
      from: 'title'
    }
  )
  assert.deepEqual(pickName({ title: 'One desk for every site you run.' }, 'lucaswp.tracy.ai'), {
    name: 'lucaswp.tracy.ai',
    from: 'host'
  })
  assert.deepEqual(pickName({ title: 'Fiji Trips' }, 'fijitrips.example'), {
    name: 'Fiji Trips',
    from: 'title'
  })
  assert.deepEqual(pickName({ title: 'Acme – Home' }, 'acme.com').name, 'Acme')
  assert.deepEqual(pickName({}, 'vercel.com'), { name: 'vercel.com', from: 'host' })
})

test('pickFont: icon sets and code faces never win; the first real face by frequency does', () => {
  assert.equal(
    pickFont({
      fonts: [
        { family: 'Glyphicons Halflings', count: 2 },
        { family: 'Poppins', count: 1 },
        { family: 'Menlo', count: 1 }
      ],
      fontFaceFamilies: ['Glyphicons Halflings']
    }),
    'Poppins'
  )
  assert.equal(
    pickFont({
      fonts: [
        { family: 'Geist Mono', count: 4 },
        { family: 'Geist', count: 3 }
      ]
    }),
    'Geist Mono'
  )
  assert.equal(pickFont({ fonts: [{ family: '"sohne-var"', count: 3 }] }), 'sohne-var')
  assert.equal(
    pickFont({ fonts: [{ family: 'FontAwesome', count: 9 }], fontFaceFamilies: ['fa-solid-900'] }),
    null
  )
  assert.equal(
    pickFont({
      fonts: [
        { family: 'sans-serif', count: 9 },
        { family: 'Lora', count: 1 }
      ]
    }),
    'Lora'
  )
})

test('isAchromatic / topChromatic: black and greys have no hue; the most-used saturated colour replaces them', () => {
  assert.equal(isAchromatic('#000000'), true)
  assert.equal(isAchromatic('#777777'), true)
  assert.equal(isAchromatic('#ffffff'), true)
  assert.equal(isAchromatic('#337ab7'), false)
  assert.equal(isAchromatic('#1c1e54'), false, 'a dark navy is a hue, not black')
  // fijitrips.example, frequency-ranked: Bootstrap's greys, then its primary blue.
  const fijitrips = {
    colors: [
      { hex: '#dddddd', count: 32 },
      { hex: '#337ab7', count: 25 },
      { hex: '#333333', count: 22 },
      { hex: '#3c763d', count: 14 },
      { hex: '#ffffff', count: 150, extreme: true },
      { hex: '#000000', count: 87, extreme: true }
    ]
  }
  assert.equal(topChromatic(fijitrips), '#337ab7')
  assert.equal(
    topChromatic({
      colors: [
        { hex: '#000000', count: 9 },
        { hex: '#444444', count: 3 }
      ]
    }),
    null
  )
})

test('refineBrand on fijitrips: font and accent corrected, name kept, every change is a note', () => {
  const material = {
    title: 'Fiji Trips',
    finalUrl: 'https://fijitrips.example/',
    fonts: [
      { family: 'Glyphicons Halflings', count: 2 },
      { family: 'Poppins', count: 1 }
    ],
    fontFaceFamilies: ['Glyphicons Halflings'],
    colors: [
      { hex: '#dddddd', count: 32 },
      { hex: '#337ab7', count: 25 },
      { hex: '#000000', count: 87, extreme: true }
    ]
  }
  const provisional = brand({
    name: 'Fiji Trips',
    colors: [
      { role: 'background', hex: '#ffffff' },
      { role: 'accent', hex: '#000000' },
      { role: 'accent-secondary', hex: '#337ab7' }
    ],
    typography: {
      display: { family: 'Glyphicons Halflings', fallbacks: [], weights: [400] },
      body: { family: 'Glyphicons Halflings', fallbacks: [], weights: [400] }
    }
  })
  const { brand: out, notes } = refineBrand(provisional, material, 'https://fijitrips.example')
  assert.equal(out.name, 'Fiji Trips')
  assert.equal(out.typography.display.family, 'Poppins')
  assert.equal(out.typography.body.family, 'Poppins')
  assert.equal(out.colors.find((c) => c.role === 'accent').hex, '#337ab7')
  assert.equal(
    out.colors.some((c) => c.role === 'accent-secondary'),
    false,
    'a secondary equal to the new accent is dropped'
  )
  assert.equal(notes.length, 2)
  assert.match(notes[0], /Glyphicons Halflings.*icon or code face.*Poppins/)
  assert.match(notes[1], /#000000 has no hue → #337ab7/)
  assert.equal(provisional.colors[1].hex, '#000000', 'the input is not mutated')
})

test('refineBrand on lucaswp: the sentence title becomes the host; nothing else moves', () => {
  const material = {
    title: 'One desk for every site you run.',
    finalUrl: 'https://lucaswp.tracy.ai/',
    fonts: [{ family: 'Inter', count: 4 }],
    colors: [{ hex: '#0071e3', count: 12 }]
  }
  const { brand: out, notes } = refineBrand(
    brand({ name: 'One desk for every site you run.' }),
    material,
    'https://lucaswp.tracy.ai'
  )
  assert.equal(out.name, 'lucaswp.tracy.ai')
  assert.deepEqual(notes, [
    'name: "One desk for every site you run." → "lucaswp.tracy.ai" (the title is a sentence; using the hostname)'
  ])
})

test('refineBrand on a monochrome site: black stays the accent, and says so', () => {
  const material = {
    title: 'Vercel',
    fonts: [{ family: 'Geist', count: 3 }],
    colors: [
      { hex: '#000000', count: 40, extreme: true },
      { hex: '#666666', count: 5 }
    ]
  }
  const { brand: out, notes } = refineBrand(
    brand({
      name: 'Vercel',
      colors: [{ role: 'accent', hex: '#000000' }],
      typography: { display: { family: 'Geist' }, body: { family: 'Geist' } }
    }),
    material,
    'https://vercel.com'
  )
  assert.equal(out.colors[0].hex, '#000000')
  assert.deepEqual(notes, [
    'accent: #000000 has no hue and the site has no chromatic colour; kept (monochrome brand)'
  ])
})

test('hostOf strips www and lowercases; garbage is null', () => {
  assert.equal(hostOf('https://WWW.Stripe.com/x'), 'stripe.com')
  assert.equal(hostOf('not a url'), null)
})

test('googleFontsUrlFor: the linked stylesheet that names the family, so fonts.ts can self-host it', () => {
  const urls = [
    'https://fonts.googleapis.com/css?family=Poppins&display=swap',
    'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700'
  ]
  assert.equal(googleFontsUrlFor('Poppins', urls), urls[0])
  assert.equal(googleFontsUrlFor('Open Sans', urls), urls[1])
  assert.equal(googleFontsUrlFor('Inter', urls), null)
  assert.equal(googleFontsUrlFor('', urls), null)
  const { brand: out } = refineBrand(
    brand({
      typography: {
        display: { family: 'Poppins', fallbacks: [] },
        body: { family: 'Poppins', fallbacks: [] }
      }
    }),
    { title: 'X', fonts: [{ family: 'Poppins', count: 3 }], googleFontsUrls: urls, colors: [] },
    'https://x.example'
  )
  assert.equal(out.typography.display.googleFontsUrl, urls[0])
  assert.equal(out.typography.body.googleFontsUrl, urls[0])
})

test('guessGoogleFontsUrl: a plain family becomes a css2 request; icon, code, generic and proprietary names never', () => {
  assert.equal(
    guessGoogleFontsUrl('Open Sans'),
    'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap'
  )
  assert.equal(
    guessGoogleFontsUrl('"Poppins"'),
    'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap'
  )
  assert.equal(guessGoogleFontsUrl('Glyphicons Halflings'), null)
  assert.equal(guessGoogleFontsUrl('sans-serif'), null)
  assert.equal(guessGoogleFontsUrl('sohne-var'), null)
  // With no linked stylesheet, refine falls back to the guess.
  const { brand: out } = refineBrand(
    brand({
      typography: {
        display: { family: 'Poppins', fallbacks: [] },
        body: { family: 'Poppins', fallbacks: [] }
      }
    }),
    { title: 'X', fonts: [{ family: 'Poppins', count: 3 }], colors: [] },
    'https://x.example'
  )
  assert.match(out.typography.display.googleFontsUrl, /family=Poppins/)
})

// ─── ja-teline-v.demo.joomlart.com (08/09) ───────────────────────────
// Measured on the live site: `#cc0000` is the brand red — 121 declarations, `a{color}`,
// `.btn-primary`, `.btn-danger`. `#e85555` occurs ONCE, as `--dm-link` inside
// `html[data-theme="dark"]`, and upstream's seed made it the accent: a `css-var:` name matching
// `link` scores +4.5 on its own, while `#cc0000` carries no `css-var:` source at all (its twelve
// recorded sources are all `prop:`, at the cap) and so never clears the 3.2 gate. Frequency is
// never consulted. The headings tell the same story for type: the site sets
// `h1..h6{font-family:"Roboto Slab"}` while Roboto wins the raw declaration count.

const TELINE_COLORS = [
  { hex: '#ff6666', count: 1, sources: ['css-var:--dm-accent-soft selector:html[data-theme="dark"]'] },
  { hex: '#e85555', count: 1, sources: ['css-var:--dm-link selector:html[data-theme="dark"]'] },
  { hex: '#e5e5e5', count: 183, sources: ['prop:border-top selector:hr'] },
  {
    hex: '#cc0000',
    count: 121,
    sources: ['prop:color selector:a', 'prop:background-color selector:.btn-primary']
  },
  { hex: '#333333', count: 81, sources: ['prop:color selector:body'] }
]

const TELINE_CSS = `
h1,h2,h3,h4,h5,h6,.h1,.h2,.h3,.h4,.h5,.h6{font-family:"Roboto Slab",Cambria,Georgia,serif;font-weight:400}
h1,.font-helvetica h2,.font-helvetica h3,.font-helvetica .article-title{font-family:Helvetica,Arial,sans-serif}
body{font-family:Roboto,"Helvetica Neue",Arial,sans-serif}
.item-title{font-family:"Roboto Condensed","Arial Narrow",sans-serif}`

const telineBrand = () => ({
  name: 'Teline V',
  colors: [
    { role: 'background', hex: '#ffffff' },
    { role: 'foreground', hex: '#000000' },
    { role: 'accent', hex: '#e85555' },
    { role: 'accent-secondary', hex: '#cc0000' }
  ],
  typography: { display: { family: 'Roboto' }, body: { family: 'Roboto' } }
})

test('isDarkModeOnly: a colour recorded only inside a dark-theme scope is not the light palette’s brand colour', () => {
  assert.equal(isDarkModeOnly({ sources: ['css-var:--dm-link selector:html[data-theme="dark"]'] }), true)
  assert.equal(isDarkModeOnly({ sources: ['prop:color selector:@media (prefers-color-scheme: dark)'] }), true)
  assert.equal(
    isDarkModeOnly({ sources: ['prop:color selector:a', 'css-var:--x selector:html[data-theme="dark"]'] }),
    false
  )
  assert.equal(isDarkModeOnly({ sources: ['prop:background-color selector:.btn-primary'] }), false)
  assert.equal(isDarkModeOnly({}), false, 'no sources is not evidence of a dark scope')
})

test('headingFont: the family the site sets on h1..h6, not the one that wins the raw count', () => {
  assert.equal(headingFont(TELINE_CSS), 'Roboto Slab')
  // A rule that merely leads with a bare h1 before a themed list is a variant, not the base rule.
  assert.equal(headingFont('h1,.font-x h2,.font-x h3{font-family:Helvetica,sans-serif}'), null)
  assert.equal(headingFont(''), null)
  assert.equal(
    headingFont('h1,h2,h3{font-family:"Font Awesome 5 Free"}'),
    null,
    'an icon face is never the heading face'
  )
})

test('refineBrand on ja-teline-v: a dark-mode-only accent gives way to the brand red, and the headings keep their own face', () => {
  const material = {
    siteName: 'Teline V',
    title: 'Best Joomla News template - Teline V',
    finalUrl: 'https://ja-teline-v.demo.joomlart.com/',
    fonts: [
      { family: 'Roboto', count: 94 },
      { family: 'Roboto Slab', count: 37 }
    ],
    colors: TELINE_COLORS
  }
  const { brand, notes } = refineBrand(telineBrand(), material, 'https://ja-teline-v.demo.joomlart.com/', {
    css: TELINE_CSS
  })
  assert.equal(brand.colors.find((c) => c.role === 'accent').hex, '#cc0000')
  assert.equal(
    brand.colors.find((c) => c.role === 'accent-secondary'),
    undefined,
    'a secondary equal to the new accent says nothing'
  )
  assert.equal(brand.typography.display.family, 'Roboto Slab')
  assert.equal(brand.typography.body.family, 'Roboto', 'the body face is measured separately and was right')
  assert.ok(
    notes.some((n) => /dark/i.test(n) && n.includes('#cc0000')),
    `a change the customer can read: ${JSON.stringify(notes)}`
  )
})

test('refineBrand: topChromatic never answers with a dark-mode-only colour', () => {
  const material = {
    finalUrl: 'https://x.example/',
    colors: [
      { hex: '#00ff88', count: 400, sources: ['css-var:--dm-accent selector:html[data-theme="dark"]'] },
      { hex: '#3355ff', count: 12, sources: ['prop:background-color selector:.btn'] }
    ]
  }
  assert.equal(topChromatic(material), '#3355ff')
  const brand = {
    name: 'X',
    colors: [{ role: 'accent', hex: '#000000' }],
    typography: { display: { family: 'Inter' }, body: { family: 'Inter' } }
  }
  assert.equal(
    refineBrand(brand, material, 'https://x.example/').brand.colors.find((c) => c.role === 'accent').hex,
    '#3355ff'
  )
})

test('refineBrand: a heading rule fixes the display face and still leaves no icon face on the body', () => {
  // joomlart.com, 08/09: `h1..h6{font-family:Inter}` while the raw count crowned "Font Awesome 6
  // Free". Taking the heading rule for display must not strand the icon face on body text.
  const brand = {
    name: 'JoomlArt',
    colors: [{ role: 'accent', hex: '#5e44ff' }],
    typography: { display: { family: 'Font Awesome 6 Free' }, body: { family: 'Font Awesome 6 Free' } }
  }
  const material = {
    finalUrl: 'https://joomlart.com/',
    fonts: [
      { family: 'Font Awesome 6 Free', count: 40 },
      { family: 'Inter', count: 22 }
    ],
    colors: [{ hex: '#5e44ff', count: 30, sources: ['prop:background selector:.btn'] }]
  }
  const { brand: out, notes } = refineBrand(brand, material, 'https://joomlart.com/', {
    css: 'h1,h2,h3,h4,h5,h6{font-family:Inter,sans-serif}'
  })
  assert.equal(out.typography.display.family, 'Inter')
  assert.equal(out.typography.body.family, 'Inter', 'an icon face never survives on the body')
  assert.ok(
    notes.some((n) => /body .*icon or code face/.test(n)),
    JSON.stringify(notes)
  )
})

// ─── the tagline, when the page has no h1 ────────────────────────────
// ja-teline-v.demo.joomlart.com carries ZERO <h1>. The harvester lists headings h1 then h2 then h3,
// upstream takes `headings[0]` as the tagline, and on that page the first <h2> is "Sidebar" — the
// title of the off-canvas module. Every artifact then printed "Sidebar" as its hero.
//
// Same shape as the three faults before it: position taken for meaning.

test('isChromeHeading: furniture is not a tagline, and a real line that merely mentions one is', () => {
  for (const chrome of ['Sidebar', 'Main menu', 'Search', 'Categories', 'Footer', 'Related posts', 'Tags'])
    assert.equal(isChromeHeading(chrome, []), true, chrome)
  for (const real of ['Search less, find more', 'The sidebar that reads your mind', 'Menu for two'])
    assert.equal(isChromeHeading(real, []), false, real)
  // A heading that is one of the site's own nav labels is that nav label, whatever it says.
  assert.equal(isChromeHeading('Magazine', ['Magazine', 'Events']), true)
  // And a bare word is furniture whether or not the nav names it — the phrase rule below covers
  // what the vocabulary and the nav list both miss.
  assert.equal(isChromeHeading('Magazine', []), true)
})

test('taglineFrom: the title segment that is not the name, else the description', () => {
  const m = {
    title: 'Best Joomla News template - Teline V',
    description: 'Best Joomla template for Magazine and News site.'
  }
  assert.equal(taglineFrom(m, 'Teline V'), 'Best Joomla News template')
  assert.equal(taglineFrom({ title: 'Acme', description: 'We bake bread.' }, 'Acme'), 'We bake bread.')
  assert.equal(taglineFrom({ title: 'Acme', description: '' }, 'Acme'), null)
})

test('refineBrand on ja-teline-v: "Sidebar" is furniture, not the brand’s line', () => {
  const brand = {
    name: 'Teline V',
    tagline: 'Sidebar',
    colors: [{ role: 'accent', hex: '#cc0000' }],
    typography: { display: { family: 'Roboto Slab' }, body: { family: 'Roboto' } }
  }
  const material = {
    title: 'Best Joomla News template - Teline V',
    description: 'Best Joomla template for Magazine and News site.',
    navLabels: ['Magazine', 'Events', 'Videos'],
    finalUrl: 'https://ja-teline-v.demo.joomlart.com/',
    colors: [{ hex: '#cc0000', count: 121, sources: ['prop:color selector:a'] }]
  }
  const { brand: out, notes } = refineBrand(brand, material, 'https://ja-teline-v.demo.joomlart.com/')
  assert.equal(out.tagline, 'Best Joomla News template')
  assert.ok(
    notes.some((n) => /tagline/.test(n) && /Sidebar/.test(n)),
    JSON.stringify(notes)
  )
})

test('refineBrand: a real tagline is never touched', () => {
  const brand = {
    name: 'Stripe',
    tagline: 'Financial infrastructure to grow your revenue',
    colors: [{ role: 'accent', hex: '#635bff' }],
    typography: { display: { family: 'sohne' }, body: { family: 'sohne' } }
  }
  const { brand: out, notes } = refineBrand(
    brand,
    { title: 'Stripe', finalUrl: 'https://stripe.com/' },
    'https://stripe.com/'
  )
  assert.equal(out.tagline, 'Financial infrastructure to grow your revenue')
  assert.equal(notes.filter((n) => /tagline/.test(n)).length, 0)
})

// ─── measured across 32 real sites (08/09) ───────────────────────────
// The sweep that answered "does this only fix Teline?" also found two faults of its own.

test('headingFont: a heading rule that names a CSS variable answers nothing — a var() is not a family', () => {
  // ghost.org: `h1..h6{font-family:var(--font-heading)}`. Taking that literally set the display face
  // to the string "var(--font-heading)", which no renderer can resolve and no reader can read.
  assert.equal(headingFont('h1,h2,h3,h4,h5,h6{font-family:var(--font-heading)}'), null)
  assert.equal(headingFont('h1,h2,h3{font-family:var(--x), Georgia, serif}'), 'Georgia')
})

test('headingFont: the LAST heading rule wins, because that is what the cascade does', () => {
  const css = 'h1,h2,h3{font-family:Georgia,serif}\nh1,h2,h3,h4,h5,h6{font-family:"Space Grotesk",sans-serif}'
  assert.equal(headingFont(css), 'Space Grotesk')
})

test('headingFont: a code face is not a heading face, whatever the rule says', () => {
  for (const mono of ['SFMono-Regular', 'ui-monospace', 'Liberation Mono', 'Cascadia Code'])
    assert.equal(headingFont(`h1,h2,h3{font-family:${mono},monospace}`), null, mono)
})

test('isChromeHeading: an empty tagline is nothing to correct, not furniture', () => {
  // drupal.org has no tagline at all. Reporting "cleared" for a value that was already empty is a
  // note about work that did not happen.
  assert.equal(isChromeHeading('', []), false)
  assert.equal(isChromeHeading('   ', []), false)
  const brand = {
    name: 'Drupal',
    tagline: '',
    colors: [{ role: 'accent', hex: '#0678be' }],
    typography: { display: { family: 'Inter' }, body: { family: 'Inter' } }
  }
  const { notes } = refineBrand(
    brand,
    { title: 'Drupal', finalUrl: 'https://drupal.org/' },
    'https://drupal.org/'
  )
  assert.equal(notes.filter((n) => /tagline/.test(n)).length, 0)
})

test('pickFont / headingFont: a build-time constant is not a family', () => {
  // nodejs.org ships `font-family:OPEN_SANS` and `font-family:OPEN_SANS Fallback` — a bundler
  // placeholder that never got substituted. It is a token in someone's code, not type anybody sees,
  // and no font family is written in SCREAMING_SNAKE_CASE. Found 08/09 by the 32-site sweep, after
  // widening the code-face list let it surface behind SFMono-Regular.
  assert.equal(
    pickFont({
      fonts: [
        { family: 'OPEN_SANS', count: 9 },
        { family: 'Inter', count: 4 }
      ]
    }),
    'Inter'
  )
  assert.equal(
    pickFont({
      fonts: [
        { family: 'OPEN_SANS Fallback', count: 9 },
        { family: 'Inter', count: 4 }
      ]
    }),
    'Inter'
  )
  assert.equal(headingFont('h1,h2,h3{font-family:OPEN_SANS, sans-serif}'), null)
  // A real family with capitals and spaces is untouched.
  assert.equal(pickFont({ fonts: [{ family: 'PT Sans', count: 3 }] }), 'PT Sans')
  assert.equal(pickFont({ fonts: [{ family: 'IBM Plex Sans', count: 3 }] }), 'IBM Plex Sans')
})

test('a family torn by the harvest is not a family either', () => {
  // nodejs.org again: `Noto Color Emoji")` — the stack was cut in the wrong place. Real families
  // carry no quotes, brackets or slashes once their surrounding quotes are stripped.
  assert.equal(
    pickFont({
      fonts: [
        { family: 'Noto Color Emoji")', count: 9 },
        { family: 'Inter', count: 1 }
      ]
    }),
    'Inter'
  )
  for (const good of [
    'PT Sans',
    'IBM Plex Sans',
    'Roboto Slab',
    'Helvetica-Bold',
    'Neue Haas Grotesk Display'
  ])
    assert.equal(pickFont({ fonts: [{ family: good, count: 1 }] }), good, good)
})

test('refineBrand: the heading rule does not fire for a difference of capitals alone', () => {
  // nasa.gov declares `h1..h6{font-family:"inter",sans-serif}` while the count crowned `Inter`.
  // Same family, and swapping one spelling for the other changes nothing except to claim in the
  // manifest that something was corrected. Found by the 100-site sweep, 08/09.
  const brand = {
    name: 'NASA',
    colors: [{ role: 'accent', hex: '#1c67e3' }],
    typography: { display: { family: 'Inter' }, body: { family: 'Inter' } }
  }
  const { brand: out, notes } = refineBrand(
    brand,
    { title: 'NASA', finalUrl: 'https://nasa.gov/' },
    'https://nasa.gov/',
    {
      css: 'h1,h2,h3,h4,h5,h6{font-family:"inter",sans-serif}'
    }
  )
  assert.equal(out.typography.display.family, 'Inter')
  assert.equal(notes.filter((n) => /font: display/.test(n)).length, 0)
  // A genuinely different family still moves it.
  const other = refineBrand(
    { name: 'X', colors: [], typography: { display: { family: 'Inter' }, body: { family: 'Inter' } } },
    { title: 'X', finalUrl: 'https://x.example/' },
    'https://x.example/',
    { css: 'h1,h2,h3{font-family:Baskerville,serif}' }
  )
  assert.equal(other.brand.typography.display.family, 'Baskerville')
})

// ─── measured on the 80 brands the lane produced (08/09) ─────────────
// Three shapes of wrong tagline survived the first rule, found by reading production output.

test('decodeText: entities never reach a card — upstream decodes five, a Vietnamese page needs the rest', () => {
  // baochinhphu.vn's tagline arrived as nothing BUT hex entities; ethz.ch carried &uuml;, apache.org
  // &para; and &reg;. Upstream's harvester decodes &amp; &quot; &#39; &#x2F; &#47; and stops.
  assert.equal(decodeText('T&#x1ED5;ng B&#xED; th&#x1B0;'), 'Tổng Bí thư')
  assert.equal(decodeText('ETH Z&uuml;rich: &Uuml;bersicht'), 'ETH Zürich: Übersicht')
  assert.equal(decodeText('Software For The Public Good &para;'), 'Software For The Public Good ¶')
  assert.equal(decodeText('Apache&reg; Software'), 'Apache® Software')
  assert.equal(decodeText('a &amp; b &#8212; c'), 'a & b — c')
  // Unknown names are left alone rather than mangled, and whitespace is collapsed.
  assert.equal(decodeText('  x  &notanentity;  y '), 'x &notanentity; y')
})

test('isChromeHeading: the brand’s own name is not its tagline, and neither is a URL', () => {
  // Twelve of eighty: canada.ca "Canada.ca", debian.org "Debian", harvard.edu "Harvard University",
  // stanford.edu "Stanford University", jenkins.io "Jenkins", aljazeera.com "Al Jazeera"…
  assert.equal(isChromeHeading('Debian', [], 'debian.org'), true)
  assert.equal(isChromeHeading('Harvard University', [], 'Harvard University'), true)
  assert.equal(isChromeHeading('Canada.ca', [], 'Canada.ca'), true)
  assert.equal(isChromeHeading('Al Jazeera', [], 'Al Jazeera'), true)
  // tinhte.vn offered a URL as its tagline.
  assert.equal(isChromeHeading('tinhte.vn/ifa26', [], 'Tinh tế'), true)
  assert.equal(isChromeHeading('https://x.example/a', [], 'X'), true)
  // A tagline that merely starts with the name is a real line and stays.
  assert.equal(isChromeHeading('Debian, the universal operating system', [], 'debian.org'), false)
  assert.equal(isChromeHeading('Web development for the rest of us', [], 'Svelte'), false)
})

test('isChromeHeading: a tagline is a phrase — two words or fewer was furniture every time', () => {
  // Across the eighty brands the lane wrote, every <=2-word line was a label and every real line
  // ran to three or more. Section names, promo buttons, feature bullets — all two words or one.
  for (const label of [
    'Suggested Searches',
    'Common Links',
    'Home page',
    'News',
    'POLITICS',
    'Kinh doanh',
    'Native ZFS',
    'Nhận Voucher'
  ])
    assert.equal(isChromeHeading(label, [], 'X'), true, label)
  for (const real of [
    'Welcome to Cambridge',
    'What is GNU?',
    'WordPress Page Builder',
    'Web development for the rest of us'
  ])
    assert.equal(isChromeHeading(real, [], 'X'), false, real)
})

test('refineBrand: a mojibake tagline is decoded before it is judged', () => {
  const brand = {
    name: 'baochinhphu.vn',
    tagline: 'T&#x1ED5;ng B&#xED; th&#x1B0;, Ch&#x1EE7; t&#x1ECB;ch n&#x1B0;&#x1EDB;c',
    description: 'Apache&reg; tin c&#x1EAD;y',
    colors: [{ role: 'accent', hex: '#c00' }],
    typography: { display: { family: 'Inter' }, body: { family: 'Inter' } }
  }
  const { brand: out } = refineBrand(
    brand,
    { title: 'baochinhphu.vn', finalUrl: 'https://baochinhphu.vn/' },
    'https://baochinhphu.vn/'
  )
  assert.equal(out.tagline, 'Tổng Bí thư, Chủ tịch nước')
  assert.equal(out.description, 'Apache® tin cậy')
})
