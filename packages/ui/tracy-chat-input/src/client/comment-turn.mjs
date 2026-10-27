/**
 * The chat turn a Browser-tab comment becomes, and the way back from that text to a chip.
 *
 * WHY TEXT. dsh's prompt wire carries only `text | image | file` parts
 * (`@deepseek-ai/dsh-api-session-controller` `types.ts`), and ui-chat draws any other part as a raw
 * JSON block. So the element travels as text the model reads directly: the person's request, one
 * fenced `tracy-element` block holding a `<mentioned-element>` descriptor, and a fixed hint line.
 * The chip in the chat is drawn by reading that block back (`commentTurnFold` over
 * `parseCommentTurn`), so what the model received and what the person sees come from the same
 * bytes, before and after a reload. The
 * chip shows plain words only (`chipLabel`, 27/09 pm): the record's name when
 * `content.locate` was sure, otherwise a quote of the element's own text — never an HTML tag or a
 * status word, although the descriptor the model reads keeps both.
 *
 * 🔒 THE LOCATE ANSWER IS READ AS THE SERVER WRITES IT. The Browser tab hands over the Apply door's
 * `content.locate` answer untouched plus `chosen` (`commentSendDetail`, dsh-better-sidebar): levels
 * `{kind, id, label, native?, writable}` innermost first, `candidates` for `candidates`/`conflict`,
 * and `chosen: {level, candidate, source}` where `level` counts the popover's crumbs OUTERMOST
 * first. Measured 27/09 on the provenance spike's Joomla data: a reader built for the mockup's
 * `{name, ref}` shape printed no id at all, dropped the candidates and the person's choice, and
 * marked the outermost record `[picked]` — the agent had to search again for what the person had
 * already pointed at. `test/comment-turn.test.mjs` now drives the real resolver's answers.
 *
 * WHERE THE AGENT'S ROAD IS SAID. Only here, in the turn that needs it, never in the `tracy_site`
 * description every step of every conversation pays for: words go to `content.replace` in one call
 * (the harness's road for words), anything else starts from the levels this block already carries.
 *
 * THE PICKED FIELD'S OWN WRITE (28/09). When `content.locate` is sure (or the person chose), the block
 * says how that one field is written — `write:` the call its level's `next` names (`content.replace`
 * at the replace job's own `at`, a contract apply with the revision it read, or a file line) — and,
 * when the element's words were cut or differ from what is stored, `value:` the stored words; `also
 * in:` names the record's twins in the site's other languages. Before, a pick whose words the picker
 * cut, or that showed twice on the page (a label in the header and the footer), cost a
 * `content.read` or an AMBIGUOUS answer before the first write. In a turn of several comments each
 * block carries its own lines; the ONE hint after the last block explains every kind of line any
 * block carries ({@link locateHintMany}).
 *
 * A PICKED PICTURE (30/09). The Browser tab names an element by the last level of a `resolved` answer,
 * the record, so `[picked]` sits where nothing writes while the picture's own field level — its slot, the
 * revision `content.locate` read, the file it holds — stayed in the levels list, and the agent went
 * looking for the slot itself. The `write:` and `value:` lines now come from that field
 * ({@link pictureFieldOf}) when it hands over a write; the chip, `kind` and `name` are unchanged, and so
 * is every turn about words.
 *
 * Kept free of React and of the page so `test/comment-turn.test.mjs` can hold it.
 */

import { messageLanguage } from '@tracy/core/language'
// The chip's words for one descriptor live in @tracy/core, so a reader outside the chat (Site
// changes' backup notes) names a mentioned element the way the chip does.
import { CHIP_EXCERPT, chipLabel, PAGE_RECORD, RECORD_PATH, storageId } from '@tracy/core/mention'

/**
 * The whole turn stays under this many characters, unless the person's own words alone pass it.
 * 2,000 since the levels carry their ids (a field id is ~100 characters); 2,500 since 29/09, when the
 * hint grew by the content-only sentence (stand E2E V2-H1) — at 2,000 the selector was folded first
 * and lost the part that told two images apart (V3-H2). 2,650 since 29/09 night, when the full
 * one-comment hint grew by 138 characters (the reply line, L8, and the reply language, L1) and the
 * many-comments hint by 75 (the language): 150 more keeps the page data the room it had in both.
 * 2,810 since 29/09 night (stand E2E stage 5 round 2, G3): the full one-comment hint grew by 157
 * characters (the `✓ answered` line and `COMMENT_ANSWERED`), the short one by 19; 160 more keeps the
 * page data its room. 3,087 since 29/09 evening (G1, the look undo): every full hint grew by
 * {@link COMMENT_LOOK_SCOPE} and its space (277), so the page data keeps the room it had
 * (`test/comment-turn.test.mjs` holds the sum). 3,441 since 29/09 late (stage-5 acceptance F4, F14):
 * every full hint grew by 344 (the per-comment {@link COMMENT_REPLY_LANGUAGE}, +159; the plain-words
 * sentence of {@link COMMENT_WRITES_ONLY}, +185) and every block by its `lang="xx"` tag (10), so the
 * page data keeps its room (`test/comment-turn-language.test.mjs` holds the sum). Stage 6 (29/09 night,
 * Rule 7): the reply line and its verbs left every hint for {@link COMMENT_ANSWER_ONE} /
 * {@link COMMENT_ANSWER_MANY}; the full one-comment hint shrank by 190 characters (2,066 → 1,876) and the
 * limit stayed, so the page data gained that room. 3,944 since the stage-6 acceptance (F5, F7): every
 * full hint gained {@link COMMENT_NAMED_BY_PAGE} and {@link COMMENT_WHAT_CHANGED} (+693, 1,876 → 2,569),
 * and the limit grew by what the hint passed stage 5's 2,066 (+503), so the page data keeps exactly
 * the room stage 5 gave it (`test/comment-turn-people.test.mjs` holds the sum). 3,973 since 23/10/2026
 * (beta week, B7): the look-undo sentences say "ask me" instead of `Undo: look.revert <id>`, which
 * customers saw as it was; every full hint grew by 29 and the limit with it.
 */
export const COMMENT_TURN_LIMIT = 3973

/** The road for words, then the road for everything else. */
const ROADS =
  'To change its words: `tracy_site` `content.replace` {find: its words as the text line shows them, replace, path: the url\'s path}, nothing read first. Anything else: start from its levels (ids included); with no levels, or if the site changed, call `tracy_site` `content.locate` {url, text, marks: the "marks:" values split at " | ", never the selector}.'
const ROADS_SHORT =
  'Words: `tracy_site` `content.replace` {find: the text line, replace, path: the url\'s path}. Else start from its levels; none → `content.locate` {url, text, marks: the "marks:" values}.'
/**
 * What the lines a sure answer adds mean, said only in a turn that carries them (`hintExtra`), so a
 * turn without them keeps the hint — and the budget — it had:
 * - `write:` the picked field's own call. Its `at` pins `content.replace` to that one field, so the
 *   same words elsewhere on the page are not an AMBIGUOUS answer — and are not named either (the job
 *   lists no `alsoIn` beside an `at`), so a request for every place is `all:true` without the `at` —
 *   only when the customer asked for every place (20/10/2026: "when Tracy fixes one place it often
 *   breaks another"; the line used to read as an offer, "for every place the words show");
 *   a contract apply carries the revision Tracy read. "none" is an answer, like the replace job's
 *   NOT_EDITABLE: say why, and do not look for another way in (the account-label case explored 26
 *   calls before stopping);
 * - `value:` the stored words whole, where the picker cut them or the page prints them otherwise;
 * - `inside:` the words inside a picked container (a card, a section) that has none of its own: they
 *   name WHICH block was picked, so the words to change or to add beside are found in it, and a new
 *   item goes after that block, never into another one (bench v6 L5-02: the agent wrote into the
 *   wrong card);
 * - `also in:` the record's twins. A fact (a phone, an e-mail, an address) and `all:true` reach the
 *   same field in every language in the same call (`replace.mjs`, `hooks.twins`); other words change
 *   per language, at the id named.
 */
/**
 * M6 (stage 3; 29/09 ~17:20): a comment asks to change words DRAWN INSIDE an image — a banner PNG
 * reading "Summer sale 30%", a logo carrying the company name. No record and no alt holds those words,
 * so the only honest answer is ✗ naming the file, and a question card offering to replace the picture —
 * never a guess, never a file edit. Said only on the image road (a block carrying an `image:` line,
 * {@link EXTRA}`.image`), in the full and the short form alike; the turn's budget grows by exactly this
 * sentence there ({@link IMAGE_WORDS_ROOM}), so no turn pays for it in bytes or page data.
 * `tracy-site-tools` `prompter.mjs` carries the same sentence in its turn rule for a turn with an
 * `image:` line (its test holds them equal).
 */
export const COMMENT_IMAGE_WORDS =
  "If the comment asks to change words drawn inside the image itself (a banner's slogan, a logo's name) and no record or alt holds them, do not guess and do not edit files: answer it `✗ the words are part of the image file <file>; changing them needs a new image` and ask with a question card whether the person wants to replace the image (upload a new one)."

/** What a turn whose block carries an `image:` line adds to its budget: {@link COMMENT_IMAGE_WORDS} and its space. */
const IMAGE_WORDS_ROOM = COMMENT_IMAGE_WORDS.length + 1

const EXTRA = Object.freeze({
  call: 'The write line is that one call for this field: send it as given, its at kept; all:true instead of at only if asked for every place.',
  callShort: 'Write line: this field; asked everywhere: all:true, no at.',
  inside:
    'The inside line is the words in the picked block: it is that block, and a new item goes after it, in the same list.',
  insideShort: 'Inside line: the picked block; new items go after it.',
  none: 'A write line "none" is the answer: say why; do not look for another way in.',
  noneShort: 'Write "none": say why.',
  value: 'The value line is its stored words, whole.',
  was: 'The was line is what it said when picked; its text line is what the page shows now.',
  wasShort: 'Was line: when picked; text line: now.',
  twins:
    'Other languages: a phone, e-mail, address or all:true reaches them in the same call; other words: at the "also in:" id.',
  twinsShort: 'Other languages: facts and all:true reach them; other words: the "also in:" id.',
  image:
    'Image line: its alt or file changes only through the level naming that image ("alt write" is the call for its alt), else `content.replace` {find: its alt words}; never another image. An "alt:" line (page prints none, or other words): change nothing, ✗ saying so. ' +
    COMMENT_IMAGE_WORDS,
  imageShort:
    'Image: its level or "alt write"; else `content.replace` {find: its alt words}; never another image; "alt:" line → ✗. ' +
    COMMENT_IMAGE_WORDS
})

/**
 * The clauses for the lines one turn carries, each with its leading space. `write` is `both` in a
 * turn of several comments where one block has a call and another has "none". `image`: a block
 * carries an `image:` line (plan "comment thread", C3) — the image road, said only then. `was`: a
 * block carries a `was:` line (F16) — the element's words when picked, beside its words now.
 * @param {{ write?: 'call' | 'none' | 'both' | '', value?: boolean, twins?: boolean, inside?: boolean,
 *   image?: boolean, was?: boolean, short: boolean }} lines
 * @returns {string}
 */
function hintExtra({
  write = '',
  value = false,
  twins = false,
  inside = false,
  image = false,
  was = false,
  short
}) {
  const parts = [
    ...(image ? [short ? EXTRA.imageShort : EXTRA.image] : []),
    ...(write === 'call' || write === 'both' ? [short ? EXTRA.callShort : EXTRA.call] : []),
    ...(write === 'none' || write === 'both' ? [short ? EXTRA.noneShort : EXTRA.none] : []),
    ...(inside ? [short ? EXTRA.insideShort : EXTRA.inside] : []),
    ...(value && !short ? [EXTRA.value] : []),
    ...(was ? [short ? EXTRA.wasShort : EXTRA.was] : []),
    ...(twins ? [short ? EXTRA.twinsShort : EXTRA.twins] : [])
  ]
  return parts.map((part) => ` ${part}`).join('')
}

/**
 * A request about the element's look. RAISE decision 2 (27/09) said "no per-element style door":
 * refuse, and offer the template's CSS only to a `code` seat. DAVID LIFTED IT ON 29/09/2026 (PR #545):
 * the person who picks an element and asks for a look wants it changed, and bench v6 measured what
 * the refusal cost — the Designer mode's pick + look cases changed nothing on any CMS (WordPress
 * 3/10, the refusals in 15–67 s), and the agent even told the owner seat that "a seat with `code`"
 * could do it. Now the agent changes it itself, the way the case needs: `page.look {style}` names
 * the rule and the token behind the value (one browser read), the change stays on THIS element
 * (its own style setting, or CSS scoped to it) unless the person asks for every one like it, and
 * the same read proves it. A seat whose road refuses still gets the door's own answer, which names
 * the seat that can.
 */
const LOOK =
  'Its look (colour, size, spacing, font): change it yourself — `page.look` {path, style} names its rule and the token; change this element only (the token only if all like it should change), then read it again.'
const LOOK_SHORT =
  'Look (colour, size, spacing, font): change it yourself; `page.look` {path, style} names the token; this element only; read again.'
/** Which status is certain — for a complete answer, and for one read from part of the site. */
const CERTAIN = 'Only status "resolved" is certain; otherwise ask the person which one.'
const CERTAIN_SHORT = 'Only "resolved" is certain.'
const PARTIAL =
  'incomplete="true": Tracy had read only part of the site, so no status is certain yet: before changing anything but its words, read the level (`content.read` {id}) or call `content.locate` again; if it still is not "resolved", ask the person which one.'
const PARTIAL_SHORT = 'incomplete="true": read a level before changing more than its words.'
/**
 * How a turn's answer is given. Until stage 5 the hint made Tracy close with a line the Comments view
 * read back — `- ✓ updated: …` / `- ✓ answered: …` / `- ✗ … (reason)`, the verb exactly "updated"
 * (stand E2E L7/L8, G3). Stage 6 (plan `tasks/todo-comment-people.md` § Rule 7, 29/09 night)
 * retired that status: "Send to Tracy" is a request in the chat, and Tracy answers it the way it
 * answers anyone there — in plain words, what it did or why it could not. `tracy-site-tools`
 * `prompter.mjs` carries the same sentence in its one-comment rule (its test holds them equal).
 */
export const COMMENT_ANSWER_ONE =
  'Answer in the chat as you would answer a person, in plain words: what you did, or what you could not do and why.'
const REPLY_SHORT =
  "Answer in plain words, in its language (`lang`), never naming it; no tool names, codes, ids or numbers; name what changed as the write's result does."

/**
 * {@link COMMENT_ANSWER_ONE} for a turn of several comments: which were done and which not, said in
 * words — a ✓ or ✗ at a line's start is allowed, never required (Rule 7). The per-number markdown
 * list (M2) is gone with the rows that read it. Same sentence in `prompter.mjs`'s list rule.
 */
export const COMMENT_ANSWER_MANY =
  'Answer in the chat as you would answer a person, in plain words, saying which you did and which you could not, and why (a ✓ or ✗ at the start of a line is fine, never required).'

/**
 * Stage-6 acceptance F5 (`tasks/evidence/comment-people/acceptance.md`, S3 and S12): Tracy answered
 * "Đã làm xong bình luận 20." and "Xong bình luận 39.", and titled a question card "Comment 107". The
 * number is the server's counter (one sequence for comments and requests, contract H1), which the
 * person never sees, and a page send creates no comment (Rule 1), so "comment 39" is nowhere in their
 * Comments tab. The number stays for the calls (`comment: <n>`, which the Apply door checks); the
 * person hears what each item is on the page. Said in every full hint; `tracy-site-tools`
 * `prompter.mjs` carries the same sentence in every comment rule (its test holds them equal).
 */
export const COMMENT_NAMED_BY_PAGE =
  'The numbers (n) are for your calls only — the person never sees them: never write one, nor "comment <n>", in your answer or in a question card; name each item by what it is on the page, quoting a few of its words (the heading "Building the groundwork…", the menu item "Services"), or "the whole page" for a `<page>` block; and what the person sent from the page is a request, not a comment — comments are only the notes people leave each other.'

/**
 * Stage-6 acceptance F7 (S1): Tracy said it changed the home page's "Vietnamese version" — the
 * request was written in Vietnamese, the post it wrote (WordPress 42) is `en`. The page and language
 * a write reached are in its result (the page it names, the path it wrote under, its note on other
 * language versions); the language of the request is not one of them. Same sentence in `prompter.mjs`.
 */
export const COMMENT_WHAT_CHANGED =
  "Name the page and language you changed only as the write's result names them (its page, its path such as /en/, its note on other language versions), never from the language the request was written in; when the result names none, name no language."

