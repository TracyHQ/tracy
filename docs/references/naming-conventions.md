---
description: Naming conventions for files, packages and identifiers in packages/ and apps/, and the Vietnamese/English language rule.
sources:
  - packages
  - apps
  - scripts/check-language.ts
  - scripts/check-plugin-identity.ts
  - pnpm-workspace.yaml
  - docs/references/vocabulary.md
---

# Naming and language conventions

> This document is **the authoritative source**. `CLAUDE.md` only points here.
>
> It **records** the conventions that exist in TCH; it does not invent new ones. Where something deviates, the
> deviation is recorded with its reason rather than "fixed" back for consistency — renaming a package changes
> what bundles, profiles, images and symlinks point at.

> **The repo has TWO code areas, and every table must be read per area.** `packages/` is dsh plugins +
> libraries, TypeScript, pnpm workspace members, reaching customers through the **image** (ADR 0014).
> `workers/` is Cloudflare Workers, **plain JavaScript**, not workspace members, reaching
> customers through `wrangler deploy`. A single convention table would be wrong in
> one of the two — so §1–§2 are about `packages/`, and §2.1 is about `workers/`.

## 1. Packages and directories

The tree is `packages/<group>/<directory>/`, two levels. `pnpm-workspace.yaml` declares `packages/*/*` — the group
is a classification level for readers, not a build unit.

| Group | Holds |
|---|---|
| `brand/` | Tracy's identity inside dsh |
| `bundle/` | **bundle** packages — no code, they only declare sub-packages (see §1.3) |
| `desktop/` | the Electron shell |
| `dev/` | the team's tools, never reaching customers |
| `fleet/` | what runs on fleet servers |
| `locale/` | dictionaries |
| `tools/` | platform integrations (WordPress…) |
| `ui/` | component libraries and Tracy surfaces |

**Directories always carry the `tracy-` prefix.** Technically redundant (the path already has `packages/`), but
it is what lets an `ls ~/.dsh/profiles/*/node_modules` tell Tracy's packages apart among
hundreds of dsh packages.

### 1.1 Package names — a two-way equivalence

```
@tracy/dsh-*  ⟺  package.json has a `dsh` field  ⟺  has cordis.patch.yml
```

All three sides hold together for **11/11 plugins and bundles**, and all three fail together for **6/6 packages
that are not plugins**. This is not a coincidence but a definition: the `dsh` field is what dsh reads, `cordis.patch.yml`
is what turns a package into a row in the loader tree, and the `dsh-` prefix is what tells readers the
package only means something **inside** a running dsh.

| Directory | Package | Plugin? |
|---|---|---|
| `brand/tracy-brand` | `@tracy/dsh-brand` | ✅ |
| `bundle/tracy-cowork` | `@tracy/dsh-cowork-bundle` | ✅ (bundle) |
| `bundle/tracy-guest` | `@tracy/dsh-guest-bundle` | ✅ (bundle) |
| `bundle/tracy-native` | `@tracy/dsh-native-bundle` | ✅ (bundle) |
| `locale/tracy-locale-vi` | `@tracy/dsh-tracy-locale-vi` | ✅ |
| `tools/tracy-webroot-read` | `@tracy/dsh-webroot-read` | ✅ |
| `ui/tracy-chat-input` | `@tracy/dsh-chat-input` | ✅ |
| `ui/tracy-settings` | `@tracy/dsh-settings` | ✅ |

#### The `-bundle` suffix — THE PACKING LIST, not the goods

```
@tracy/dsh-<name>-bundle   ⟺  NO code, `files` holds only cordis.patch.yml
@tracy/dsh-<name>          ⟺  has code (index.js or lib/client.js)
```

Decided 2026-08-31, after the product owner read `@tracy/dsh-base` and asked straight out *"is it a plugin or a
bundle?"* — a name you cannot look the answer up from is a broken name.

Why the `dsh.bundle.patch` field **cannot** answer that: dsh calls "bundle" *any package a
profile can list in `dsh.profile.bundles`*, so the field is present in **both kinds**. It says the package
can be loaded, not what it contains.

The real distinction lies in two questions, and the name must carry the answer:

