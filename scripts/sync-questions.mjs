/**
 * Put every questionnaire where its readers look, from the one file a person edits.
 *
 *   node scripts/sync-questions.mjs
 *
 * A set is authored in exactly one place — a Build plugin's `questions.json`, or a template's
 * `seed/questions.json` — and read in two more: the mirror the `tracy-web` image carries, and the
 * catalogue entry the fleet reads. `check-questions` refuses any drift between them, which is
 * right, but a gate that only refuses leaves a person copying JSON by hand. This copies it.
 *
 * ⚠ A TEMPLATE'S SET REACHES A SERVER THROUGH ITS RELEASE, not through this file (ADR 0017):
 * `tracy_site_question.json` on the release is what `/ops` and the create door read. The catalogue
 * copy below is for the fleet scripts that still read it, and goes when they do.
 *
 * Nothing here decides anything: it reads the authored file and writes the same bytes onward. The
 * gate is still the authority — run it after.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHIPPED_LANGUAGES } from './shipped-languages.mjs'
import { joomlaContractLanguageOptions, joomlaLanguageOptions } from './joomla-language-options.mjs'
import { emdashStandardLanguageOptions, wordpressLanguageOptions } from './wordpress-language-options.mjs'
import { EMDASH_TEMPLATES, emdashLanguageOptions } from './emdash-language-options.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLATFORMS = ['wordpress', 'joomla', 'emdash']
const QUICKSTARTS = 'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
/** The copy `apps/tracy-web` serves from; `check-design-templates` compares it to the master byte for byte. */
const MIRROR = 'apps/tracy-web/src/quickstarts.json'
/** A quickstart whose template lives in this repo: catalogue entry ← the template's own file. */
const PACKAGED = { 'tracy-business/emdash': 'packages/cms/tracy-emdash-theme-business/seed/questions.json' }

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const write = (rel, text) => {
  const at = join(ROOT, rel)
  let now = null
  try {
    now = readFileSync(at, 'utf8')
  } catch {
    // A mirror that does not exist yet is written, not an error: the list below is the source.
  }
  if (now === text) return false
  writeFileSync(at, text)
  return true
}

let changed = 0
// 0. The languages a questionnaire must cover, for the process that cannot import `packages/`.
if (write('apps/tracy-web/src/questions/languages.json', `${JSON.stringify(SHIPPED_LANGUAGES, null, 2)}\n`)) {
  changed += 1
  process.stdout.write('apps/tracy-web/src/questions/languages.json ← @tracy/core/interface-languages\n')
}
// 1. Each CMS default set → the mirror the image serves.
// 0b. The languages a Joomla build offers — the pack catalog, spelled the way the questionnaire
// spells an option (lowercase, `en-gb` … `zh-tw`). Written INTO the package's own questions.json so
// the form, the seeder and the capabilities gate all read one fact. Before 21/09/2026 this list said
// `["en", "fr"]` by hand while the catalog pinned 52 packs.
{
  const source = 'packages/site/tracy-site-build-joomla/questions.json'
  const doc = JSON.parse(read(source))
  const q = doc.questions.find((x) => x.kind === 'languages' || x.id === 'languages')
  if (q) {
    q.options = joomlaLanguageOptions()
    // The box names every language through Intl.DisplayNames; a hand-written label table for
    // 52 languages × 21 interface languages is the copied fact this script exists to remove.
    delete q.optionLabels
    if (write(source, `${JSON.stringify(doc, null, 2)}\n`)) {
      changed += 1
      process.stdout.write(`${source} ← language-packs.json (${q.options.length} languages)\n`)
    }
  }
}

// 0b-wp. The same fact for WordPress, from `tracy-seeder/src/wordpress-language-packs.json`. The
// spelling is Joomla's (lowercase BCP-47), so the product offers one list whichever CMS is under
// it; `wpLocaleFor` turns a tag into `pt_BR` at the one edge that talks to WordPress. Before
// 22/09/2026 this list said `["en"]` by hand while WordPress shipped 49 of the languages Tracy
// already offered on Joomla.
{
  const source = 'packages/site/tracy-site-build-wordpress/questions.json'
  const doc = JSON.parse(read(source))
  const q = doc.questions.find((x) => x.kind === 'languages' || x.id === 'languages')
  if (q) {
    q.options = wordpressLanguageOptions()
    // Same reason as 0b: the box names every language through Intl.DisplayNames, so a hand-written
    // label table for 49 languages x 21 interface languages is the copied fact this script removes.
    delete q.optionLabels
    if (write(source, `${JSON.stringify(doc, null, 2)}\n`)) {
      changed += 1
      process.stdout.write(`${source} <- wordpress language-packs.json (${q.options.length} languages)\n`)
    }
  }
}

// 0b-emdash. The EmDash DEFAULT set offers the same cleaned list as WordPress (O5, 07/10/2026);
// the EmDash engine folds each tag to the template's own locale at its edge.
{
  const source = 'packages/site/tracy-site-build-emdash/questions.json'
  const doc = JSON.parse(read(source))
  const q = doc.questions.find((x) => x.kind === 'languages' || x.id === 'languages')
  if (q) {
    q.options = emdashStandardLanguageOptions()
    delete q.optionLabels
    if (write(source, `${JSON.stringify(doc, null, 2)}\n`)) {
      changed += 1
      process.stdout.write(`${source} <- the WordPress language list (${q.options.length} languages)\n`)
    }
  }
}

