/**
 * REG-PR-1163-own-domain-dns-only: the footer of the Own domain card, right after the checked-at line, says that a
 * Cloudflare customer keeps the CNAME DNS only (grey cloud); the CNAME row label stays the short wording. Runs the
 * string assertions of tracy-site-tabs and the component assertions of the card footer.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const r = nodeTest(['packages/site/tracy-site-tabs/test/own-domain-dns-only.test.mjs'])
c.tapClean('S1', r, { pass: 8, tests: 8 })
// The English footer and record rows are held to the content rule the translations are (12/10/2026: the
// literal pins of the English sentences and the operator-doc grep were dropped as unable to fail).
c.passes(
  'S1',
  r,
  'English: the footer carries the DNS only hint with its placeholders; no record row carries it',
  1,
  true
)
for (const lang of ['vi', 'de', 'it', 'fr', 'nl', 'zh', 'es'])
  c.passes('S1', r, `${lang}: routing label restored, the footer carries the hint`, 1)

// S3: the card draws the hint as its own line directly after checked-at (also unchecked), and not on a
// domain that is gone (unsupported, lapsed).
const d = nodeTest(['packages/core/tracy-core/test/site-publish-dom.test.mjs'])
// The whole suite must be green, not only the named tests: any failure in the card's states reads red.
c.tapClean('S3', d)
for (const prefix of [
  'each record says what to create and what the last lookup found there',
  'Connect domain: the Owner of a site with no domain of its own opens a form for one',
  'a bare domain reserved before it was refused: the card says why it can never connect',
  'a name under a suffix the server cannot tell is a registered one',
  'a pending domain says until when it holds its name',
  '#1037 slice 2: a record the certificate asks for is drawn after the two Tracy names'
])
  c.passes('S3', d, prefix, 1)
c.done()
