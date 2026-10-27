// A relative path, not `@tracy/core/language`: this plugin's host bundle keeps packages external, and
// the plugin folder the image copies has no node_modules to resolve a bare import from (as `deploy-hold.mjs`).
import {
  chatReplyLanguage,
  languageName,
  messageLanguage
} from '../../../../core/tracy-core/src/language/index.mjs'
// Same reason: a block in a request said in the chat chip's words, one rule for every reader.
import { replaceMentions } from '../../../../core/tracy-core/src/mention/index.mjs'

/**
 * Whose name a write leaves in — the reading half, kept pure so a test can hold it.
 *
 * WHY THIS EXISTS. This plugin used to answer that question with `latest`: whoever's browser said
 * hello most recently. On a lane one person uses that is right by accident. On a shared one it is a
 * coin toss, and the seat book — which decides what a write may do by the person's role — was being
 * asked about the wrong person. The `latest` viewer also carried an ORIGIN, and that is how a tab
 * opened on the password gate (51731, which serves no `/api/sites`) poisoned a build's first door
 * call into `COWORK_WEB_BAD_RESPONSE`, while the retry after another hello went through (09/09).
 *
 * Lee, 09/09: the agent's authority follows THE PERSON WHO TYPED. The gate in front of dsh stamps
 * `prompter` onto every prompt, dsh keeps it on the message's source, so the session's own log
 * answers the question — and answers it per turn, which is exactly what a shared session needs.
 */

/**
 * The person who typed the most recent message in a session, from its log.
 *
 * Only a `user` source is a person: `plugin` and `tool` messages are the machine talking to itself,
 * and a build reports its progress that way. A stamp with a name but no address (a gate's master
 * account, which never proved an email) cannot be vouched for to the seat book, so it answers null
 * and the caller falls back rather than signing an assertion for nobody.
 *
 * @param {readonly {type?: string, data?: {source?: Record<string, any>}}[] | undefined} events - the session's events, oldest first.
 * @returns {{ user: string, email: string } | null} the person, or null when nobody can be named.
 */
export function latestPrompter(events) {
  if (!Array.isArray(events)) return null
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event?.type !== 'user/message') continue
    const source = event.data?.source
    if (source?.kind !== 'user') continue
    const who = source.prompter
    if (!who || typeof who.user !== 'string' || typeof who.email !== 'string' || who.email === '') return null
    return { user: who.user, email: who.email }
  }
  return null
}

/**
 * A comment from the Browser tab (comment → edit) arrives as the person's request, then one fenced
 * `tracy-element` block describing the element they picked, then one fixed line telling the agent
 * which road to take (`tracy-chat-input` `comment-turn.mjs`). The block holds the PAGE's words and
 * the resolver's labels, the line holds Tracy's — neither is the customer's.
 *
 * 🔒 SO THEY ARE NOT THE CUSTOMER'S WORDS. Measured 27/09 on the comment picker branch: with the block
 * read as the request, a comment "Make this button red" on a button reading "Delete my account
 * permanently" answered `asksRemoval` true, and `quotesCustomer` accepted the page's own words as the
 * customer asking for a removal — the body guard (D6′) and the WordPress replace engine would then
 * let a record shrink that nobody asked to cut; CC-16 also took page text as "the customer's own
 * sentence". The block and the line after it (it always names `tracy_site`) are cut here, once, for
 * every rule that reads the customer's words.
 *
 * SEVERAL COMMENTS IN ONE TURN (plan "comment multi-pin", contract H5) are N such blocks, each under
 * its comment's words (unnumbered since S16, 30/09; numbered lines at the top before), the hint line
 * right after the LAST (`LOCATE_HINT_MANY` or `_INCOMPLETE` — they name `tracy_site` too). The same
 * rule cuts every block and that one hint, and leaves exactly the person's words — the bytes
 * `parseCommentTurn` gives as the request. A comment about a whole page (plan "comment review", H4) is a `tracy-page` block in
 * the same place, cut by the same rule.
 */
const PICKED_ELEMENT =
  /(^|\n)```tracy-(?:element|page)\n[\s\S]*?\n```(?:\n[^\n]*`tracy_site`[^\n]*)?(?=\n|$)/g

/**
 * The words a person typed in one message: its text parts joined, a picked element's block left out.
 *
 * A block NOT on lines of its own — mid-line, or cut off before its end — is not theirs either (Brian
 * 03/10: a request recorded with one read "thay ảnh này bằng ```tracy-element <mentioned-element …"
 * in Site changes). Every rule here reads it cut. A title for PEOPLE (`mentions: 'label'`, the
 * recorded turn's request) says it instead in the words the chat chip shows for it (`replaceMentions`,
 * `@tracy/core/mention`) — never for a rule: those words may quote the page (D6′).
 * @param {unknown} content - a `user/message` event's `content`.
 * @param {{ mentions?: 'cut' | 'label' }} [form]
 * @returns {string}
 */