| | Bundle (`-bundle`) | Plugin |
|---|---|---|
| Has code? | **no** — two files: `cordis.patch.yml` + `package.json` | yes |
| How many rows does the patch insert? | **many** (other packages) | **one** — itself |
| `dependencies` | the plugins it groups | usually empty |

A bundle is still a real npm package and still sits in `node_modules` — it does **two** separate jobs, and
both fail silently when one half is missing:

1. `dependencies` make the plugins **present on disk** — missing, dsh cannot resolve the package names;
2. `cordis.patch.yml` makes the plugins **loaded into the tree** — missing, the package sits there with nobody calling it.

🔒 Listing **both a bundle and one of its sub-packages** in the same profile inserts the row twice → duplicate id
→ **dsh refuses to boot**. This is a direct consequence of a package being able to enter the tree by two paths.

The `dsh-` prefix **stays for bundles**: a bundle still only means something inside a running dsh,
and is still listed in `dsh.profile.bundles`.
And the six packages that are **not** plugins — no `dsh` field, no `cordis.patch.yml`, no prefix:

| Directory | Package | Why not |
|---|---|---|
| `core/tracy-core` | `@tracy/core` | shared library |
| `desktop/tracy-desktop` | `@tracy/desktop` | the Electron shell |
| `dev/tracy-design` | `@tracy/design` | a standalone Vite bench |
| `locale/tracy-i18n` | `@tracy/i18n` | a translation tool, not a loaded dictionary |
| `ui/tracy-ui` | `@tracy/ui` | a library, imported by plugins |
| `fleet/tracy-fleet-operation` | `@tracy/dsh-fleet-operation` | the plugin part was deleted 05/10/2026; what remains is the fleet scripts, the `tracy-dsh` image and the web images — the `dsh-` name is a leftover deviation, not yet renamed |

**Two deviations from the directory→package-name rule, both carrying information:**

1. `bundle/tracy-<name>` → `@tracy/dsh-<name>-bundle`. The suffix is the separate rule of §1.3 below, not
   a one-off exception.
2. `locale/tracy-locale-vi` → `@tracy/dsh-**tracy**-locale-vi`. The extra `tracy-` is **deliberate**:
   `dsh-locale-vi` (without it) is the **community's** package, which owns the `vi` language and is the only
   place calling `addLanguage`. Both packages are in one profile at once; giving them the same name would make one of the two
   vanish without a trace.

Because there are exceptions, **no gate enforces the directory→package-name rule**, and that is a choice:
a rule whose exceptions are written down plainly is cheaper than a gate that must carry an exemption list.

### 1.2 Plugin identity must match in THREE places

A dsh plugin declares its name three times and **nothing at run time cross-checks them**:

1. `name` in `package.json`
2. `name` of the cordis row in `cordis.patch.yml`
3. the `id` the browser bundle passes to `__ModuleLoader__.load`

A mismatch fails **silently** — the bundle builds, the package installs, and the only symptom is
**absence**: half the UI does not render, no error, no warning, not one log line.
On 2026-08-30 `dsh-github-workbench` broke exactly like that.

→ `scripts/check-plugin-identity.ts` guards it. That is why it is a build gate rather than a convention:
a convention cannot go red, and absence is a symptom nobody sees in a diff.

### 1.3 Fixed files in a plugin package

| File | Role |
|---|---|
| `cordis.patch.yml` | the cordis row loading this package |
| `src/client/` | code running in the browser |
| `scripts/build-client.mjs` | esbuild → `lib/client.js`; keeps `absWorkingDir` fixed |
| `lib/client.js` | the bundle, **COMMITTED** |
| `lib/index.js` | the host side |

🔒 **`lib/client.js` is committed because the fleet copies the plugin directory as is and runs no build step
there.** That means "forgot to build" is a **pushable** state: edit a string in `src/`, forget to
build, and what reaches customers is still the old text — no error, just a wrong screen.
→ `scripts/check-bundles.ts` guards it.

### 1.4 Profile names — about the UI's SHAPE, not where it runs

```
tch/profiles/<name>/   ⟺  package.json name `dsh-profile-<name>`  ⟺  env file `.env.<name>`
```

Three profiles, and each name answers the question *"who owns navigation?"*:

