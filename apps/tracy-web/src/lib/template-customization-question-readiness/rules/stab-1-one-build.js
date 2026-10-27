/**
 * STAB-1: one press builds the site, and every answer has a place on it (spec
 * `tasks/spec-template-customization-question-readiness.md`, STAB-1). Static half only: the
 * profile, contract, pinned plugin and release fit each other, version for version.
 * Joomla and WordPress: (1) a contract cut for EXACTLY this version (no nearer lower one), whose
 * parts' sha256 are the release's; (2) captured from this release: every entity is in the dump,
 * every slot sample is in its column (Joomla), the WordPress inventory names this dump; (3) the
 * Claude Cowork plugin a new site gets (`lib/cowork-install.js`: the pin that wins, the release's
 * own zip, or the fleet's latest and floor) carries the contract, and its maps and the files they read
 * byte for byte, judged on evidence read from the plugin's own bytes before the check
 * (`readers/cowork-plugin-contracts.js`; missing or different files are the plugin's to fix, and
 * evidence that could not be read leaves the rule `not-checked`, never a pass); (4) a brand-profile row for this
 * exact version; (5) a multilingual demo ships its language files; (7) the name and logo questions
 * have a receiver (a name slot on WordPress, `logos` in the profile); (8) a carried webroot archive
 * holds files at 0644/0755 and directories at 0755, since provision keeps the modes it unpacks
 * (`readers/webroot-modes.js`; a failure there is the release's archive to re-cut).
 * EmDash: (6) the source carries `tools/personalize.mjs`, `seed/personalize.json` and
 * `seed/questions.json`, the release `tracy_site_question.json`, and (4) the profile row.
 * The description, language and page questions are ABOUT-1, LANG-5 and REL-2. */
import { joomlaEntityRows, sampleIsInRow } from '../readers/contract-against-dump.js'
import { demoDatabase, wordpressPostsOf } from '../readers/demo-database-tables.js'
import { pluginCarriesContract } from '../readers/cowork-plugin-contracts.js'
import { emdashTemplate } from '../readers/emdash-personalize-coverage.js'
import { contractOf } from '../readers/quickstart-contract.js'
import { PROFILE_ROW_FIX } from '../readers/brand-profile.js'
import { UnreadableContent } from '../readers/release-content.js'
import { templateProfileOf } from '../../template-profiles.js'
import { counted } from '../readers/rule-findings.js'
import { webrootModeProblem, webrootModes } from '../readers/webroot-modes.js'

/** (4) and the logo half of (7). */
function profileProblems(
  /** @type {import('../index.js').RuleContext} */ context,
  /** @type {string[]} */ problems
) {
  const { tag, version } = context.release
  const row = templateProfileOf(tag, version)
  if (!row || row.fallbackFrom)
    problems.push(
      `template-profiles.json has no row for ${tag} ${version}${row ? ` (only ${row.version})` : ''}`
    )
  else if (!row.logos)
    problems.push(`the profile row of ${tag} ${version} says no logo layout, so the logo answer has no place`)
}

/** (1) for Joomla and WordPress. */
function contractProblems(
  /** @type {import('../index.js').RuleContext} */ context,
  contract,
  /** @type {string[]} */ problems
) {
  const manifest = contract.json('manifest.json')
  for (const [part, asset] of Object.entries(context.setting.install ?? {})) {
    const sealed = manifest?.quickstart?.parts?.[part]?.sha256
    if (sealed && sealed !== /** @type {any} */ (asset).sha256)
      problems.push(`the contract seals another ${part} (sha256 ${sealed.slice(0, 12)}…)`)
  }
}

/** (8): the webroot archive's member modes, when the release carries one and this copy has it. */
async function archiveProblems(
  /** @type {import('../index.js').RuleContext} */ context,
  /** @type {string[]} */ archive,
  /** @type {string[]} */ notes
) {
  const file = context.setting.install?.webroot?.file
  if (!file) return
  const bytes = await context.source.read(file)
  if (!bytes) return void notes.push(`${file} is not carried here: its file modes are not checked`)
  const problem = webrootModeProblem(file, webrootModes(bytes))
  if (problem) archive.push(problem)
}

