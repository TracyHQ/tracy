---
description: Which steps a UI task goes through, who does what at each step, and what the agent must hand back so the requester can accept it.
sources:
  - DESIGN.md
  - packages/dev/tracy-design
  - packages/dev/tracy-design/.storybook/main.ts
  - docs/adr/0004-dsh-is-the-shell.md
  - docs/references/page-shell-tokens.md
---

# The workflow for a UI task

> [`DESIGN.md`](../../DESIGN.md) says **what it must look like** — tokens, classes, the two CSS modes.
> This file says **how to do it** — the steps, who does what, and what to hand back. Two files, two different
> questions; do not copy rules from the other one into here.

**Anyone may change the UI.** See something ugly, misaligned or hard to use — go ahead; you do not need to be the person in charge
of design. The only condition: **the agent doing it must follow the workflow below**, because
most of the ways things break here **report no error**; they just make the screen wrong.

## 1. Three roles, and who answers which question

| Role | Who | Answers |
|---|---|---|
| **Requester** | Anyone who sees something to fix | *What is wrong, what it should become* |
| **Agent** | The working session | *How to do it within the rules* |
| **Reviewer** | The requester, and Lee for big changes | *Is it good yet* |

🔒 **The agent does not ask the requester technical questions.** "Is this screen mode A or B", "which token",
"which file to edit" — the agent **looks it up itself**, it does not push it to the requester. The requester only says **what they
see**; translating that into technical work is the agent's job.

## 2. Before touching a single line

Read in order, stop when you have enough:

1. [`DESIGN.md`](../../DESIGN.md) §0 — the two CSS modes. **Without reading this section you may not edit.**
2. [`docs/references/vocabulary.md`](vocabulary.md) — words on the interface are a contract; do not invent words. And write as few words as possible: the "Words on the interface" rule in `DESIGN.md` §5.
3. [`docs/references/definitions.md`](definitions.md) — look up any concept you are unsure of here.

Then answer **one question, before anything else**:

> **Where will this screen eventually run?**

| Answer | Mode | Meaning |
|---|---|---|
| A Tracy tab inside dsh | **B** | dsh owns the page. No Tailwind, plain `tv-*` CSS |
| A page `tracy-web` returns directly (sign-in, handoff) | **C** | Tracy owns it, but no build, no Tailwind — see [`page-shell-tokens.md`](page-shell-tokens.md) |
| The design bench / Storybook | **A** | A place for **drawing**, not where the product runs |

Answering this wrong ruins the whole task, not one spot.

## 3. The working loop — four steps

### Step 1 — Bring the code into the design bench, do NOT redraw

For a screen that already has running code, the drawing **takes that very code**. For a page a Worker generates, the story
**imports that HTML-generating function directly**.

*Why:* redrawing by hand creates a second copy, and the two copies will drift apart on a day nobody
notices. Importing directly means the drawing **cannot** drift from what is running.

```bash
pnpm --filter @tracy/design dev          # the design bench: 31 views, port 5199
pnpm --filter @tracy/design storybook    # Storybook: multi-state screens, port 6007
```

**Design bench or Storybook?** The design bench registers **one view per path** — it is the
product map, one state per screen. A screen with **several real states** (empty · with data ·
waiting · error) gets a `.stories.tsx` next to the component.

### Step 1a — Screens WITH CODE live in `Screens/`, and the stories there IMPORT that code

Every product screen that has code is in Storybook, under the root **`Screens/`**:

| Group | How many | What the stories import |
|---|---|---|
| `Screens/App` | 14 | the real components in `src/pages/**`, wrapped in a `MemoryRouter` at the right path |
| `Screens/Worker pages` | 9 | **the HTML-generating functions themselves** of `workers/fleet-bar/src/pages.js`, rendered in an `<iframe srcDoc>` |

🔒 **DO NOT WRAP `App`.** `App` drags in `KitBar` — the design bench's floating bar, with its own theme switch
and a `<Link to="/">`. In Storybook it competes with the toolbar's switch and the Gallery
button leads to a route that does not exist. The full app frame already has its own story: `pages/shell/TracyShell`.

🔒 **A ROUTER IS REQUIRED, AND `pattern` DIFFERS FROM `path`.** `SettingsLayout` calls `useLocation`,
`SiteSettingsShell` calls `useParams().siteKey`, both build `<Link>`s — without a router they **throw
at render time**. And you must pass two things: `pattern` (`/settings/site/:siteKey/general`) so
`useParams` has values, `path` (`/settings/site/example.com/general`) so `useLocation` highlights the right
item. Passing the pattern to both makes the title show the string `":siteKey"` — no error, just wrong, and nobody spots
it while skimming.

`preview.tsx` deliberately does **not** pre-wrap a router: "an extra router hides real navigation bugs".

### Step 1b — A screen WITHOUT CODE gets a mockup, and mockups have their own place

Step 1 says *"bring the code, do not redraw"*, and that rule is right for screens **already running**. A screen **without code** has
nothing to bring — before 03/09/2026 this repo had no place to draw it, so design questions
were answered by writing real code straight away and then fixing it.