// 0d. The languages an EmDash template offers — the locales it ships (`template.config.json`),
// written into the template's own `seed/questions.json`, which its release publishes as
// `tracy_site_question.json`. Before 23/09/2026 Tracy Business listed its 40 locales and 40 × 21
// language names by hand. Runs before 0c, which derives the Joomla contract from that same file.
for (const dir of EMDASH_TEMPLATES) {
  const source = `${dir}/seed/questions.json`
  const doc = JSON.parse(read(source))
  const q = doc.questions.find((x) => x.kind === 'languages' || x.id === 'languages')
  if (!q) continue
  q.options = emdashLanguageOptions(join(ROOT, dir))
  // Same reason as 0b: the box names every language through Intl.DisplayNames, and the chat line
  // must stay English (`languageName` in tracy-site-build-core), so the label table goes.
  delete q.optionLabels
  if (write(source, `${JSON.stringify(doc, null, 2)}\n`)) {
    changed += 1
    process.stdout.write(`${source} <- ${dir}/template.config.json (${q.options.length} languages)\n`)
  }
}

// 0c. ja-business asks the SAME four questions whichever CMS is under it — the customer's company,
// their sector, their address, their language — because they are questions about the business, not
// about the platform. Only the language OPTIONS differ: Joomla installs a language PACK, so it
// offers pack tags (`vi-vn`), while EmDash takes a plain code (`vi`).
//
// 🔒 DERIVED, BECAUSE THE ALTERNATIVE IS A SECOND COPY OF THE PRODUCT'S OWN QUESTIONS. Measured
// 21/09/2026: of the six Tracy releases in `joomlart-products`, exactly ONE carries a questionnaire —
// `tracy-business/emdash-0.x`. The Joomla cut of the same product ships none, so Tracy serves its
// generic five instead and the questions ja-business was built around never reach the customer.
// The EmDash seed is where those questions are authored today; writing them out again by hand for
// Joomla is how the two cuts of one product start asking different things.
//
// ⚠ THE EMDASH SEED IS THE AUTHOR ONLY BECAUSE IT IS THE ONE THAT EXISTS. It is not a neutral home
// for a product-level questionnaire, and the day a third cut appears (`tracy-business/wp7` has no
// release at all yet) that is the thing to fix — one authored set, three platform spellings.
const BUSINESS_SOURCE = 'packages/cms/tracy-emdash-theme-business/seed/questions.json'
/** Contract profiles that take ja-business's questions, each with its own owner and spelling. */
const BUSINESS_CONTRACTS = [
  'packages/cms/tracy-joomla-quickstart/contracts/tracy-business/j6/1.1.0/questions.json',
  'packages/cms/tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.0/questions.json',
  'packages/cms/tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.1/questions.json',
  'packages/cms/tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.2/questions.json'
]
for (const target of BUSINESS_CONTRACTS) {
  const doc = JSON.parse(read(BUSINESS_SOURCE))
  // `contracts/<id>/<major>/<ver>/questions.json` — `check-questions` requires `<id>/<major>`.
  const parts = target.split('/')
  doc.owner = `${parts[parts.length - 4]}/${parts[parts.length - 3]}`
  const q = doc.questions.find((x) => x.kind === 'languages' || x.id === 'languages')
  if (q) {
    // What this contract's archive ships, not every pack there is (see joomlaContractLanguageOptions).
    q.options = joomlaContractLanguageOptions(dirname(join(ROOT, target)))
    // Same reason as 0b: 52 languages × 21 interface languages is the copy this script removes.
    delete q.optionLabels
  }
  if (write(target, `${JSON.stringify(doc, null, 2)}\n`)) {
    changed += 1
    process.stdout.write(`${target} ← ${BUSINESS_SOURCE} + language-packs.json\n`)
  }
}

for (const cms of PLATFORMS) {
  const source = `packages/site/tracy-site-build-${cms}/questions.json`
  if (write(`apps/tracy-web/src/questions/${cms}.json`, read(source))) {
    changed += 1
    process.stdout.write(`apps/tracy-web/src/questions/${cms}.json ← ${source}\n`)
  }
}

// 2. Each packaged template's set → its catalogue entry, then the catalogue mirror.
const catalogue = JSON.parse(read(QUICKSTARTS))
for (const [id, source] of Object.entries(PACKAGED)) {
  if (!catalogue[id]) {
    process.stderr.write(`sync-questions: ${QUICKSTARTS} has no entry ${id}\n`)
    process.exit(1)
  }
  catalogue[id].questions = JSON.parse(read(source))
}
const text = `${JSON.stringify(catalogue, null, 2)}\n`
// 🔒 BOTH COPIES, OR NEITHER — the mirror is what `check-design-templates` compares BYTES against.
//
// This loop has always had one element, which is the same as not being a loop: the master moved and
// `apps/tracy-web/src/quickstarts.json` stayed where it was. The two are read by three runtimes
// that cannot import each other (CLAUDE.md §6), so the copy is deliberate — but a sync that
// updates one of a deliberate pair is how the pair stops being one.
//
// Measured 20/09/2026: this script rewrote the master (its `JSON.stringify` writes literal UTF-8
// where the file on disk held `\uXXXX` escapes, so the bytes differ even when nothing changed),
// left the mirror alone, and `check-design-templates` went red in CI on a PR that had not touched
// the catalogue's content at all.
for (const rel of [QUICKSTARTS, MIRROR])
  if (write(rel, text)) {
    changed += 1
    process.stdout.write(`${rel} ← ${Object.values(PACKAGED).join(', ')}\n`)
  }

process.stdout.write(
  changed === 0
    ? 'sync-questions: everything already matches its source.\n'
    : `sync-questions: ${String(changed)} file(s) updated — run \`npx tsx scripts/check-questions.ts\`.\n`
)
