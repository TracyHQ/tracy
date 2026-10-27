/**
 * Gate for the Vietnamese translation of TRACY'S OWN namespaces (`packages/locale/tracy-locale-vi`).
 *
 * SCOPE NARROWED (settled 2026-08-30). This package used to mirror 30 of dsh's own namespaces and
 * the gate compared `vi/` against `en/` — an extract from dsh. Now dsh's namespaces are translated by
 * the community (`dsh-locale-vi`, the package that also OWNS the `vi` language), and Tracy keeps only
 * its own. So `en/` and `extract-dsh-en.mjs` were dropped: the source of truth for a Tracy namespace is
 * the `en` copy in the **plugin that owns** it, and this gate imports that module directly.
 *
 * WHY THE GATE IS STILL NEEDED. The failures below are all **silent** — the string still shows, just wrong:
 *   1. Missing key → at runtime it falls back to English in the middle of a Vietnamese UI, unreported.
 *   2. `{placeholder}` mismatch → drop one and the string loses a name/number; invent one and the
 *      user reads a literal `{name}`.
 *   3. Still verbatim English → looks exactly like "not translated", and cannot be told apart by eye
 *      from a string kept on purpose (a term).
 *      The term list is `terms.ts`.
 *   4. A term of `terms.ts` translated away (since #797): the source says "file" and the `vi`
 *      value writes "tệp". Every term present in the source must survive, not "one is enough".
 *
 * The DECISION part of these four checks lives in `lib/dsh-locale-terms.ts` so a test can call it.
 *
 * The `en` source exists in ONE place (the plugin's `strings.ts`), so changing a source string makes
 * the gate demand a retranslation — nobody has to remember.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { checkedCount, namespaceProblems } from './lib/dsh-locale-terms.ts'
import { OWNED } from './lib/tracy-owned-namespaces.ts'

const ROOT = resolve(import.meta.dirname, '..')
const PLUGIN = join(ROOT, 'packages/locale/tracy-locale-vi')

/** A package declaring ownership of a namespace. */
interface Owner {
  /** Package path, relative to the repo root. */
  readonly pkg: string
  /** The namespace it declares. */
  readonly ns: string
}

/**
 * Reads `export const NS = '...'` from every package's `src/client/strings.ts`.
 *
 * Read with a regex, not imported: importing every `strings.ts` to find which packages have `NS` is
 * circular — the gate would need the list in advance to write the `import`, and that list is exactly
 * what is being discovered.
 * @returns Every (package, namespace) pair found on disk.
 */
function ownersOnDisk(): Owner[] {
  const out: Owner[] = []
  const packages = join(ROOT, 'packages')
  for (const group of readdirSync(packages)) {
    let dirs: string[]
    try {
      dirs = readdirSync(join(packages, group))
    } catch {
      continue
    }
    for (const name of dirs) {
      const strings = join(packages, group, name, 'src/client/strings.ts')
      let text: string
      try {
        text = readFileSync(strings, 'utf8')
      } catch {
        continue
      }
      const found = /^export const NS = '([^']+)'/m.exec(text)
      if (found !== null) out.push({ pkg: `packages/${group}/${name}`, ns: found[1] })
    }
  }
  return out
}

/**
 * Strings allowed to EQUAL the English source verbatim, with the reason.
 *
 * Each entry is a decision. Adding one means writing why — otherwise the gate becomes a place to
 * look the other way.
 */
