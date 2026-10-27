/**
 * ABOUT-3: once the customer gives a name, every place naming the demo company names the customer,
 * kept demo text included (spec `tasks/spec-template-customization-question-readiness.md`, ABOUT-3).
 *
 * The template declares its demo company names (D7, 09/10/2026) as `demoCompanyNames`, and
 * the demo's own name must be among them (`contract-copy.js` says where the list lives):
 * - Joomla: the contract version's `<version>.copy.json`; the demo's names are `$sitename` and
 *   `$fromname` of the webroot's `configuration.php`. Renaming the demo text a site keeps, `keep`
 *   slots included and whether or not the description was given, is Tracy's (D9, `joomla.js`), so
 *   only the list is the template's.
 * - WordPress: the same file; the demo's name is option `blogname`. The customer's name is written
 *   through the contract's name slots (`input: name`, `*.name`, `*.legalName`), so one must exist;
 *   only theme identity tokens are renamed when the description is blank, so a demo name in a
 *   page's text outside every slot is a failure too.
 * - EmDash: `seed/personalize.json` `demoCompanyNames`; the demo's names are `template.config.json`
 *   `site.title` and `mail.fromName`, and each declared name needs a `replace[].find` (the rule
 *   that renames it everywhere).
 */

import { declaredCopy, listOf } from '../../contract-copy.js'
import { tarGzTexts } from '../readers/archives.js'
import { demoDatabase, wordpressPostsOf } from '../readers/demo-database-tables.js'
import { emdashTemplate } from '../readers/emdash-personalize-coverage.js'
import { htmlTextPieces, normalText } from '../readers/joomla-row-text.js'
import {
  contractOf,
  declaredCopyOwner,
  NO_CONTRACT_FIX,
  NO_CONTRACT_OWNER
} from '../readers/quickstart-contract.js'
import { UnreadableContent } from '../readers/release-content.js'
import { counted } from '../readers/rule-findings.js'

