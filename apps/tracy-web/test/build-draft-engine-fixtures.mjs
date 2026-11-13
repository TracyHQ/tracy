// Shared inputs of the build chat engine tests (#609): an invented racquet club's research brief in the shape a website
// opportunity's revision stores (what `researchOf` reads), the scripted needs profile reading of it, the signed actor
// assertion the dsh gate mints, and the invented club template's kit. Nothing here is a real business or template.
import { createHmac } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { aiQuickstartCatalogue } from '../src/build-draft/ai-quickstarts.js'
import { readConfig } from '../src/config.js'

export const ACTOR_SECRET = 'build-engine-actor-secret'
export const OWNER = 'owner@larkfen-racquets.example'
export const config = readConfig({
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  MCP_TRACY_ACTOR_SECRET: ACTOR_SECRET,
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
})

/** The assertion dsh signs for the person who typed (`lib/actor.js`): sixty seconds. */
export function actor(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })).toString(
    'base64url'
  )
  return `v1.${payload}.${createHmac('sha256', ACTOR_SECRET).update(payload).digest('base64url')}`
}

const SITE = 'https://larkfen-racquets.example/'
const fact = (id, field, value, evidence) => ({
  id,
  field,
  value,
  evidence,
  confidence: evidence.length > 1 ? 'corroborated' : 'single-source',
  onSite: true,
  decidedBy: 'rule',
  reasons: []
})

/** What the research gatherer answers for the invented club: its brief and asset manifest. */
export const gatheredBrief = () => ({
  brief: {
    schemaVersion: 2,
    trade: 'fitness',
    business: { name: 'Larkfen Racquet Club', phone: '+1 555 0177 204' },
    facts: [
      fact('f-name', 'name', 'Larkfen Racquet Club', [
        { source: 'website', ref: SITE, quote: 'Larkfen Racquet Club, courts since 1998' }
      ]),
      fact('f-phone', 'phone', '+1 555 0177 204', [{ source: 'google' }]),
      fact('f-address', 'address', '3 Willowmere Row, Oakfen', [{ source: 'website', ref: SITE }]),
      fact('f-service', 'services', { name: 'Court hire' }, [
        { source: 'website', ref: SITE, quote: 'Court hire from $15 an hour.' }
      ])
    ],
    assets: [],
    sources: [{ kind: 'website' }, { kind: 'google-places' }]
  },
  manifest: []
})

/** The needs profile model's scripted reading of that research. */
export const needsReading = () => ({
  languages: [{ source: 'website', language: 'en' }],
  facts: [],
  items: [
    {
      source: 'website',
      kind: 'service',
      fields: { 'offering.name': 'Court hire' },
      evidence: 'Court hire from $15 an hour.'
    }
  ]
})

// The invented club template's kit, as the catalogue reads it (mapping still pending), plus a stand-in offer list:
// the offer rule itself is the catalogue's own test (`build-draft-kits.test.mjs`).
const WO_FIXTURES = fileURLToPath(
  new URL('../../../packages/wo/website-opportunities/test/fixtures/', import.meta.url)
)
const kitRoot = mkdtempSync(path.join(tmpdir(), 'tracy-engine-kits-'))
const kitDir = path.join(kitRoot, club.template().slug, 'j6', club.template().version)
mkdirSync(kitDir, { recursive: true })
for (const file of ['block-store.json', 'page-recipes.json'])
  cpSync(path.join(WO_FIXTURES, 'plan-composer', file), path.join(kitDir, file))
writeFileSync(path.join(kitDir, 'mapping.pending.json'), JSON.stringify({ ticket: '#1' }))
const catalogue = aiQuickstartCatalogue({ root: kitRoot, library: club.library() })
const { accent: _accent, ...offered } = club.template()
export const kits = {
  loadKit: catalogue.loadKit,
  templatesFor: (trade) =>
    trade === 'fitness'
      ? [
          {
            ...offered,
            picture: 'https://images.example/court.png',
            reason: 'Made for clubs.',
            quickstart: 'released',
            fits: true
          }
        ]
      : [],
  skipped: catalogue.skipped
}
export const KIT_ROOT = kitRoot
