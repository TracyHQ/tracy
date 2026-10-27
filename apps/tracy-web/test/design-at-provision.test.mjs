// The design record a provisioned template site is given at the create door (ADR 0023, plan
// tasks/plan-wo-design-follows-template.md). Measured 19/10/2026 on stand wo2: three demo sites built through
// `POST /api/sites` had no `site_design` row and no `docs/agents/design.json`, so their agents were told
// "none bound" while the template (Tracy Base) is bound to Apple.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { provisionDesignRecord } from '../src/sites/design-at-provision.js'

const APPLE = { '--bg': '#ffffff', '--fg': '#1d1d1f', '--accent': '#0071e3' }
const deps = {
  tokensFor: (id) => (id === 'apple' ? { ...APPLE } : null),
  nameFor: (id) => (id === 'apple' ? 'Apple' : null)
}

test('a catalogue system on WordPress or Joomla: the catalogue tokens are the ruler, frozen at provision', () => {
  const out = provisionDesignRecord(
    { platform: 'joomla', templateDesign: { id: 'apple', source: 'catalog' } },
    deps
  )
  assert.deepEqual(out, {
    record: {
      id: 'apple',
      source: 'catalog',
      name: 'Apple',
      platform: 'joomla',
      tokens: APPLE,
      tokensFrom: 'tracy-web:design-tokens.json'
    }
  })
})

test('a catalogue system on EmDash: the name is bound, the tokens are read from the site later, never the catalogue map', () => {
  // Tracy Base EmDash declares 118 custom properties of its own (`src/styles/tokens.css`); the Apple map
  // holds 56 under other names. Recording the map would hand the design check the wrong ruler (council 19/10).
  const out = provisionDesignRecord(
    { platform: 'emdash', templateDesign: { id: 'apple', source: 'catalog' } },
    deps
  )
  assert.deepEqual(out, {
    record: {
      id: 'apple',
      source: 'catalog',
      name: 'Apple',
      platform: 'emdash',
      tokens: null,
      tokensFrom: null
    }
  })
})

test('a quickstart look carries its own tokens, read off the release that declared it', () => {
  const biz = {
    id: 'tracy-business',
    source: 'quickstart',
    name: 'Tracy Business',
    tokensFrom: 'packages/cms/tracy-wordpress-theme/overlays/wp-tracy-business/tokens.css',
    tokens: { '--bg': '#ffffff', '--surface': '#ffffff' }
  }
  const out = provisionDesignRecord({ platform: 'wordpress', templateDesign: biz }, deps)
  assert.deepEqual(out, {
    record: {
      id: 'tracy-business',
      source: 'quickstart',
      name: 'Tracy Business',
      platform: 'wordpress',
      tokens: { '--bg': '#ffffff', '--surface': '#ffffff' },
      tokensFrom: biz.tokensFrom
    }
  })
})

test('a template that wears none, or whose look could not be resolved, writes nothing and says why', () => {
  assert.deepEqual(provisionDesignRecord({ platform: 'wordpress', templateDesign: null }, deps), {
    record: null,
    skipped: 'TEMPLATE_WEARS_NONE'
  })
  // A catalogue id the map does not know: half a design is no design (never a guessed ruler).
  assert.deepEqual(
    provisionDesignRecord(
      { platform: 'wordpress', templateDesign: { id: 'nobody', source: 'catalog' } },
      deps
    ),
    { record: null, skipped: 'DESIGN_UNRESOLVED' }
  )
})

// ── the write: once per site, never over a later record ──────────────────────────────────────────
import { freshPool } from './_db.mjs'
import { readSiteDesign, writeSiteDesign, writeSiteDesignIfAbsent } from '../src/lib/site-design.js'

const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

test(
  'writeSiteDesignIfAbsent writes the first record and leaves a later one alone (a late provision retry never overwrites a Build or a Design system press)',
  dbOpts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      await pool.query("insert into site (site_key, label, host) values ('opal.localhost', 'opal', 'local')")
      const apple = {
        id: 'apple',
        source: 'catalog',
        name: 'Apple',
        platform: 'joomla',
        tokens: APPLE,
        tokensFrom: 'tracy-web:design-tokens.json'
      }
      assert.deepEqual(await writeSiteDesignIfAbsent(pool, 'opal.localhost', apple, 'provision:b1'), {
        written: true
      })
      assert.equal((await readSiteDesign(pool, 'opal.localhost')).design.id, 'apple')

      // The Design system door (or the plugin Build) wrote since: the retry's record must not win.
      await writeSiteDesign(
        pool,
        'opal.localhost',
        { ...apple, id: 'brutalism', name: 'Brutalism' },
        'apply:abc'
      )
      assert.deepEqual(await writeSiteDesignIfAbsent(pool, 'opal.localhost', apple, 'provision:b1'), {
        written: false
      })
      const after = await readSiteDesign(pool, 'opal.localhost')
      assert.equal(after.design.id, 'brutalism')
    } finally {
      await close()
    }
  }
)