export function personWords(content, { mentions = 'cut' } = {}) {
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((part) =>
              part && typeof part === 'object' && typeof part.text === 'string' ? part.text : ''
            )
            .join('\n')
        : ''
  if (!text.includes('```tracy-element') && !text.includes('```tracy-page')) return text
  const lined = text.replace(PICKED_ELEMENT, '$1')
  const said = replaceMentions(lined, mentions === 'label' ? (words) => ` ${words} ` : () => ' ')
  if (said === text) return text
  return (said === lined ? lined : said.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n'))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * V2-H1 (stand E2E round 2, 29/09): asked to make an image's alt print, the agent edited the Joomla
 * template's PHP (`edit` on `.webroot/templates/…/style-1.php`) and answered ✓ — a write outside the
 * Apply door's receipts, so nothing the person can undo. The same sentence rides every comment turn's
 * hint (`tracy-chat-input` `comment-turn.mjs` `COMMENT_WRITES_ONLY`); `test/prompter.test.mjs` holds
 * the two copies equal. It excepts a look change and the call a `write:` line gives (29/09 pm): see
 * the note there. F14 (stage-5 acceptance, 29/09): replies showed the customer `NO_BROWSER` and
 * "apply.revert … replace-…"; its last sentence now bans tool/action names, codes and ids and says a
 * content change's undo in words (the one call-shaped undo left is the look change's).
 */
export const COMMENT_WRITES_ONLY =
  'Answer a comment only through `tracy_site` / `tracy_emdash` content writes (receipts the person can undo): never edit theme, template, plugin or PHP/JS/CSS files on the site for a comment, except a look change (above) or the call a `write:` line gives; if the page prints no slot for what was asked (for example an image the page prints with no alt at all), say so and go on. In your reply use plain words: never a selector, id, mark, tool or action name, error code or receipt id (not `NO_BROWSER`, not `apply.revert`) — a change, a look change too, is undone by asking you, so say that.'

/**
 * G1 (stand E2E stage 5 round 2, 29/09; Brian ~17:00): a look change in a comment turn reached every
 * card on every page and the reply said none of it. The fence now copies a look write first
 * (`look-undo.mjs`) and its result carries `undo: <id>`; the reply line names the scope and the undo.
 * The chat input's full hints carry the same sentence (`tracy-chat-input` `comment-turn.mjs`
 * `COMMENT_LOOK_SCOPE`); `test/prompter.test.mjs` holds the two copies equal.
 */
export const COMMENT_LOOK_SCOPE =
  'A look change says in plain words how far it reaches ("every card heading on every page", "this page only") and that the person can ask you to put it back, e.g. "Card headings are lighter now (weight 600 → 500) on every page and language. Ask me and I will put them back.". The undo id its write\'s result gave is for you: never in the reply.'

/**
 * M6 (stage 3; Brian 29/09 ~17:20): a comment asks to change words DRAWN INSIDE an image (a banner's
 * "Summer sale 30%", a logo's name) — no record or alt holds them. Said only in a turn whose block
 * carries an `image:` line (the image road), in the chat input's words (`tracy-chat-input`
 * `comment-turn.mjs` `COMMENT_IMAGE_WORDS`); `test/prompter.test.mjs` holds the two copies equal.
 */
export const COMMENT_IMAGE_WORDS =
  "If the comment asks to change words drawn inside the image itself (a banner's slogan, a logo's name) and no record or alt holds them, do not guess and do not edit files: answer it `✗ the words are part of the image file <file>; changing them needs a new image` and ask with a question card whether the person wants to replace the image (upload a new one)."

/** A comment block carrying an `image:` line — the image road (`comment-turn.mjs`, plan C3). */
const IMAGE_BLOCK = /(^|\n)```tracy-element\n(?:(?!\n```)[\s\S])*\nimage: /

/**
 * A reply in a comment turn (plan `tasks/todo-comment-thread.md` § "B addendum", 29/09):
 * its block carries `reply-to` and the whole thread — people talking, not a list of orders. N1/N2/N8
 * (stage-5 acceptance round 2): the latest undisputed word wins over an old comment sent late, a
 * dismissed card writes nothing, one question per comment, and people by name, never by role. Stage 6
 * (Rule 7): two people with one display name are told apart by their e-mail's local part, each earlier
 * send of the thread is a `sent to Tracy by` line, and a dismissed card is said in words. The
 * same sentence ends the chat input's many-comments hint when a turn holds a reply
 * (`tracy-chat-input` `comment-turn.mjs` `COMMENT_THREAD`); `test/prompter.test.mjs` holds the two
 * copies equal.
 */
export const COMMENT_THREAD =
  'A comment with `thread:` lines is part of a conversation between people, not a list of orders (a reply also carries `reply-to`, the comment it continues on the same element): each line names who wrote it (two people with one name get the start of their e-mail after it), the line marked `now` is the comment being sent, a line marked `written after this one` came later, a `sent to Tracy by` line is an earlier time someone sent this thread to you, and different names are different people, never one person changing their mind; read them all and act on the LAST agreed intent — a later word nobody disputed wins over an older comment sent late; if two people disagree and nobody settled it, do not choose: ask with a question card, one question per item, opened with a few words of its element (the heading "…"), never its number, naming who said what (or, when asked for advice, recommend the best option with reasons); if that card is dismissed or comes back with no choice, change nothing for that item and say it waits for <names> to agree; when you act, say whose intent you followed, by the name its line gives, never by a role such as "the owner" or "the editor".'

