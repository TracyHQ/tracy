/**
 * THE WHERE-MAPS ARE READ OFF THE RELEASES, AND THIS IS WHAT KEEPS THEM SO (`content-where.js`).
 *
 * A where-map tells a site agent where a quickstart keeps its search-engine fields, design, menus,
 * forms, robots and language strings, and which call changes each. A stale entry is invented data
 * with a door attached — the agent would write the wrong record with confidence — so every name in
 * every entry is checked against the source it cites, and this file fails when one is gone:
 *
 *   - each version a map names has its release in this repo (a contract profile for Joomla and
 *     WordPress, the template package at exactly that version for EmDash);
 *   - each proof holds: the file exists and contains the text, a JSON pointer answers (and equals),
 *     and a proof on a theme file is on the RELEASED bytes — the file's sha256 is the one the
 *     release's `presentation-lock.json` pins, so a working tree that moved on cannot vouch for it;
 *   - each `where` names what exists in that release: a contract slot in its content map, a record
 *     kind the Apply door knows, an option the release carries, a file its lock lists or its template
 *     ships, an EmDash collection, field, menu or setting of the template;
 *   - each door is callable there: a `tracy_site` action on the platform's surface (a contract
 *     apply's keys are slots of every version it applies to), an EmDash tool the site publishes
 *     with only that tool's arguments, a rebuild operation the build tool registers;
 *   - what the relay serves validates as a describe document, each toolset read off the door's rules.
 *
 *   node --test apps/tracy-web/test/content-where.test.mjs
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { validateDescribe } from '../src/lib/content-api.js'
import { buildDescribe } from '../src/sites/content-extend.js'
import {
  describeWhere,
  readWhereMaps,
  WHERE_GUIDANCE,
  WHERE_TOPICS,
  whereMapFor
} from '../src/sites/content-where.js'
import { KIND_TOOLSET, toolsetOfDoor } from '../src/sites/route.js'

const repo = (rel) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url))
const text = (rel) => readFileSync(repo(rel), 'utf8')
const json = (rel) => JSON.parse(text(rel))

const MAPS = readWhereMaps()
const { SURFACE_ACTIONS } = await import('../../../packages/tools/tracy-site-tools/src/host/surface.mjs')
/** The tools EmDash 0.38 publishes, with their argument names (the site tools pin the same fixture). */
const EMDASH_TOOLS = new Map(
  json('packages/tools/tracy-site-tools/test/fixtures/emdash/tools-0.38.json').map((tool) => [
    tool.name,
    tool.args
  ])
)
const { EMDASH_REDIRECT_TOOLS } = await import('../../../packages/tools/tracy-site-tools/src/host/emdash.mjs')
/** The Claude Cowork WordPress plugin's own search title and description, pinned to its source by a site-tools fixture. */
const { WP_SEO_META } = await import('../../../packages/tools/tracy-site-tools/src/host/wp-seo.mjs')
const REDIRECT_ARGS = {
  redirect_list: ['limit', 'cursor', 'search'],
  redirect_create: ['source', 'destination', 'type', 'enabled'],
  redirect_delete: ['id']
}
const SURFACES = {
  joomla: ['joomla-sealed', 'joomla'],
  wordpress: ['wordpress-contract', 'wordpress-sealed', 'wordpress'],
  emdash: ['emdash']
}
const QUICKSTART_TREE = { joomla: 'tracy-joomla-quickstart', wordpress: 'tracy-wordpress-quickstart' }
/** Where each release's files are kept, by platform. */
const contractDir = (map, version) =>
  `packages/cms/${QUICKSTART_TREE[map.platform]}/contracts/${map.quickstart}/${version}`
const EMDASH_TEMPLATE = { 'tracy-business': 'packages/cms/tracy-emdash-theme-business' }

/** RFC 6901: the value a JSON pointer names, or `undefined`. */
function pointer(value, at) {
  let here = value
  for (const raw of at.split('/').slice(1)) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~')
    if (here === null || typeof here !== 'object' || !Object.hasOwn(here, key)) return undefined
    here = here[key]
  }
  return here
}

