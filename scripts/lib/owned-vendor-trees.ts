/**
 * The `vendor/` trees Tracy owns, and how the language gate reads them.
 *
 * WHY. `vendor/` is "others' code" (BOUNDARY RULE #5), so the gate used to skip all of it — but several
 * trees there are Tracy's: forks we edit under `-tracy.N`, templates we derived, skills we wrote whose
 * home is another repo. They ship in the public tree like `packages/` does, and Vietnamese prose reached
 * the public repo through exactly them. Third-party trees stay out: their text is data, not ours to fix.
 *
 * WHAT IS READ, per owned tree: JS/TS strings and code comments (the `packages/` rules), plus every line
 * of Markdown, which in a skill or a fork's ledger IS the surface an outsider reads. The test is
 * Vietnamese letters only, not "any letter outside a-z": these trees carry upstream text in Chinese,
 * French or Russian that is legitimately theirs. Escapes: a span in quotes or backticks on one line
 * (as for comments), or `language-allow` on the line or the line above (as in `scripts/`).
 */
import { commentLines, hasCommentReader, quotedSpansRemoved } from './comment-language.ts'

export interface OwnedVendorTree {
  /** Repository-relative folder, no trailing slash. */
  path: string
  /** Why Tracy owns it. */
  why: string
  /** Paths inside it left out, each pattern tested against the path relative to the tree. */
  exempt?: Array<{ pattern: RegExp; why: string }>
}

const BUILT_BUNDLE = { pattern: /^lib\/client\.js(?:\.map)?$/, why: 'built bundle; its source is scanned' }