/**
 * L1 (quickstart smoke, 29/09): on an EmDash Base site the agent answered English comments in Chinese
 * — nothing named the reply's language, so the site's (or the template's) content picked it. Every
 * comment rule says it; the chat input's hints carry the same sentence (`tracy-chat-input`
 * `comment-turn.mjs` `COMMENT_REPLY_LANGUAGE`); `test/prompter.test.mjs` holds the two copies equal.
 * F4 (stage-5 acceptance, 29/09): one Vietnamese comment made three later English ones get Vietnamese
 * answers, and one answer narrated the rule — now per comment (each block's `lang`), the rest of the
 * answer in the last comment's language, never narrated. Bug 30/09: pointing at `lang` was not
 * enough (two English comments answered in Chinese); {@link replyLanguageRule} now NAMES the language
 * on every turn, after this rule.
 */
export const COMMENT_REPLY_LANGUAGE =
  "Answer each item in the language it was written in (its block's `lang`, else its words) and the rest of your answer in the last item's, whatever this conversation or the site used before; never say which language you use or why."

/**
 * How a comment turn is answered (stage 6, plan `tasks/todo-comment-people.md` § Rule 7, 29/09
 * night). Until then every rule made Tracy close with a line the Comments view read back as a status —
 * `- n ✓ updated: …` / `- n ✓ answered: …` / `- n ✗ … (reason)`, the verb exactly "updated" (stand
 * E2E M2, M5, L7, L8, G3). Stage 6 retired that status: "Send to Tracy" is a request in the chat, and
 * Tracy answers it as it answers anyone there. The chat input's hints carry the same sentences
 * (`tracy-chat-input` `comment-turn.mjs` `COMMENT_ANSWER_ONE` / `COMMENT_ANSWER_MANY`);
 * `test/prompter.test.mjs` holds each pair equal.
 */
export const COMMENT_ANSWER_ONE =
  'Answer in the chat as you would answer a person, in plain words: what you did, or what you could not do and why.'
export const COMMENT_ANSWER_MANY =
  'Answer in the chat as you would answer a person, in plain words, saying which you did and which you could not, and why (a ✓ or ✗ at the start of a line is fine, never required).'

/**
 * Stage-6 acceptance F5 (`tasks/evidence/comment-people/acceptance.md`, S3/S12): answers said `Đã làm xong bình luận 20.`
 * / `Xong bình luận 39.` and a question card was titled "Comment 107" — the
 * server's counter, which the person never sees, and "comment" for a page send, which creates none
 * (Rule 1). The number stays for `comment: <n>` on the calls; the person hears what each item is on
 * the page. The chat input's hints carry the same sentence (`tracy-chat-input` `comment-turn.mjs`
 * `COMMENT_NAMED_BY_PAGE`); `test/prompter.test.mjs` holds the two copies equal.
 */
export const COMMENT_NAMED_BY_PAGE =
  'The numbers (n) are for your calls only — the person never sees them: never write one, nor "comment <n>", in your answer or in a question card; name each item by what it is on the page, quoting a few of its words (the heading "Building the groundwork…", the menu item "Services"), or "the whole page" for a `<page>` block; and what the person sent from the page is a request, not a comment — comments are only the notes people leave each other.'

/**
 * Stage-6 acceptance F7 (S1): "the home page's Vietnamese version" for a write to the `en` post — the
 * request's language taken for the page's. The page and language a write reached are in its result.
 * Same sentence as the chat input's `COMMENT_WHAT_CHANGED`; `test/prompter.test.mjs` holds them equal.
 */
export const COMMENT_WHAT_CHANGED =
  "Name the page and language you changed only as the write's result names them (its page, its path such as /en/, its note on other language versions), never from the language the request was written in; when the result names none, name no language."

/**
 * L6 (stand E2E round 2, 29/09, Joomla V6): only comment 4 was sent; the agent also redid comment 1,
 * which had failed the turn before, without `comment: 1` on the write. The number of an earlier
 * comment outlives its turn — the Apply door checks it against the request the person sent (stage 6,
 * contract H1) — so it is said in every comment rule, one comment or many.
 */
const EARLIER_COMMENT =
  'A write that redoes a comment numbered in an earlier turn of this conversation (one that failed, say) still carries `comment: <that n>`.'

