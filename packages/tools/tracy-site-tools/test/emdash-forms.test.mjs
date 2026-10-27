/**
 * The form door of `tracy_emdash` (local round 18, 25/10/2026): Tracy-side form_list / form_words over the EmDash
 * forms plugin's admin routes, exec stubbed at the `forms` seam. Words only: what a visitor reads changes, the form's
 * fields, names, recipients and webhook stay.
 *
 *   node --test packages/tools/tracy-site-tools/test/emdash-forms.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { createEmdashState, runEmdashTool } from '../src/host/emdash-call.mjs'
import { EMDASH_DESCRIPTION, emdashRedirectReply, emdashWriteTool } from '../src/host/emdash.mjs'
import { FORMS_SCRIPT, formsArgv, parseFormsExec } from '../src/host/exec.mjs'

const FORM = {
  id: '01M5AJ3EPF2YB3MZZ9GGKDAA05',
  name: 'Quote request',
  slug: 'quote',
  status: 'active',
  pages: [
    {
      title: 'Your project',
      fields: [
        {
          id: 'f1',
          type: 'text',
          name: 'name',
          label: 'Full name',
          placeholder: 'Ivan Petrov',
          required: true
        },
        {
          id: 'f2',
          type: 'select',
          name: 'topic',
          label: 'Request',
          required: true,
          options: [
            { label: 'Construction quote', value: 'quote' },
            { label: 'Site survey', value: 'survey' }
          ]
        }
      ]
    }
  ],
  settings: {
    submitLabel: 'Send request',
    confirmationMessage: 'We will call you back.',
    notifyEmails: ['owner@template.test'],
    webhookUrl: 'https://hooks.template.test/x'
  }
}
const ok = (data) => emdashRedirectReply(200, JSON.stringify({ success: true, data }))

function fake(onUpdate = (body) => ok({ ...FORM, ...body })) {
  const requests = []
  return {
    requests,
    forms: async (r) => {
      requests.push(r)
      return r.route === 'forms/list' ? ok({ items: [FORM], hasMore: false }) : onUpdate(JSON.parse(r.body))
    }
  }
}
const run = (f, args) =>
  runEmdashTool({
    args,
    site: { label: 'q-patisserie' },
    artifact: { locales: { default: 'en' } },
    mcp: async () => assert.fail('a form never goes over MCP'),
    forms: f.forms,
    state: createEmdashState(),
    sessionId: 's',
    turn: 1,
    sleep: async () => {}
  })

test('form_list names the forms, and with an id answers that form by its words, never its recipients or webhook', async () => {
  const f = fake()
  const listed = await run(f, { tool: 'form_list', arguments: {} })
  assert.deepEqual(listed.result.forms, [{ id: FORM.id, name: 'Quote request', slug: 'quote' }])
  const out = await run(f, { tool: 'form_list', arguments: { id: FORM.id } })
  assert.equal(out.ok, true)
  assert.deepEqual(f.requests[0], { route: 'forms/list', body: '{}' })
  const form = out.result.form
  assert.equal(form.id, FORM.id)
  assert.deepEqual(form.pages[0].fields[1].options, ['Construction quote', 'Site survey'])
  assert.equal(form.submitLabel, 'Send request')
  assert.ok(!JSON.stringify(out).includes('owner@template.test'))
  assert.ok(!JSON.stringify(out).includes('hooks.template.test'))
  assert.equal(emdashWriteTool({ tool: 'form_list', arguments: {} }, out), null, 'a list is no write')
})

test('form_words sends the form back with only its words changed', async () => {
  const f = fake()
  const out = await run(f, {
    tool: 'form_words',
    arguments: {
      id: FORM.id,
      fields: {
        f1: { label: 'Your name', placeholder: 'Jane Doe' },
        f2: { label: 'About', options: ['Special order cake', 'Gift certificate'] }
      },
      pages: ['Write to the shop'],
      submitLabel: 'Send'
    }
  })
  assert.equal(out.ok, true, JSON.stringify(out))
  const update = JSON.parse(f.requests[1].body)
  assert.equal(f.requests[1].route, 'forms/update')
  assert.deepEqual(Object.keys(update).sort(), ['id', 'pages', 'settings'])
  assert.deepEqual(update.settings, { submitLabel: 'Send' })
  const [name, topic] = update.pages[0].fields
  assert.deepEqual(name, { ...FORM.pages[0].fields[0], label: 'Your name', placeholder: 'Jane Doe' })
  assert.deepEqual(topic.options, [
    { label: 'Special order cake', value: 'quote' },
    { label: 'Gift certificate', value: 'survey' }
  ])
  assert.equal(topic.name, 'topic')
  assert.equal(update.pages[0].title, 'Write to the shop')
  assert.equal(out.result.form.submitLabel, 'Send')
  assert.equal(emdashWriteTool({ tool: 'form_words', arguments: {} }, out), 'form_words')
})

test('form_words refuses what is not a word, an unknown field and another count of options, writing nothing', async () => {
  for (const [args, said] of [
    [{ fields: { f1: { label: 'x' } } }, /needs id/],
    [{ id: FORM.id }, /changes nothing/],
    [{ id: FORM.id, fields: { f1: { name: 'email' } } }, /not a word of a field/],
    [{ id: FORM.id, fields: { f1: { required: false } } }, /not a word of a field/],
    [{ id: FORM.id, fields: { f1: { label: '' } } }, /1–1000 characters/],
    [{ id: FORM.id, notifyEmails: ['me@evil.test'], submitLabel: 'Go' }, null],
    [{ id: FORM.id, fields: { f9: { label: 'x' } } }, /f9: no such field/],
    [{ id: FORM.id, fields: { f2: { options: ['Only one'] } } }, /Keep their count/],
    [{ id: 'NOPE', submitLabel: 'Go' }, /no such form/]
  ]) {
    const f = fake()
    const out = await run(f, { tool: 'form_words', arguments: args })
    if (said === null) {
      // A key that is no word is never sent: the update carries the words only.
      assert.equal(out.ok, true)
      assert.deepEqual(JSON.parse(f.requests[1].body).settings, { submitLabel: 'Go' })
      continue
    }
    assert.equal(out.code, 'BAD_CALL', JSON.stringify(args))
    assert.match(out.error, said)
    assert.ok(!f.requests.some((r) => r.route === 'forms/update'), JSON.stringify(args))
  }
})

test("EmDash's refusal keeps its class; no door says so", async () => {
  const f = fake(() =>
    emdashRedirectReply(
      404,
      JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Form not found' } }),
      'FORMS_ERROR'
    )
  )
  const out = await run(f, { tool: 'form_words', arguments: { id: FORM.id, submitLabel: 'Go' } })
  assert.equal(out.code, 'TOOL_FAILED')
  assert.equal(out.emdash, 'NOT_FOUND')
  const none = await runEmdashTool({
    args: { tool: 'form_list', arguments: {} },
    site: { label: 'x' },
    mcp: async () => assert.fail('no MCP'),
    state: createEmdashState(),
    sleep: async () => {}
  })
  assert.equal(none.code, 'BAD_CALL')
  assert.match(EMDASH_DESCRIPTION, /Forms: form_list, form_words/)
})

test('formsArgv / parseFormsExec: root exec, the route as argv, two routes only, the token never on argv', () => {
  const argv = formsArgv({ container: 'x-web-1', route: 'forms/update' })
  assert.deepEqual(argv.slice(0, 5), ['exec', '-i', '-u', '0', 'x-web-1'])
  assert.equal(argv.at(-1), 'forms/update')
  assert.ok(FORMS_SCRIPT.includes('/_emdash/api/plugins/emdash-forms/'))
  assert.ok(FORMS_SCRIPT.includes('["forms/list","forms/update"].includes(route)'))
  assert.ok(FORMS_SCRIPT.includes('redirect:"error"'))
  assert.deepEqual(parseFormsExec('TRACY_FORMS 200\n{"success":true}'), {
    ok: true,
    status: 200,
    body: '{"success":true}'
  })
  assert.equal(parseFormsExec('TRACY_MCP_ERR NO_TOKEN the agent token file is not present').kind, 'no-token')
  assert.equal(parseFormsExec('TRACY_FORMS_ERR SITE bad request').kind, 'transport')
  assert.equal(parseFormsExec('').ok, false)
})

test('{list:true, tools:["form_words"]} answers the form door’s own schema', async () => {
  const out = await runEmdashTool({
    args: { list: true, tools: ['form_words'] },
    site: { label: 'q-patisserie' },
    mcp: async () => ({ ok: true, result: { tools: [] } }),
    state: createEmdashState(),
    sleep: async () => {}
  })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(out.tools[0].name, 'form_words')
  assert.deepEqual(Object.keys(out.tools[0].inputSchema.properties.fields.additionalProperties.properties), [
    'label',
    'placeholder',
    'helpText',
    'options'
  ])
})
