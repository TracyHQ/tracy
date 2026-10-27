/**
 * The Design system doors (`src/sites/design-system.js`, plan tasks/ke-hoach-nut-design-system.md),
 * mounted with their dependencies handed in. The emitters are the real ones (`lib/ds-slot.js` over
 * the checkout's `@tracy/ds-slot`); the host is a fake that plays `site-ds-slot`'s contract with an
 * in-memory site, so apply → read → undo is measured end to end without Docker.
 *
 *   node --test apps/tracy-web/test/design-system-door.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'

import { mountDesignSystem } from '../src/sites/design-system.js'
import { dsFilesOf, wornOf } from '../src/sites/design-system-ids.js'
import { designSystemDescription } from '../src/sites/design-system-rows.js'
import { panelWordsOf, WORDS_TTL_MS } from '../src/sites/design-system-site-reads.js'
import { SEEN_WAIT_MS } from '../src/sites/design-system-write.js'
import { classifyWrites } from '../src/sites/activity-source.js'
import { customerLock } from '../src/lib/design-system-customer-lock.js'
import {
  compareVersions,
  contractFor,
  dsLibrary,
  emitFor,
  googleFontFaces,
  referoLibrary,
  maxVersionOf,
  minVersionOf,
  modesOf,
  rawTemplatesOf,
  slotContracts,
  templateKeyOf,
  versionKeyOf
} from '../src/lib/ds-slot.js'
import { effectsOf, writeGroup } from '../src/sites/activity-describe.js'
import { variationSlug } from '../../../packages/design/tracy-ds-slot/src/wordpress.mjs'

/** Two offered Refero systems the doors apply (the library is Refero's alone since 12/10/2026). */
const S1 = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0' // Moxie
const S2 = 'refero:2bf4c61f-de10-4614-ba1b-20c0453bd2a9' // Notion

/**
 * A fake host: one site whose slot state is a string, with undo entries, as `site-ds-slot` keeps them.
 * Like the real scripts, every run says the template the site runs; an apply naming `templates` the
 * site does not run writes nothing (`DS_TEMPLATE_MOVED`).
 */
function fakeHost({ platform, stylesheet = 'tracy-base', template = 'tracy_base', themeVersion = '1.1.5' }) {
  const site = {
    slot: null,
    state: 'none',
    entries: new Map(),
    calls: [],
    stylesheet,
    template,
    themeVersion
  }
  const runs = () =>
    platform === 'wordpress'
      ? { stylesheet: site.stylesheet, themeVersion: site.themeVersion }
      : platform === 'joomla'
        ? { template: site.template }
        : {}
  let n = 0
  const runJob = async (_site, input) => {
    site.calls.push(input)
    if (input.kind !== 'site-ds-slot' || input.platform !== platform)
      return { ok: false, reason: 'wrong kind' }
    if (input.mode === 'read')
      return {
        ok: true,
        output: JSON.stringify({
          ok: true,
          slot: site.slot,
          ...runs()
        })
      }
    if (input.mode === 'apply') {
      const p = input.payload
      const raw = platform === 'wordpress' ? site.stylesheet : site.template
      const need = p.minTheme ? p.minTheme[raw] : undefined
      const older = p.minTheme && (typeof need !== 'string' || compareVersions(site.themeVersion, need) < 0)
      const top = p.maxTheme ? p.maxTheme[raw] : undefined
      const newer = p.maxTheme && (typeof top !== 'string' || compareVersions(site.themeVersion, top) > 0)
      if ((p.templates && !p.templates.includes(raw)) || older || newer)
        return {
          ok: true,
          output: JSON.stringify({ ok: false, code: 'DS_TEMPLATE_MOVED', slot: site.slot, ...runs() })
        }
      const bytes = p.css ?? p.html ?? JSON.stringify(p.variation)
      assert.match(bytes, /tracy-ds-slot: refero:/, 'the payload carries the slot marker')
      const id = String(++n).padStart(12, '0')
      site.entries.set(id, { before: { slot: site.slot, state: site.state }, after: bytes, used: false })
      const previous = site.slot
      site.state = bytes
      site.slot = { id: p.system, name: null }
      return {
        ok: true,
        output: JSON.stringify({
          ok: true,
          undoId: id,
          slot: site.slot,
          previous,
          changed: true,
          ...runs(),
          // WordPress names the webroot files it wrote (`site-ds-slot` `files`); one bad path the door drops.
          ...(platform === 'wordpress'
            ? {
                files: [
                  `wp-content/uploads/tracy/styles/${p.slug}.json`,
                  'wp-content/uploads/tracy/inspirations.json',
                  '../wp-config.php'
                ]
              }
            : {})
        })
      }
    }
    if (input.mode === 'clear') {
      // The Template default card: the slot taken off, kept as an entry like an apply's (`site-ds-slot` `clear`).
      if (!site.slot)
        return { ok: true, output: JSON.stringify({ ok: false, code: 'DS_NOTHING_WORN', ...runs() }) }
      const id = String(++n).padStart(12, '0')
      const after = `bare-${id}`
      site.entries.set(id, { before: { slot: site.slot, state: site.state }, after, used: false })
      const previous = site.slot
      site.state = after
      site.slot = null
      return {
        ok: true,
        output: JSON.stringify({
          ok: true,
          undoId: id,
          slot: null,
          previous,
          changed: true,
          files: [],
          ...runs()
        })
      }
    }
    if (input.mode === 'undo') {
      const e = site.entries.get(input.id)
      if (!e) return { ok: true, output: JSON.stringify({ ok: false, code: 'DS_UNDO_UNKNOWN' }) }
      if (e.used) return { ok: true, output: JSON.stringify({ ok: false, code: 'DS_UNDO_USED' }) }
      if (site.state !== e.after)
        return { ok: true, output: JSON.stringify({ ok: false, code: 'DS_CHANGED_SINCE' }) }
      site.state = e.before.state
      site.slot = e.before.slot
      e.used = true
      return { ok: true, output: JSON.stringify({ ok: true, id: input.id, slot: site.slot, ...runs() }) }
    }
    return { ok: false, reason: 'bad mode' }
  }
  return { site, runJob }
}

/** Where each platform's fixture site was built from: a release its contract wears. */
const BUILT_FROM = {
  emdash: ['tracy-business/emdash-0.x', '1.7.7'],
  joomla: ['tracy-base/j6', '1.0.2'],
  wordpress: ['tracy-base/wp7', '1.1.2']
}

function mounted({
  platform = 'emdash',
  role = 'owner',
  quickstartTag = BUILT_FROM[platform][0],
  quickstartVersion = BUILT_FROM[platform][1],
  stylesheet,
  template,
  themeVersion,
  leaseOk = true,
  kind = 'session',
  chatRoute,
  home,
  now,
  seen,
  seenWaitMs,
  glyphReader,
  glyphsWaitMs,
  templateImage,
  customerLock
} = {}) {
  const host = fakeHost({ platform, stylesheet, template, themeVersion })
  const rows = []
  const records = []
  const leases = []
  const app = new Hono()
  const server = mountDesignSystem(app, {
    // `x-test-kind` lets one test speak as the panel (a cookie) and as a conversation (an actor).
    requireGrant: async (c) => ({
      kind: c.req.header('x-test-kind') ?? kind,
      email: 'a@x.test',
      grant: { role }
    }),
    ...(chatRoute === undefined ? {} : { chatRoute }),
    ...(home === undefined ? {} : { home }),
    ...(now === undefined ? {} : { now }),
    ...(seen === undefined ? {} : { seen }),
    ...(seenWaitMs === undefined ? {} : { seenWaitMs }),
    ...(glyphReader === undefined ? {} : { glyphReader }),
    ...(glyphsWaitMs === undefined ? {} : { glyphsWaitMs }),
    ...(templateImage === undefined ? {} : { templateImage }),
    ...(customerLock === undefined ? {} : { customerLock }),
    siteByKey: async (key) => ({
      site_key: key,
      label: 'dsbtn',
      host: 'local',
      platform,
      quickstart_tag: quickstartTag,
      quickstart_version: quickstartVersion
    }),
    toolsetRefusal: async (auth) =>
      auth.grant.role === 'viewer' ? { toolset: 'code', role: 'viewer' } : null,
    runJob: host.runJob,
    lease: {
      take: async (q) => {
        leases.push(['take', q.sessionId])
        return leaseOk ? { ok: true, fresh: true } : { ok: false, holder: { holder_actor: 'b@x.test' } }
      },
      release: async (q) => {
        leases.push(['release', q.sessionId])
      }
    },
    record: async (row) => {
      records.push(row)
    },
    store: {
      insert: async (r) => {
        rows.push({
          undo_id: r.undoId,
          system_id: r.systemId,
          system_name: r.systemName,
          previous_id: r.previousId,
          previous_name: r.previousName,
          applied_at: new Date(),
          actor: r.actor,
          undone_at: null
        })
      },
      latest: async () => rows.at(-1) ?? null,
      ofApplies: async (_k, ids) => rows.filter((r) => ids.includes(r.undo_id)),
      markUndone: async (_k, id) => {
        const r = rows.find((x) => x.undo_id === id)
        if (r) r.undone_at = new Date()
      }
    },
    ds: {
      library: dsLibrary,
      refero: referoLibrary,
      templateKeyOf,
      contractFor,
      rawTemplatesOf,
      versionKeyOf,
      minVersionOf,
      maxVersionOf,
      emitFor,
      modesOf
    }
  })
  return { app, host, rows, records, leases, server }
}

const get = (app) =>
  app
    .request('/api/sites/dsbtn.localhost/design-system')
    .then(async (r) => ({ status: r.status, body: await r.json() }))
