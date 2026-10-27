#!/usr/bin/env node
/**
 * Generate `apps/tracy-web/src/api-reference/sources/agent-tools.json`: what the Tracy agent (the dsh
 * model) can call, per kind of site — the "Agent tools" source of the internal API reference (/ops/api).
 *
 * WHY A GENERATED COPY. tracy-web's image copies `apps/tracy-web/src` and nothing from
 * `packages/tools/*`, so the reference cannot import the plugin that builds the descriptions. The
 * catalogue is DATA written from that plugin's own modules — `SURFACE_ACTIONS`, `siteToolDescription`,
 * `siteToolParameters` (`surface.mjs`), `LOCAL_ACTIONS`/`RELAY_ACTIONS` (`site.mjs`), `TIERS`
 * (`tiers.mjs`), `EMDASH_DESCRIPTION`/`EMDASH_PARAMETERS` (`emdash.mjs`) — and committed. A stale copy
 * tells an operator the agent sees text it no longer sees, and nothing errors; the `agent-tools` gate
 * runs this script with `--check`.
 *
 * WHAT IS READ AS TEXT. The other Tracy plugins register their tools in TypeScript host code that
 * imports dsh at runtime, so they are found by scanning source (`name: 'tracy_…'` inside a
 * `tools.register(` file); a description is copied only when it is a plain chain of string literals,
 * otherwise it is `null` and the source file is named instead.
 *
 * Usage:  node scripts/build-agent-tools.mjs            # writes agent-tools.json
 *         node scripts/build-agent-tools.mjs --check    # exits 1 when agent-tools.json is stale
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const OUT = path.join(ROOT, 'apps', 'tracy-web', 'src', 'api-reference', 'sources', 'agent-tools.json')
const HOST = 'packages/tools/tracy-site-tools/src/host'
const BUNDLE = 'packages/bundle/tracy-native/package.json'

const load = (file) => import(pathToFileURL(path.join(ROOT, HOST, file)).href)

/** What each surface is, in the words of `surface.mjs` `surfaceOf` and its `Surface` typedef. */
const SURFACE_MEANING = Object.freeze({
  joomla: 'An open Joomla site: records are written through the Claude Cowork plugin.',
  'joomla-sealed':
    'A Joomla quickstart site with a content contract: the contract is the recommended road for its words (ADR 0022), the open writes stay available.',
  wordpress: 'An open WordPress site: records are written through the Claude Cowork plugin.',
  'wordpress-sealed':
    'A sealed WordPress quickstart whose release pinned no contract plugin: it takes record writes like an open site.',
  'wordpress-contract':
    'A sealed WordPress quickstart that provision bound to its content contract (#337): words by slot, records as well.',
  emdash:
    "Any EmDash site: content is changed through `tracy_emdash` (the site's own MCP tools); `tracy_site` keeps the page tools and the content map.",
  'joomla-derived':
    'An imported Joomla copy whose Claude Cowork plugin derived a content contract from its own database at import: records are written as on an open site, and the derived slots (module params, articles, menus) take the contract apply.',
  'wordpress-derived':
    'An imported WordPress copy whose Claude Cowork plugin derived a content contract from its own database at import: records are written as on an open site, and the derived slots (builder data, widgets, theme settings) take the contract apply.'
})

/**
 * What the agent host does for an action it answers itself (`LOCAL_ACTIONS`), and which door its
 * writes leave through. Hand-kept beside the list: a local action with no row here stops the build.
 */