/** `$sitename` and `$fromname` of a Joomla webroot's `configuration.php`, or null when the webroot is not carried. */
async function joomlaDemoNames(/** @type {import('../index.js').RuleContext} */ context) {
  const file = context.setting.install?.webroot?.file
  const bytes = file ? await context.source.read(file) : null
  if (!bytes) return null
  const [php] = tarGzTexts(bytes, (n) => /^(\.\/)?configuration\.php$/.test(n)).values()
  if (!php) return null
  const names = []
  for (const key of ['sitename', 'fromname']) {
    const m = new RegExp(`\\$${key}\\s*=\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(php)
    if (m && m[1].trim()) names.push(m[1].replace(/\\'/g, "'"))
  }
  return [...new Set(names)]
}

/**
 * The note when the first declared name is not the name the demo shows (TCH #1013, 13/10/2026). A customer who leaves Name
 * blank keeps the template's name: Tracy writes no site name, and where the words need one it uses the FIRST declared
 * spelling (`withTemplateName`, `brief-engines/shared.js`), so that one should be the demo's own. A note, never a failure:
 * the site's identity is not written either way.
 * @param {string[]} list @param {string | null | undefined} shown
 */
export function standInNote(list, shown) {
  const first = list[0]
  if (!first || !shown || first.trim().toLowerCase() === String(shown).trim().toLowerCase()) return ''
  return `the first demoCompanyNames entry "${first}" is not the name the demo shows ("${shown}"): it is the name the words use where a customer leaves Name blank, so put the demo's own name first`
}

/** Whether a declared list renames `name`: one entry inside it (the replacements match substrings;
 * EmDash's `replace` splits on the exact text, so its case counts). */
const renames = (/** @type {string[]} */ list, /** @type {string} */ name, exactCase = false) =>
  list.some((n) => n && (exactCase ? name.includes(n) : name.toLowerCase().includes(n.toLowerCase())))

/** @param {import('../index.js').RuleContext} context */
async function check(context) {
  const { platform } = context.release
  if (platform === 'emdash') {
    const t = await emdashTemplate(context)
    if (!t?.personalize)
      return {
        status: 'live-only',
        problems: [],
        note: 'the release carries no readable source zip with seed/personalize.json'
      }
    const finds = (t.personalize.replace ?? []).map((r) => String(r.find))
    const list = listOf(t.personalize.demoCompanyNames)
    const demo = [t.config?.site?.title, t.config?.mail?.fromName].filter(Boolean)
    const problems = list.length ? [] : ['seed/personalize.json declares no demoCompanyNames']
    for (const name of demo)
      if (list.length && !renames(list, name, true))
        problems.push(`the demo name "${name}" is not in seed/personalize.json demoCompanyNames`)
    for (const name of list)
      if (!renames(finds, name, true))
        problems.push(`the demo name "${name}" has no seed/personalize.json replace rule renaming it`)
    return {
      status: problems.length ? 'fail' : 'pass',
      problems,
      note: [`declared ${list.length} demo names; demo name ${demo.join(', ')}`, standInNote(list, demo[0])]
        .filter(Boolean)
        .join('; ')
    }
  }
  const contract = contractOf(context)
  if (!contract)
    return {
      status: 'fail',
      problems: ['no content contract seals this release'],
      note: '',
      fix: NO_CONTRACT_FIX,
      owner: NO_CONTRACT_OWNER
    }
  const file = `${contract.id.split('/').pop()}.copy.json`
  const list = listOf(declaredCopy(contract.dir).demoCompanyNames)
  const none = `the contract version's ${file} declares no demoCompanyNames`
  if (platform === 'joomla') {
    if (!list.length) return { status: 'fail', problems: [none], note: '' }
    const demo = await joomlaDemoNames(context)
    if (demo === null)
      return {
        status: 'live-only',
        problems: [],
        note: `${file} declares ${list.length} names; the demo's sitename sits in the webroot's configuration.php, which this copy of the release does not carry`
      }
    const problems = demo
      .filter((n) => !renames(list, n))
      .map((n) => `the demo name "${n}" (configuration.php) is not in ${file} demoCompanyNames`)
    return {
      status: problems.length ? 'fail' : 'pass',
      problems,
      note: [
        `${file} declares ${list.join(', ')}; configuration.php names ${demo.join(', ')}`,
        standInNote(list, demo[0])
      ]
        .filter(Boolean)
        .join('; ')
    }
  }
  const map = contract.json('content-map.json')
  const nameSlots = (map?.slots ?? []).filter(
    (s) => s.input === 'name' || /(?:^|\.)(?:name|legalName)$/.test(String(s.key))
  )
  const db = await demoDatabase(context)
  const blogname = normalText(db.option('blogname'))
  const problems = list.length ? [] : [none]
  if (!nameSlots.length)
    problems.push("the contract has no name slot, so the customer's name has nowhere to go")
  if (list.length && blogname && !renames(list, blogname))
    problems.push(`the demo blogname "${blogname}" is not in ${file} demoCompanyNames (${list.join(', ')})`)
  const names = [...new Set([...list, blogname].filter((n) => n.length >= 3))]
  const samples = (map?.slots ?? []).filter((s) => s.type === 'text').map((s) => normalText(s.sample))
  const loose = []
  for (const entity of (map?.entities ?? []).filter((e) => e.kind === 'page'))
    for (const post of wordpressPostsOf(db, entity).slice(0, 1))
      for (const piece of htmlTextPieces(String(post.post_content).replace(/<!--[\s\S]*?-->/g, ' ')))
        if (
          names.some((n) => piece.includes(n)) &&
          !samples.some((s) => s.includes(piece) || (piece.includes(s) && s.length >= piece.length / 2))
        )
          loose.push(`page ${entity.identity.slug}: "${piece.slice(0, 60)}"`)
  if (loose.length)
    problems.push(
      `${counted(loose.length, 'place outside every slot names', 'places outside every slot name')} the demo company (${loose.slice(0, 5).join('; ')})`
    )
  return {
    status: problems.length ? 'fail' : 'pass',
    problems,
    note: [
      `${file} declares ${list.join(', ') || 'none'}; name slots ${nameSlots.map((s) => s.key).join(', ') || 'none'}; blogname "${blogname}"`,
      standInNote(list, blogname)
    ]
      .filter(Boolean)
      .join('; ')
  }
}

export const about3DemoCompanyName = {
  id: 'ABOUT-3',
  title: 'Every place naming the demo company is renamed to the customer',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name } = context.release
    let out
    try {
      out = await check(context)
    } catch (e) {
      if (!(e instanceof UnreadableContent)) throw e
      return { status: e.status, message: `${name}: ${e.message}.` }
    }
    const live = 'Whether each name is renamed on the built site only a built site shows.'
    const details = out.status === 'live-only' ? [live] : [out.note, live].filter(Boolean)
    if (out.status === 'fail')
      return {
        status: 'fail',
        message: `${name} fails ABOUT-3: ${out.problems.join('; ')}.`,
        // The list lives in the contract version's .copy.json (tch) on Joomla and WordPress, in the theme on EmDash.
        owner: out.owner ?? declaredCopyOwner(context.release.platform),
        fix:
          out.fix ??
          (context.release.platform === 'emdash'
            ? 'Declare every spelling of the demo company name in demoCompanyNames of seed/personalize.json, with a replace rule each, then cut a new release.'
            : "Declare every spelling of the demo company name in demoCompanyNames of the contract version's .copy.json, and put text naming it in a slot or a {site.name} token."),
        details
      }
    return {
      status: out.status,
      message: `${name}: ${out.status === 'pass' ? 'the demo company names are declared and renamed' : out.note}.`,
      details
    }
  }
}