/** A reply's descriptor head: `n` first, `reply-to` second (`comment-turn.mjs`). */
const REPLY_HEAD = /(^|\n)```tracy-element\n<mentioned-element n="\d+" reply-to="\d+" /

/**
 * N1 (stage-5 acceptance round 2): a block carrying `thread:` lines — a reply, or a top-level comment
 * sent with the replies written under it (no `reply-to`).
 */
const THREAD_BLOCK = /(^|\n)```tracy-element\n<mentioned-element n="\d+" (?:(?!\n```)[\s\S])*\nthread: /

/** The notice producer of the many-comments rule (`noticeSource`, `site-context.mjs`). */
export const COMMENT_ITEMS_PLUGIN = 'tracy-site-tools:comment-items'

/**
 * One comment's block: a picked element's, or a `tracy-page` one for a comment about a whole page
 * (plan "comment review", H4) — the bare fence line at the start of a line (H5: it stays bare).
 */
const ELEMENT_FENCE = /(^|\n)```tracy-(?:element|page)\n/g

/**
 * How many Browser-tab comment blocks (`tracy-element` / `tracy-page`) one message carries — the ONE
 * reading of "is this a comment turn": ≥ 1 is a comment turn (the comment fence, `comment-fence.mjs`),
 * ≥ 2 a list of numbered comments; each gets its rule from {@link commentItemsRule}.
 * @param {unknown} content - a `user/message`'s content (blocks) or its text.
 * @returns {number}
 */
export function commentBlockCount(content) {
  return (messageTextOf(content).match(ELEMENT_FENCE) ?? []).length
}

/**
 * A message's text: its text parts joined by newlines.
 * @param {unknown} content
 * @returns {string}
 */
export function messageTextOf(content) {
  return typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .map((part) => (part && typeof part === 'object' && typeof part.text === 'string' ? part.text : ''))
          .join('\n')
      : ''
}

/** A block head's own number and the grouped ones after it (`n="40" also-n="41 42"`, `comment-turn.mjs`). */
const BLOCK_NUMBERS =
  /(?:^|\n)```tracy-(?:element|page)\n<(?:mentioned-element|page) n="(\d+)"(?: also-n="(\d+(?: \d+)*)")?/g

/**
 * The numbers each comment block of a message carries, in order: its `n`, then its `also-n` ones.
 * @param {string} text - the message's text.
 * @returns {number[][]} one entry per numbered block; a block without `n` is left out.
 */
export function commentNumbers(text) {
  return [...String(text).matchAll(BLOCK_NUMBERS)].map((m) => [
    Number(m[1]),
    ...(m[2] === undefined ? [] : m[2].split(' ').map(Number))
  ])
}

/**
 * V4S-8 (acceptance v4, 30/09, `e2e-v4/send.md` SEND-v4-new-10): a thread turn with ONE block,
 * `n="38"`, was told it "lists 1 numbered request" and that a write answering several carries
 * `comment: [1, 2]` — and Tracy passed `comment: 1`. An owner's write goes through anyway; an
 * editor's template-part write is refused `COMMENT_NOT_IN_FLIGHT`. So the rule NAMES the numbers this
 * turn's blocks carry, and says a position in the list is not one.
 * @param {number[][]} numbers - from {@link commentNumbers}.
 */
function numbersSentence(numbers) {
  /** @param {number[]} block */
  const call = (block) =>
    block.length === 1 ? `\`comment: ${block[0]}\`` : `\`comment: [${block.join(', ')}]\``
  const exact = numbers.map(call).join(', ')
  return numbers.length === 1
    ? `Every call for it carries ${exact} — the n its block gives, not a count or a place in the message.`
    : `The numbers to pass, one per block, exactly as the blocks give them (n): ${exact} — never a count or a place in the message.`
}

/**
 * The rule for a comment turn — one Browser-tab comment, or several numbered ones (comment → edit,
 * H6) — or null when the message carries no comment block.
 *
 * WHY A TURN NOTICE AND NOT THE TOOL DESCRIPTION. The rule is for the few turns that carry comments;
 * the tool description is sent on every step of every conversation, and a changed one re-sends the
 * cached prefix (CS1). So it travels once, with the message it is about, after it (CS3).
 *
 * WHAT IT ASKS, AND WHY EACH PART. The Apply door checks the number on every write against the
 * request the person sent from the page, and keeps it in its audit (stage 6, contract H1), so the
 * number must ride every call made for that item. An agent that meets an item it cannot do tends to
 * stop and ask, leaving the rest undone; the person sent them as one batch and expects the batch.
 * The answer is plain words in the chat ({@link COMMENT_ANSWER_MANY}): the per-number `- n ✓ …` list
 * and its "updated" verb went with the comment status (stage 6, Rule 7).
 *
 * ONE COMMENT (L8, stand E2E round 4, 29/09): a lone comment gets a rule too — the files sentence, a
 * natural answer ({@link COMMENT_ANSWER_ONE}), the earlier-comment rule (L6) and the reply language
 * (L1). Not the list's "do every one": there is one.
 *
 * A turn holding a REPLY (a block whose head carries `reply-to`) gets the list rule even with one
 * block — a reply is numbered even alone — plus {@link COMMENT_THREAD}, which stays the rule's last words.
 *
 * Detected by the COUNT of comment blocks, not by the hint line's exact bytes, which
 * `comment-turn.mjs` owns and may reword: picked-element blocks and `tracy-page` blocks (a comment
 * about a whole page, "Add a comment…" in the Comments view, plan "comment review" H4).
 * @param {unknown} content - a `user/message`'s content (blocks) or its text.
 * @returns {{ text: string, summary: string } | null}
 */
export function commentItemsRule(content) {
  const count = commentBlockCount(content)
  if (count === 0) return null
  // A reply is numbered even alone (its number colours its pin), so one reply gets the list rule.
  const text = messageTextOf(content)
  const reply = REPLY_HEAD.test(text) || THREAD_BLOCK.test(text)
  // M6: words drawn inside a picture, said only on the image road.
  const scope = IMAGE_BLOCK.test(text) ? `${COMMENT_LOOK_SCOPE} ${COMMENT_IMAGE_WORDS}` : COMMENT_LOOK_SCOPE
  // V4S-8 (acceptance v4, 30/09): the numbers to pass, read from the blocks themselves.
  const numbers = commentNumbers(text)
  const flat = numbers.flat()
  if (count === 1 && !reply)
    return {
      text:
        "The person's message carries one request from the page. " +
        (flat.length > 0 ? `${numbersSentence(numbers)} ` : '') +
        `${COMMENT_WRITES_ONLY} ${scope} ` +
        `${COMMENT_ANSWER_ONE} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${EARLIER_COMMENT} ${COMMENT_REPLY_LANGUAGE}`,
      summary: 'Rule for one comment in one message'
    }
  const comments = count === 1 ? 'comment' : 'comments'
  const requests = count === 1 ? 'request' : 'requests'
  return {
    text:
      `The person's message lists ${count} numbered ${requests} from the page. Do every one of them, in number order. ` +
      'Every tracy_site or tracy_emdash call you make for item n carries `comment: <n>` at the top ' +
      'level, beside `action` or `tool` (a read too), ' +
      'so the site can check each change against the request it answers. ' +
      (flat.length > 0 ? `${numbersSentence(numbers)} ` : '') +
      'When one cannot be done, say why and go on to the ' +
      `next — never stop the list at it. One write that answers several items carries \`comment: [${
        flat.length >= 2 ? `${flat[0]}, ${flat[1]}` : '<n>, <m>'
      }]\`. ` +
      `${COMMENT_WRITES_ONLY} ${scope} ` +
      `${COMMENT_ANSWER_MANY} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${EARLIER_COMMENT} ${COMMENT_REPLY_LANGUAGE}` +
      (reply ? ` ${COMMENT_THREAD}` : ''),
    summary: `Rule for ${count} numbered ${comments} in one message`
  }
}

/** The notice producer of the reply-language rule (`noticeSource`, `site-context.mjs`). */
export const REPLY_LANGUAGE_PLUGIN = 'tracy-site-tools:reply-language'

/** Every comment block's `lang` tag, in order; '' for a block without one (`comment-turn.mjs`, F4). */
const BLOCK_HEAD = /(?:^|\n)```tracy-(?:element|page)\n<[^>\n]*>/g
const LANG_ATTR = / lang="([^"]*)"/

/**
 * What the words written INTO the site are in, and that the choice is never narrated — the tail of
 * every reply-language rule. The site keeps its own language: an English request on a Russian page
 * changes Russian words (the site context's "which language is not a question" sentence says where).
 */
const REPLY_LANGUAGE_TAIL =
  'never say which language you reply in or why. Words you write into the site stay in the language of the page they go on, unless the request names another.'

/**
 * How Tracy and the person are named in a reply in Vietnamese (council 19/10/2026). Vietnamese has
 * no neutral "I" and "you": left to choose, a model calls itself "em" one turn and "tôi" the next, and
 * the person "anh" or "chị" on a guess at their gender and age. Tracy's own interface says "bạn", so
 * the reply does too, and Tracy is "mình". It is Tracy talking to the person, never the site's own
 * words, which keep the customer's brand voice. Part of the reply-language rule, the one place it is
 * said, so a typed turn and a spoken one (`voice-reply.mjs`) are worded alike.
 *
 * The two words are the pronouns themselves, which English cannot say, so they are kept as patterns:
 * Vietnamese letters in code are data, as `@tracy/core/language` and `voice-turn-taking.mjs` keep
 * theirs, never a sentence in a string (`check-language`).
 */
const SELF_VI = /mình/u.source
const PERSON_VI = /bạn/u.source
const VIETNAMESE_ADDRESS = `In Vietnamese, refer to yourself as "${SELF_VI}" and to the person as "${PERSON_VI}" (Tracy's interface calls them "${PERSON_VI}"), unless they clearly ask to be addressed otherwise; never infer their gender or age. This is how you talk to the person, not how the site talks: words written into the site keep its brand's own voice.`

/** The Vietnamese way of address, when one of the reply's languages is Vietnamese. @param {string[]} names */
const addressIn = (...names) => (names.includes('Vietnamese') ? ` ${VIETNAMESE_ADDRESS}` : '')

/**
 * The language of Tracy's reply, NAMED, for the turn a person just spoke in — or null when the message
 * carries no words.
 *
 * WHY (bug 30/09, local stand, WordPress, `deepseek-flash`, session `session-f3db8d78…`): the first two
 * turns were English comments whose blocks said `lang="en"`, the comment rule said "answer each item in
 * the language it was written in", the site context said "reply in the customer's language" — and both
 * answers came in Chinese; later turns were English. Every line POINTED at a language and none NAMED
 * one, so a model that drifts picked its own. "The customer's language" is ambiguous besides: a Russian
 * company's site edited by a Vietnamese team member writing English has three candidates.
 *
 * THE RULE: the reply is in the language of the person's latest message — not the site's content
 * language, not the UI's locale, not an earlier message's. Read from the comment blocks' `lang` tags
 * when every block has one (the chat input's reading of each comment alone, F4), else from the
 * message's own words ({@link messageLanguage}, the same reading, over {@link personWords}: a picked
 * element's block holds the PAGE's words). Comments in different languages keep the comment rule's
 * split — each item in its own, the rest in the last one's — with the last one named. Unsure → the
 * rule still says whose language, and names none: a wrong name would be followed as truth.
 *
 * WHY A TURN NOTICE. Same reason as {@link commentItemsRule}: the site context and tool descriptions
 * are the cached prefix (CS1), and a language is a fact of this turn, so it travels after the message
 * it is about (CS3), once per turn, for typed messages and comment turns alike.
 *
 * THE CONVERSATION'S MAIN LANGUAGE (David 15/10/2026). A chat is in the language of its first clear
 * message ({@link chatMainLanguage}); a later message that mixes languages — a dictated Vietnamese
 * request with an English clause — or reads as unsure is answered in that main language, and only a
 * message entirely in another language is answered in its own, worded as any other turn's
 * (`chatReplyLanguage` in @tracy/core).
 * Comment turns keep their tags: each comment names its own language.
 * @param {unknown} content - a `user/message`'s content (blocks) or its text.
 * @param {string} [main] - the conversation's main language code ({@link chatMainLanguage}), or ''.
 * @returns {{ text: string, summary: string } | null}
 */
export function replyLanguageRule(content, main = '') {
  const text = messageTextOf(content)
  if (text.trim() === '') return null
  const tags = [...text.matchAll(BLOCK_HEAD)].map((head) => head[0].match(LANG_ATTR)?.[1] ?? '')
  const tagged = tags.length > 0 && tags.every((tag) => languageName(tag) !== '')
  const names = tagged ? [...new Set(tags.map(languageName))] : []
  // A chat that has a main language keeps it for a mixed or unsure message (`chatReplyLanguage`).
  const words = personWords(content)
  const code = main ? chatReplyLanguage(words, main) : messageLanguage(words)
  const read = languageName(code)
  // Kept: said as the conversation's. Switched (the message is entirely another language): as before.
  if (!tagged && main && code === main && read !== '')
    return {
      text: `Reply in ${read}, the language this conversation is in — also when the latest message mixes in another language — unless the person asks for another language; not the site's or the page's; ${REPLY_LANGUAGE_TAIL}${addressIn(read)}`,
      summary: `Reply language: ${read} (the conversation's)`
    }
  const last = tagged ? languageName(tags.at(-1)) : read || languageName(tags.filter(Boolean).at(-1) ?? '')
  if (names.length > 1)
    return {
      text:
        `Answer each request in its own language (its block's \`lang\`) and the rest of your reply in ${last}, the language of the last one — not the site's, the page's or an earlier message's; ` +
        REPLY_LANGUAGE_TAIL +
        addressIn(...names, last),
      summary: `Reply language: each request its own, the rest ${last}`
    }
  if (last !== '')
    return {
      text: `Reply in ${last} — the language of the person's latest message — not the site's, the page's or an earlier message's; ${REPLY_LANGUAGE_TAIL}${addressIn(last)}`,
      summary: `Reply language: ${last}`
    }
  return {
    text: `Reply in the language of the person's latest message — not the site's, the page's or an earlier message's; ${REPLY_LANGUAGE_TAIL}`,
    summary: "Reply language: the latest message's"
  }
}

/**
 * The language a conversation is in: that of its first message whose words read clearly in one
 * language, a `/` command skipped (its words are a command's, not the person's). '' while none has.
 * @param {readonly { content?: unknown }[]} messages - the person's messages, oldest first.
 * @returns {string}
 */
export function chatMainLanguage(messages) {
  for (const message of messages) {
    const text = messageTextOf(message?.content).trim()
    if (text === '' || text.startsWith('/')) continue
    const code = messageLanguage(personWords(message.content))
    if (code !== '') return code
  }
  return ''
}

/** The notice producer of the plain-words reply rule (`noticeSource`, `site-context.mjs`). */
export const PLAIN_REPLY_PLUGIN = 'tracy-site-tools:plain-reply'

/**
 * How Tracy's reply reads to a person, on a turn that carries no comment rule.
 *
 * WHY (acceptance v4, 30/09, `e2e-v4/send.md` SEND-v4-new-7 / V4S-3): in a new conversation a change
 * typed in the chat was answered "Undo any time: `apply.revert { apply_id: "replace-munhcp0n-aaff70" }`".
 * The plain-words sentence (F14) rode only {@link COMMENT_WRITES_ONLY}, i.e. only turns sent from the
 * page; a typed turn had nothing against it, and the receipt's own `next` asked for "how to undo it".
 * Same wording as that sentence's last part, so the two roads say one rule.
 *
 * 🔒 NO `look.revert` HERE (bench flow D, 05/10/2026). The comment rule's last clause — "only a look
 * change ends with its `Undo: look.revert <id>`" — was copied here too, but a typed turn never earns that
 * id: `lookFiles` (`look-undo.mjs`) copies a look write only in a comment turn, so the result of a typed
 * turn's look write carries no `undo:`. Told to end with one, agents hunted for it — a grep for
 * `look.revert` through the site folder, a `look.revert {}` call to list ids — and found none. The look
 * undo stays where it exists: {@link COMMENT_WRITES_ONLY} (Rule 7 / S10), and the `undo:` note of the
 * write's own result (`lookUndoNote`).
 */
export const PLAIN_REPLY =
  'In your reply use plain words, as to a person: never a selector, id, mark, tool or action name, error code or receipt id (not `apply.revert`, not an `apply_id`) — a change is undone by asking you, so say that.'

/**
 * The plain-words rule for the turn a person just spoke in — or null when the message carries no words,
 * or carries a comment block ({@link commentItemsRule} already says it, in {@link COMMENT_WRITES_ONLY}).
 * A turn notice, like {@link replyLanguageRule}: the site context is the cached prefix (CS1).
 * @param {unknown} content - a `user/message`'s content (blocks) or its text.
 * @returns {{ text: string, summary: string } | null}
 */
export function plainReplyRule(content) {
  if (messageTextOf(content).trim() === '' || commentBlockCount(content) > 0) return null
  return { text: PLAIN_REPLY, summary: 'Reply in plain words' }
}

/** The notice producer of the site-changed notice (`noticeSource`, `site-context.mjs`). */
export const SITE_CHANGED_PLUGIN = 'tracy-site-tools:site-changed'

/** The tools whose calls read or write the site through Tracy: a call to one is a look at the site. */
const SITE_TOOLS = new Set(['tracy_site', 'tracy_emdash'])

/**
 * When this conversation last looked at its site: the epoch `time` of the latest `tracy_site` or
 * `tracy_emdash` call in its log, or null when it never made one.
 *
 * WHY THE LOG AND NOT THE AUDIT TRAIL. The Apply door records each call with the session, but
 * `audit` has no site index and may get none (`023-site-write-lease.sql`), and this is asked on every
 * turn; `tracy_emdash` reads never reach the door at all. The session's own log holds every call,
 * survives a dsh restart, and costs a backward walk that stops at the first site call.
 *
 * The CALL's time, not its result's: a write another conversation landed while this read was on the
 * wire may be missing from what the read answered, so it counts as newer than the look.
 * @param {{ seq?: number, eventAt?: (seq: number) => any } | undefined} session - dsh's session (as `stepBudget` reads it).
 * @returns {number | null}
 */
export function lastSiteLookAt(session) {
  if (!session || typeof session.seq !== 'number' || typeof session.eventAt !== 'function') return null
  for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
    const event = session.eventAt(seq)
    if (event?.type === 'tool/call' && SITE_TOOLS.has(event.data?.name) && typeof event.time === 'number')
      return event.time
  }
  return null
}