| Profile | Tracy bundle | What dsh is | dsh port / password port |
|---|---|---|---|
| `web` | `@tracy/dsh-cowork-bundle` | a **sidecar** in the `/agent` iframe; the Tracy shell navigates | 51710 / 51711 |
| `desktop` | `@tracy/dsh-cowork-bundle` | a sidecar, exactly like `web` — the two surfaces are one product | 51720 / 51721 |
| `native` | `@tracy/dsh-native-bundle` | **the shell**; dsh's native UI is the navigation | 51730 / 51731 |

⚠ **`native` is about dsh's native UI, NOT about "a native app".** The Electron shell is `desktop`.
Named before anyone misread it once (decided by Lee 31/08, renamed from `admin` — the old name implied "an internal
operations door", while this profile can be handed to customers in the Site Admin role).

🔒 **ONE env file per profile, and the password-port column above is why.** `dsh-passwords` reads
`MCP_GATEWAY_PORT` from the env file, not through a flag. Without that line it falls back to the default and collides with another
profile: the second instance dies with `EADDRINUSE` and shuts itself down, while its dsh **still serves normally** — so
the browser gets 401 and it looks like it is working. Measured exactly like that when building `native` on 31/08.

## 2. File names in `src/`

**Three conventions coexist, and the difference is DELIBERATE.** Do not "fix them for consistency" — each area has its own
constraint that produced its convention.

| Area | Convention | Example | Why |
|---|---|---|---|
| a plugin's `src/client/` | **lowercase, one word** | `index.tsx` `strings.ts` `styles.ts` `contract.ts` `composer.tsx` `gallery.tsx` | A small, fixed file set repeated identically in every plugin — read by role, not by name |
| `@tracy/ui` | **kebab-case** | `dropdown-menu.tsx` `radio-group.tsx` `platform-glyph.tsx` | A 1:1 copy of shadcn/ui. Names kept so blocks copied from shadcn land in the right place and a `diff` against upstream stays readable |
| `@tracy/design` | **PascalCase for components/pages**, kebab for ordinary modules, lowercase for entries | `AppFrame.tsx` `SiteScreen.tsx` `Gallery.tsx` · `app-context.tsx` · `main.tsx` `views.tsx` | Ordinary React: file name = component name |

Outside `src/`:

| Naming | Convention | Example |
|---|---|---|
| Repo scripts | kebab-case`.ts` / `.mjs` | `check-plugin-identity.ts`, `build-client.mjs` |
| Ordinary docs | kebab-case`.md` | `docs/references/naming-conventions.md` |
| Meta docs at the root | `UPPERCASE.md` | `CLAUDE.md`, `DESIGN.md`, `README.md` |
| ADRs | `NNNN-short-english-slug.md` | `docs/adr/0001-seat-door-and-enforcement-boundary.md` |
| CSS tokens | standard shadcn names, declared in `packages/ui/tracy-ui/src/tokens.css` | `--primary`, `--sidebar-border` |
| dsh aliases | `--dsw-alias-*` — **never invented**, read from `@deepseek-ai/dsh-client-ui-theme` | `--dsw-alias-bg-base` |
| CSS classes in plugins | prefix `tv-` | `.tv-root`, `.tv-header` |

## 2.1 The Worker area (`workers/`)

Its own conventions, **deliberately different from `packages/`**. Six Workers came over from `tracy-infra` on 2026-08-30
verbatim, without changing one import line — so their conventions came over verbatim too. Changing them for
"consistency" with `packages/` would hand-make drift against the repo that still keeps the old copy.

| Naming | Convention | Example |
|---|---|---|
| Worker directories | kebab-case | `seat-registry/`, `cowork-web/`, `auth-email/` |
| Modules in `<worker>/src/` | **camelCase**`.js` | `rateLimiter.js`, `fleetCloudflare.js`, `themeAccess.js`, `seatRevoke.js` |
| Entry point | `src/index.js` — **one existing exception**: `cowork-web/src/worker.js` | |
| Test | `test/*.test.mjs` | `seat-registry/test/seats.test.mjs` |
| A route's handler | `handle<Action>` | `handleMySites`, `handleOtpVerify` |

**The three easiest mistakes in this area:**

1. **`workers/` is NOT a pnpm workspace member** (`pnpm-workspace.yaml` only declares the two levels
   under `packages`). No `@tracy/*` resolves from here, and vice versa.
2. **Directory distance IS part of the source code.** Four Workers import each other by relative
   paths (`cowork-web/src/worker.js` reaches `../../fleet-bar/src/session.js`). Moving
   a directory is editing code, not tidying up.
3. **Deploy ONLY from this repo.** `tracy-infra` still has the old copy of those six directories and can still deploy
   onto the same Workers. ⚠ `workers/` was deleted on 16/09/2026 — all its doors are answered by `apps/tracy-web`; this section is kept because the naming rules still apply to the old code read in `git log`.

## 3. Three principles overriding every table

1. **Consistency beats preference.** A directory consistent with a "suboptimal" convention is healthier than
   a directory mixing two "both correct" conventions.
2. **Case safety across platforms.** Never let two files differ only by
   case. macOS is case-insensitive by default, Linux is not — CI breaks, your machine does not.
3. **Tool constraints beat aesthetics.** npm package names, shadcn CLI conventions, the file names cordis
   requires — those are hard conditions.

## 4. Identifiers in code

| Kind | Convention |
|---|---|
| Functions, variables | `camelCase` |
| React components, classes, interfaces | `PascalCase` |
| Module-level constants | `SCREAMING_SNAKE_CASE` (`GATES`, `BANNED_VOCABULARY`, `KEEP_VERBATIM_TERMS`) |
| Environment variables / secrets | `SCREAMING_SNAKE_CASE` |
| i18n namespaces | the package name without its scope (`tracy-view`, `tracy-dev-mockup`) — easy to trace in `--dump-config` |
| CSS variables | `--kebab-case` |

## 5. Language — the most important rule here

**Current contribution rule (27/10/2026): new contributor-facing text is required to be English,**
including documentation, comments, messages, PR metadata and filenames. This supersedes the older
private-repository defaults below. The `language-policy` PR check uses trusted base code and checks
every new commit, including intermediate changes. Local hooks provide early feedback; required
checks and CODEOWNERS review enforce the rule once branch protection is enabled. See
[`public-repo-ci.md`](public-repo-ci.md#required-english-contributions) for the exact scope,
reviewed translation/data exceptions and the limits of automatic language detection.

The following private-repository policy is historical context for existing text, not permission to
add new non-English prose. Conversations with users may continue in their preferred language.

TCH is a **private** repo, so Vietnamese is the default for everything explaining things to insiders.
But there is one hard line: **anything outsiders can read is written in English.**

| Written in | Where |
|---|---|
| **Vietnamese** | ADRs · docs in `docs/` · `tasks/` · internal READMEs · gate messages (read by agents and insiders) — i.e. **documentation files**, see §5.0 |
| **English** | **Every word in code files, comments included** · **strings displayed in the UI** · **strings generated into API responses** · errors/logs outsiders can see · **commit messages** · identifiers in code · READMEs of packages shipped in the image |

### 5.0 Comments in code are written in English — changed on 01/09/2026

**The boundary is the FILE TYPE.** Not "who reads it", not "does it stay in the repo".

| File type | Language | Including |
|---|---|---|
| **Code files** — `.ts` `.tsx` `.js` `.mjs` `.css` `.yml` `.sql` `.sh` `.env*` | **English** | **comments**, strings, variable names, text in template literals |
| **Documentation files** — `.md` in `docs/`, `docs/adr/`, `tasks/`, internal READMEs | **Vietnamese** | ADRs, specs, plans, handoffs |

And separate from both: **Vietnamese is the language the agent speaks with people.** A conversation
is not a file.

Why the boundary is the file type and not "can outsiders read it": that question always has to be
**guessed** — does a string leak into an API, does a build stuff a comment into a bundle. Whereas
"is this a code file or a documentation file" is known from the extension, and nobody can argue with it.

Two concrete reasons comments in code must follow the code:

- Vietnamese comments live next to English strings in the same file, and the boundary between them is
  **invisible** — especially inside a **template literal**, which the eye reads as a comment while
  `check-language` reads it as a string. It broke twice in one day: `tracy-ui-gallery`'s `styles.ts`,
  then the CSS block in `workers/fleet-bar/src/pages.js`.
- Comments in the CSS/HTML a Worker returns are **real bytes sent to the customer's browser**.

Documentation has neither problem: it is not packaged, does not leak into responses, and its readers are
insiders discussing the product. So ADRs and `docs/` **stay in Vietnamese** — that is a decision, not
an unfinished cleanup.

**`vendor/` likewise** (decided by Lee 01/09). It is other people's code plus internal scratch tables — read to
understand and to experiment, not something Tracy ships. Vietnamese comments there are **allowed**, and **do not back-translate**:
`vendor/shadcn-admin`, for example, is gitignored and has its own `.git`, so any translation there is work
nobody can receive.

⚠ One exception within the exception, and it is about **strings**, not comments: `vendor/tracy/dsh-passwords/src`
is still scanned by `check-language` (RULE #5 in `CLAUDE.md`) — Tracy modified that package, **the fork is the source**
(a workspace member, built straight into the image; no publish step since 06/09), and it guards **dsh's seat door
on every fleet host** plus the password door of every local profile. Strings there are a surface customers
can read, so they follow Tracy's rules; comments are unchanged.

**Do not back-translate the 182 old files.** Measured 01/09: 182 files, ~9,645 lines with Vietnamese diacritics in code.
Rewriting them all would wipe the `git blame` of nearly the whole repo in exchange for exactly one thing: uniform
form. The rule applies to **new code and code being edited**: touch a function and its comments are written in
English.

⚠ **There is one instruction that sounds like the opposite, and it is NOT in the repo.**
`~/.claude/settings.json` declares `"language": "Vietnamese"`, and Claude Code turns it into the sentence *"Use
Vietnamese for all explanations, **comments**, and communications with the user"*. The word `comments`
there is about **how the agent explains things in conversation**, not annotations written in code files — and
that is exactly where agents kept misunderstanding.

That setting is **deliberately kept**: it is what keeps the agent answering Lee in Vietnamese, in every project.
The repo does not turn it off; the repo only states the boundary above plainly.

Three traps, all three have bitten somewhere in the system:

1. **Strings GENERATED at run time are the easiest place to slip** — they do not sit still in any UI file for an eye
   to review.
2. **Third-party data is kept verbatim.** `Módulo PagSeguro` is a fact, not our
   prose. Translating it is a data-corruption bug.
3. **Reviewing by eye does NOT catch it.** A reader fluent in both languages does not *notice* a sentence in the wrong
   language while skimming a diff. This is a job for a regex, not a reader — and that is the whole
   reason `check-language.ts` exists.

4. **Tools' language instructions contradict this rule regarding comments.** See §5.0 — knowing it in advance means
   not re-arguing it every time.

### 5.1 Words in the UI

Do not invent words. The canonical vocabulary table is in [`vocabulary.md`](vocabulary.md), with the list of
**banned** words and their replacements.

## 6. Commit

`type(scope): short description`, **in English**, imperative mood, lowercase after the colon.

- `type`: `feat` `fix` `refactor` `docs` `test` `chore` `perf` `style` `ci` `release`
- `scope`: a package or area name, exactly as the directory — `ui`, `profile`, `dev`, `scripts`, `vendor`,
  `gateway`
- The description states the **result**, not the operation. `fix: write outward-facing strings in English, and
  rebuild the stale bundles` says what was broken; `fix: update strings.ts` does not.
- No `Co-Authored-By` lines.

## 7. How far the gates reach

Enforced by machine in `pnpm build:check` — **twenty-one gates, counted 06/09**, following exactly the list
**and order** of `scripts/check-all.ts` (`lane-tabs` and `image-lock` retired the same day, ADR 0014).
That file is the authoritative version; this table is the explanation, and it reads in the order the gates actually run —
cheapest and most structural first:

| Gate | Catches |
|---|---|
| `check-lint` | oxlint (`correctness`) + `tsc --noEmit` + biome, all three read-only |
| `check-doc-links` | Relative links in `.md` pointing at files that do not exist |
| `check-doc-frontmatter` | Docs in `docs/references/` not declaring `description`/`sources`, or `sources` pointing at deleted code |
| `gen-doc-index --check` | `docs/README.md` differs from the generated version — i.e. a doc nobody points to |
| `skills-check` | `.claude/skills/<name>` no longer a symlink, or differing from `public-skills.txt` |
| `check-self-contained` | `link:` / `file:` / `portal:` / absolute paths in `package.json`, `cordis*.yml`, `.npmrc`, `pnpm-workspace.yaml` |
| `check-plugin-identity` | §1.2 — names differing between the three places |
| `check-language` | Vietnamese diacritics in strings/templates/JSX text under `packages/` **and `workers/`**, and the 4 banned words of `vocabulary.md` (banned words apply only to UI) |
| `check-vocabulary` | Words removed by `vocabulary.md` §Do NOT use appearing in code |
| `check-dsh-paths` | dsh paths typed directly in plugin client code, not through `dshUrl()` |
| `check-tailwind-source` | `@source` pointing nowhere — Tailwind silently scans less |
| `check-dsh-locale` | Missing keys, mismatched `{placeholder}`, translated words from `terms.ts`, and namespace-owning packages missing from `OWNED` |
| `check-dsh-tokens` | `--dsw-*` that do not exist in the installed dsh |
| `check-seat-door` | The password door reopened beside the seat door · missing config read as "door open" · signatures built in a second place |
| `gen-presets --check` | 12 dsh presets differing from `config/mode-matrix.json` — they are GENERATED from it (since dsh 0.1.7-rc.2: rows in `presets.patch.yml` of the two Tracy bundles, and the bundle must list that file in `dsh.bundle.patch`) |
| `gen-story-kinds --check` | A design-bench story label changed without anyone acknowledging it |
| `check-story-strings` | Error sentences in stories of Worker pages that do not really exist in the Worker code |
| `check-bundles` | §1.3 — `lib/client.js` differing from its source |
| `check-image-profile` | Four invariants of the fleet image profile (`subprocess`/`sandbox` disabled, `ptc-runtime` off, the two `insert` rows, `webserver`, `seedTabs`), and since dsh 0.1.7-rc.2: the four shipped presets off + `agent-preset-registry.default` a Tracy preset in both bundles, rows writing host state (`STANDS_DOWN`) off — checked without a build |
| `check-tests` | **1363** tests of `workers/` + `scripts/` + `packages/*/*/test`, **36** interop tests, and **295** of `vendor/tracy/dsh-passwords` (3 tests deliberately skipped, each with a reason in `SKIPPED`) — measured 06/09 |
| `check-boot-graph` | dsh boots an empty client graph |

### 7.1 Deliberately NOT caught

Written down so nobody reads the green as wider than the truth.

| Not caught | Why / consequence |
|---|---|
| File-name case | §2 has three valid conventions at once; a path rule would guess wrong more often than right |
| The language of **comments** | Since 01/09 the rule is **English** (§5.0), but the gate does NOT guard it: `check-language` parses with TypeScript so comments stand outside it, and 182 old files are still Vietnamese on purpose. This is review's job, and the agent's own discipline |
| The directory→package-name rule | §1.1 — there is a written exception; a gate would have to carry an exemption list |
| UI vocabulary beyond the 4 banned words | Those 4 words can be string-matched; *choosing the right word* in `vocabulary.md` needs context — still review's job |
| **Language in `vendor/`** | Third-party trees stand outside (other people's code). The trees Tracy **owns** — forks we edit under `-tracy.N`, templates we derived, skills we wrote — **are scanned** since 27/10/2026 (pass seven): Vietnamese in strings, comments and Markdown, translations and upstream data exempt. The list, one reason per tree: `scripts/lib/owned-vendor-trees.ts`. (`dsh-passwords/src` was the only one from 30/08 to 27/10.) |
| **The fleet's `.sh` / `.py`** | `check-language` parses with TypeScript so it cannot read them. Measured 30/08: 58 Vietnamese lines, **all** `echo`s of operations tools (`package.sh` building the app, `go-live.sh`/`provision.sh` running on fleet hosts) — the same class as `workers/*/scripts/`, i.e. within the rules. No string customers can read. This is a gap **measured and deliberately left**, not a debt |
| `scripts/` | Gates run at build time and ship nowhere; strings there are the same class as comments. Deliberate |
| Comments explaining "why" | Cannot be measured by machine; but they are what makes this repo readable — see the header of every file in `scripts/` as a model |
