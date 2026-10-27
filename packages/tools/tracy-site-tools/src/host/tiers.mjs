/**
 * WHAT EACH `tracy_site` ACTION DOES TO THE SITE, IN ONE WORD — the tier a call is judged by before
 * anything is relayed (Content API v2 plan, V2-5; Lee, 26/09/2026).
 *
 * ADR 0022 turned the quickstart contract from a lock into a recommendation: the agent now holds
 * every door. What keeps a customer's site safe is no longer "which doors exist" but "which doors ask
 * first". Three tiers, one rule each:
 *
 * - `readonly`  — runs freely; nothing on the site changes.
 * - `mutating`  — runs at once; there is an undo (`apply.revert`) or a read-back, and the site stays
 *                 whole. Words, pictures, a record, a snapshot.
 * - `destructive` — asks the customer first: the door answers `CONFIRM_FIRST` until an
 *                 `ask_user_question` was answered in this conversation, then takes the same call with
 *                 `confirm:true` ONCE (the EmDash D34 rule, `emdash-call.mjs`, brought to this tool).
 *                 A delete, a database rollback, a core upgrade, installing or switching on code the
 *                 site will run, retiring languages.
 *
 * 🔒 THE LIST IS THE SAME SENTENCE THE SITE CONTEXT HAS TOLD THE AGENT SINCE #337 ("Before
 * `content.delete`, `db.rollback`, `core.upgrade`, or installing or activating an extension, plugin
 * or theme, confirm with `ask_user_question`"): a rule that was only prose is now a door. Measured
 * before this: the agent asked in most turns and skipped in some — a skipped ask is one deleted post.
 * `test/tiers.test.mjs` holds every action to exactly one tier.
 */

import { SET_ONLY_WRITE_ACTIONS, setOnlyDoorWrites } from './set-only-doors.mjs'

/** @type {Readonly<Record<string, 'readonly' | 'mutating' | 'destructive'>>} */
export const TIERS = Object.freeze({
  // reads
  info: 'readonly',
  'content.list': 'readonly',
  'content.get': 'readonly',
  'content.read': 'readonly',
  'content.locate': 'readonly',
  'content.find': 'readonly',
  'extension.list': 'readonly',
  'plugin.list': 'readonly',
  'theme.list': 'readonly',
  'db.tables': 'readonly',
  'db.dump': 'readonly',
  'core.manifest': 'readonly',
  'apply.list': 'readonly',
  'page.text': 'readonly',
  'page.look': 'readonly',
  'media.scan': 'readonly',
  // writes with an undo or a read-back
  'content.update': 'mutating',
  'content.batch': 'mutating',
  'content.contract': 'mutating', // inspect → readonly, multilingual.retire → destructive: `tierOf`
  'content.replace': 'mutating',
  // words a theme prints at render time: inspect and status read, apply keeps rules (`tierOf`)
  'content.renderedWords': 'mutating',
  // a new page and its menu entry, under one apply id (`page-create.mjs`): one apply.revert undoes both
  'page.create': 'mutating',
  'content.language': 'mutating',
  'media.upload': 'mutating',
  'media.draw': 'mutating',
  'apply.revert': 'mutating',
  'look.revert': 'mutating',
  'look.set': 'mutating',
  'db.snapshot': 'mutating',
  'theme.style': 'mutating',
  'language.install': 'mutating',
  // a Joomla template's logo, name and favicon files: one undo step per set
  'template.siteSettings': 'mutating',
  // Joomla's site name, description and page-title setting: one undo step per set (a read: `tierOf`)
  'site.identity': 'mutating',
  // the customer's word first
  'content.delete': 'destructive',
  'media.delete': 'destructive',
  'db.rollback': 'destructive',
  'core.upgrade': 'destructive',
  'extension.install': 'destructive',
  'extension.enable': 'destructive',
  'plugin.install': 'destructive',
  'plugin.activate': 'destructive',
  'theme.install': 'destructive',
  'theme.activate': 'destructive'
})

/** The actions whose tier is `destructive` whatever their parameters. */
export const DESTRUCTIVE_ACTIONS = Object.freeze(
  Object.keys(TIERS).filter((action) => TIERS[action] === 'destructive')
)

/**
 * The tier of one call. `content.contract` is the one action whose tier depends on its operation:
 * an inspect reads, an apply or a restore writes with an undo, a retire hides languages the site
 * served (restorable, but a whole edition gone from the public site is the customer's call).
 * @param {string} action
 * @param {Record<string, unknown> | null | undefined} params
 * @returns {'readonly' | 'mutating' | 'destructive' | null} null for an action this tool has not.
 */
