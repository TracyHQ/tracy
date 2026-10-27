/**
 * The chat route to a design system and its switch (`chat-design-route.mjs`; David, 11/10/2026: the
 * Design system button is the only way in, the chat route stays and is turned off by
 * `chat-design-system`). Real modules; Tracy's `/api/ui` and the button's door are fetch doubles.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  callDesignSystemDoor,
  chatRouteLine,
  chatRouteRefusal,
  DESIGN_SYSTEM_DESCRIPTION,
  designSystemArgs,
  designSystemRequest
} from '../src/host/chat-design-route.mjs'
import { designRoutesAt } from '../src/host/chat-design-switch.mjs'
import { DEFERRED_TOOLS, namedDeferredTools } from '../src/host/deferred-tools.mjs'
import { siteContext } from '../src/host/site-context.mjs'

/** Tracy's `/api/ui` answering `hidden`, or failing with `status`. */
const tracyUi =
  (hidden, status = 200) =>
  async (url) => {
    assert.match(String(url), /\/api\/ui$/)
    return new Response(JSON.stringify({ hidden }), { status })
  }

test('the switch is read at Tracy; off, unreadable or no origin is OFF', async () => {
  assert.deepEqual(await designRoutesAt('https://tracy.test', tracyUi([])), { chat: true, button: true })
  assert.deepEqual(await designRoutesAt('https://tracy.test', tracyUi(['chat-design-system'])), {
    chat: false,
    button: true
  })
  assert.deepEqual(
    await designRoutesAt('https://tracy.test', tracyUi(['chat-design-system', 'toolbar-design-system'])),
    { chat: false, button: false }
  )
  assert.deepEqual(await designRoutesAt('https://tracy.test', tracyUi([], 503)), {
    chat: false,
    button: true
  })
  assert.deepEqual(await designRoutesAt(null), { chat: false, button: true })
})

test('off: the refusal and the context line point at the Design system button, in one sentence, and change nothing', () => {
  const refusal = chatRouteRefusal(true)
  assert.equal(refusal.code, 'CHAT_DESIGN_SYSTEM_OFF')
  assert.match(
    refusal.error,
    /Change nothing; tell the customer in one plain sentence, in their language, to use the Design system row on the site's start screen/
  )
  const line = chatRouteLine({ chat: false, button: true })
  assert.match(line ?? '', /^- Design systems through the chat: OFF/)
  assert.match(line ?? '', /pasting a DESIGN\.md/)
  assert.match(line ?? '', /whole new look/)
  assert.match(line ?? '', /Design system row on the site's start screen/)
  assert.match(
    line ?? '',
    /named by the label the screen shows in their interface language, never a description of your own/
  )
  assert.match(
    line ?? '',
    /a button, a colour, a section or one page is still changed as asked, relative to the design system the site wears/
  )
  assert.deepEqual(namedDeferredTools(line), [], 'the line names no tool the agent may not see yet')
  // No button to point at: the sentence says it is not available, never a button that is not there.
  assert.ok(!/button/i.test(chatRouteRefusal(false).error.split('Change nothing;')[1] ?? ''))
  // On: no line; the skill leads.
  assert.equal(chatRouteLine({ chat: true, button: true }), null)
  assert.equal(chatRouteLine(null), null)
})

test('the site context carries the line only when the caller read the switch off', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'chat-route-'))
  mkdirSync(path.join(folder, '.tracy'), { recursive: true })
  mkdirSync(path.join(folder, '.webroot'))
  writeFileSync(path.join(folder, '.tracy', 'site.json'), JSON.stringify({ siteKey: 'shop.tracy.test' }))
  const detect = async () => 'wordpress'
  const off = await siteContext(folder, 'shop', detect, null, { chatDesign: { chat: false, button: true } })
  assert.match(off?.text ?? '', /- Design systems through the chat: OFF/)
  const on = await siteContext(folder, 'shop', detect, null, { chatDesign: { chat: true, button: true } })
  assert.ok(!/Design systems through the chat/.test(on?.text ?? ''))
  const unasked = await siteContext(folder, 'shop', detect, null)
  assert.ok(
    !/Design systems through the chat/.test(unasked?.text ?? ''),
    'a caller that read nothing adds nothing'
  )
})