/**
 * The per-turn notice that the site changed since this conversation last looked at it — or null.
 *
 * WHY (V7S-1, acceptance v7, 30/09, `e2e-v7/send.md`, 2/2): conversation Y changed a heading;
 * another conversation changed it back; asked again, Y answered "That's already in place — nothing
 * further to change" with no tool call, and the site still showed the old words. What the model
 * remembered of its own earlier turn stood in for the site. `changedAt` is the site's
 * `siteChangedAt` (`site.last_write_at`, stamped by every write the Apply door or
 * `POST /api/sites/:key/changed` records); `lookedAt` is {@link lastSiteLookAt}.
 *
 * ⚠ THE CONVERSATION'S OWN WRITE IS STAMPED AFTER ITS CALL (e2e v8 V8-1, 30/09: `last_write_at`
 * 12:38:59.59, the write's own `tool/call` 12:38:58.447): the stamp is taken when the write lands, so by
 * time alone the turn after every write of its own read "the site changed". Times cannot tell the
 * two apart; the door can — `byThisConversation` says the last write was recorded with this
 * conversation's session (`GET /api/sites/:key/changed`, `043-site-last-write-session.sql`), and then
 * nothing changed that it did not do. Absent (an older tracy-web), times alone decide, as before.
 *
 * WHY A TURN NOTICE: the site context is the cached prefix (CS1), and "changed since you looked" is a
 * fact of this turn, like the reply language ({@link replyLanguageRule}); it travels after the
 * person's message, on every turn they speak while it holds, and stops once a site call is newer.
 * @param {{ changedAt: unknown, lookedAt: number | null, byThisConversation?: unknown }} what
 * @returns {{ text: string, summary: string } | null}
 */