const post = (app, path, body, headers = {}) =>
  app
    .request(`/api/sites/dsbtn.localhost/design-system${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    })
    .then(async (r) => ({ status: r.status, body: await r.json() }))

test('the library is the 154 OpenDesign systems, each judged by the quality gate', async () => {
  const lib = await dsLibrary()
  assert.equal(lib.length, 154)
  assert.ok(lib.find((s) => s.id === 'stripe')?.ok, 'stripe passes')
  assert.equal(lib.find((s) => s.id === 'airbnb')?.ok, false, 'airbnb is refused (accent text 3.52:1)')
  assert.ok(
    lib.some((s) => !s.ok),
    'some system is refused (the gate is real)'
  )
})

test('a template maps to its slot contract; one without a contract says why', () => {
  assert.deepEqual(
    contractFor(templateKeyOf({ platform: 'emdash', quickstartTag: 'tracy-business/emdash-0.x' })),
    { contract: 'emdash-tracy-business' }
  )
  assert.deepEqual(contractFor(templateKeyOf({ platform: 'wordpress', stylesheet: 'tracy' })), {
    contract: 'wordpress-tracy-base'
  })
  assert.deepEqual(contractFor(templateKeyOf({ platform: 'joomla', template: 'ja_vega' })), {
    contract: 'joomla-ja-vega'
  })
  assert.deepEqual(contractFor(templateKeyOf({ platform: 'joomla', template: 'tracy' })), {
    contract: 'joomla-tracy-base'
  })
  // Tracy Business, the template most new sites start from, wears a system on all three CMS (11/10/2026)
  assert.deepEqual(contractFor(templateKeyOf({ platform: 'joomla', template: 'tracy_business' })), {
    contract: 'joomla-tracy-business'
  })
  assert.deepEqual(contractFor(templateKeyOf({ platform: 'wordpress', stylesheet: 'wp-tracy-business' })), {
    contract: 'wordpress-tracy-business'
  })
  // Tracy SaaS has a contract (ds-contracts batch 1), JA Directory reads the slot since 1.0.1 (11/10/2026)
  assert.deepEqual(
    contractFor(templateKeyOf({ platform: 'emdash', quickstartTag: 'tracy-saas/emdash-0.x' })),
    {
      contract: 'emdash-tracy-saas'
    }
  )
  // 🔒 …but the released 1.4.5 to 1.4.10 came from the line WITHOUT the reader (develop's own 1.4.5 met
  // batch 1's on 11/10/2026, and develop's 1.4.10 — #1013 — has no lib/ds-slot.ts either): the reader
  // ships as 1.4.12 (1.4.11 was built and uploaded but never served: it lacked sharp, TCH #1182/#1196), so an
  // older site is told to update, never handed a sheet its template ignores.
  const saas = (/** @type {string} */ version) =>
    contractFor(
      templateKeyOf({ platform: 'emdash', quickstartTag: 'tracy-saas/emdash-0.x' }),
      versionKeyOf({ platform: 'emdash', quickstartTag: 'tracy-saas/emdash-0.x', quickstartVersion: version })
    )
  for (const v of ['1.4.5', '1.4.9', '1.4.10', '1.4.11'])
    assert.deepEqual(saas(v), { reason: 'TEMPLATE_NEEDS_UPDATE', need: '1.4.12', have: v }, v)
  assert.deepEqual(saas('1.4.12'), { contract: 'emdash-tracy-saas' })
  // 1.4.13 changes only tools/personalize.mjs (TCH #1297): the same reader, checked up to it
  assert.deepEqual(saas('1.4.13'), { contract: 'emdash-tracy-saas' })
  assert.deepEqual(contractFor(templateKeyOf({ platform: 'joomla', template: 'ja_directory' })), {
    contract: 'joomla-ja-directory'
  })
  // every contract still measured short is refused by name, whichever they are today
  for (const c of slotContracts().filter((x) => !x.ready))
    assert.deepEqual(contractFor(c.template), { reason: 'TEMPLATE_NOT_READY' }, c.name)
  assert.deepEqual(contractFor(templateKeyOf({ platform: 'wordpress', stylesheet: 'twentytwentyfive' })), {
    reason: 'TEMPLATE_HAS_NO_SLOT'
  })
  assert.deepEqual(contractFor(templateKeyOf({ platform: 'emdash', quickstartTag: null })), {
    reason: 'NO_TEMPLATE'
  })
  // the framework and third-party quickstarts (11/10/2026): a JoomlArt framework template is keyed by
  // its element — t4-framework and ijoomla-com-guru-pro both install t4_bs5_blank — and so is a
  // GavickPro (Gavern) one, which JoomlArt re-releases with tokenized stylesheets (1.0.1)
  for (const [template, contract] of [
    ['purity_III', 'joomla-purity-iii'],
    ['t3_bs3_blank', 'joomla-t3-bs3-blank'],
    ['t4_bs5_blank', 'joomla-t4-bs5-blank'],
    ['gk_appetit', 'joomla-gk-appetit'],
    ['gk_archi', 'joomla-gk-archi'],
    ['gk_compact', 'joomla-gk-compact'],
    ['gk_restly', 'joomla-gk-restly'],
    ['gk_spotlight', 'joomla-gk-spotlight']
  ])
    assert.deepEqual(contractFor(templateKeyOf({ platform: 'joomla', template })), { contract })
  // a GavickPro site built from the 1.0.0 release (untokenized stylesheets) is asked to update
  assert.deepEqual(
    contractFor(templateKeyOf({ platform: 'joomla', template: 'gk_appetit' }), {
      key: 'quickstart/gavick-gk-appetit/j6',
      version: '1.0.0'
    }),
    { reason: 'TEMPLATE_NEEDS_UPDATE', need: '1.0.1', have: '1.0.0' }
  )
})

test('Tracy Business on WordPress and Joomla: the door emits what each contract wears a system with', async () => {
  const wp = await emitFor({ platform: 'wordpress', contract: 'wordpress-tracy-business', id: 'stripe' })
  assert.equal(wp.ok, true)
  assert.match(wp.variation.styles.css, /--wp--custom--tracy--brand--header:var\(--ds-c-bg\)/)
  const jo = await emitFor({ platform: 'joomla', contract: 'joomla-tracy-business', id: 'stripe' })
  assert.equal(jo.ok, true)
  // the first position Tracy Business renders on every page (the hidden drawer), before the topbar
  assert.deepEqual(jo.module, {
    title: 'Tracy design system',
    position: 'off-canvas',
    ordering: 0,
    style: 'System-none'
  })
  assert.match(jo.html, /--tb-band-forest-bg:var\(--ds-c-accent\)/)
})

for (const [platform, extra] of [
  ['emdash', { quickstartTag: 'tracy-business/emdash-0.x' }],
  ['wordpress', { stylesheet: 'tracy-base' }],
  ['joomla', { template: 'tracy_base' }]
]) {
  test(`${platform}: apply puts the system on, records it, and undo puts the template's own look back`, async () => {
    const { app, host, rows, records, leases } = mounted({ platform, ...extra })
    const before = await get(app)
    assert.equal(before.status, 200)
    assert.equal(before.body.supported, true)
    assert.equal(before.body.canApply, true)
    assert.equal(before.body.worn, null)

    const applied = await post(app, '', { id: S1 })
    assert.equal(applied.status, 200, JSON.stringify(applied.body))
    assert.equal(applied.body.worn.id, S1)
    assert.equal(applied.body.worn.name, 'Moxie')
    assert.equal(host.site.slot.id, S1)
    assert.equal(rows.length, 1)
    assert.equal(records[0].write.via, 'ds-slot')
    assert.equal(records[0].write.action, 'design-system.apply')
    assert.deepEqual(
      leases.map((l) => l[0]),
      ['take', 'release'],
      'the write lease is taken and given back'
    )

    const now = await get(app)
    assert.equal(now.body.worn.id, S1)
    assert.equal(now.body.last.applyId, applied.body.applyId)
    assert.equal(now.body.last.undone, false)

    const undone = await post(app, '/undo', { applyId: applied.body.applyId })
    assert.equal(undone.status, 200, JSON.stringify(undone.body))
    assert.equal(undone.body.worn, null, 'back to no system')
    assert.equal(host.site.slot, null)
    assert.equal(records.at(-1).write.action, 'design-system.undo')
    const again = await post(app, '/undo', { applyId: applied.body.applyId })
    assert.equal(again.body.code, 'DS_UNDO_USED')
  })
}

// Measured 13/10/2026 on the local stand: a Vietnamese Tracy Business EmDash site wearing Balsa printed
// "BÁNH MÌ NướNG MỗI SÁNG": Bebas Neue has no Vietnamese cut, and nothing held the system's fonts to the site's language.
const BALSA = 'refero:ebbfbc6a-988b-4f33-b261-d431b2327545'
/** The site (a Vietnamese home page) and Google's css2 sheets, as `route.js` `glyphReader` reads them. */
const vietnameseSite = () => ({
  base: 'http://dsbtn.localhost/',
  text: async (url) => {
    if (!url.startsWith('https://fonts.googleapis.com/'))
      return '<html lang="vi-VN"><body><h1>Bánh mì nướng mỗi sáng</h1></body></html>'
    const family = decodeURIComponent(/family=([^:&]+)/.exec(url)[1].replace(/\+/g, ' '))
    const cuts = { 'Bebas Neue': ['latin-ext', 'latin'], Oswald: ['vietnamese', 'latin-ext', 'latin'] }[
      family
    ] ?? ['vietnamese', 'latin']
    return cuts
      .map(
        (s) =>
          `/* ${s} */\n@font-face { font-family: '${family}'; src: url(https://fonts.gstatic.com/x/${s}.woff2); }`
      )
      .join('\n')
  }
})

test('a Vietnamese site wearing a system whose display face has no Vietnamese cut is written with a face that has one', async () => {
  const { app, host } = mounted({ platform: 'emdash', glyphReader: async () => vietnameseSite() })
  const applied = await post(app, '', { id: BALSA })
  assert.equal(applied.status, 200, JSON.stringify(applied.body))
  const css = host.site.calls.find((c) => c.mode === 'apply').payload.css
  assert.doesNotMatch(css, /Bebas/, 'no heading is left to a face that cannot draw the site')
  assert.match(css, /family=Oswald:wght@/)
  assert.deepEqual(applied.body.fontsSwapped, [{ from: 'Bebas Neue', to: 'Oswald', subset: 'vietnamese' }])
  // the same system on a site whose language needs nothing is written as the system made it
  const english = mounted({
    platform: 'emdash',
    glyphReader: async () => ({
      ...vietnameseSite(),
      text: async () => '<html lang="en"><body>Fresh bread</body></html>'
    })
  })
  await post(english.app, '', { id: BALSA })
  assert.match(english.host.site.calls.find((c) => c.mode === 'apply').payload.css, /family=Bebas\+Neue/)
})

test('a site whose language cannot be read is written as the system made it, and the write never waits on it for long', async () => {
  const { app, host } = mounted({
    platform: 'emdash',
    glyphsWaitMs: 200,
    glyphReader: async () => ({ base: 'http://x/', text: () => new Promise(() => {}) })
  })
  const t0 = Date.now()
  const applied = await post(app, '', { id: BALSA })
  assert.equal(applied.status, 200)
  assert.match(host.site.calls.find((c) => c.mode === 'apply').payload.css, /Bebas/)
  assert.equal(applied.body.fontsSwapped, undefined)
  assert.ok(Date.now() - t0 < 5_000, 'a read that hangs costs the write its cap, not more')
})