/**
 * L1 (quickstart smoke, 29/09): on an EmDash Base site the agent answered three English comments in
 * Chinese, while the same seat on Business/SaaS answered in English — nothing in the turn named the
 * reply's language, so the site's content (or the template's) could pick it. Every full hint says it,
 * right before the files sentence; the short one-comment form folds it into its answer clause.
 * `tracy-site-tools` `prompter.mjs` carries the same sentence in its turn rule (its test holds them equal).
 *
 * F4 (stage-5 acceptance, 29/09, T7): "the language the person wrote their comment in" still let one
 * Vietnamese comment set the language for three English ones after it in the same session, and one
 * answer printed the rule itself ("Reply in English since they wrote English:"). The sentence is now
 * per comment, names the language of the rest of the answer, points at the block's `lang` (the
 * comment's language when `@tracy/core/language` is sure of it) and forbids narrating the choice.
 * Stage 6 (Rule 7): "Answer each comment" — there is no longer a per-comment line to write.
 */
export const COMMENT_REPLY_LANGUAGE =
  "Answer each item in the language it was written in (its block's `lang`, else its words) and the rest of your answer in the last item's, whatever this conversation or the site used before; never say which language you use or why."

/**
 * V2-H1 (stand E2E round 2, 29/09): asked to make an image's alt print, the agent edited the Joomla
 * template's PHP (`edit` on `.webroot/templates/…/style-1.php`) and answered ✓ — a write outside the
 * Apply door's receipts, so revert could not undo it. Every comment turn says so; the many-comments
 * rule in `tracy-site-tools` `prompter.mjs` carries the same sentence (its test holds them equal).
 * Two things are NOT that failure and are excepted by name (29/09 pm): a look change, which the
 * person decided the agent makes itself on a picked element ({@link LOOK}), and the call a `write:`
 * line gives, which is Tracy's own resolved target (a language override line, a template file and
 * line the host checked). Without the exception the rule forbade both and a look request was
 * refused again.
 *
 * F14 (stage-5 acceptance, 29/09): answers showed the customer "page.look refused to read the computed
 * value (NO_BROWSER)" and "undo with apply.revert with apply_id replace-…". The last sentence now bans
 * tool and action names, error codes and receipt ids in the reply, and says how a content change's
 * undo is said: in words — the person asks and the agent reverts; there is no Undo button for it in
 * the chat. The one undo written as a call was the look change's (`COMMENT_LOOK_SCOPE`, the G1
 * decision) until 23/10/2026: in the beta week (16–23/10) eight replies showed customers
 * `Undo: look.revert <id>` as it was, so a look change too is undone by asking (B7).
 */
export const COMMENT_WRITES_ONLY =
  'Answer a comment only through `tracy_site` / `tracy_emdash` content writes (receipts the person can undo): never edit theme, template, plugin or PHP/JS/CSS files on the site for a comment, except a look change (above) or the call a `write:` line gives; if the page prints no slot for what was asked (for example an image the page prints with no alt at all), say so and go on. In your reply use plain words: never a selector, id, mark, tool or action name, error code or receipt id (not `NO_BROWSER`, not `apply.revert`) — a change, a look change too, is undone by asking you, so say that.'

/**
 * G1 (stand E2E stage 5 round 2, 29/09; decision ~17:00): "make this heading lighter" on
 * Joomla T4 edited the template's scss and recompiled `template.css` — every card on every page in
 * every language changed, and the reply said none of that. A look change is now copied before it
 * runs (`tracy-site-tools` `look-undo.mjs`) and its tool result carries `undo: <id>`; the reply says
 * how far the change reaches and gives that undo (in prose since stage 6, Rule 7 — the example was a
 * `✓ updated:` line). Said in every full hint, after
 * {@link COMMENT_WRITES_ONLY}; `tracy-site-tools` `prompter.mjs` carries the same sentence in its turn
 * rule (its test holds them equal). Since 23/10/2026 (B7) the reply says the undo in words, "ask me";
 * the id stays in the tool result, where the agent reads it.
 */
export const COMMENT_LOOK_SCOPE =
  'A look change says in plain words how far it reaches ("every card heading on every page", "this page only") and that the person can ask you to put it back, e.g. "Card headings are lighter now (weight 600 → 500) on every page and language. Ask me and I will put them back.". The undo id its write\'s result gave is for you: never in the reply.'

/**
 * The line after the block: the road for words, the road for everything else, the answer to a
 * request about the element's look, and which status is certain. ONE line that always names `tracy_site`: that is how `parseCommentTurn` and the
 * harness's reading of the customer's words (`tracy-site-tools` `prompter.mjs`) both leave it out,
 * whichever of its four forms a turn carries — this one, {@link LOCATE_HINT_INCOMPLETE}, or the
 * short form of either that a long request leaves room for ({@link locateHint}).
 */
export const LOCATE_HINT = `${ROADS} ${LOOK} ${CERTAIN} ${COMMENT_ANSWER_ONE} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`

/**
 * The hint for an answer read from part of the site (`incomplete: true` — the index was still being
 * built, or a read failed): a `resolved` is not certain then, so the agent confirms before it acts.
 */
export const LOCATE_HINT_INCOMPLETE = `${ROADS} ${LOOK} ${PARTIAL} ${COMMENT_ANSWER_ONE} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`

/**
 * What several comments in one turn add (plan "comment multi-pin", rule 4): every item done, each
 * `tracy_site` call tied to its item by `comment: <n>` — the Apply door checks that number against
 * the request the person sent and keeps it in its audit (stage 6, contract H1) — and a failure said
 * and passed. How the answer reads is {@link COMMENT_ANSWER_MANY}; the per-number list it once ended
 * with (`- 1 ✓ …`) went with the comment status (stage 6, Rule 7).
 */
const MANY =
  "Each comment's words stand right above its element, which is numbered (n): do every comment, by number; pass `comment: <n>` on every `tracy_site` or `tracy_emdash` call made for comment n, and one write that answers several comments carries `comment: [<n>, …]`; if one cannot be done, say why and go on with the next."
/**
 * The opening of the many-comments hint in turns sent before V4S-8 (30/09): its example `comment: [1, 2]`
 * was copied as real numbers — Tracy passed `comment: 1` for a request numbered 38 — so the example is a
 * placeholder now and the numbers stand only on the blocks (`n="38"`). Those turns sit in people's chat
 * history, and the chip reader still tells that hint by its opening ({@link commentTurnFold}).
 */
const MANY_BEFORE_PLACEHOLDER =
  "Each comment's words stand right above its element, which is numbered (n): do every comment, by number; pass `comment: <n>` on every `tracy_site` or `tracy_emdash` call made for comment n, and one write that answers several comments carries `comment: [1, 2]`; if one cannot be done, say why and go on with the next."
/**
 * The opening of the many-comments hint in turns sent before stage 6 — they sit in people's chat
 * history, and the chip reader still tells that hint by its opening ({@link commentTurnFold}).
 */
const MANY_BEFORE_STAGE6 =
  'The elements above are numbered (n) like the comments before them: do every comment, by number; pass `comment: <n>` on every `tracy_site` or `tracy_emdash` call made for comment n, and one write that answers several comments carries `comment: [1, 2]`; if one cannot be done, say why and go on with the next; answer with a markdown list, one bullet per number (`- 1 ✓ …`, `- 3 ✗ … (reason)`).'
/**
 * The opening of the many-comments hint in turns sent before S16 (acceptance v2, 30/09), when the person's
 * words were numbered lines at the top of the turn — they sit in people's chat history, and the chip
 * reader still tells that hint by its opening ({@link commentTurnFold}).
 */
const MANY_BEFORE_S16 =
  'The elements above are numbered (n) like the comments before them: do every comment, by number; pass `comment: <n>` on every `tracy_site` or `tracy_emdash` call made for comment n, and one write that answers several comments carries `comment: [1, 2]`; if one cannot be done, say why and go on with the next.'
const UNCHECKED =
  'status="unchecked": nothing was looked up; call `content.locate` before changing anything but its words.'
/**
 * How every form of the many-comments hint opens, up to and including the roads: the clauses for
 * `write:` / `value:` / `also in:` / `inside:` lines come after it, so this is what a reader tells
 * the hint by ({@link commentTurnFold}), whichever clauses a turn carries.
 */
const MANY_HEAD = `${MANY} For each element: `

/**
 * The line after the last block of a turn carrying several comments, when every element was looked
 * up in full. One line naming `tracy_site`, like {@link LOCATE_HINT}, so every reader of "the
 * person's words" leaves it out by the same rule.
 */
export const LOCATE_HINT_MANY = `${MANY_HEAD}${ROADS} ${LOOK} ${CERTAIN} ${COMMENT_ANSWER_MANY} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`

/**
 * {@link LOCATE_HINT_MANY} for a list where some element was not looked up, or only in part: what
 * `incomplete="true"` and `status="unchecked"` ask of the agent before it acts.
 */
export const LOCATE_HINT_MANY_INCOMPLETE = `${MANY_HEAD}${ROADS} ${LOOK} ${CERTAIN} ${PARTIAL} ${UNCHECKED} ${COMMENT_ANSWER_MANY} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`

/**
 * What a list holding a comment with no element adds (plan "comment review", contract H4): "Add a
 * comment…" in the Comments view makes a comment about a whole page, which travels as a `tracy-page`
 * block ({@link PAGE_FENCE}) naming only that page. Said only in turns that carry one, so every other
 * turn keeps its bytes.
 */
const GENERAL =
  'A `<page>` block is a comment about that whole page (its url), not one element: do it the same way, by number.'

/** {@link MANY_HEAD} for a list that holds a comment with no element. */
const MANY_HEAD_GENERAL = `${MANY} ${GENERAL} For each element: `

/** {@link LOCATE_HINT_MANY} for a list that holds a comment with no element. */
export const LOCATE_HINT_MANY_GENERAL = `${MANY_HEAD_GENERAL}${ROADS} ${LOOK} ${CERTAIN} ${COMMENT_ANSWER_MANY} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`

/** {@link LOCATE_HINT_MANY_INCOMPLETE} for a list that holds a comment with no element. */
export const LOCATE_HINT_MANY_INCOMPLETE_GENERAL = `${MANY_HEAD_GENERAL}${ROADS} ${LOOK} ${CERTAIN} ${PARTIAL} ${UNCHECKED} ${COMMENT_ANSWER_MANY} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`

/**
 * What a turn holding a reply adds (plan `tasks/todo-comment-thread.md` § "B addendum", 29/09
 * 13:30): a reply's block carries `reply-to` and the thread before it, and the thread is people
 * talking — not a list of orders. Said once, at the very END of the many-comments hint, only in turns
 * that carry a reply, so every other turn keeps its bytes and the hint's opening (which readers tell
 * it by) is untouched. `tracy-site-tools` `prompter.mjs` repeats it in its turn rule; a test holds
 * the two equal.
 *
 * F1 (stand E2E stage 5, S6 variant 2, 2/2): with only the earlier lines attributed, an owner's "A"
 * and an editor's reply "no, B" read as ONE person correcting themselves ("you first asked for A, then
 * B"), and the agent wrote B instead of asking. The reply's own author now closes the thread
 * ({@link threadLines}), and the sentence says that different names are different people.
 *
 * N1 (stage-5 acceptance round 2, 29/09): an editor's old reply sent late carried only the thread
 * before it, so the owner's later "keep it" was missing; and when the editor dismissed the question
 * card, Tracy chose on its own and wrote the editor's words. Every comment of a thread now carries the
 * whole thread (lines written after it marked `written after this one`), the latest undisputed word
 * wins, and a dismissed card writes nothing. N8 (T1): the answer called people "the site owner" — the
 * stand's account names read like roles; the sentence now asks for the line's name, never a role.
 * N2: one question per comment, opened with its number, so each comment keeps only its own question
 * (`comment-status.mjs` `questionFor`).
 *
 * Stage 6 (plan `tasks/todo-comment-people.md` § Rule 7, contract H3): two people sharing a display
 * name are printed `<name> (<e-mail local part>)` ({@link threadLines}), each earlier send of the thread
 * is a `sent to Tracy by <name> (<ago>)` line, and a dismissed card is said in words ("waits for …
 * to agree") instead of the `✗ waiting for …` line the retired status read. Stage-6 acceptance F5: the
 * card was titled "Comment 107" — N2's `Comment <n>:` opening showed the person a number they never
 * saw, so each question now opens with a few words of its element, never its number.
 */
export const COMMENT_THREAD =
  'A comment with `thread:` lines is part of a conversation between people, not a list of orders (a reply also carries `reply-to`, the comment it continues on the same element): each line names who wrote it (two people with one name get the start of their e-mail after it), the line marked `now` is the comment being sent, a line marked `written after this one` came later, a `sent to Tracy by` line is an earlier time someone sent this thread to you, and different names are different people, never one person changing their mind; read them all and act on the LAST agreed intent — a later word nobody disputed wins over an older comment sent late; if two people disagree and nobody settled it, do not choose: ask with a question card, one question per item, opened with a few words of its element (the heading "…"), never its number, naming who said what (or, when asked for advice, recommend the best option with reasons); if that card is dismissed or comes back with no choice, change nothing for that item and say it waits for <names> to agree; when you act, say whose intent you followed, by the name its line gives, never by a role such as "the owner" or "the editor".'

/**
 * What a turn holding comments pinned on the SAME element adds (round 3, 30/09): they travel as
 * ONE block — `also-n` after its `n` names the other comments in it — whose `thread:` lines are every
 * one of them oldest first, each marked `comment <n>` and followed by its replies. So the agent reads
 * them as one conversation about one element and answers them with one write carrying every number.
 * Said once, at the very END of the hint (after {@link COMMENT_THREAD}), only in turns that carry such a
 * block, so every other turn keeps its bytes and the hint's opening (which readers tell it by).
 */
export const COMMENT_GROUP =
  'A block with `also-n` holds several comments on the same element (its `n` and the `also-n` numbers): its `thread:` lines marked `comment <n>` are those comments, oldest first, each followed by its replies; read them as one conversation, act on the last agreed intent, and a write that answers them carries all their numbers (`comment: [n, …]`).'

/**
 * How long a reply's earlier `thread:` lines may be together (characters). The reply's own closing
 * line is outside it: it is capped alone at {@link THREAD_LINE_MAX}, and the turn's budget grows by it
 * ({@link buildManyTurn}). 600 until 30/09 (stage-6 acceptance TH-3): a 23-message thread sent from its
 * card reached Tracy as its last 6 replies — the comment itself and 16 replies dropped. Rule 16 / H3:
 * the WHOLE thread reaches Tracy, so the cap now fits real threads; one that still passes it keeps its
 * root and newest lines and says what it leaves out ({@link HIDDEN_LINE}).
 */
export const THREAD_MAX = 24_000

/**
 * What every thread of ONE turn may take together (characters): a Send all of twelve long threads
 * shares it, each thread getting `min(THREAD_MAX, THREAD_TURN_MAX / threads)` ({@link buildManyTurn}).
 */
export const THREAD_TURN_MAX = 60_000

/**
 * One thread line alone: a whole comment (the comment door's `limits.maxChars`, 5,000 by default) plus
 * its author, e-mail part and time. 300 until 30/09 (TH-3) cut every longer reply mid-sentence.
 */
const THREAD_LINE_MAX = 5_300

/**
 * @typedef {{ author?: unknown, at?: unknown, text?: unknown, status?: unknown, later?: unknown, sent?: unknown }} ThreadEntry
 *   one earlier comment of a thread, as the Browser tab sends it (`author` a name, or `{name?,
 *   email?}`; `at` ms); `later` — written after the comment being sent (N1); `status: 'removed'` — a
 *   parent its author removed while replies stood under it (G2); `sent: true` — not a message but an
 *   earlier Send to Tracy of this thread by `author` at `at` (stage 6, H3: the fork reads it from
 *   `site_request.comment_id`), read exactly like an item of {@link CommentItem} `sends`. Any other
 *   status (the stage-5 `done` / `failed` / `asked` of turns before stage 6) is not printed: what
 *   Tracy said lives in the chat, and Rule 7 retired the `✓ updated` words the thread line used to
 *   repeat.
 */

/**
 * @typedef {{ author?: unknown, at?: unknown }} ThreadSend
 *   one earlier time this thread was sent to Tracy (contract H3, from `site_request.comment_id`): who
 *   sent it and when (ms).
 */

/** @param {unknown} author @returns {{ name: string, local: string, key: string }} who a thread line names. */
function person(author) {
  if (typeof author === 'string') {
    const name = author.replace(/\s+/g, ' ').trim()
    return { name, local: '', key: `name:${name}` }
  }
  if (author === null || typeof author !== 'object') return { name: '', local: '', key: '' }
  const a = /** @type {Record<string, unknown>} */ (author)
  const email = typeof a.email === 'string' ? a.email.trim().toLowerCase() : ''
  const local = email.split('@')[0] ?? ''
  const given = typeof a.name === 'string' ? a.name.replace(/\s+/g, ' ').trim() : ''
  const name = given || local
  return { name, local, key: email === '' ? `name:${name}` : `email:${email}` }
}

