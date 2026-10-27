/**
 * `content.find` — which FILE-backed layer holds a string the customer can see, and which door
 * changes it.
 *
 * WHY IT IS ITS OWN FILE, beside `look.mjs`: it reads the site folder, so it does not belong in
 * `site.mjs` (which is pure and says so), and it is the one piece of this tool with enough logic of
 * its own to rot quietly — the value-only match, the override annotation, the caps. `look.mjs` is the
 * precedent: fs work in an `.mjs` module with a test of its own that plain `node --test` can run.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { findMatch, findRoots, iniEntry, layerOfFile } from './site.mjs'
// The one reader of "which CMS is this folder" — the context, this door and the tool surface agree.
import { sitePlatform } from './site-context.mjs'

/** What one `content.find` walk may open before it stops and says it stopped. */
const FIND_MAX_FILES = 4000
/** A file bigger than this is not a language file or a template; skipping it is not a loss. */
const FIND_MAX_FILE_BYTES = 512 * 1024
/** Enough hits to name every layer the word appears in, few enough to read. */
const FIND_MAX_HITS = 40

/**
 * `content.find`: which file-backed layer holds a string the customer can see, and which door
 * changes it.
 *
 * 🔒 IT ANSWERS THE QUESTION THE GREPS WERE ASKING, NOT THE ONE THEY TYPED. Measured 17/09, about
 * twenty bash calls across four sessions went on finding one visible word — grep the shipped `.ini`
 * files, grep `Text::_()` in a module's template, then read the module's source, then read Joomla's
 * own `Language.php`. Every one of those found the string quickly. What none of them produced was
 * the door: the agent still had to work out that a shipped phrase is changed by ADDING a line to
 * `language/overrides/`, never by editing the file the grep just found. So a hit carries its layer
 * and its door, and the path is the evidence rather than the answer.
 *
 * 🔒 IT SAYS WHAT IT DID NOT SEARCH, in the same answer. The words a visitor reads are mostly NOT in
 * files — an article, a menu item's title, a module's `homeText` are all database records, and this
 * walk cannot see any of them. An answer of "no matches" that did not say so would read as "this
 * word is nowhere", which is the wrong conclusion and an expensive one: it is the conclusion that
 * sent one measured session to rename a template.
 */
/**
 * @param {string} sitesRoot - where every site folder lives.
 * @param {string | null} label - this conversation's site, or null when it stands in none.
 * @param {Record<string, unknown>} params - the model's arguments.
 * @param {(root: string) => Promise<string>} detectPlatform - read the CMS off a webroot. Passed in
 *   rather than imported, exactly as `siteContext` takes it: one reader of that evidence, not two.
 * @returns {Promise<unknown>}
 */
