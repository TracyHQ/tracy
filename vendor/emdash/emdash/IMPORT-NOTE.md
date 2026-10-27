# Import into TCH — and a difference of KIND from every other vendor tree here

This tree is `emdash-cms/emdash` at tag **`emdash@1.1.0`**, commit
`913cb1bb9b7f08c3ff0d258b4420e53835b6a58e`, raised on 04/10/2026 from `emdash@1.0.1` (`0e8977c22`; before that
`emdash@0.37.0` `fc87efeb1`, imported
10/09 with `git subtree add --squash`). Intact, no folder dropped: **4,898 files, 81 MB**. Licence
**MIT** (`LICENSE` in this tree) — none of the restrictions of the commercial T4 file in
`vendor/joomlart-t4-skill`.

## It is NOT a vendor plugin, and do not read it as one

`ADR 0006` defines a vendor as **someone who writes plugins for Tracy**, and the other eight folders in
`vendor/` all fit that meaning: other people's code **running in Tracy's dsh page**.

EmDash does not run in dsh. It is **the CMS a customer's site runs on** — the same class as
WordPress and Joomla, not the same class as `dsh-passwords`. So the two familiar questions of
`vendor/` mean nothing here:

- *"Where is Tracy's patch?"* — there is none. `build-image.sh` states the rule outright:
  *"Tracy does not fork, does not patch: this script only clones a tag and builds."*
- *"Which bundle loads this package?"* — none. It is not a pnpm workspace member, and
  **do not add it**: `pnpm-workspace.yaml` is an allowlist, and adding a line here pulls EmDash's 20
  sub-packages plus its own lockfile into the whole repo's resolve.

## ⚠ THE FLEET DOES NOT BUILD FROM THIS TREE — today

`packages/fleet/tracy-fleet-operation/scripts/provision/emdash/build-image.sh` **clones again from
GitHub on the droplet itself** on every image build, and always takes the **latest tag**, not the version pinned
here. This copy is a **reference readable in place**, not a build source.

That means the two numbers can drift apart, and the reader must know which is which:

| | Which version | Who decides |
|---|---|---|
| `vendor/emdash/emdash` (this tree) | `1.1.0`, pinned | a commit in this repo |
| Image `tracy/emdash:<ver>` on the fleet | latest at build time | upstream, on the day someone runs the script |

Making the fleet build from this tree is a **deliberate change** in `build-image.sh`, and it
also changes the answer to *"which version does a customer's site run"* — from "the latest at build time" to "the version
Tracy settled on". Do not do it quietly.

## The first value it pays right away: checking the fleet's assumptions without SSH

`build-image.sh` inserts two patches into **the clone** (not upstream) and then `grep`s again to make
sure they landed — if upstream changes the Dockerfile, the script goes red. Before this import, the only way
to know whether they still land was a trial build on the droplet. Now read it in place:

```bash
grep -n '^RUN pnpm build \|^FROM deps AS build' vendor/emdash/emdash/Dockerfile
```

Measured on `0.37.0`: **both targets intact** (lines 34 and 40). Measured again on `1.0.1` (29/09) and `1.1.0` (04/10): still there, at lines 24 and 37 (the Dockerfile did not change between the two tags). Applying the patches for real: see todo-emdash-1-1.

The same spot also answers "why Tracy's image only has the blog":

```
40  RUN pnpm build && pnpm --filter @emdash-cms/template-blog build
43  RUN pnpm --filter @emdash-cms/template-blog deploy /deploy --prod --legacy
46  RUN cp -r /app/templates/blog/dist /deploy/dist
```

The template is pinned **in upstream's Dockerfile**, not in Tracy's code. Nine other
templates sit right next to it, in `templates/` — `blank`, `blog`, `marketing`, `portfolio`, `starter`, plus
four `-cloudflare` variants.

## Raising the version

```bash
git subtree pull --prefix vendor/emdash https://github.com/emdash-cms/emdash.git emdash@<version> --squash
```

The tag of **the app itself** is `emdash@<version>`. The monorepo has more than ten other prefixes
(`@emdash-cms/admin@…`, `create-emdash@…`) — pulling the wrong prefix pulls the wrong thing. `emdash` is
`packages/core`, and `packages/core/package.json` is where to read this tree's real version.

## It does NOT go into the dsh image, and one line keeps it that way

`.dockerignore` at the repo root excludes `vendor/emdash` from the build context. No `COPY` in
`packages/fleet/tracy-fleet-operation/dsh/Dockerfile` refers to it, so those 67 MB would only slow down every
image build on the host without changing the image's content. Deleting that exclusion line brings back exactly that
slowdown, with nothing to report it.

## Raised to 1.0.1 — 29/09/2026, and why not with `git subtree pull`

The first import recorded `git-subtree-dir: vendor/emdash`; the tree later moved to `vendor/emdash/emdash`
(`1d7f861f96`), so `git subtree pull --squash` reported *"was never added"*. This pass did exactly what a
squash does: compared the old tree with the tag `emdash@0.37.0` (differing in exactly one file, this `IMPORT-NOTE.md` — no
Tracy patch), replaced it with the tree of tag `emdash@1.0.1` (`git read-tree --prefix`), kept this file. The commit
carries the lines `git-subtree-dir: vendor/emdash/emdash` + `git-subtree-split: 0e8977c2…`, so the next pull can
use `git subtree pull --squash` again. Impact on Tracy's templates and how it was handled: `tasks/todo-emdash-1-0.md`.

## Raised to 1.1.0 — 04/10/2026, with `git subtree pull` (it worked)

This time `git subtree pull --prefix vendor/emdash/emdash https://github.com/emdash-cms/emdash.git emdash@1.1.0 --squash`
**ran straight through** thanks to the `git-subtree-dir`/`git-subtree-split` lines the 1.0 pass left behind. Two things had to be done by hand afterwards: (1) the subtree
merge **deleted `IMPORT-NOTE.md`** (the tag has no such file) — restored from the previous commit and then edited; (2) compared the tree with
`git archive emdash@1.1.0`: it differs only in this file (`diff -rq` also prints "Directory loop detected" at the `skills` symlinks — noise,
not a difference). Impact on the templates and how it was handled: `tasks/todo-emdash-1-1.md`.