const sha256 = (rel) =>
  createHash('sha256')
    .update(readFileSync(repo(rel)))
    .digest('hex')
const entriesOf = (map) =>
  Object.entries(map.topics).flatMap(([topic, entries]) => entries.map((entry, i) => ({ topic, i, entry })))
const versionsOf = (map, entry) => entry.versions ?? map.versions

test('where-maps: there is one per Tracy Business release the v6 stand runs, and nothing else is guessed', () => {
  const named = MAPS.map((map) => `${map.platform} ${map.quickstart}`).sort()
  assert.deepEqual(named, [
    'emdash tracy-business',
    'joomla tracy-business/j6',
    'wordpress tracy-business/wp7'
  ])
  for (const map of MAPS) {
    assert.equal(map.schemaVersion, 'tracy-content-where/v1')
    assert.ok(Array.isArray(map.versions) && map.versions.length > 0, map.quickstart)
    for (const topic of Object.keys(map.topics))
      assert.ok(WHERE_TOPICS.includes(topic), `${map.quickstart} ${topic}`)
  }
})

test('where-maps: each version is a release this repository holds', () => {
  for (const map of MAPS)
    for (const version of map.versions) {
      if (map.platform === 'emdash') {
        const dir = EMDASH_TEMPLATE[map.quickstart]
        assert.ok(dir, `no template package for ${map.quickstart}`)
        // The map was read off THIS source: another version is not assumed to keep its places —
        // unless the map records that every proof was re-read on that version's RELEASED bytes
        // (`verifiedReleases`: the release zip's sha256 and the day it was checked). A bump of the
        // package without a map that names the new version still fails below.
        const source = json(`${dir}/package.json`).version
        assert.ok(map.versions.includes(source), `${map.quickstart}: the map does not name ${source}`)
        if (version === source) continue
        const record = (map.verifiedReleases ?? []).find((r) => r.version === version)
        assert.ok(
          record && /^[0-9a-f]{64}$/.test(record.zipSha256) && /^\d{4}-\d{2}-\d{2}$/.test(record.checked),
          `${map.quickstart} ${version}: not this source's version, and no verifiedReleases record`
        )
        continue
      }
      const manifest = json(`${contractDir(map, version)}/manifest.json`)
      assert.equal(manifest.quickstart.release, map.quickstart)
      assert.equal(manifest.quickstart.version, version)
    }
})

test('where-maps: every entry is complete, and every proof holds on the released bytes', () => {
  for (const map of MAPS)
    for (const { topic, i, entry } of entriesOf(map)) {
      const at = `${map.quickstart} ${topic}[${i}]`
      assert.ok(typeof entry.what === 'string' && entry.what.length > 0 && entry.what.length <= 200, at)
      assert.ok(
        typeof entry.languages === 'string' && entry.languages.length > 0 && entry.languages.length <= 200,
        at
      )
      assert.ok(entry.where && typeof entry.where === 'object', at)
      assert.ok(entry.door && typeof entry.door.tool === 'string' && typeof entry.door.call === 'object', at)
      for (const version of entry.versions ?? [])
        assert.ok(map.versions.includes(version), `${at}: ${version}`)
      assert.ok(Array.isArray(entry.proof) && entry.proof.length > 0, `${at}: no proof`)
      for (const proof of entry.proof) {
        if (proof.json !== undefined) {
          const found = pointer(json(proof.json), proof.at)
          assert.notEqual(found, undefined, `${at}: ${proof.json} has no ${proof.at}`)
          if ('equals' in proof) assert.deepEqual(found, proof.equals, `${at}: ${proof.json}${proof.at}`)
          continue
        }
        assert.ok(existsSync(repo(proof.file)), `${at}: ${proof.file} is gone`)
        assert.ok(
          text(proof.file).includes(proof.has),
          `${at}: ${proof.file} no longer holds ${JSON.stringify(proof.has)}`
        )
        if (proof.release)
          assert.equal(
            sha256(proof.file),
            json(proof.release.lock).files[proof.release.as],
            `${at}: ${proof.file} is not the released ${proof.release.as}`
          )
      }
    }
})