test('undo of the second apply brings the first system back, not "none"', async () => {
  const { app, host } = mounted()
  await post(app, '', { id: S1 })
  const second = await post(app, '', { id: S2 })
  assert.equal(second.status, 200, JSON.stringify(second.body))
  assert.equal(second.body.previous.id, S1)
  const undone = await post(app, '/undo', { applyId: second.body.applyId })
  assert.equal(undone.body.worn.id, S1)
  assert.equal(host.site.slot.id, S1)
})

test('only the newest apply can be undone', async () => {
  const { app } = mounted()
  const first = await post(app, '', { id: S1 })
  await post(app, '', { id: S2 })
  const r = await post(app, '/undo', { applyId: first.body.applyId })
  assert.equal(r.status, 409)
  assert.equal(r.body.code, 'DS_NOT_LATEST')
})

test('a site changed since the apply is not overwritten by undo', async () => {
  const { app, host } = mounted()
  const a = await post(app, '', { id: S1 })
  host.site.state = 'someone edited the slot by hand'
  const r = await post(app, '/undo', { applyId: a.body.applyId })
  assert.equal(r.status, 409)
  assert.equal(r.body.code, 'DS_CHANGED_SINCE')
  assert.equal(host.site.state, 'someone edited the slot by hand')
})

test('a viewer reads but cannot apply or undo, and nothing reaches the host', async () => {
  const { app, host } = mounted({ role: 'viewer' })
  const r = await get(app)
  assert.equal(r.body.canApply, false)
  assert.equal(r.body.cannotApply.code, 'TOOLSET_NOT_GRANTED')
  const calls = host.site.calls.length
  const a = await post(app, '', { id: S1 })
  assert.equal(a.status, 403)
  assert.equal(a.body.code, 'TOOLSET_NOT_GRANTED')
  const u = await post(app, '/undo', { applyId: '000000000001' })
  assert.equal(u.status, 403)
  assert.equal(host.site.calls.length, calls)
})

test('the read says the template thumbnail and whether the preview offers Light | Dark', async () => {
  const shot = 'https://tracy.test/api/templates/tracy-business/shots/home.png?v=abcdef12'
  const seen = []
  // Tracy Business on EmDash: its contract wears both sides of the switch (`modes: true`).
  const biz = mounted({
    templateImage: async (site) => {
      seen.push(site.quickstart_tag)
      return shot
    }
  })
  const r = await get(biz.app)
  assert.equal(r.body.templateImage, shot)
  assert.equal(r.body.modes, true)
  assert.deepEqual(seen, ['tracy-business/emdash-0.x'], 'asked with the site row')
  // A template with no slot: no Light | Dark; no thumbnail reader, or one that throws, is null, never a failed read.
  const none = mounted({ platform: 'wordpress', stylesheet: 'twentytwentyfive' })
  const n = await get(none.app)
  assert.equal(n.status, 200)
  assert.equal(n.body.templateImage, null)
  assert.equal(n.body.modes, false)
  const broken = mounted({
    templateImage: async () => {
      throw new Error('db down')
    }
  })
  const b = await get(broken.app)
  assert.equal(b.status, 200)
  assert.equal(b.body.templateImage, null)
})

test('modesOf follows the contract through extends; one-look and unknown contracts are false', () => {
  assert.equal(modesOf('emdash-tracy-business'), true)
  assert.equal(modesOf('joomla-tracy-business'), true)
  assert.equal(modesOf('wordpress-tracy-base'), true)
  // a WordPress overlay extends tracy-base and inherits its two modes
  assert.equal(modesOf('wordpress-ja-vega'), true)
  // JA Vega wears both sides of a system since its 1.0.7 contract (MODE-3); JA Donate keeps one look
  assert.equal(modesOf('joomla-ja-vega'), true)
  assert.equal(modesOf('joomla-ja-donate'), false)
  assert.equal(modesOf('no-such-contract'), false)
  assert.equal(modesOf('../etc/passwd'), false)
  assert.equal(modesOf(null), false)
})

test('a template with no slot contract is refused before anything is written', async () => {
  const { app, host } = mounted({ platform: 'wordpress', stylesheet: 'twentytwentyfive' })
  const r = await get(app)
  assert.equal(r.body.supported, false)
  assert.equal(r.body.reason, 'TEMPLATE_HAS_NO_SLOT')
  const a = await post(app, '', { id: S1 })
  assert.equal(a.status, 409)
  assert.equal(a.body.code, 'DS_TEMPLATE_CANNOT_WEAR')
  assert.ok(!host.site.calls.some((c) => c.mode === 'apply'))
})

test('an unknown, OpenDesign or gate-refused system is unknown; a busy site is refused', async () => {
  const { app, host } = mounted()
  assert.equal((await post(app, '', { id: 'nope-nope' })).body.code, 'DS_UNKNOWN')
  assert.equal((await post(app, '', { id: '../x' })).body.code, 'DS_UNKNOWN')
  // OpenDesign is no longer offered, by either spelling (Akemi, 12/10/2026).
  assert.equal((await post(app, '', { id: 'stripe' })).body.code, 'DS_UNKNOWN')
  assert.equal((await post(app, '', { id: 'od:stripe' })).body.code, 'DS_UNKNOWN')
  // A Refero system the gate refuses is never offered (Paper: text 2.76:1 on its background).
  assert.equal(
    (await post(app, '', { id: 'refero:057d7c66-76b7-4272-849c-4058543e6799' })).body.code,
    'DS_UNKNOWN'
  )
  assert.ok(!host.site.calls.some((c) => c.mode === 'apply'), 'nothing written')
  const busy = mounted({ leaseOk: false })
  const b = await post(busy.app, '', { id: S1 })
  assert.equal(b.status, 409)
  assert.equal(b.body.code, 'SITE_BUSY')
})

// ── The server's own write at the end of a site's build (Add site form, Akemi 12/10/2026) ──

test('applyAs: the build writes the same bytes and the same Site changes row as a press, as the creator', async () => {
  const pressed = mounted()
  const press = await post(pressed.app, '', { id: S1 })
  assert.equal(press.status, 200, JSON.stringify(press.body))
  const built = mounted()
  const out = await built.server.applyAs('dsbtn.localhost', { email: 'creator@x.test', id: S1, at: 'create' })
  assert.equal(out.status, 200, JSON.stringify(out.body))
  assert.equal(out.body.ok, true)
  assert.match(out.body.applyId, /^[0-9a-f]{12}$/)
  const write = (h) => h.host.site.calls.find((c) => c.mode === 'apply').payload
  assert.deepEqual(write(built), write(pressed), 'the same bytes reach the site')
  assert.equal(built.rows.length, 1)
  assert.equal(built.rows[0].actor, 'creator@x.test')
  assert.equal(built.rows[0].system_id, S1)
  const rec = built.records[0]
  assert.equal(rec.actor, 'creator@x.test')
  assert.equal(rec.write.via, 'ds-slot')
  assert.equal(rec.write.action, 'design-system.apply')
  assert.equal(rec.write.sessionId, `design-system-${out.body.applyId}`)
  assert.equal(rec.write.target.channel, 'button', 'Site changes reads it as a Design system press')
  assert.equal(rec.write.target.at, 'create')
  assert.equal(classifyWrites([{ ...rec.write, actor: rec.actor }]).source, 'design-system')
  assert.deepEqual(
    built.leases.map((l) => l[0]),
    ['take', 'release'],
    'the site’s write lease is held like a press'
  )
  // Undone from the panel like any apply.
  const undone = await post(built.app, '/undo', { applyId: out.body.applyId })
  assert.equal(undone.status, 200, JSON.stringify(undone.body))
  assert.equal(built.host.site.slot, null)
})

test('applyAs: a template that cannot wear the system writes nothing and says why', async () => {
  const { server, host } = mounted({ platform: 'wordpress', stylesheet: 'twentytwentyfive' })
  const out = await server.applyAs('dsbtn.localhost', { email: 'creator@x.test', id: S1, at: 'create' })
  assert.equal(out.status, 409)
  assert.equal(out.body.code, 'DS_TEMPLATE_CANNOT_WEAR')
  assert.equal(out.body.reason, 'TEMPLATE_HAS_NO_SLOT')
  assert.ok(!host.site.calls.some((c) => c.mode === 'apply'))
})

test('applyAs: an unknown system, or a site with none, is refused before anything runs', async () => {
  const { server, host } = mounted()
  assert.equal(
    (await server.applyAs('dsbtn.localhost', { email: 'c@x.test', id: 'od:stripe' })).body.code,
    'DS_UNKNOWN'
  )
  assert.equal(host.site.calls.length, 0)
})

test('checkSystem: only an offered Refero system may travel with a create request', async () => {
  const { server } = mounted()
  assert.deepEqual(await server.checkSystem(S1), { ok: true, id: S1, name: 'Moxie' })
  for (const bad of ['od:stripe', 'stripe', 'nope', '../x', '', 42, null, { id: S1 }])
    assert.deepEqual(await server.checkSystem(bad), { ok: false, code: 'DS_UNKNOWN' }, String(bad))
  // A Refero system the quality gate refuses is never offered (Paper).
  assert.deepEqual(await server.checkSystem('refero:057d7c66-76b7-4272-849c-4058543e6799'), {
    ok: false,
    code: 'DS_UNKNOWN'
  })
})

test('wornOf names an OpenDesign slot by the library, anything else by the slot itself', () => {
  const names = new Map([['stripe', 'Stripe']])
  assert.deepEqual(wornOf({ id: 'od:stripe', name: null }, names), {
    id: 'stripe',
    slotId: 'od:stripe',
    name: 'Stripe'
  })
  assert.deepEqual(wornOf({ id: 'refero:abc', name: 'Moxie' }, names), {
    id: null,
    slotId: 'refero:abc',
    name: 'Moxie'
  })
  assert.equal(wornOf(null, names), null)
})

test('the Site changes row of an apply and of its undo names the system, as a look (settings) change', async () => {
  const { app, records } = mounted()
  const a = await post(app, '', { id: S1 })
  await post(app, '/undo', { applyId: a.body.applyId })
  const writes = records.map((r) => ({ ...r.write, target: r.write.target }))
  assert.deepEqual(writes.map(writeGroup), ['settings', 'settings'])
  const { effects } = effectsOf({ writes, fileHistory: false })
  assert.deepEqual(JSON.parse(JSON.stringify(effects.settings.resources)), [
    { type: 'design-system', id: S1, title: 'Moxie', ops: ['apply', 'undo'] }
  ])
})