const HOST_ROAD = Object.freeze({
  'media.scan': { what: 'Reads image files under the mounted webroot and ranks the largest.' },
  'media.draw': {
    what: 'Draws a picture with the picture model /ops assigned, then uploads it as the viewer.',
    apply: ['media.upload'],
    emdash: ['media_upload']
  },
  'page.look': { what: "Photographs one page of the site with the host's own browser." },
  'page.text': { what: 'Reads one page of the site back as the words a visitor sees.' },
  'content.find': { what: "Searches the site's files for the file-backed layer that holds a string." },
  'look.revert': {
    what: "Puts back what a look change wrote, from the copy the host kept before that write: the stylesheet or theme.json a comment turn's look change edited (and its compiled css), or the WordPress Additional CSS look.set wrote, only while it still holds what look.set left; reaches the site's files and Additional CSS, not a door."
  },
  'look.set': {
    what: "Reads one element's cascade in the site's own browser, then writes a scoped rule, or the token where it is set: on WordPress into the site's Additional CSS (wp-cli in the site's container, kept across theme updates), on Joomla in the template's own files, on EmDash in `src/styles/tokens.css` in the site's container; keeps a look undo first and reads the element again; not a door."
  },
  'page.create': {
    what: "Makes one page and its menu entry in one call: reads the menu first, writes the page from the quickstart's own recipe and the entry through the CMS's page and menu doors under one apply id (one `apply.revert` takes both back), then reads the page once to confirm.",
    apply: ['content.list', 'content.get', 'content.update', 'apply.revert'],
    emdash: ['content_create', 'menu_set_items']
  },
  'content.replace': {
    what: 'Finds the words on the rendered page, picks the stored value that shows them (`replace-road.mjs`), then writes only what changes.',
    apply: {
      'joomla-sealed': ['content.contract'],
      joomla: ['content.list', 'content.get', 'content.update'],
      wordpress: ['content.list', 'content.get', 'content.update'],
      'wordpress-sealed': ['content.list', 'content.get', 'content.update'],
      'wordpress-contract': ['content.list', 'content.get', 'content.update'],
      // An imported copy's derived surface runs its platform's open engine (01/10/2026).
      'joomla-derived': ['content.list', 'content.get', 'content.update'],
      'wordpress-derived': ['content.list', 'content.get', 'content.update']
    },
    emdash: ['content_update', 'menu_set_items', 'settings_update']
  }
})

/** How one `tracy_site` action on one surface reaches the site. */
function routeOf(surface, action, { LOCAL_ACTIONS, RELAY_ACTIONS }) {
  const emdash = surface === 'emdash'
  if (LOCAL_ACTIONS.includes(action)) {
    const road = HOST_ROAD[action]
    if (road === undefined) throw new Error(`build-agent-tools: no HOST_ROAD row for local action ${action}`)
    const apply = Array.isArray(road.apply) ? road.apply : (road.apply?.[surface] ?? [])
    return {
      door: 'host',
      host: road.what,
      ...(emdash && road.emdash ? { emdashTools: [...road.emdash] } : {}),
      ...(!emdash && apply.length > 0 ? { applyActions: [...apply] } : {})
    }
  }
  if (!RELAY_ACTIONS.includes(action))
    throw new Error(`build-agent-tools: ${surface} offers ${action}, which is neither local nor relayed`)
  // On EmDash the host reads the customer's file and uploads it through the site's own MCP tool
  // (`index.ts`, the media.upload branch); every other relayed action there is the Apply door's.
  if (emdash && action === 'media.upload')
    return {
      door: 'host',
      host: "Reads the customer's file from the site folder and uploads it through the site's own media tool.",
      emdashTools: ['media_upload']
    }
  if (action === 'media.upload')
    return {
      door: 'apply',
      applyAction: action,
      host: "The host reads the customer's file from the site folder first; the bytes then go to the Apply door."
    }
  return { door: 'apply', applyAction: action }
}

// ── Other Tracy plugins' tools, read as source text ────────────────────────────────────────────────

/** Every workspace package under `packages/`, by name → its directory relative to the root. */
function workspacePackages() {
  const byName = new Map()
  for (const group of readdirSync(path.join(ROOT, 'packages'))) {
    const groupDir = path.join(ROOT, 'packages', group)
    if (!statSync(groupDir).isDirectory()) continue
    for (const pkg of readdirSync(groupDir)) {
      const file = path.join(groupDir, pkg, 'package.json')
      if (!existsSync(file)) continue
      byName.set(JSON.parse(readFileSync(file, 'utf8')).name, `packages/${group}/${pkg}`)
    }
  }
  return byName
}