export function siteChangedNotice({ changedAt, lookedAt, byThisConversation }) {
  if (typeof lookedAt !== 'number' || typeof changedAt !== 'string') return null
  if (byThisConversation === true) return null
  const at = Date.parse(changedAt)
  if (Number.isNaN(at) || at <= lookedAt) return null
  const when = `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`
  return {
    text: `The site changed since you last looked at it (another conversation or person wrote to it at ${when}): what you remember of its words may be out of date. Before saying something is already done or already reads a certain way, read it again.`,
    summary: `Site changed at ${when}, after this conversation last read it`
  }
}

/**
 * The words of the most recent message a PERSON typed in a session — the one reading of "what did
 * the customer ask" for every rule that needs their own words: the body guard's `removes` (D6′),
 * the evidence a contract slot asks for, and the replace job's quoted text.
 *
 * Same walk as {@link latestPrompter}: only a `user` source is a person. Measured on r2's logs: the
 * customer's message is followed at once by an AGENTS.md reminder (`agent-instructions`), dsh's runtime
 * snapshot and Tracy's site context (`plugin`) — all `user/message` events too, none of them the
 * customer, and any of them would pass for "the latest message" without this filter. A picked
 * element's block is not theirs either ({@link personWords}).
 *
 * @param {readonly {type?: string, data?: {source?: Record<string, any>, content?: unknown}}[] | undefined} events
 * @returns {string} the text, or '' when no person has typed in this session.
 */
