---
description: The wiring between the write step of a draft run and a real site. Covers the transport, the door client, which identity every call carries, the columns created records take from the kit, and what is not verified on a real site.
sources:
  - apps/tracy-web/src/step-chain-draft-send.js
  - apps/tracy-web/src/step-chain-draft-site.js
  - apps/tracy-web/src/step-chain-draft-write-ops.js
---

# The write step of a draft run on a real site

The write step of a run built from an approved build draft (#597) writes the write order on the site the run created.
This page is the wiring between that step and the site: who calls what, which identity every call carries, and what
is still missing. The step itself, its guards and its run record: [`draft-write-step.md`](draft-write-step.md).

## Three layers

| Layer | File | Owns |
|---|---|---|
| Transport | `apps/tracy-web/src/step-chain-draft-send.js` (`draftSendOf`) | one plugin call through the run's Apply door |
| Door client | `scripts/ai-quickstart/site-doors.mjs` (`siteDoors`, not on this branch yet) | which door is which plugin operation |
| Wiring | `apps/tracy-web/src/step-chain-draft-site.js` (`siteWriteOf`) | `deps.draftWrite` of the step from the two above |

## The transport

`send(operation, payload)` sends `{siteKey, action: operation, params: payload}` to the Apply door the step chain
engine hands the write step (`how.door.apply`). That door is `applyFor(email, runId)` of `app.js`, so every call is
`applyAs(email, call, {setupRun: runId})`:

- its `site_write` row carries the origin `{kind: 'setup', ref: runId}` (`site-write-origin.test.mjs`);
- Site changes folds the run's writes into one "Tracy setup" row;
- the run frame (`sites/brief-build.js`, the engine has `requiresSetupHold`) holds the webroot under
  `setupTurnOf(runId)` around the writes and closes the setup moment with `SETUP_MOMENT_VIA`.

It answers the plugin's answer (`{ok: true, ...}`). A refusal (`ok: false`, or no answer at all) throws an Error with
the answer's `code` (`door_refused` when there is none); the Apply door's allowlist refuses an action it does not
name before any site sees it. A call that throws after the run's signal was aborted is marked `fatal`, so the write
resumes from its run record instead of retrying in place. Every `params.apply_id` is kept on the run's row
(`recordedDoor`), and no call goes out once the run is stopped.

## What the door client must be

```
siteDoors({send, siteKey, publicFile, signal}) -> {get, update, find, inspect, contract, read, upload, media,
                                                   identity, readIdentity, html}
```

- `send`: the transport above. `siteKey`: the site. `signal`: the run's signal.
- `publicFile(path)`: the bytes of a public file of the site, or null (`app.js`: `siteReader(siteKey).bytes`), or
  null when not wired. No plugin operation reads a file's bytes back, so the `media({path})` door needs it.
- The doors and their answers: [`draft-write-step.md`](draft-write-step.md), "The doors".
- `html` is pure and local (the plugin's piece functions; `write-order-memory-html.mjs` is the port).

Doors with no plugin operation on the blank site:

| Door call | Why there is no operation |
|---|---|
| `contract({removes: [...]})` with removes | `content.contract` apply has no removes; `rows.remove` is refused on the blank site (`SLOT_NOT_REMOVABLE`) |
| `media({path})` | no Apply action reads a file's bytes; it reads the site's public file (`publicFile`) |
| `hide`, `unassign`, `deleteMedia` | not used by a first build. A revision, a restore and an abandon use them (#599, [draft-revision-run.md](draft-revision-run.md) "Taking things off a site"), measured on plugin 0.24.85 ([ai-quickstart-contract.md](ai-quickstart-contract.md) "Door measurements"): `content.update` `published: 0` (an article: `state: 0`) hides a module, menu item, category or contact, reversibly, its address then answering 404; `moduleAssignment` `menuids: "[]"` is the one "no page" value; `media.delete` removes a picture under `images/`, with `dry_run` answering `usedIn`. `deleteRecord` and `revertDelete` answer `DOOR_NOT_AVAILABLE`: nothing is ever deleted |

None of these is used by the florist fixture's write plan.

## The wiring

`siteWriteOf(deps, ctx, how, inputs, records)` gives the step its `draftWrite` only when `deps.site.siteDoors` is a
function, `how.door.apply` is there and the run has a site key. Otherwise it is null and the step stops typed
(`write_not_ready_for_draft`), writing nothing. `deps.site` is injected by `app.js` under `draft:`:

| Key | Production | Note |
|---|---|---|
| `siteDoors` | not wired | lands with `scripts/ai-quickstart/site-doors.mjs` (not on the branch on 15/11) |
| `publicFile(siteKey, path)` | `siteReader(siteKey).bytes(path)` | |
| `blankContract(kit)` | `blankContractReader(AI_QUICKSTARTS_DIR)` | `<slug>/<cms>/<version>/blank-site-contract/content-map.json` |
| `pictures` | not wired | tests only; production uses `step-chain-draft-stored.js` |
| `templateSheets(siteKey, {variables})` | `readSiteSheets` of the site's home page (`write-step/site-sheets.js`) | the door `sheets` of the accent module (`look.accent`): the stylesheets the site serves, the template's accent read from them; absent, the accent stops `door_not_available` |

The run record of the write is kept by run id, between the frame's two attempts of the step, and saved through the
run record store `deps.runRecords` (`step-chain-draft-run-records.js`: `append`, `read`, `close`) before each door
call, so a run whose process died resumes or is abandoned from its last save. `app.js` passes
`buildEngine.runRecords` (the durable store the build chat provides) or, without one, `memoryRunRecords()`, which
lives as long as the process. A run that ends done closes its record.

**Restore and abandon of a built site** (`build-draft-rebuild-wiring.js`) take their doors from
`siteDoorsFor({siteKey, email, runId})` (`step-chain-draft-site.js`): the same `siteDoors` factory over
`draftSendOf({apply: applyFor(email, runId)})`, so every call is a write of that restore's or abandon's setup run.
It answers null while no `siteDoors` is wired (production today), and the doors then say plainly that the site
cannot be updated from the chat. These two run in the request, not in the run frame: no webroot hold is opened
around them (unlike a revision run, which goes through the frame).

Stored pictures (`step-chain-draft-stored.js`): an own picture is its stored draft picture (`draft:<id>`, through the
manifest's `sourceUrl`); a library icon with no plate is drawn by `icon-render.js`. A generated picture has no stored
bytes yet, so a real run stops at `picture_not_stored` before any door call. That is the next blocker after the doors.

## The build store

`deps.builds` (`step-chain-draft-builds.js`) is the interface a write, a revision, a restore and an abandon call:
`read`, `keep` (compare and set), `current`, `begin`, `unfinished`, `end`, `forget`, one store per site key.
`memoryBuildStore()` implements it for tests and trial runs only. No durable store exists: `build_draft.build`
(migration 219) is the approval record, not a store of finished builds per site. The build chat must provide one and
pass it as `draft.builds` in `app.js`; until then a run reports `build.kept: false`.

## What the created records carry from the kit

The plan reads the kit's page declarations (`mapping.pages`, [draft-write-guards.md](draft-write-guards.md), "The
kit's build declarations"), so `baseFieldsOf` (`step-chain-draft-write-ops.js`) sends more columns than a bare record:

| Record | Columns from the kit |
|---|---|
| a page item | `link` from the declared link with its references filled (`resolved` fills `{template, refs}`), `template_style_id`, `params` as JSON, `parent_id` (the parent page's item) |
| a category | `extension`, `params` as JSON (`pages.<type>.record.category`) |
| an article, a contact | the `base` columns (`featured`, `images`, `attribs`, `params`, `metadata`, an object written as JSON), a contact's `catid` |
| an HTML value of a created record | the frame the kit declares (`op.frames`, `createdFrames`) before its pieces are set |

A page reached under its list page (`plan.under`) has no menu item: `page:<id>` resolves to its declared address for
a link (`form: "address"`), and to the list page's item for an assignment or a key; two such pages assigned through
one item are sent once. A menu item of a menu that declares `menu.items.link: "page-address"` is a `url` item
(`component_id` 0) whose link is the page's address, so it reaches such a page. An alias item (a menu with no declared
`menu.items`) is sent with link `index.php?Itemid=`, the link Joomla stores for an alias, and its target in
`params.aliasoptions`; an empty link is refused on the blank site (measured K3), and the memory site refuses it too. An
alias to a page reached under its list page has no item to point at and refuses (`ref_unresolved`); the planner stops
before that (`menu_item_to_under_page`). A module assigned through the list page's item prints on the page
under it and on the list page alike, except at a detail position the kit declares (`under.detailPositions`, measured);
the planner writes such a block only when the list page shows the same record anyway, skips any other recipe block with
its reason, and stops only on a block no recipe of the page type places (`draft-write-guards.md`).

## Not verified on a real site

No test here touches a real site. Not measured:

- the plugin's answer shapes for `content.update` ids and for `content.list` with `include_body`;
- the `media.upload` answer path on Joomla, and whether `publicFile` serves new bytes at once (cache, CDN);
- (now measured, plugin 0.24.85: a `content.update` sent again with the same `apply_id` is written again; only
  `content.contract` replays, within one apply id and request id. The memory site does the same.)
- the seat and toolset gate for `moduleAssignment` and `module` (toolset `code`) for the owner.
- whether `content.update` of a menu item takes `template_style_id` and `parent_id` as the memory site does, and a
  created category its `extension` and `params`; the kit measured the pages on a blank site, not through these doors.

## The door client on the branch (2026-11-15)

`siteDoors` now lives in `packages/wo/website-opportunities/domain/site-doors.mjs` (`scripts/ai-quickstart/site-doors.mjs`
re-exports it), and `app.js` wires it as `siteDoors` of the draft deps' `site` and of `app.draftSiteDoorsFor`. The rows
above that say "not wired" or "not on this branch" are out of date. Every door it answers goes through `typedDoors`
(`apps/tracy-web/src/step-chain-draft-doors.js`), which settles the differences on the app's side:

| Point | The write step relies on | `siteDoors` answers | Settled |
|---|---|---|---|
| a door the plugin has no operation for | a typed stop | `DoorError` `DOOR_NOT_AVAILABLE` with `details.door` | app: stop `door_not_available` naming the door, `noRerun`, passed on with what ran |
| a call after the run's signal | never retried in place (`fatal`) | `DoorError` `ABORTED`, not fatal | app: marked `fatal` |
| `get` of a record the site does not hold | a row, or a refusal | `null` | app: `NOT_FOUND` with the kind and id |
| `publicFile` | the site's public file (`siteReader(siteKey).bytes`) | `media` needs it | app: wired; absent, `media` stops typed |
| `journal` | none needed: the run record (`madeOnce`) keeps a resume from making a record twice | memory, one per doors instance | app: the default |
| `html` | the plugin's piece functions | `memoryHtml`, the port | app: the default |
| `upload({mime})` | the picture's type | ignored | door client: open question |
| `update` of a create whose answer has no id | the new id | `{id: 0}` | door client: open question |

The test `step-chain-draft-real-doors.test.mjs` runs a stored draft through the real door client over an invented
plugin on the memory site (`draft-plugin-over-memory.mjs`): the build ends complete. With the real stored pictures it
stops at `picture_not_stored`, before any door: that is the next blocker.
