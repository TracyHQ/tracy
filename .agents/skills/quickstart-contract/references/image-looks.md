# Template kit looks: a text for every packed 1440 shot

Read after `SKILL.md` section 7d, once the template kit of this version is packed and approved
(`packages/cms/tracy-quickstart-tools/README.md`, "Make a kit for a new template", steps 1 to 6).

## What and why

A **look** is one to three plain English sentences saying what one 1440 shot of the kit shows: the layout, the
columns, the pictures and media, the headings and buttons, how dense it is. It sits on the page or block in
`template-kit.json` as `look: { image, sha256, text }`; `sha256` is the shot's sha256 in `images`, so a recaptured
shot makes its look stale. The site planner reads these texts instead of opening about 40 images per customer
(images are about half of what a plan costs). Looks are written **once per kit version**.

- 🔒 **Write them with YOUR OWN Claude Code** (the session you are in and its subagents). Never call a paid
  vision API and never ask for an API key: the tool itself makes no model call, no network call and opens no
  browser.
- 🔒 **/ops blocks the kit until every packed 1440 shot has a current look**: the Template kit step reads
  `kit-incomplete` and names the shots (`missingLooks`). Publish waits for it.
- Looks are text, not images: the approval (`approval.imagesSha256`) does not cover them, so writing them never
  asks for a new approval.

## Steps

`$KIT` is the kit folder of `build --full` (`--out`), `$WORK` a work folder outside the repo.

1. **List the shots that need a look** (no browser, no network):
   ```
   node packages/cms/tracy-quickstart-tools/template-kit/cli.mjs looks \
     --kit "$KIT/template-kit.json" --list --to "$WORK/looks-worklist.json"
   ```
   `need[]` holds one entry per shot: `image`, `sha256`, `file` (absolute path), `why` (`missing` or `stale`),
   `shows` (the pages and blocks it stands for) and, when stale, `was` (the old text). Exit 1 means a file is
   missing or differs from its sha256: fix the kit folder first, never describe another picture.
   Only the committed pack and its zip at hand? Unzip the pack into a folder and pass
   `--kit <that folder>/template-kit.json`; the image paths are relative to the kit's folder (`--images` to
   point elsewhere). Write the looks into the FULL kit when you have it: `pack` rebuilds the pack from it.
2. **Dispatch subagents** with the Agent tool: **model `opus`**, one batch of about **10 shots** each, **at most 2
   at a time**. Hand each one its entries (`image`, `sha256`, `file`) and this file's style guide, and this task:
   *"Open each image file with the Read tool and look at the whole picture. For each, write one entry
   `{ "image", "sha256", "text" }` (image and sha256 copied exactly) following the style guide. Write the entries
   as one JSON array to `$WORK/looks-batch-<n>.json` and nothing else. Never guess: describe only what is visible."*
   Dismiss each subagent as soon as it reports.
3. **Collect** every batch into one file:
   ```
   node -e 'const fs = require("fs"); const [out, ...files] = process.argv.slice(1)
     fs.writeFileSync(out, JSON.stringify(files.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8"))), null, 2))' \
     "$WORK/looks.json" "$WORK"/looks-batch-*.json
   ```
4. **Apply**:
   ```
   node packages/cms/tracy-quickstart-tools/template-kit/cli.mjs looks \
     --kit "$KIT/template-kit.json" --apply "$WORK/looks.json"
   ```
   Every entry is checked first (the image is the 1440 shot of a page or block, `sha256` is the current one,
   the text is plain ASCII English of 40 to 400 characters, no image twice); one wrong entry writes nothing and
   the errors are listed. Redo only the wrong entries (a new subagent), then apply again. Applying the same file
   twice changes nothing.
5. **List again** (step 1) until `need` is empty (`0 shots need a look`).
6. **Pack again**: `cli.mjs pack --out "$KIT"`. The pack copies each look to the pages and blocks drawn by another
   one's shot (`fullShotOf`, `shotOf`) and keeps the approval (same image set). Copy `$KIT/pack/template-kit.json`
   beside the contract; committing it is a stop point (`SKILL.md` section 10).

A rebuild (`build`, `assemble`) keeps the look of every shot whose bytes did not change; only new or changed shots
come back on the list.

## Style guide

- One to three sentences, 40 to 400 characters, plain ASCII English (no curly quotes, no dashes as punctuation).
- Say what a site owner sees, top to bottom: the layout (full width, boxed, split), the columns and how many items,
  the pictures and media (photo, illustration, video, map, icons, logos), the headings and buttons (how many, where),
  and how dense it is (airy, compact, a long list).
- Name roles, not words: "a large heading and a short intro line", never the demo's words, brand, people's names,
  prices or phone numbers (they change with every customer).
- Never guess what something means or does beyond what is visible: no "probably", no business meaning, no colours
  you cannot see, no motion you cannot see in a still shot.
- A shot of a whole page describes the page's sections in order, briefly; a block shot describes only that block.

Good (invented):
- "A full width photo banner with a large centred heading, one short line under it and two buttons side by side."
- "Three equal cards in a row, each with a round icon on top, a small heading and two lines of text; airy spacing."
- "A two column block: a tall portrait photo on the left, on the right a heading, a paragraph and a list of four
  ticked items with a button below."

Bad (invented):
- "This section probably shows the company's best services to attract new customers." (a guess about meaning,
  nothing about what is visible)
- "Hero with Welcome to Example Studio and a Book now button for 49 dollars." (quotes the demo words, brand and
  price, which every customer replaces)