/** (2), (5) and the name half of (7), against the dump. */
async function dumpProblems(
  /** @type {import('../index.js').RuleContext} */ context,
  contract,
  /** @type {string[]} */ problems
) {
  const db = await demoDatabase(context)
  const map = contract.json('content-map.json')
  if (context.release.platform === 'joomla') {
    const { rows, problems: missing } = joomlaEntityRows(db, map)
    problems.push(...missing)
    const off = (map?.slots ?? []).filter((s) => rows.has(s.entity) && !sampleIsInRow(rows.get(s.entity), s))
    if (off.length)
      problems.push(
        `${counted(off.length, 'slot sample is', 'slot samples are')} not in their column of the dump (${off
          .slice(0, 5)
          .map((s) => s.key)
          .join(', ')})`
      )
    const languages = db.table('languages').filter((l) => String(l.published) === '1').length
    if (languages > 1 && !contract.has('multilingual-map.json'))
      problems.push(`the demo publishes ${languages} languages and the contract has no multilingual-map.json`)
    return
  }
  const inventory = contract.json('inventory.json')
  const database = context.setting.install?.database
  if (inventory?.provenance?.database?.sha256 && inventory.provenance.database.sha256 !== database?.sha256)
    problems.push('inventory.json was captured from another database than this release ships')
  for (const e of map?.entities ?? []) {
    // The site identity option is created on the first write (`siteIdentity` slots, 1.2.0): absent is fine.
    const created = (map.slots ?? []).some((s) => s.entity === e.key && s.siteIdentity)
    if (e.kind === 'option' && !created && db.option(e.identity.name) === undefined)
      problems.push(`the option ${e.identity.name} is not in the dump`)
    if ((e.kind === 'page' || e.kind === 'syncedPattern') && !wordpressPostsOf(db, e).length)
      problems.push(`the ${e.kind} ${e.identity.slug} is not in the dump`)
    if (
      e.kind === 'themeMod' &&
      !String(db.option(`theme_mods_${e.identity.theme}`) ?? '').includes(`"${e.identity.name}"`)
    )
      problems.push(`the theme mod ${e.identity.name} of ${e.identity.theme} is not in the dump`)
  }
  const content = new Map(
    (map?.entities ?? [])
      .filter((e) => e.kind === 'page')
      .map((e) => [e.key, String(wordpressPostsOf(db, e)[0]?.post_content ?? '')])
  )
  const lost = (map?.slots ?? []).filter(
    (s) =>
      s.target?.block &&
      content.has(s.entity) &&
      !content.get(s.entity).includes(`"name":"${s.target.block}"`)
  )
  if (lost.length)
    problems.push(
      `${counted(lost.length, 'slot targets', 'slots target')} a block the page does not have (${lost
        .slice(0, 5)
        .map((s) => s.key)
        .join(', ')})`
    )
  if (/polylang/.test(String(db.option('active_plugins') ?? '')) && !contract.has('editions.json'))
    problems.push('Polylang is active and the contract has no editions.json')
  if (!(map?.slots ?? []).some((s) => s.input === 'name' || s.key === 'site.name'))
    problems.push('no slot takes the name answer (input "name" or site.name)')
}

/** (6) for EmDash. */
async function emdashProblems(
  /** @type {import('../index.js').RuleContext} */ context,
  /** @type {string[]} */ problems
) {
  if (!(await context.source.names()).includes('tracy_site_question.json'))
    problems.push('the release carries no tracy_site_question.json')
  const t = await emdashTemplate(context)
  if (!t) throw new UnreadableContent('the release carries no readable source zip', 'live-only')
  for (const file of ['tools/personalize.mjs', 'seed/personalize.json', 'seed/questions.json'])
    if (!t.files.has(file)) problems.push(`the source has no ${file}`)
  if (
    t.personalize &&
    !(t.personalize.identity ?? []).some((r) => /\{name\}|\{NAME\}/.test(JSON.stringify(r.value ?? ''))) &&
    !t.personalize.settings?.title
  )
    problems.push('no personalize rule writes the name answer')
}