/** The release a proof reads, when it reads one release's contract profile (its lock, map or inventory). */
const releaseOfProof = (map, proof) => {
  const file = proof.release?.lock ?? proof.json ?? proof.file
  const prefix = `packages/cms/${QUICKSTART_TREE[map.platform]}/contracts/${map.quickstart}/`
  return file?.startsWith(prefix) ? file.slice(prefix.length).split('/')[0] : null
}

test('where-maps: an entry proven on one release’s profile is proven on each release it is said for', () => {
  // Adding a version to a map must re-read every entry on that version's released profile: an
  // entry whose proofs name 1.1.0 and 1.2.0 says nothing about 1.3.0, whose lock may have moved.
  for (const map of MAPS) {
    if (map.platform === 'emdash') continue
    for (const { topic, i, entry } of entriesOf(map)) {
      const proven = new Set(entry.proof.map((proof) => releaseOfProof(map, proof)).filter(Boolean))
      if (proven.size === 0) continue
      for (const version of versionsOf(map, entry))
        assert.ok(proven.has(version), `${map.quickstart} ${topic}[${i}]: no proof on the ${version} profile`)
    }
  }
})

/** A where-file of one release, as that release's lock or template names it; null for a pattern. */
function releasedFile(map, version, file) {
  if (file.includes('<')) return null
  if (map.platform === 'emdash') {
    assert.ok(file.startsWith('/app/'), file)
    return existsSync(repo(`${EMDASH_TEMPLATE[map.quickstart]}/${file.slice('/app/'.length)}`))
  }
  assert.ok(file.startsWith('.webroot/'), file)
  const files = json(`${contractDir(map, version)}/presentation-lock.json`).files
  return Object.hasOwn(files, file.slice('.webroot/'.length))
}

const slotKeys = (map, version) =>
  new Set(json(`${contractDir(map, version)}/content-map.json`).slots.map((slot) => slot.key))
const optionsOf = (map, version) => {
  const inventory = json(`${contractDir(map, version)}/inventory.json`).options
  const listed = Array.isArray(inventory) ? inventory.map((o) => o.name) : Object.keys(inventory)
  const contract = json(`${contractDir(map, version)}/content-map.json`)
    .entities.filter((e) => e.kind === 'option')
    .map((e) => e.identity?.name)
  return new Set([...listed, ...contract])
}

test('where-maps: every place an entry names exists in each release it is said for', () => {
  for (const map of MAPS) {
    const seed = map.platform === 'emdash' ? json(`${EMDASH_TEMPLATE[map.quickstart]}/seed/seed.json`) : null
    const collections = new Map(
      (seed?.collections ?? []).map((c) => [c.slug, new Set(c.fields.map((f) => f.slug))])
    )
    const menus = new Set((seed?.menus ?? []).map((m) => m.name))
    const supports = new Map((seed?.collections ?? []).map((c) => [c.slug, c.supports ?? []]))
    for (const { topic, i, entry } of entriesOf(map)) {
      const at = `${map.quickstart} ${topic}[${i}]`
      const where = entry.where
      for (const version of versionsOf(map, entry)) {
        for (const slot of [where.slot ?? []].flat())
          assert.ok(slotKeys(map, version).has(slot), `${at}: slot ${slot} @${version}`)
        if (where.option !== undefined)
          assert.ok(optionsOf(map, version).has(where.option), `${at}: option ${where.option} @${version}`)
        // `new`: a file the agent may have to create (robots.txt): its proofs carry it.
        if (where.file !== undefined && where.new !== true)
          assert.notEqual(releasedFile(map, version, where.file), false, `${at}: ${where.file} @${version}`)
      }
      if (where.kind !== undefined)
        assert.ok(Object.hasOwn(KIND_TOOLSET, where.kind), `${at}: kind ${where.kind}`)
      if (map.platform !== 'emdash') continue
      if (where.collection !== undefined) {
        assert.ok(collections.has(where.collection), `${at}: collection ${where.collection}`)
        if (where.field !== undefined && where.field !== 'seo')
          assert.ok(
            collections.get(where.collection).has(where.field),
            `${at}: ${where.collection}.${where.field}`
          )
      }
      for (const collection of where.collections ?? []) {
        assert.ok(collections.has(collection), `${at}: collection ${collection}`)
        // The SEO panel exists only on a collection that supports it (`content_update`'s `seo`).
        if (where.argument === 'seo')
          assert.ok(supports.get(collection).includes('seo'), `${at}: ${collection} has no SEO panel`)
      }
      for (const [collection, fields] of Object.entries(where.fields ?? {})) {
        assert.ok(collections.has(collection), `${at}: collection ${collection}`)
        for (const field of fields.split('|'))
          assert.ok(collections.get(collection).has(field), `${at}: ${collection}.${field}`)
      }
      for (const menu of [where.menu ?? []].flat()) assert.ok(menus.has(menu), `${at}: menu ${menu}`)
      if (where.setting !== undefined)
        assert.ok(
          EMDASH_TOOLS.get('settings_update').includes(where.setting.split('.')[0]),
          `${at}: setting ${where.setting}`
        )
    }
  }
})

