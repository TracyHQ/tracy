/**
 * STAB-2: no page shows a technical error (spec `tasks/spec-template-customization-question-readiness.md`,
 * STAB-2). Static signals only: a warning PHP prints at run time, or an error that shows only once
 * Tracy writes another value than the sample, only a built site shows.
 *
 * - Joomla: the contract opens no text slot for a machine value: a sample of digits in an ACM field
 *   named like a setting (`id`, `auto_time`, `speed`, `limit`…, `id-article` of JA Podcast), a
 *   JSON sample, or a plugin command (`{jamap …}`, `{loadposition …}`). The template's `error.php`
 *   uses no T3 constant (`T3_TEMPLATE_PATH`) without a `defined()` guard: the 404 page then dies
 *   with a 500 (JA Donate, Rent, Social II 1.0.0).
 * - WordPress: the theme has a 404 template (`templates/404.html`, `404.php`, or a `wp_template`
 *   `404` in the dump).
 * - EmDash: the source has `src/pages/404.astro` and `template.config.json` expects `/404` to
 *   answer 404.
 *
 * PHP files are not linted: this check never runs the template's code.
 */
import { demoDatabase } from '../readers/demo-database-tables.js'
import { emdashTemplate } from '../readers/emdash-personalize-coverage.js'
import { contractOf, NO_CONTRACT_FIX, NO_CONTRACT_OWNER } from '../readers/quickstart-contract.js'
import { UnreadableContent } from '../readers/release-content.js'
import { templateSourceFiles } from '../readers/template-source-files.js'
import { counted } from '../readers/rule-findings.js'

// A setting, never a figure the visitor reads: a real count (`stats-count` 16) or a year
// (`step_time` 2024) must not be reported (spec, STAB-2), so plain `count` and `time` are left out.
const MACHINE_FIELD = /(^|[-_[])(id|ids|auto[-_]?time|speed|interval|limit|delay|position)([-_\]]|$)/i

/** Why a text slot holds a machine value, or null. */
function machineValue(/** @type {any} */ slot) {
  const sample = String(slot.sample ?? '').trim()
  const field = String([...(slot.jsonPath ?? [])].reverse().find((p) => typeof p === 'string') ?? '')
  if (/^\d+$/.test(sample) && MACHINE_FIELD.test(field))
    return `the field ${field} holds the number ${sample}`
  if (/^\{[a-z]+[\s}]/i.test(sample)) return `the sample is the plugin command ${sample.slice(0, 40)}`
  if (/^[[{]/.test(sample))
    try {
      JSON.parse(sample)
      return 'the sample is JSON'
    } catch {
      // Not JSON: words in brackets.
    }
  return null
}

/**
 * @param {import('../index.js').RuleContext} context @param {string[]} problems @param {string[]} open
 * @param {{ slots?: boolean, errorPhp?: boolean }} found which part failed: the contract's slots, the template's error.php
 */
async function joomla(context, problems, open, found = {}) {
  const contract = contractOf(context)
  if (!contract) return void problems.push('no content contract seals this release')
  const machine = []
  for (const slot of contract.json('content-map.json')?.slots ?? [])
    if (slot.type === 'text') {
      const why = machineValue(slot)
      if (why) machine.push(`${slot.key} (${why})`)
    }
  if (machine.length) {
    found.slots = true
    problems.push(
      `${counted(machine.length, 'text slot holds', 'text slots hold')} machine values, which a written word breaks: ${machine.slice(0, 6).join(', ')}${machine.length > 6 ? `, and ${machine.length - 6} more` : ''}`
    )
  }
  const files = await templateSourceFiles(context)
  if (!files) return void open.push('the template files are not carried: error.php is not read')
  const error = files.get('error.php')
  if (error && /\bT3_[A-Z_]+/.test(error) && !/defined\s*\(\s*['"]T3_/.test(error)) {
    found.errorPhp = true
    problems.push(
      'error.php uses a T3 constant with no defined() guard, so a missing page answers 500, not 404'
    )
  }
}

/** @param {import('../index.js').RuleContext} context @param {string[]} problems @param {string[]} open */
async function wordpress(context, problems, open) {
  const db = await demoDatabase(context)
  const inDb = db
    .table('posts')
    .some((p) => p.post_type === 'wp_template' && p.post_name === '404' && p.post_status === 'publish')
  if (inDb) return
  const files = await templateSourceFiles(context)
  if (!files) return void open.push('the theme files are not carried, and the dump holds no 404 template')
  if (!files.has('templates/404.html') && !files.has('404.php'))
    problems.push('the theme has no 404 template (templates/404.html or 404.php)')
}

/** @param {import('../index.js').RuleContext} context @param {string[]} problems @param {string[]} open */
async function emdash(context, problems, open) {
  const t = await emdashTemplate(context)
  if (!t) return void open.push('the release carries no readable source zip')
  if (!t.files.has('src/pages/404.astro')) problems.push('the source has no src/pages/404.astro')
  const expected = t.config?.qa?.expectedStatus?.['/404']
  if (expected !== 404)
    problems.push(`template.config.json expects /404 to answer ${expected ?? 'nothing'}, not 404`)
}

export const stab2TechnicalErrors = {
  id: 'STAB-2',
  title: 'No page shows a technical error',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name, platform } = context.release
    /** @type {string[]} */
    const problems = []
    /** @type {string[]} */
    const open = []
    /** @type {{ slots?: boolean, errorPhp?: boolean }} */
    const found = {}
    try {
      if (platform === 'joomla') await joomla(context, problems, open, found)
      else if (platform === 'wordpress') await wordpress(context, problems, open)
      else await emdash(context, problems, open)
    } catch (e) {
      if (!(e instanceof UnreadableContent)) throw e
      return { status: e.status, message: `${name}: ${e.message}.` }
    }
    const live =
      'Warnings PHP prints at run time, and errors that show only once Tracy writes another value, only a built site shows.'
    // Only the Joomla part reads a contract, so only it can find none.
    const unsealed = platform === 'joomla' && problems.includes('no content contract seals this release')
    if (problems.length)
      return {
        status: 'fail',
        message: `${name} fails STAB-2: ${problems.join('; ')}.`,
        // Only the contract's slots fail: the contract is what changes, no new release.
        ...(unsealed
          ? { owner: NO_CONTRACT_OWNER }
          : found.slots && !found.errorPhp
            ? { owner: 'contract' }
            : {}),
        // Each CMS names only what it has (Joomla: contract slots and error.php; WordPress: the
        // theme's 404 template; EmDash: its 404 page and template.config.json).
        fix: unsealed
          ? NO_CONTRACT_FIX
          : platform === 'joomla'
            ? [
                found.slots
                  ? 'Leave machine values out of the contract slots (re-capture the contract).'
                  : null,
                found.errorPhp
                  ? 'Guard every framework constant in error.php with defined(), then cut a new release.'
                  : null
              ]
                .filter(Boolean)
                .join(' ')
            : platform === 'wordpress'
              ? 'Ship a 404 template in the theme (templates/404.html or 404.php), then cut a new release.'
              : 'Add src/pages/404.astro and make template.config.json expect /404 to answer 404, then cut a new release.',
        details: [...open, live]
      }
    if (open.length)
      return {
        status: 'live-only',
        message: `${name}: nothing failed in what was read; ${open.join('; ')}.`,
        details: [live]
      }
    return {
      status: 'pass',
      message: `${name}: no machine-value slot, and the 404 page is in place.`,
      details: [live]
    }
  }
}