export const stab1OneBuild = {
  id: 'STAB-1',
  title: 'One press builds the site, and every answer has a place on it',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('contract'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name, platform, version } = context.release
    /** @type {string[]} */
    const problems = []
    /** What the profile row lacks: Tracy's to fix in template-profiles.json, not the contract's. */
    /** @type {string[]} */
    const profile = []
    /** What the plugin the release installs lacks: the plugin's to fix, not the contract's. */
    /** @type {string[]} */
    const pluginProblems = []
    /** What the webroot archive gets wrong: the release's to re-cut. */
    /** @type {string[]} */
    const archive = []
    /** @type {string[]} */
    const notes = []
    /** Why the plugin half could not be judged, when it could not. */
    let unchecked = /** @type {string | null} */ (null)
    try {
      profileProblems(context, profile)
      if (platform === 'emdash') await emdashProblems(context, problems)
      else {
        await archiveProblems(context, archive, notes)
        const contract = contractOf(context)
        if (!contract || !contract.exact)
          problems.push(
            contract
              ? `no contract is cut for ${version}; a site would get ${contract.id}`
              : 'no content contract seals this release'
          )
        if (contract) {
          const plugin = pluginCarriesContract(context, contract)
          if (plugin.state === 'lacks') pluginProblems.push(...plugin.problems, plugin.note)
          else if (plugin.state === 'not-checked') unchecked = plugin.note
          else notes.push(plugin.note)
        }
        if (contract?.exact) {
          contractProblems(context, contract, problems)
          await dumpProblems(context, contract, problems)
        }
      }
    } catch (e) {
      if (!(e instanceof UnreadableContent)) throw e
      return {
        status: e.status,
        message: `${name}: ${e.message}.`,
        details: [...archive, ...profile, ...problems, ...pluginProblems, ...notes]
      }
    }
    const live = 'Whether every answer then shows on the site only a built site tells.'
    const all = [...archive, ...profile, ...problems, ...pluginProblems]
    const pluginFix =
      'The plugin release must carry this contract: ship a Claude Cowork release that holds it, and install that one.'
    // Each part names its own fix; the owner is whoever has the most to do: the contract, else
    // the webroot archive (the template maker's pack), else the profile row, else the plugin.
    const fixes = [
      archive.length
        ? 'Re-cut the webroot archive as the next version with every file 0644 and every directory 0755 (pack from a site restored under the normal umask, never inside umask 077), then cut its contract.'
        : null,
      problems.length ? 'Capture the contract from this very release and ship the plugin carrying it.' : null,
      profile.length ? PROFILE_ROW_FIX : null,
      pluginProblems.length ? pluginFix : null
    ].filter(Boolean)
    if (all.length)
      return {
        status: 'fail',
        message: `${name} fails STAB-1: ${all.slice(0, 5).join('; ')}${all.length > 5 ? `; and ${all.length - 5} more` : ''}.`,
        ...(problems.length
          ? {}
          : {
              owner: /** @type {const} */ (archive.length ? 'template' : profile.length ? 'tracy' : 'plugin')
            }),
        fix: fixes.join(' '),
        details: [...all, ...(unchecked ? [unchecked] : []), ...notes, live]
      }
    // Only full evidence passes: a plugin nobody could read is not a plugin that fits.
    if (unchecked)
      return {
        status: 'not-checked',
        message: `${name}: the contract and profile fit this release, but ${unchecked}.`,
        fix: 'Check again once the plugin can be read; Publish waits until it is.',
        details: [unchecked, ...notes, live]
      }
    return {
      status: 'pass',
      message: `${name}: the contract, profile and the plugin a new site gets fit this release.`,
      details: [...notes, live]
    }
  }
}