test('where-maps: every door is callable on that site, with only the arguments it takes', () => {
  const rebuilds = text('packages/site/tracy-site-build-emdash/src/host/requests.mjs')
  for (const map of MAPS)
    for (const { topic, i, entry } of entriesOf(map)) {
      const at = `${map.quickstart} ${topic}[${i}]`
      const doors = [entry.door, ...(entry.door.then ? [entry.door.then] : [])]
      for (const door of doors) {
        if (door.tool === 'tracy_site') {
          const actions = new Set(SURFACES[map.platform].flatMap((surface) => SURFACE_ACTIONS[surface]))
          assert.ok(
            actions.has(door.call.action),
            `${at}: ${door.call.action} is on no ${map.platform} surface`
          )
          if (['content.update', 'content.delete', 'content.get'].includes(door.call.action))
            assert.ok(
              Object.hasOwn(KIND_TOOLSET, door.call.params.kind),
              `${at}: kind ${door.call.params.kind}`
            )
          if (door.call.action === 'content.contract')
            for (const version of versionsOf(map, entry))
              for (const key of Object.keys(door.call.params.changes ?? {}))
                assert.ok(
                  slotKeys(map, version).has(key.replace(/^[^:]+::/, '')),
                  `${at}: slot ${key} @${version}`
                )
        } else if (door.tool === 'tracy_emdash') {
          assert.equal(map.platform, 'emdash', at)
          // Tracy's own redirect door (REST store, no MCP tool): its arguments are the ones it validates.
          const args = EMDASH_REDIRECT_TOOLS.has(door.call.tool)
            ? REDIRECT_ARGS[door.call.tool]
            : EMDASH_TOOLS.get(door.call.tool)
          assert.ok(args, `${at}: EmDash publishes no ${door.call.tool}`)
          for (const key of Object.keys(door.call.arguments ?? {}))
            assert.ok(args.includes(key), `${at}: ${door.call.tool} takes no ${key}`)
        } else if (door.tool === 'tracy_site_build_emdash') {
          assert.equal(door.call.action, 'request', at)
          assert.ok(
            rebuilds.includes(`'${door.call.operation}': {`),
            `${at}: no request ${door.call.operation}`
          )
        } else if (door.tool === 'edit' || door.tool === 'bash') {
          if (door.tool === 'edit')
            assert.equal(door.call.path, entry.where.file, `${at}: edits another file than it names`)
        } else assert.fail(`${at}: unknown door ${door.tool}`)
      }
      assert.ok(['tracy_site', 'tracy_emdash', 'edit', 'bash'].includes(entry.door.tool), at)
    }
})

