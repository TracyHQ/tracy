import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { injectedMessage } from './todos.mjs'
import { hasPendingBrief, JOB_FILE } from './build.mjs'

/**
 * How the agent writes the customer's words in when the build handed that over. Each CMS has its
 * own door: EmDash sites publish an MCP server (`tracy_emdash`); a Joomla or WordPress template
 * with no content contract is reached through the Claude Cowork plugin (`tracy_site`), one entity at a
 * time.
 * @param {string} platform
 */
function personalizeRoad(platform) {
  if (platform === 'joomla')
    return 'Write them in with tracy_site: `content.list {kind:"article"|"module"|"menuItem"}` to find what the home and the routed pages show, `content.get {kind, id}` to read an entry, then `content.update {apply_id, kind, id, fields}` for only what an answer gives — the demo stays where no answer replaces it. Verify each page you changed on the live site.'
  if (platform === 'wordpress')
    return 'Write them in with tracy_site: `content.list` to find the pages and posts the home and the menu show, `content.get {kind, id}` to read one, then `content.update {apply_id, kind, id, fields}` for only what an answer gives (`kind:"option", key:"blogname"` for the site title) — the demo stays where no answer replaces it. Verify each page you changed on the live site.'
  // 🔒 One write per entry: `content_update` with `status:"published"` changes AND publishes, so the
  // old "read the entry, change only what an answer gives, publish it" cost a separate
  // `content_publish` per entry (r2: 33 of them, 8 refused on a slug id).
  return 'Load the emdash-site skill and write them in with tracy_emdash — for each entry one content_update with only the fields an answer gives and status "published".'
}

/**
 * Enqueue a settled build on its owner's next turn. The acknowledgement survives a plugin
 * reload; unavailable agents leave it pending for the next job poll. Delivery is at least once:
 * a process crash between dsh's durable enqueue and our acknowledgement may repeat the event.
 * @param {string} root
 * @param {import('./build.mjs').Job} job
 * @param {{getAgent: (id: string) => {followup?: (message: unknown) => void} | undefined,
 * plugin: string, warn?: (message: string) => void}} deps
 */
export function notifyBuild(root, job, { getAgent, plugin, warn = () => {} }) {
  // A paused job is still under way: it resumes by itself once a deploy has passed (#295).
  if (
    !job.ownerSessionId ||
    job.status === 'running' ||
    job.status === 'paused' ||
    hasPendingBrief(root, job)
  )
    return false
  const agent = getAgent(job.ownerSessionId)
  if (!agent?.followup) return false
  const eventId = `${job.job}:${job.runs}:${job.status}`
  const file = path.join(
    root,
    'docs',
    'agents',
    'build',
    'notifications',
    `${encodeURIComponent(eventId)}.json`
  )
  try {
    const ack = JSON.parse(readFileSync(file, 'utf8'))
    if (ack.eventId === eventId && ack.sessionId === job.ownerSessionId) return false
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
      warn(`Could not read build notification acknowledgement: ${String(error)}`)
      return false
    }
  }
  const construction = job.stages.find(
    (stage) => stage.status === 'waiting' && stage.detail?.startsWith('template-build:')
  )
  /**
   * 🔒 A STAGE THAT HANDED ITS WORK OVER IS AN INSTRUCTION, NOT A RESULT TO READ ALOUD. EmDash
   * templates packed by the template skill carry no `personalize.mjs`, so the build cannot put
   * the customer's answers in by itself and says so with this code. Without this branch the
   * agent gets the generic "tell the customer the result" line and does exactly that — measured
   * 19/09 on a `tracy-saas` site: the customer had answered the questionnaire, and the answer
   * they got back was that the template has no tool for it. The work is reachable from the chat
   * (`tracy_emdash`), so the notification says whose turn it is.
   */
  const personalizeByAgent = job.stages.find(
    (stage) => stage.status === 'skipped' && stage.code === 'PERSONALIZE_BY_AGENT'
  )
  const answerNames = Object.keys(job.answers ?? {}).join(', ')
  const message = injectedMessage(
    `Build event ${eventId} from ${plugin}, not a new customer request. ` +
      `Target: ${job.targetSiteKey ?? 'unknown'}. Status: ${job.status}. ` +
      `${job.targetUrl ? `Website: ${job.targetUrl}. ` : ''}` +
      `Stages: ${job.stages.map((s) => `${s.name}: ${s.status}${s.detail ? ` (${s.detail})` : ''}`).join('; ')}. ` +
      (construction
        ? `Continue the authorized template build now. Read ${construction.detail?.slice('template-build:'.length)} and load the joomlart-t4-template skill. Base is only restored; do not report the design as complete. Work in the target site's workspace, preserving site isolation. `
        : personalizeByAgent
          ? `${job.platform === 'emdash' ? 'This template ships no personalize tool' : 'This template carries no content contract'}, so putting the customer's own words into the site is your work now, in this turn — it is not a limitation to report and not a question to ask again. Their answers are already given: ${JOB_FILE} holds them under \`answers\`${answerNames ? ` (${answerNames})` : ''}. ${personalizeRoad(job.platform)} Leave out every claim the customer did not give (counts, years, certifications, clients); empty beats invented. Then say in one line what changed. `
          : 'Tell the customer the result briefly and help with their next request. Do not start another build. ') +
      'If a form or Retry question is already displayed, do not duplicate it in chat.',
    plugin
  )
  try {
    agent.followup({ ...message, id: eventId })
    mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify({ eventId, sessionId: job.ownerSessionId }), { mode: 0o600 })
    renameSync(temporary, file)
    return true
  } catch (error) {
    warn(`Build notification remains pending: ${String(error)}`)
    return false
  }
}
