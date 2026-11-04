// A form the plan hides on a contact page: Joomla draws it from the page's own setting. Every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { closeForms } from '../src/write-step/form-close.js'

const kit = {
  blocks: [
    { id: 'body-reach', source: { entity: 'contact-3', ownerKind: 'contact page' } },
    { id: 'block-news', source: { entity: 'module-9' } }
  ],
  pages: [{ id: 'page-reach', path: '/reach', blocks: { 1440: ['body-reach'] } }]
}
const planOf = (forms, decision = 'keep') => ({
  site: { forms },
  pages: [{ id: 'page-reach', decision, blocks: [] }]
})
const HIDE = { block: 'body-reach', decision: 'hide', why: 'no address' }

function door(refuse = null) {
  const calls = []
  return {
    calls,
    apply: async ({ action, params }) => {
      if (action === 'content.list')
        return {
          ok: true,
          items:
            params.offset === 0
              ? [{ id: 7, path: 'reach', published: 1, params: '{"menu_text":1,"show_email_form":""}' }]
              : []
        }
      calls.push({ action, params })
      return refuse ? { ok: false, error: 'locked', message: refuse } : { ok: true }
    }
  }
}

test('a hidden form of a contact page is closed by its menu item, every other setting kept, and read back there', async () => {
  const site = door()
  const lines = await closeForms({ door: site, siteKey: 's', plan: planOf([HIDE]), kit })
  assert.equal(site.calls.length, 1)
  const { action, params } = site.calls[0]
  assert.equal(action, 'content.update')
  assert.deepEqual([params.kind, params.id], ['menuItem', 7])
  assert.ok(params.apply_id)
  assert.deepEqual(JSON.parse(params.fields.params), { menu_text: 1, show_email_form: '0' })
  assert.equal(lines.length, 1)
  assert.deepEqual(
    [lines[0].slot, lines[0].status, lines[0].owner, lines[0].ordered],
    ['body-reach', 'hidden', 'plan', '0']
  )
  assert.deepEqual(lines[0].readFrom, {
    action: 'content.get',
    params: { kind: 'menuItem', id: 7 },
    path: ['item', 'params', 'show_email_form']
  })
})

test('a refusal is a failed line in the plugin’s words', async () => {
  const lines = await closeForms({ door: door('in use'), siteKey: 's', plan: planOf([HIDE]), kit })
  assert.equal(lines[0].status, 'failed')
  assert.match(lines[0].reason, /in use/)
})

test('a form kept, a form of another block, and a page the plan drops ask nothing', async () => {
  for (const plan of [
    planOf([{ ...HIDE, decision: 'keep' }]),
    planOf([{ block: 'block-news', decision: 'hide' }]),
    planOf([HIDE], 'drop'),
    { pages: [] }
  ]) {
    const site = door()
    assert.deepEqual(await closeForms({ door: site, siteKey: 's', plan, kit }), [])
    assert.equal(site.calls.length, 0)
  }
})
