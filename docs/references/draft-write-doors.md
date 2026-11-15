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
| unpublish, unassign, delete a media file | not used by the write. The doors now exist (measured on plugin 0.24.85, [ai-quickstart-contract.md](ai-quickstart-contract.md) "Door measurements"): `content.update` `published: 0` (an article: `state: 0`) hides a module, menu item, category or contact, reversibly, its address then answering 404; `moduleAssignment` `menuids: "[]"` is the one "no page" value; `media.delete` removes a picture under `images/`, with `dry_run` answering `usedIn`. Removal through them is a later task |

None of these is used by the florist fixture's write plan.

## The wiring

`siteWriteOf(deps, ctx, how, inputs, records)` gives the step its `draftWrite` only when `deps.site.siteDoors` is a
function, `how.door.apply` is there and the run has a site key. Otherwise it is null and the step stops typed
(`write_not_ready_for_draft`), writing nothing. `deps.site` is injected by `app.js` under `draft:`:

| Key | Production | Note |
|---|---|---|
| `siteDoors` | not wired | lands with `scripts/ai-quickstart/site-doors.mjs` |
| `publicFile(siteKey, path)` | `siteReader(siteKey).bytes(path)` | |
| `blankContract(kit)` | `blankContractReader(AI_QUICKSTARTS_DIR)` | `<slug>/<cms>/<version>/blank-site-contract/content-map.json` |
| `pictures` | not wired | tests only; production uses `step-chain-draft-stored.js` |

The run record of the write is kept in the process by run id, between the frame's two attempts of the step.

Stored pictures (`step-chain-draft-stored.js`): an own picture is its stored draft picture (`draft:<id>`, through the
manifest's `sourceUrl`); a library icon with no plate is drawn by `icon-render.js`. A generated picture has no stored
bytes yet, so a real run stops at `picture_not_stored` before any door call. That is the next blocker after the doors.

## The build store

`deps.builds` (`step-chain-draft-builds.js`) is the interface a write, a revision, a restore and an abandon call:
`read`, `keep` (compare and set), `current`, `begin`, `unfinished`, `end`, `forget`, one store per site key.
`memoryBuildStore()` implements it for tests and trial runs only. No durable store exists: `build_draft.build`
(migration 219) is the approval record, not a store of finished builds per site. The build chat must provide one and
pass it as `draft.builds` in `app.js`; until then a run reports `build.kept: false`.

## Not verified on a real site

No test here touches a real site. Not measured:

- the plugin's answer shapes for `content.update` ids and for `content.list` with `include_body`;
- the `media.upload` answer path on Joomla, and whether `publicFile` serves new bytes at once (cache, CDN);
- (now measured, plugin 0.24.85: a `content.update` sent again with the same `apply_id` is written again; only
  `content.contract` replays, within one apply id and request id. The memory site does the same.)
- the seat and toolset gate for `moduleAssignment` and `module` (toolset `code`) for the owner.
