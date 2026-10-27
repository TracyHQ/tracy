/**
 * The site folder a lane drops its agent into — the fleet's half of the `TracyHQ/<siteID>` layout.
 *
 * Ported from `tracy-desk`'s `siteFolderSkeleton.ts` / `siteSystemPrompt.ts`, but deliberately NOT
 * a copy. Three things are different on the fleet, and each of them changes what gets written:
 *
 * 1. **The instruction file is `AGENTS.md`, not `system.md`.** `system.md` is read by tracy-desk's
 *    own `PromptBuilder`. A lane runs dsh, and dsh's `dsh-agent-instructions` looks for
 *    `AGENTS.md` / `CLAUDE.md` (plus `.local` variants), walking up to the nearest `.git`. Writing
 *    `system.md` here would produce a file nothing reads — the worst shape of failure available,
 *    because the folder looks correct and the agent starts every session knowing nothing.
 * 2. **No `SiteSourceCode/`.** ADR 0073: WordPress and Joomla keep their code on the fleet, edited
 *    in place, with history in `webroot-baseline.git` NEXT TO the webroot. Only a platform that
 *    keeps code in the repo (Shopify, ADR 0077) gets that directory, and no such site runs here.
 * 3. **`.webroot/` is the site's webroot, and it must never enter the team repo.** For a site Tracy
 *    built it is the live site; for an IMPORTED one it is Tracy's copy until go-live (`agentsMd`). It is a mount of
 *    `/srv/tracy/<label>/webroot`. Committing it would put an entire CMS — and its history —
 *    inside the team repository, next to the copy that already tracks it.
 *
 * Everything here is write-if-missing. The moment a person touches one of these files it is
 * theirs, and a lane is rebuilt far more often than a site is created.
 */

/** Directories the team owns, each with the note explaining what belongs in it. */
const DIR_NOTES = [
  [
    'AgentSetting',
    'Settings the agent reads: knowledge base facts, MCP servers, pinned skills, team roster.\n' +
      'Reviewed as code. Credentials never live here — they belong in Site Configuration.\n'
  ],
  [
    'SiteContent',
    'The article mirror (ADR 0071): posts exported from the CMS as Markdown, one file per article,\n' +
      'front-matter carrying the database identity. Editing here is not publishing — applying the\n' +
      'edits back to the site is a deliberate act, never a side effect of a commit.\n'
  ],
  [
    'TracyProposal',
    'One directory per proposal (ADR 0045): proposal.json and mapping.md for people, jobs/ and\n' +
      'files/ for machines. A proposal must be rebuildable from its own directory.\n'
  ],
  [
    'TracyWork',
    'Work in progress. `agents/` is machine-made (surface, digest, drafts, state); `team/` holds the\n' +
      'session notes teammates chose to share; `deliverables/` holds outputs meant for people.\n' +
      'Nothing here is ever deployed.\n'
  ],
  [
    // 🔒 `.agents/skills`, NOT `.claude/skills`, AND THE DIFFERENCE IS THE WHOLE POINT.
    //
    // This directory was `.claude/skills` until 17/09 and the runtime reads no such path. dsh's
    // skill scanner walks `<projectRoot>/.dsh/skills` and `<projectRoot>/.agents/skills`
    // (`skill-filesystem/src/index.ts:249-251`) and nothing anywhere in the harness mentions
    // `.claude` — `grep -rn '.claude/skills' vendor/tracy/deepseek-harness/packages/` is empty. A
    // site folder IS the project root, because `findProjectRoot` walks up for a `.git` and a site
    // folder has none, so it falls back to the cwd the session already stands in (`index.ts:945`).
    //
    // So every site-specific skill a team wrote went into a directory nothing reads. No error, no
    // warning, no empty-directory notice: the skill simply never appeared in the catalog, which is
    // the same thing the agent sees when a site has no skills at all. Measured on demojoomla 17/09.
    //
    // `.agents/skills` over `.dsh/skills` for two reasons: it is the name this repo already uses for
    // the source of truth (CLAUDE.md §10), and LOWER ranks win duplicate names — `.dsh/skills` is
    // 100, `.agents/skills` 200, `/opt/tracy/skills` 300 — so a site skill placed here still beats
    // the Tracy registry while leaving the lower slot free for a one-off local override.
    '.agents/skills',
    'Site-specific skills: one directory per skill (SKILL.md + scripts/), reviewed as code.\n' +
      'The agent sees each one by its `name` and `description` alone and loads the body only when it\n' +
      'calls the `skill` tool, so a skill costs one catalogue line until it is used.\n' +
      'Skills from the Tracy registry are not vendored here — they are pinned in\n' +
      '`AgentSetting/skills.json`.\n'
  ]
]

/**
 * What the team repo must never swallow.
 *
 * `.webroot/` is the running site, mounted in; its history already exists in
 * `webroot-baseline.git` beside the webroot on the fleet host. `.tracy/` is machine-written
 * identity for this lane. Both are large, both are already tracked somewhere better, and both are
 * one `git add -A` away from ending up here permanently.
 */
// `.dsh-mattskillsdeck-cache/` is the Matt Skills Deck's own scratch (naming guardian state,
// snapshot cache), written next to the agent's cwd because dsh's workspace-write sandbox allows
// nothing else. It is machine state for one lane, not the team's work, and without this line it
// shows up as an untracked change on every site the deck runs in.
const GITIGNORE = ['.webroot/', '.tracy/', '.dsh-mattskillsdeck-cache/', ''].join('\n')

/**
 * The issue tracker the agent's skills and the Matt Skills Deck read: local markdown under
 * `.scratch/`, inside this folder.
 *
 * Why this file exists at all: `wayfinder`, `triage`, `to-tickets` and `to-spec` need to know
 * where issues live, and the deck's host half reads the same pointer to choose its backend
 * (`docs/agents/issue-tracker.md`, title line first — see the deck's `parseIssueTracker`). Without
 * it the deck probes GitHub, finds no `gh` in the lane image, and shows a red environment check
 * to every customer. Local markdown needs no account, no CLI and no token: the tickets are files
 * in the team's repository, committed like everything else here.
 *
 * The conventions below are the deck's own local-markdown template (bundled-skills/setup-matt-
 * pocock-skills/issue-tracker-local.md at v1.2.3), kept verbatim so the skills' instructions
 * and this file never disagree about a path.
 */