const KEPT_VERBATIM = new Set<string>([
  // "Email" — Vietnamese borrows this word as is, and so does every translation around it.
  //
  // "Thư điện tử" is right by the dictionary and wrong for users: nobody types it, no other label on
  // the screen uses it, and one over-translated label next to ten untranslated ones reads as a bug,
  // not as care. Same kind of decision as "Full access" below.
  'tracy-my-sites.account.email',
  // Role names (Viewer, Editor, Owner) are NOT kept: ADR 0028 §7 translates them, everyday words a
  // customer must understand at once. They used to be listed here as the seat book's vocabulary.
  // "CMS" — the column over Joomla / WordPress / EmDash (30/09). Vietnamese site owners say "CMS"
  // too; "Hệ quản trị nội dung" is a dictionary phrase nobody types, and too long for a column.
  'tracy-my-sites.column.cms',
  // Two example addresses; there is nothing in them to translate.
  'tracy-site-tabs.wizard.emailsPlaceholder',
  // A size in megabytes, `{n} MB`: Vietnamese writes the same unit symbol, so there is nothing left
  // to translate (the number itself is formatted for the interface language in code).
  'tracy-site-tabs.backup.download.size',
  // A Chat row's title is the person's own request between quotation marks, and Vietnamese uses
  // the same curly marks as English, so there is nothing left to translate.
  'tracy-site-tabs.event.requestTitle',
  // A changed record named by its title alone (`@tracy/core/turn-undo` `targetText`, council D1,
  // 20/10/2026): the title between the same curly marks, with no kind word left to translate.
  'tracy-chat-input.undo.named.any',
  'tracy-site-tabs.undo.named.any',
  // "Agent" is the untranslated term (vocabulary §6); the face beside it says the rest.
  'tracy-site-tabs.actor.agent',
  // "Full access" — kept in English ON PURPOSE, to match `dsh-locale-vi`.
  //
  // The community translates dsh's namespaces and leaves this word as is: their `access.confirm.enable`
  // is "Bật Full access". Tracy's permission menu sits right next to that dialog in the same composer,
  // so translating it as "Toàn quyền" would give one concept two names on the same screen —
  // worse than keeping the English in both places.
  //
  // For the same reason `permission.title` changed from "Mức quyền" to "Chế độ truy cập" to match
  // their `input.accessMode`. That one is translatable, so it does not belong in this list.
  //
  // This follows from the boundary settled 2026-08-30: dsh's namespaces are the community's, so the
  // vocabulary follows theirs. If Tracy ever translates dsh's namespaces itself, remove this entry.
  'tracy-chat-input.permission.fullAccess',

  // "SEO/GEO" is the name of a ROLE (`config/mode-matrix.json`'s `roles[].id: 'seo-geo'`), not a
  // description — the same acronym pair appears in the generated `preset.yml`
  // (`name: SEO/GEO for WordPress`) and in the preset id itself. Translating "SEO" or "GEO" into
  // Vietnamese invents a second name for the same role that the real preset does not use.
  'tracy-mode-picker.role.seo-geo',

  // "Aa": the font sample a design system card draws in the system's own font. Latin letters on
  // purpose: many catalogue fonts have no Vietnamese glyphs, and "Ăă" would show a fallback font
  // instead of the system's own, which is the one thing the sample is for.
  'tracy-add-site.ds_swatch',
  'tracy-design-inspiration.ds.swatch',
  // "{use}": a font name and nothing else; there is no word to translate.
  'tracy-design-inspiration.ds.font.same',
  // Website Opportunities: strings made only of placeholders, digits and symbols ("{score}/100",
  // "© {year}", "{label} {points}", "{depth} · {filters}"), and the column named after the product
  // whose reviews it shows (Google). Nothing in them is a word to translate.
  'tracy-website-opportunities.find.advancedSummary',
  'tracy-website-opportunities.score.line',
  'tracy-website-opportunities.score.outOf',
  'tracy-website-opportunities.cell.website.score',
  'tracy-website-opportunities.cell.website.note.copyright',
  'tracy-website-opportunities.columns.google',
  // Review source product names are kept verbatim, like the Google column.
  'tracy-website-opportunities.cell.reviews.google',
  'tracy-website-opportunities.cell.reviews.tripadvisor',
  // The Media row: "Media" and "Logo" are the words Vietnamese web people say as they are, "PDF" is a file format, and the
  // size note is only a placeholder pair and "px".
  'tracy-website-opportunities.media.title',
  'tracy-website-opportunities.media.logo',
  'tracy-website-opportunities.media.file.pdf',
  'tracy-website-opportunities.media.logo.sizeNote',
  // The detail's PageSpeed line labels its metrics by their acronyms, as PageSpeed itself does:
  // "SEO", "HTTPS" and "LCP" (Largest Contentful Paint) are what Vietnamese web people say and search.
  'tracy-website-opportunities.detail.site.seo',
  'tracy-website-opportunities.detail.site.https',
  'tracy-website-opportunities.detail.site.lcp',
  // The Build form's CMS field (#1640): "CMS" is the acronym Vietnamese web people say, as the brief's own
  // "Dựng bằng {cms}" already writes it.
  'tracy-website-opportunities.build.cms',
  // Industry names of the design system catalogue that Vietnamese uses as they are: SaaS, AI,
  // Fintech, Crypto are the words Vietnamese tech people say, and "Agency" is how Vietnamese web
  // businesses name themselves (the same "Fintech & crypto" as `category-fintech-crypto`).
  'tracy-add-site.ds_industry_saas',
  'tracy-add-site.ds_industry_agency',
  'tracy-add-site.ds_industry_ai',
  'tracy-add-site.ds_industry_fintech',
  'tracy-add-site.ds_industry_crypto',
  'tracy-design-inspiration.ds.industry_saas',
  'tracy-design-inspiration.ds.industry_agency',
  'tracy-design-inspiration.ds.industry_ai',
  'tracy-design-inspiration.ds.industry_fintech',
  'tracy-design-inspiration.ds.industry_crypto'
])