/**
 * How each author of one thread is named on its lines: the display name, and — when two different
 * people (two e-mails) share it — `<name> (<e-mail local part>)` for each of them (Rule 7, contract
 * H3), so the agent never reads two people as one changing their mind. A name with no e-mail beside
 * it cannot be told apart and is printed as it is; a nameless author is its e-mail's local part.
 * @param {readonly unknown[]} authors - every author the lines will name, the sender included.
 * @returns {(author: unknown) => string}
 */
function namesFor(authors) {
  /** @type {Map<string, Set<string>>} */
  const keysByName = new Map()
  for (const author of authors) {
    const { name, key } = person(author)
    // Only an e-mail tells people apart; a bare name may be anyone who carries it.
    if (name === '' || !key.startsWith('email:')) continue
    keysByName.set(name, (keysByName.get(name) ?? new Set()).add(key))
  }
  return (author) => {
    const { name, local } = person(author)
    const shared = (keysByName.get(name)?.size ?? 0) > 1
    return shared && local !== '' && local !== name ? `${name} (${local})` : name
  }
}

/**
 * Every author a list of comments will name: each item's own, its thread's and its earlier senders'.
 * @param {readonly { author?: unknown, sender?: unknown, thread?: unknown, sends?: unknown }[]} items
 * @returns {unknown[]}
 */
function authorsOf(items) {
  /** @param {unknown} list @returns {unknown[]} */
  const of = (list) =>
    (Array.isArray(list) ? list : [])
      .filter((e) => e !== null && typeof e === 'object')
      .map((e) => /** @type {{ author?: unknown }} */ (e).author)
  return items.flatMap((item) => [item.author, item.sender, ...of(item.thread), ...of(item.sends)])
}

/**
 * How a turn names its people (stage 6, H3): {@link namesFor} over every author of every item, so a
 * name two people share gets its e-mail's local part everywhere that turn prints it, block heads
 * (`author="…"`) and thread lines alike.
 * @param {readonly CommentItem[]} items
 * @returns {(author: unknown) => string}
 */
function namesOf(items) {
  return namesFor(authorsOf(items))
}