const ISSUE_TRACKER =
  '# Issue tracker: Local Markdown\n\n' +
  'Issues and specs for this site live as markdown files in `.scratch/`, inside this folder.\n' +
  'No GitHub account, no `gh` CLI and no token are involved: the tickets are files in this\n' +
  'repository, committed like everything else here. The Matt Skills Deck panel reads this file to\n' +
  'choose its backend, and the engineering skills follow the same conventions.\n\n' +
  '## Conventions\n\n' +
  '- One feature per directory: `.scratch/<feature-slug>/`\n' +
  '- The spec is `.scratch/<feature-slug>/spec.md`\n' +
  '- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file\n' +
  '- Triage state is recorded as a `Status:` line near the top of each issue file\n' +
  '- Comments and conversation history append to the bottom of the file under a `## Comments` heading\n\n' +
  '## When a skill says "publish to the issue tracker"\n\n' +
  'Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).\n\n' +
  '## When a skill says "fetch the relevant ticket"\n\n' +
  'Read the file at the referenced path. The user will normally pass the path or the issue number directly.\n\n' +
  '## Wayfinding operations\n\n' +
  'Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.\n\n' +
  '- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.\n' +
  '- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.\n' +
  '- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.\n' +
  '- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.\n' +
  '- **Claim**: set `Status: claimed` and save before any work.\n' +
  "- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.\n"

/** `https://joomlart.com/` → `joomlart.com`. Tolerates a bare host, which is what fleet passes. */
export function hostOf(siteKey) {
  try {
    return new URL(String(siteKey).includes('://') ? siteKey : `https://${siteKey}`).hostname
  } catch {
    return String(siteKey)
  }
}

/**
 * Between these markers go the team's own words about the site — same contract as tracy-desk's
 * `system.md`, so a reader who knows one knows the other. A new file leaves the fence EMPTY.
 */
export const MARKER_START = '<!-- tracy:agents-md v1 -->'
export const MARKER_END = '<!-- /tracy:agents-md -->'

/**
 * The questions every file carried inside the fence until 05/10/2026, byte for byte — kept ONLY so the
 * top-up can recognise an unanswered set and empty it; no new file carries it. Interpolation-free on
 * purpose: anything that names a specific site cannot be compared byte for byte, which is how "nobody
 * filled this in" is told apart from "the team wrote this".
 *
 * 🔒 WHY IT LEFT THE FILE (bench flow D, 05/10/2026). dsh sends `AGENTS.md` on every step of every
 * conversation, and on every bench site — like almost every site — nobody had answered: ~520
 * characters of unanswered questions re-read on every step, telling the agent nothing. The questions
 * are for the TEAM, so they now sit on the repository's front page (`rootReadme`), which people read
 * and the agent does not.
 */
export const HINT_BLOCK = `## About this site

What this site is for, its voice, its priorities.

Why: an agent that does not know this is a generic assistant that happens to have your files.

## Skills to reach for

Which skills to reach for, and when.

Why: the runtime lists the skills, it cannot tell which ones this site relies on.

## Hand to a person

What the agent must hand to a person instead of doing itself.

Why: nothing can generate this; it is your judgement.
`

/**
 * The starting `AGENTS.md`.
 *
 * The first half is written by Tracy and states the two facts an agent cannot discover by looking:
 * which site this is, and what `.webroot/` is — the live site for a site Tracy built, Tracy's copy
 * for an imported one (`origin: 'imported'`), a closed door on a sealed quickstart (`sealed`). The
 * second half is the team's, and this file only asks for it.
 *
 * English, per ADR 0016: this is Tracy's own prose, written into a repository a whole team shares.
 * What the team adds below the marker may be in any language they like.
 *
 * @param {string} siteKey
 * @param {string|null} platform
 * @param {{origin?: string|null, copyAddress?: string|null, address?: string|null, sealed?: boolean}} [opts]
 *   `sealed`: the site carries a content-contract marker (`ensure-site-folder.mjs`'s `contractSealed`,
 *   the fence's own rule) — its webroot paragraph and platform brief then describe the sealed site.
 */
export function agentsMd(
  siteKey,
  platform,
  { origin = null, copyAddress = null, address = null, sealed = false } = {}
) {
  const host = hostOf(siteKey)
  const at = siteAddress(address)
  // Named for EVERY site that has one, not only an imported copy: an agent that cannot read an
  // address guesses one, and a guess is wrong on any surface that is not plain https on 443.
  const openAt =
    at === ''
      ? ''
      : `\n\nPeople open this site at ${at} — give them that address, exactly as written here, when they ask to see it or to check your work. Do not rebuild it from the hostname: the scheme and the port are part of it.`
  const platformLine = platform
    ? `This site runs on ${platform}.`
    : `Tracy has not identified this site's platform yet.`

  const whereTheSiteIs = webrootParagraph(host, platform, { origin, copyAddress, sealed })

  return `# Site agent — ${host}

You are the agent for **${host}**. ${platformLine}${openAt}

${whereTheSiteIs}
${platformBrief(platform, { sealed })}
${AGENTS_MD_TAIL}`
}

/**
 * The one paragraph that says what `.webroot/` is on THIS site — shared by `agentsMd` (a new file)
 * and `topUpAgentsMd` (an existing one), so the two can never disagree about which variant a site
 * should carry.
 *
 * Precedence, and why each step outranks the next:
 * 1. A platform with no document root (`NO_WEBROOT`) — any other sentence names a directory that
 *    is not a document root there.
 * 2. An IMPORTED copy — its paragraph is the one that keeps the agent off the customer's own server
 *    (fijitrips, 14/09). The sealed paragraph says `.webroot/` serves visitors, which is false for
 *    a copy, so a seal never replaces it. Provision cannot make both today (the marker is written
 *    only on the quickstart road; `origin=imported` requires no quickstart), so this order only
 *    decides which sentence is least wrong if that ever changes.
 * 3. A SEALED quickstart — the fence closes every file under `.webroot/`, reads included.
 * 4. Otherwise the fleet-born site, whose `.webroot/` is live and editable.
 */
function webrootParagraph(host, platform, { origin = null, copyAddress = null, sealed = false } = {}) {
  if (NO_WEBROOT.has(String(platform))) return WEBROOT_NONE
  if (origin === 'imported') return webrootImported(host, copyAddress)
  // A quickstart site's `.webroot/` is as open as any other since ADR 0022 (26/09/2026); the
  // recommendation to keep its design is in the platform brief. `sealed` stays a parameter because
  // the callers still measure it for that brief.
  void sealed
  return WEBROOT_FLEET_BORN
}

