# tracy-view — Tracy's composer for dsh, and the language bridge behind it

A dsh client plugin. It occupies **one** slot — `conversation.composer.bar` — and leaves the
conversation itself to dsh's own `ui-chat`.

> **The package name is a legacy.** It used to be a *view*; it no longer is. Renaming it would drag along the symlinks
> in `fleet/dsh/Dockerfile`, `scripts/dev.mjs`, and the profile on every running sidecar —
> so the name stays until there is a deliberate rename.

## Why it is no longer a view (30/08/2026)

Measured side by side, **in the same session**, differing only by one `disabled: true` line:

| | tracy-view's view | dsh's own `ui-chat` |
|---|---|---|
| one tool call | `bash {"command":"ls -la","description":"List workspace files"}` | **`Bash · List workspace files`** |
| tab row | lost (the plugin took the header slot too) | **`Chat │ Trajectory │ File Viewer`** |
| turn summary | none | `2 turns · 5 steps │ LLM 16.9s · Tool call 29.4s │ TTFT 4.2s` |

The last row is exactly `4 turns · 72 steps · 11m 12s working` in
[`@tracy/design`](../../dev/tracy-design/README.md) — the design mockup thing **dsh already does**.

So this plugin once wrote **1597 lines to replace a frame better than itself**, and along the way dropped
tool-call folding, the Trajectory view and the File Viewer. It is now 3 files, a ~16 KB bundle.

**The lesson, written down so it is not repeated:** dsh's `packages/client/ui-chat` is **fully tokenised**
(`--dsw-alias-*`, `--dsh-chat-*`), and `ui-theme` says outright *"third-party themes can register
alias-token overrides through `ctx.theme`"*. Making dsh's chat look like Tracy is **a theme job,
not a rendering job**. Before redrawing anything of dsh's — check whether it already has tokens.

## What remains, and why each piece earns its place

| Piece | Why dsh cannot replace it |
|---|---|
| Dock (`conversation.input.dock`) | the first screen of the site-creation workspace (`/new/`): a heading + two cards opening the Design inspiration / Add site tabs — dsh has no reason to ship that. ⚠ **The four suggestion chips ("Check this page's SEO"…) were removed on 21/09/2026**: in a site's workspace the Build tab leads the session, and chips asking about "this page" sat over the to-do of a site not yet built. Full reasoning at the top of `src/client/index.tsx` |
| Comment turn chip (`registerCommentFold`) | a turn sent from the Browser tab's Comment mode carries a `tracy-element` block for the model to read; dsh cannot read that block. Tracy registers a *fenced-block fold* (`uiConversation.userTextFolds`) so dsh draws a chip (icon + plain words, tooltip = the element's address) instead of the raw block — on the durable row, steering, the echo and the queue, drawn the same way. ⚠ **No `conversation.chat.node` wrapper since 28/09**: it drew the durable row's chip ABOVE the bubble while the echo drew it INSIDE the bubble → the row jumped 64→70px when the durable message replaced the echo (`tasks/evidence/comment-row-identical/`) |
| Comments view (`CommentsView.tsx`, `comment-view.mjs`) | the `tracy-comments` tab next to Chat (slot `conversation.view`, like Trajectory) lists the Browser tab's comments from the `tracy:comment-list` event and sends `tracy:comment-act` on a press (Resolve, Reopen, show on page, Send all, Delete all); while the view is open, its composer replaces the chat box through the `conversation.composer` chain (priority 10, after approvals). The number on the tab is a `data-tracy-count` attribute on dsh's tab button, because dsh only re-reads view labels when a view registers or the language changes. Plan `tasks/todo-comment-review.md` H3–H5 |
| `applyShellLanguage()` | a round trip through dsh's settings API, which **only listens on loopback** (ADR 0004); depends on Tracy's `tracy_lang` cookie |
| `watchShell()` | reclaims the ~280px gutter `ui-layout` keeps after the site patch turns off `ui-sidebar` |

It does **not** take `conversation.composer`: that is where dsh mounts the ApprovalPanel
(`select: selectApproval, priority: 1`); taking it silently removes the UI that allows/blocks tool calls.
`conversation.composer.bar` is a `single` slot, and the runtime renders the first entry **by priority**, so
**the smaller number wins** — use `-10`.

## Build

```
node scripts/build-client.mjs          # → lib/client.js
node scripts/build-client.mjs --check  # CI gate (part of pnpm dsh-locale:check)
```

esbuild bundles `src/client/*` into CJS, then wraps it in the `__ModuleLoader__.load` factory dsh requires.
`react*` stays external **on purpose**: dsh shares one React across all plugins, and a second copy makes hooks lose their
dispatcher — a blank panel, no error.

## Installing on a sidecar

Copy this folder into `$DESK_HOME/profiles/node_modules/`, then add the row:

```yaml
# profiles/web/cordis.patch.yml
- id: tracy-chat-input
  name: tracy-view
```

Two rules that have bitten real people:

1. **The name must resolve from where dsh looks.** Installed globally on the fleet → dsh's own
   `node_modules` (that is why there is a symlink in `fleet/dsh/Dockerfile`). Run per profile → the profile
   folder. In the wrong place the row loads silently and does nothing — looking exactly like "the patch is not allowed
   to insert". The real error is `Cannot find package 'tracy-chat-input' imported from …/profiles/web/`.
2. **Serving `/plugins/<id>/client.js` needs `dsh.client` declared** in `package.json`; only
   `exports["./client"]` is ignored, with no error. A two-sided package needs **both**
   `dsh.bundle.patch` **and** `dsh.client`.

And: patches do **not** deep-merge (overriding `config` replaces the whole block), while **bundle membership is read at
boot** whereas patch edits hot-reload.

## Not done yet

- **Theme tokens.** The logical next step: override `--dsw-alias-*` so `ui-chat` wears Tracy's colours.
  Not done here because `ctx.theme` is a new `inject`, and a wrong `inject` has killed this plugin
  once already (see the 🔒 block in `index.tsx`).
- **dsh's words.** Screenshots still show `Session log`, `Workspace Write` — both on the
  **banned words** list in [`docs/references/vocabulary.md`](../../../docs/references/vocabulary.md).
  That is the job of [`tracy-locale`](../../locale/tracy-locale-vi/README.md), not of this package.
