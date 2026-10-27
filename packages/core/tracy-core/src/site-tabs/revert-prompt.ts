/**
 * "Ask Tracy to revert" (plan `tasks/todo-ask-tracy-to-revert.md`; Brian 02/10 ~22:5x: chip +
 * auto-send): the message a Site changes row SENDS to the conversation on screen, asking the agent to
 * put back ONE recorded change, with every reference the record holds.
 *
 * TWO PARTS, ONE MESSAGE ({@link revertMessageOf}). A sentence the person reads ("Revert “…” — only
 * this change.", in their language), then one fenced `tracy-revert` block holding the machine part
 * ({@link revertPromptOf}). The block is folded into a chip in the chat by dsh's user-text folds
 * (`tracy-site-tabs` registers {@link REVERT_FENCE}) — presentation only: the wire text, block
 * included, is what the model receives, the same way a Browser-tab comment's `tracy-element` block
 * travels (`tracy-chat-input` `comment-turn.mjs`).
 *
 * 🔒 THE PROMPT IS A REQUEST, NOT A PROMISE. Undo (files of one commit) is deterministic; this is
 * best-effort work by the agent. So the message names exactly what was recorded, where the earlier
 * values may still be kept on this CMS, the scope ("only this list"), and — in bold, always — that
 * a value it cannot find is ASKED for, never guessed; and a value it suggests while asking must come
 * from a recorded transition that ends at what the site holds now (stale suggestion, wave 22:2x).
 *
 * The block is English on purpose, whatever the reader's language: it is the product's own words to
 * the agent, like the rest of Tracy's prompts.
 *
 * Pure: no React, no runtime imports — `test/revert-prompt.test.mjs` loads it through Node's type
 * stripping.
 */
import type { ActivityEffectGroup, ActivityEffectResource, ActivityItemV2 } from './api'

/** The fence of the machine part: dsh folds it into the chip (`tracy-site-tabs` registers it). */
export const REVERT_FENCE = 'tracy-revert'

const CMS_NAME: Record<string, string> = { wordpress: 'WordPress', joomla: 'Joomla', emdash: 'EmDash' }

/**
 * Where an earlier value may still be kept, per platform — said as places to look, never as a
 * promise that they hold it. A platform this list does not know gets the generic line.
 */
const OLD_VALUES: Record<string, string[]> = {
  wordpress: [
    'Content: the post or page revisions (Revisions), and the Trash for anything deleted.',
    'Settings (options, theme settings, plugins): WordPress keeps no history of earlier values.'
  ],
  joomla: [
    'Content: the item’s Versions (com_contenthistory), and the Trash for anything trashed.',
    'Settings (global configuration, extensions, templates): Joomla keeps no history of earlier values.'
  ],
  emdash: [
    'Content: the entry’s revisions, if this EmDash site keeps them.',
    'EmDash keeps no file history, and its admin log does not record menus, settings or media.'
  ]
}

const OPS: Record<string, string> = {
  create: 'created',
  update: 'updated',
  batch: 'updated',
  edit: 'updated',
  delete: 'deleted',
  publish: 'published',
  unpublish: 'unpublished',
  trash: 'trashed',
  archive: 'archived',
  install: 'installed',
  uninstall: 'uninstalled',
  upload: 'uploaded',
  activate: 'activated',
  enable: 'activated',
  deactivate: 'deactivated',
  disable: 'deactivated',
  restore: 'restored',
  switch: 'switched'
}

const opWords = (ops: readonly string[]): string =>
  ops.length ? ops.map((op) => OPS[op.toLowerCase()] ?? 'changed').join(', ') : 'changed'

/** "page 12 “About us” (updated)" — only what the record named. */
function resourceLine(r: Pick<ActivityEffectResource, 'type' | 'id' | 'title' | 'ops'>): string {
  const what = [r.type ? r.type.replace(/_/g, ' ') : 'item', r.id].filter(Boolean).join(' ')
  return `${what}${r.title ? ` “${r.title}”` : ''} (${opWords(r.ops)})`
}

function groupLines(group: ActivityEffectGroup, unnamed: string): string[] {
  const lines = group.resources.map((r) => `  - ${resourceLine(r)}`)
  if (group.operations > 0)
    lines.push(
      `  - ${group.operations} ${group.operations === 1 ? 'action' : 'actions'} that named no ${unnamed}: find them from the time and the request below, and ask me if you cannot tell which`
    )
  return lines
}