/**
 * "Turn the contact form off for a while, then back on exactly as before" (bench flow D,
 * `M-L3-form-toggle`, 05/10/2026). With no entry the agent read source before its one write: WordPress
 * 28 calls (Contact Form 7's PHP for 8 steps), EmDash 34 (the Forms plugin for 13, then a patch of the
 * template and a rebuild), Joomla 42 (com_contact core, 23k + 50k of listings). So every release names
 * the write that takes its contact form off the page, through a door it has, and in `what` the way back.
 */
const CONTACT_FORM_OFF = {
  wordpress: (door) =>
    door.tool === 'tracy_site' &&
    door.call.action === 'content.update' &&
    door.call.params?.kind === 'post' &&
    Object.values(door.call.params.blocks ?? {}).some(
      (edit) => /contact-form-7/.test(edit?.find ?? '') && edit.replace === ''
    ),
  joomla: (door) =>
    door.tool === 'tracy_site' &&
    door.call.action === 'content.update' &&
    door.call.params?.kind === 'extensionParams' &&
    door.call.params.fields?.params?.patch?.show_email_form === 0,
  emdash: (door) =>
    door.tool === 'tracy_emdash' &&
    door.call.tool === 'content_update' &&
    door.call.arguments?.collection === 'contact' &&
    door.call.arguments.data?.form_id === ''
}
/** How each platform puts exactly the old bytes back: the Apply door's undo, or the value read before. */
const CONTACT_FORM_BACK = { wordpress: /apply\.revert/, joomla: /apply\.revert/, emdash: /\bbefore\b/ }

test('where-maps: every release says how its contact form goes off for a while and comes back exactly', () => {
  for (const map of MAPS)
    for (const version of map.versions) {
      const at = `${map.quickstart}@${version}`
      const switches = (map.topics.forms ?? []).filter(
        (entry) => versionsOf(map, entry).includes(version) && CONTACT_FORM_OFF[map.platform](entry.door)
      )
      assert.equal(switches.length, 1, `${at}: one forms entry takes the contact form off`)
      assert.match(switches[0].what, /\boff\b/, `${at}: it says it turns the form off`)
      assert.match(switches[0].what, CONTACT_FORM_BACK[map.platform], `${at}: and how it comes back`)
    }
})

test('where-maps: on WordPress only the search title is offered before the page title, and the page title says what else it renames', () => {
  // 05/10/2026, Tracy Business wp7: asked to change only what Google shows, the agent followed the one
  // `seo` entry there was (the post title) and renamed the page's breadcrumb with it. The plugin's own
  // meta changes the <title> alone; the page title stays the road for a plugin too old to print it.
  for (const map of MAPS.filter((m) => m.platform === 'wordpress')) {
    const seo = map.topics.seo
    const own = seo.findIndex((e) => e.door.call.params?.key === WP_SEO_META.title)
    const page = seo.findIndex((e) => e.where.field === 'post_title')
    assert.ok(own >= 0, `${map.quickstart}: no entry for ${WP_SEO_META.title}`)
    assert.ok(page > own, `${map.quickstart}: the page title comes before the search title`)
    for (const at of [own, page])
      assert.ok(seo[at].what.includes(`Claude Cowork ${WP_SEO_META.since}`), `${map.quickstart} seo[${at}]`)
    assert.deepEqual(seo[own].where, { kind: 'postmeta', key: WP_SEO_META.title })
    assert.equal(seo[own].door.call.params.kind, 'postmeta')
    // The <title> is written whole, so the site's own end (' – <site name>') is kept unless asked otherwise.
    assert.match(seo[own].door.call.params.fields.value, / – <site name>/)
    assert.match(seo[own].what, /keep/)
    assert.match(seo[page].what, /breadcrumb/)
    const description = seo.find((e) => e.door.call.params?.key === WP_SEO_META.description)
    assert.deepEqual(
      description?.where,
      { kind: 'postmeta', key: WP_SEO_META.description },
      `${map.quickstart}: description`
    )
  }
})