/** One row per owned tree. Adding a tree here is how a new fork or skill comes under the rule. */
export const OWNED_VENDOR_TREES: readonly OwnedVendorTree[] = [
  {
    path: 'vendor/tracy/dsh-passwords',
    why: 'fork Tracy edits (-tracy.N); the sign-in gate of every surface'
  },
  {
    path: 'vendor/tracy/dsh-better-sidebar',
    why: "fork Tracy edits (-tracy.N); carries Tracy's side card and comment features",
    exempt: [{ pattern: /^src\/client\/locales-[a-z-]+\.ts$/i, why: 'interface translations (i18n data)' }]
  },
  {
    path: 'vendor/tracy/dsh-better-locale',
    why: 'fork Tracy edits (-tracy.N)',
    exempt: [
      { pattern: /^src\/client\/dictionaries\//, why: 'interface translations (i18n data)' },
      { pattern: /^TRANSLATION\.md$/, why: 'table generated from the dictionaries (i18n data)' },
      BUILT_BUNDLE
    ]
  },
  {
    path: 'vendor/tracy/dsh-locale-vi',
    why: 'fork Tracy edits (-tracy.N); a Vietnamese language pack, so only its tools are prose',
    exempt: [
      { pattern: /^(?:locales|baseline|docs)\//, why: 'the translation itself and its glossary (i18n data)' },
      { pattern: /^README\.md$/, why: "the pack's own Vietnamese readme (i18n data)" },
      BUILT_BUNDLE
    ]
  },
  {
    path: 'vendor/tracy/dsh-subscriptions',
    why: 'fork Tracy edits (-tracy.N); hand-written lib/, no build'
  },
  {
    path: 'vendor/tracy/od-brand-engine',
    why: 'fork Tracy edits (-tracy.N); Tracy changes in src/engine'
  },
  {
    path: 'vendor/tracy/od-design-system',
    why: "Tracy's packaging (catalog, slots, scripts) around OpenDesign data",
    exempt: [
      {
        pattern: /^(?:systems|packages)\//,
        why: "OpenDesign systems copied verbatim; DESIGN-vi.md is upstream's own translation"
      }
    ]
  },
  {
    path: 'vendor/emdash/emdash-theme-bravada',
    why: "fork Tracy edits (-tracy.N); root of Tracy's EmDash templates"
  },
  {
    path: 'vendor/emdash/emdash-theme-tracy-coral',
    why: "Tracy's EmDash template derived from bravada"
  },
  {
    path: 'vendor/emdash/emdash-theme-tracy-editorial',
    why: "Tracy's EmDash template derived from bravada"
  },
  {
    path: 'vendor/emdash/tracy-emdash-skill',
    why: "Tracy's EmDash site-building skill (home: JoomlArt-Products/tracy-emdash-template)"
  },
  {
    path: 'vendor/joomla/joomlart-t4-skill',
    why: "JoomlArt's T4 site-building skill (home: JoomlArt-Products/tracy-joomla-template)"
  },
  {
    path: 'vendor/wordpress/tracy-wordpress-theme',
    why: "Tracy's WordPress site-building skill (home: JoomlArt-Products/tracy-wordpress-theme)"
  }
]

/** Letters only Vietnamese uses: a-breve, d-stroke, o-horn, u-horn, i/u-tilde, and the Latin Extended Additional block U+1EA0–U+1EF9. */
export const VIETNAMESE_LETTER =
  /[\u0103\u0102\u0111\u0110\u01A1\u01A0\u01B0\u01AF\u0129\u0128\u0169\u0168\u1EA0-\u1EF9]/u

const JS_STRINGS = /\.(?:[cm]?[jt]s|[jt]sx)$/
const MARKDOWN = /\.mdx?$/
/** Built output, dependencies and tests: strings there are not judged, as in `packages/`. */
const NEVER = /(?:^|\/)(?:node_modules|dist|storybook-static|\.turbo|\.astro)\//
const TEST_PATH = /(?:^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/
const FIXTURES = /(?:^|\/)(?:__)?fixtures(?:__)?\//
/** Translation data in any owned tree, as `packages/locale` and `i18n/` folders are in `packages/`. */
const I18N = /(?:^|\/)(?:locales?|i18n)\//

/** The owned tree a path lies in and the path inside it, or null. */
export function ownedVendorPath(rel: string): { tree: OwnedVendorTree; inner: string } | null {
  const tree = OWNED_VENDOR_TREES.find((t) => rel.startsWith(`${t.path}/`))
  if (tree === undefined) return null
  const inner = rel.slice(tree.path.length + 1)
  if (NEVER.test(inner) || FIXTURES.test(inner) || I18N.test(inner)) return null
  if (tree.exempt?.some((e) => e.pattern.test(inner))) return null
  if (!MARKDOWN.test(inner) && !hasCommentReader(inner)) return null
  return { tree, inner }
}

export interface VendorHit {
  line: number
  letter: string
  text: string
  /** `string`, `comment` or `prose` (Markdown). */
  kind: 'string' | 'comment' | 'prose'
}

/** The language's name written in itself, as every language picker shows it (pass one allows it too). */
const AUTONYM = /Ti\u1EBFng Vi\u1EC7t/gu

const marked = (lines: string[], line: number): boolean =>
  /language-allow/.test(lines[line - 1] ?? '') || /language-allow/.test(lines[line - 2] ?? '')

/**
 * Vietnamese in an owned vendor file.
 * @param strings the JS/TS string and JSX-text pieces of the file (`check-language` parses them), 1-based lines
 */
export function vendorLanguageHits(
  rel: string,
  src: string,
  strings: Array<{ line: number; text: string }> = []
): VendorHit[] {
  const at = ownedVendorPath(rel)
  if (at === null || !VIETNAMESE_LETTER.test(src)) return []
  const lines = src.split('\n')
  const hits: VendorHit[] = []
  const judge = (line: number, text: string, kind: VendorHit['kind'], quoted: boolean) => {
    const found = VIETNAMESE_LETTER.exec((quoted ? quotedSpansRemoved(text) : text).replace(AUTONYM, ''))
    if (found !== null && !marked(lines, line)) hits.push({ line, letter: found[0], text: text.trim(), kind })
  }
  if (MARKDOWN.test(at.inner)) {
    lines.forEach((text, index) => judge(index + 1, text, 'prose', true))
    return hits
  }
  if (JS_STRINGS.test(at.inner) && !TEST_PATH.test(at.inner)) {
    for (const piece of strings) judge(piece.line, piece.text, 'string', false)
  }
  for (const { line, text } of commentLines(rel, src)) judge(line, text, 'comment', true)
  return hits
}
