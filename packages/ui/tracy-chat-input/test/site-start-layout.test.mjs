import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CSS } from '../src/client/styles.ts'

test('site first screen shares the creation column query and centres only before a message', () => {
  assert.match(
    CSS,
    /\[class\*="_body"\]:has\(> \[data-conversation-scroll\]\):has\(\[data-tracy-start="site"\]\) \{ container: tracy-onboarding-column \/ inline-size; \}/
  )
  const wide = CSS.slice(CSS.indexOf('@container tracy-onboarding-column (width > 674px)'))
  assert.ok(wide.startsWith('@container tracy-onboarding-column (width > 674px)'))
  assert.match(wide, /composerHero[^\n]*:not\(:has\(\[data-tracy-sent\]\)\)/)
  assert.match(wide, /justify-content: safe center/)
  assert.match(wide, /flex: none; padding: 0/)
  assert.match(CSS, /@container tracy-onboarding-column \(max-width: 674px\)/)
})

test('the creation first screen on a wide column has the site order: heading, cards, composer (Akemi 23/10/2026)', () => {
  // The compact start block (title, line, cards in one column) is the same at every width.
  const before = CSS.slice(0, CSS.indexOf('@container tracy-onboarding-column (max-width: 674px)'))
  assert.doesNotMatch(before, /@container tracy-onboarding-hero \(max-width: 660px\)/)
  const wide = CSS.slice(CSS.indexOf('@container tracy-onboarding-column (width > 674px)'))
  const fresh = ':not(:has([data-tracy-help-conversation]))'
  const hero = wide.slice(wide.indexOf(`[class*="composerHero"]:has([data-tracy-start="1"])${fresh} {`))
  assert.ok(hero.length < wide.length, 'a wide creation hero rule that leaves conversation mode alone')
  const heroRule = hero.slice(0, hero.indexOf('}'))
  assert.match(heroRule, /justify-content: safe center; gap: 22px; padding-block: 24px;/)
  assert.match(heroRule, /flex: 1 0 auto/, 'the hero fills the column like the site hero')
  assert.match(wide, /\.tv-dock\[data-tracy-start="1"\] \{\s*flex: none; padding: 0;/)
  // No suggestion chips on /new/ (Akemi 23/10/2026): the composer follows the cards at the hero gap.
  assert.doesNotMatch(CSS, /tv-onboarding-chips/)
})

test('wide creation first screen and the site lay the start cards in one centred row', () => {
  const wide = CSS.slice(CSS.indexOf('@container tracy-onboarding-column (width > 674px)'))
  const creation =
    'html[data-tracy-scope="onboarding"] [class*="composerHero"]:not(:has([data-tracy-help-conversation])) .tv-dock[data-tracy-start="1"]'
  const at = wide.indexOf(`${creation} .tv-start-cards,`)
  assert.notEqual(at, -1, 'a row rule for the creation cards on a wide column')
  const row = wide.slice(at, wide.indexOf('}', at))
  assert.match(
    row,
    /flex-direction: row; flex-wrap: wrap; justify-content: center; max-width: none; width: auto;/
  )
  assert.match(wide, /\.tv-start-cards \.tv-start-card \{ flex: none; width: auto; \}/)
  // The site's first screen shares the same row (Akemi 23/10/2026), wrapping when four cards do not fit.
  assert.match(wide, /\.tv-dock\[data-tracy-start="site"\] \.tv-start-cards \{/)
  assert.match(row, /flex-wrap: wrap;/)
  assert.match(wide, /\.tv-dock\[data-tracy-start="site"\] \.tv-start \{ max-width: none; \}/)
})

test('both first screens draw the Tracy mark inline before the title, sized in em (Akemi 23/10/2026)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  assert.equal(src.match(/<StartTitle text=/g)?.length, 2, 'creation and site screens share one title')
  assert.doesNotMatch(src, /className="tv-start-mark"/)
  const title = readFileSync(new URL('../src/client/start-title.tsx', import.meta.url), 'utf8')
  assert.match(
    title,
    /<span className="tv-start-title-lead">\s*<TracyMark className="tv-start-title-mark" \/>/
  )
  assert.match(CSS, /\.tv-start-title-lead \{ white-space: nowrap; \}/)
  assert.match(
    CSS,
    /\.tv-start-title-mark \{ display: inline-block; width: 0\.96em; height: 0\.96em; margin-right: 0\.3em; vertical-align: -0\.13em;/
  )
  assert.doesNotMatch(CSS, /\.tv-start-mark \{ display: none; \}/)
})

test('the stacked start cards grow to their longest label instead of cutting it (24/10/2026)', () => {
  // German "Mit einem Template starten" was cut to "Mit einem Template s..." in a fixed 200px stack.
  assert.match(
    CSS,
    /& \.tv-start-cards \{ gap: 9px; width: fit-content; min-width: min\(200px, 100%\); max-width: 100%;/
  )
  assert.match(CSS, /& \.tv-start-card-title \{ white-space: normal; overflow-wrap: anywhere; \}/)
  assert.match(CSS, /& \.tv-start-card \{ height: auto; min-height: 41px;/)
  assert.doesNotMatch(CSS, /\.tv-start-cards \{ max-width: 280px; \}/)
  assert.doesNotMatch(CSS, /flex-direction: column; flex-wrap: nowrap; width: 100%; margin-inline: 0;/)
})