/** @param {number} at @param {number} now @returns {string} "just now" · "7m ago" · "1h ago" · "2d ago" */
function ago(at, now) {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

/** @param {unknown} at @returns {at is number} */
const isTime = (at) => typeof at === 'number' && Number.isFinite(at)

/**
 * A thread as its block prints it, oldest first, without the `thread: ` prefix: each entry
 * `<author> (<when>): <words>`; one `sent to Tracy by <author> (<when>)` line per earlier send of the
 * thread — an item of `own.sends` or a thread entry with `sent: true`, the two read alike — in time
 * order among the entries (Rule 7, contract H3), each send once ({@link sameSend}); and the comment's
 * own line when its author is known (F1 — an unknown author gets no invented line): `<sender> (now):
 * <words>` last for words typed in this send ({@link typedNow}), else `<author> (<when>): <words>` in
 * time order — Send all and a row send a comment as it stands (e2e v5, V5S-7). Two people sharing a
 * display name are told apart ({@link namesFor}). Each line at most {@link THREAD_LINE_MAX}
 * characters; the earlier lines together (with their prefixes and line breaks) at most `cap`
 * ({@link THREAD_MAX}): past it the OLDEST replies are dropped first — never the ROOT (the thread's
 * first message, what the thread is about), never the newest, nor the comment's own line — and one
 * {@link HIDDEN_LINE} right after the root says how many replies are left out (TH-3).
 * @param {unknown} thread
 * @param {number} now
 * @param {{ author?: unknown, sender?: unknown, text?: unknown, sends?: unknown, deleted?: boolean, at?: unknown }} [own] - the comment being
 *   sent; `at` — when it was made (ms); `sender` — who typed its words when they are not the comment's own (a thread card), whose name
 *   its `(now)` line then carries.
 * @param {(author: unknown) => string} [names] - how the turn names a person ({@link namesOf});
 *   by default {@link namesFor} over this thread's own authors.
 * @param {number} [cap] - this thread's share of the turn ({@link THREAD_MAX} at most).
 * @param {{ key: string, at: number | null }[]} [printed] - the earlier sends a block already printed
 *   (a grouped block shares one list across its comments, {@link groupLines}); each send printed here
 *   is added to it. One send is one line (e2e v5, V5S-7): see {@link sameSend}.
 * @returns {string[]}
 */
function threadLines(thread, now, own, names, cap = THREAD_MAX, printed = []) {
  const all = /** @type {ThreadEntry[]} */ (
    (Array.isArray(thread) ? thread : []).filter((e) => e !== null && typeof e === 'object')
  )
  const list = all.filter((e) => e.sent !== true)
  // H3: a `sent: true` thread entry (the fork's shape) is an earlier send, exactly like `own.sends`.
  const listed = /** @type {ThreadSend[]} */ ([
    ...(Array.isArray(own?.sends) ? own.sends : []).filter((e) => e !== null && typeof e === 'object'),
    ...all.filter((e) => e.sent === true)
  ])
  // One earlier send is one line, however many lists name it: the item and its thread, or (a grouped
  // block) every comment that Send carried — each got its own request row at that instant.
  /** @type {ThreadSend[]} */
  const sends = []
  for (const send of listed) {
    const mark = { key: person(send.author).key, at: isTime(send.at) ? send.at : null }
    if (printed.some((p) => sameSend(p, mark))) continue
    printed.push(mark)
    sends.push(send)
  }
  const nameOf =
    names ?? namesFor([...list.map((e) => e.author), ...sends.map((e) => e.author), own?.author, own?.sender])
  /** @type {{ line: string, later: boolean, at: number | null, root?: boolean, send?: boolean }[]} */
  const entries = []
  for (const e of list) {
    const later = e.later === true
    const who = nameOf(e.author) || 'someone'
    const at = isTime(e.at) ? e.at : null
    const marks = [at === null ? '' : ago(at, now), later ? LATER_MARK : ''].filter(Boolean).join(', ')
    const when = marks === '' ? '' : ` (${marks})`
    // G2: a parent its author removed while replies stood under it — who and when, never its words.
    if (e.status === 'removed') {
      entries.push({
        line: body(`${who}${when}: ${REMOVED_LINE}`, THREAD_LINE_MAX),
        later,
        at,
        root: entries.length === 0
      })
      continue
    }
    const words = typeof e.text === 'string' ? e.text : ''
    if (words.trim() === '') continue
    entries.push({
      line: body(`${who}${when}: ${words}`, THREAD_LINE_MAX),
      later,
      at,
      root: entries.length === 0
    })
  }
  // The comment's own words as they stand (Send all, a row — e2e v5, V5S-7): nobody typed them in this
  // send, so they keep their author and time, in time order (the comment is its thread's first
  // message), never dropped. `(now)` is only for words typed now — see `typedNow`.
  const who = nameOf(own?.sender ?? own?.author)
  const words = typeof own?.text === 'string' ? own.text : ''
  const speaks = who !== '' && words.trim() !== '' && own?.deleted !== true
  if (speaks && !typedNow(own, list)) {
    const at = /** @type {number} */ (own?.at)
    const index = entries.filter((e) => e.at !== null && e.at <= at).length
    if (index === 0) for (const e of entries) e.root = false
    entries.splice(index, 0, {
      line: body(`${who} (${ago(at, now)}): ${words}`, THREAD_LINE_MAX),
      later: false,
      at,
      root: true
    })
  }
  // Each earlier send, after the last line written before it; one with no time closes the lines
  // written before the comment being sent.
  const timed = sends
    .map((send, i) => ({ send, i }))
    .sort((x, y) => (isTime(x.send.at) && isTime(y.send.at) ? x.send.at - y.send.at || x.i - y.i : x.i - y.i))
  for (const { send } of timed) {
    const at = isTime(send.at) ? send.at : null
    const line = body(
      `${SENT_LINE} ${nameOf(send.author) || 'someone'}${at === null ? '' : ` (${ago(at, now)})`}`,
      THREAD_LINE_MAX
    )
    const firstLater = entries.findIndex((e) => e.later)
    let index = firstLater === -1 ? entries.length : firstLater
    if (at !== null) {
      index = 0
      for (const [i, e] of entries.entries()) if (e.at !== null && e.at <= at) index = i + 1
    }
    const later = index > 0 ? entries[index - 1].later : false
    entries.splice(index, 0, { line, later, at, send: true })
  }
  let hidden = 0
  const size = () =>
    entries.reduce((sum, e) => sum + THREAD_PREFIX.length + e.line.length, 0) +
    Math.max(0, entries.length - 1) +
    (hidden > 0 ? THREAD_PREFIX.length + hiddenLine(hidden).length + 1 : 0)
  // The oldest go first; N1: the lines written after the comment are the latest word, so every
  // earlier line goes before any of them. TH-3: the root (what the thread is about) and the newest
  // line never go, and every reply that goes is counted.
  for (;;) {
    if (size() <= cap) break
    const open = entries.flatMap((e, i) => (e.root ? [] : [i]))
    if (open.length <= 1) break
    const first = open.find((i) => !entries[i].later) ?? open[0]
    const [gone] = entries.splice(first, 1)
    if (!gone.send) hidden += 1
  }
  if (hidden > 0) {
    const root = entries.findIndex((e) => e.root)
    entries.splice(root + 1, 0, { line: hiddenLine(hidden), later: false, at: null })
  }
  const cut = entries.findIndex((e) => e.later)
  const before = (cut === -1 ? entries : entries.slice(0, cut)).map((e) => e.line)
  const after = cut === -1 ? [] : entries.slice(cut).map((e) => e.line)
  // Round 3: words typed in a thread card are the sender's, not the comment author's.
  // Server round 5: a deleted root being sent has no words of anyone's now — no `(now)` line.
  const mine =
    speaks && typedNow(own, list)
      ? [
          body(
            `${who} (${after.length > 0 ? 'now, written before the lines after it' : 'now'}): ${words}`,
            THREAD_LINE_MAX
          )
        ]
      : []
  return [...before, ...mine, ...after]
}

/**
 * Whether the comment being sent carries words typed in THIS send (its `(now)` line) rather than its
 * words as they stand (e2e v5, V5S-7: Send all labelled a 3-hour-old comment `(now)`). Typed: a sender
 * is named (words typed in a thread card, `typedByOf` in `comment-send.mjs`); the thread quotes the
 * comment itself — a card sends its first message among the lines, so `text` is new words even when no
 * sender is known; or no time is given for the comment (a v1/v2 reply, sent as it is written — nothing
 * to print but `now`). Otherwise (Send all, a row: the replies under it as the thread, its `at`) the
 * words are the comment's own, from when it was made.
 * @param {{ author?: unknown, sender?: unknown, at?: unknown } | undefined} own
 * @param {readonly ThreadEntry[]} list - the thread's messages (no sends).
 * @returns {boolean}
 */
function typedNow(own, list) {
  if (own?.sender !== undefined && own.sender !== null) return true
  if (!isTime(own?.at)) return true
  const self = person(own?.author).key
  return list.some((e) => e.at === own?.at && person(e.author).key === self)
}

/**
 * How far apart two listed sends may be and still be ONE send (ms). A Send all numbers every comment
 * it carries in one `POST /requests`, one `site_request` row each; a grouped block lists that send once
 * per comment. One person sending the same thread twice within a minute is the same intent too.
 */
const SAME_SEND_MS = 60_000

/**
 * @param {{ key: string, at: number | null }} a
 * @param {{ key: string, at: number | null }} b
 * @returns {boolean} whether two listed sends are one send: the same person, within {@link SAME_SEND_MS}
 *   (two with no time: the same person).
 */
function sameSend(a, b) {
  if (a.key !== b.key) return false
  if (a.at === null || b.at === null) return a.at === b.at
  return Math.abs(a.at - b.at) < SAME_SEND_MS
}

/**
 * The line a thread too long for its cap carries right after its root (TH-3): how many earlier replies
 * the turn leaves out, so Tracy knows it does not see the whole thread. The chat bubble shows it too.
 * @param {number} count
 * @returns {string}
 */
function hiddenLine(count) {
  return `… ${count} earlier ${count === 1 ? 'reply' : 'replies'} not shown …`
}

/** Reads {@link hiddenLine} back from a thread line. */
const HIDDEN_LINE = /^… \d+ earlier repl(?:y|ies) not shown …$/

/** How an earlier send of the thread opens its line (contract H3), before the sender's name. */
const SENT_LINE = 'sent to Tracy by'

/** How a thread line written after the comment being sent is marked (N1). */
const LATER_MARK = 'written after this one'

/** What a removed thread entry says in place of its words (G2). */
const REMOVED_LINE = '[comment removed by its author]'

/** The prefix of one thread line in a reply's block. */
const THREAD_PREFIX = 'thread: '

/**
 * What the lines a turn carries add to its hint (`write:`, `value:`, `also in:`, `inside:`; see
 * `hintExtra`) — none of them for a turn that carries none, which is the plain form.
 * @typedef {{ write?: 'call' | 'none' | 'both' | '', value?: boolean, twins?: boolean,
 *   inside?: boolean, image?: boolean, was?: boolean }} HintLines
 */

/**
 * The hint line for one turn: one of the four forms, and after its roads the clauses for the lines
 * this turn carries (`write:`, `value:`, `also in:`, `inside:`; `hintExtra`).
 * @param {{ incomplete: boolean, short: boolean } & HintLines} form
 * @returns {string}
 */
export function locateHint({
  incomplete,
  short,
  write = '',
  value = false,
  twins = false,
  inside = false,
  image = false,
  was = false
}) {
  const extra = hintExtra({ write, value, twins, inside, image, was, short })
  if (!short)
    return `${ROADS}${extra} ${LOOK} ${incomplete ? PARTIAL : CERTAIN} ${COMMENT_ANSWER_ONE} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`
  return `${ROADS_SHORT}${extra} ${LOOK_SHORT} ${incomplete ? PARTIAL_SHORT : CERTAIN_SHORT} ${REPLY_SHORT}`
}

/**
 * The hint line for a turn of several comments: {@link LOCATE_HINT_MANY} or
 * {@link LOCATE_HINT_MANY_INCOMPLETE}, and after the roads the clauses for every kind of line ANY of
 * its blocks carries — said once, the way the rest of the hint is (each clause is about "the X line",
 * whichever block it sits in). No short form: a turn of several comments has its own budget.
 * With `general` (the list holds a comment about a whole page, H4) it opens with
 * {@link MANY_HEAD_GENERAL}: {@link LOCATE_HINT_MANY_GENERAL} / {@link LOCATE_HINT_MANY_INCOMPLETE_GENERAL}.
 * @param {{ unsure: boolean, general?: boolean } & HintLines} form - `unsure`: some element was not
 *   looked up, or only in part; `general`: some item is a `tracy-page` block.
 * @returns {string}
 */
export function locateHintMany({
  unsure,
  general = false,
  write = '',
  value = false,
  twins = false,
  inside = false,
  image = false,
  was = false
}) {
  const extra = hintExtra({ write, value, twins, inside, image, was, short: false })
  const status = unsure ? `${CERTAIN} ${PARTIAL} ${UNCHECKED}` : CERTAIN
  return `${general ? MANY_HEAD_GENERAL : MANY_HEAD}${ROADS}${extra} ${LOOK} ${status} ${COMMENT_ANSWER_MANY} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`
}

/** The fence name of the block, as dsh's user-text fold registry is told it (`COMMENT_FOLD`). */
export const COMMENT_FENCE = 'tracy-element'
const FENCE_OPEN = `\`\`\`${COMMENT_FENCE}`
const FENCE_CLOSE = '```'
const HEAD = 'mentioned-element'

/**
 * The fence of a comment about a whole page (plan "comment review", H4): ONE head line
 * `<page n="k" url="…" path="/about">` and its end tag, no body. It sits where an element's block
 * would, so the hint still follows the last block and dsh's fold can hide it; its chip is the path.
 */
export const PAGE_FENCE = 'tracy-page'

/**
 * Per-field caps, before the whole-turn budget trims further. `text` is the picker's own limit;
 * `value` the stored words a field level carries (`LEVEL_VALUE_CHARS`, `content-locate.js`); `address`
 * one id, key or file in a write line — past it the line is left out, never printed cut.
 */
const CAP = Object.freeze({
  url: 300,
  selector: 240,
  name: 120,
  ref: 160,
  text: 300,
  inside: 200,
  value: 1000,
  address: 200,
  why: 240,
  imageFile: 80,
  alt: 160,
  // The resolver's WordPress sentence is ~690 characters since it names content.replace for theme
  // words with the page's path in the call (30/09); room for that path at the url's own cap.
  notInContent: 1000,
  mark: 120,
  marks: 12,
  levels: 8,
  candidates: 5,
  alternates: 3
})

/**
 * Status words a descriptor may carry: the `content.locate` states, plus `unchecked` (no answer). A
 * locate answering `unavailable` (server round 5: the site has no Content API yet, 200
 * `CONTENT_ADAPTER_UNSUPPORTED`) is written `unchecked` — to the agent it is exactly that: nothing was
 * looked up, and a `content.locate` of its own may still find the words' record.
 */
const STATUSES = new Set(['resolved', 'candidates', 'conflict', 'unconfirmed', 'unknown', 'unchecked'])

/** What a block's `status` may read as: {@link STATUSES}, and `unavailable`, read like `unchecked`. */
const READ_STATUSES = new Set([...STATUSES, 'unavailable'])

/** The six provenance kinds (plan "comment to edit", decision 2). Anything else is not printed. */
const KINDS = new Set(['record', 'field', 'block', 'string', 'file', 'style'])

/**
 * Whitespace folded, a fence run broken, length capped.
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function fold(value, max) {
  if (typeof value !== 'string') return ''
  const flat = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/`{3,}/g, (run) => "'".repeat(run.length))
  const chars = Array.from(flat)
  if (chars.length <= max) return flat
  // One closing "…" wherever the cut falls: a text the picker already cut ends in one of its own.
  return `${chars
    .slice(0, max - 1)
    .join('')
    .replace(/[\s…]+$/u, '')}…`
}

/**
 * Like {@link fold}, but a cut keeps the END: a CSS selector's last steps name the element.
 * @param {string} flat - already folded.
 * @param {number} max
 * @returns {string}
 */
function foldTail(flat, max) {
  const chars = Array.from(flat)
  if (chars.length <= max) return flat
  return `…${chars
    .slice(chars.length - (max - 1))
    .join('')
    .replace(/^[\s…]+/u, '')}`
}

/** @param {string} value - markup characters escaped for an attribute value. */
function escapeAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * One attribute value of the descriptor head: folded, then markup characters escaped.
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function attr(value, max) {
  const escaped = escapeAttr(fold(value, max))
  if (escaped.length <= 2 * max) return escaped
  // SEND-v4-new-6: markup for a label (quotes, brackets) grows up to six-fold once escaped; cut it by
  // its escaped length, never inside an entity.
  let out = ''
  for (const ch of Array.from(fold(value, max))) {
    const next = escapeAttr(ch)
    if (out.length + next.length > 2 * max - 1) break
    out += next
  }
  return `${out}…`
}

/**
 * One line of the block's body: folded, and kept as the page shows it — the agent quotes the text
 * line to `content.replace`, which finds words exactly, so `&`, quotes and brackets stay themselves.
 * Only the descriptor's own tag is broken, so page text can never look like its end.
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function body(value, max) {
  return fold(value, max).replace(/<(\/?)mentioned-element/gi, '‹$1mentioned-element')
}

/** @param {string} value */
function unescape(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * @typedef {{ kind?: unknown, id?: unknown, label?: unknown, name?: unknown, ref?: unknown,
 *   native?: unknown, writable?: unknown, why?: unknown, value?: unknown, valueCut?: unknown,
 *   next?: unknown, alternates?: unknown, image?: unknown }} LocateLevel
 *   `image` on an image field level: its media record, stored alt and what the page prints (`imageFactsOf`).
 *   `value`, `valueCut`, `next` on a field, string or file level and `alternates` on a record level:
 *   the write target `content.locate` gives (`content-locate.js` `levelsOf`, `unitLevels`).
 * @typedef {{ level?: unknown, candidate?: unknown, source?: unknown }} LocateChoice
 * @typedef {{ status?: unknown, levels?: unknown, candidates?: unknown, chosen?: unknown,
 *   incomplete?: unknown, hint?: unknown, next?: unknown }} LocateAnswer
 * @typedef {{ url?: unknown, selector?: unknown, label?: unknown, text?: unknown, inside?: unknown,
 *   marks?: unknown, image?: unknown, was?: unknown }} CommentElement
 *   `image`: `{src, alt}` the picker read off a picked picture (`tracy-cms-preview` `pick.mjs`), as the
 *   Browser tab's v2 send carries it.
 *   `was` (F16): the element's words when it was picked, sent beside `text` = its words NOW when the
 *   Browser tab can read both; printed as a `was:` line only when they differ. No sender has it yet.
 */

/** @param {unknown} value @returns {LocateLevel[]} */
const objects = (value) =>
  Array.isArray(value) ? value.filter((l) => l !== null && typeof l === 'object') : []

/** @param {LocateLevel} level */
function levelName(level) {
  return typeof level.label === 'string' ? level.label : typeof level.name === 'string' ? level.name : ''
}

/**
 * The CMS's own name for a level (`native`, when the Claude Cowork plugin gives one), as the chip
 * and the agent read it: `menuItem #601`, or a key.
 * @param {LocateLevel} level
 * @returns {string}
 */
function nativeOf(level) {
  const first = Array.isArray(level.native)
    ? level.native.find((n) => n && typeof n === 'object')
    : level.native
  if (!first || typeof first !== 'object') return ''
  const n = /** @type {Record<string, unknown>} */ (first)
  const kind = typeof n.kind === 'string' ? n.kind : ''
  const id =
    typeof n.id === 'number' || typeof n.id === 'string' ? `#${n.id}` : typeof n.key === 'string' ? n.key : ''
  return kind && id ? `${kind} ${id}` : ''
}

/** @param {LocateLevel} level @returns {string} the id the agent passes back (`content.read {id}`). */
const idOf = (level) => (typeof level.id === 'string' ? level.id : '')

/**
 * The answer as this turn prints it: which level (or candidate) the person settled on.
 *
 * - `levels` are innermost first; the popover opens on the innermost and `chosen.level` counts its
 *   crumbs outermost first, so the server index is `levels.length - 1 - chosen.level` — checked
 *   against the element's label (the crumb's own label, `commentSendDetail`) and found by that
 *   label when the count does not hold.
 * - `candidates` / `conflict`: the person's pick is `chosen.candidate`, or for a conflict
 *   `chosen.source` — the resolver lists the page mark's record first, then the words' record.
 * - `incomplete`: the answer was read from part of the site (`content-locate.js`: a snapshot still
 *   being built, a failed read). Its status is kept — it is still the best lead — and said to be
 *   partial, so neither the agent nor the chip takes a `resolved` from it as certain.
 * @param {LocateAnswer | null | undefined} locate
 * @param {string} label - the element's label as the popover sent it.
 * @returns {{ status: string, incomplete: boolean, levels: LocateLevel[], candidates: LocateLevel[],
 *   picked: number, chosen: number, notInContent: string }} `notInContent`: the resolver's `next`
 *   for words in no record (`hint: 'not-in-content'`), or '' when it gave none.
 */
function readLocate(locate, label) {
  if (locate === null || typeof locate !== 'object')
    return {
      status: 'unchecked',
      incomplete: false,
      levels: [],
      candidates: [],
      picked: -1,
      chosen: -1,
      notInContent: ''
    }
  const status =
    typeof locate.status === 'string' && STATUSES.has(locate.status) ? locate.status : 'unchecked'
  const levels = objects(locate.levels)
  const candidates = objects(locate.candidates)
  const choice = /** @type {LocateChoice} */ (
    locate.chosen && typeof locate.chosen === 'object' ? locate.chosen : {}
  )

  let picked = levels.length > 0 ? 0 : -1
  if (Number.isInteger(choice.level)) {
    const at = levels.length - 1 - /** @type {number} */ (choice.level)
    if (at >= 0 && at < levels.length) picked = at
  }
  if (label !== '' && picked >= 0 && levelName(levels[picked]) !== label) {
    const byLabel = levels.findIndex((l) => levelName(l) === label)
    if (byLabel >= 0) picked = byLabel
  }

  let chosen = -1
  if (status === 'conflict') chosen = choice.source === 'stamp' ? 0 : choice.source === 'value' ? 1 : -1
  else if (Number.isInteger(choice.candidate)) chosen = /** @type {number} */ (choice.candidate)
  if (chosen >= candidates.length) chosen = -1
  // 29/09/2026 (imported sites): the words are in no record of a site read whole; the resolver's
  // sentence names the road (30/09: content.replace for words a theme holds, a language string, or
  // the runtime case) and never a theme file to edit (`content-locate.js` `notInContentNext`).
  const notInContent =
    status === 'unknown' &&
    locate.incomplete !== true &&
    locate.hint === 'not-in-content' &&
    typeof locate.next === 'string'
      ? locate.next
      : ''
  return { status, incomplete: locate.incomplete === true, levels, candidates, picked, chosen, notInContent }
}

/**
 * One level or candidate as a body line: kind, label, id, the CMS's own name, and whether this
 * seat may write it — so a seat that cannot is told before the agent tries.
 * @param {LocateLevel} level
 * @param {string} mark - ` [picked]` / ` [chosen]` / ''.
 */
function levelLine(level, mark) {
  const k = typeof level.kind === 'string' && KINDS.has(level.kind) ? level.kind : 'unknown'
  const id = idOf(level) || (typeof level.ref === 'string' ? level.ref : '')
  const native = nativeOf(level)
  return [
    `- ${k} "${body(levelName(level), CAP.name)}"`,
    ...(id ? [` id=${body(id, CAP.ref)}`] : []),
    ...(native ? [` (${body(native, CAP.name)})`] : []),
    ...(level.writable === false ? [' — this seat cannot write it'] : []),
    mark
  ].join('')
}

/**
 * One id, key or path for a write line, quoted as JSON — or null when it is not a short plain string:
 * a write line that named a cut id would be a call that fails.
 * @param {unknown} value
 * @returns {string | null}
 */
function address(value) {
  if (typeof value !== 'string' || value === '' || /\s/.test(value)) return null
  return Array.from(value).length <= CAP.address ? JSON.stringify(value) : null
}

/**
 * The picked level's own write, as one line: the call its `next` names (`content-locate.js`
 * `nextOf` / `recipeOf`), or — for a level no road writes — why not. Empty when it says neither.
 * - `content.replace` at the replace job's own address for that field: the agent adds the words;
 * - one contract apply of the slot, with the content revision `content.locate` read (a pick has no
 *   `content.read` in the conversation, so Tracy could not fill it and would inspect first);
 * - a file: a Joomla override line to write, a template's file and line, or EmDash template source
 *   through the site's shell and then its rebuild.
 * @param {LocateLevel} level
 * @returns {string}
 */
function writeOf(level) {
  const next = /** @type {Record<string, unknown> | null} */ (
    level.next !== null && typeof level.next === 'object' ? level.next : null
  )
  if (next?.action === 'content.replace' && Array.isArray(next.at) && next.at.length === 1) {
    const at = address(next.at[0])
    if (at) return `content.replace {find, replace, path, at:[${at}]}`
  }
  if (next?.action === 'content.contract' && next.operation === 'apply') {
    const changes = next.changes !== null && typeof next.changes === 'object' ? Object.keys(next.changes) : []
    const slot = changes.length === 1 ? address(changes[0]) : null
    const revisions = /** @type {Record<string, unknown>} */ (
      next.expected_content_revisions !== null && typeof next.expected_content_revisions === 'object'
        ? next.expected_content_revisions
        : {}
    )
    const based = Object.entries(revisions).map(([id, revision]) => [address(id), address(revision)])
    if (slot && based.every(([id, revision]) => id && revision))
      return `content.contract {operation:"apply", changes:{${slot}:"<new value>"}${
        based.length > 0
          ? `, expected_content_revisions:{${based.map(([id, revision]) => `${id}:${revision}`).join(', ')}}`
          : ''
      }}`
  }
  if (typeof next?.edit === 'string' && address(next.edit)) {
    const where = `${next.edit}${
      Number.isInteger(next.line) ? ` line ${next.line}` : address(next.key) ? ` key ${next.key}` : ''
    }`
    if (typeof next.write === 'string')
      return Number.isInteger(next.line)
        ? `${where}: ${next.write} (the key's own line)`
        : `${where}: add the line ${next.write}`
    if (next.through === 'shell')
      return `in the site's shell (file tools cannot reach it), edit ${where}${
        typeof next.after === 'string' ? `, then ${next.after}` : ''
      }`
    return `edit ${where}`
  }
  if (level.writable === false && typeof level.why === 'string' && level.why.trim() !== '')
    return `none — ${fold(level.why, CAP.why)}`
  return ''
}

/**
 * The twins `content.locate` named on the answer's record level — each language and the id to read
 * there — at most {@link CAP}.alternates, then how many more.
 * @param {LocateLevel[]} levels
 * @returns {string}
 */
function alsoOf(levels) {
  const record = levels.find((level) => level.kind === 'record' && Array.isArray(level.alternates))
  const twins = objects(record?.alternates)
    .map((one) => /** @type {Record<string, unknown>} */ (one))
    .filter((one) => address(one.locale) && address(one.id))
  if (twins.length === 0) return ''
  const shown = twins.slice(0, CAP.alternates).map((one) => `${one.locale} → ${one.id}`)
  const more = twins.length - shown.length
  return `${shown.join(' | ')}${more > 0 ? ` (+${more} more on the record)` : ''}`
}

/**
 * Words with their runs of whitespace as one space, to tell whether the stored words differ from the
 * element's own.
 * @param {unknown} value
 */
const flat = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')

/**
 * The `image:` line of a picked picture (plan "comment thread", C3): its file name and the alt the page
 * prints — `image: proj-ru-2.png · alt "Project photo · 4:3"`, `… · no alt printed`. A name made only of
 * storage ids (an EmDash `<ULID>.<ULID>.png`) says nothing and is left out; with neither a usable name
 * nor a picture, no line. Before (stand E2E 29/09, V3-H2 / V4-M1) an image's block carried no picture at
 * all: once its selector was cut, nothing told two cards apart, and the alt words `content.replace`
 * finds by were not there to quote.
 * @param {unknown} image - `CommentElement.image`.
 * @param {number} [fileCap] - how long the file name may be ({@link NAME_FLOOR} once the budget shortened it).
 * @returns {string}
 */
function imageLineOf(image, fileCap = /** @type {number} */ (CAP.imageFile)) {
  if (image === null || typeof image !== 'object') return ''
  const { src: raw, alt } = /** @type {{ src?: unknown, alt?: unknown }} */ (image)
  if (typeof raw !== 'string' || raw.trim() === '') return ''
  // SEND-v4-new-6 (e2e v4): a picture's src can be its bytes (a data URI, kilobytes of base64) or a
  // srcset. Neither is a name: an inline picture says so and never its bytes; a srcset is named by its
  // first address.
  const inline = /^(data|blob):/i.exec(raw.trim())
  const src = raw.trim().split(/[\s,]+/)[0]
  let file = inline ? '' : (src.split(/[?#]/)[0].split('/').pop() ?? '')
  try {
    file = decodeURIComponent(file)
  } catch {}
  const name = inline
    ? `inline picture (${inline[1].toLowerCase()}: URI)`
    : file !== '' && !storageId(file)
      ? body(file, fileCap)
      : ''
  const printed = typeof alt === 'string' ? fold(alt, CAP.alt) : ''
  const altPart = printed === '' ? 'no alt printed' : `alt "${body(printed, CAP.alt)}"`
  return name === '' ? altPart : `${name} · ${altPart}`
}

/**
 * What a sure image field level says about the picture's alt (`content-locate.js` `imageFactsOf`), as
 * one line: the one call that writes it (`alt write:`), or that this page does not print it (`alt:` —
 * none printed, or another field's words). Empty when the level says neither.
 * @param {LocateLevel | undefined} level
 * @returns {{ key: 'alt write' | 'alt', line: string } | null}
 */
function altOf(level) {
  const facts = /** @type {Record<string, unknown> | null} */ (
    level && level.image !== null && typeof level.image === 'object' ? level.image : null
  )
  if (!facts) return null
  const next = /** @type {Record<string, unknown> | null} */ (
    facts.next !== null && typeof facts.next === 'object' ? facts.next : null
  )
  if (next?.action === 'content.replace' && Array.isArray(next.at) && next.at.length === 1) {
    const at = address(next.at[0])
    if (at) return { key: 'alt write', line: `content.replace {find: its alt, replace, path, at:[${at}]}` }
  }
  const stored = typeof facts.alt === 'string' ? fold(facts.alt, CAP.alt) : ''
  const notShown = stored === '' ? '' : `; the stored alt "${stored}" is not shown on this page`
  if (facts.printed === 'none') return { key: 'alt', line: `the page prints none here${notShown}` }
  if (facts.printed === 'other') {
    const from = typeof facts.from === 'string' && facts.from !== '' ? fold(facts.from, CAP.name) : ''
    return {
      key: 'alt',
      line: `${from ? `the page prints its ${from} field here` : 'the page prints other words here'}${notShown}`
    }
  }
  return null
}

/**
 * The field level of a picked PICTURE — an element with a picture's address and no words of its own — or
 * undefined. The Browser tab names an element by the LAST level of a `resolved` answer (`resolvedLabel`),
 * the record, so `readLocate` puts `[picked]` there: a level no road writes, while the picture's slot, its
 * revision and the file it holds sit on the field level above it (`content-locate.js` `levelsOf`). That
 * field is the level to write. Only the write and the stored file come from it: the chip, `kind` and
 * `name` stay the ones the tab named, and an element with words is a text pick, whatever else it carries.
 *
 * Only a field that hands the agent a write counts (a call, or "none" and why). One with nothing to call
 * — an EmDash image field (that CMS has no slot), a field no slot names, a seat that may not write it —
 * would add the stored file alone, an address with no road to it, so such a pick stays as it was before.
 * @param {CommentElement} element
 * @param {LocateLevel[]} levels - the answer's levels, innermost first.
 * @returns {LocateLevel | undefined}
 */
function pictureFieldOf(element, levels) {
  const image = /** @type {{ src?: unknown } | null | undefined} */ (element.image)
  const picture =
    image !== null && typeof image === 'object' && typeof image.src === 'string' && image.src !== ''
  if (!picture || flat(element.text) !== '') return undefined
  const field = levels.find((level) => level.kind === 'field')
  return field !== undefined && writeOf(field) !== '' ? field : undefined
}

/** How far a selector is shortened (never further: it is never dropped), and the text line's shortest form. */
const SELECTOR_SHORT = 100
const TEXT_FLOOR = 80
/**
 * How short the head's `name` / `label` and the `image:` line's file name get before the selector is
 * touched (round 5 leftover, 30/09): an image with no alt is named by its file, and a long file name
 * cost the block its selector.
 */
const NAME_FLOOR = 40

/** A colour the server may send for a person: a plain hex, nothing a style could be smuggled through. */
const HEX_COLOUR = /^#[0-9a-f]{6}$/i

/**
 * The colour of a comment's author as the server decided it (`personFace`, keyed by account; the
 * `color` of `author`, `sends[].author`), for the head's `author-color`; '' when it sent none.
 * @param {unknown} author
 * @returns {string}
 */
function authorColourOf(author) {
  if (author === null || typeof author !== 'object') return ''
  const color = /** @type {{ color?: unknown }} */ (author).color
  return typeof color === 'string' && HEX_COLOUR.test(color) ? color : ''
}

/**
 * One element's descriptor, kept as parts so a budget can take them away one at a time: the head's
 * attributes, the text line, the container's words, the stored words, the write line, the twins, the
 * marks, the levels and the candidates. `block(n)` renders the fenced block — with `n` as the head's
 * FIRST attribute when the turn carries several comments.
 *
 * `write:`, `value:` and `also in:` are printed only for a level Tracy is sure of — a complete
 * `resolved` answer, or the one the person chose — as the hint's certainty rule says of every status.
 * The `write:` line is never trimmed: it is one call, and a cut call fails.
 *
 * A reply (`reply`) adds `reply-to="<parent n>"` right after `n` and its `thread:` lines first in the
 * body; they are never trimmed by the budget (the thread has its own cap, {@link THREAD_MAX}).
 *
 * `lang` (F4): the language of the comment's own words (`messageLanguage`, `@tracy/core/language`), the head's LAST
 * attribute — `lang="en"` — so every reader that opens on `n` / `reply-to` reads the head as before;
 * none when the reading is not sure. Never trimmed: it is ten characters, and the reply's language
 * hangs on it.
 * @param {CommentElement} element
 * @param {LocateAnswer | null | undefined} locate
 * @param {{ replyTo?: number, lines: string[], also?: number[] } | undefined} reply - a comment of a thread: `reply-to` (a reply only) and its `thread:` lines;
 *   `also` — a block holding several comments on this element ({@link groupsOf}): the numbers after its own.
 * @param {string} [lang]
 * @param {string} [author] - who wrote the comment (stage 6), the head's very last attribute
 *   (`author="Lee"`): the chat chip draws that person's bubble. None for turns before stage 6.
 * @param {string} [authorColor] - that person's colour as the server decided it ({@link authorColourOf}),
 *   right after `author` (`author-color="#4f46e5"`): the chip paints it as sent. None when the server
 *   sent no colour, and on turns before the faces work (their chips fall back to the neutral grey).
 */
function describe(element, locate, reply, lang = '', author = '', authorColor = '') {
  const label = typeof element.label === 'string' ? element.label : ''
  const answer = readLocate(locate, label)
  const picked =
    answer.chosen >= 0
      ? answer.candidates[answer.chosen]
      : answer.picked >= 0
        ? answer.levels[answer.picked]
        : undefined
  const kind = picked && typeof picked.kind === 'string' && KINDS.has(picked.kind) ? picked.kind : ''
  const name = (picked && levelName(picked)) || label
  // F10 (stage-6 acceptance): an answer that names only the PAGE the element sits on — one level, a
  // page or an article — says where it is, not what it is (a logo chipped as `page "Home"`). The
  // Browser tab's own label for the element then rides the head as `label`, and the chip prefers it
  // (`chipLabel`). V5S-5 (acceptance v5): the same when the name is a level's crumb (`Home › hero.img`,
  // a record, `›`, a field key) — words for the agent, never for a person; the fork's plain label for
  // the element (its alt, else `image`) names the chip instead. Only in those cases, so every other
  // head keeps its bytes.
  const own =
    picked &&
    ((answer.levels.length === 1 && PAGE_RECORD.test(name)) || RECORD_PATH.test(name)) &&
    label.trim() !== '' &&
    label !== name &&
    !RECORD_PATH.test(label)
      ? label
      : ''
  const ref = picked ? nativeOf(picked) || (typeof picked.ref === 'string' ? picked.ref : '') : ''
  const sure = answer.chosen >= 0 || (answer.status === 'resolved' && !answer.incomplete)
  // The level the `write:` and `value:` lines come from: the picked one, except for a picked picture,
  // which is written through its own field (`pictureFieldOf`). `[picked]`, `kind`, `name` and `ref`
  // stay on `picked` — the chip does not change — and a candidate the person chose is never replaced.
  const source = (sure && answer.chosen < 0 ? pictureFieldOf(element, answer.levels) : undefined) ?? picked
  const write = sure && source ? writeOf(source) : ''
  const stored =
    sure && source && typeof source.value === 'string' && flat(source.value) !== flat(element.text)
      ? source.value
      : ''
  const storedChars = Array.from(flat(stored)).length
  let imageLine = imageLineOf(element.image)
  /** The cap of the head's `name` / `label` now ({@link NAME_FLOOR} once shortened). */
  let nameCap = /** @type {number} */ (CAP.name)
  // The image facts are the element's, whichever crumb is picked: a sure pick is named by its record
  // (the Browser tab's `resolvedLabel`), so `[picked]` sits above the image field that carries them.
  const imageLevel = sure
    ? [picked, ...answer.levels].find(
        (level) => level && level.image !== null && typeof level.image === 'object'
      )
    : undefined
  const alt = altOf(imageLevel)
  const selectorWhole = fold(element.selector, CAP.selector)
  const pageText = body(element.text, CAP.text)
  // F16: the words when picked, when the sender says the page reads otherwise now.
  const was =
    flat(element.was) !== '' && flat(element.was) !== flat(element.text) ? body(element.was, CAP.text) : ''
  const d = {
    answer,
    selectorWhole,
    selector: selectorWhole,
    marks: Array.isArray(element.marks)
      ? element.marks
          .slice(0, CAP.marks)
          .map((m) => body(m, CAP.mark))
          .filter(Boolean)
      : [],
    /** Each line with its trim order: the picked / chosen line is never dropped. */
    levels: answer.levels.slice(0, CAP.levels).map((level, i) => ({
      line: levelLine(level, i === answer.picked && answer.chosen < 0 ? ' [picked]' : ''),
      keep: i === answer.picked
    })),
    candidates: answer.candidates.slice(0, CAP.candidates).map((level, i) => ({
      line: levelLine(level, i === answer.chosen ? ' [chosen]' : ''),
      keep: i === answer.chosen
    })),
    pageText,
    /** @param {number} chars */
    shortenText: (chars) => {
      d.pageText = body(element.text, chars)
    },
    /** A container's words: only for an element with no text of its own (the picker sends both never). */
    insideText: pageText === '' ? body(element.inside, CAP.inside) : '',
    /** The element's words when picked (F16), beside `text:` — its words now; '' for none. */
    wasText: was,
    write,
    /** The record's twins, for a level Tracy is sure of that the person did not pick among candidates. */
    also: sure && answer.chosen < 0 ? alsoOf(answer.levels) : '',
    /** How many characters of the stored words the `value:` line prints now (0: none). */
    valueChars: Math.min(storedChars, CAP.value),
    /**
     * The head's `name` / `label` and the `image:` line's file name, down to {@link NAME_FLOOR}.
     * @returns {boolean} true when it shortened anything.
     */
    shortenNames: () => {
      const before = [nameCap, imageLine]
      nameCap = NAME_FLOOR
      imageLine = imageLineOf(element.image, NAME_FLOOR)
      const longer = (/** @type {string} */ v) => Array.from(fold(v, CAP.name)).length > NAME_FLOOR
      return (before[0] !== nameCap && (longer(name) || longer(own))) || before[1] !== imageLine
    },
    /**
     * Shorter stored words: to what is left of the budget, never below the floor — then, when it is
     * the floor already, left out.
     * @param {number} excess - how many characters the turn is over its budget.
     */
    shortenValue: (excess) => {
      d.valueChars = d.valueChars > TEXT_FLOOR ? Math.max(TEXT_FLOOR, d.valueChars - excess) : 0
    },
    /**
     * The lines this element carries now, as the hint names them (a line trimmed away takes its
     * clause along).
     * @returns {Required<HintLines>}
     */
    lines: () => ({
      write: write === '' ? '' : write.startsWith('none — ') ? 'none' : 'call',
      value: d.valueChars > 0,
      twins: d.also !== '',
      inside: d.insideText !== '',
      image: imageLine !== '',
      was: d.wasText !== ''
    }),
    /**
     * @param {number} [n] - the comment's number, in a turn of several.
     * @returns {string[]} the block's lines, fences included.
     */
    block: (n) => [
      FENCE_OPEN,
      `<${HEAD} ${[
        ...(n === undefined ? [] : [`n="${n}"`]),
        ...(reply?.also !== undefined && reply.also.length > 0 ? [`also-n="${reply.also.join(' ')}"`] : []),
        ...(reply?.replyTo !== undefined ? [`reply-to="${reply.replyTo}"`] : []),
        `url="${attr(element.url, CAP.url)}"`,
        `selector="${escapeAttr(d.selector)}"`,
        `status="${answer.status}"`,
        ...(answer.incomplete ? ['incomplete="true"'] : []),
        ...(answer.notInContent ? ['hint="not-in-content"'] : []),
        ...(kind ? [`kind="${kind}"`] : []),
        ...(name ? [`name="${attr(name, nameCap)}"`] : []),
        ...(own ? [`label="${attr(own, nameCap)}"`] : []),
        ...(ref ? [`ref="${attr(ref, CAP.ref)}"`] : []),
        ...(lang ? [`lang="${lang}"`] : []),
        ...(author ? [`author="${attr(author, CAP.name)}"`] : []),
        ...(author && HEX_COLOUR.test(authorColor) ? [`author-color="${authorColor}"`] : [])
      ].join(' ')}>`,
      ...(reply ? reply.lines.map((line) => `${THREAD_PREFIX}${line}`) : []),
      ...(d.pageText ? [`text: ${d.pageText}`] : []),
      ...(d.wasText ? [`was: ${d.wasText}`] : []),
      ...(d.insideText ? [`inside: ${d.insideText}`] : []),
      ...(imageLine ? [`image: ${imageLine}`] : []),
      // "(cut)" whenever the stored words are not all there: the level says so, or this line cut them.
      ...(d.valueChars > 0
        ? [
            `value${source?.valueCut === true || d.valueChars < storedChars ? ' (cut)' : ''}: ${body(stored, d.valueChars)}`
          ]
        : []),
      ...(write ? [`write: ${body(write, COMMENT_TURN_LIMIT)}`] : []),
      ...(alt ? [`${alt.key}: ${body(alt.line, COMMENT_TURN_LIMIT)}`] : []),
      // Never trimmed, like `write:`: it is the one road there is for words in no record.
      ...(answer.notInContent ? [`not in content: ${body(answer.notInContent, CAP.notInContent)}`] : []),
      ...(d.also ? [`also in: ${body(d.also, CAP.name * 3)}`] : []),
      ...(d.marks.length > 0 ? [`marks: ${d.marks.join(' | ')}`] : []),
      ...(d.levels.length > 0 ? ['levels:', ...d.levels.map((l) => l.line)] : []),
      ...(d.candidates.length > 0 ? ['candidates:', ...d.candidates.map((c) => c.line)] : []),
      `</${HEAD}>`,
      FENCE_CLOSE
    ]
  }
  return d
}

/**
 * Drop the outermost line that is not kept; null when every line left is kept.
 * @param {{ line: string, keep: boolean }[]} list
 * @returns {{ line: string, keep: boolean }[] | null}
 */
function dropOuter(list) {
  for (let i = list.length - 1; i >= 0; i -= 1)
    if (!list[i].keep) return [...list.slice(0, i), ...list.slice(i + 1)]
  return null
}

/**
 * Build the text of a comment turn — one comment, or several sent together.
 *
 * ONE COMMENT (`{text, element, locate}`, or `{items}` holding one) is the turn Tracy has sent since
 * 27/09, byte for byte (`test/comment-turn-v1-snapshot.test.mjs`): the request, one block, the hint.
 * The person's request is never shortened; the page data around it is, until the turn fits
 * {@link COMMENT_TURN_LIMIT}, least useful first:
 * 1. the head's `name` / `label` and the `image:` line's file name, to {@link NAME_FLOOR} characters;
 *    then the selector, cut to its last steps — never left empty (round 5 leftover, 30/09: an image
 *    with no alt, named by a long file, lost its selector and the block no longer said which picture);
 * 2. the outer levels (the picked one stays), then the candidates nobody chose;
 * 3. the hint, to its short form;
 * 4. the "also in:" line, then the stored words (`value:`, shortened to {@link TEXT_FLOOR}
 *    characters, then left out);
 * 5. the marks, outermost first;
 * 5b. the `inside:` line (a container's words), left out whole — it is only there when the text is
 *    empty, so it never competes with line 6;
 * 6. the element's text, LAST and only shortened (never below {@link TEXT_FLOOR} characters): it is
 *    the `find` of `content.replace` and the words `content.locate` matches, so a long request —
 *    a pasted replacement paragraph — must not cost the agent the one line it needs for it.
 * The `write:` line is never cut: it is one call, and a cut call fails.
 *
 * SEVERAL COMMENTS (`{items}`, contract H5 of plan "comment multi-pin"): see {@link buildManyTurn}.
 * A list holding a REPLY (an item with `replyTo`) takes that form too, even with one item; `now`
 * (ms, default the clock) is what the thread's "7m ago" counts from.
 * @param {{ text: string, element: CommentElement, locate?: LocateAnswer | null } |
 *   { items: readonly CommentItem[], now?: number, numbered?: boolean }} comment
 *   `numbered` (stage 6): the list form even for one item, so its number reaches the agent — a Send
 *   to Tracy's number is the request the Apply door checks `comment: n` against.
 * @returns {string}
 * @throws {RangeError} for a list with a bad number, a repeated one, or an item with no words.
 * @throws {TooLong} when several comments do not fit even trimmed.
 */
export function buildCommentTurn(comment) {
  if ('items' in comment && Array.isArray(comment.items)) {
    const items = checkItems(comment.items)
    // A reply is always numbered, even alone: its number colours its pin and `reply-to` names one.
    if (items.length > 1 || items.some(threaded) || ('numbered' in comment && comment.numbered === true))
      return buildManyTurn(items, typeof comment.now === 'number' ? comment.now : Date.now())
    const [{ text, element, locate }] = items
    // A comment about the whole page (H4): the words alone. The hint says how to find an element,
    // and there is none; the numbering belongs to lists.
    if (element === null) return indentWriteLines(String(text).trim())
    return buildCommentTurn({ text, element, locate })
  }
  const { text, element, locate } =
    /** @type {{ text: string, element: CommentElement, locate?: LocateAnswer | null }} */ (comment)
  const request = indentWriteLines(String(text ?? '').trim())
  const d = describe(element, locate, undefined, messageLanguage(request))
  let short = false
  /** The hint for the lines this turn carries now (a line trimmed away takes its clause along). */
  const hint = () => locateHint({ incomplete: d.answer.incomplete, short, ...d.lines() })

  const render = () => [request, '', ...d.block(), hint()].join('\n')
  let turn = render()
  // The image road's words-in-the-picture sentence is paid by its own room, not by the page data.
  const limit = COMMENT_TURN_LIMIT + (d.lines().image ? IMAGE_WORDS_ROOM : 0)
  const over = () => turn.length > limit

  if (over() && d.shortenNames()) turn = render()
  if (over()) {
    d.selector = foldTail(d.selectorWhole, SELECTOR_SHORT)
    turn = render()
  }
  for (let next = dropOuter(d.levels); over() && next; next = dropOuter(d.levels)) {
    d.levels = next
    turn = render()
  }
  for (let next = dropOuter(d.candidates); over() && next; next = dropOuter(d.candidates)) {
    d.candidates = next
    turn = render()
  }
  if (over()) {
    short = true
    turn = render()
  }
  if (over() && d.also) {
    d.also = ''
    turn = render()
  }
  if (over() && d.wasText) {
    d.wasText = ''
    turn = render()
  }
  // The stored words: shortened to what is left, then — below the floor — left out.
  for (; over() && d.valueChars > 0; turn = render()) d.shortenValue(turn.length - limit)
  while (over() && d.marks.length > 0) {
    d.marks = d.marks.slice(0, -1)
    turn = render()
  }
  if (over() && d.insideText) {
    d.insideText = ''
    turn = render()
  }
  // The text: shortened to what is left, never below the floor. A shortened text ends in "…", so
  // as a `find` it matches nothing and the agent reads the record first; `content.locate` still
  // matches the words it begins with.
  for (let chars = Array.from(d.pageText).length; over() && chars > TEXT_FLOOR; ) {
    chars = Math.max(TEXT_FLOOR, chars - (turn.length - limit))
    d.shortenText(chars)
    turn = render()
  }
  return turn
}

/**
 * @typedef {{ n: number, text: string, element: CommentElement | null, locate?: LocateAnswer | null, url?: string,
 *   replyTo?: number, thread?: readonly ThreadEntry[], author?: unknown, sends?: readonly ThreadSend[],
 *   at?: number, sender?: unknown }} CommentItem
 *   `sender` — who typed `text` when it is not the comment's own words (a thread card send, round 3): its
 *   `(now)` line names them; `author` stays the comment's (the chip's bubble).
 *   `at` — when the comment was made (ms), when the Browser tab says: the time on its line in a grouped
 *   block (round 3, {@link groupLines}) and that group's order; none → no time printed, order by number.
 *   `element: null` — a comment about the whole page `url` (H4): its words and a `tracy-page` block.
 *   `replyTo` — a reply: the number of the comment it continues (same element), and `thread` the
 *   comments before it, oldest first (plan `tasks/todo-comment-thread.md` § "B addendum").
 *   `author` — who wrote this comment (a name, or `{name?, email?}`); a reply's closes its thread (F1).
 *   `sends` — each earlier time this comment's thread was sent to Tracy (stage 6, contract H3); none
 *   by default. Each is one `thread: sent to Tracy by <name> (<ago>)` line.
 */

/**
 * The block of a comment about a whole page: fence, one head line, end tag, closing fence.
 * @param {number} n
 * @param {string | undefined} url - the page's canonical address.
 * @param {string} lang - the comment's language (F4) in the head; '' for none.
 * @param {string} [author] - who wrote it (stage 6), the head's last attribute but its colour; '' for none.
 * @param {string} [authorColor] - their colour as the server decided it, `author-color`; '' for none.
 * @returns {string[]}
 */
function pageBlock(n, url, lang, author = '', authorColor = '') {
  const address = typeof url === 'string' ? url : ''
  let path = ''
  try {
    path = new URL(address).pathname || '/'
  } catch {}
  return [
    `\`\`\`${PAGE_FENCE}`,
    `<page n="${n}" url="${attr(address, CAP.url)}" path="${attr(path, CAP.url)}"${lang ? ` lang="${lang}"` : ''}${author ? ` author="${attr(author, CAP.name)}"` : ''}${author && HEX_COLOUR.test(authorColor) ? ` author-color="${authorColor}"` : ''}>`,
    '</page>',
    FENCE_CLOSE
  ]
}

/**
 * A comment of a thread: a reply, (N1) a top-level comment sent with the replies written under it, or
 * (stage 6) one sent to Tracy before, whose earlier sends its `thread:` lines name.
 * It takes the numbered form, its block carries `thread:` lines, and the turn ends with the thread
 * sentence.
 * @param {CommentItem} item
 */
function threaded(item) {
  return (
    item.replyTo !== undefined ||
    (item.element !== null &&
      ((Array.isArray(item.thread) && item.thread.length > 0) ||
        (Array.isArray(item.sends) && item.sends.length > 0)))
  )
}

/**
 * Whether `n` is a comment number: a whole number from 1, with no ceiling. Stage 6 numbers come from
 * the server's counter (`POST /requests`, one sequence for comments and requests), so a site passes 99
 * in its first busy week; the 99 cap of the Browser tab's own ordinals is gone from every reader.
 * @param {unknown} n
 * @returns {n is number}
 */
const isNumber = (n) => Number.isSafeInteger(n) && /** @type {number} */ (n) >= 1

/** @param {unknown} v @returns {v is string} */
const isText = (v) => typeof v === 'string' && v.trim() !== ''

/**
 * A list as the Browser tab sends it, checked and put in the order of its numbers.
 * @param {readonly CommentItem[]} items
 * @returns {CommentItem[]}
 */
function checkItems(items) {
  if (items.length === 0) throw new RangeError('a comment turn needs at least one comment')
  const seen = new Set()
  for (const item of items) {
    if (!item || typeof item !== 'object') throw new RangeError('a comment must be an object')
    if (!isNumber(item.n)) throw new RangeError('a comment number must be a whole number from 1')
    if (seen.has(item.n)) throw new RangeError(`comment ${item.n} appears twice`)
    seen.add(item.n)
    if (typeof item.text !== 'string' || item.text.trim() === '')
      throw new RangeError(`comment ${item.n} has no words`)
    // `null` is a comment about the whole page (H4); anything else must be an element.
    if (item.element !== null && (!item.element || typeof item.element !== 'object'))
      throw new RangeError(`comment ${item.n} has no element`)
    if (item.replyTo !== undefined && (!isNumber(item.replyTo) || item.replyTo === item.n))
      throw new RangeError(`comment ${item.n} replies to a bad number`)
    if (item.replyTo !== undefined && item.element === null)
      throw new RangeError(`comment ${item.n} replies without an element`)
  }
  return [...items].sort((a, b) => a.n - b.n)
}

/**
 * The whole turn's budget for `count` comments: {@link COMMENT_TURN_LIMIT} for one, 700 more for
 * each further comment (11,141 for the twelve the Browser tab allows). A 6,000 ceiling stood until
 * 29/09: twelve comments of 60 characters could then never be sent (dev acceptance M-1), while the
 * tab kept offering "Send 12 to Tracy".
 * @param {number} count
 * @returns {number}
 */
export function commentTurnLimit(count) {
  return COMMENT_TURN_LIMIT + 700 * (Math.max(1, count) - 1)
}

/** Several comments that do not fit their budget even with every page detail trimmed. */
export class TooLong extends Error {
  /** @param {number} length @param {number} limit */
  constructor(length, limit) {
    super(`the comments make a turn of ${length} characters; the limit is ${limit}`)
    this.name = 'TooLong'
    /** The `tracy:comment-failed` code a sender shows ("send fewer comments"). */
    this.code = 'too-long'
    this.length = length
    this.limit = limit
  }
}

/** The indent of a comment's second and later lines in turns sent before S16, under their "1. ". */
const CONTINUE = '   '

/**
 * One comment's words as the turn carries them (S16, acceptance v2 30/09): its lines, trimmed, blank
 * ones left out — so a blank line always ends a comment — and NO number. dsh shows every byte of a
 * turn outside its folded blocks, so a `41. ` here reached the person's bubble, a number they never
 * saw; the number lives in the comment's block (`n="41"`), right under these lines. A line that opens
 * with a backtick gets one leading space, so no line the person wrote can open a fenced block of its
 * own (dsh and the chip reader take a block only at a line start); {@link personLines} takes it off.
 * @param {string} text
 * @returns {string[]}
 */
function wordLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith('`') || WRITE_LINE.test(line) ? ` ${line}` : line))
}

/** A line that opens with `write:` is Tracy's own target line to the comment fence; a person's never is. */
const WRITE_LINE = /^write:/i

/** @param {string} text */
function indentWriteLines(text) {
  return text
    .split('\n')
    .map((line) => (WRITE_LINE.test(line) ? ` ${line}` : line))
    .join('\n')
}

/**
 * The person's words back from {@link wordLines}: the space before a backtick taken off.
 * @param {string} paragraph
 * @returns {string}
 */
function personLines(paragraph) {
  return paragraph
    .split('\n')
    .map((line) => (line.startsWith(' `') || /^ write:/i.test(line) ? line.slice(1) : line))
    .join('\n')
}

/**
 * The comments of a list pinned on the SAME element (round 3): same page address and selector, top-level
 * (a reply already rides its parent's thread), two or more. Each group oldest first — by `at` when every
 * member has one, else by number (the Browser tab numbers in the order the comments were made) — keyed
 * by its first member's number. A comment about a whole page is never grouped: it points at no element.
 * @param {readonly CommentItem[]} items - checked, in the order of their numbers.
 * @returns {Map<number, CommentItem[]>} first member's number → the group.
 */
function groupsOf(items) {
  /** @type {Map<string, CommentItem[]>} */
  const byElement = new Map()
  for (const item of items) {
    if (item.element === null || item.replyTo !== undefined) continue
    const key = `${String(item.element.url)}\u0000${String(item.element.selector)}`
    byElement.set(key, [...(byElement.get(key) ?? []), item])
  }
  /** @type {Map<number, CommentItem[]>} */
  const groups = new Map()
  for (const members of byElement.values()) {
    if (members.length < 2) continue
    const timed = members.every((m) => isTime(m.at))
    const ordered = timed
      ? [...members].sort((a, b) => /** @type {number} */ (a.at) - /** @type {number} */ (b.at) || a.n - b.n)
      : members
    groups.set(ordered[0].n, ordered)
  }
  return groups
}

/**
 * The `thread:` lines of a grouped block (round 3): each comment `<author> (<when>, comment <n>): <words>`
 * — its time only when the Browser tab gave one, never invented — then its own replies and earlier
 * sends as {@link threadLines} prints them. A comment's own line is never dropped (it is what is being
 * sent); its replies keep their own cap, {@link THREAD_MAX}.
 * @param {readonly CommentItem[]} members - oldest first.
 * @param {number} now
 * @param {(author: unknown) => string} names
 * @param {number} [cap] - each member's thread share ({@link threadLines}).
 * @returns {string[]}
 */
function groupLines(members, now, names, cap = THREAD_MAX) {
  /** Every earlier send the block has printed: one Send all of the group lists it on each comment. */
  const printed = /** @type {{ key: string, at: number | null }[]} */ ([])
  // Newest comment first, so a send listed by several comments is printed under the LAST of them — a
  // comment lists only sends made after it existed, so that is where the send falls in time.
  const lines = [...members].reverse().map((item) => {
    const marks = [isTime(item.at) ? ago(item.at, now) : '', `comment ${item.n}`].filter(Boolean).join(', ')
    const own = body(`${names(item.author) || 'someone'} (${marks}): ${item.text}`, THREAD_LINE_MAX)
    return [own, ...threadLines(item.thread, now, { sends: item.sends }, names, cap, printed)]
  })
  return lines.reverse().flat()
}

/**
 * Several comments in one turn (contract H5 of plan "comment multi-pin"), in this order:
 * 1. per comment, in the order of their numbers, the shape of a one-comment turn: the person's words
 *    ({@link wordLines}: NO number — S16, acceptance v2 30/09: dsh shows every byte outside a folded
 *    block, so "41. …" reached the bubble), a blank line, then its fenced `tracy-element` block — the
 *    fence line bare (dsh's fold registry opens a block only on the fence name and the line end), `n`
 *    the FIRST attribute of the descriptor, the body as for one comment; a blank line between
 *    comments. The turn opens with the first comment's words: dsh titles a session from the first
 *    words of its first message until the model's title arrives, and keeps them when that fails
 *    (stand e2e B1, 28/09: a turn opening with the fence was titled "```tracy-elem…");
 * 2. ONE hint line, {@link LOCATE_HINT_MANY} or {@link LOCATE_HINT_MANY_INCOMPLETE} — right after
 *    the last block, where the chip reader hides it (a fold can only hide what FOLLOWS its block).
 *    A block's own lines (`write:`, `value:`, `also in:`, `inside:`) are its own, exactly as for one
 *    comment; the hint names the clause of each kind ANY block still carries, once
 *    ({@link locateHintMany}), and a kind trimmed from every block takes its clause along.
 * Each chip comes out under its own comment's words, where a one-comment turn's chip sits (#521).
 *
 * The budget is {@link commentTurnLimit} (a turn with a reply: see `limit` below). Trimmed in this order, every item alike, until it fits:
 * the heads' `name` / `label` and the image file names (to {@link NAME_FLOOR}), the selectors (cut to
 * their last steps), the outer levels, the candidates nobody chose, the "also in:" lines, the stored
 * words (`value:`, the longest first, down to {@link TEXT_FLOOR}, then left out), the marks past each
 * element's first, the `inside:` lines, then each element's text down to {@link TEXT_FLOOR}; only
 * then, rather than refuse the send, the selectors are emptied. No `write:` line, no comment and no
 * line of the person's is ever dropped: when that is still too long, {@link TooLong} is thrown and
 * the sender asks for fewer comments.
 * A turn holding a reply ends its hint with {@link COMMENT_THREAD}.
 *
 * Comments on the SAME element (round 3, {@link groupsOf}) are ONE block, at the place of the group's
 * oldest: `also-n` names the others, its `thread:` lines are all of them with their replies
 * ({@link groupLines}), so the chat shows one chip with the thread and the agent one conversation. Every
 * member's words stand above that block, one paragraph each, in the order of `n` then `also-n`. Such a
 * turn ends its hint with {@link COMMENT_THREAD} and
 * {@link COMMENT_GROUP}.
 * @param {CommentItem[]} items - checked, in the order of their numbers.
 * @param {number} now - what a thread's "7m ago" counts from.
 * @returns {string}
 */
function buildManyTurn(items, now) {
  const nameOf = namesOf(items)
  const groups = groupsOf(items)
  /** A grouped comment that is not its group's first: its block is the group's. */
  const inGroup = new Set([...groups.values()].flatMap((members) => members.slice(1).map((m) => m.n)))
  const grouped = new Set([...groups.values()].flatMap((members) => members.map((m) => m.n)))
  // TH-3: every thread of the turn shares THREAD_TURN_MAX; one alone may take THREAD_MAX.
  const threads = items.filter((item) => threaded(item) || grouped.has(item.n)).length
  const cap = Math.min(THREAD_MAX, Math.floor(THREAD_TURN_MAX / Math.max(1, threads)))
  const parts = items
    .filter((item) => item.element !== null && !inGroup.has(item.n))
    .map((item) => {
      const members = groups.get(item.n)
      if (members !== undefined) {
        // The element as the first member that was looked up saw it (they point at one element).
        const seen = members.find((m) => m.locate !== null && m.locate !== undefined) ?? members[0]
        return {
          n: item.n,
          d: describe(
            /** @type {CommentElement} */ (seen.element),
            seen.locate,
            { lines: groupLines(members, now, nameOf, cap), also: members.slice(1).map((m) => m.n) },
            // The newest comment's language: the latest word, which the rest of the answer follows.
            messageLanguage(members[members.length - 1].text),
            nameOf(members[0].author),
            authorColourOf(members[0].author)
          )
        }
      }
      return {
        n: item.n,
        d: describe(
          /** @type {CommentElement} */ (item.element),
          item.locate,
          threaded(item)
            ? { replyTo: item.replyTo, lines: threadLines(item.thread, now, item, nameOf, cap) }
            : undefined,
          messageLanguage(item.text),
          nameOf(item.author),
          authorColourOf(item.author)
        )
      }
    })
  const replies = items.some(threaded) || groups.size > 0
  // A comment about a whole page (H4) is a `tracy-page` block, in its number's place among the others.
  const pages = new Map(
    items
      .filter((item) => item.element === null)
      .map((item) => [
        item.n,
        pageBlock(
          item.n,
          item.url,
          messageLanguage(item.text),
          nameOf(item.author),
          authorColourOf(item.author)
        )
      ])
  )
  /**
   * The words above one block (S16): its comment's lines — a grouped block's, every member's, oldest
   * first, one paragraph each, in the order of its `n` and `also-n`.
   * @param {CommentItem} item
   */
  const wordsOf = (item) =>
    (groups.get(item.n) ?? [item]).map((member) => wordLines(member.text).join('\n')).join('\n\n')
  const general = pages.size > 0
  const unsure = parts.some(({ d }) => d.answer.incomplete || d.answer.status === 'unchecked')
  // A reply's thread is never trimmed (it has its own cap), so the budget grows by it and by the
  // thread sentence; and a LONE reply carries the many-comments hint (a third longer than the
  // one-comment hint), so it counts as two comments. Without both, a lone reply with a full thread
  // and a long request could not be sent at all. The reply's own closing thread line (F1) is outside
  // the thread's cap, so it adds one more line of at most THREAD_LINE_MAX characters.
  // A grouped comment counts like a reply: its own line and its replies' lines are never trimmed.
  const replyCount = items.filter((item) => threaded(item) || grouped.has(item.n)).length
  // The image road's clause of the hint (its lines and the words-in-the-picture sentence, M6) is said
  // once per turn and paid by its own room.
  const imageRoom = parts.some(({ d }) => d.lines().image) ? EXTRA.image.length + 1 : 0
  // The group sentence (round 3) is said once per turn that has a group, and paid by its own room.
  const groupRoom = groups.size > 0 ? COMMENT_GROUP.length + 1 : 0
  // Merge of 30/09 (develop's picture write line meets this branch's `image:` and `alt` lines): a
  // picture's block now carries all three, and the write line is never cut. Each block's image-road
  // lines are paid by their own room, as the image sentence is, so the person's words keep the room
  // `comment-turn-picture-budget.test.mjs` measured before the two met.
  const imageLinesRoom = () =>
    parts.reduce(
      (sum, { d }) =>
        sum +
        d
          .block(0)
          .filter((line) => /^(image|alt|alt write): /.test(line))
          .reduce((n, line) => n + line.length + 1, 0),
      0
    )
  const limit =
    imageRoom +
    groupRoom +
    (replyCount === 0
      ? commentTurnLimit(items.length)
      : commentTurnLimit(Math.max(2, items.length)) +
        COMMENT_THREAD.length +
        1 +
        (cap + 1 + THREAD_PREFIX.length + THREAD_LINE_MAX) * replyCount)
  /** The one hint, saying what the lines any block still carries mean. */
  const hint = () => {
    const carried = parts.map(({ d }) => d.lines())
    const writes = new Set(carried.map((one) => one.write).filter(Boolean))
    const many = locateHintMany({
      unsure,
      general,
      write: writes.size > 1 ? 'both' : writes.has('none') ? 'none' : writes.has('call') ? 'call' : '',
      value: carried.some((one) => one.value),
      twins: carried.some((one) => one.twins),
      inside: carried.some((one) => one.inside),
      image: carried.some((one) => one.image),
      was: carried.some((one) => one.was)
    })
    const threadHint = replies ? `${many} ${COMMENT_THREAD}` : many
    return groups.size > 0 ? `${threadHint} ${COMMENT_GROUP}` : threadHint
  }

  // Each comment is its words, a blank line, then its block (S16) — the shape of a one-comment turn,
  // repeated; a blank line between comments; the hint right after the last block.
  const units = () =>
    items
      .filter((item) => !inGroup.has(item.n))
      .map((item) =>
        [
          wordsOf(item),
          '',
          ...(pages.get(item.n) ??
            /** @type {typeof parts[number]} */ (parts.find((p) => p.n === item.n)).d.block(item.n))
        ].join('\n')
      )
  const render = () => [units().join('\n\n'), hint()].join('\n')
  let turn = render()
  // SEND-v4-new-6 (e2e v4): every stage-6 send is numbered, so ONE comment takes this form too — and
  // this hint is longer than the one-comment hint COMMENT_TURN_LIMIT was sized against (with every
  // clause, longer than the whole budget), which left an image with no words no room at all. A lone
  // comment's hint is paid by its own room, over what the one-comment hint takes (the image, group and
  // thread sentences are paid above).
  const lone = items.length === 1
  const hintRoom = () =>
    lone
      ? Math.max(
          0,
          hint().length -
            LOCATE_HINT.length -
            imageRoom -
            groupRoom -
            (replies ? COMMENT_THREAD.length + 1 : 0)
        )
      : 0
  const over = () => turn.length > limit + imageLinesRoom() + hintRoom()
  /**
   * Take one step from each item in turn, from the last comment back, until the turn fits or no
   * item has anything left to give at this stage.
   * @param {(d: ReturnType<typeof describe>) => boolean} step - true when it took something.
   */
  const trim = (step) => {
    for (let took = true; over() && took; ) {
      took = false
      for (let i = parts.length - 1; i >= 0 && over(); i -= 1) {
        if (step(parts[i].d)) {
          took = true
          turn = render()
        }
      }
    }
  }

  trim((d) => d.shortenNames())
  trim((d) => {
    const shorter = foldTail(d.selectorWhole, SELECTOR_SHORT)
    if (d.selector === shorter) return false
    d.selector = shorter
    return true
  })
  trim((d) => {
    const next = dropOuter(d.levels)
    if (next) d.levels = next
    return next !== null
  })
  trim((d) => {
    const next = dropOuter(d.candidates)
    if (next) d.candidates = next
    return next !== null
  })
  trim((d) => {
    if (d.also === '') return false
    d.also = ''
    return true
  })
  trim((d) => {
    if (d.wasText === '') return false
    d.wasText = ''
    return true
  })
  // The stored words, the longest first, each only down to the floor, then left out.
  while (over()) {
    const longest = parts
      .map(({ d }) => d)
      .filter((d) => d.valueChars > 0)
      .sort((a, b) => b.valueChars - a.valueChars)[0]
    if (!longest) break
    longest.shortenValue(turn.length - limit - imageLinesRoom())
    turn = render()
  }
  trim((d) => {
    if (d.marks.length <= 1) return false
    d.marks = d.marks.slice(0, -1)
    return true
  })
  trim((d) => {
    if (d.insideText === '') return false
    d.insideText = ''
    return true
  })
  // The texts last, the longest first, each only down to the floor.
  while (over()) {
    const longest = parts
      .map(({ d }) => ({ d, chars: Array.from(d.pageText).length }))
      .filter(({ chars }) => chars > TEXT_FLOOR)
      .sort((a, b) => b.chars - a.chars)[0]
    if (!longest) break
    longest.d.shortenText(Math.max(TEXT_FLOOR, longest.chars - (turn.length - limit - imageLinesRoom())))
    turn = render()
  }
  // Only a turn that would otherwise not be sent at all gives up selectors (the one-comment turn never
  // does): a refused send loses the person's words, an empty selector only a way to find the element.
  trim((d) => {
    if (d.selector === '') return false
    d.selector = ''
    return true
  })
  // One comment is never refused (like the one-comment form, which never throws): "too much" means
  // too many comments, and a single one is the fewest there can be.
  if (over() && !lone) throw new TooLong(turn.length, limit + imageLinesRoom())
  return turn
}

/** Image tags: the element IS an image. */
const IMAGE_TAGS = new Set(['img', 'picture'])

/**
 * The file name an image source ends with, decoded, without query or hash; '' for none (a `data:` URI).
 * @param {unknown} src
 */
function fileOf(src) {
  if (typeof src !== 'string' || src === '' || src.startsWith('data:')) return ''
  const last = src.split(/[?#]/)[0].split('/').filter(Boolean).at(-1) ?? ''
  try {
    return decodeURIComponent(last).trim()
  } catch {
    return last.trim()
  }
}

/**
 * What names a comment anchored on an image (01/10/2026, option a): its alt quoted and cut at
 * {@link CHIP_EXCERPT}, else its file name. The view puts "Image ·" before it, so an alt that repeats
 * a heading (wp-ja-kinetic's hero panels) no longer reads like a heading comment. An image is an
 * `<img>`/`<picture>`, or an element with no words of its own that the picker read one image off (a
 * card's image link); a section painted with a background image keeps its own words. Mirrors the
 * dsh-better-sidebar fork's `threadPlace`; the chat chip names an image the same way
 * ({@link commentTurnFold}).
 * @param {{ tag?: string, text?: string, label?: string, image?: { src?: string, alt?: string } | null } | null | undefined} element
 * @returns {string | null} null for an element that is not an image.
 */
export function imageAnchor(element) {
  if (element === null || element === undefined) return null
  const image = element.image && typeof element.image === 'object' ? element.image : null
  const tag = typeof element.tag === 'string' ? element.tag.toLowerCase() : ''
  if (!IMAGE_TAGS.has(tag) && (image === null || isText(element.text))) return null
  const alt = typeof image?.alt === 'string' ? image.alt.replace(/\s+/g, ' ').trim() : ''
  if (alt !== '') {
    const chars = Array.from(alt)
    return `"${chars.length > CHIP_EXCERPT ? `${chars.slice(0, CHIP_EXCERPT - 1).join('')}…` : alt}"`
  }
  return fileOf(image?.src) || chipLabel({ name: element.label, text: element.text }, { many: true })
}

/**
 * An image anchor's chip words with the kind before them (01/10/2026, option a): `Image · "<alt>"`,
 * `Image · <file>`, or the kind alone when nothing names it. One rule for the Comments tab row and the
 * chat chip.
 * @param {string} word - "Image", in the reader's language (`comments.image`).
 * @param {string} anchor - {@link imageAnchor}'s words.
 * @returns {string}
 */
export function imageChipWords(word, anchor) {
  return anchor === '' ? word : `${word} · ${anchor}`
}

/**
 * One `tracy-element` block. The body may be EMPTY: an image with no words, no marks and no answer
 * leaves the head followed at once by its end tag (dev 28/09 — the reader demanded a body line, so
 * the chat drew the raw block). The end tag still has to sit on its own line, and `body()` breaks
 * any `<mentioned-element` in page text, so page text can never close the block early.
 */
const BLOCK =
  /(?:^|\n)```tracy-element\n(<mentioned-element [^\n]*>)\n(?:[\s\S]*?\n)?<\/mentioned-element>\n```(?:\n|$)/
const ATTR = /([a-z][a-z-]*)="([^"]*)"/g
/** A reply's thread lines in a block (plan `tasks/todo-comment-thread.md` § "B addendum"). */
const THREAD_LINES = /\nthread: ([^\n]*)(?=\n)/g
const TEXT_LINE = /\ntext: ([^\n]*)\n/
/** The number a descriptor of a several-comment turn opens with. */
const N_ATTR = /^<mentioned-element n="(\d+)" /
/** A descriptor head that carries a number at all — well-formed or not. */
const NUMBERED_HEAD = /(?:^|\n)```tracy-element\n<mentioned-element n="/
/** A `tracy-page` block's head (H4). */
const PAGE_HEAD = /(?:^|\n)```tracy-page\n<page n="/
/** The number a page head opens with. */
const PAGE_N = /^<page n="(\d+)" /
/**
 * Every block of a many-comment turn, element or page, in order: [1] the fence name, [2] the head. A
 * block's end is not consumed, so blocks may follow each other, and no body line may be the end tag,
 * so an empty body never reaches into the next block.
 */
const ANY_BLOCKS =
  /(?:^|\n)```(tracy-element|tracy-page)\n(<(?:mentioned-element|page) [^\n]*>)\n(?:(?!<\/(?:mentioned-element|page)>)[^\n]*\n)*<\/(?:mentioned-element|page)>\n```(?=\n|$)/g

/**
 * @typedef {{ url: string, selector: string, status: string, incomplete?: true, kind?: string,
 *   name?: string, ref?: string, text?: string, author?: string, authorColor?: string, label?: string }} ParsedElement
 *   `label` — the Browser tab's own name for the element, on a head whose record is only a page (F10).
 *   `author` — who wrote the comment, on turns from stage 6 on (the head's `author`).
 *   `authorColor` — their colour as the server decided it (the head's `author-color`), when the turn
 *   carries one.
 */

/**
 * The chip fields of one block, or null when its head is not a descriptor.
 * @param {string} head - the `<mentioned-element …>` line.
 * @param {string} whole - the whole block match, for its text line.
 * @returns {ParsedElement | null}
 */
function elementOf(head, whole) {
  /** @type {Record<string, string>} */
  const attrs = {}
  for (const [, key, value] of head.matchAll(ATTR)) attrs[key] = unescape(value)
  if (attrs.url === undefined || attrs.selector === undefined || !READ_STATUSES.has(attrs.status ?? ''))
    return null
  const textLine = TEXT_LINE.exec(whole)
  return {
    url: attrs.url,
    selector: attrs.selector,
    status: attrs.status,
    ...(attrs.incomplete === 'true' ? { incomplete: /** @type {true} */ (true) } : {}),
    ...(attrs.kind !== undefined && KINDS.has(attrs.kind) ? { kind: attrs.kind } : {}),
    ...(attrs.name !== undefined ? { name: attrs.name } : {}),
    ...(isText(attrs.label) ? { label: attrs.label } : {}),
    ...(attrs.ref !== undefined ? { ref: attrs.ref } : {}),
    ...(textLine ? { text: unescape(textLine[1]) } : {}),
    ...(isText(attrs.author) ? { author: attrs.author } : {}),
    ...(isText(attrs.author) && HEX_COLOUR.test(attrs['author-color'] ?? '')
      ? { authorColor: attrs['author-color'] }
      : {})
  }
}

/** @param {string} head @returns {number | null} the comment number a head opens with. */
function numberOf(head) {
  const m = N_ATTR.exec(head)
  const n = m ? Number(m[1]) : NaN
  return isNumber(n) ? n : null
}

/**
 * Text after a block with the line right after it left out when it is the hint — the line that
 * names `tracy_site`, the rule `prompter.mjs` cuts it by, so every form of the hint (and the one
 * turns before 28/09 carried) stays out of the request.
 * @param {string} after
 */
function withoutHint(after) {
  const hintEnd = after.indexOf('\n')
  if ((hintEnd < 0 ? after : after.slice(0, hintEnd)).includes('`tracy_site`'))
    return hintEnd < 0 ? '' : after.slice(hintEnd + 1)
  return after
}

/**
 * The person's words for each number in a turn sent before S16, from its numbered lines (`n. …`, more
 * lines indented three spaces under it).
 * @param {string} request
 * @returns {Map<number, string>}
 */
function wordsByNumber(request) {
  /** @type {Map<number, string[]>} */
  const byN = new Map()
  /** @type {string[] | null} */
  let current = null
  for (const line of request.split('\n')) {
    const start = /^(\d+)\. (.*)$/.exec(line)
    if (start) {
      current = [start[2]]
      byN.set(Number(start[1]), current)
    } else if (current && line.startsWith(CONTINUE)) current.push(line.slice(CONTINUE.length))
    else current = null
  }
  return new Map([...byN].map(([n, lines]) => [n, lines.join('\n')]))
}

/**
 * Read a comment turn back: the request the person wrote and the fields each chip draws.
 *
 * A turn of ONE comment (no numbered descriptor) reads as it did before many pins: the first block,
 * the request around it — `items` then holds that one comment as number 1, and `element` stays.
 * A turn of SEVERAL (contract H5): every block whose descriptor opens with `n="k"` is an item; a
 * block with no number, or whose number a LATER block repeats, is skipped (no chip; the person's
 * words stay in the request). An item's words are the paragraph(s) right above its block (S16); a turn
 * sent before S16 carries them as numbered lines at the top, read by number. The request is every
 * comment's words, one paragraph each (the numbered lines, for a turn sent before S16). The last of a repeated number wins so that the chip reader, which
 * sees only a block and what follows it, agrees with this one. `element` is the first item's.
 * @param {unknown} text - the joined text of one user message.
 * A `tracy-page` block (plan "comment review", H4) is an item too: a comment about a whole page,
 * `element: null`, with the page's `url` and `path`. `element` is the first item that has one, null
 * when every item is a page. One such comment alone is the person's words, read as null here.
 * @returns {{ request: string, element: ParsedElement | null,
 *   items: { n: number, element: ParsedElement | null, text: string, url?: string, path?: string,
 *     replyTo?: number, thread?: string[], also?: number[], groupOf?: number }[] } | null}
 *   `replyTo` / `thread` on a reply's item: the number it continues and its `thread:` lines.
 *   `also` on a grouped block's item (round 3): the other comments it holds (`also-n`); each of those is
 *   an item too, with the block's element and `groupOf` the block's number.
 *   null for any message that does not carry a well-formed `tracy-element` block.
 */
export function parseCommentTurn(text) {
  if (typeof text !== 'string') return null
  if (NUMBERED_HEAD.test(text) || PAGE_HEAD.test(text)) return parseManyTurn(text)
  const match = BLOCK.exec(text)
  if (!match) return null
  const element = elementOf(match[1], match[0])
  if (!element) return null
  const before = text.slice(0, match.index).trimEnd()
  const after = withoutHint(text.slice(match.index + match[0].length))
  const request = [before, after.trim()].filter(Boolean).join('\n')
  return { request, element, items: [{ n: 1, element, text: request }] }
}

/**
 * @param {string} text - a turn with at least one numbered descriptor.
 * @returns {ReturnType<typeof parseCommentTurn>}
 */
function parseManyTurn(text) {
  const blocks = [...text.matchAll(ANY_BLOCKS)]
  if (blocks.length === 0) return null
  /** @type {{ n: number, element: ParsedElement | null, url?: string, path?: string, replyTo?: number, thread?: string[], also?: number[], groupOf?: number }[]} */
  let found = []
  for (const block of blocks) {
    const item = block[1] === PAGE_FENCE ? pageOf(block[2]) : elementItem(block[2], block[0])
    if (!item) continue
    found = [...found.filter((other) => other.n !== item.n), item]
  }
  if (found.length === 0) return null
  // The words around the blocks; the hint only where it sits, right after the last one.
  const gaps = blocks.map((block, i) => {
    const from = i === 0 ? 0 : /** @type {number} */ (blocks[i - 1].index) + blocks[i - 1][0].length
    return text.slice(from, block.index)
  })
  const last = blocks[blocks.length - 1]
  const tail = withoutHint(text.slice(/** @type {number} */ (last.index) + last[0].length).replace(/^\n/, ''))
  const trimmed = [...gaps, tail].map((gap) => gap.replace(/^\n+|\s+$/g, ''))
  const numbered = wordsByNumber(trimmed.filter(Boolean).join('\n'))
  // A turn sent before S16: every comment a numbered line at the top, the blocks after them, back to back.
  // (A lone comment whose own words open with its own number reads as one; its words then lose that prefix.)
  const before16 =
    trimmed.slice(1, -1).every((gap) => gap === '') &&
    found.every((item) => [item.n, ...(item.also ?? [])].every((k) => numbered.has(k)))
  const request = trimmed.filter(Boolean).join(before16 ? '\n' : '\n\n')
  /** @type {Map<number, string>} */
  const words = before16 ? numbered : new Map()
  // S16 on: the words above a block are its comments' (a grouped block's in the order of `n`, `also-n`).
  if (!before16)
    blocks.forEach((block, i) => {
      const item = block[1] === PAGE_FENCE ? pageOf(block[2]) : elementItem(block[2], block[0])
      if (!item) return
      const paragraphs = trimmed[i] === '' ? [] : trimmed[i].split(/\n\n+/)
      ;[item.n, ...('also' in item ? (item.also ?? []) : [])].forEach((k, j) => {
        if (paragraphs[j] !== undefined) words.set(k, personLines(paragraphs[j]))
      })
    })
  // Round 3: a grouped block holds several comments; each is an item of its own (`groupOf` its block's
  // number), right after its block's, so every reader that counts or lists comments sees them all.
  const items = found
    .flatMap((item) => [
      item,
      ...(item.also ?? [])
        .filter((k) => !found.some((other) => other.n === k))
        .map((k) => ({ n: k, element: item.element, groupOf: item.n }))
    ])
    .map((item) => ({ ...item, text: words.get(item.n) ?? '' }))
  return { request, element: items.find((item) => item.element !== null)?.element ?? null, items }
}

/**
 * @param {string} head @param {string} whole
 * @returns {{ n: number, element: ParsedElement, replyTo?: number, thread?: string[], also?: number[] } | null}
 */
function elementItem(head, whole) {
  const n = numberOf(head)
  const element = n === null ? null : elementOf(head, whole)
  if (n === null || !element) return null
  const replyTo = replyOf(head)
  const also = groupedOf(head)
  if (replyTo === null) return also.length > 0 ? { n, element, also } : { n, element }
  return { n, element, replyTo, thread: [...whole.matchAll(THREAD_LINES)].map((m) => unescape(m[1])) }
}

/**
 * @param {string} head
 * @returns {number[]} the other comments a grouped block holds (`also-n`, round 3); none for any other head.
 */
function groupedOf(head) {
  const m = /^<mentioned-element n="\d+" also-n="(\d+(?: \d+)*)" /.exec(head)
  return m ? m[1].split(' ').map(Number).filter(isNumber) : []
}

/** @param {string} head @returns {number | null} the number a reply's head continues (`reply-to`). */
function replyOf(head) {
  const m = /^<mentioned-element n="\d+" reply-to="(\d+)" /.exec(head)
  const n = m ? Number(m[1]) : NaN
  return isNumber(n) ? n : null
}

/**
 * A `<page …>` head, or null when it is not one.
 * @param {string} head
 * @returns {{ n: number, element: null, url: string, path: string, author?: string, authorColor?: string } | null}
 */
function pageOf(head) {
  const m = PAGE_N.exec(head)
  const n = m ? Number(m[1]) : NaN
  if (!isNumber(n)) return null
  /** @type {Record<string, string>} */
  const attrs = {}
  for (const [, key, value] of head.matchAll(ATTR)) attrs[key] = unescape(value)
  return {
    n,
    element: null,
    url: attrs.url ?? '',
    path: attrs.path ?? '',
    ...(isText(attrs.author) ? { author: attrs.author } : {}),
    ...(isText(attrs.author) && HEX_COLOUR.test(attrs['author-color'] ?? '')
      ? { authorColor: attrs['author-color'] }
      : {})
  }
}

/**
 * The chip dsh draws for a comment turn wherever it projects user text — the durable row, steering,
 * the echo between Send and the durable message, and the queue strip — through its fenced-block
 * fold registry (`uiConversation.userTextFolds`, dsh `0.1.7-rc.2-tracy.6`). The ONLY drawing of a
 * comment turn: the echo and the durable row that replaces it are the same bubble with the same
 * projected text, so nothing moves or changes words when the durable message arrives (28/09; the
 * durable row's own chip above the bubble, a `conversation.chat.node` wrapper, was removed for
 * that). Words: `chipLabel`; tooltip: the element's address. `trailing` hides the hint line by the
 * rule `parseCommentTurn` leaves it out: the line right after the block, when it names `tracy_site`.
 *
 * A block of a several-comment turn answers its number too (`n`), which the registration draws as
 * a badge before the words. dsh hands a fold ONE block and what follows it, so the rules
 * {@link parseCommentTurn} skips a block by are the ones readable from there: a numbered block
 * whose number a later block repeats, or an unnumbered one followed by numbered blocks or by the
 * several-comment hint, answers null and dsh shows it as it is.
 * An image (01/10/2026, option a) reads as the Comments tab row names it: `Image · "<alt>"`, else
 * `Image · <file>` ({@link imageChipWords}) — read off the block's `image:` line, for an element with
 * no words of its own (no `text:` line), as {@link imageAnchor} decides for the row.
 * @param {string} block - the fenced block, from its opening backticks through its closing ones.
 * @param {string} after - the message text after the closing backticks.
 * @param {string} [imageWord] - "Image" in the reader's language (`comments.image`).
 * @returns {{ label: string, title: string, trailing: number, n?: number, author?: string, authorColor?: string,
 *   thread?: { who: string, text: string }[] } | null} null for a block this reader does not accept, which dsh then shows as it is. `author`: who wrote
 *   the comment (stage 6 turns), for the chip's bubble; `authorColor`: the bubble's colour as the server
 *   decided it, when the turn carries one. `thread`: its people lines ({@link peopleLines}),
 *   when the block carries a thread.
 */
export function commentTurnFold(block, after, imageWord = IMAGE_WORD) {
  const parsed = parseCommentTurn(block)
  if (!parsed || !parsed.element) return null
  const numbered = NUMBERED_HEAD.test(block)
  if (numbered) {
    if (repeated(parsed.items[0].n, after)) return null
  } else if (
    NUMBERED_HEAD.test(after) ||
    PAGE_HEAD.test(after) ||
    after.startsWith(`\n${MANY_HEAD}${ROADS}`) ||
    after.startsWith(`\n${MANY_HEAD_GENERAL}${ROADS}`) ||
    after.startsWith(`\n${MANY_BEFORE_PLACEHOLDER} For each element: ${ROADS}`) ||
    after.startsWith(`\n${MANY_BEFORE_PLACEHOLDER} ${GENERAL} For each element: ${ROADS}`) ||
    after.startsWith(`\n${MANY_BEFORE_S16} For each element: ${ROADS}`) ||
    after.startsWith(`\n${MANY_BEFORE_S16} ${GENERAL} For each element: ${ROADS}`) ||
    after.startsWith(`\n${MANY_BEFORE_STAGE6} For each element: ${ROADS}`) ||
    after.startsWith(`\n${MANY_BEFORE_STAGE6} ${GENERAL} For each element: ${ROADS}`)
  )
    return null
  const hint = /^\n([^\n]*)/.exec(after)
  const picture = blockImage(block)
  const words =
    picture === null
      ? chipLabel(parsed.element, { many: numbered })
      : imageChipWords(
          imageWord,
          imageAnchor({ tag: 'img', image: picture }) || chipLabel(parsed.element, { many: numbered })
        )
  const people = peopleLines(block)
  return {
    // A reply's chip: ↩ before the element's words (plan § Design B).
    label: parsed.items[0].replyTo !== undefined ? `↩ ${words}`.trim() : words,
    title: parsed.element.url,
    trailing: hint && hint[1].includes('`tracy_site`') ? hint[0].length : 0,
    ...(numbered ? { n: parsed.items[0].n } : {}),
    ...(parsed.element.author !== undefined ? { author: parsed.element.author } : {}),
    ...(parsed.element.authorColor !== undefined ? { authorColor: parsed.element.authorColor } : {}),
    ...(people.length > 0 ? { thread: people } : {})
  }
}

/** The English kind word before an image chip's words, when the caller hands none (`comments.image`). */
const IMAGE_WORD = 'Image'
/** A block's `image:` line (`imageLineOf`): `<file> · alt "<alt>"`, `<file> · no alt printed`, or the alt part alone. */
const IMAGE_LINE = /\nimage: ([^\n]*)\n/
const IMAGE_PARTS = /^(?:(.*?) · )?(?:alt "(.*)"|no alt printed)$/

/**
 * The picture a block's element is, when it is one: its `image:` line read back to a file and an alt,
 * for an element with no words of its own (a `text:` line means words, which name it instead). An
 * inline picture has no file. Null for any other block.
 * @param {string} block
 * @returns {{ src: string, alt: string } | null}
 */
function blockImage(block) {
  if (TEXT_LINE.test(block)) return null
  const line = IMAGE_LINE.exec(block)
  if (line === null) return null
  const parts = IMAGE_PARTS.exec(unescape(line[1]))
  if (parts === null) return null
  const file = parts[1] ?? ''
  return { src: file.startsWith('inline picture (') ? '' : file, alt: parts[2] ?? '' }
}

/**
 * The people lines of a block's thread, as the chat bubble shows them under the chip (stage 6, story
 * ThreadCardSendToChat: "Thread / Mai: … / Lee: …"): `Name: words`, oldest first. Left out: the line
 * marked `now` (the words being sent, already the bubble's own), `sent to Tracy by …` lines and
 * Tracy's own steps (`tracy: …`, turns before stage 6).
 * @param {string} block
 * @returns {{ who: string, text: string }[]}
 */
function peopleLines(block) {
  /** @type {{ who: string, text: string }[]} */
  const lines = []
  for (const [, raw] of block.matchAll(THREAD_LINES)) {
    const line = unescape(raw)
    if (line.startsWith('tracy: ') || line.startsWith(`${SENT_LINE} `)) continue
    // TH-3: a thread too long for the turn says what it leaves out; the bubble says it too.
    if (HIDDEN_LINE.test(line)) {
      lines.push({ who: '', text: line })
      continue
    }
    const timed = /^(.*?) \(([^()]*)\): (.*)$/.exec(line)
    if (timed) {
      if (/^now\b/.test(timed[2])) continue
      lines.push({ who: timed[1], text: timed[3] })
      continue
    }
    const bare = /^([^:]+): (.*)$/.exec(line)
    if (bare) lines.push({ who: bare[1], text: bare[2] })
  }
  return lines
}

/** @param {number} n @param {string} after @returns {boolean} a later block of `after` carries `n` too. */
function repeated(n, after) {
  return new RegExp(`\\n\`\`\`(?:tracy-element\\n<mentioned-element|tracy-page\\n<page) n="${n}" `).test(
    after
  )
}

/**
 * The chip of a `tracy-page` block (plan "comment review", H4): its number, the page icon (the
 * registration's), and the page's path — the host is the site's own, said once by the conversation.
 * Hides the hint line after it exactly as {@link commentTurnFold} does; a page block whose number a
 * later block repeats answers null, like an element's.
 * @param {string} block
 * @param {string} after
 * @returns {{ label: string, title: string, trailing: number, n: number, author?: string, authorColor?: string } | null}
 */
export function pageTurnFold(block, after) {
  const m = /^```tracy-page\n(<page [^\n]*>)\n<\/page>\n```$/.exec(block)
  const page = m ? pageOf(m[1]) : null
  if (!page || repeated(page.n, after)) return null
  const hint = /^\n([^\n]*)/.exec(after)
  return {
    label: page.path,
    title: page.url,
    trailing: hint && hint[1].includes('`tracy_site`') ? hint[0].length : 0,
    n: page.n,
    ...(page.author !== undefined ? { author: page.author } : {}),
    ...(page.authorColor !== undefined ? { authorColor: page.authorColor } : {})
  }
}

/**
 * Who a chip names: the name the turn gives them, and their colour as the server decided it
 * (`personFace`, keyed by account; the head's `author-color`). No `color` on a turn sent before it
 * carried one: the chip then takes the Comments tab's colour for that name, else the neutral grey
 * (`chipColor`, `comment-view.mjs`).
 * @typedef {{ name: string, color?: string }} ChipAuthor
 */

/**
 * Register {@link commentTurnFold} and {@link pageTurnFold} with dsh's fold registry for the calling plugin's lifetime.
 * @param {{ register(fold: { fence: string, fold(block: string, after: string): unknown }): () => void } | undefined} folds
 *   `ctx.uiConversation.userTextFolds`; absent on a dsh older than `0.1.7-rc.2-tracy.6`, where the
 *   echo keeps showing the raw block and nothing else changes.
 * @param {unknown} icon - the glyph the chip leads with (the page's React element; opaque here), or
 *   a function of the chip's number (undefined for a one-comment turn), of whether the chip has
 *   words, of its kind (`element`, or `page` for a `tracy-page` block) and of its author (stage 6,
 *   undefined on older turns: a {@link ChipAuthor}, with the colour the server decided for them when
 *   the turn carries one), answering that glyph — how a chip gets its author's bubble and a page
 *   chip its page icon. A chip whose block carries a thread gets a fifth argument, `{thread, label}`,
 *   and an empty label: the icon then draws the chip's words and the thread under them itself.
 * @param {{ image?: () => string }} [words] - the chip's own words in the reader's language, read at each
 *   fold: `image`, the kind before an image's alt or file (`comments.image`; English when absent).
 * @returns {() => void} disposer (a no-op when there is no registry).
 */
export function registerCommentFold(folds, icon, words = {}) {
  if (!folds || typeof folds.register !== 'function') return () => {}
  /** @param {(block: string, after: string) => { n?: number, label: string, author?: string, authorColor?: string, thread?: { who: string, text: string }[] } | null} read @param {'element' | 'page'} kind */
  const fold = (read, kind) => (/** @type {string} */ block, /** @type {string} */ after) => {
    const chip = read(block, after)
    if (!chip) return null
    const { n, author: name, authorColor, thread, ...shown } = chip
    if (typeof icon !== 'function') return { ...shown, icon }
    /** @type {ChipAuthor | undefined} */
    const author =
      name === undefined ? undefined : authorColor === undefined ? { name } : { name, color: authorColor }
    // A chip with a thread (F6, story ThreadCardSendToChat) is drawn whole by the icon: dsh's chip holds
    // one glyph and one line of words, and the thread goes UNDER the chip, so the words move inside.
    if (thread !== undefined)
      return {
        ...shown,
        label: '',
        icon: icon(n, shown.label !== '', kind, author, { thread, label: shown.label })
      }
    return { ...shown, icon: icon(n, shown.label !== '', kind, author) }
  }
  const disposers = [
    folds.register({
      fence: COMMENT_FENCE,
      fold: fold((block, after) => commentTurnFold(block, after, words.image?.() ?? IMAGE_WORD), 'element')
    }),
    // A comment about a whole page (plan "comment review", H4): same registry, its own fence.
    folds.register({ fence: PAGE_FENCE, fold: fold(pageTurnFold, 'page') })
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}

export { CHIP_EXCERPT, chipLabel }