export function latestCustomerWords(events) {
  if (!Array.isArray(events)) return ''
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event?.type !== 'user/message' || event.data?.source?.kind !== 'user') continue
    return personWords(event.data?.content)
  }
  return ''
}

/**
 * Every message a PERSON typed in a session, latest first — the same walk as
 * {@link latestCustomerWords}. The evidence a contract slot asks for may sit in an earlier message
 * than the one that asked for the change ("our new hotline is 0909 …" then "put it everywhere").
 * @param {readonly {type?: string, data?: {source?: Record<string, any>, content?: unknown}}[] | undefined} events
 * @returns {string[]}
 */
export function customerMessages(events) {
  if (!Array.isArray(events)) return []
  /** @type {string[]} */
  const out = []
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event?.type !== 'user/message' || event.data?.source?.kind !== 'user') continue
    const text = personWords(event.data?.content)
    if (text !== '') out.push(text)
  }
  return out
}

/**
 * How one write should leave this lane: as the person who typed, or — when nobody stamped one — as
 * the viewer, exactly as it did before.
 *
 * 🔒 ONLY THE CONFIGURED TRACY ORIGIN IS SENT TO (`origin`: the plugin config, else
 * `MCP_TRACY_ORIGIN`), ON BOTH ROUTES. A viewer's origin is its hello's `x-forwarded-host`/`host`:
 * the fleet proxy overwrites that header, but a path that reaches dsh without it (a direct port, a
 * stand) keeps whatever the caller typed. Falling back to it sent the signed assertion of the person
 * who typed — accepted by every actor door for 300 s — or a viewer's cookie to any host a caller
 * picked, and let that host answer the agent's reads. The same rule the design record keeps
 * (`designSigner`, `designGetRequest` in `design-sync.mjs`). No configured origin → null, which the
 * callers already answer as `NO_VIEWER`: nobody to act as.
 *
 * The viewer's cookie is a signed session token that tracy-web reads off the `cookie` header, so it
 * holds at the configured origin too; the Build's design GET has sent it there since #624. (On 09/09
 * a dev machine whose configured origin named production answered `NOT_SIGNED_IN` to a local cookie:
 * a wrong setting there, which the fix is to correct, not to route around through the hello's host.)
 * Every place that runs a relay sets the origin: `deploy/compose.yml` (`TRACY_ORIGIN`),
 * `compose.macos.yml` (`http://tracy-web:…`), and the fleet's `host-dsh-init.sh`.
 *
 * @param {{ prompter: { user: string, email: string } | null, viewer: { cookie: string, origin: string } | null, origin?: string | null }} what
 * @returns {{ as: 'prompter', email: string, origin: string } | { as: 'viewer', cookie: string, origin: string } | null}
 */
export function relayPlan({ prompter, viewer, origin }) {
  const tracy = typeof origin === 'string' && origin.trim() !== '' ? origin.trim() : null
  if (tracy === null) return null
  if (prompter !== null && prompter !== undefined)
    return { as: 'prompter', email: prompter.email, origin: tracy }
  if (viewer !== null && viewer !== undefined) return { as: 'viewer', cookie: viewer.cookie, origin: tracy }
  return null
}