const hasAny = (g: ActivityEffectGroup): boolean => g.resources.length + g.operations > 0

/**
 * Whether a row offers "Ask Tracy to revert…": it recorded a change that is still there to put
 * back. Not on an undo or restore itself, not on a row that changed nothing, not on files that an
 * undo already took back with nothing else left.
 */
export function canAskRevert(item: Pick<ActivityItemV2, 'origin' | 'reversal' | 'effects'>): boolean {
  if (item.origin.source === 'site-changes' || item.reversal.state === 'not-applicable') return false
  const e = item.effects
  const files = e.files.state === 'recorded' && (e.files.count ?? 0) > 0 && item.reversal.state !== 'undone'
  return hasAny(e.content) || hasAny(e.settings) || e.other.operations > 0 || files
}

export interface RevertContext {
  siteKey: string
  /**
   * The site's CMS (`wordpress` · `joomla` · `emdash`) when the row itself does not name it — a
   * chat turn carries no CMS; the list's coverage does.
   */
  cms?: string | null
}

/** Who the record names, in the agent's words — a Tracy seat, a CMS account, a service, or unknown. */
function whoOf(item: Pick<ActivityItemV2, 'actor' | 'origin'>, cms: string | null): string {
  const a = item.actor
  const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : null
  if (a.type === 'unknown') return 'unknown'
  if (a.type === 'system') return name ?? 'the system'
  if (a.id?.startsWith('tracy:')) return `${name ?? a.id.slice(6)} (Tracy seat)`
  const cmsId = a.id?.includes(':') ? a.id.slice(a.id.indexOf(':') + 1) : null
  return `${cms ?? 'CMS'} account ${name ?? ''}${cmsId ? ` (ID ${cmsId})` : ''}`.replace(/  +/g, ' ').trim()
}

/**
 * The message, or null when the row offers nothing to revert (`canAskRevert`).
 * @param item - the V2 event.
 */