export async function contentFind(sitesRoot, label, params, detectPlatform) {
  if (label === null)
    return {
      ok: false,
      code: 'NO_SITE_IN_CONVERSATION',
      error: 'This lane names no site, so there is nothing to search.'
    }
  const needle = typeof params.text === 'string' ? params.text.trim() : ''
  if (needle === '')
    return {
      ok: false,
      code: 'BAD_TEXT',
      error: 'text required: the words the customer can see, as they appear on the page'
    }
  if (needle.length > 200)
    return {
      ok: false,
      code: 'BAD_TEXT',
      error: 'text is a phrase to look for, not a document — 200 characters at most'
    }

  // 🔒 THE FOLDER'S OWN ANSWER FIRST, exactly as `siteContext` reads it (`sitePlatform`: the site
  // record, then the EmDash handoff, then the webroot). `detectPlatform` sniffs `.webroot/` for a CMS
  // marker, and an EmDash `.webroot/` holds data and uploads rather than one — so asking it alone calls
  // every EmDash site `unknown` and the refusal below points at `content.list`, a door that refuses on
  // that platform. Two dead ends in one answer is how a session starts reading files.
  //
  // ⚠ "NO CMS MARKER UNDER IT" IS NOT "NO `.webroot/`". This comment said the second until 20/09,
  // and that belief — correct about the outcome here, wrong about the reason — is what travelled
  // into the agent's own context and told it to look for `data/` beside AGENTS.md.
  const root = `${sitesRoot}/${label}/.webroot`
  const platform = await sitePlatform(`${sitesRoot}/${label}`, detectPlatform)

  const roots = findRoots(platform)
  if (roots.length === 0)
    return {
      ok: false,
      code: 'NO_FILE_LAYERS',
      error: `This site runs ${platform === 'unknown' ? 'a platform this tool does not recognise' : platform}, which keeps no words in files here.`,
      next:
        platform === 'emdash'
          ? // The words road (T1), never "{list: true} first" (D29): 30 of 33 r2 EmDash cases asked the
            // catalogue for a road the context already names.
            'EmDash keeps its words in its own store: `tracy_emdash` content_get {collection, id:"<slug>"} reads a page ("site" holds the site-wide words).'
          : 'Ask the door instead: `content.list` with the kind you expect.'
    }

  const lower = needle.toLowerCase()
  /** @type {Record<string, unknown>[]} */
  const hits = []
  /**
   * Every key this site ALREADY overrides, wherever the walk meets one.
   *
   * 🔒 WITHOUT THIS THE SECOND REQUEST IS BLIND. A hit is filtered on its VALUE, which is right for a
   * shipped file — but an override file is keyed by the phrase it replaces, and once the customer has
   * had one phrase translated, the override holds the NEW words. Searching the old ones then finds
   * the shipped line and says nothing about the override that is actually governing the page, so the
   * agent proposes a change that is already made, or makes a second one that the first still wins
   * over. Measured shape: "keep newhome in English, the rest in Vietnamese", 17/09.
   */
  /** @type {Map<string, { file: string, line: number, value: string }>} */
  const overrides = new Map()
  let opened = 0
  let stopped = false
  /** Why the walk stopped: too many matches, or the file budget ran out before any root was done. */
  let stoppedBy = /** @type {'hits' | 'files' | null} */ (null)

  /** @param {string} dir @param {string} relative @returns {Promise<void>} */
  const walk = async (dir, relative) => {
    if (stopped) return
    // No type annotation here on purpose: annotating with `Awaited<ReturnType<typeof fs.readdir>>`
    // selects the Buffer overload, and every `entry.name` below then types as a Buffer.
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (stopped) return
      const here = `${relative}${relative === '' ? '' : '/'}${entry.name}`
      if (entry.isDirectory()) {
        // `media/` and `cache/` are the two big ones under these roots and hold no prose.
        if (entry.name === 'cache' || entry.name === 'media' || entry.name === 'node_modules') continue
        await walk(path.join(dir, entry.name), here)
        continue
      }
      if (!entry.isFile()) continue
      if (!/\.(ini|php|po|pot)$/.test(entry.name)) continue
      const where = layerOfFile(platform, here)
      if (where === null) continue
      const isOverrideFile = /\/overrides\/[^/]+\.ini$/.test(here)
      // Joomla keeps SEPARATE site and admin override files and one key can live in both, so an admin
      // override must never be reported as governing a page a visitor sees.
      const side = here.startsWith('administrator/') ? 'admin' : 'site'
      if (opened >= FIND_MAX_FILES) {
        stopped = true
        stoppedBy = 'files'
        return
      }
      opened += 1
      /** @type {string} */
      let body
      try {
        const stat = await fs.stat(path.join(dir, entry.name))
        if (stat.size > FIND_MAX_FILE_BYTES) continue
        body = await fs.readFile(path.join(dir, entry.name), 'utf8')
      } catch {
        continue
      }
      if (!body.toLowerCase().includes(lower)) continue
      const lines = body.split('\n')
      for (let i = 0; i < lines.length; i += 1) {
        // An override file is read for its KEYS whether or not the phrase is in it, so a later hit on
        // the shipped line can say the key is already spoken for.
        if (isOverrideFile) {
          const entry = iniEntry(lines[i])
          if (entry !== null && !overrides.has(`${side}:${entry.key}`))
            overrides.set(`${side}:${entry.key}`, {
              file: `.webroot/${here}`,
              line: i + 1,
              value: entry.value
            })
        }
        const found = findMatch(lines[i], lower)
        if (found === null) continue
        hits.push({
          layer: where.layer,
          door: where.door,
          side,
          file: `.webroot/${here}`,
          line: i + 1,
          ...found
        })
        if (hits.length >= FIND_MAX_HITS) {
          stopped = true
          stoppedBy = 'hits'
          return
        }
      }
    }
  }

  for (const one of roots) await walk(path.join(root, one), one)

  return {
    ok: true,
    platform,
    text: needle,
    searched: roots.map((one) => `.webroot/${one}`),
    filesOpened: opened,
    // 🔒 Say which limit stopped the walk. Both used to read "more matches than fit one answer", so a
    // walk that opened its 4000 files and matched nothing sent the model to search again with a longer
    // phrase (16/10/2026, Joomla: the words lived in a module record, which no file holds).
    ...(stopped
      ? {
          stopped:
            stoppedBy === 'hits'
              ? 'there were more matches than fit one answer — search a longer phrase'
              : `the walk stopped after ${FIND_MAX_FILES} files with part of the site unsearched — a longer phrase does not help; words a page shows are more often in a record (see notSearched)`
        }
      : {}),
    matches: hits.map((hit) => {
      const already =
        typeof hit.key === 'string' ? overrides.get(`${String(hit.side)}:${hit.key}`) : undefined
      return already === undefined || already.file === hit.file
        ? hit
        : {
            ...hit,
            overriddenBy: already,
            door: `this key is ALREADY overridden at ${already.file}:${already.line} (currently "${already.value}") — change that line, not the shipped one`
          }
    }),
    // Said on EVERY answer, including a full one: the half this cannot see is the half most requests
    // are actually about, and an agent that forgets it goes looking in files for an article.
    notSearched:
      "Only files were searched. Articles, pages, posts, menu items, module and template PARAMETERS and every other record live in this site's database — ask the door for those: `content.list {kind, include_body}` then `content.get`."
  }
}
