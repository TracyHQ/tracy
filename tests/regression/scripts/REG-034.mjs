/**
 * REG-034: the i18n surfaces (gate pages, mails, controls, catalogues). Runs every step of the case:
 * S1 the six unit suites, S2 the @tracy/ui typecheck, S3 the three language gates (known debt 0 in
 * every language), S4 the phone-sized measurement of the gate's language switch in a real Chrome
 * (needs a Chrome on the CDP endpoint; without one that suite skips, which fails here).
 */
import { checks, nodeTest, run } from './lib.mjs'

const c = checks()
const CDP = process.env.I18N_SURFACES_CDP_URL ?? 'http://127.0.0.1:9222'

// S1
const s1 = nodeTest(
  [
    'vendor/tracy/dsh-passwords/test/tracy/i18n-surfaces.test.ts',
    'apps/tracy-web/test/whitelist-confirmation-i18n.test.mjs',
    'scripts/test/dsh-locale-terms.test.ts',
    'scripts/test/ui-i18n.test.ts',
    'scripts/test/my-sites-i18n.test.ts',
    'scripts/test/i18n-surface-provenance.test.mjs'
  ],
  { extra: ['--import', 'tsx', '--test-timeout=120000'] }
)
c.tapClean('S1', s1)
for (const name of [
  'I1: a browser in any shipped language gets that language, never Chinese',
  'I1: nothing usable falls back to English',
  'I1: q=0, a malformed q and a wildcard are not choices',
  'I1: precedence is unchanged: ?lang, then the cookie, then the dsh setting, then the browser',
  'I1: the lane sign-in page follows the browser in every shipped language',
  'I1: no site key: the lane page still does not exist, in any language',
  'I1: a refusal keeps its status and speaks the reader’s language, with English for what is untranslated',
  'the door writes the mail in the language of the request',
  'a retry in another language sends the payload stored first, unchanged',
  'refusals come before any side effect, whatever language is asked for',
  'no control defaults a label to an English word',
  'Spinner announces the caller’s word',
  'Pagination shows and announces the caller’s words',
  'DialogFooter’s Close button says the caller’s word, and is absent unless asked for',
  'SidebarTrigger and SidebarRail take their name from the caller',
  'Breadcrumb and its ellipsis take their names from the caller',
  'a translation that keeps one term and loses another is a problem',
  'the Vietnamese catalogue that ships keeps every term of its sources',
  'restore.forbiddenBody names the two roles as every other language does',
  'the two reported lines no longer say "seat book" or "your seats"',
  'gateway: every shipped translation is the sentence of the catalogue it names',
  'I1: Traditional Chinese is never answered in Simplified: the next tag decides, or English',
  'I1: the setting is read as YAML structure: only the top-level locale.preference counts'
])
  c.passes('S1', s1, name)

// S2
const s2 = run('pnpm', ['--filter', '@tracy/ui', 'typecheck'])
c.eq('S2 pnpm --filter @tracy/ui typecheck: exit code', s2.status, 0)
if (s2.status !== 0) process.stdout.write(`${s2.stdout}\n${s2.stderr}\n`.slice(-2000))

// S3
const s3 = run('pnpm', [
  'exec',
  'tsx',
  'scripts/check-all.ts',
  '--only',
  'dsh-locale',
  '--only',
  'interface-languages',
  '--only',
  'web-languages'
])
c.eq('S3 language gates: exit code', s3.status, 0)
c.check('S3: "3 gate(s) passed"', s3.stdout.includes('check-all: 3 gate(s) passed'), s3.stdout.slice(-400))
const debt = /known debt (\{[^\n]*\})/.exec(s3.stdout)
const debtValue = debt ? JSON.parse(debt[1]) : null
c.eq(
  'S3: known debt is 0 in every language',
  JSON.stringify(debtValue),
  JSON.stringify({ vi: 0, de: 0, it: 0, fr: 0, nl: 0, zh: 0, es: 0 })
)

// S4
const s4 = nodeTest(['vendor/tracy/dsh-passwords/test/tracy/i18n-mobile.test.ts'], {
  env: { ...process.env, I18N_SURFACES_CDP_URL: CDP },
  extra: ['--import', 'tsx', '--test-timeout=90000']
})
c.tapClean('S4', s4)
for (const page of ['sign-in', 'first-run setup']) {
  for (const size of ['320×568', '375×667'])
    c.passes('S4', s4, `${page} page at ${size}: all eight languages are inside the card and can be tapped`)
  c.passes('S4', s4, `${page} page taller than the screen scrolls to both of its ends`)
}
c.passes('S4', s4, 'I1: the measurement sees the old layout: one clipped, absolutely positioned row')
c.done()
