import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultRegistry, validateRegistry, resolveFields } from '../src/invitations/real-fields.js'
const headers = ['email', 'cong_ty', 'goi', 'template_tai_gan_nhat', 'website', 'full_name']
function registry(field = {}) {
  const r = defaultRegistry(headers)
  r.fields.push({
    key: 'custom.opening_line',
    label: 'Opening line',
    source: { kind: 'manual' },
    missing: 'default',
    defaultValue: 'Field default',
    ...field
  })
  return r
}
const rawSource = {
  headers,
  values: ['synthetic@example.test', '', 'Synthetic plan', '', '', 'Not a confirmed first name']
}
test('manual scalar fields resolve recipient before group before campaign before configured default', () => {
  const r = registry()
  r.campaignValues['custom.opening_line'] = 'Campaign'
  r.groupValues.group_1 = { 'custom.opening_line': 'Group' }
  assert.equal(
    resolveFields({
      registry: r,
      rawSource,
      group: 'group_1',
      recipientValues: { 'custom.opening_line': 'Recipient' }
    }).values['custom.opening_line'],
    'Recipient'
  )
  assert.equal(
    resolveFields({
      registry: r,
      rawSource,
      group: 'group_1',
      recipientValues: { 'custom.opening_line': ' ' }
    }).values['custom.opening_line'],
    'Group'
  )
  assert.equal(
    resolveFields({ registry: r, rawSource, group: 'group_2' }).values['custom.opening_line'],
    'Campaign'
  )
  r.campaignValues = {}
  assert.equal(
    resolveFields({ registry: r, rawSource, group: 'group_2' }).values['custom.opening_line'],
    'Field default'
  )
})
test('column mappings are explicit, missing stays absent, manual overrides cannot mutate raw source', () => {
  const r = registry({ source: { kind: 'column', column: 'full_name' }, missing: 'required' })
  const before = structuredClone(rawSource)
  const v = resolveFields({ registry: r, rawSource, group: 'group_1' })
  assert.equal(v.values['custom.opening_line'], 'Not a confirmed first name')
  assert.equal(v.values.first_name, 'there')
  assert.equal(v.presence.company, false)
  assert.equal(v.values.group, 'Active agencies')
  assert.deepEqual(rawSource, before)
  assert.throws(() =>
    resolveFields({
      registry: r,
      rawSource,
      group: 'group_1',
      recipientValues: { 'custom.opening_line': 'Override' }
    })
  )
  r.fields.at(-1).source.column = 'not_selected'
  assert.throws(() => validateRegistry({ registry: r, headers }))
})
test('registry rejects duplicate, prototype, reserved, executable and URL definitions and unknown value targets', () => {
  for (const key of [
    'custom.__proto__',
    'custom.constructor',
    'custom.prototype',
    'custom.invitation_url',
    'custom.unsubscribe_url',
    'custom.eligibility',
    'company',
    'invitation_url',
    'custom.Bad',
    'custom.a-b'
  ])
    assert.throws(() => validateRegistry({ registry: registry({ key }), headers }))
  for (const source of [
    { kind: 'url', column: 'website' },
    { kind: 'code', expression: '1' },
    { kind: 'manual', expression: '1' }
  ])
    assert.throws(() => validateRegistry({ registry: registry({ source }), headers }))
  const duplicate = registry()
  duplicate.fields.push({ ...duplicate.fields.at(-1) })
  assert.throws(() => validateRegistry({ registry: duplicate, headers }))
  const r = registry()
  r.campaignValues.invitation_url = 'https://example.test'
  assert.throws(() => validateRegistry({ registry: r, headers }))
  assert.throws(() =>
    validateRegistry({
      registry: JSON.parse('{"fields":[],"revision":1,"campaignValues":{"__proto__":"x"},"groupValues":{}}'),
      headers
    })
  )
})
test('registry bounds labels, scalar values, revisions and the number of runtime custom fields', () => {
  for (const extra of [
    { label: 'x'.repeat(121) },
    { defaultValue: 'x'.repeat(16385) },
    { missing: 'expression' },
    { defaultValue: { html: 'bad' } }
  ])
    assert.throws(() => validateRegistry({ registry: registry(extra), headers }))
  const r = defaultRegistry(headers)
  for (let i = 0; i < 100; i++)
    r.fields.push({ key: `custom.field_${i}`, label: 'Field', source: { kind: 'manual' }, missing: 'omit' })
  assert.equal(validateRegistry({ registry: r, headers }).fields.length, 107)
  r.fields.push({ key: 'custom.overflow', label: 'Field', source: { kind: 'manual' }, missing: 'omit' })
  assert.throws(() => validateRegistry({ registry: r, headers }))
})