export function revertPromptOf(item: ActivityItemV2, ctx: RevertContext): string | null {
  if (!canAskRevert(item)) return null
  const e = item.effects
  const cmsKey = item.origin.cms ?? ctx.cms ?? null
  const cms = cmsKey ? (CMS_NAME[cmsKey] ?? cmsKey) : null
  const when = item.occurredAt ?? item.detectedAt
  const commit = e.files.sha ?? item.evidence.commitSha ?? null
  const shortCommit = commit ? commit.slice(0, 12) : null

  const out: string[] = []
  out.push(`Please revert one recorded change on the site ${ctx.siteKey}, and only that change.`)
  out.push('')
  out.push(
    `Recorded: ${item.timeBasis === 'detected' ? 'detected' : 'made'} ${when ?? 'at an unknown time'} · source ${item.origin.source} · by ${whoOf(item, cms)}`
  )
  const refs: string[] = []
  if (item.evidence.turnId) refs.push(`chat turn ${item.evidence.turnId}`)
  if (commit) refs.push(`commit ${commit}`)
  if (item.evidence.operationId) refs.push(`operation ${item.evidence.operationId}`)
  if (item.evidence.cmsRecordRef) refs.push(`${cms ?? 'CMS'} log record ${item.evidence.cmsRecordRef}`)
  if (item.origin.log) refs.push(`log ${item.origin.log}`)
  if (refs.length) out.push(`References: ${refs.join(' · ')}`)

  out.push('')
  out.push('What it changed — put each of these back to how it was just before this change:')
  if (hasAny(e.content)) out.push('- Content:', ...groupLines(e.content, 'item'))
  if (hasAny(e.settings)) out.push('- Settings:', ...groupLines(e.settings, 'setting'))
  if (e.other.operations > 0)
    out.push(
      `- Other recorded actions: ${e.other.actions.length ? e.other.actions.join(', ') : `${e.other.operations}`}`
    )
  const filesLeft =
    e.files.state === 'recorded' && (e.files.count ?? 0) > 0 && item.reversal.state !== 'undone'
  if (filesLeft && commit) {
    out.push(
      // The agent's tools on the site reach the files as they are now, not the site's Git history
      // (it lives beside the site, on the host — wave r1 W4/c1b). So the diff comes from the person.
      `- Files: ${e.files.count} ${e.files.count === 1 ? 'file' : 'files'} in commit ${shortCommit}. You cannot read the site’s Git history from here: ask me to open this change in Site changes and send you each file’s diff, then put back only the lines this commit changed in those files.`
    )
  }
  if (item.reversal.state === 'partially-undone')
    out.push('- Its file changes were already undone from Site changes: leave the files as they are now.')
  if (e.files.state === 'not-tracked')
    out.push(
      `- Files: ${cms ?? 'this site'} keeps no file history, so no file list is recorded for this change.`
    )

  out.push('')
  out.push('Where earlier values may still be kept:')
  for (const line of (cmsKey && OLD_VALUES[cmsKey]) || [
    'Content: the CMS’s own revisions or trash, if it keeps them.',
    'Settings: most CMSs keep no history of earlier values.'
  ])
    out.push(`- ${line}`)
  // Measured (wave r1 W4/c3): a change Tracy made through the site's content door has its earlier
  // value in the Tracy plugin's own change log — a real source, used correctly once.
  out.push(
    '- A change Tracy made: the earlier value the Tracy plugin recorded when it made the change, if it recorded one.'
  )
  if (filesLeft && commit)
    out.push(
      `- Files: the diff of commit ${shortCommit}, which I can open for you in Site changes (the site’s Git history is not readable from your tools).`
    )

  out.push('')
  out.push(
    `Scope: only these items, back to their state just before ${shortCommit ? `commit ${shortCommit}` : (when ?? 'this change')}. Keep every other change on the site. If one of these items was changed again after this, tell me before overwriting it.`
  )
  out.push('')
  // Wave r1 B3: the agent took a value from Polylang's string registry while saying it was not sure,
  // and wrote it. Only the named sources count; a trace that makes it "fairly sure" does not.
  out.push(
    '**If you cannot find an earlier value in a revision, the Trash, the site’s Git history, or a value the Tracy plugin recorded when it made the change, ask me for it. Never guess an earlier value.**'
  )
  out.push(
    'If the value does not come from a revision, the Trash, the site’s Git history, or a value the Tracy plugin itself recorded when it made the change, you MUST ask — even when another trace (translations, caches, theme strings) makes you fairly sure. Naming such a trace does not count as finding the value.'
  )
  // Wave 22:2x (stand, 02/10): asking for a title, the agent offered "Put back NORTHGATE SCV2-wave-4t"
  // — a value from an EARLIER round — instead of "Northgate", the one just before. A suggestion is
  // only as good as the transition it comes from: it must end at what the site shows now.
  out.push(
    'When you ask me for an earlier value, suggest one only if one of those sources records a change whose new value is exactly what the site holds now: then suggest the value from just before that change. Otherwise ask without suggesting any value — an older value from an earlier change may be stale.'
  )
  // Brian 02/10 ~22:5x: the message goes out at one press, so the agent says first what it will do;
  // the person can still stop it, and a revert is itself a recorded change.
  out.push(
    'Start your reply with one sentence naming exactly what you are about to put back, before you change anything.'
  )
  if (item.request.text?.trim()) {
    out.push('')
    out.push(
      `The request that made this change${item.request.state === 'truncated' ? ' (cut when it was saved)' : ''}: “${item.request.text.trim()}”`
    )
  }
  return out.join('\n')
}

/**
 * The body with every run of three backticks broken: a recorded title or request that holds one
 * would otherwise end the fenced block early, and the rest would show as raw text in the chat.
 */
const fenceSafe = (body: string): string => body.replace(/`{3,}/g, (run) => run.split('').join('​'))

/**
 * The message "Ask Tracy to revert" sends, or null when the row offers nothing to revert: the
 * person's sentence, then the `tracy-revert` block the chat folds into a chip.
 * @param sentence - "Revert “…” — only this change.", already in the reader's language.
 */
export function revertMessageOf(item: ActivityItemV2, ctx: RevertContext, sentence: string): string | null {
  const body = revertPromptOf(item, ctx)
  if (body === null) return null
  return `${sentence.trim()}\n\n\`\`\`${REVERT_FENCE}\n${fenceSafe(body)}\n\`\`\``
}

/**
 * The chip's hover text for a `tracy-revert` block: its `Recorded:` line, or null when the block is
 * not one of ours (dsh then leaves it as plain text).
 * @param block - the whole block, fence lines included (dsh's fold contract).
 */
export function revertBlockTitle(block: string): string | null {
  const lines = block.split('\n')
  if (lines[0]?.trim() !== `\`\`\`${REVERT_FENCE}` || lines[lines.length - 1]?.trim() !== '```') return null
  const recorded = lines.find((line) => line.startsWith('Recorded: '))
  return recorded ?? lines[1] ?? ''
}