That place is now [`packages/dev/tracy-design/src/mockups/`](../../packages/dev/tracy-design/src/mockups/README.md).
The conventions were copied from `tracy-desk/packages/ui/stories/components/composites/*-mock.stories.tsx`, where
this approach has really run:

| | |
|---|---|
| File name | `<name>.mock.stories.tsx` |
| `title` | `Mockups/<Name>` — the third root in the tree, next to `UI` and `pages` |
| First line of the file | **the design question** it exists to answer, not a description of what it draws |
| Built with | only `@tracy/ui`. No new components, no CSS of its own |
| When done | **delete it** — the story moves to `Screens/App`, the mockup here disappears |

Today this lane holds **20 stories / 3 screens**: `Mockups/Settings` (the 10 `planned` screens of Settings),
`Mockups/Site settings` (the 7 `planned` screens of Site settings), `Mockups/Site list row` (one question
about row density). All 17 `planned` screens take their content from the `items` array of the matching `<Placeholder>`
in `views.tsx` — **a mockup decides the SHAPE, not the SCOPE**.

🔒 **TWO MARKERS, NOT ONE.** The file suffix is for whoever opens the directory, the `title` prefix for whoever
looks at the Storybook tree. The reviewer must know they are looking at a **proposal**, not something
running — confusing the two means approving the wrong product, and nothing on screen tells the difference.

🔒 **DELETE WHEN DONE, and this is the rule that keeps Step 1 from being voided.** A mockup left behind after the screen
really runs is exactly the second-copy-of-a-screen that Step 1 forbids — only labelled "draft",
so nobody feels obliged to keep it in sync.

### Step 2 — Edit in the design bench

This splits in two, and confusing them wastes effort:

| Screen kind | "Edit in the design bench" means |
|---|---|
| **Worker pages** | Edit **the Worker file itself**. Storybook follows at once, because the story imports that function |
| **dsh plugins** | The bench is only **a drawing**. The real code is written separately per `DESIGN.md` §0 and §3 |

### Step 3 — When happy, lock it in with `play`, then ask for review

`play` is a script attached to a story: it acts like a user and then checks the result. **Every design
decision becomes an assertion.**

*Why it is mandatory:* a screenshot keeps "what it looks like", **not** "what must disappear
when the state changes". Without `play`, the next edit removes a decision without anyone knowing.

### Step 4 — Ship it for real

| Kind | Path to production |
|---|---|
| Pages of `apps/tracy-web` | Merge into `main`; CI builds the image and deploys to prod1 (before 16/09/2026 this was a Worker deploy) |
| dsh plugins | **Port to plain CSS** `tv-*` + `--dsw-alias-*`. Never bring Tailwind into dsh's page |

⚠ The port step **is not copying**. A screen drawn with utility classes in mode A must be **rewritten** in
mode B, and the rewrite may look different. The reviewer must look at **the ported version**, not
the one on the design bench.

## 4. Four prohibitions

1. **Never draw in `vendor/shadcn-admin`.** It is `.gitignore`d — a template for READING only. What is drawn there
   is kept by no repo. Tracy's stories had to move out on 02/09 for exactly this reason.
2. **Never bring Tailwind or a reset into dsh's page.** A second reset wipes the host's formatting —
   breaking **someone else's** interface, not ours.
3. **Never conclude "matches the design system" without rendering it and looking.** Measured on 01/09: an
   agent wrote exactly that sentence after **only reading the code** — the tokens right, tests green, the page looking like
   nothing at all. No colour rule catches that.
4. **Never borrow a template's whole layout.** Borrow **the inside of a card** (lists, badges,
   buttons). The sidebar and header belong to dsh; drawing over them builds two overlapping navigation layers.

## 5. Handing back so the requester can accept it

The requester **does not read code**. A handoff missing any of the four lines below is not finished:

1. **Where to open it** — a specific URL, with the port. Not "run storybook and look".
2. **Which mode you are looking at** — the drawing on the design bench, or **the ported version** that will really run. This is
   the line most often missing, and without it the reviewer is reviewing the wrong thing.
3. **Where to click to see dark mode** — React views: the Theme switch on the Storybook toolbar. Worker
   pages: **change the operating system's theme**, because they follow `prefers-color-scheme` and do not listen to
   that switch.
4. **What is not done yet** — which parts are still drawings, which really run.

## 6. When the requester reports a bug, the agent classifies it first

Before fixing, determine whose the broken spot is:

| Broken spot | Whose | What to do |
|---|---|---|
| The insides of a Tracy tab/card | Tracy | Fix normally |
| The sidebar, header, window frame | **dsh** | Do not edit directly. Overriding them violates [`ADR 0004`](../adr/0004-dsh-is-the-shell.md) — report back and find another way |
| dsh's interface breaks **after** our edit | Our bug | Almost always a reset/Tailwind leaking into mode B. Remove it at the root, do not patch spot by spot |
| A Worker page "has no dark mode" | Usually **not a bug** | Ask again: has the OS theme been changed |

Tell the requester in their own words — *"this spot is dsh's frame so I cannot edit it directly"* —
rather than silently skipping half the request.