export function tierOf(action, params) {
  if (action === 'content.contract') {
    const operation = typeof params?.operation === 'string' ? params.operation.trim() : ''
    if (operation === 'inspect') return 'readonly'
    if (operation === 'multilingual.retire') return 'destructive'
    return 'mutating'
  }
  if (action === 'content.renderedWords') return params?.operation === 'apply' ? 'mutating' : 'readonly'
  // The plugin writes on `set` only (`Engine.php`: `read` is the default operation of all three doors).
  if (SET_ONLY_WRITE_ACTIONS.has(action)) return setOnlyDoorWrites(params ?? {}) ? 'mutating' : 'readonly'
  return TIERS[action] ?? null
}

/**
 * WHAT THE CUSTOMER READS ON THE CONFIRM CARD, per destructive action (29/09/2026). The card said
 * "content.delete changes what this site runs or holds. Go ahead?" — an action name on a screen a
 * business owner reads. The agent is told to put the card in the customer's words, but a model given
 * a raw name tends to send it as it came. The words are here, one sentence per action, with nothing in
 * them a customer would not say; the refusal's own `error` keeps the action for the agent.
 *
 * What the answer means never reads this text: `answerVerdict` (`call-memory.mjs`) reads the
 * question's id (the refused call's hashed key) and which option was first, whatever the words.
 * `test/tiers.test.mjs` holds every destructive action to a sentence.
 * @type {Readonly<Record<string, string>>}
 */
const CONFIRM_SENTENCES = Object.freeze({
  'content.delete': 'This deletes something from your site.',
  'media.delete': 'This deletes a picture from your site.',
  'db.rollback': "This puts your site's content back to an earlier saved copy.",
  'core.upgrade': 'This upgrades the software your site runs on.',
  'extension.install': 'This installs something new on your site.',
  'plugin.install': 'This installs something new on your site.',
  'theme.install': 'This installs a new theme on your site.',
  'extension.enable': 'This switches something on your site on or off.',
  'plugin.activate': 'This switches something on your site on.',
  'theme.activate': 'This switches your site to another theme.',
  // `content.contract` is destructive only to retire languages (`tierOf`).
  'content.contract': 'This hides some languages of your site.'
})

/**
 * The sentence a confirm card carries for a destructive `tracy_site` action, in a customer's words.
 * An action with none of its own gets the general one, never its name.
 * @param {string} action
 * @returns {string}
 */
export function confirmSentence(action) {
  return Object.hasOwn(CONFIRM_SENTENCES, action)
    ? CONFIRM_SENTENCES[action]
    : 'This changes something on your site that is hard to undo.'
}

/**
 * The one line a surface's description carries about tiers, naming only the destructive actions THAT
 * surface has (a description names its own actions and no other — `test/surface.test.mjs`). A surface
 * with none (EmDash) says so. Budgeted per surface in that test, computed from this function.
 *
 * 🔒 IT SAYS THE ORDER: CALL FIRST (30/09/2026). "answers CONFIRM_FIRST until you ask_user_question —
 * then the same call with confirm:true" read as "ask, then call with confirm:true": on a quickstart
 * site, where this line is the only word on deletes, the agent asked its own question first in every
 * v7 delete case and the door asked again. A question of the agent's own opens nothing
 * (`call-memory.mjs` `confirmed`): the customer's answer counts only when it answers the door's
 * question, so calling first is what makes the delete one question, in every language.
 *
 * `multilingual: false` (01/10/2026) is an imported copy's derived contract: its plugin answers
 * `unsupported` to every language operation (claude-cowork `Engine.php`, derived bindings), so the retire
 * pass a quickstart's contract carries is not named there.
 * @param {readonly string[]} actions
 * @param {{ multilingual?: boolean }} [options]
 */
export function tiersSentenceFor(actions, { multilingual = true } = {}) {
  const destructive = actions.filter((action) => TIERS[action] === 'destructive')
  if (multilingual && actions.includes('content.contract')) destructive.push('multilingual.retire')
  // ADR 0034 (19/10/2026): a write with a consequence asks too (`consequence.mjs`), in the same order.
  // "money", not the other word: no description speaks of what something costs (`reply-plain.test.mjs`).
  const writes =
    'Tiers: reads run freely; writes run at once, undoably, but hiding, site-wide, 6+ places or money ask too'
  if (destructive.length === 0)
    return `${writes}: call first; CONFIRM_FIRST gives the one question, then the same call with confirm:true. Nothing here is destructive.`
  // 09/10/2026 (`delete-group.mjs`): a record in several languages is one delete — the agent walked 41
  // languages one call (and one question) at a time without this clause.
  const everyLanguage = destructive.includes('content.delete')
    ? 'content.delete takes every language of a record unless locale names one; '
    : ''
  return (
    `${writes}; ` +
    everyLanguage +
    `destructive (${destructive.join(', ')}): call first; CONFIRM_FIRST gives the one question, then the same call with confirm:true.`
  )
}