test('describe: the where block is served per release, toolsets from the doors, and validates', () => {
  for (const map of MAPS)
    for (const version of map.versions) {
      const tag = map.platform === 'emdash' ? `${map.quickstart}/emdash-0.x` : map.quickstart
      const site = { platform: map.platform, quickstart_tag: tag, quickstart_version: version }
      assert.deepEqual(whereMapFor(site), map)
      const where = describeWhere(site, { profile: null, toolsetOfDoor })
      assert.equal(where.quickstart, `${map.quickstart}@${version}`)
      assert.equal(where.guidance, WHERE_GUIDANCE)
      for (const [topic, served] of Object.entries(where.topics)) {
        const own = map.topics[topic].filter((entry) => versionsOf(map, entry).includes(version))
        assert.equal(served.length, own.length, `${map.quickstart}@${version} ${topic}`)
        served.forEach((entry, i) => {
          assert.deepEqual(Object.keys(entry), ['what', 'where', 'door', 'toolset', 'languages'])
          assert.equal(entry.toolset, toolsetOfDoor(own[i].door, { profile: null }))
        })
      }
      const doc = buildDescribe({
        siteKey: 'lantern.localhost',
        site,
        probe: null,
        counts: {},
        contract: null,
        contractHash: null,
        presentation: { state: 'unknown', reason: null },
        permissions: {
          role: 'owner',
          toolsets: { content: true, code: true, site: true, lifecycle: true },
          apply: false,
          entryWrite: map.platform === 'emdash'
        },
        blockKinds: [],
        fallback: { url: 'http://lantern.localhost/', defaultLocale: 'en', locales: ['en'], types: [] },
        where
      })
      assert.deepEqual(validateDescribe(doc), [], `${map.quickstart}@${version}`)
      assert.ok(doc.capabilities.some((c) => c.name === 'ai.tracy.content.where'))
      assert.ok(JSON.stringify(doc.where).length < 16_000, `${map.quickstart}@${version} is too long to read`)
    }
})

test('describe: a release no map was read off gets no where block, never a neighbour’s', () => {
  const doors = { profile: null, toolsetOfDoor }
  assert.equal(
    describeWhere(
      { platform: 'wordpress', quickstart_tag: 'tracy-business/wp7', quickstart_version: '1.0.0' },
      doors
    ),
    null
  )
  assert.equal(
    describeWhere(
      { platform: 'joomla', quickstart_tag: 'tracy-business/j6', quickstart_version: '1.1.0' },
      doors
    ),
    null
  )
  assert.equal(
    describeWhere(
      { platform: 'emdash', quickstart_tag: 'tracy-business/emdash-0.x', quickstart_version: '1.4.3' },
      doors
    ),
    null
  )
  assert.equal(
    describeWhere(
      { platform: 'joomla', quickstart_tag: 'tracy-business/wp7', quickstart_version: '1.1.0' },
      doors
    ),
    null
  )
  assert.equal(
    describeWhere({ platform: 'joomla', quickstart_tag: null, quickstart_version: null }, doors),
    null
  )
})

test('toolsetOfDoor: read off the Apply door’s own rules', () => {
  const site = (action, params) => ({ tool: 'tracy_site', call: { action, params } })
  assert.equal(toolsetOfDoor(site('content.update', { kind: 'option' }), { profile: null }), 'site')
  assert.equal(toolsetOfDoor(site('content.update', { kind: 'menuItem' }), { profile: null }), 'content')
  assert.equal(toolsetOfDoor(site('content.update', { kind: 'templateStyle' }), { profile: null }), 'code')
  assert.equal(toolsetOfDoor(site('theme.style', { style: 'x' }), { profile: null }), 'code')
  assert.equal(toolsetOfDoor(site('content.get', { kind: 'option' }), { profile: null }), null)
  assert.equal(
    toolsetOfDoor({ tool: 'tracy_emdash', call: { tool: 'content_update' } }, { profile: null }),
    'content'
  )
  assert.equal(
    toolsetOfDoor({ tool: 'edit', call: { path: '.webroot/robots.txt' } }, { profile: null }),
    'code'
  )
  assert.equal(toolsetOfDoor({ tool: 'tracy_site', call: { action: 'nope' } }, { profile: null }), null)
})
