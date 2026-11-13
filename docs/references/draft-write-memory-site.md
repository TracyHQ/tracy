---
description: The memory site behind the draft write step's tests, which implements the site doors over the blank site contract and refuses what the Claude Cowork plugin refuses. Covers its refusals, its apply id rule and how its HTML piece functions read and write a stored value.
sources:
  - packages/wo/website-opportunities/domain/write-order-memory-doors.mjs
  - packages/wo/website-opportunities/domain/write-order-memory-rules.mjs
  - packages/wo/website-opportunities/domain/write-order-memory-html.mjs
  - packages/wo/website-opportunities/domain/draft-write-entities.mjs
---

# The memory site of the draft write

The tests of the write step ([draft-write-step.md](draft-write-step.md)) run every plan on a blank site in memory
(`write-order-memory-doors.mjs`). It implements the doors over the blank site contract's lock rows and content map,
and refuses what the plugin refuses (`write-order-memory-rules.mjs`), so a plan or a step that breaks a rule fails its
test.

## Refusals

| Call | Refusal | Rule |
|---|---|---|
| every write | `APPLY_ID_REQUIRED` | no apply id |
| every write | `APPLY_ID_REUSED` | an apply id first used at another door, or with another payload (a contract apply's `expectedRevision` is not part of the payload: a retry reads the revision again) |
| `contract` | `REVISION_REQUIRED`, `REVISION_STALE` | the revision moves on every write |
| `contract` | `SLOT_UNKNOWN` | no such slot |
| `contract` | `SLOT_NOT_CONTENT` | `<` or `>`; a straight double quote in a slot that opens empty |
| `contract` | `HTML_SLOT_MISSING` | an empty string at a text node |
| `contract` | `SLOT_EMPTY_STATE` | filling a slot whose sample is empty and that does not open empty, or emptying an occupied one |
| `contract` | `SLOT_TOO_LONG` | over the slot's `maxCharacters`, counted as the plugin counts it (`doorLength` of `draft-write-length.mjs`: what a visitor reads, in code points; a fixed width column, a link or a picture path counts its raw value) |
| `contract` | `MARKERS_PRINTED_AS_WORDS` | content map markers at an HTML slot (memory only: the real site stores them and prints them as words) |
| `contract` | `SLOT_NOT_REMOVABLE` | a `removes` slot that is not an element of an HTML value |
| `contract` | `MODULE_TITLE_REQUIRED` | a module whose title the blank site emptied, written without its title in the same apply |
| `update` | `NOT_FOUND`, `KIND_UNKNOWN` | no such record or module of an assignment; an unknown kind |
| `update` | `TITLE_REQUIRED`, `MODULE_TITLE_REQUIRED` | a new article or category with no title, a contact with no name, a module with no title (Joomla's table check; not measured in #584, the plugin's code for it is not stated) |
| `html` | `HTML_SLOT_MISSING` | an xpath naming no node or more than one |

A replayed apply id with the same door and payload answers the first answer again and changes nothing. The answer is
kept with the door name and a sha256 of the payload (keys sorted, bytes by their own hash).

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
- A piece reads as its node's text; an attribute piece as its value.
- A node the edit did not change is written back exactly as it was read: its text with its own references
  (`Caf&eacute;` stays `Caf&eacute;`), its start tag with its own quoting. Only the edited node is written anew.

The real step does not trust the piece functions for this: its read back compares the untouched parts of every value
it wrote pieces of with its own reader (`draft-write-html-rest.mjs`, see the write step's read back), so a plugin fault
of this kind stops the write.