// ── One run in the site's container per press (timing evidence: tasks/evidence/design-system-button-2026-10-11/timing.md) ──

const hostRuns = (host) => host.site.calls.length

for (const [platform, extra] of [
  ['emdash', { quickstartTag: 'tracy-business/emdash-0.x' }],
  ['wordpress', { stylesheet: 'tracy-base' }],
  ['joomla', { template: 'tracy_base' }]
]) {
  test(`${platform}: an apply with the panel's template is ONE run in the site; its answer is the panel's next read`, async () => {
    const { app, host } = mounted({ platform, ...extra })
    const open = await get(app)
    const runs = hostRuns(host)
    const applied = await post(app, '', { id: S1, template: open.body.template })
    assert.equal(applied.status, 200, JSON.stringify(applied.body))
    assert.deepEqual(
      host.site.calls.slice(runs).map((c) => c.mode),
      ['apply'],
      'no read before the write'
    )
    // The answer carries what a GET would say now, so the panel does not read again.
    const now = await get(app)
    assert.deepEqual(applied.body.read, now.body)
    assert.equal(applied.body.read.worn.id, S1)
    assert.equal(applied.body.read.last.applyId, applied.body.applyId)
    // Undo: one run, and its answer is the next read too.
    const before = hostRuns(host)
    const undone = await post(app, '/undo', { applyId: applied.body.applyId })
    assert.equal(undone.status, 200, JSON.stringify(undone.body))
    assert.deepEqual(
      host.site.calls.slice(before).map((c) => c.mode),
      ['undo']
    )
    assert.deepEqual(undone.body.read, (await get(app)).body)
    assert.equal(undone.body.read.worn, null)
    assert.equal(undone.body.read.last.undone, true)
  })
}

test('an apply whose template is not named still reads the site first (an API caller), then writes once', async () => {
  const { app, host } = mounted({ platform: 'wordpress', stylesheet: 'tracy-base' })
  const applied = await post(app, '', { id: S1 })
  assert.equal(applied.status, 200)
  assert.deepEqual(
    host.site.calls.map((c) => c.mode),
    ['read', 'apply']
  )
  assert.deepEqual(host.site.calls[1].payload.templates, ['tracy-base'], 'the write holds the template read')
})

test('a template that moved since the panel read writes nothing for the old one, then the new one is worn', async () => {
  const { app, host } = mounted({ platform: 'wordpress', stylesheet: 'tracy-base' })
  const open = await get(app)
  assert.equal(open.body.template, 'wordpress/tracy-base')
  host.site.stylesheet = 'wp-ja-kinetic' // someone switched the theme
  host.site.themeVersion = '1.1.11'
  const runs = hostRuns(host)
  const applied = await post(app, '', { id: S1, template: open.body.template })
  assert.equal(applied.status, 200, JSON.stringify(applied.body))
  const writes = host.site.calls.slice(runs).filter((c) => c.mode === 'apply')
  assert.equal(writes.length, 2)
  assert.deepEqual(writes[0].payload.templates, ['tracy-base', 'tracy'])
  assert.deepEqual(writes[1].payload.templates, ['wp-ja-kinetic'])
  assert.deepEqual(writes[1].payload.minTheme, { 'wp-ja-kinetic': '1.1.11' })
  assert.ok(
    !host.site.calls.slice(runs).some((c) => c.mode === 'read'),
    "the first run's own answer says the template"
  )
  assert.equal(host.site.entries.size, 1, 'only the second run wrote')
  assert.equal(applied.body.read.template, 'wordpress/wp-ja-kinetic')
})

test('a template that moved to one with no slot writes nothing at all', async () => {
  const { app, host } = mounted({ platform: 'wordpress', stylesheet: 'tracy-base' })
  const open = await get(app)
  host.site.stylesheet = 'twentytwentyfive'
  const r = await post(app, '', { id: S1, template: open.body.template })
  assert.equal(r.status, 409)
  assert.equal(r.body.code, 'DS_TEMPLATE_CANNOT_WEAR')
  assert.equal(host.site.entries.size, 0)
})

test('a template hint the door cannot use (unknown, malformed, EmDash) is ignored, never trusted', async () => {
  const wp = mounted({ platform: 'wordpress', stylesheet: 'tracy-base' })
  await post(wp.app, '', { id: S1, template: 'wordpress/twentytwentyfive' })
  assert.deepEqual(
    wp.host.site.calls.map((c) => c.mode),
    ['read', 'apply'],
    'a hint with no slot contract: the door reads the site'
  )
  const em = mounted({ platform: 'emdash' })
  const r = await post(em.app, '', { id: S1, template: 'joomla/tracy-base' })
  assert.equal(r.status, 200)
  assert.deepEqual(
    em.host.site.calls.map((c) => c.mode),
    ['apply']
  )
  assert.equal(em.host.site.calls[0].payload.templates, undefined, 'EmDash names no template')
})

test('each apply and each undo is its own Site changes row (its own write group), never one per person', async () => {
  const { app, records } = mounted()
  const a = await post(app, '', { id: S1 })
  const b = await post(app, '', { id: S2 })
  await post(app, '/undo', { applyId: b.body.applyId })
  const sessions = records.map((r) => r.write.sessionId)
  assert.deepEqual(sessions, [
    `design-system-${a.body.applyId}`,
    `design-system-${b.body.applyId}`,
    `design-system-undo-${b.body.applyId}`
  ])
  for (const r of records) assert.equal(r.detail.sessionId, r.write.sessionId)
})

test('rawTemplatesOf turns a template key back into the names a site reports for it', () => {
  assert.deepEqual(rawTemplatesOf('wordpress/tracy-base'), ['tracy-base', 'tracy'])
  assert.deepEqual(rawTemplatesOf('wordpress/wp-ja-kinetic'), ['wp-ja-kinetic'])
  assert.deepEqual(rawTemplatesOf('joomla/ja-kinetic'), ['ja-kinetic', 'ja_kinetic'])
  assert.deepEqual(rawTemplatesOf('joomla/tracy-base'), ['tracy-base', 'tracy_base', 'tracy'])
  for (const key of ['wordpress/tracy-base', 'joomla/ja-kinetic', 'joomla/tracy-base'])
    for (const raw of rawTemplatesOf(key)) {
      const platform = key.split('/')[0]
      assert.equal(templateKeyOf({ platform, stylesheet: raw, template: raw }), key)
    }
  assert.deepEqual(rawTemplatesOf('emdash/tracy-business'), [])
  assert.deepEqual(rawTemplatesOf('wordpress/../x'), [])
  assert.deepEqual(rawTemplatesOf(null), [])
})

test("Google's font faces for one link are read once, then kept; a failed read is not kept", async () => {
  let reads = 0
  const read = async () => {
    reads++
    return [{ fontFamily: 'X' }]
  }
  const href = `https://fonts.googleapis.com/css2?family=Test${Date.now()}`
  let t = 1_000
  const now = () => t
  assert.deepEqual(await googleFontFaces(href, { read, now }), [{ fontFamily: 'X' }])
  assert.deepEqual(await googleFontFaces(href, { read, now }), [{ fontFamily: 'X' }])
  assert.equal(reads, 1)
  t += 25 * 60 * 60_000
  await googleFontFaces(href, { read, now })
  assert.equal(reads, 2, 'kept for a day, then read again')
  const failing = `${href}-fail`
  await assert.rejects(googleFontFaces(failing, { read: async () => Promise.reject(new Error('down')), now }))
  await googleFontFaces(failing, { read, now })
  assert.equal(reads, 3, 'the failure was not kept')
})

// ── The Site changes row of an apply offers its undo (designSystemRowOf) ──

test('a Site changes row of an apply offers its undo only while it is the newest, not undone, to a writer', async () => {
  const { designSystemRowOf } = await import('../src/sites/design-system-rows.js')
  const writes = [
    {
      via: 'ds-slot',
      action: 'design-system.apply',
      outcome: 'ok',
      target: { kind: 'design-system', id: 'stripe', title: 'Stripe', applyId: 'abcdefabcdef' }
    }
  ]
  const row = {
    undo_id: 'abcdefabcdef',
    system_id: 'stripe',
    system_name: 'Stripe',
    previous_id: 'apple',
    previous_name: 'Apple',
    undone_at: null
  }
  const rows = new Map([['abcdefabcdef', row]])
  assert.deepEqual(designSystemRowOf(writes, { rows, newest: 'abcdefabcdef', canWrite: true }), {
    applyId: 'abcdefabcdef',
    name: 'Stripe',
    previous: { id: 'apple', name: 'Apple' },
    state: 'available',
    canUndo: true
  })
  assert.equal(designSystemRowOf(writes, { rows, newest: 'abcdefabcdef', canWrite: false }).canUndo, false)
  assert.equal(
    designSystemRowOf(writes, { rows, newest: '111111111111', canWrite: true }).state,
    'not-latest'
  )
  const undone = new Map([['abcdefabcdef', { ...row, undone_at: new Date() }]])
  assert.equal(
    designSystemRowOf(writes, { rows: undone, newest: 'abcdefabcdef', canWrite: true }).state,
    'undone'
  )
  // An undo's own row, an unknown apply, a failed apply: no undo offered.
  assert.equal(
    designSystemRowOf([{ ...writes[0], action: 'design-system.undo' }], {
      rows,
      newest: 'abcdefabcdef',
      canWrite: true
    }),
    null
  )
  assert.equal(designSystemRowOf(writes, { rows: new Map(), newest: null, canWrite: true }), null)
  assert.equal(
    designSystemRowOf([{ ...writes[0], outcome: 'unknown' }], {
      rows,
      newest: 'abcdefabcdef',
      canWrite: true
    }),
    null
  )
})

// ── A contract is ready only for the release it was measured on (minVersion) ──