type Dict = Record<string, string>

const vi = new Map<string, Dict>()
const unreadable: string[] = []
for (const file of readdirSync(join(PLUGIN, 'vi')).sort()) {
  if (!file.endsWith('.json')) continue
  // A catalogue that does not parse is a problem with a file name, not a stack trace.
  try {
    vi.set(file.slice(0, -'.json'.length), JSON.parse(readFileSync(join(PLUGIN, 'vi', file), 'utf8')))
  } catch (error) {
    unreadable.push(`  vi/${file}: unreadable JSON — ${(error as Error).message}`)
  }
}

const problems: string[] = [...unreadable]
let checked = 0

// Every namespace in `vi/` must have an owner declared in OWNED.
for (const ns of vi.keys()) {
  if (!(ns in OWNED)) {
    problems.push(`  ${ns}: has a translation but no plugin declares ownership of this namespace`)
  }
}

// ...AND THE OTHER DIRECTION. The check above only sees namespaces that already have a file in `vi/`,
// so a package that OWNS a namespace nobody added to OWNED is fully invisible — it ships English in
// the middle of a Vietnamese UI and no gate knows. That is exactly what happened to `tracy-settings`:
// it lived like that from its creation until 30/08/2026.
//
// The source of truth is `export const NS` in the package's `strings.ts` — where `en` lives, so the
// two cannot drift. A package declaring NS in another file slips through, which is why
// `naming-conventions.md` §4 fixes where it is declared.
for (const owner of ownersOnDisk()) {
  if (!(owner.ns in OWNED)) {
    problems.push(
      `  ${owner.ns}: package ${owner.pkg} declares this namespace but OWNED lacks it —` +
        ` add a line to OWNED and a file vi/${owner.ns}.json`
    )
  }
}

for (const [ns, source] of Object.entries(OWNED)) {
  const translated = vi.get(ns)
  if (!translated) {
    problems.push(`  ${ns}: no translation yet (vi/${ns}.json)`)
    continue
  }

  // What counts as a problem lives in `lib/dsh-locale-terms.ts`, where a test can call it. The
  // term rule there is "every keep-verbatim term of the source survives" (#797): until then the
  // gate only looked at terms when a value equalled its source, so 128 strings translated a term
  // away ("tệp", "phiên", "website") and the gate stayed green.
  problems.push(...namespaceProblems(ns, source, translated, KEPT_VERBATIM))
  checked += checkedCount(source, translated)
}

if (problems.length > 0) {
  console.error(`Tracy translation gate: ${problems.length} problem(s)\n`)
  console.error(problems.join('\n'))
  console.error(
    `\n  The \`en\` source is in the owning plugin's \`strings.ts\` — change it there, then retranslate;\n` +
      `  do not edit \`vi/*.json\` to match a source that changed.`
  )
  process.exit(1)
}

console.log(`Tracy translation gate: ${Object.keys(OWNED).length} namespaces, ${checked} strings, clean.`)