/** Host-side source files of one plugin: `src/host/**` and a root `index.js`. */
function hostSources(dir) {
  const out = []
  const walk = (rel) => {
    const abs = path.join(ROOT, rel)
    if (!existsSync(abs)) return
    for (const entry of readdirSync(abs).sort()) {
      const child = `${rel}/${entry}`
      if (statSync(path.join(ROOT, child)).isDirectory()) walk(child)
      else if (/\.(?:ts|mts|mjs|js)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(child)
    }
  }
  walk(`${dir}/src/host`)
  if (existsSync(path.join(ROOT, dir, 'index.js'))) out.push(`${dir}/index.js`)
  return out
}

/** One JS string literal's value, or null when it is not a plain literal. */
function literalValue(token) {
  const quote = token[0]
  if (quote !== "'" && quote !== '"') return null
  const body = token.slice(1, -1)
  const json = quote === '"' ? body : body.replace(/\\'/g, "'").replace(/"/g, '\\"')
  try {
    return JSON.parse(`"${json}"`)
  } catch {
    return null
  }
}

/** A plain chain of string literals joined by `+`, starting at `i`, else null. */
function literalChainAt(text, i) {
  const parts = []
  for (;;) {
    const m = text.slice(i).match(/^(?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/)
    if (!m) return null
    const value = literalValue(m[0])
    if (value === null) return null
    parts.push(value)
    i += m[0].length
    const plus = text.slice(i).match(/^\s*\+\s*/)
    if (!plus) return parts.join('')
    i += plus[0].length
  }
}

/**
 * The description of the tool registered at `from`: a literal chain, or a `const NAME =` literal chain
 * of the same file that it names. Anything computed is null.
 */
function literalDescriptionAfter(text, from) {
  const at = text.slice(from).match(/description:\s*/)
  if (!at || at.index === undefined || at.index > 400) return null
  const i = from + at.index + at[0].length
  const named = text.slice(i).match(/^([A-Z_][A-Z0-9_]*)\s*[,\n]/)
  if (!named) return literalChainAt(text, i)
  const decl = text.match(new RegExp(`\\bconst ${named[1]} =\\s*`))
  return decl && decl.index !== undefined ? literalChainAt(text, decl.index + decl[0].length) : null
}

/** The model tools every other plugin in the customer bundle registers. */
function otherTools(platformOnly) {
  const bundle = JSON.parse(readFileSync(path.join(ROOT, BUNDLE), 'utf8'))
  const packages = workspacePackages()
  const found = []
  for (const name of Object.keys(bundle.dependencies ?? {}).sort()) {
    const dir = packages.get(name)
    if (dir === undefined || name === '@tracy/dsh-site-tools') continue
    for (const file of hostSources(dir)) {
      const text = readFileSync(path.join(ROOT, file), 'utf8')
      // A build plugin names its tool in a spec that `@tracy/site-build-core` registers.
      const patterns = text.includes('tools.register(')
        ? [/\bname:\s*'(tracy_[a-z_]+)'/g]
        : file.endsWith('/src/host/index.ts')
          ? [/\btool:\s*'(tracy_[a-z_]+)'/g]
          : []
      for (const pattern of patterns)
        for (const m of text.matchAll(pattern)) {
          if (found.some((t) => t.name === m[1])) continue
          const description = pattern.source.startsWith('\\bname')
            ? literalDescriptionAfter(text, m.index)
            : null
          found.push({
            name: m[1],
            plugin: name,
            source: file,
            platforms: Object.hasOwn(platformOnly, m[1]) ? [...platformOnly[m[1]]] : null,
            description
          })
        }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

// ── The document ──────────────────────────────────────────────────────────────────────────────────

export async function build() {
  const surface = await load('surface.mjs')
  const site = await load('site.mjs')
  const tiers = await load('tiers.mjs')
  const emdash = await load('emdash.mjs')
  const { SURFACE_ACTIONS, PLATFORM_ONLY_TOOLS } = surface
  const surfaces = Object.keys(SURFACE_ACTIONS)
  for (const id of surfaces)
    if (!Object.hasOwn(SURFACE_MEANING, id))
      throw new Error(`build-agent-tools: no meaning for surface ${id}`)

  // `index.ts` passes its own constant; it is TypeScript, so the value is read from the text.
  const flag = readFileSync(path.join(ROOT, HOST, 'index.ts'), 'utf8').match(
    /^const WORDPRESS_READ_BACK = (true|false)$/m
  )
  if (!flag) throw new Error('build-agent-tools: WORDPRESS_READ_BACK not found in index.ts')
  const wordpressReadBack = flag[1] === 'true'
  const siteSurfaces = {}
  for (const id of surfaces) {
    siteSurfaces[id] = {
      actions: SURFACE_ACTIONS[id].map((action) => ({
        action,
        tier: tiers.TIERS[action] ?? null,
        ...routeOf(id, action, site)
      })),
      description: surface.siteToolDescription(id, { wordpressReadBack }),
      parameters: surface.siteToolParameters(id)
    }
  }

  return {
    schemaVersion: 'tracy-agent-tools/v1',
    note: 'Generated by scripts/build-agent-tools.mjs from packages/tools/tracy-site-tools — do not edit; rerun the script.',
    sources: [
      `${HOST}/surface.mjs`,
      `${HOST}/site.mjs`,
      `${HOST}/tiers.mjs`,
      `${HOST}/emdash.mjs`,
      `${HOST}/index.ts (read, not imported: the registration and the Apply relay)`,
      BUNDLE
    ],
    applyDoor: 'POST /api/sites/{key}/apply',
    surfaces: surfaces.map((id) => ({
      id,
      platform: id === 'emdash' ? 'emdash' : id.startsWith('wordpress') ? 'wordpress' : 'joomla',
      meaning: SURFACE_MEANING[id]
    })),
    tools: [
      {
        name: 'tracy_site',
        plugin: '@tracy/dsh-site-tools',
        platforms: ['joomla', 'wordpress', 'emdash'],
        localActions: [...site.LOCAL_ACTIONS],
        relayActions: [...site.RELAY_ACTIONS],
        fallback: {
          when: 'The platform or the seal of the site could not be read: the agent keeps the full, platform-neutral description and every action.',
          description: surface.fullSiteToolDescription()
        },
        surfaces: siteSurfaces
      },
      {
        name: 'tracy_emdash',
        plugin: '@tracy/dsh-site-tools',
        platforms: [...PLATFORM_ONLY_TOOLS.tracy_emdash],
        door: "The EmDash site's own MCP server (`/_emdash/api/mcp`), reached inside the site's container with the viewer's token; not the Apply door.",
        readTools: [...emdash.EMDASH_READ_TOOLS].sort(),
        destructiveTools: [...emdash.EMDASH_DESTRUCTIVE_TOOLS].sort(),
        description: emdash.EMDASH_DESCRIPTION,
        parameters: emdash.EMDASH_PARAMETERS
      }
    ],
    otherTools: otherTools(PLATFORM_ONLY_TOOLS)
  }
}

/** The file's bytes: JSON, then biome's layout, so the lint gate and this gate agree on one form. */
export async function render() {
  const json = `${JSON.stringify(await build(), null, 2)}\n`
  const biome = path.join(ROOT, 'node_modules', '.bin', 'biome')
  const r = spawnSync(biome, ['format', `--stdin-file-path=${path.relative(ROOT, OUT)}`], {
    cwd: ROOT,
    input: json,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (r.status !== 0) throw new Error(`build-agent-tools: biome format failed: ${r.stderr || r.error}`)
  return r.stdout
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const next = await render()
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
    if (current !== next) {
      console.error(
        'build-agent-tools: agent-tools.json is stale — run `node scripts/build-agent-tools.mjs`.'
      )
      process.exit(1)
    }
    console.log('build-agent-tools: agent-tools.json matches the site-tools plugin.')
  } else {
    writeFileSync(OUT, next)
    const doc = JSON.parse(next)
    const site = doc.tools[0]
    console.log(
      `build-agent-tools: ${String(doc.tools.length + doc.otherTools.length)} tools, ${String(Object.keys(site.surfaces).length)} tracy_site surfaces`
    )
  }
}