test('contractFor judges the site’s release against the contract’s minVersion', () => {
  const kinetic = 'joomla/ja-kinetic'
  const at = (version, key = 'quickstart/ja-kinetic/j6') => contractFor(kinetic, { key, version })
  assert.deepEqual(at('1.0.4'), { contract: 'joomla-ja-kinetic' })
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1, 'numbers, not text')
  assert.deepEqual(at('1.0.3'), { reason: 'TEMPLATE_NEEDS_UPDATE', need: '1.0.4', have: '1.0.3' })
  assert.deepEqual(at(null), { reason: 'TEMPLATE_VERSION_UNKNOWN', have: null })
  assert.deepEqual(at('1.0.4', 'quickstart/other/j6'), { reason: 'TEMPLATE_VERSION_UNKNOWN', have: '1.0.4' })
  assert.deepEqual(at('one'), { reason: 'TEMPLATE_VERSION_UNKNOWN', have: 'one' })
  // JA Essence Joomla was measured on a tokenized 1.0.5 built 11/10/2026, but another line released a
  // different, untokenized 1.0.5 first: the tokenized build was redone from it as 1.0.6 (TCH #1180), so
  // 1.0.5 — the number the measure first named — is asked to update, never handed a sheet it ignores.
  const essence = (version) => contractFor('joomla/ja-essence', { key: 'quickstart/ja-essence/j6', version })
  assert.deepEqual(essence('1.0.4'), { reason: 'TEMPLATE_NEEDS_UPDATE', need: '1.0.6', have: '1.0.4' })
  assert.deepEqual(essence('1.0.5'), { reason: 'TEMPLATE_NEEDS_UPDATE', need: '1.0.6', have: '1.0.5' })
  assert.deepEqual(essence('1.0.6'), { contract: 'joomla-ja-essence' })
  // WordPress: the running theme's version, per stylesheet.
  assert.deepEqual(contractFor('wordpress/wp-ja-kinetic', { key: 'wp-ja-kinetic', version: '1.1.9' }), {
    reason: 'TEMPLATE_NEEDS_UPDATE',
    need: '1.1.11',
    have: '1.1.9'
  })
  assert.deepEqual(
    versionKeyOf({
      platform: 'wordpress',
      stylesheet: 'wp-ja-kinetic',
      themeVersion: '1.1.9',
      quickstartTag: 'x',
      quickstartVersion: '9'
    }),
    {
      key: 'wp-ja-kinetic',
      version: '1.1.9'
    }
  )
  assert.deepEqual(
    versionKeyOf({
      platform: 'joomla',
      quickstartTag: 'quickstart/ja-kinetic/j6',
      quickstartVersion: '1.0.4'
    }),
    {
      key: 'quickstart/ja-kinetic/j6',
      version: '1.0.4'
    }
  )
})

// ── …and only up to the last release confirmed to wear it (maxVersion) ──

test('contractFor refuses a release newer than the last one confirmed to wear the slot (maxVersion)', () => {
  // 🔒 Measured 11/10/2026 (tasks/evidence/ds-minversion-audit-2026-10-11): other lines re-release the
  // same quickstarts and themes all day (JA Spa 1.0.3 and 1.0.4, JA Voyara 1.0.6, Tracy Business
  // EmDash 1.7.7 to 1.7.14, five JA Essence WordPress themes). A higher number is not proof the
  // stylesheets still read the slot: the release past the last one checked is refused by name.
  const spa = (version) => contractFor('joomla/ja-spa', { key: 'quickstart/ja-spa/j6', version })
  assert.deepEqual(spa('1.0.1'), { reason: 'TEMPLATE_NEEDS_UPDATE', need: '1.0.2', have: '1.0.1' })
  // 1.0.6 (#1375): the re-cut whose status text reads the slot's readable shade; 1.0.7 (lane B): the
  // stylesheets read the role variables; 1.0.8 (TEXT-1 batch 3): text and hover roles, the last release checked
  for (const v of ['1.0.2', '1.0.3', '1.0.4', '1.0.5', '1.0.6', '1.0.7', '1.0.8'])
    assert.deepEqual(spa(v), { contract: 'joomla-ja-spa' }, v)
  assert.deepEqual(spa('1.0.9'), { reason: 'TEMPLATE_VERSION_UNCHECKED', upTo: '1.0.8', have: '1.0.9' })
  assert.deepEqual(spa('1.0.10'), { reason: 'TEMPLATE_VERSION_UNCHECKED', upTo: '1.0.8', have: '1.0.10' })
  // A contract is ready up to the last release checked, and refuses the next one by name.
  const kinetic = (version) => contractFor('joomla/ja-kinetic', { key: 'quickstart/ja-kinetic/j6', version })
  // 1.0.8 (feat/ds-role-variables): the release that reads the standard role variables; 1.0.9 (design system
  // dot 3): the call bar fix moved into the template source, its own contract without that patch; 1.0.10
  // (TEXT-1 batch 1): built from 1.0.9, the same contract, the last checked
  assert.deepEqual(kinetic('1.0.7'), { contract: 'joomla-ja-kinetic' })
  assert.deepEqual(kinetic('1.0.8'), { contract: 'joomla-ja-kinetic' })
  assert.deepEqual(kinetic('1.0.9'), { contract: 'joomla-ja-kinetic-source' })
  assert.deepEqual(kinetic('1.0.10'), { contract: 'joomla-ja-kinetic-source' })
  assert.deepEqual(kinetic('1.0.11'), {
    reason: 'TEMPLATE_VERSION_UNCHECKED',
    upTo: '1.0.10',
    have: '1.0.11'
  })
  // EmDash and WordPress the same way.
  const business = (version) =>
    contractFor('emdash/tracy-business', { key: 'tracy-business/emdash-0.x', version })
  // 1.7.6 to 1.7.19 paint with their own colour family: the contract with the template patches
  assert.deepEqual(business('1.7.18'), { contract: 'emdash-tracy-business' })
  assert.deepEqual(business('1.7.19'), { contract: 'emdash-tracy-business' })
  // 1.7.20 (feat/ds-role-variables): the first release that reads every role variable itself; 1.7.22 the last checked
  assert.deepEqual(business('1.7.20'), { contract: 'emdash-tracy-business-roles' })
  assert.deepEqual(business('1.7.22'), { contract: 'emdash-tracy-business-roles' })
  // 1.7.23 (design system dot 3): the roles 1.7.20-1.7.22 took from contract patches are read at the source
  assert.deepEqual(business('1.7.23'), { contract: 'emdash-tracy-business-source' })
  assert.deepEqual(business('1.7.24'), {
    reason: 'TEMPLATE_VERSION_UNCHECKED',
    upTo: '1.7.23',
    have: '1.7.24'
  })
  const base = (version) => contractFor('emdash/tracy-base', { key: 'tracy-base/emdash-0.x', version })
  assert.deepEqual(base('0.5.4'), { contract: 'emdash-base' })
  assert.deepEqual(base('0.5.5'), { contract: 'emdash-base-roles' })
  assert.deepEqual(base('0.5.6'), { contract: 'emdash-base-roles' })
  assert.deepEqual(base('0.5.7'), { reason: 'TEMPLATE_VERSION_UNCHECKED', upTo: '0.5.6', have: '0.5.7' })
  assert.deepEqual(base('0.4.0'), { reason: 'TEMPLATE_NEEDS_UPDATE', need: '0.5.0', have: '0.4.0' })
  assert.deepEqual(contractFor('wordpress/wp-ja-vega', { key: 'wp-ja-vega', version: '1.1.20' }), {
    contract: 'wordpress-ja-vega'
  })
  assert.deepEqual(contractFor('wordpress/wp-ja-vega', { key: 'wp-ja-vega', version: '1.1.21' }), {
    reason: 'TEMPLATE_VERSION_UNCHECKED',
    upTo: '1.1.20',
    have: '1.1.21'
  })
  // What the WordPress write's own run is handed: every key of minVersion, bounded.
  assert.deepEqual(maxVersionOf('wordpress/tracy-base'), { 'tracy-base': '1.1.9', tracy: '1.1.6' })
  assert.equal(maxVersionOf('wordpress/twentytwentyfive'), null)
  assert.deepEqual(contractFor('emdash/tracy-base', { key: 'tracy-base/emdash-0.x', version: '0.5.3' }), {
    contract: 'emdash-base'
  })
})

test('every ready contract names the last release confirmed for each release it wears (maxVersion)', async () => {
  const { slotContracts } = await import('../src/lib/ds-slot.js')
  for (const c of slotContracts().filter((x) => x.ready)) {
    for (const [key, min] of Object.entries(c.minVersion ?? {})) {
      if (min === null) continue
      const max = c.maxVersion?.[key]
      assert.equal(
        typeof max,
        'string',
        `${c.name}: maxVersion of ${key} (the last release checked to wear it)`
      )
      assert.ok(compareVersions(max, min) >= 0, `${c.name}: ${key} ${min}..${max}`)
    }
  }
})

