---
description: The memory site behind the draft write step's tests, which implements the site doors over the blank site contract and behaves as the Claude Cowork plugin 0.24.85 was measured to behave. Covers its refusals, its replay rule (contract only), how its HTML piece functions rewrite a stored value, and the rendered output probe.
sources:
  - packages/wo/website-opportunities/domain/write-order-memory-doors.mjs
  - packages/wo/website-opportunities/domain/write-order-memory-rules.mjs
  - packages/wo/website-opportunities/domain/write-order-memory-html.mjs
  - packages/wo/website-opportunities/domain/write-order-memory-render.mjs
  - packages/wo/website-opportunities/domain/draft-write-entities.mjs
---

# The memory site of the draft write

The tests of the write step ([draft-write-step.md](draft-write-step.md)) run every plan on a blank site in memory
(`write-order-memory-doors.mjs`). It implements the doors over the blank site contract's lock rows and content map,
and refuses what the plugin refuses (`write-order-memory-rules.mjs`), so a plan or a step that breaks a rule fails its
test. Each rule below says where it comes from: the door measurements of plugin 0.24.85
([ai-quickstart-contract.md](ai-quickstart-contract.md), "Door measurements"), #584, or memory only.

## Refusals

| Call | Refusal | Rule |
|---|---|---|
| every write | `APPLY_ID_REQUIRED` | no apply id |
| `contract` | `contract_failed` | the same apply id and request id with other content (`request_id reused with different content`), or a new request id under the same apply id (`Use one new apply_id per content revision`); measured |
| `contract` | `REVISION_REQUIRED`, `REVISION_STALE` | the revision moves on every write |
| `contract` | `SLOT_UNKNOWN` | no such slot |
| `contract` | `SLOT_NOT_CONTENT` | `<` or `>`; a straight double quote in a slot that opens empty |
| `contract` | `HTML_SLOT_MISSING` | an empty string at a text node |
| `contract` | `SLOT_EMPTY_STATE` | filling a slot whose sample is empty and that does not open empty, or emptying an occupied one |
| `contract` | `SLOT_TOO_LONG` | over the slot's `maxCharacters`, counted as the plugin counts it (`doorLength`: what a visitor reads, in code points; a fixed width column, a link or a picture path counts its raw value) |
| `contract` | `MARKERS_PRINTED_AS_WORDS` | content map markers at an HTML slot (memory only: the real site stores them and prints them as words) |
| `contract` | `SLOT_NOT_REMOVABLE` | a `removes` slot that is not an element of an HTML value |
| `contract` | `MODULE_TITLE_REQUIRED` | a module whose title the blank site emptied, written without its title in the same apply (#584) |
| `update` | `NOT_FOUND`, `KIND_UNKNOWN` | no such record or module of an assignment; an unknown kind (memory only) |
| `update` | `write_failed` | measured, with Joomla's own sentence and no code of its own: a new article with no title or a blank one (`COM_CONTENT_WARNING_PROVIDE_VALID_NAME`), a new category (`creating a category needs title`) or module (`Module must have a title.`) the same; a new contact with no `name`, `params`, `metadata` or `metadesc` key (`Field '<column>' doesn't have a default value`, the first one missing); an assignment whose `menuids` is no JSON list (`""`, `"null"`) |
| `update` | `bad_params` | an assignment with no `menuids` (`fields required`); measured |

A new contact whose name is `""` or `" "` is **written**, as the site writes it (measured): the build refuses it
itself (`record_name_empty`, [draft-write-guards.md](draft-write-guards.md)).

## Replay

As measured: only `content.contract` keeps answers. It keeps the first answer under its apply id with its request id
(the apply id when the call sends none) and a sha256 of what it asked (`changes` and `removes`, keys sorted, bytes by
their own hash; never `expectedRevision`). The same apply id and request id with the same content answer the first
answer again and change nothing, with the revision read before the first apply or the current one.

`content.update`, `media.upload` and `site.identity` keep no replay: the same apply id writes again on every call, and
`steps(applyId)` counts the writes, as `apply.list {apply_id}` lists one step per write. So nothing at the door keeps
a resumed run from making a record twice: the run record does (`madeOnce` marks a create pending before the door call
and finds the record by its mark after a crash). `draft-write-resume-no-replay.test.mjs` crashes the florist's run at
every door call, after it acted and before, and resumes: every record is created by one write, the site is the site of
an uninterrupted run, and a resume sends at most the one call that died again. The same resume with the run record
thrown away makes records twice.

Scripted failures: `fail` (the n-th mutating call throws `door_failed` before it acts, a door that may pass when asked
again; the run redoes it once) and `crash` (`n` or `{at: n, before?}`: the n-th mutating call acts, or does not when
`before`, then the process "dies" with an error marked `fatal`, so a resumed run is tested at every boundary).

## HTML pieces

The piece functions (`write-order-memory-html.mjs`) wrap a stored value in a `div` under `/html/body`, as the plugin's
`ContentSlots::html` does, and read a value written in the content map's markers as tags.

- An HTML value is parsed as an HTML parser reads it: an unclosed `li` ends where the next one opens inside its list
  (a stored list value is written as `((li))` rows without end tags), and an unclosed `p` ends where a block opens
  (`div`, `ul`, `ol`, `table`, a heading, another `p` and the rest of the parser's list).
- Every character reference is read (`draft-write-entities.mjs`: decimal and hex, the named ones a value may carry,
  every accented letter by its name). A name it does not know stays as it is, as a browser shows one.
- A piece reads as its node's text; an attribute piece as its value. A read changes nothing.
- A set or a remove writes the **whole value** back as libxml serializes it (measured): attribute order, comments and
  white space are kept, and `&amp;`, `&lt;`, `&gt;` stay; every other character reference becomes its character, in
  the edited node and its siblings alike (`Caf&eacute;` comes back `Café`); every attribute value comes back double
  quoted; a void element loses its slash (`<br/>` as `<br>`); an element left open is closed, so a marker value comes
  back with `((/li))` after every row; a space in an `href` or `src` is percent encoded (`%20`).

The real step does not trust the piece functions for the untouched parts: its read back compares them with its own
reader as an HTML reader reads them (`draft-write-html-rest.mjs`, see the write step's read back), so a plugin fault
that changes what a sibling says stops the write, and the measured rewriting of forms passes it.

## What the site prints

`renderedOf(memory, {known})` (`write-order-memory-render.mjs`) prints every stored value the way the measured template
does: a JA ACM module's `jatools-config` with every `((` and `))` replaced blindly before it is decoded (`decodeMarkers`),
every other value raw as stored, an HTML column as HTML, a contract slot from its current value (a piece as the DOM
escaped it). A raw value is printed at once in a text node and in a double and a single quoted attribute of a probe
element, so a value that breaks out of any of them shows. `known` (`valuesOf` of a blank site) leaves out the kit's own
values. `undeclaredIn(html, allowed)` lists every tag not `allowed`, every probe attribute the probe did not write,
every `on*` handler and every code address in an address attribute.