test("tracy_design_system: read or apply {id}, to the button's door, named as this conversation, deferred to the design road", () => {
  assert.equal(DEFERRED_TOOLS.tracy_design_system, 'design')
  assert.ok(DESIGN_SYSTEM_DESCRIPTION.length <= 400)
  assert.deepEqual(designSystemArgs({ action: 'read' }), { ok: true, action: 'read' })
  const refero = 'refero:0b9d2c1e-4a5f-4c8e-9d7a-1f2e3d4c5b6a'
  assert.deepEqual(designSystemArgs({ action: 'apply', id: refero }), {
    ok: true,
    action: 'apply',
    id: refero
  })
  // The door applies Refero ids only since 12/10/2026; an OpenDesign id is refused before the call.
  assert.equal(designSystemArgs({ action: 'apply', id: 'stripe' }).code, 'BAD_ID')
  assert.equal(designSystemArgs({ action: 'apply', id: 'od:stripe' }).code, 'BAD_ID')
  assert.equal(designSystemArgs({ action: 'apply' }).code, 'BAD_ID')
  assert.equal(designSystemArgs({ action: 'apply', id: '../x' }).code, 'BAD_ID')
  assert.equal(designSystemArgs({ action: 'undo' }).code, 'BAD_ACTION')

  const plan = { as: 'prompter', assertion: 'signed:a@x.test', sign: () => 'fresh:a@x.test' }
  const where = {
    origin: 'https://tracy.test/',
    siteKey: 'shop.tracy.test',
    label: 'shop',
    sessionId: 'ses-1'
  }
  const apply = designSystemRequest(plan, where, { action: 'apply', id: refero })
  assert.equal(apply?.url, 'https://tracy.test/api/sites/shop.tracy.test/design-system')
  assert.equal(apply?.init.method, 'POST')
  assert.equal(apply?.init.headers['x-tracy-actor'], 'fresh:a@x.test')
  assert.equal(
    apply?.init.headers['x-tracy-session'],
    'ses-1',
    'the door tells a chat call from a press by it'
  )
  assert.equal(apply?.init.headers['x-tracy-workspace-label'], 'shop')
  assert.equal(apply?.init.body, JSON.stringify({ id: refero }))
  const read = designSystemRequest({ as: 'viewer', cookie: 'tracy_session=v' }, where, { action: 'read' })
  assert.equal(read?.init.method, 'GET')
  assert.equal(read?.init.headers.cookie, 'tracy_session=v')
  assert.equal(designSystemRequest(null, where, { action: 'read' }), null)
  assert.equal(designSystemRequest(plan, { ...where, siteKey: null }, { action: 'read' }), null)
})

test("the door's refusal reaches the agent whole, with its status", async () => {
  const refused = await callDesignSystemDoor(
    { url: 'https://tracy.test/api/sites/s/design-system', init: { method: 'POST', headers: {} } },
    async () =>
      new Response(JSON.stringify({ code: 'CHAT_DESIGN_SYSTEM_OFF', message: 'Change nothing; …' }), {
        status: 403
      })
  )
  assert.deepEqual(refused, {
    ok: false,
    httpStatus: 403,
    code: 'CHAT_DESIGN_SYSTEM_OFF',
    message: 'Change nothing; …'
  })
  const applied = await callDesignSystemDoor(
    { url: 'https://tracy.test/api/sites/s/design-system', init: { method: 'POST', headers: {} } },
    async () => new Response(JSON.stringify({ ok: true, applyId: 'abc' }), { status: 200 })
  )
  assert.deepEqual(applied, { ok: true, applyId: 'abc' })
  const down = await callDesignSystemDoor({ url: 'x', init: {} }, async () => {
    throw new Error('offline')
  })
  assert.equal(down.code, 'COWORK_WEB_UNREACHABLE')
})

test('off, element edits keep their rule: the slot line stays beside the OFF line on all three CMS', async () => {
  for (const platform of ['emdash', 'wordpress', 'joomla']) {
    const folder = mkdtempSync(path.join(tmpdir(), `chat-route-${platform}-`))
    mkdirSync(path.join(folder, '.tracy'), { recursive: true })
    mkdirSync(path.join(folder, '.webroot'))
    writeFileSync(
      path.join(folder, '.tracy', 'site.json'),
      JSON.stringify({ siteKey: `s-${platform}.tracy.test` })
    )
    const slot = {
      id: 'od:stripe',
      name: 'Stripe',
      where: 'the slot sheet',
      vars: ['--ds-c-accent', '--ds-btn-radius', '--ds-btn-pad-y'],
      platform
    }
    const context = await siteContext(folder, `s-${platform}`, async () => platform, null, {
      slot,
      chatDesign: { chat: false, button: true }
    })
    const text = context?.text ?? ''
    assert.match(
      text,
      /- Design system: Stripe \(`od:stripe`\), worn through Tracy's design-system slot/,
      platform
    )
    assert.match(text, /write each of those values relative to them/, platform)
    assert.match(text, /- Design systems through the chat: OFF/, platform)
    assert.ok(
      text.indexOf('- Design system: Stripe') < text.indexOf('- Design systems through the chat: OFF'),
      `${platform}: the OFF line follows the worn system`
    )
  }
})