/**
 * Platforms that keep no document root, so the `.webroot/` paragraph would describe a directory
 * that is not there.
 *
 * 🔒 EVERY PLATFORM RUNS THIS SCAFFOLDER, INCLUDING THE ONE WITHOUT A WEBROOT. `provision.sh` calls
 * `ensure-site-folder.mjs` unconditionally, so until 17/09 an EmDash site was handed the fleet-born
 * sentence — "`.webroot/` is the site that is actually serving visitors ... an edit there is live
 * the moment you save it" — about a directory its own platform file never creates
 * (`platform/emdash.sh`: `PLATFORM_NEEDS_WEBROOT=0`). The agent began every session believing in a
 * folder that does not exist and in an edit that cannot be made.
 *
 * This is the same shape of failure as the imported-site sentence below, which sent an agent to a
 * customer's production server on 14/09: the file the agent reads first said something untrue, and
 * nothing downstream could correct it.
 */
const NO_WEBROOT = new Set(['emdash'])

/**
 * A platform with no document root: nothing under a webroot is what a visitor gets.
 *
 * ⚠ "NO DOCUMENT ROOT" IS NOT "NO `.webroot/`", AND THIS PARAGRAPH USED TO SAY THE SECOND. EmDash
 * HAS a `.webroot/`: the site's compose mounts `<private>/data` and `<private>/uploads` at
 * `<site>/.webroot/data` and `<site>/.webroot/uploads`, which is exactly where the agent's own
 * `docker exec` lands. Measured 20/09 inside `site-h330yd-web-1`: `/site/site-h330yd/data` does not
 * exist, `/site/site-h330yd/.webroot/uploads` holds 116 entries. So the old wording denied the one
 * directory that exists and named two that do not, and an agent that looked found nothing and had
 * every reason to report the site as empty.
 *
 * What stays true, and is the reason this paragraph exists at all: editing those files is not how
 * the site changes. They are there to LOOK at.
 */
const WEBROOT_NONE = `This site's \`.webroot/\` is not a document root. It holds the database and the
uploads directory — \`.webroot/data\` and \`.webroot/uploads\`, mounted there by the site's own
container — and you may read them, but editing a file under them is not how anything a visitor sees
changes. Everything else in this folder is the team's repository: committing there changes nothing
on the website.`

/**
 * A SEALED quickstart: `.webroot/` still serves visitors, but no file under it is open to the agent.
 *
 * 🔒 THE FLEET-BORN SENTENCE WAS FALSE ON EVERY SEALED SITE, AND IT WAS THE FIRST THING READ. A
 * sealed site is one with `<sitesRoot>/.content-contracts/<label>.json`; `tracy-subprocess-docker`'s
 * fence (`contentContractPathReason`) then refuses every file tool outside `docs/agents/` and hides
 * the shell. Its AGENTS.md still said "`.webroot/` ... An edit there is live the moment you save it".
 * Measured in bench r2 (V3): the sealed WordPress site made 6 refused `.webroot` hunts, 2 of them
 * steps that did nothing else. The per-turn context has contradicted this file on sealed sites since
 * PR #336 (T4), which costs tokens every turn and leaves two texts to believe.
 *
 * "Reading included" is said on purpose: the refused calls were READS, looking for the words on a
 * page. Where the words live is the platform brief's job, below.
 *
 * ⚠ THE CLOSED PLACE IS THE WHOLE FOLDER BUT `docs/agents/`, NOT ONLY `.webroot/` — said as the fence
 * draws it. `contentContractPathReason` refuses every path outside `docs/agents/`: `AGENTS.md`
 * itself, `SiteContent/`, `TracyWork/`, `Brand/`. A first draft closed only `.webroot/`'s files and
 * dropped the fleet-born "Everything else in this folder is the team's repository" sentence, which
 * left open whether the other folders could be read — the next refused hunt. It names the place,
 * not a call. Once this text has shipped, rewording it means keeping these bytes in
 * `SHIPPED_WEBROOT` as a constant of their own (as `WEBROOT_NONE_UNTIL_20_09` is), or every site
 * that carries them keeps them for good.
 */
const WEBROOT_SEALED_UNTIL_26_09 = `\`.webroot/\` is the site that is actually serving visitors. On this sealed quickstart it changes
only through its content door, never by editing files, and every file outside \`docs/agents/\` is
closed to you, reading included.`

/**
 * The EmDash paragraph Tracy shipped from 17/09 to 20/09/2026 (2fb1e4af2 … 4237c31bf), byte for
 * byte. It denied a directory that exists (see `WEBROOT_NONE`), and the top-up could not correct it
 * because it compared only against the paragraphs shipped today: an EmDash site provisioned in
 * those four days kept "This site has no `.webroot/`" at the top of every session. Measured by
 * rendering `agentsMd` at every commit of `git log -m --all` on both paths of this file (25/09, see
 * `START_FROM_SHIPPED`): this is the only other webroot text any version produced.
 */
const WEBROOT_NONE_UNTIL_20_09 = `This site has no \`.webroot/\`. Its content is the database and uploads directory in this folder,
served by the site's own container — so there is no document root to edit and no file under one that
changes what a visitor sees. Everything else in this folder is the team's repository: committing
there changes nothing on the website.`

/**
 * WHAT THIS PLATFORM KEEPS WHERE — the half of the agent's knowledge that is true of the PLATFORM
 * rather than of Tracy, written into the file it reads before its first tool call.
 *
 * WHY HERE AND NOT IN THE PER-TURN CONTEXT. `tracy-site-tools`' `siteContext()` injects the volatile
 * half every turn — build state, brand, which tool call to make — and it is right that it does:
 * those change. What does not change is where a CMS puts the words a visitor reads, and paying a
 * model to rediscover that on every site is the expensive habit this is written to end. Measured
 * 16/09 on a Joomla site: one request spent eight calls re-deriving from `mod_breadcrumbs` source a
 * parameter one door call had already returned, and eleven more tracing `detectLanguage` through
 * Joomla core to reach a change the door could make all along.
 *
 * 🔒 DURABLE FACTS ONLY, and the split is the whole discipline. Outside this fenced section a file is
 * written ONCE (`topUpAgentsMd` touches only paragraphs still byte-for-byte Tracy's), and a
 * re-provision is what refreshes the fence, so what is written today can outlive many releases. A
 * sentence naming a RECORD and a FIELD — "Joomla's header brand is the default template style's
 * `siteTitle`" — stays true across Tracy releases. A sentence naming a tool, an
 * action or a parameter shape does not, and would become a lie nobody can correct without touching
 * a file the team may have edited. So: name the place, never the call. The call belongs to
 * `site-context.mjs`, which is rewritten every turn.
 *
 * 🔒 A QUICKSTART SITE GETS THE OPEN BRIEF (ADR 0022, 26/09/2026), plus the one fact about it the
 * site context does not state (`QUICKSTART_BRIEFS`). Until then it got a "sealed" brief that named the
 * template, its overrides and core as "Locked", and dsh sends this file on every step: measured 26/09
 * in round 4, a Joomla agent told the customer "the template, its layout and its language files are
 * locked" without one refusal from any fence. Nothing on a quickstart site is locked but a direct
 * database write — which the site context's contract line says every turn.
 *
 * @param {string|null} platform `wordpress` | `joomla` | `emdash` | null when not yet known.
 * @param {{sealed?: boolean}} [opts] `sealed`: the site carries a content-contract marker.
 * @returns {string} A markdown section, or '' when there is nothing true to say.
 */
