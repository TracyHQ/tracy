#!/usr/bin/env node
/**
 * The site folder a lane drops its agent into.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/site-folder.test.mjs
 *
 * These tests pin the three things that differ from tracy-desk's version, because each of them
 * fails silently if it drifts back: the instruction file dsh actually reads, the absence of a
 * code directory ADR 0073 moved to the fleet, and keeping the live webroot out of the team repo.
 */

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'

const exists = async (p) => {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { ensureSiteFolder } from '../scripts/provision/ensure-site-folder.mjs'
import {
  agentsMd,
  hostOf,
  MARKER_END,
  MARKER_START,
  platformBrief,
  rootReadme,
  skeletonFiles,
  topUpAgentsMd
} from '../scripts/provision/siteFolder.mjs'

/**
 * Where this file's scratch folders go: the runner's artifact directory when it names one, the
 * system's temporary directory otherwise.
 */
const SCRATCH = process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir()
/** A text with every run of whitespace as one space: sentences wrap, and are matched unwrapped. */
const flatText = (text) => text.replace(/\s+/g, ' ')

const SITE = 'tchwp2august.tracy.ai'

test('the instruction file is AGENTS.md — the one dsh reads', () => {
  const files = skeletonFiles(SITE, 'wordpress')
  assert.ok(files.has('AGENTS.md'))
  // `dsh-agent-instructions` ships `['AGENTS.md', 'CLAUDE.md']` as its candidates and knows nothing
  // about `system.md`, which is tracy-desk's PromptBuilder file. Writing that name here produces a
  // folder that looks right while the agent starts every session on the embedded default.
  assert.equal(files.has('system.md'), false, 'system.md is read by tracy-desk, not by dsh')
})

test('no SiteSourceCode/ — ADR 0073 moved WordPress and Joomla code to the fleet', () => {
  for (const platform of ['wordpress', 'joomla', 'emdash', null]) {
    const paths = [...skeletonFiles(SITE, platform).keys()]
    assert.ok(
      !paths.some((p) => p.startsWith('SiteSourceCode/')),
      `${platform}: an empty SiteSourceCode/ claims the code is in this repo when it is not`
    )
  }
})

test('the live webroot and the lane identity stay out of the team repo', () => {
  const gitignore = skeletonFiles(SITE, 'wordpress').get('.gitignore')
  // `.webroot/` is a mount of the running site, already tracked in `webroot-baseline.git` beside
  // it on the fleet. One `git add -A` without this line commits an entire CMS, permanently.
  assert.match(gitignore, /^\.webroot\/$/m)
  assert.match(gitignore, /^\.tracy\/$/m)
})

test('AGENTS.md names the site and says .webroot/ is live, not a copy', () => {
  const body = agentsMd(SITE, 'wordpress')
  assert.match(body, /tchwp2august\.tracy\.ai/)
  assert.match(body, /runs on wordpress/)
  // The one fact an agent cannot get by looking: the directory it is standing in serves visitors.
  assert.match(body, /actually serving visitors/)
  assert.ok(body.includes(MARKER_START) && body.includes(MARKER_END))
})

// An IMPORTED site's `.webroot/` is Tracy's copy; the customer's own server keeps serving the real
// site until go-live. Told "live, not a copy", an agent on fijitrips.example (14/09) treated the
// customer's production as its target — wrote to it, and checked its work against it.
test('AGENTS.md of an imported site says .webroot/ is Tracy’s copy and the live site is off limits', () => {
  const body = agentsMd('fijitrips.example', 'joomla', { origin: 'imported' })
  assert.match(body, /fijitrips\.example/)
  assert.match(body, /runs on joomla/)
  assert.doesNotMatch(body, /actually serving visitors/)
  assert.match(body, /Tracy's copy/)
  assert.match(body, /https:\/\/fijitrips\.example/)
  assert.match(body, /[Nn]ever change the live site/)
  assert.match(body, /tracy_site/)
  // Measured 14/09: inside `<label>-web-1`, `curl http://localhost/` is the copy (200); the
  // browser's `<label>.tracy.test:51710` does not answer from there.
  assert.match(body, /curl http:\/\/localhost\//)
  assert.doesNotMatch(body, /address Tracy shows/)
  assert.ok(body.includes(MARKER_START) && body.includes(MARKER_END))
})

// Measured 14/09: asked "where is the staging site?", the agent probed hostnames and DNS for a minute
// and never found it — nothing it could read named the address a person opens the copy at.
test('AGENTS.md of an imported site names the staging site address when provision knows it', () => {
  const body = agentsMd('fijitrips.example', 'joomla', {
    origin: 'imported',
    copyAddress: 'http://fijitrips-example-5254d120.tracy.test:51710/'
  })
  assert.match(body, /staging site/)
  assert.match(body, /http:\/\/fijitrips-example-5254d120\.tracy\.test:51710\//)
})

// 🔒 The copy is NOT closed to strangers (`apps/tracy-web/src/bar/route.js`, "NO GATE STANDS HERE",
// 16/09/2026): the bar serves a draft copy to anyone who knows its hostname, and its robots answer
// only asks crawlers to stay out. Until 07/10/2026 this paragraph told the agent the opposite —
// "signed in with a seat on the site — anyone else gets a "Private copy" page" — so an agent handed
// the address out as if it were private.
test('AGENTS.md of an imported site says the staging copy is open to anyone who has its address, and never that it is private', async () => {
  const address = 'http://fijitrips-example-5254d120.tracy.test:51710/'
  for (const platform of ['joomla', 'wordpress']) {
    const fromAgentsMd = agentsMd('fijitrips.example', platform, { origin: 'imported', copyAddress: address })
    const fromSkeleton = skeletonFiles('fijitrips.example', platform, {
      origin: 'imported',
      copyAddress: address
    }).get('AGENTS.md')
    const dir = await mkdtemp(path.join(SCRATCH, 'site-folder-staging-'))
    await ensureSiteFolder(dir, 'fijitrips.example', platform, null, {
      origin: 'imported',
      copyAddress: address
    })
    const onDisk = await readFile(path.join(dir, 'AGENTS.md'), 'utf8')
    for (const [what, body] of [
      ['agentsMd', fromAgentsMd],
      ['skeletonFiles', fromSkeleton],
      ['ensureSiteFolder', onDisk]
    ]) {
      const said = flatText(body)
      const where = `${platform} ${what}`
      assert.ok(said.includes(`People open it at ${address}`), where)
      assert.match(
        said,
        /no sign-in stands in front of it: anyone who has that address can open the copy/,
        where
      )
      assert.match(said, /search engines are only asked not to index it/, where)
      assert.doesNotMatch(said, /Private copy|signed in with a seat|anyone else gets/i, where)
      assert.match(said, /never send them to https:\/\/fijitrips\.example to see your work/, where)
    }
  }
  // The router this sentence describes still says what it says.
  const bar = await readFile(new URL('../../../../apps/tracy-web/src/bar/route.js', import.meta.url), 'utf8')
  assert.match(bar, /NO GATE STANDS HERE/)
  assert.match(flatText(bar), /a draft copy is readable by anyone who knows its hostname/)
})

test('an address that is missing or is not one is never written into the staging sentence: the sentence is left out whole', () => {
  for (const copyAddress of [
    undefined,
    null,
    '',
    '   ',
    'fijitrips-example-5254d120.tracy.test',
    'ftp://copy.example/',
    'http://',
    'http://copy.example/ and more',
    'javascript:alert(1)',
    0,
    {},
    []
  ]) {
    const body = agentsMd('fijitrips.example', 'joomla', { origin: 'imported', copyAddress })
    assert.doesNotMatch(body, /staging site|People open it at|no sign-in stands/, String(copyAddress))
    assert.match(body, /Tracy's copy/, String(copyAddress))
  }
  // A site that is not an imported copy has no staging sentence, whatever address is passed.
  for (const origin of [null, undefined, 'something'])
    assert.doesNotMatch(
      agentsMd(SITE, 'wordpress', { origin, copyAddress: 'https://copy.tracy.ai/' }),
      /staging site|no sign-in stands/
    )
})

test('a folder whose AGENTS.md was written with the earlier staging sentence is left as the team has it: the top-up says so and changes nothing there', () => {
  const address = 'http://fijitrips-example-5254d120.tracy.test:51710/'
  const opts = { origin: 'imported', copyAddress: address }
  const now = agentsMd('fijitrips.example', 'joomla', opts)
  const start = now.indexOf(' — no sign-in stands in')
  const end = now.indexOf(' Give them that address when they ask to see the site')
  assert.ok(start > 0 && end > start)
  const before =
    now.slice(0, start) +
    ' (signed in with a seat on the\nsite — anyone else gets a "Private copy" page).' +
    now.slice(end).replace(', and do not\ncall the copy private;', ';')
  assert.notEqual(before, now)
  const result = topUpAgentsMd(before, 'fijitrips.example', 'joomla', opts)
  assert.ok(result.text.includes('"Private copy" page'), 'authored content is not rewritten')
  assert.ok(
    result.notes.some((note) => /webroot paragraph left alone/.test(note)),
    result.notes.join(' | ')
  )
  // A folder written today needs no correction.
  const fresh = topUpAgentsMd(now, 'fijitrips.example', 'joomla', opts)
  assert.equal(
    fresh.notes.some((note) => /webroot paragraph/.test(note)),
    false,
    fresh.notes.join(' | ')
  )
})

test('without an address the staging sentence is left out, not filled with a placeholder', () => {
  const body = agentsMd('fijitrips.example', 'joomla', { origin: 'imported' })
  assert.doesNotMatch(body, /undefined|null/)
  assert.doesNotMatch(body, /staging site at/)
})

test('an unknown origin keeps the fleet-born wording', () => {
  assert.equal(agentsMd(SITE, 'wordpress', { origin: 'something' }), agentsMd(SITE, 'wordpress'))
})

test('skeletonFiles and ensureSiteFolder carry the origin into AGENTS.md', async () => {
  assert.match(
    skeletonFiles('fijitrips.example', 'joomla', { origin: 'imported' }).get('AGENTS.md'),
    /Tracy's copy/
  )
  const dir = await mkdtemp(path.join(SCRATCH, 'site-folder-origin-'))
  await ensureSiteFolder(dir, 'fijitrips.example', 'joomla', null, {
    origin: 'imported',
    copyAddress: 'http://fijitrips-example-5254d120.tracy.test:51710/'
  })
  const written = await readFile(path.join(dir, 'AGENTS.md'), 'utf8')
  assert.match(written, /Tracy's copy/)
  assert.match(written, /fijitrips-example-5254d120\.tracy\.test:51710/)
})

/**
 * 🔒 THE START-FROM PARAGRAPH LEFT AGENTS.md (PLAN v2 P6.4). It was written into every site and true
 * on almost none: `docs/agents/start-from.json` exists only on a site forked from a URL, and bench r2
 * counted 3 reads of the missing file. Its one durable sentence rides the per-turn `Started from:`
 * line in `tracy-site-tools`' `site-context.mjs`, emitted only when the file is there — that line is
 * pinned by its own test, so this one only has to hold the file clean.
 */
test('a new site has no start-from paragraph, whatever its platform, origin or seal', () => {
  for (const platform of ['joomla', 'wordpress', 'emdash', null]) {
    for (const opts of [{}, { origin: 'imported' }, { sealed: true }]) {
      const body = agentsMd(SITE, platform, opts)
      assert.doesNotMatch(body, /start-from\.json/, `${platform} ${JSON.stringify(opts)}`)
      assert.doesNotMatch(body, /Fork a site from any URL/, `${platform} ${JSON.stringify(opts)}`)
    }
  }
})

test('AGENTS.md no longer forbids the question panel — dsh 0.1.3-alpha.1-tracy.3 keeps a question across a reload', () => {
  // The ban of 02/09 (bd7c5c3c) papered over a Client bug: a re-delivered question arrived before
  // the page had its Agent Context and was delegated away. Fixed in the fork on 07/09; the
  // instruction must go with it, or agents keep paying a round trip for a panel that now works.
  const body = agentsMd(SITE, 'wordpress')
  assert.doesNotMatch(body, /ask_user_question/)
  assert.doesNotMatch(body, /question panel/)
})

test('an unknown platform says so instead of inventing one', () => {
  const body = agentsMd(SITE, null)
  assert.match(body, /has not identified this site's platform/)
  assert.equal(/runs on null|runs on undefined/.test(body), false)
})

test('the hint block is byte-identical whatever the site — it is how "unfilled" stays recognisable', () => {
  const a = agentsMd('one.example', 'wordpress')
  const b = agentsMd('two.example', 'joomla')
  const between = (s) => s.slice(s.indexOf(MARKER_START) + MARKER_START.length, s.indexOf(MARKER_END))
  assert.equal(between(a), between(b))
})

/**
 * 🔒 THE TEAM'S FENCE ARRIVES EMPTY, AND ITS QUESTIONS LIVE IN THE README (bench flow D, 05/10/2026).
 * dsh sends `AGENTS.md` on every step of every conversation, so three unanswered questions ("What this
 * site is for…", "Which skills to reach for…", "What the agent must hand to a person…") were ~520
 * characters the agent re-read on every step of 55 runs and could do nothing with. The fence stays, so
 * the team still sees where its own words go; the questions are for the team, so they go where a person
 * reads them: the repository's front page.
 */
test('a new AGENTS.md carries an empty team fence; the questions for the team are in the README', () => {
  const between = (s) => s.slice(s.indexOf(MARKER_START) + MARKER_START.length, s.indexOf(MARKER_END))
  for (const platform of ['joomla', 'wordpress', 'emdash', null]) {
    const md = agentsMd(SITE, platform)
    assert.ok(md.includes(MARKER_START) && md.includes(MARKER_END), String(platform))
    assert.equal(between(md).trim(), '', String(platform))
    assert.doesNotMatch(md, /About this site|Skills to reach for|Hand to a person/, String(platform))
  }
  const readme = rootReadme(SITE, 'wordpress')
  assert.match(readme, /What this site is for, its voice, its priorities/)
  assert.match(readme, /Which skills to reach for, and when/)
  assert.match(readme, /What the agent must hand to a person/)
  assert.match(readme, /`AGENTS\.md`/)
})

test('topUpAgentsMd empties a hint block nobody filled, and keeps one the team filled', async () => {
  const { topUpAgentsMd, HINT_BLOCK } = await import('../scripts/provision/siteFolder.mjs')
  const fresh = agentsMd(SITE, 'wordpress')
  const shipped = fresh.replace(
    `${MARKER_START}\n\n${MARKER_END}`,
    `${MARKER_START}\n\n${HINT_BLOCK}\n${MARKER_END}`
  )
  assert.notEqual(shipped, fresh, 'the old file carried the questions')
  const result = topUpAgentsMd(shipped, SITE, 'wordpress')
  assert.deepEqual(result.notes, ['hint block emptied'])
  assert.equal(result.text, fresh)
  assert.equal(topUpAgentsMd(result.text, SITE, 'wordpress').changed, false)
  // An answer the team wrote is theirs, whole.
  const theirs = shipped.replace(
    'What this site is for, its voice, its priorities.',
    'A bakery in Hanoi; warm, short.'
  )
  const kept = topUpAgentsMd(theirs, SITE, 'wordpress')
  assert.match(kept.text, /A bakery in Hanoi; warm, short\./)
  assert.match(kept.text, /## Skills to reach for/)
  assert.ok(!kept.notes.includes('hint block emptied'))
})

test('every directory the team owns arrives with a README saying what belongs in it', () => {
  const paths = [...skeletonFiles(SITE, 'wordpress').keys()]
  for (const dir of ['AgentSetting', 'SiteContent', 'TracyProposal', 'TracyWork', '.agents/skills']) {
    assert.ok(paths.includes(`${dir}/README.md`), `${dir} has no README`)
  }
})

test('the identity file records the platform the machines are acting on', () => {
  const written = JSON.parse(skeletonFiles(SITE, 'emdash').get('.tracy/site.json'))
  assert.deepEqual(written, { siteKey: SITE, platform: 'emdash' })
})

test('the identity file of an imported site says so; every other origin keeps the same bytes', () => {
  const imported = skeletonFiles('fijitrips.example', 'joomla', { origin: 'imported' }).get(
    '.tracy/site.json'
  )
  assert.deepEqual(JSON.parse(imported), {
    siteKey: 'fijitrips.example',
    platform: 'joomla',
    origin: 'imported'
  })
  // Byte for byte: a fleet-born site, an unknown origin and no origin at all write what they always did.
  const plain = '{\n "siteKey": "tchwp2august.tracy.ai",\n "platform": "wordpress"\n}\n'
  assert.equal(skeletonFiles(SITE, 'wordpress').get('.tracy/site.json'), plain)
  assert.equal(skeletonFiles(SITE, 'wordpress', { origin: 'something' }).get('.tracy/site.json'), plain)
  assert.equal(skeletonFiles(SITE, 'wordpress', { origin: null }).get('.tracy/site.json'), plain)
})

test('the front page names the host, not the repo label', () => {
  // The label is `joomlart-com-0871462c` — a hash nobody can read back to a site. The page a
  // customer's developer opens says the hostname. `www.` is kept: it is part of the host they
  // typed, and tracy-desk's copy of this function keeps it too.
  assert.match(rootReadme('https://www.joomlart.com/', 'joomla'), /^# www\.joomlart\.com$/m)
  assert.match(rootReadme('tchwp2august.tracy.ai', 'wordpress'), /^# tchwp2august\.tracy\.ai$/m)
})

test('hostOf tolerates both spellings the callers actually pass', () => {
  assert.equal(hostOf('https://www.joomlart.com/'), 'www.joomlart.com')
  assert.equal(hostOf('tchwp2august.tracy.ai'), 'tchwp2august.tracy.ai')
})

test('writing twice never overwrites: the second run reports everything as already there', async () => {
  const { mkdtemp, readFile, writeFile } = await import('node:fs/promises')
  const nodePath = (await import('node:path')).default
  const { ensureSiteFolder } = await import('../scripts/provision/ensure-site-folder.mjs')

  const folder = await mkdtemp(nodePath.join(SCRATCH, 'site-folder-'))
  const first = await ensureSiteFolder(folder, SITE, 'wordpress')
  assert.ok(first.written.includes('AGENTS.md'))
  assert.equal(first.kept.length, 0)

  // The team edits the file. A lane rebuild must not undo that — this is the loss that would only
  // be noticed much later, when the agent quietly starts answering worse.
  await writeFile(nodePath.join(folder, 'AGENTS.md'), '# ours now\n', 'utf8')
  const second = await ensureSiteFolder(folder, SITE, 'wordpress')
  assert.equal(second.written.length, 0)
  assert.equal(await readFile(nodePath.join(folder, 'AGENTS.md'), 'utf8'), '# ours now\n')
})

test('the platform is MEASURED from the webroot, not taken from the caller', async () => {
  // Measured 02/09: `dshwp1` is Joomla and was migrated with `wordpress` on the command line.
  // Nothing failed — the mounts are the same shape either way — so the only casualty was the
  // sentence in AGENTS.md, which then told that site's agent it worked on WordPress, every session.
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises')
  const nodePath = (await import('node:path')).default
  const { detectPlatform } = await import('../scripts/provision/ensure-site-folder.mjs')

  const joomla = await mkdtemp(nodePath.join(SCRATCH, 'webroot-'))
  await writeFile(nodePath.join(joomla, 'configuration.php'), '<?php', 'utf8')
  assert.equal(await detectPlatform(joomla, 'wordpress'), 'joomla', 'the disk outranks the argument')

  const wordpress = await mkdtemp(nodePath.join(SCRATCH, 'webroot-'))
  await mkdir(nodePath.join(wordpress, 'wp-includes'), { recursive: true })
  await writeFile(nodePath.join(wordpress, 'wp-includes/version.php'), '<?php', 'utf8')
  assert.equal(await detectPlatform(wordpress, 'joomla'), 'wordpress')

  // emdash leaves no file to look at — its site is a database — so the caller's word stands.
  const empty = await mkdtemp(nodePath.join(SCRATCH, 'webroot-'))
  assert.equal(await detectPlatform(empty, 'emdash'), 'emdash')
  // And with no webroot to inspect at all, there is nothing to measure.
  assert.equal(await detectPlatform(null, 'emdash'), 'emdash')
})

test('the issue tracker points at local markdown, in the title line the deck parses', () => {
  const doc = skeletonFiles(SITE, 'wordpress').get('docs/agents/issue-tracker.md')
  assert.ok(doc, 'docs/agents/issue-tracker.md missing from the skeleton')
  // The deck decides by the title line alone (parseIssueTracker, "#277": body keywords are
  // ignored for markdown), and this is its regex. A title that drifts to "GitHub" turns the
  // panel red on every lane without any other symptom.
  assert.match(doc, /^#\s*issue\s*tracker\s*:\s*(markdown|local)/im)
  assert.doesNotMatch(doc, /^#\s*issue\s*tracker\s*:\s*(github|gitlab)/im)
  assert.ok(doc.includes('.scratch/'), 'the conventions must name .scratch/, where the skills write')
})

test('the deck cache stays out of the team repository', () => {
  const gitignore = skeletonFiles(SITE, 'wordpress').get('.gitignore')
  assert.ok(gitignore.split('\n').includes('.dsh-mattskillsdeck-cache/'))
})

test('each platform is told where IT keeps things, and an unknown one is told nothing', () => {
  // 🔒 THE POINT OF THE SECTION. Measured 16/09 on a Joomla site: one request spent eight calls
  // re-deriving a module parameter the door had already returned, and eleven more tracing
  // `detectLanguage` through Joomla core to reach a change the door could make all along. Both
  // facts are static per platform, so a model should never pay to discover them twice.
  // Collapse whitespace before matching: these are wrapped prose, and a regex that also pins the
  // line breaks would fail the next time somebody re-wraps a paragraph — a test failing for a
  // reason that has nothing to do with what it guards.
  const flat = (md) => md.replace(/\s+/g, ' ')
  const joomla = flat(agentsMd('demo.tracy.test', 'joomla', {}))
  assert.match(joomla, /## What Joomla keeps where/)
  assert.match(joomla, /the breadcrumb's "Home" is the breadcrumbs module's `homeText`/)
  assert.match(joomla, /the default template style's `siteTitle` parameter/)
  // 🔒 A DURABLE FACT NAMES NO TEMPLATE. This brief is written ONCE per site and never rewritten,
  // so an example in it outlives every release. It carried "on Cassiopeia that is the word
  // CASSIOPEIA" until 21/09/2026 — a template no Tracy site runs, frozen into the file every
  // Joomla site starts its sessions from. The rule survives the example being wrong; the example
  // does not survive being read as the rule.
  assert.doesNotMatch(joomla, /Cassiopeia|CASSIOPEIA/)
  assert.match(joomla, /The site's language\*\* is two records, and changing one alone does nothing/)
  assert.match(joomla, /template overrides under `templates\/<template>\/html\/`/)

  const wordpress = flat(agentsMd('demo.tracy.test', 'wordpress', {}))
  assert.match(wordpress, /## What WordPress keeps where/)
  assert.match(wordpress, /`blogname` and `blogdescription` options/)
  assert.match(wordpress, /template parts\*\* \(a block theme\) or PHP templates/)
  assert.match(wordpress, /Never edit\*\* anything under `wp-admin\/` or `wp-includes\/`/)

  const emdash = flat(agentsMd('demo.tracy.test', 'emdash', {}))
  assert.match(emdash, /## What EmDash keeps where/)
  assert.match(emdash, /no PHP and no document root/)
  assert.match(emdash, /Never kill the server process\*\*: it is PID 1/)

  // 🔒 NAME THE PLACE, NEVER THE CALL. This file is written once and never touched again, so a
  // sentence naming a tool or an action would outlive the version that made it true. Those belong
  // in `site-context.mjs`, which is rewritten every turn.
  for (const [name, md] of [
    ['joomla', joomla],
    ['wordpress', wordpress],
    ['emdash', emdash]
  ]) {
    assert.doesNotMatch(md, /tracy_site|tracy_emdash|content\.update|content\.list|apply_id/, name)
  }

  // Nothing true to say is said as nothing, not as an empty heading.
  for (const unknown of [null, undefined, '', 'drupal']) {
    assert.doesNotMatch(flat(agentsMd('demo.tracy.test', unknown, {})), /keeps where/, String(unknown))
  }
})

test('a platform with no document root is not told to edit one', () => {
  // 🔒 THE BUG THIS CLOSES. `provision.sh` runs this scaffolder for EVERY platform, so until 17/09
  // an EmDash site — `PLATFORM_NEEDS_WEBROOT=0` in its own platform file — was handed the
  // fleet-born sentence about a directory that is never created. Same shape as the imported-site
  // sentence that sent an agent to a customer's production server on 14/09: the first file the
  // agent reads said something untrue.
  //
  // ⚠ AND THE SECOND BUG, MEASURED 20/09: the first repair said "This site has no `.webroot/`".
  // EmDash HAS one — the compose mounts data and uploads at `.webroot/data` and `.webroot/uploads`,
  // which is where the agent's `docker exec` lands (`/site/site-h330yd/.webroot/uploads`: 116
  // entries; `/site/site-h330yd/data`: no such file). Denying the directory that exists sends the
  // agent to two paths that do not, and it finds an empty site. So the paragraph must name the real
  // path and say it is not a document root — never that it is absent.
  const emdash = agentsMd('demo.tracy.test', 'emdash', {})
  assert.match(emdash, /`\.webroot\/data`/)
  assert.match(emdash, /`\.webroot\/uploads`/)
  assert.doesNotMatch(emdash, /has no `\.webroot\/`/)
  assert.doesNotMatch(emdash, /no webroot/)
  assert.doesNotMatch(emdash, /is the site that is actually serving visitors/)
  assert.doesNotMatch(emdash, /An edit there is live/)

  // The two platforms that DO have one keep their paragraph exactly as before.
  for (const platform of ['joomla', 'wordpress']) {
    const md = agentsMd('demo.tracy.test', platform, {})
    assert.match(md, /`\.webroot\/` is the site that is actually serving visitors/, platform)
    assert.doesNotMatch(md, /This site has no `\.webroot\/`/, platform)
  }
  // An imported site still gets the copy wording, whatever else changed.
  const imported = agentsMd('demo.tracy.test', 'joomla', { origin: 'imported' })
  assert.match(imported, /\*\*Tracy's copy\*\*/)
})

test('topUpAgentsMd: an existing site learns its platform brief, and learning it twice changes nothing', async () => {
  const { topUpAgentsMd, PLATFORM_MARKER_START } = await import('../scripts/provision/siteFolder.mjs')
  // A file from before the fence existed: Tracy's paragraphs, no platform section.
  const before = agentsMd(SITE, 'joomla', {}).replace(
    /\n<!-- tracy:platform v1 -->[\s\S]*?<!-- \/tracy:platform -->\n/,
    ''
  )
  assert.doesNotMatch(before, /keeps where/)

  const first = topUpAgentsMd(before, SITE, 'joomla', {})
  assert.equal(first.changed, true)
  assert.deepEqual(first.notes, ['platform brief added'])
  assert.match(first.text, /## What Joomla keeps where/)
  assert.ok(first.text.includes(PLATFORM_MARKER_START))
  // Inserted after Tracy's own paragraph, not appended to the end.
  assert.ok(first.text.indexOf(PLATFORM_MARKER_START) < first.text.indexOf('_Tracy updates only'))

  // 🔒 IDEMPOTENT. A lane is rebuilt far more often than a site is created; a top-up that churns
  // the file on every rebuild is a diff the team learns to ignore.
  const second = topUpAgentsMd(first.text, SITE, 'joomla', {})
  assert.equal(second.changed, false)
  assert.equal(second.text, first.text)
})

test('topUpAgentsMd: the EmDash webroot sentence is corrected only while it is still Tracy’s own', async () => {
  const { topUpAgentsMd } = await import('../scripts/provision/siteFolder.mjs')
  const old = agentsMd(SITE, 'joomla', {}).replace(
    /\n<!-- tracy:platform v1 -->[\s\S]*?<!-- \/tracy:platform -->\n/,
    ''
  )

  // Untouched: the false paragraph goes, and the brief arrives.
  const fixed = topUpAgentsMd(old, SITE, 'emdash', {})
  assert.deepEqual(fixed.notes, ['webroot paragraph corrected', 'platform brief added'])
  assert.match(fixed.text, /`\.webroot\/` is not a document root/)
  assert.doesNotMatch(fixed.text, /has no `\.webroot\/`/)
  assert.doesNotMatch(fixed.text, /is the site that is actually serving visitors/)

  // Rewritten by the team: their words stay, and the run says why nothing happened.
  const theirs = old.replace(
    /`\.webroot\/` is the site[\s\S]*?nothing on the website\./,
    'Our own note about where this site lives.'
  )
  const left = topUpAgentsMd(theirs, SITE, 'emdash', {})
  assert.match(left.notes[0], /webroot paragraph left alone/)
  assert.match(left.text, /Our own note about where this site lives\./)
})

test('topUpAgentsMd: a file the team rewrote is returned byte for byte', async () => {
  const { topUpAgentsMd } = await import('../scripts/provision/siteFolder.mjs')
  // No fence and no paragraph Tracy owns: there is no anchor, so there is no edit.
  const ours = '# ours now\n'
  const result = topUpAgentsMd(ours, SITE, 'wordpress', {})
  assert.equal(result.changed, false)
  assert.equal(result.text, ours)
  assert.match(result.notes.join(' '), /this file is the team's own/)
})

/**
 * 🔒 THE SKILL DIRECTORY MUST BE ONE THE RUNTIME SCANS, and nothing else in the repo checks that.
 *
 * Until 17/09 the folder shipped `.claude/skills`, documented to the team as the place for
 * site-specific skills. dsh's skill scanner walks `<projectRoot>/.dsh/skills` and
 * `<projectRoot>/.agents/skills` and no plugin in the harness mentions `.claude` at all, so every
 * skill a team wrote there was invisible — and invisible looks exactly like "this site has no
 * skills", which is the state of most sites, so nobody would have noticed.
 *
 * This test reads the scanner's own roots out of the submodule rather than hard-coding them, so the
 * day dsh changes where it looks, this fails instead of the customer's skill silently going quiet.
 */
test('site-specific skills land in a directory the dsh skill scanner actually reads', async () => {
  const scanner = await readFile(
    new URL(
      '../../../../vendor/tracy/deepseek-harness/packages/skill/skill-filesystem/src/index.ts',
      import.meta.url
    ),
    'utf8'
  )
  const roots = [...scanner.matchAll(/join\(projectRoot,\s*'([^']+)'\)/g)].map((m) => m[1])
  assert.ok(roots.length > 0, 'could not read the scanner roots — has skill-filesystem moved?')

  const paths = [...skeletonFiles(SITE, 'wordpress').keys()]
  const skillDir = paths.find((one) => one.endsWith('/README.md') && one.includes('skills'))
  assert.ok(skillDir, 'the folder ships no skills directory')
  const dir = skillDir.slice(0, skillDir.lastIndexOf('/'))
  assert.ok(
    roots.includes(dir),
    `site skills go to ${dir}, which dsh does not scan — it reads ${roots.join(' and ')}`
  )
})

/**
 * Retiring a file Tracy moved — and the guard that makes it safe.
 *
 * The rule is byte-equality with what Tracy shipped: identical means nobody ever touched it and it
 * is Tracy's to withdraw; one edited character means a person wrote there and it stays. A stale note
 * costs a reader a moment; deleting somebody's work costs them the work.
 */
test('the moved skills note is withdrawn only while it is byte-for-byte what Tracy shipped', async () => {
  const shipped =
    'Site-specific skills: one directory per skill (SKILL.md + scripts/), reviewed as code.\n' +
    'Skills from the Tracy registry are not vendored here — they are pinned in\n' +
    '`AgentSetting/skills.json`.\n'

  // Untouched: withdrawn, and the new directory arrives in the same run.
  const untouched = await mkdtemp(path.join(SCRATCH, 'site-moved-'))
  await mkdir(path.join(untouched, '.claude/skills'), { recursive: true })
  await writeFile(path.join(untouched, '.claude/skills/README.md'), shipped, 'utf8')
  const first = await ensureSiteFolder(untouched, SITE, 'joomla')
  assert.ok(first.retired.includes('.claude/skills/README.md'), 'an untouched copy was not withdrawn')
  assert.equal(await exists(path.join(untouched, '.claude/skills/README.md')), false)
  assert.equal(await exists(path.join(untouched, '.agents/skills/README.md')), true)

  // Edited by a person: kept, every word of it.
  const edited = await mkdtemp(path.join(SCRATCH, 'site-moved-'))
  await mkdir(path.join(edited, '.claude/skills'), { recursive: true })
  const theirs = `${shipped}\nOur own note: the pricing skill lives here.\n`
  await writeFile(path.join(edited, '.claude/skills/README.md'), theirs, 'utf8')
  const second = await ensureSiteFolder(edited, SITE, 'joomla')
  assert.equal(second.retired.length, 0, 'an edited copy was withdrawn')
  assert.equal(await readFile(path.join(edited, '.claude/skills/README.md'), 'utf8'), theirs)

  // Absent: nothing to do, and no error.
  const clean = await mkdtemp(path.join(SCRATCH, 'site-moved-'))
  const third = await ensureSiteFolder(clean, SITE, 'joomla')
  assert.deepEqual(third.retired, [])
})

/**
 * 🔒 THE FOLDER MUST NAME THE ADDRESS, BECAUSE THE AGENT READS THE FOLDER. Until 19/09/2026
 * `.tracy/site.json` carried `siteKey` and `platform`, and `AGENTS.md` named an address only for an
 * imported copy. Every fleet-born site therefore left the agent to invent one, and it invented
 * `https://<siteKey>/`. Measured on `demoemdasbh.tracy.test`: the customer clicked exactly the link the agent gave and got
 * `ERR_CONNECTION_REFUSED`, while the site answered 200 at `http://demoemdasbh.tracy.test:51710/` — the
 * address was in the seat book and in `provision.sh`'s `SITE_URL` the whole time.
 */
test('the site folder records the address it was given, scheme and port included', () => {
  const at = 'http://demoemdasbh.tracy.test:51710/'
  const files = skeletonFiles('demoemdasbh.tracy.test', 'emdash', { address: at })
  assert.equal(JSON.parse(files.get('.tracy/site.json')).address, at)
  const md = files.get('AGENTS.md')
  assert.ok(md.includes(at), 'AGENTS.md does not name the address the agent is meant to hand out')
  // The port is the whole point: a reader that keeps only the hostname is back where it started.
  assert.match(md, /scheme and the port are part of it/)
})

test('a bare hostname is refused, not dressed up as an address', () => {
  // ⚠ Prefixing `https://` would produce a plausible address that is wrong on every surface whose
  // public port is not 443 — which is the failure being fixed, re-introduced with more confidence.
  for (const bad of ['demoemdasbh.tracy.test', '', null, undefined, 'ftp://x.test', 'not a url']) {
    const files = skeletonFiles('demoemdasbh.tracy.test', 'emdash', { address: bad })
    const identity = JSON.parse(files.get('.tracy/site.json'))
    assert.equal(identity.address, undefined, `wrote an address for ${JSON.stringify(bad)}`)
    assert.equal(identity.siteKey, 'demoemdasbh.tracy.test', 'the hostname itself is still recorded')
    assert.doesNotMatch(files.get('AGENTS.md'), /People open this site at/)
  }
})

test('an imported copy keeps its own origin marker alongside the address', () => {
  const files = skeletonFiles('fijitrips.example', 'joomla', {
    origin: 'imported',
    copyAddress: 'https://copy.tracy.ai/',
    address: 'https://copy.tracy.ai/'
  })
  const identity = JSON.parse(files.get('.tracy/site.json'))
  assert.equal(identity.origin, 'imported')
  assert.equal(identity.address, 'https://copy.tracy.ai/')
})

/* ─────────────────────────────── sealed sites (PLAN v2 P6) ─────────────────────────────── */

const flat = (md) => md.replace(/\s+/g, ' ')

/** The start-from paragraph as Tracy last shipped it (07/09–25/09), byte for byte. */
const START_FROM_SHIPPED =
  'If `docs/agents/start-from.json` exists, the customer started this site from a site they like\n' +
  '(*Fork a site from any URL*): it names the URL and the design inspiration, `brand:<host>`, already\n' +
  "extracted under `Brand/<host>/` with its page list. Rebuild that look with the customer's own\n" +
  "words and pictures — never copy the source site's sentences or logo. The design skill's step 0\n" +
  'says how.'

/**
 * Its first wording, 06/09 17:24 (86a400bee) to 07/09 09:09 (dfb4ef67d): "design direction". Missed
 * by a history walk that skipped merges (review, 25/09); found by rendering every commit of
 * `git log -m --all` on both paths the file has lived at.
 */
// One word swapped rather than written out: the old name is banned vocabulary (see the same constant
// in `siteFolder.mjs`). The frozen 06/09 fixture below is what proves these are the shipped bytes.
const START_FROM_UNTIL_07_09 = START_FROM_SHIPPED.replace('inspiration,', 'direction,')

/**
 * An AGENTS.md exactly as `siteFolder.mjs` at 86a400bee rendered it (blob 2b536075e, the same bytes
 * db223ade0 took to `scripts/provision/`) for `site0609.tracy.test` — FROZEN, rendered once from
 * that commit, never derived. It predates the address, the fence and every platform brief, and it
 * still carries the question-panel section ec090a5c1 dropped from new files on 07/09.
 *
 * @param {'joomla'|'wordpress'} platform
 */
function shippedOn0609(platform) {
  const text = readFileSync(new URL(`./fixtures/agents-md-86a400bee/${platform}.md`, import.meta.url), 'utf8')
  return { text, siteKey: 'site0609.tracy.test', address: 'http://site0609.tracy.test:51710' }
}

/** The question-panel section the 06/09 files carry, byte for byte (see `shippedOn0609`). */
const QUESTION_PANEL_UNTIL_07_09 =
  '## Ask in the chat, never with a question panel\n\n' +
  'Do not call `ask_user_question`. When you need a decision, write the question as an ordinary\n' +
  'message and stop there; the next message you receive is the answer.\n\n' +
  'A question panel belongs to the one browser connection that received it, and nothing writes it\n' +
  'into the session. Whoever opens this site from a second tab, or simply reloads, gets a page with\n' +
  'no panel on it — and the turn that is waiting on that panel cannot be answered by anyone, ever.\n' +
  'An ordinary message costs one extra round trip and can always be answered.'

/**
 * An AGENTS.md exactly as Tracy wrote it before the sealed briefs — FROZEN, never derived.
 *
 * 🔒 A LITERAL, NOT `agentsMd()` WITH A PARAGRAPH PUT BACK. A fixture built from today's code moves
 * with today's code: reword `WEBROOT_FLEET_BORN` or an open brief by accident and the "old" file
 * changes with it, every top-up test stays green, and the real files on the fleet stop being
 * recognised — the webroot paragraph "left alone", a sealed site still told "An edit there is live".
 * These three are the stand's own files, copied with a read-only `cat` from benchjoomla01,
 * benchwp01 and benchemdash01 on 25/09, and byte-identical to what `siteFolder.mjs` at dcca58bd1
 * (the last commit before this change) renders from those sites' `.tracy/site.json`. Never
 * regenerate them: a file on the fleet does not change when this code does.
 *
 * @param {'joomla'|'wordpress'|'emdash'} platform
 * @returns {{ text: string, siteKey: string, address: string }}
 */
function shippedBefore(platform) {
  const label = { joomla: 'benchjoomla01', wordpress: 'benchwp01', emdash: 'benchemdash01' }[platform]
  const text = readFileSync(new URL(`./fixtures/agents-md-dcca58bd1/${label}.md`, import.meta.url), 'utf8')
  const siteKey = `${label}.tracy.test`
  return { text, siteKey, address: `http://${siteKey}:51710` }
}

/** A sites root with one site folder; `marker` true writes that site's content-contract marker. */
async function sitesRootWith(label, { marker = false } = {}) {
  const root = await mkdtemp(path.join(SCRATCH, 'sites-root-'))
  await mkdir(path.join(root, label), { recursive: true })
  if (marker) {
    await mkdir(path.join(root, '.content-contracts'), { recursive: true })
    await writeFile(
      path.join(root, '.content-contracts', `${label}.json`),
      '{"contract":"tracy-business/j6/1.2.0","policy":1}\n',
      'utf8'
    )
  }
  return { root, folder: path.join(root, label) }
}

// ADR 0022 (26/09/2026): a quickstart site locks nothing but a direct database write — measured
// 26/09 in round 4, the old "Locked on this sealed quickstart" line alone made a Joomla agent refuse
// layout work no fence refused. Its brief is the open one.
//
// 🔒 AND IT DOES NOT REPEAT THE CONTRACT LINE THE SITE CONTEXT SENDS EVERY TURN (bench flow D,
// 05/10/2026). The quickstart recommendation — the contract maps the words to slots through the content
// door, everything else changes the usual way, never the database, keep the design and the 0.75×–1.25×
// length — is the site context's `Content contract (…)` line, sent on every turn of every site that has
// a contract (`site-context.mjs`), and the same words then stood a second time in this file: the length
// band appeared three times in one step-1 prompt. Only the fact the context does not state stays.
test('a Joomla quickstart site gets the open brief, without the contract line the site context sends', () => {
  const text = flat(agentsMd('benchjoomla01.tracy.test', 'joomla', { sealed: true }))
  assert.match(text, /An edit there is live/)
  assert.doesNotMatch(text, /content contract|\*\*slots\*\*|0\.75×|Never write the database directly/)
  assert.equal(
    agentsMd('benchjoomla01.tracy.test', 'joomla', { sealed: true }),
    agentsMd('benchjoomla01.tracy.test', 'joomla')
  )
  // The open brief: overrides, the header brand, the cache.
  assert.match(text, /siteTitle/)
  assert.doesNotMatch(text, /sealed|[Ll]ocked|closed to you/)
  // Model-facing text says "component", never "Claude Cowork plugin" (vocabulary.md §5).
  assert.doesNotMatch(text, /cowork/i)
})

test('a WordPress quickstart site keeps options, template parts and the open WordPress advice', () => {
  const text = flat(agentsMd('benchwp01.tracy.test', 'wordpress', { sealed: true }))
  assert.match(text, /An edit there is live/)
  assert.match(text, /## What WordPress keeps where/)
  assert.match(text, /\*\*This site was built from a quickstart\.\*\*/)
  assert.match(text, /The header and footer are \*\*template parts\*\* that every page shares/)
  assert.match(text, /`blogname` and `blogdescription` options/)
  assert.match(text, /child theme/)
  assert.doesNotMatch(text, /sealed|[Ll]ocked/)
  assert.doesNotMatch(text, /content contract|\*\*slots\*\*|0\.75×|Never write the database directly/)
})

test('"the header and footer are template parts" holds on every WordPress profile the repo seals', () => {
  // ⚠ The sealed WordPress brief states a THEME KIND flat, while every other sentence in it names no
  // template (see `SEALED_BRIEFS`). It is true because each sealed profile names a block theme, and
  // the seal locks the theme. This test is what keeps it true: a sealed classic theme turns it red,
  // and that profile then needs the sentence qualified — not this test loosened.
  // The profiles are the ones `apps/tracy-web/src/lib/contracts.js` reads in the repo; the themes
  // are the sources `tracy-wordpress-theme` builds.
  const contracts = new URL('../../../cms/tracy-wordpress-quickstart/contracts/', import.meta.url)
  const themes = new URL('../../../cms/tracy-wordpress-theme/src/', import.meta.url)
  const manifests = readdirSync(contracts, { recursive: true })
    .map(String)
    .filter((entry) => path.basename(entry) === 'manifest.json')
    .map((entry) => JSON.parse(readFileSync(new URL(entry, contracts), 'utf8')))
    .filter((manifest) => manifest.platform === 'wordpress')
  // 🔒 A walk that finds nothing passes; three profiles are sealed today (tracy-base 1.0.0,
  // tracy-business 1.0.0 and 1.1.0). Removing one lowers this in the same commit.
  assert.ok(manifests.length >= 3, `found ${manifests.length} WordPress contract profiles`)
  for (const manifest of manifests) {
    const theme = String(manifest.theme ?? '')
    assert.notEqual(theme, '', `${manifest.id}: names its theme`)
    for (const file of ['templates/index.html', 'parts/header.html', 'parts/footer.html']) {
      assert.ok(
        existsSync(new URL(`${theme}/${file}`, themes)),
        `${manifest.id}: theme ${theme} has ${file} — a block theme`
      )
    }
  }
  assert.match(
    flat(agentsMd(SITE, 'wordpress', { sealed: true })),
    /The header and footer are \*\*template parts\*\* that every page shares/
  )
})

test('quickstart briefs name places, never calls, and never a template, version or language', () => {
  // Same rule as the open briefs (`platformBrief`'s header): this file outlives every release, so a
  // tool name, an action or a parameter would become a lie nobody can correct.
  for (const platform of ['joomla', 'wordpress']) {
    const text = flat(agentsMd('demo.tracy.test', platform, { sealed: true }))
    assert.doesNotMatch(
      text,
      /tracy_site|tracy_emdash|content\.contract|content\.update|content\.list|inspect|apply_id|request_id/,
      platform
    )
    assert.doesNotMatch(text, /tracy-business|tracy_business|1\.[0-9]\.[0-9]|en-GB|Northgate/, platform)
  }
})

test('a contract changes only the brief of its platforms: an open site and an EmDash site read as before', () => {
  for (const platform of ['joomla', 'wordpress']) {
    assert.equal(agentsMd(SITE, platform, { sealed: false }), agentsMd(SITE, platform), platform)
    assert.match(agentsMd(SITE, platform), /An edit there is live/, platform)
  }
  // EmDash has no content contract; a marker would not make its data directory a document root.
  assert.equal(agentsMd(SITE, 'emdash', { sealed: true }), agentsMd(SITE, 'emdash'))
  // An unknown platform on a quickstart site: the open webroot sentence, and no brief to add to.
  const unknown = agentsMd(SITE, null, { sealed: true })
  assert.match(unknown, /An edit there is live/)
  assert.doesNotMatch(unknown, /keeps where/)
})

test('an imported copy keeps its own paragraph even when sealed — "serving visitors" is false for a copy', () => {
  // fijitrips, 14/09: that paragraph is what keeps the agent off the customer's own server.
  const md = agentsMd('fijitrips.example', 'joomla', { origin: 'imported', sealed: true })
  assert.match(md, /\*\*Tracy's copy\*\*/)
  assert.match(md, /[Nn]ever change the live site/)
  assert.doesNotMatch(md, /is the site that is actually serving visitors/)
  // The brief is the quickstart one, which leaves the contract line to the site context.
  assert.match(md, /## What Joomla keeps where/)
  assert.doesNotMatch(flat(md), /\*\*slots\*\*|0\.75×/)
})

test('the EmDash brief says where the words live, names no road to them, and promises no taxonomy labels', () => {
  // 🔒 Measured in bench r2 (V3): 40 calls into `/app`, 17 steps doing nothing else, looking for
  // page words; and taxonomy term labels cannot be changed per language through EmDash's own tools.
  const text = flat(agentsMd('demo.tracy.test', 'emdash', {}))
  assert.match(
    text,
    /\*\*The words a visitor reads live in EmDash's content\*\* — its entries, menus and settings — not in `\/app`/
  )
  assert.match(text, /They change as records in that content, never by writing to the database file\./)
  assert.doesNotMatch(text, /taxonomy labels/i)
  // 🔒 A PLACE, NEVER A ROAD. The first draft said the words change "through EmDash's own tools" and
  // that "the Joomla/WordPress content door does not reach this platform" — while the same PR opens
  // `tracy_site content.replace` on EmDash pages. This file is read before the first call, so a road
  // named here contradicts the tool description on the most common request. The whole fenced
  // section is checked, since the top-up replaces it outright on every existing site.
  const section = flat(platformBrief('emdash'))
  assert.doesNotMatch(
    section,
    /\btools?\b|\bdoors?\b|tracy_|content\.replace|content_update|Joomla\/WordPress/,
    'the EmDash brief names no tool and no door'
  )
  // The `/app` sentence stays for what it is really for: views, styles, and a rebuild.
  assert.match(text, /The application under `\/app` is this site's own copy/)
  assert.match(text, /views, components, configuration and styles/)
  assert.match(text, /rebuild and a restart/)
  assert.ok(
    text.indexOf("live in EmDash's content") < text.indexOf('The application under `/app`'),
    'where the words ARE comes before what /app is for'
  )
})

test('contractSealed reads the marker with the fence’s own rule, on every fixture', async () => {
  // 🔒 PARITY. `ensure-site-folder.mjs` re-states the rule (the tracy-host image ships `scripts/`
  // alone, so it cannot import `packages/tools/`); this test is what keeps the copy honest. The
  // fence's answer is taken the way `site-context.mjs` takes it: a throw means sealed.
  const { contractSealed } = await import('../scripts/provision/ensure-site-folder.mjs')
  const { hasContentContract } = await import(
    '../../../tools/tracy-subprocess-docker/src/content-contract.mjs'
  )
  const fence = (root, label) => {
    try {
      return hasContentContract(path.join(root, label), root)
    } catch {
      return true
    }
  }

  const sealedSite = await sitesRootWith('site-sealed', { marker: true })
  const openSite = await sitesRootWith('site-open')
  // Marker as a directory: the fence stats, never parses, so this is sealed on both sides.
  const dirMarker = await sitesRootWith('site-dirmarker')
  await mkdir(path.join(dirMarker.root, '.content-contracts', 'site-dirmarker.json'), { recursive: true })
  // `.content-contracts` a regular file → ENOTDIR: the fence fails closed.
  const notDir = await sitesRootWith('site-notdir')
  await writeFile(path.join(notDir.root, '.content-contracts'), 'not a directory', 'utf8')
  // Another site's marker seals only that site.
  const neighbour = await sitesRootWith('site-a', { marker: true })
  await mkdir(path.join(neighbour.root, 'site-b'), { recursive: true })

  const cases = [
    [sealedSite.root, 'site-sealed', true],
    [openSite.root, 'site-open', false],
    [dirMarker.root, 'site-dirmarker', true],
    [notDir.root, 'site-notdir', true],
    [neighbour.root, 'site-a', true],
    [neighbour.root, 'site-b', false]
  ]
  for (const [root, label, want] of cases) {
    const folder = path.join(root, label)
    assert.equal(contractSealed(folder), want, `${label}: contractSealed`)
    assert.equal(fence(root, label), want, `${label}: the fence`)
    // A trailing slash is the same folder.
    assert.equal(contractSealed(`${folder}/`), want, `${label}: trailing slash`)
  }

  // An unreadable marker directory → EACCES → sealed on both sides. Root reads through a 000
  // directory, so the case only means something for an ordinary user.
  if (typeof process.getuid === 'function' && process.getuid() !== 0) {
    const { chmod } = await import('node:fs/promises')
    const locked = await sitesRootWith('site-locked', { marker: true })
    await chmod(path.join(locked.root, '.content-contracts'), 0o000)
    try {
      assert.equal(contractSealed(locked.folder), true, 'EACCES: contractSealed')
      assert.equal(fence(locked.root, 'site-locked'), true, 'EACCES: the fence')
    } finally {
      await chmod(path.join(locked.root, '.content-contracts'), 0o755)
    }
  }
})

test('ensureSiteFolder writes a new sealed site sealed on its first run', async () => {
  // provision.sh writes the marker in `platform_post_up`, before this script runs.
  const joomla = await sitesRootWith('j-sealed', { marker: true })
  await ensureSiteFolder(joomla.folder, 'j-sealed.tracy.test', 'joomla')
  const md = await readFile(path.join(joomla.folder, 'AGENTS.md'), 'utf8')
  assert.equal(md, agentsMd('j-sealed.tracy.test', 'joomla', { sealed: true }))

  const open = await sitesRootWith('j-open')
  await ensureSiteFolder(open.folder, 'j-open.tracy.test', 'joomla')
  assert.equal(
    await readFile(path.join(open.folder, 'AGENTS.md'), 'utf8'),
    agentsMd('j-open.tracy.test', 'joomla')
  )
  // The seal is not copied into the identity file: the marker stays the one truth.
  const identity = JSON.parse(await readFile(path.join(joomla.folder, '.tracy/site.json'), 'utf8'))
  assert.equal(identity.sealed, undefined)
})

test('the frozen files are what the fleet holds: the open paragraph, the old briefs, the start-from paragraph', () => {
  // A guard on the fixtures themselves: if one of these fails, the file was edited — put the stand's
  // bytes back rather than changing the assertion.
  for (const platform of ['joomla', 'wordpress', 'emdash']) {
    const { text, siteKey, address } = shippedBefore(platform)
    assert.ok(text.includes(START_FROM_SHIPPED), `${platform}: carries the shipped start-from paragraph`)
    assert.ok(text.startsWith(`# Site agent — ${siteKey}\n`), platform)
    assert.ok(text.includes(`People open this site at ${address} `), platform)
    assert.ok(text.includes('<!-- tracy:platform v1 -->'), `${platform}: from after the fence`)
  }
  assert.match(shippedBefore('joomla').text, /An edit there is live/)
  assert.match(shippedBefore('wordpress').text, /An edit there is live/)
  assert.match(shippedBefore('emdash').text, /is not a document root/)

  // The 06/09 renders: the first start-from wording, the question-panel section, the old promise,
  // and nothing the later code added (no address, no fence).
  assert.notEqual(START_FROM_UNTIL_07_09, START_FROM_SHIPPED)
  for (const platform of ['joomla', 'wordpress']) {
    const { text, siteKey } = shippedOn0609(platform)
    assert.ok(text.startsWith(`# Site agent — ${siteKey}\n`), platform)
    assert.ok(text.includes(`${START_FROM_UNTIL_07_09}\n\n`), `${platform}: the 06/09 start-from wording`)
    assert.ok(!text.includes(START_FROM_SHIPPED), platform)
    assert.ok(text.includes(`${QUESTION_PANEL_UNTIL_07_09}\n\n`), `${platform}: the question-panel section`)
    assert.ok(
      text.includes('\n_Tracy wrote this file when the lane was built, and will not touch it again._\n')
    )
    assert.match(text, /An edit there is live/, platform)
    assert.doesNotMatch(text, /People open this site at|tracy:platform/, platform)
  }
})

test('topUpAgentsMd: the start-from paragraph goes in either wording Tracy shipped, byte for byte', async () => {
  // ⚠ The first measurement found one wording and missed the 06/09 one, shipped by a merge (review,
  // 25/09): a site born in that window kept the paragraph and the run said "not the one Tracy
  // shipped". Here the frozen fleet file carries each wording in turn; everything else is its own.
  const { topUpAgentsMd } = await import('../scripts/provision/siteFolder.mjs')
  for (const wording of [START_FROM_SHIPPED, START_FROM_UNTIL_07_09]) {
    for (const platform of ['joomla', 'wordpress']) {
      const { text, siteKey, address } = shippedBefore(platform)
      const old = text.replace(START_FROM_SHIPPED, () => wording)
      assert.ok(old.includes(`${wording}\n\n`))
      const result = topUpAgentsMd(old, siteKey, platform, { address, sealed: true })
      assert.ok(result.notes.includes('start-from paragraph removed'), result.notes.join(' | '))
      assert.equal(result.text, agentsMd(siteKey, platform, { address, sealed: true }), platform)
      assert.equal(topUpAgentsMd(result.text, siteKey, platform, { address, sealed: true }).changed, false)
    }
  }
})

test('topUpAgentsMd: a file Tracy wrote on 06/09 loses its start-from paragraph and its old promise', async () => {
  // The real 06/09 file (`shippedOn0609`), not a fleet file with one word swapped. Byte for byte it
  // converges on today's file but for one section this top-up does not own: the question-panel
  // section that version also carried (02/09–07/09; ec090a5c1 dropped it from new files), which
  // stays, and the blank line the brief's insertion leaves above it — both raised in the P6 note,
  // not handled here. Pinned exactly, so taking either on later turns this red on purpose.
  const { topUpAgentsMd, PLATFORM_MARKER_END } = await import('../scripts/provision/siteFolder.mjs')
  for (const platform of ['joomla', 'wordpress']) {
    for (const sealed of [true, false]) {
      const { text: old, siteKey, address } = shippedOn0609(platform)
      const result = topUpAgentsMd(old, siteKey, platform, { address, sealed })
      assert.deepEqual(
        result.notes,
        [
          'address added',
          'start-from paragraph removed',
          'closing note corrected',
          'platform brief added',
          'hint block emptied'
        ],
        `${platform} sealed=${sealed}`
      )
      assert.doesNotMatch(result.text, /start-from\.json|will not touch it again/)
      const fresh = agentsMd(siteKey, platform, { address, sealed })
      const withPanel = fresh.replace(
        `${PLATFORM_MARKER_END}\n\n`,
        () => `${PLATFORM_MARKER_END}\n\n\n${QUESTION_PANEL_UNTIL_07_09}\n\n`
      )
      assert.notEqual(withPanel, fresh)
      assert.equal(result.text, withPanel, `${platform} sealed=${sealed}`)
      // ADR 0022: a quickstart site's `.webroot/` is as open as any other.
      assert.match(result.text, /An edit there is live/)
      assert.equal(topUpAgentsMd(result.text, siteKey, platform, { address, sealed }).changed, false)
    }
  }
})

test('the closing note says what Tracy still changes, and the old promise is corrected only while unedited', async () => {
  // ⚠ "will not touch it again" was false once the fence existed (17/09) and plainly false once the
  // top-up rewrote paragraphs outside it; "the lane" is pre-ADR-0014 wording (review, 25/09).
  const { topUpAgentsMd } = await import('../scripts/provision/siteFolder.mjs')
  for (const platform of ['joomla', 'wordpress', 'emdash', null]) {
    const md = agentsMd(SITE, platform)
    assert.match(
      md,
      /\n_Tracy updates only its `tracy:platform` part and any paragraph of its own that nobody has edited\._\n/,
      String(platform)
    )
    assert.doesNotMatch(md, /will not touch it again|the lane/, String(platform))
  }
  // A closing note the team rewrote is theirs.
  const { text, siteKey, address } = shippedBefore('joomla')
  const theirs = text.replace('and will not touch it again._', 'and Lan reviews every change._')
  assert.notEqual(theirs, text)
  const result = topUpAgentsMd(theirs, siteKey, 'joomla', { address })
  assert.match(result.text, /and Lan reviews every change\._/)
  assert.ok(!result.notes.includes('closing note corrected'))
})

test('topUpAgentsMd: a frozen fleet file on a quickstart site becomes the fresh quickstart file, byte for byte', async () => {
  const { topUpAgentsMd } = await import('../scripts/provision/siteFolder.mjs')
  for (const platform of ['joomla', 'wordpress']) {
    const { text: old, siteKey, address } = shippedBefore(platform)
    const result = topUpAgentsMd(old, siteKey, platform, { address, sealed: true })
    assert.deepEqual(
      result.notes,
      [
        'start-from paragraph removed',
        'closing note corrected',
        'platform brief refreshed',
        'hint block emptied'
      ],
      platform
    )
    assert.equal(result.text, agentsMd(siteKey, platform, { address, sealed: true }), platform)
    assert.match(result.text, /An edit there is live/, platform)
    assert.doesNotMatch(flat(result.text), /\*\*slots\*\*|0\.75×|About this site/, platform)
    // 🔒 IDEMPOTENT: a lane is rebuilt far more often than a site is created.
    const again = topUpAgentsMd(result.text, siteKey, platform, { address, sealed: true })
    assert.equal(again.changed, false, platform)
  }
})

test('topUpAgentsMd: a frozen open fleet file loses only the start-from paragraph and the old promise', async () => {
  const { topUpAgentsMd } = await import('../scripts/provision/siteFolder.mjs')
  for (const platform of ['joomla', 'wordpress']) {
    const { text: old, siteKey, address } = shippedBefore(platform)
    const result = topUpAgentsMd(old, siteKey, platform, { address })
    // The Joomla brief gained its scss paragraph on 27/09/2026 (tools/t4-scss.php) and the WordPress
    // brief its look paragraph on 29/09/2026 (fix G), so a file shipped at dcca58bd1 has both briefs
    // refreshed.
    assert.deepEqual(
      result.notes,
      [
        'start-from paragraph removed',
        'closing note corrected',
        'platform brief refreshed',
        'hint block emptied'
      ],
      platform
    )
    assert.equal(result.text, agentsMd(siteKey, platform, { address }), platform)
    assert.equal(topUpAgentsMd(result.text, siteKey, platform, { address }).changed, false, platform)
  }
})

test('topUpAgentsMd: a frozen EmDash fleet file gets the new brief and loses the start-from paragraph', async () => {
  const { topUpAgentsMd } = await import('../scripts/provision/siteFolder.mjs')
  const { text: old, siteKey, address } = shippedBefore('emdash')
  const fresh = agentsMd(siteKey, 'emdash', { address })
  // EmDash has no seal; a marker changes nothing (see `platformBrief`).
  for (const sealed of [false, true]) {
    const result = topUpAgentsMd(old, siteKey, 'emdash', { address, sealed })
    assert.deepEqual(result.notes, [
      'start-from paragraph removed',
      'closing note corrected',
      'platform brief refreshed',
      'hint block emptied'
    ])
    assert.equal(result.text, fresh)
    assert.doesNotMatch(result.text, /taxonomy labels|EmDash's own tools|content door/)
    assert.equal(topUpAgentsMd(result.text, siteKey, 'emdash', { address, sealed }).changed, false)
  }
})

test('topUpAgentsMd: a start-from paragraph the team edited is left, and the run says so', async () => {
  const { topUpAgentsMd } = await import('../scripts/provision/siteFolder.mjs')
  const { text, siteKey, address } = shippedBefore('joomla')
  const theirs = text.replace("The design skill's step 0\nsays how.", 'Ask Lan before reusing any of it.')
  assert.notEqual(theirs, text)
  const result = topUpAgentsMd(theirs, siteKey, 'joomla', { address, sealed: true })
  assert.match(result.text, /Ask Lan before reusing any of it\./)
  assert.match(result.text, /docs\/agents\/start-from\.json/)
  assert.ok(result.notes.includes('start-from paragraph left alone — it is not the one Tracy shipped'))
  // The rest of Tracy's own text still moves: the brief was untouched, so it is refreshed.
  assert.ok(result.notes.includes('platform brief refreshed'), result.notes.join(' | '))
  const fence = (md) =>
    md.slice(md.indexOf('<!-- tracy:platform v1 -->'), md.indexOf('<!-- /tracy:platform -->'))
  assert.equal(fence(result.text), fence(agentsMd(siteKey, 'joomla', { address, sealed: true })))
})

test('topUpAgentsMd: a webroot paragraph the team rewrote stays theirs on a sealed site', async () => {
  const { topUpAgentsMd } = await import('../scripts/provision/siteFolder.mjs')
  const { text, siteKey, address } = shippedBefore('wordpress')
  const theirs = text.replace(
    /`\.webroot\/` is the site[\s\S]*?nothing on the website\./,
    'Our own note about where this site lives.'
  )
  assert.notEqual(theirs, text)
  const result = topUpAgentsMd(theirs, siteKey, 'wordpress', { address, sealed: true })
  assert.match(result.text, /Our own note about where this site lives\./)
  assert.doesNotMatch(result.text, /On this sealed quickstart/)
  assert.match(result.notes[0], /webroot paragraph left alone/)
  // The fence is Tracy's by declaration: the brief still becomes the quickstart one.
  assert.match(flat(result.text), /\*\*This site was built from a quickstart\.\*\*/)
})

test('topUpAgentsMd: a lifted contract gives the open brief back', async () => {
  const { topUpAgentsMd } = await import('../scripts/provision/siteFolder.mjs')
  // WordPress: the one platform whose quickstart brief still differs from its open one (template parts).
  const quickstart = agentsMd(SITE, 'wordpress', { sealed: true })
  const result = topUpAgentsMd(quickstart, SITE, 'wordpress', { sealed: false })
  assert.deepEqual(result.notes, ['platform brief refreshed'])
  assert.equal(result.text, agentsMd(SITE, 'wordpress'))
})

// ADR 0022 (26/09/2026): a site provisioned 12/09–26/09 carries the "sealed" paragraph and brief.
// dsh sends this file every step, so the top-up takes both back to the open paragraph and the
// quickstart brief — on the next provision run, without touching anything the team wrote.
test('topUpAgentsMd: the sealed paragraph shipped until 26/09 is corrected on a quickstart site', async () => {
  const { topUpAgentsMd } = await import('../scripts/provision/siteFolder.mjs')
  const sealedUntil2609 =
    '`.webroot/` is the site that is actually serving visitors. On this sealed quickstart it changes\n' +
    'only through its content door, never by editing files, and every file outside `docs/agents/` is\n' +
    'closed to you, reading included.'
  const fresh = agentsMd(SITE, 'joomla', { sealed: true })
  const old = fresh.replace(
    /`\.webroot\/` is the site that is actually serving visitors, not a copy[\s\S]*?on the website\./,
    sealedUntil2609
  )
  assert.ok(old.includes(sealedUntil2609))
  const result = topUpAgentsMd(old, SITE, 'joomla', { sealed: true })
  assert.deepEqual(result.notes, ['webroot paragraph corrected'])
  assert.equal(result.text, fresh)
})

test('topUpAgentsMd: the EmDash paragraph shipped 17/09–20/09 is corrected too', async () => {
  // "This site has no `.webroot/`" denied a directory that exists (see `WEBROOT_NONE`), and the old
  // top-up compared only against today's paragraphs, so those sites kept it.
  const { topUpAgentsMd } = await import('../scripts/provision/siteFolder.mjs')
  const shipped1709 =
    'This site has no `.webroot/`. Its content is the database and uploads directory in this folder,\n' +
    "served by the site's own container — so there is no document root to edit and no file under one that\n" +
    "changes what a visitor sees. Everything else in this folder is the team's repository: committing\n" +
    'there changes nothing on the website.'
  const fresh = agentsMd(SITE, 'emdash')
  const old = fresh.replace(
    /This site's `\.webroot\/` is not a document root[\s\S]*?on the website\./,
    shipped1709
  )
  assert.ok(old.includes(shipped1709))
  const result = topUpAgentsMd(old, SITE, 'emdash', {})
  assert.deepEqual(result.notes, ['webroot paragraph corrected'])
  assert.equal(result.text, fresh)
})

test('ensureSiteFolder tops up an existing site once its marker is there, and leaves a team file alone', async () => {
  const { text, siteKey, address } = shippedBefore('wordpress')
  const site = await sitesRootWith('benchwp01')
  await writeFile(path.join(site.folder, 'AGENTS.md'), text, 'utf8')
  // The seal arrives (a re-provision on the quickstart road writes the marker).
  await mkdir(path.join(site.root, '.content-contracts'), { recursive: true })
  await writeFile(path.join(site.root, '.content-contracts', 'benchwp01.json'), '{"policy":1}\n', 'utf8')
  const run = await ensureSiteFolder(site.folder, siteKey, 'wordpress', null, { address })
  assert.ok(
    run.toppedUp.some(
      (line) => line.startsWith('AGENTS.md (') && line.includes('start-from paragraph removed')
    ),
    run.toppedUp.join(' | ')
  )
  assert.equal(
    await readFile(path.join(site.folder, 'AGENTS.md'), 'utf8'),
    agentsMd(siteKey, 'wordpress', { address, sealed: true })
  )

  const team = await sitesRootWith('wp-team', { marker: true })
  await writeFile(path.join(team.folder, 'AGENTS.md'), '# ours now\n', 'utf8')
  const kept = await ensureSiteFolder(team.folder, 'wp-team.tracy.test', 'wordpress')
  assert.ok(kept.kept.includes('AGENTS.md'))
  assert.equal(await readFile(path.join(team.folder, 'AGENTS.md'), 'utf8'), '# ours now\n')
})

// 27/09/2026: the stock joomla image has no node and no sass, and T4 compiles scss only through a
// development plugin the quickstarts do not ship — so a Joomla site folder carries the compiler.
test('a Joomla site folder carries tools/t4-scss.php and scssphp; WordPress does not; a second run keeps them', async () => {
  const { ensureJoomlaTools, SCSSPHP_VERSION, scssphpSource } = await import(
    '../scripts/provision/ensure-site-folder.mjs'
  )
  assert.ok(await scssphpSource(), 'the checkout has vendor/php/scssphp/src')
  const folder = await mkdtemp(path.join(SCRATCH, 'tracy-joomla-tools-'))
  const first = await ensureSiteFolder(folder, 'lantern.localhost', 'joomla')
  assert.ok(first.written.includes('tools/t4-scss.php'), first.written.join(', '))
  assert.ok(
    first.written.some((w) => w.startsWith('tools/scssphp')),
    first.written.join(', ')
  )
  assert.ok(existsSync(path.join(folder, 'tools', 'scssphp', 'Compiler.php')))
  assert.equal(
    (await readFile(path.join(folder, 'tools', 'scssphp', '.tracy-version'), 'utf8')).trim(),
    SCSSPHP_VERSION
  )
  assert.match(await readFile(path.join(folder, 'AGENTS.md'), 'utf8'), /php tools\/t4-scss\.php/)
  const second = await ensureJoomlaTools(folder)
  assert.deepEqual(second, { written: [], kept: ['tools/t4-scss.php', 'tools/scssphp'] })
  const wp = await mkdtemp(path.join(SCRATCH, 'tracy-wp-tools-'))
  const w = await ensureSiteFolder(wp, 'lantern.localhost', 'wordpress')
  assert.ok(!w.written.some((x) => x.startsWith('tools/')), 'WordPress has no scss tool')
  assert.doesNotMatch(await readFile(path.join(wp, 'AGENTS.md'), 'utf8'), /t4-scss/)
})

test('scssphp lookup matches the tracy-host Dockerfile: COPY of scripts/ and of vendor/php/scssphp/src', async () => {
  const { scssphpCandidates } = await import('../scripts/provision/ensure-site-folder.mjs')
  const dockerfile = await readFile(
    new URL('../../../../apps/tracy-host/Dockerfile', import.meta.url),
    'utf8'
  )
  const dest = (source) => {
    const m = dockerfile.match(new RegExp(`^COPY ${source.replace(/[/.]/g, '\\$&')} (\\S+)$`, 'm'))
    assert.ok(m, `Dockerfile has no COPY of ${source}`)
    return m[1]
  }
  const scripts = dest('packages/fleet/tracy-fleet-operation/scripts')
  const scssphp = dest('vendor/php/scssphp/src')
  assert.ok(
    scssphpCandidates(path.join(scripts, 'provision')).includes(scssphp),
    `from ${scripts}/provision the candidates ${scssphpCandidates(path.join(scripts, 'provision')).join(', ')} miss ${scssphp}`
  )
})

test('t4-scss.php is valid PHP (php -l when a php is on this machine; said when it is not)', async () => {
  const { execFileSync } = await import('node:child_process')
  const file = path.resolve('packages/fleet/tracy-fleet-operation/scripts/provision/php/t4-scss.php')
  let php = null
  try {
    php = execFileSync('sh', ['-c', 'command -v php'], { encoding: 'utf8' }).trim() || null
  } catch {
    php = null
  }
  if (!php) {
    console.log('  php not on this machine: t4-scss.php syntax not checked here (CI check runners have php)')
    return
  }
  const out = execFileSync(php, ['-l', file], { encoding: 'utf8' })
  assert.match(out, /No syntax errors/)
})

test('the Joomla and WordPress briefs name the look road and never tell an agent to delete T4 caches', async () => {
  const { platformBrief } = await import('../scripts/provision/siteFolder.mjs')
  const wp = platformBrief('wordpress')
  assert.match(wp, /assets\/css\/sections\.css/)
  assert.match(wp, /settings\.custom\.tracy\.brand/)
  assert.match(wp, /global-styles record/)
  const joomla = platformBrief('joomla')
  assert.doesNotMatch(joomla, /clear the cache/)
  assert.match(joomla, /never delete or edit anything under\n?\s*`media\/t4\/`/)
})