test('a WordPress theme bumped in this tree is checked against its contract before it ships (maxVersion)', async () => {
  // A theme release reaches running sites by itself, and its source is here: whoever moves a theme's
  // Version moves its contract's maxVersion in the same change, having checked it still reads the slot.
  const { readFileSync } = await import('node:fs')
  const src = new URL('../../../packages/cms/tracy-wordpress-theme/src/', import.meta.url)
  for (const c of slotContracts().filter((x) => x.ready && x.template.startsWith('wordpress/'))) {
    for (const key of Object.keys(c.minVersion ?? {})) {
      const head = readFileSync(new URL(`${key}/style.css`, src), 'utf8').slice(0, 4096)
      const version = /^[ \t/*#@]*Version:[ \t]*([^\r\n]+)/im.exec(head)?.[1].trim()
      assert.ok(version, `${key}: Version header`)
      assert.ok(
        compareVersions(version, maxVersionOf(c.template)?.[key] ?? null) <= 0,
        `${c.name}: the ${key} theme is ${version} here, past maxVersion ${maxVersionOf(c.template)?.[key]} — check it still reads the slot, then move maxVersion`
      )
    }
  }
})

test('every ready contract names the releases it wears (minVersion), keyed as the site reports them', async () => {
  const { slotContracts } = await import('../src/lib/ds-slot.js')
  const VERSION = /^\d+(\.\d+){0,3}$/
  for (const c of slotContracts().filter((x) => x.ready)) {
    assert.ok(c.minVersion && Object.keys(c.minVersion).length > 0, `${c.name}: minVersion`)
    const platform = c.template.split('/')[0]
    for (const [key, v] of Object.entries(c.minVersion)) {
      assert.ok(v === null || VERSION.test(v), `${c.name}: ${key} → ${v}`)
      if (platform === 'wordpress')
        assert.equal(
          templateKeyOf({ platform, stylesheet: key }),
          c.template,
          `${c.name}: ${key} is its stylesheet`
        )
      else assert.match(key, /^[a-z0-9-]+(\/[a-z0-9.-]+)+$/, `${c.name}: ${key} is a quickstart tag`)
    }
  }
})

test('Joomla built from an older quickstart: the panel says why, Apply is refused, nothing is written', async () => {
  const { app, host } = mounted({
    platform: 'joomla',
    template: 'ja_kinetic',
    quickstartTag: 'quickstart/ja-kinetic/j6',
    quickstartVersion: '1.0.3'
  })
  const r = await get(app)
  assert.equal(r.body.supported, false)
  assert.equal(r.body.reason, 'TEMPLATE_NEEDS_UPDATE')
  assert.deepEqual(r.body.version, { need: '1.0.4', have: '1.0.3' })
  const a = await post(app, '', { id: S1, template: r.body.template })
  assert.equal(a.status, 409)
  assert.equal(a.body.code, 'DS_TEMPLATE_CANNOT_WEAR')
  assert.equal(a.body.reason, 'TEMPLATE_NEEDS_UPDATE')
  assert.ok(!host.site.calls.some((c) => c.mode === 'apply'), 'nothing written')
  // Built from the tokenized release: wears it.
  const ok = mounted({
    platform: 'joomla',
    template: 'ja_kinetic',
    quickstartTag: 'quickstart/ja-kinetic/j6',
    quickstartVersion: '1.0.4'
  })
  assert.equal((await post(ok.app, '', { id: S1, template: 'joomla/ja-kinetic' })).status, 200)
})

test('WordPress on an older theme: the hinted write checks the version in its own run and writes nothing', async () => {
  const { app, host } = mounted({ platform: 'wordpress', stylesheet: 'wp-ja-kinetic', themeVersion: '1.1.9' })
  const r = await get(app)
  assert.equal(r.body.reason, 'TEMPLATE_NEEDS_UPDATE')
  assert.deepEqual(r.body.version, { need: '1.1.11', have: '1.1.9' })
  // A caller that sends the template anyway: one run, refused by the site, nothing written.
  const runs = hostRuns(host)
  const a = await post(app, '', { id: S1, template: 'wordpress/wp-ja-kinetic' })
  assert.equal(a.status, 409)
  assert.equal(a.body.reason, 'TEMPLATE_NEEDS_UPDATE')
  assert.deepEqual(
    host.site.calls.slice(runs).map((c) => [c.mode, c.payload?.minTheme ?? null]),
    [['apply', { 'wp-ja-kinetic': '1.1.11' }]]
  )
  assert.equal(host.site.entries.size, 0)
  // The theme updated to the release that wears it: applies.
  host.site.themeVersion = '1.1.11'
  assert.equal((await post(app, '', { id: S1, template: 'wordpress/wp-ja-kinetic' })).status, 200)
})

test('a site whose release is not known (no quickstart version on its row) is never guessed ready', async () => {
  const { app, host } = mounted({ platform: 'emdash', quickstartVersion: null })
  const r = await get(app)
  assert.equal(r.body.reason, 'TEMPLATE_VERSION_UNKNOWN')
  assert.equal((await post(app, '', { id: S1 })).body.reason, 'TEMPLATE_VERSION_UNKNOWN')
  assert.ok(!host.site.calls.some((c) => c.mode === 'apply'))
})

test('Joomla built from a release newer than the last one checked: the panel says which, Apply is refused, nothing is written', async () => {
  const { app, host } = mounted({
    platform: 'joomla',
    template: 'ja_spa',
    quickstartTag: 'quickstart/ja-spa/j6',
    quickstartVersion: '1.0.9'
  })
  const r = await get(app)
  assert.equal(r.body.supported, false)
  assert.equal(r.body.reason, 'TEMPLATE_VERSION_UNCHECKED')
  assert.deepEqual(r.body.version, { need: null, have: '1.0.9', upTo: '1.0.8' })
  const a = await post(app, '', { id: S1, template: 'joomla/ja-spa' })
  assert.equal(a.status, 409)
  assert.equal(a.body.reason, 'TEMPLATE_VERSION_UNCHECKED')
  assert.deepEqual(a.body.version, { need: null, have: '1.0.9', upTo: '1.0.8' })
  assert.ok(!host.site.calls.some((c) => c.mode === 'apply'), 'nothing written')
})

test('WordPress on a theme newer than the last one checked: the hinted write checks it in its own run and writes nothing', async () => {
  const { app, host } = mounted({
    platform: 'wordpress',
    stylesheet: 'wp-ja-kinetic',
    themeVersion: '1.1.20'
  })
  const r = await get(app)
  assert.equal(r.body.reason, 'TEMPLATE_VERSION_UNCHECKED')
  assert.deepEqual(r.body.version, { need: null, have: '1.1.20', upTo: '1.1.19' })
  const runs = hostRuns(host)
  const a = await post(app, '', { id: S1, template: 'wordpress/wp-ja-kinetic' })
  assert.equal(a.status, 409)
  assert.equal(a.body.reason, 'TEMPLATE_VERSION_UNCHECKED')
  assert.deepEqual(
    host.site.calls.slice(runs).map((c) => [c.mode, c.payload?.maxTheme ?? null]),
    [['apply', { 'wp-ja-kinetic': '1.1.19' }]]
  )
  assert.equal(host.site.entries.size, 0)
  host.site.themeVersion = '1.1.19'
  assert.equal((await post(app, '', { id: S1, template: 'wordpress/wp-ja-kinetic' })).status, 200)
})

test('the chat route is closed by default: an apply from a conversation is refused by name, nothing is written', async () => {
  // David, 11/10/2026: the Design system button is the only way in; the chat route stays, switched off
  // (`chat-design-system`). A conversation reaches this door as the person who typed (an actor grant),
  // or with the viewer's cookie and the conversation's `x-tracy-session` on a lane with no gate.
  for (const [platform, kind, headers] of [
    ['emdash', 'actor', {}],
    ['emdash', 'session', { 'x-tracy-session': 'ses-1' }],
    ['wordpress', 'actor', { 'x-tracy-session': 'ses-1' }],
    ['joomla', 'actor', { 'x-tracy-session': 'ses-1' }]
  ]) {
    const { app, host, rows } = mounted({ platform, kind })
    const a = await post(app, '', { id: S1 }, headers)
    assert.equal(a.status, 403, kind)
    assert.equal(a.body.code, 'CHAT_DESIGN_SYSTEM_OFF')
    assert.match(a.body.message, /Design system row/)
    assert.equal(host.site.calls.length, 0, 'nothing reached the site')
    assert.equal(rows.length, 0)
    // Reading what the site wears stays open: element edits are written relative to it.
    const r = await get(app)
    assert.equal(r.status, 200)
  }
})

test('the button press is never governed by the chat switch', async () => {
  const { app, host } = mounted({ chatRoute: async () => false })
  const a = await post(app, '', { id: S1 })
  assert.equal(a.status, 200)
  assert.equal(a.body.ok, true)
  assert.equal(host.site.slot?.id, S1)
})

test('switched on, the chat applies through the same door as the button; unread, it is closed (503)', async () => {
  const on = mounted({ kind: 'actor', chatRoute: async () => true })
  const a = await post(on.app, '', { id: S1 }, { 'x-tracy-session': 'ses-1' })
  assert.equal(a.status, 200)
  assert.equal(on.host.site.slot?.id, S1)
  assert.equal(on.rows.length, 1, 'its own Site changes row, undoable from the toolbar like a press')

  const unread = mounted({
    kind: 'actor',
    chatRoute: async () => {
      throw new Error('connection terminated')
    }
  })
  const b = await post(unread.app, '', { id: S1 })
  assert.equal(b.status, 503)
  assert.equal(b.body.code, 'UI_SETTING_UNREADABLE')
  assert.equal(unread.host.site.calls.length, 0)
})

for (const platform of ['emdash', 'wordpress', 'joomla']) {
  test(`${platform}: switched on, a chat apply is a press's twin — its own Site changes row, undone from the toolbar; off, a press still applies and undoes`, async () => {
    const chat = { 'x-test-kind': 'actor', 'x-tracy-session': 'ses-1' }
    const on = mounted({ platform, chatRoute: async () => true })
    const applied = await post(on.app, '', { id: S1 }, chat)
    assert.equal(applied.status, 200, JSON.stringify(applied.body))
    assert.equal(on.host.site.slot?.id, S1)
    assert.equal(on.records.at(-1).write.action, 'design-system.apply')
    // The toolbar's Undo (a cookie press) takes back what the chat put on.
    const read = await get(on.app)
    assert.equal(read.body.last.applyId, applied.body.applyId)
    const undone = await post(on.app, '/undo', { applyId: applied.body.applyId })
    assert.equal(undone.status, 200, JSON.stringify(undone.body))
    assert.equal(on.host.site.slot, null)

    const off = mounted({ platform })
    const refused = await post(off.app, '', { id: S1 }, chat)
    assert.equal(refused.body.code, 'CHAT_DESIGN_SYSTEM_OFF')
    const pressed = await post(off.app, '', { id: S1 })
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body))
    const back = await post(off.app, '/undo', { applyId: pressed.body.applyId })
    assert.equal(back.status, 200, JSON.stringify(back.body))
  })
}

// ── Walkthrough 11/10/2026, bugs 3 and 4: what a write records so Site changes says one press, one row ──

const asWrite = (r) => ({ ...r.write, actor: r.actor, outcome: r.write.outcome })

for (const platform of ['emdash', 'wordpress', 'joomla']) {
  test(`${platform}: a press records itself as the button's, with the look before it and the files its job wrote`, async () => {
    const { app, records } = mounted({
      platform,
      ...(platform === 'emdash' ? {} : { stylesheet: 'tracy-base' })
    })
    const first = await post(app, '', { id: S1 })
    assert.equal(first.status, 200, JSON.stringify(first.body))
    const second = await post(app, '', { id: S2 })
    assert.equal(second.status, 200, JSON.stringify(second.body))
    await post(app, '/undo', { applyId: second.body.applyId })
    const [a, b, u] = records.map(asWrite)
    for (const w of [a, b, u]) assert.equal(w.target.channel, 'button')
    assert.equal(a.target.from, null, 'the template’s own look before the first apply')
    assert.deepEqual(b.target.from, { id: S1, name: 'Moxie' })
    const files =
      platform === 'wordpress'
        ? [
            `wp-content/uploads/tracy/styles/${variationSlug(S1)}.json`,
            'wp-content/uploads/tracy/inspirations.json'
          ]
        : undefined
    assert.deepEqual(a.target.files, files, 'only WordPress writes files under the webroot')
    assert.equal(u.target.files, undefined, 'an undo writes no file')
    // What Site changes reads off them: Type "Design system", and three different sentences.
    assert.deepEqual(classifyWrites([a]), { source: 'design-system', evidence: 'confirmed' })
    assert.deepEqual(classifyWrites([u]), { source: 'design-system', evidence: 'confirmed' })
    assert.deepEqual(designSystemDescription([a]), {
      key: 'design-system.apply',
      params: { name: 'Moxie' },
      isRequestOnly: false
    })
    assert.deepEqual(designSystemDescription([b]).key, 'design-system.switch')
    // Notion shares its name with another offered system, so the row names it as the library does.
    assert.deepEqual(designSystemDescription([b]).params, { name: 'Notion · notion.so', from: 'Moxie' })
    assert.deepEqual(designSystemDescription([u]), {
      key: 'design-system.undo',
      params: { name: 'Notion · notion.so' },
      isRequestOnly: false
    })
  })
}

test('the chat route’s apply is recorded as the chat’s, and stays Chat in Site changes', async () => {
  const on = mounted({ chatRoute: async () => true })
  const a = await post(on.app, '', { id: S1 }, { 'x-test-kind': 'actor', 'x-tracy-session': 'ses-1' })
  assert.equal(a.status, 200, JSON.stringify(a.body))
  const w = asWrite(on.records.at(-1))
  assert.equal(w.target.channel, 'chat')
  assert.equal(classifyWrites([{ ...w, session_id: w.sessionId }]).source, 'chat')
  // A row from before the door said its channel is not claimed for the button either.
  const legacy = { ...w, target: { ...w.target, channel: undefined }, session_id: 'design-system-x' }
  assert.equal(classifyWrites([legacy]).source, 'chat')
})

test('designSystemDescription: the same system again is an apply; an older row asks the apply’s own record; an unanswered apply says so', () => {
  const w = (target, over = {}) => ({
    via: 'ds-slot',
    action: 'design-system.apply',
    outcome: 'ok',
    target,
    ...over
  })
  assert.equal(
    designSystemDescription([w({ id: 'stripe', title: 'Stripe', from: { id: 'od:stripe', name: 'Stripe' } })])
      .key,
    'design-system.apply'
  )
  // Recorded before the door kept `from`: the `site_design_system` row knows the look before.
  assert.deepEqual(
    designSystemDescription([w({ id: 'spotify', title: 'Spotify', applyId: 'abcdefabcdef' })], {
      system_id: 'spotify',
      system_name: 'Spotify',
      previous_id: 'stripe',
      previous_name: 'Stripe'
    }).params,
    { name: 'Spotify', from: 'Stripe' }
  )
  assert.equal(designSystemDescription([w({ id: 'spotify', title: 'Spotify' })]).key, 'design-system.apply')
  assert.deepEqual(designSystemDescription([w({ id: 'stripe', title: 'Stripe' }, { outcome: 'unknown' })]), {
    key: 'design-system.unsure',
    params: { name: 'Stripe' },
    isRequestOnly: false
  })
  // Not a design system group: the general description stands.
  assert.equal(designSystemDescription([{ via: 'apply', action: 'content.update', target: {} }]), null)
  assert.equal(designSystemDescription([w({ id: 'x' }), { via: 'apply', action: 'content.update' }]), null)
})

test('dsFilesOf keeps only plain webroot-relative paths', () => {
  assert.deepEqual(
    dsFilesOf([
      'wp-content/uploads/tracy/inspirations.json',
      'wp-content/uploads/tracy/inspirations.json',
      '/etc/passwd',
      'a/../b',
      './x',
      '',
      7,
      'wp-content/uploads/tracy/styles/ds-od-stripe.json'
    ]),
    ['wp-content/uploads/tracy/inspirations.json', 'wp-content/uploads/tracy/styles/ds-od-stripe.json']
  )
  assert.deepEqual(dsFilesOf(null), [])
})

// ── the cards' words (walkthrough 11/10/2026, bug 7): a site made straight from a quickstart has no
// `design-preview.json`, so the panel reads the words off the home page the site serves now.

/** A Tracy Business home page as the three CMS serve it, cut to what the reader looks at. */
const HOME = `<!doctype html><html><head><title>Northgate &#8211; Industrial infrastructure</title>
<meta name="description" content="Design–build contractor for industrial parks."></head><body>
<header><p class="wp-block-site-title"><a href="/" rel="home">Northgate</a></p>
<nav><a href="/about/">About</a><a href="/services/">Services</a><a href="/contact/">Contact</a></nav>
<button type="button" class="tracy-lang__toggle" aria-haspopup="dialog" aria-expanded="false">English EN ▼</button>
<button type="button" class="tracy-theme-toggle" aria-pressed="false">Dark</button>
<button type="button" class="tracy-nav__drill-back">Company</button>
<a class="wp-block-button__link wp-element-button" href="/contact/">Request a quote</a></header>
<main><p>Established 2004</p><h1>Building the groundwork for next-generation plants</h1>
<p>Design–build main contractor for industrial park infrastructure and factory buildings.</p>
<a class="wp-block-button__link wp-element-button" href="#">See our capabilities</a></main></body></html>`

test('words: a home page gives the panel its name, heading, lead and calls to action — never a control', async () => {
  const reads = []
  const { app } = mounted({
    platform: 'wordpress',
    home: async (site) => {
      reads.push(site.site_key)
      return HOME
    }
  })
  const r = await app.request('/api/sites/dsbtn.localhost/design-system/words')
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('cache-control'), 'private, no-store')
  const body = await r.json()
  assert.equal(body.present, true)
  assert.equal(body.source, 'home')
  assert.deepEqual(body.site, {
    // WordPress's home title is "name – tagline": the link back home names the site, not the title's tail.
    name: 'Northgate',
    nav: ['About', 'Services', 'Contact'],
    eyebrow: 'Established 2004',
    headline: 'Building the groundwork for next-generation plants',
    sub: 'Design–build main contractor for industrial park infrastructure and factory buildings.',
    // The language picker, the theme switch and the menu's "back" are controls, not invitations.
    cta: 'Request a quote',
    cta2: 'See our capabilities'
  })
  assert.deepEqual(reads, ['dsbtn.localhost'])
})

test('words: kept per site for WORDS_TTL_MS, then read again; a page that could not be read is not kept', async () => {
  let clock = 1_000
  let reads = 0
  let answer = null
  const { app } = mounted({
    home: async () => {
      reads++
      return answer
    },
    now: () => clock
  })
  const words = () => app.request('/api/sites/dsbtn.localhost/design-system/words').then((r) => r.json())
  // The site did not answer: nothing to draw, and the next open asks again.
  assert.deepEqual(await words(), { present: false })
  answer = HOME
  assert.equal((await words()).present, true)
  assert.equal(reads, 2)
  // Reopened within the window: no second page render.
  clock += WORDS_TTL_MS - 1
  assert.equal((await words()).site.name, 'Northgate')
  assert.equal(reads, 2)
  clock += 2
  await words()
  assert.equal(reads, 3)
})

test('words: two panels opened together share one page read', async () => {
  let reads = 0
  let release
  const gate = new Promise((r) => {
    release = r
  })
  const { app } = mounted({
    home: async () => {
      reads++
      await gate
      return HOME
    }
  })
  const one = app.request('/api/sites/dsbtn.localhost/design-system/words')
  const two = app.request('/api/sites/dsbtn.localhost/design-system/words')
  await new Promise((r) => setTimeout(r, 10))
  release()
  const [a, b] = await Promise.all([one, two].map((p) => p.then((r) => r.json())))
  assert.equal(reads, 1)
  assert.deepEqual(a, b)
})

test('words: a failing read, an empty page, or no reader at all is `present: false` — never invented', async () => {
  for (const home of [
    async () => {
      throw new Error('ECONNREFUSED')
    },
    async () => '<html><body><div id="app"></div></body></html>',
    undefined
  ]) {
    const { app } = mounted(home ? { home } : {})
    const body = await app.request('/api/sites/dsbtn.localhost/design-system/words').then((r) => r.json())
    assert.deepEqual(body, { present: false })
  }
  assert.equal(panelWordsOf('<html><body></body></html>'), null)
})

test('words: a seat with no grant on the site reads nothing', async () => {
  let reads = 0
  const app = new Hono()
  mountDesignSystem(app, {
    requireGrant: async (c) => ({ error: c.json({ code: 'FORBIDDEN' }, 403) }),
    siteByKey: async () => {
      throw new Error('never asked')
    },
    toolsetRefusal: async () => null,
    runJob: async () => ({ ok: false }),
    lease: { take: async () => ({ ok: true }), release: async () => {} },
    record: async () => {},
    store: { insert: async () => {}, latest: async () => null, markUndone: async () => {} },
    ds: /** @type {any} */ ({}),
    home: async () => {
      reads++
      return HOME
    }
  })
  const r = await app.request('/api/sites/dsbtn.localhost/design-system/words')
  assert.equal(r.status, 403)
  assert.equal(reads, 0)
})

test('words: a logo link names the site where no rel="home" does (Joomla), and a form submit is a call to action', () => {
  const joomla = `<html><head><title>Kinetic — Observability, reimagined</title></head><body>
<a href="/" class="kinetic-logo" aria-label="Kinetic home"><svg></svg></a>
<button type="button" class="close js-offcanvas-close" aria-label="Close menu">&times;</button>
<h1>Ship fast. Sleep through the night.</h1>
<form><button type="submit">Start free</button></form></body></html>`
  const w = panelWordsOf(joomla)
  assert.equal(w?.name, 'Kinetic')
  assert.equal(w?.headline, 'Ship fast. Sleep through the night.')
  assert.equal(w?.cta, 'Start free')
  // An EmDash page that names itself in `og:site_name` keeps that name.
  const emdash = `<html><head><title>Home — Northgate Industrial</title>
<meta property="og:site_name" content="Northgate Industrial"></head><body>
<a href="/" class="brand-mark"><img alt="NG"></a><h1>Building plants</h1>
<a href="/contact" class="btn-forest">Request a quote</a></body></html>`
  assert.equal(panelWordsOf(emdash)?.name, 'Northgate Industrial')
  assert.equal(panelWordsOf(emdash)?.cta, 'Request a quote')
})

// 🔒 THE PRESS NEVER WAITS FOR A COLD PAGE (walkthrough finding 11, 11/10/2026). On `dswalkem02` the
// write took ~0.1 s but the first two applies answered after 8.4 s and 5.5 s: the door's one page load
// (`seen`) was the first render of a server a rebuild had just restarted. The door now answers once its
// wait is over, `seen: null`; the read goes on by itself and warms the site.
test('apply: a page load slower than the door’s wait answers seen null, without waiting for it', async () => {
  let finished = false
  const slow = () =>
    new Promise((resolve) =>
      setTimeout(() => {
        finished = true
        resolve(true)
      }, 400)
    )
  const { app } = mounted({ seen: slow, seenWaitMs: 50 })
  const t0 = Date.now()
  const r = await post(app, '', { id: S1 })
  const took = Date.now() - t0
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.ok, true)
  assert.equal(r.body.seen, null, 'not read in time: unknown, never false')
  assert.ok(took < 350, `answered in ${took} ms, before the slow page (400 ms)`)
  assert.equal(finished, false, 'the page load is still running when the door answers')
  await new Promise((resolve) => setTimeout(resolve, 450))
  assert.equal(finished, true, 'and it ends by itself')
})

test('apply: a page load within the wait is said, true or false; a failed one is null', async () => {
  for (const [seen, want] of [
    [async () => true, true],
    [async () => false, false],
    [async () => Promise.reject(new Error('ECONNRESET')), null]
  ]) {
    const { app } = mounted({ seen, seenWaitMs: 1000 })
    const r = await post(app, '', { id: S1 })
    assert.equal(r.status, 200)
    assert.equal(r.body.seen, want)
  }
  assert.equal(SEEN_WAIT_MS, 1500)
})

// ── The customer lock (Akemi, 15/10/2026): customers put a design system only on templates /ops says are ready. ──

/** The lock as `sites/route.js` builds it, with who is staff decided by the test. */
const lockWith = (staff) =>
  customerLock({
    isStaff: async (email) => staff.has(email),
    // what /ops says is ready in these tests (`lib/design-system-ready-templates.js` reads it for real)
    isReady: async (key) => key === 'joomla/tracy-business' || key === 'emdash/tracy-business'
  })

/** A template with a ready contract that is not on the customers' list: Tracy Base on WordPress. */
const LOCKED_SITE = { platform: 'wordpress', stylesheet: 'tracy-base' }

test('customer lock: a customer on a locked template reads "not ready" and cannot apply; nothing is written', async () => {
  const { app, host } = mounted({ ...LOCKED_SITE, customerLock: lockWith(new Set()) })
  const r = await get(app)
  assert.equal(r.status, 200)
  assert.equal(r.body.supported, false)
  assert.equal(r.body.reason, 'TEMPLATE_NOT_READY')
  assert.equal(r.body.locked, true)
  const before = host.site.calls.length
  const a = await post(app, '', { id: S1 })
  assert.equal(a.status, 403)
  assert.equal(a.body.code, 'DS_TEMPLATE_LOCKED')
  assert.equal(host.site.calls.filter((c) => c.mode === 'apply').length, 0, 'no write reached the host')
  assert.ok(host.site.calls.length >= before)
  assert.equal(host.site.slot, null, 'the site keeps the template look')
})

test('customer lock: the chat route and a new site build are refused the same way', async () => {
  const { app, server, host } = mounted({
    ...LOCKED_SITE,
    customerLock: lockWith(new Set()),
    chatRoute: async () => true
  })
  const chat = await post(app, '', { id: S1 }, { 'x-tracy-session': 'sess-1' })
  assert.equal(chat.status, 403)
  assert.equal(chat.body.code, 'DS_TEMPLATE_LOCKED')
  const built = await server.applyAs('dsbtn.localhost', { email: 'a@x.test', id: S1 })
  assert.equal(built.status, 403)
  assert.equal(built.body.code, 'DS_TEMPLATE_LOCKED')
  assert.equal(host.site.calls.filter((c) => c.mode === 'apply').length, 0)
})

test('customer lock: staff keep every template (read supported, apply lands)', async () => {
  const { app, host } = mounted({ ...LOCKED_SITE, customerLock: lockWith(new Set(['a@x.test'])) })
  const r = await get(app)
  assert.equal(r.body.supported, true)
  assert.equal(r.body.locked, undefined)
  const a = await post(app, '', { id: S1 })
  assert.equal(a.status, 200, JSON.stringify(a.body))
  assert.equal(host.site.slot.id, S1)
})

test('customer lock: Tracy Business on Joomla stays open to customers', async () => {
  const { app, host } = mounted({
    platform: 'joomla',
    template: 'tracy_business',
    quickstartTag: 'tracy-business/j6',
    quickstartVersion: '1.2.1',
    customerLock: lockWith(new Set())
  })
  const r = await get(app)
  assert.equal(r.body.template, 'joomla/tracy-business')
  assert.equal(r.body.supported, true, JSON.stringify(r.body))
  const a = await post(app, '', { id: S1, template: r.body.template })
  assert.equal(a.status, 200, JSON.stringify(a.body))
  assert.equal(host.site.slot.id, S1)
})

test('customer lock: Tracy Business on EmDash stays open to customers', async () => {
  const { app, host } = mounted({ customerLock: lockWith(new Set()) })
  const r = await get(app)
  assert.equal(r.body.template, 'emdash/tracy-business')
  assert.equal(r.body.supported, true, JSON.stringify(r.body))
  assert.equal(r.body.locked, undefined)
  const a = await post(app, '', { id: S1, template: r.body.template })
  assert.equal(a.status, 200, JSON.stringify(a.body))
  assert.equal(host.site.slot.id, S1)
})

test('customer lock: a site that already wears a system keeps it, still names it, and can still undo it', async () => {
  let on = false
  const lock = lockWith(new Set())
  const { app, host } = mounted({
    ...LOCKED_SITE,
    customerLock: { blocked: (e, t) => (on ? lock.blocked(e, t) : false) }
  })
  const a = await post(app, '', { id: S1 })
  assert.equal(a.status, 200)
  on = true
  const r = await get(app)
  assert.equal(r.body.locked, true)
  assert.equal(r.body.worn.id, S1, 'the worn system is still named')
  assert.equal(r.body.last.applyId, a.body.applyId)
  assert.equal(host.site.slot.id, S1, 'nothing was stripped')
  const another = await post(app, '', { id: S2 })
  assert.equal(another.status, 403, 'no new pick')
  const undone = await post(app, '/undo', { applyId: a.body.applyId })
  assert.equal(undone.status, 200, JSON.stringify(undone.body))
  assert.equal(host.site.slot, null)
})

// The Template default card, applied for real (15/10/2026): the worn system taken off through the host's
// `site-ds-slot` mode `clear`, kept as an apply of its own so its undo puts the system back.
const DEFAULT = 'template-default'

for (const platform of ['emdash', 'wordpress', 'joomla'])
  test(`${platform}: after two applies, Template default takes the system off; its undo brings the second back`, async () => {
    const { app, host, rows, records } = mounted({ platform })
    await post(app, '', { id: S1 })
    const second = await post(app, '', { id: S2 })
    assert.equal(second.status, 200, JSON.stringify(second.body))

    const back = await post(app, '', { id: DEFAULT })
    assert.equal(back.status, 200, JSON.stringify(back.body))
    assert.equal(host.site.calls.at(-1).mode, 'clear')
    assert.equal(host.site.slot, null, 'nothing worn on the site')
    assert.equal(back.body.worn, null)
    assert.equal(back.body.previous.id, S2)
    assert.equal(back.body.read.worn, null, 'the panel reads the template look without asking again')
    assert.equal(back.body.read.last.id, DEFAULT)
    assert.equal(back.body.read.last.previous.id, S2)
    assert.equal(back.body.read.last.undone, false)
    assert.equal(rows.at(-1).system_name, 'Template default')
    const row = records.at(-1)
    assert.equal(row.write.action, 'design-system.apply')
    assert.equal(row.write.target.id, DEFAULT)
    assert.equal(row.write.target.from.id, S2)
    assert.deepEqual(designSystemDescription([row.write]), {
      key: 'design-system.switch',
      params: { name: 'Template default', from: 'Notion · notion.so' },
      isRequestOnly: false
    })

    const undone = await post(app, '/undo', { applyId: back.body.applyId })
    assert.equal(undone.status, 200, JSON.stringify(undone.body))
    assert.equal(undone.body.worn.id, S2)
    assert.equal(host.site.slot.id, S2)

    // And back again: the same door works on and on.
    const again = await post(app, '', { id: DEFAULT })
    assert.equal(again.status, 200, JSON.stringify(again.body))
    assert.equal(host.site.slot, null)
  })

test('Template default still goes back after the newest apply was undone (the first system worn again)', async () => {
  const { app, host } = mounted()
  const first = await post(app, '', { id: S1 })
  const second = await post(app, '', { id: S2 })
  await post(app, '/undo', { applyId: second.body.applyId })
  assert.equal(host.site.slot.id, S1)
  // The old way back (undo the first) is closed: it is not the newest apply.
  assert.equal((await post(app, '/undo', { applyId: first.body.applyId })).body.code, 'DS_NOT_LATEST')
  const back = await post(app, '', { id: DEFAULT })
  assert.equal(back.status, 200, JSON.stringify(back.body))
  assert.equal(host.site.slot, null)
  assert.equal(back.body.previous.id, S1)
  const undone = await post(app, '/undo', { applyId: back.body.applyId })
  assert.equal(undone.body.worn.id, S1)
})

test('Template default on a site wearing nothing writes nothing and says so', async () => {
  const { app, rows, records } = mounted()
  const r = await post(app, '', { id: DEFAULT })
  assert.equal(r.status, 409)
  assert.equal(r.body.code, 'DS_NOTHING_WORN')
  assert.equal(rows.length, 0)
  assert.equal(records.length, 0)
})

test('Template default: a viewer is refused before anything reaches the host', async () => {
  const { app, host } = mounted({ role: 'viewer' })
  const r = await post(app, '', { id: DEFAULT })
  assert.equal(r.status, 403)
  assert.equal(r.body.code, 'TOOLSET_NOT_GRANTED')
  assert.equal(host.site.calls.length, 0)
})

test('customer lock: a locked template can always go back to Template default', async () => {
  let on = false
  const lock = lockWith(new Set())
  const { app, host } = mounted({
    ...LOCKED_SITE,
    customerLock: { blocked: (e, t) => (on ? lock.blocked(e, t) : false) }
  })
  await post(app, '', { id: S1 })
  on = true
  const back = await post(app, '', { id: DEFAULT })
  assert.equal(back.status, 200, JSON.stringify(back.body))
  assert.equal(host.site.slot, null)
  assert.equal(back.body.read.locked, true, 'still closed to a new system')
})

test('Template default is no library system: a new site build and a create request cannot carry it', async () => {
  const { server } = mounted()
  assert.deepEqual(await server.checkSystem(DEFAULT), { ok: false, code: 'DS_UNKNOWN' })
  const built = await server.applyAs('dsbtn.localhost', { email: 'a@x.test', id: DEFAULT })
  assert.equal(built.status, 400)
  assert.equal(built.body.code, 'DS_UNKNOWN')
})