export function platformBrief(platform, { sealed = false } = {}) {
  const key = String(platform ?? '')
  const open = PLATFORM_BRIEFS[key]
  if (open === undefined) return ''
  // A quickstart site gets the open brief (ADR 0022), led by what the site context does not say.
  const lead = sealed === true ? QUICKSTART_BRIEFS[key] : undefined
  const brief = lead === undefined ? open : `${lead}\n\n${open}`
  return `\n${PLATFORM_MARKER_START}\n## What ${TITLE[key]} keeps where\n\n${brief}\n${PLATFORM_MARKER_END}\n`
}

/** The platform's own name, spelled the way its project spells it. */
const TITLE = Object.freeze({ joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' })

/**
 * ⚠ EMDASH: "WORDS LIVE IN THE CONTENT, NOT IN `/app`", AND NO "TAXONOMY LABELS". Measured in bench
 * r2 (V3): 40 calls into `/app`, 17 of them steps that did nothing else, looking for page words that
 * live in EmDash's content — the `/app` sentence below was the only place this file named, so it
 * was where the agent looked. The sentence now says where the words ARE before it says what `/app`
 * is for. "Taxonomy labels" left the list of what changes: EmDash's own term update takes no locale
 * and writes another language's term (structure map of the 24/09 bench), so promising it sent the
 * agent to a change that lands on the wrong page.
 *
 * 🔒 AND IT NAMES NO ROAD TO THOSE WORDS, because the road moved while this text was being written.
 * Its first draft said the words change "through EmDash's own tools" and that "the Joomla/WordPress
 * content door does not reach this platform". The same PR opens `tracy_site content.replace` on
 * EmDash pages, and the tool texts call `tracy_site` the content door, so this file, read before
 * the first call, contradicted the tool description on the most common request (25 of 33 bench
 * cases are text edits). That is `platformBrief`'s rule — name the place, never the call — broken
 * once and caught in review: "records in that content" stays true whichever call reaches them.
 *
 * 🔒 `/app` IS EDITED FROM A SHELL, AND THE BRIEF SAYS SO (28/09/2026). "Its owner may edit … there"
 * named no way in, and the one an agent tries first — the file tools — cannot: they run in the host's
 * dsh, where `/app` is outside this folder and fenced, while a shell runs inside the site's container
 * (ADR 0014), where www-data owns `/app` since ADR 0022. Modes without a shell (Writer, SEO/GEO)
 * cannot change it at all. Said as a place ("nothing that edits this folder reaches it"), never as a
 * tool, by this brief's own rule. The mode persona (`tasks/mode-matrix.json`), the site context's
 * EmDash row and the fence's answer under `/app` say the same.
 *
 * @type {Record<string, string>}
 */
const PLATFORM_BRIEFS = Object.freeze({
  joomla: `**The words a visitor reads** are articles, menu items, and modules. A menu item's title is
both its label in the menu and the page's heading, so one edit moves both. A module's text often
lives in its **parameters**, not its body — the breadcrumb's "Home" is the breadcrumbs module's
\`homeText\`, and an empty one falls back to a translated core string.

**The header brand** is the default template style's \`siteTitle\` parameter. When it and \`logoFile\`
are both empty the template falls back to the logo IT ships, which is usually an image file — so the
word on screen may be text nowhere in the database. Which template this site runs, and what it
ships, is a fact to read off the site; never assume a particular one.

**The look — layout, components, spacing** — is the template's \`scss/\`: edit
\`.webroot/templates/<template>/scss/*.scss\`, then run \`php tools/t4-scss.php\` from this folder (the
site's own PHP; it writes \`css/template.css\`, the file the page loads; \`--all\` for every entry
file). \`media/t4/css/<style>.css\` is not a compiled file: T4 renders it from the template style's
parameters — colours and fonts change through the style, never by editing that file.

**The site's language** is two records, and changing one alone does nothing: the \`com_languages\`
component's \`site\` parameter, and the row for that language in the languages table, which must be
published. A language pack that is not installed cannot be set.

**Layout** belongs in template overrides under \`templates/<template>/html/\`. An edit to a core file
or to an extension's own views is undone by the next update. Administration is at \`/administrator\`.
T4 rebuilds its own bundle and compiled CSS on the next request: never delete or edit anything under
\`media/t4/\` or \`cache/\`.`,

  wordpress: `**The site title and tagline** are the \`blogname\` and \`blogdescription\` options — not
theme files, not the header template.

**The words a visitor reads** are posts, pages and menus. Whether the header and footer are
**template parts** (a block theme) or PHP templates (a classic one) decides which edit works, and
the two want different edits for the same result — check which this site is before assuming.

**The look — colours, spacing, buttons** — is the theme's own CSS and tokens: one section's rules are
in \`assets/css/sections.css\`, header and footer chrome in its other stylesheet, brand colours in
\`theme.json\` under \`settings.custom.tracy.brand\`. The same colour is often also a named palette
colour that page content uses directly (the orange is also \`warn\`): change each. CSS saved into the
user's global-styles record replaces the theme's own stylesheet, dark mode included: leave that record
alone.

**Never edit** anything under \`wp-admin/\` or \`wp-includes/\`, and never edit a plugin, or a theme's PHP,
you did not author (the theme CSS above is the way to change its look): use a child theme, a hook, or
the block editor's own layers. Those edits die at the next update and take the site with them.

Do not assume \`wp-cli\` is installed; check before relying on it. If a page cache plugin is active,
a change will not show until it is flushed.`,

  emdash: `**This site has no PHP and no document root.** There is no \`wp-cli\` and no Joomla CLI. The
content is a SQLite database and an uploads directory, and they are at \`.webroot/data\` and
\`.webroot/uploads\` — the container mounts them there. There is no \`data/\` or \`uploads/\` beside this
file; looking for one finds nothing.

**The words a visitor reads live in EmDash's content** — its entries, menus and settings — not in
\`/app\`: only the few fixed words the views print themselves (a date format, a "min read") are code.
They change as records in that content, never by writing to the database file.

**The application under \`/app\` is this site's own copy**, a volume rather than the shared image, so
its owner may edit views, components, configuration and styles there — from a shell in the site's own
container, because \`/app\` is not in this folder and nothing that edits this folder reaches it; a
mode with no shell cannot change it — and then has to ask for a rebuild and a restart for the change
to be served.
**Never kill the server process**: it is PID 1 of the container, and killing it stops the site.

A change every site built from this template should get — a new language, a new section — belongs to
the **template**, not to this site. Say so rather than making it here.`
})

/**
 * What a quickstart site's brief says before the open one (see `platformBrief`): only what the site
 * context does not.
 *
 * 🔒 THE CONTRACT LINE LIVES IN THE SITE CONTEXT, NOT HERE (bench flow D, 05/10/2026). Until then both
 * leads also said that the contract maps the words to slots through the content door, that everything
 * else changes the usual way, never the database, and to keep the quickstart's design and the
 * 0.75×–1.25× length band. Every word of that is the site context's `Content contract (…)` line,
 * sent on every turn of every site that has a contract (`site-context.mjs`, from the same marker this
 * `sealed` reads), so a step-1 prompt carried the length band three times. What ADR 0022 fixed — nothing
 * on a quickstart site is "locked" — holds without the lead: the open brief names no lock either.
 * Joomla's lead had nothing the context lacks, so a Joomla quickstart site reads the open brief.
 */
const QUICKSTART_BRIEFS = Object.freeze({
  wordpress: `**This site was built from a quickstart.** The header and footer are **template parts** that every
page shares.`
})

/**
 * The fence around the one section Tracy keeps writing.
 *
 * 🔒 THE REST OF THIS FILE STAYS WRITE-IF-MISSING, AND THAT IS NOT NEGOTIABLE. `ensure-site-folder`
 * says it without exception: every file belongs to the team the moment they touch it. But a site
 * provisioned last week cannot learn anything new, and two of the things this file says are worth
 * correcting on sites that already exist — the platform brief, and (for a platform with no document
 * root) a paragraph that was simply false. So exactly one region is Tracy's, it is fenced so both
 * sides can see where it ends, and a re-provision rewrites that region — and, outside it, only a
 * paragraph still byte-for-byte one Tracy shipped (`topUpAgentsMd`).
 *
 * Different markers from `MARKER_START`: those fence the team's OWN answers, and the byte-compare
 * against `HINT_BLOCK` is how "nobody filled this in" is told from "the team wrote this". Rewriting
 * that region would delete the answers. These two never overlap.
 */
export const PLATFORM_MARKER_START = '<!-- tracy:platform v1 -->'
export const PLATFORM_MARKER_END = '<!-- /tracy:platform -->'

/**
 * Bring an EXISTING `AGENTS.md` up to date without taking anything back from the team.
 *
 * Five edits, and each one refuses rather than guesses:
 *
 * 1. THE FENCED SECTION is replaced outright, or inserted when the file predates the fence. It is
 *    Tracy's by declaration, so there is nothing of the team's to lose. On a sealed site it becomes
 *    the sealed brief; on a site whose seal was lifted, the open one.
 * 2. THE WEBROOT PARAGRAPH is replaced only when it still matches a paragraph Tracy shipped, BYTE
 *    FOR BYTE (`SHIPPED_WEBROOT`). That is this file's own idiom for "untouched" (`HINT_BLOCK`),
 *    and it is what makes the edit safe: a team that rewrote the paragraph keeps their words, and
 *    the answer says so instead of quietly leaving a site wrong.
 * 3. THE START-FROM PARAGRAPH is removed, under the same byte-for-byte rule (`START_FROM_SHIPPED`,
 *    both wordings it ever had).
 * 4. THE CLOSING NOTE's "will not touch it again" becomes what this function really does
 *    (`CLOSING_NOTE`), under the same rule.
 * 5. THE TEAM'S FENCE is emptied only while it still holds the questions exactly as shipped
 *    (`HINT_BLOCK`): unanswered, they cost every step and told the agent nothing. Inside the fence
 *    on purpose, and still the team's: one word of theirs keeps the block as it is.
 *
 * Why 2–4 reach outside the fence: all three sit outside it, so a site provisioned before this
 * change would otherwise keep them for good — a sealed site told its `.webroot/` is editable, every
 * site told to read a `start-from.json` that is almost never there, and a team promised that the
 * file it just saw change would never change.
 *
 * Why the second edit exists at all: `provision.sh` runs this scaffolder for every platform, so an
 * EmDash site — whose `.webroot/` is data, not a document root — was told "`.webroot/` is the site
 * that is actually serving visitors ... an edit there is live the moment you save it". Every session
 * began on a false sentence, and the platform brief alone would leave two contradicting paragraphs
 * in one file. The replacement says what that directory IS rather than denying it exists, which is
 * the mistake the first repair made (see `WEBROOT_NONE`).
 *
 * Pure: the caller reads and writes. `test/site-folder.test.mjs` pins every branch.
 *
 * @param {string} existing - the file as it is on disk.
 * @param {string} siteKey @param {string|null} platform
 * @param {{origin?: string|null, copyAddress?: string|null, address?: string|null, sealed?: boolean}} [opts]
 * @returns {{ text: string, changed: boolean, notes: string[] }}
 */
export function topUpAgentsMd(
  existing,
  siteKey,
  platform,
  { origin = null, copyAddress = null, address = null, sealed = false } = {}
) {
  const notes = []
  let text = existing

  // 0. The address, for a folder written before one was recorded. Same reason the platform brief is
  // topped up below: a site provisioned before the field existed can otherwise never learn it, and
  // an agent that cannot read an address invents one. Only ever ADDED — a file that already names
  // this address, or that a team has rewritten, is left exactly as it is.
  const at = siteAddress(address)
  if (at !== '' && !text.includes(at)) {
    const anchor = /^(You are the agent for \*\*[^*]+\*\*\.[^\n]*)$/m
    if (anchor.test(text)) {
      text = text.replace(
        anchor,
        `$1\n\nPeople open this site at ${at} — give them that address, exactly as written here, when they ask to see it or to check your work. Do not rebuild it from the hostname: the scheme and the port are part of it.`
      )
      notes.push('address added')
    } else {
      notes.push('address not added — the opening paragraph is not the one Tracy shipped')
    }
  }

  // 1. The webroot paragraph, only while it is still exactly what Tracy wrote.
  const wanted = webrootParagraph(hostOf(siteKey), platform, { origin, copyAddress, sealed })
  if (!text.includes(wanted)) {
    const shipped = SHIPPED_WEBROOT.find((one) => text.includes(one))
    if (shipped !== undefined) {
      // A function replacement, so a `$` in either text is never read as a pattern.
      text = text.replace(shipped, () => wanted)
      notes.push('webroot paragraph corrected')
    } else {
      // An imported site's paragraph names a host and an address, so it is not comparable against a
      // constant; and a team that rewrote theirs owns it. Either way: say so, change nothing.
      notes.push('webroot paragraph left alone — it is not the one Tracy shipped')
    }
  }

  // 1b. The start-from paragraph goes, only while it is still exactly one Tracy wrote. Its blank
  // line goes with it, so the file closes up to what a new site gets.
  const startFrom = START_FROM_SHIPPED.find((one) => text.includes(`${one}\n\n`))
  if (startFrom !== undefined) {
    text = text.replace(`${startFrom}\n\n`, () => '')
    notes.push('start-from paragraph removed')
  } else if (text.includes('docs/agents/start-from.json')) {
    notes.push('start-from paragraph left alone — it is not the one Tracy shipped')
  }

  // 1c. The closing note's promise "will not touch it again", which 1–1b and 2 break — same rule:
  // only while it is still the line Tracy wrote, which is a whole line of its own.
  if (text.includes(`\n${CLOSING_NOTE_UNTIL_25_09}\n`)) {
    text = text.replace(`\n${CLOSING_NOTE_UNTIL_25_09}\n`, () => `\n${CLOSING_NOTE}\n`)
    notes.push('closing note corrected')
  }

  // 2. The fenced section: replace, or insert after the webroot paragraph when the file predates it.
  const brief = platformBrief(platform, { sealed }).trim()
  const start = text.indexOf(PLATFORM_MARKER_START)
  const end = text.indexOf(PLATFORM_MARKER_END)
  if (start !== -1 && end > start) {
    const current = text.slice(start, end + PLATFORM_MARKER_END.length)
    if (brief !== '' && current !== brief) {
      text = text.replace(current, brief)
      notes.push('platform brief refreshed')
    } else if (brief === '') {
      // The platform became unknown — leave what is there rather than blanking a section a reader
      // may rely on. An unknown platform is a provision problem, not a reason to lose prose.
      notes.push('platform unknown — fenced section left as it stands')
    }
  } else if (brief !== '') {
    /**
     * 🔒 NO FENCE AND NO PARAGRAPH TRACY WROTE MEANS THIS FILE IS THE TEAM'S, and nothing goes into
     * it. `test/site-folder.test.mjs` pins this with a file rewritten down to `# ours now`: appending
     * to it would be exactly the loss that gets noticed months later, when the agent quietly starts
     * answering worse. The anchor has to be a sentence Tracy is still known to own, not the end of
     * the file.
     */
    const at = text.indexOf(wanted)
    if (at === -1) {
      notes.push("nothing inserted — this file is the team's own")
    } else {
      text = text.slice(0, at + wanted.length) + `\n\n${brief}\n` + text.slice(at + wanted.length)
      notes.push('platform brief added')
    }
  }

  // 3. The team's fence, emptied only while it still holds the questions exactly as Tracy shipped them
  // (`HINT_BLOCK`): an answer the team wrote, even one word, keeps the whole block theirs.
  const unanswered = `${MARKER_START}\n\n${HINT_BLOCK}\n${MARKER_END}`
  if (text.includes(unanswered)) {
    text = text.replace(unanswered, () => `${MARKER_START}\n\n${MARKER_END}`)
    notes.push('hint block emptied')
  }

  return { text, changed: text !== existing, notes }
}

/** A site Tracy built: the webroot IS what visitors get. */
const WEBROOT_FLEET_BORN = `\`.webroot/\` is the site that is actually serving visitors, not a copy of it. An edit there is live
the moment you save it, and its history is kept on the fleet beside the webroot — not in this
repository. Everything else in this folder is the team's repository: committing there changes
nothing on the website.`

/**
 * An IMPORTED site: the webroot is Tracy's copy, and the customer's own server keeps serving the
 * real site until it goes live on Tracy.
 *
 * 🔒 SAYING "LIVE" HERE SENT AN AGENT TO PRODUCTION. Measured 14/09 on fijitrips.example: told that
 * `.webroot/` serves visitors, and knowing the customer's domain, the agent treated
 * `https://fijitrips.example` as the thing to change and to check its work against — and disabled
 * a plugin there. `tracy_site` now writes to the copy (tracy-web's Apply door), and this is the
 * sentence that keeps the agent's own reasoning on the same side.
 */
/**
 * The sentence that names where a browser reaches this site — or '' when nobody told us.
 *
 * 🔒 A HOSTNAME IS NOT AN ADDRESS, and this folder used to carry only the hostname. `.tracy/site.json`
 * held `siteKey` and `platform`; `AGENTS.md` named an address only for an IMPORTED site
 * (`copyAddress`). So for every fleet-born site the agent had to invent one, and on a local stand it
 * invented `https://<siteKey>/` — port 443, nothing listening. Measured 19/09/2026 on `demoemdasbh`:
 * the customer clicked exactly the link the agent gave and got `ERR_CONNECTION_REFUSED`, while the
 * site answered 200 at `http://demoemdasbh.tracy.test:51710/` the whole time. The address WAS known — `provision.sh`
 * holds it in `SITE_URL` and the seat book stores it — it simply never reached the folder.
 *
 * This is the same lesson `webrootImported` already carries for the imported case ("the agent spent
 * a minute probing hostnames and DNS, because nothing it could read named one"), learned once and
 * applied to one branch.
 *
 * ⚠ A BARE HOSTNAME IS REFUSED RATHER THAN DRESSED UP. Prefixing `https://` here would write a
 * plausible address that is wrong on every machine whose public surface is not 443 — exactly the
 * failure this is fixing. No address is better than a confident wrong one: the agent then says it
 * does not know instead of sending somebody to a dead port.
 *
 * @param {string|null|undefined} address
 * @returns {string} '' when there is nothing trustworthy to say.
 */
function siteAddress(address) {
  return /^https?:\/\/\S+$/.test(String(address ?? '')) ? String(address) : ''
}

function webrootImported(host, copyAddress) {
  // The address a person opens the copy at. Measured 14/09: asked "where is the staging site?", the
  // agent spent a minute probing hostnames and DNS, because nothing it could read named one.
  //
  // 🔒 NO SIGN-IN STANDS IN FRONT OF THE COPY, and this sentence says so. Until 07/10/2026 it read
  // "signed in with a seat on the site — anyone else gets a "Private copy" page", which stopped being
  // true on 16/09/2026: `apps/tracy-web/src/bar/route.js` ("NO GATE STANDS HERE") proxies a draft
  // copy to anyone who knows its hostname, and its robots answer asks crawlers to stay out — a
  // request, not a lock. An agent told the copy is private hands the address out as if it were.
  // `topUpAgentsMd` does not rewrite this paragraph in a folder that already has it (it names a
  // host and an address, so it is not one of `SHIPPED_WEBROOT`): such a folder keeps the old words.
  const staging = /^https?:\/\/\S+$/.test(String(copyAddress ?? ''))
    ? `\n\nThis copy is the **staging site**. People open it at ${copyAddress} — no sign-in stands in
front of it: anyone who has that address can open the copy, and search engines are only asked not
to index it. Give them that address when they ask to see the site or where staging is, and do not
call the copy private; never send them to https://${host} to see your work.`
    : ''
  return `\`.webroot/\` is **Tracy's copy** of ${host}, imported from the customer's own server. Until this
site goes live on Tracy, visitors are still served by that server at https://${host} — a different
machine that nothing in this folder reaches. An edit in \`.webroot/\` changes this copy the moment you
save it, and its history is kept on the fleet beside the webroot — not in this repository.
\`tracy_site\` writes to this copy too. Everything else in this folder is the team's repository:
committing there changes nothing on the website.

Never change the live site at https://${host}, and do not check your work against it — it will not
show your changes. Check the copy from the shell instead: your commands run inside this copy's own
web server, so \`curl http://localhost/\` is this copy, as a visitor would get it.${staging}`
}

/**
 * Every constant webroot paragraph any version of this file wrote, newest first — what the top-up
 * may replace. An imported copy's paragraph is not here: it names a host and an address, so it is
 * not comparable against a constant.
 */
const SHIPPED_WEBROOT = Object.freeze([
  WEBROOT_FLEET_BORN,
  WEBROOT_NONE,
  WEBROOT_SEALED_UNTIL_26_09,
  WEBROOT_NONE_UNTIL_20_09
])

/**
 * The start-from paragraph as Tracy last shipped it (07/09–25/09, dfb4ef67d …), byte for byte. Kept
 * ONLY so the top-up can recognise and remove it; no new file carries it.
 *
 * 🔒 WHY IT LEFT. It was written into every site and is true on almost none: `docs/agents/start-
 * from.json` exists only on a site forked from a URL. Bench r2 (V3) counted 3 reads of that missing
 * file, one a step of its own — the paragraph's "If ... exists" read as "go and look". Its one
 * durable sentence (rebuild the look with the customer's own words and pictures, never copy the
 * source's sentences or logo) now rides the per-turn `Started from:` line in `site-context.mjs`,
 * which is emitted only when the file IS there (PR #336). 393 characters on every step of every
 * session, for a fact the context already states when it is true.
 */
const START_FROM_SINCE_07_09 = `If \`docs/agents/start-from.json\` exists, the customer started this site from a site they like
(*Fork a site from any URL*): it names the URL and the design inspiration, \`brand:<host>\`, already
extracted under \`Brand/<host>/\` with its page list. Rebuild that look with the customer's own
words and pictures — never copy the source site's sentences or logo. The design skill's step 0
says how.`

/**
 * The paragraph's first wording, shipped from 06/09 17:24 (86a400bee, on `develop` through
 * db223ade0) until dfb4ef67d renamed "design direction" to "design inspiration" at every layer on
 * 07/09 09:09. Same bytes but that one word.
 *
 * ⚠ BUILT BY SWAPPING THE WORD, NOT WRITTEN OUT, and on purpose. The old two-word name is banned
 * vocabulary since 07/09: `check-language` refuses it in any string under `packages/` and has no
 * exception, rightly, since a string there is text somebody reads. This one is never written
 * anywhere — it exists only to RECOGNISE those bytes on a site and delete them. The frozen 06/09
 * fixture in `test/site-folder.test.mjs` (rendered from 86a400bee itself) holds it to the bytes
 * that shipped, so the swap cannot drift from them.
 */
const START_FROM_UNTIL_07_09 = START_FROM_SINCE_07_09.replace('inspiration,', 'direction,')

/**
 * Every start-from paragraph any version of this file wrote, newest first — what the top-up may
 * remove.
 *
 * ⚠ TWO TEXTS, AND THE FIRST COUNT FOUND ONE. It came from `git log --follow` on one path, which
 * skips merge commits and side branches, so the 06/09 wording — which reached `scripts/provision/`
 * only through merges (03e24103d, db223ade0) — was never rendered, and a site provisioned in that
 * window kept the whole paragraph while the run said "not the one Tracy shipped" (review, 25/09).
 * Measured again by rendering `agentsMd` for every platform at every commit of `git log -m --all`
 * on BOTH paths the file has lived at (`scripts/tools/` and `scripts/provision/`): 147 commits, 18
 * distinct files, these two start-from texts (14 files with this one, 1 with the 06/09 one, 3 from
 * before the paragraph existed); and the four webroot texts in `SHIPPED_WEBROOT` (one fleet-born,
 * two EmDash, plus `WEBROOT_SEALED` from this change).
 */
const START_FROM_SHIPPED = Object.freeze([START_FROM_SINCE_07_09, START_FROM_UNTIL_07_09])

/**
 * The first line of the closing note: what Tracy still changes in this file.
 *
 * ⚠ IT USED TO PROMISE "WILL NOT TOUCH IT AGAIN", FALSE SINCE 17/09 AND PLAINLY SO AFTER THIS
 * CHANGE. The fenced platform brief has been rewritten on re-provision since c991ce0f8, and the
 * top-up now also rewrites the webroot paragraph and removes the start-from paragraph — both
 * outside the fence. A team reading "will not touch it" edits accordingly and is surprised; the
 * line now says exactly what `topUpAgentsMd` does. "When the lane was built" went with it: there is
 * no lane since ADR 0014. The markers are named because they are what a person editing the raw file
 * sees (review, 25/09).
 */
const CLOSING_NOTE = `_Tracy updates only its \`tracy:platform\` part and any paragraph of its own that nobody has edited._`

/** The closing note's first line as every version of this file shipped it until 25/09, byte for byte. */
const CLOSING_NOTE_UNTIL_25_09 = `_Tracy wrote this file when the lane was built, and will not touch it again._`

/** Everything after the `.webroot/` paragraph and the platform brief, identical for every origin. */
const AGENTS_MD_TAIL = `${CLOSING_NOTE}
_Edit it freely: it is what your agent starts every session knowing._

${MARKER_START}

${MARKER_END}
`

/**
 * The repository's front page.
 *
 * It exists because the alternative is GitHub's: a repo created with `auto_init` shows its name
 * over a one-line description, and someone opening it meets a handful of folders with no way to
 * tell which of their edits would survive. The two mistakes it is written to prevent are both
 * silent — editing a generated directory, and expecting a commit to reach the website.
 */
export function rootReadme(siteKey, platform) {
  const host = hostOf(siteKey)
  return (
    `# ${host}\n\n` +
    `Everything Tracy knows about this website, and everything the team has made for it.\n\n` +
    `Platform: ${platform ?? 'not identified yet'}.\n\n` +
    '## What is hand-written, and what is generated\n\n' +
    '| | Written by | Edit it? |\n' +
    '|---|---|---|\n' +
    '| `AgentSetting/` `.agents/skills/` | people, reviewed as code | yes |\n' +
    '| `SiteContent/` | Tracy exports it; people and agents edit it | yes |\n' +
    '| `TracyProposal/` | people and agents | yes |\n' +
    '| `TracyWork/team/` — notes teammates shared | people | yes |\n' +
    '| `TracyWork/agents/` — surface, digest, drafts, state | agents | **no** |\n' +
    '| `.webroot/` | the live site | see below |\n' +
    '| `.tracy/` | this lane | **no** |\n\n' +
    '## Before you edit anything\n\n' +
    '**`.webroot/` is the live site.** It is not a copy and there is no Preview standing between\n' +
    'it and visitors: an edit is public the moment it is saved. Its history lives on the fleet\n' +
    'beside the webroot, which is why it is not committed here.\n\n' +
    '**Committing here does not publish.** Nothing in this repository is deployed by a push.\n\n' +
    // The questions `AGENTS.md` carried in its team fence until 05/10/2026 (`HINT_BLOCK`): a person
    // answers them, so they are asked here, where people read — not in a file the agent re-reads on
    // every step of every conversation.
    '## Tell your agent about this site\n\n' +
    'Your agent reads `AGENTS.md` at the start of every session. Write your answers between its\n' +
    '`tracy:agents-md` markers:\n\n' +
    '- What this site is for, its voice, its priorities.\n' +
    '- Which skills to reach for, and when.\n' +
    '- What the agent must hand to a person instead of doing itself.\n\n' +
    '## Working here\n\n' +
    '**Never commit a credential.** Tokens and passwords live in Site Configuration, not in git —\n' +
    'anyone who can read this repository can read anything committed to it.\n\n' +
    'Each folder has its own README saying what belongs in it.\n'
  )
}

/**
 * Every file the skeleton writes, keyed by its path relative to the site folder.
 *
 * Returned as data rather than written directly so the same answer can be tested, diffed against
 * what a lane already holds, and written by whoever owns the filesystem — the writer here runs on
 * the fleet host, but the questions it answers are pure.
 *
 * @param {string} siteKey Site hostname, e.g. `tchwp2august.tracy.ai`.
 * @param {string|null} platform `wordpress` | `joomla` | `emdash` | null when not yet known.
 * @param {{origin?: string|null, copyAddress?: string|null, address?: string|null, sealed?: boolean}} [options]
 *   `origin` is `imported` when the webroot was copied from the customer's
 *   own server — `AGENTS.md` then says it is Tracy's copy, not the live site, and `.tracy/site.json`
 *   records `"origin": "imported"`. `copyAddress` is
 *   where people open that copy (the staging site); it is named in `AGENTS.md` when given.
 *   `sealed` is MEASURED by the caller from the content-contract marker (`contractSealed`), and is
 *   deliberately not recorded in `.tracy/site.json`: the marker is the one truth the fence reads, and
 *   a second copy here would drift from it the day a seal is lifted.
 * @returns {Map<string, string>} relative path → exact content.
 */
export function skeletonFiles(
  siteKey,
  platform = null,
  { origin = null, copyAddress = null, address = null, sealed = false } = {}
) {
  const files = new Map()
  for (const [dir, note] of DIR_NOTES) files.set(`${dir}/README.md`, note)
  files.set('AgentSetting/skills.json', '{}\n')
  files.set('README.md', rootReadme(siteKey, platform))
  files.set('AGENTS.md', agentsMd(siteKey, platform, { origin, copyAddress, address, sealed }))
  files.set('.gitignore', GITIGNORE)
  files.set('docs/agents/issue-tracker.md', ISSUE_TRACKER)
  // Machine-written identity. `platform` is the field the seat door and the lane both read to
  // decide which folder the agent belongs in; it is recorded here so a person reading the folder
  // can see the same answer the machines are using. `origin` is written only for an imported site,
  // so every other site's file stays byte for byte what it has always been.
  // `address` joins them when provision knows one: the machines had it all along (the seat book,
  // `SITE_URL`) while the folder — the one thing the agent can read — did not. Absent when unknown,
  // never guessed, so a file without it means "nobody told us" rather than "it is on 443".
  const at = siteAddress(address)
  const identity = {
    siteKey,
    platform,
    ...(origin === 'imported' ? { origin } : {}),
    ...(at === '' ? {} : { address: at })
  }
  files.set('.tracy/site.json', `${JSON.stringify(identity, null, 1)}\n`)
  return files
}
