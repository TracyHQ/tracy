import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderTemplate } from '../src/invitations/render.js'

const SYSTEM_LINKS = {
  invitationUrl: 'https://example.test/campaign/invitation?token=fixture',
  unsubscribeUrl: 'https://example.test/campaign/unsubscribe?token=fixture'
}
const FOOTER = 'Unsubscribe: https://example.test/campaign/unsubscribe?token=fixture'

function input(template = {}, personalization = {}, systemLinks = SYSTEM_LINKS) {
  return {
    template: {
      id: 'welcome',
      version: 'draft-1',
      subject: 'Welcome',
      paragraphs: [{ text: 'Hello.' }],
      ...template
    },
    personalization,
    systemLinks
  }
}

test('renders supplied fields with a protected footer and exact template identity', () => {
  const result = renderTemplate(
    input(
      {
        subject: 'Welcome, {{first_name}}',
        paragraphs: [
          { text: '{{company}} uses {{plan}} at {{website}}.' },
          { text: 'Open {{invitation_url}}' }
        ]
      },
      { first_name: 'Example', plan: 'Standard', company: 'Example Studio', website: 'example.test' }
    )
  )
  assert.equal(result.subject, 'Welcome, Example')
  assert.equal(
    result.bodyText,
    `Example Studio uses Standard at example.test.\n\nOpen ${SYSTEM_LINKS.invitationUrl}\n\n${FOOTER}`
  )
  assert.deepEqual(result.usedFields, [
    'company',
    'first_name',
    'invitation_url',
    'plan',
    'unsubscribe_url',
    'website'
  ])
  assert.equal(result.templateId, 'welcome')
  assert.equal(result.templateVersion, 'draft-1')
})

for (const value of [undefined, '', '   ']) {
  test(`uses the first-name fallback for ${JSON.stringify(value)}`, () => {
    const result = renderTemplate(input({ subject: 'Hi {{first_name}}' }, { first_name: value }))
    assert.equal(result.subject, 'Hi there')
    assert.deepEqual(result.usedFields, ['first_name', 'unsubscribe_url'])
  })
}

for (const field of ['plan', 'company', 'website']) {
  for (const value of [undefined, '', '  ']) {
    test(`refuses a used ${field} with missing or blank value ${JSON.stringify(value)}`, () => {
      assert.throws(
        () => renderTemplate(input({ paragraphs: [{ text: `Use {{${field}}}` }] }, { [field]: value })),
        new RegExp(field)
      )
    })
  }
}

for (const field of ['last_template', 'cms']) {
  test(`omits a missing ${field} paragraph without demanding its other fields`, () => {
    const result = renderTemplate(
      input({ paragraphs: [{ text: 'Hello.' }, { text: `{{${field}}} at {{company}}`, whenPresent: field }] })
    )
    assert.equal(result.bodyText, `Hello.\n\n${FOOTER}`)
    assert.deepEqual(result.usedFields, ['unsubscribe_url'])
  })
  test(`renders a supplied ${field} only inside its matching optional paragraph`, () => {
    const result = renderTemplate(
      input({ paragraphs: [{ text: `Previously {{${field}}}`, whenPresent: field }] }, { [field]: 'Example' })
    )
    assert.equal(result.bodyText, `Previously Example\n\n${FOOTER}`)
    assert.deepEqual(result.usedFields, [field, 'unsubscribe_url'].sort())
  })
  test(`rejects ${field} in the subject`, () => {
    assert.throws(
      () => renderTemplate(input({ subject: `Hi {{${field}}}` }, { [field]: 'Example' })),
      new RegExp(field)
    )
  })
  test(`rejects ${field} without its matching paragraph condition`, () => {
    assert.throws(
      () =>
        renderTemplate(
          input({
            paragraphs: [{ text: `{{${field}}}`, whenPresent: field === 'cms' ? 'last_template' : 'cms' }]
          })
        ),
      new RegExp(field)
    )
  })
}

test('does not count a conditional field that is only a paragraph condition', () => {
  const result = renderTemplate(
    input({ paragraphs: [{ text: 'Hello.', whenPresent: 'cms' }] }, { cms: 'Example' })
  )
  assert.deepEqual(result.usedFields, ['unsubscribe_url'])
})

test('rejects unsupported paragraph conditions', () => {
  assert.throws(
    () => renderTemplate(input({ paragraphs: [{ text: 'Hello.', whenPresent: 'company' }] })),
    /whenPresent/
  )
})

for (const text of [
  '{{unknown}}',
  '{{upper first_name}}',
  '{{first_name.value}}',
  '{{ first_name }}',
  '{{{first_name}}}',
  '{{first_name}',
  '{first_name}}',
  '{{}}',
  '{{first_{{plan}}name}}',
  '{{invite_url}}',
  '}'
]) {
  test(`refuses unsupported or malformed template syntax ${JSON.stringify(text)}`, () => {
    assert.throws(
      () => renderTemplate(input({ paragraphs: [{ text }] }, { first_name: 'Example', plan: 'Standard' })),
      /placeholder|token|braces/
    )
  })
}

test('validates malformed syntax even in a paragraph that would be omitted', () => {
  assert.throws(
    () => renderTemplate(input({ paragraphs: [{ text: '{{unknown}}', whenPresent: 'cms' }] })),
    /placeholder|token/
  )
})

test('rejects template attempts to place or change the system footer', () => {
  for (const template of [
    { subject: '{{unsubscribe_url}}' },
    { paragraphs: [{ text: '{{unsubscribe_url}}', whenPresent: 'cms' }] }
  ]) {
    assert.throws(() => renderTemplate(input(template)), /unsubscribe_url/)
  }
})

test('ignores personalization keys outside the allowlist including system link overrides', () => {
  const result = renderTemplate(
    input(
      { paragraphs: [{ text: '{{invitation_url}}' }] },
      {
        invitation_url: 'https://attacker.test/',
        invitationUrl: {},
        unsubscribe_url: 'https://attacker.test/',
        unsubscribeUrl: {},
        unknown: {}
      }
    )
  )
  assert.equal(result.bodyText, `${SYSTEM_LINKS.invitationUrl}\n\n${FOOTER}`)
})

test('does not expand placeholder-shaped personalization a second time', () => {
  const result = renderTemplate(
    input(
      { subject: 'Hi {{first_name}}', paragraphs: [{ text: '{{company}}' }] },
      {
        first_name: '{{plan}}',
        company: '{{invitation_url}}',
        plan: 'Standard'
      }
    )
  )
  assert.equal(result.subject, 'Hi {{plan}}')
  assert.equal(result.bodyText, `{{invitation_url}}\n\n${FOOTER}`)
  assert.deepEqual(result.usedFields, ['company', 'first_name', 'unsubscribe_url'])
})

test('preserves plain text HTML-looking content without promising HTML sanitization', () => {
  const result = renderTemplate(
    input({ paragraphs: [{ text: '<b>{{company}}</b>' }] }, { company: '<Example>' })
  )
  assert.equal(result.bodyText, `<b><Example></b>\n\n${FOOTER}`)
})

for (const character of ['\r', '\n', '\t', '\x00', '\x7f', '\x85', '\u2028', '\u2029']) {
  test(`rejects subject injection U+${character.charCodeAt(0).toString(16)}`, () => {
    assert.throws(() => renderTemplate(input({ subject: `Hi${character}Example` })), /subject/)
    assert.throws(
      () =>
        renderTemplate(
          input({ subject: 'Hi {{first_name}}' }, { first_name: `Example${character}Injected` })
        ),
      /subject/
    )
  })
}

for (const url of [
  undefined,
  '',
  'http://example.test/',
  '/relative',
  'https://user:secret@example.test/',
  'https://user@example.test/',
  'https://example.test/\npath',
  'https://example.test/\u2028path'
]) {
  for (const field of ['invitationUrl', 'unsubscribeUrl']) {
    test(`rejects invalid system ${field} ${JSON.stringify(url)}`, () => {
      assert.throws(() => renderTemplate(input({}, {}, { ...SYSTEM_LINKS, [field]: url })), new RegExp(field))
    })
  }
}

test('enforces subject UTF-8 byte limits on the exact rendered text', () => {
  assert.equal(renderTemplate(input({ subject: 'é'.repeat(499) })).subject.length, 499)
  assert.throws(() => renderTemplate(input({ subject: 'é'.repeat(500) })), /subject/)
  assert.throws(
    () => renderTemplate(input({ subject: '{{company}}' }, { company: 'é'.repeat(500) })),
    /subject/
  )
})

test('counts footer and paragraph separators in the body UTF-8 byte limit', () => {
  const available = 100 * 1024 - Buffer.byteLength(`\n\n${FOOTER}`)
  const body = 'é'.repeat(Math.floor(available / 2)) + 'x'.repeat(available % 2)
  assert.equal(
    Buffer.byteLength(renderTemplate(input({ paragraphs: [{ text: body }] })).bodyText),
    100 * 1024
  )
  assert.throws(() => renderTemplate(input({ paragraphs: [{ text: `${body}x` }] })), /body/)
  assert.throws(
    () => renderTemplate(input({ paragraphs: [{ text: '{{company}}' }] }, { company: `${body}x` })),
    /body/
  )
})

test('allows one hundred paragraphs and refuses extra paragraphs even when omitted', () => {
  assert.equal(
    renderTemplate(
      input({ paragraphs: Array.from({ length: 100 }, () => ({ text: 'Hello.' })) })
    ).bodyText.split('\n\n').length,
    101
  )
  assert.throws(
    () =>
      renderTemplate(
        input({ paragraphs: Array.from({ length: 101 }, () => ({ text: 'Hello.', whenPresent: 'cms' })) })
      ),
    /paragraph/
  )
})

test('an empty paragraph list still produces the mandatory footer', () => {
  const result = renderTemplate(input({ paragraphs: [] }))
  assert.equal(result.bodyText, FOOTER)
  assert.deepEqual(result.usedFields, ['unsubscribe_url'])
})

test('refuses non-string template content and invalid template identity without coercion', () => {
  for (const template of [
    { id: '' },
    { version: '  ' },
    { id: 1 },
    { version: {} },
    { subject: {} },
    { paragraphs: [{ text: 3 }] },
    { paragraphs: null }
  ]) {
    assert.throws(() => renderTemplate(input(template)), /string|paragraph/)
  }
})

test('refuses non-string values in recognized personalization fields without coercion', () => {
  for (const value of [null, 0, false, {}, []]) {
    assert.throws(
      () => renderTemplate(input({ subject: '{{first_name}}' }, { first_name: value })),
      /first_name.*string/
    )
    assert.throws(() => renderTemplate(input({}, { cms: value })), /cms.*string/)
  }
})

test('does not read inherited personalization values', () => {
  const result = renderTemplate(
    input({ subject: '{{first_name}}' }, Object.create({ first_name: 'Inherited' }))
  )
  assert.equal(result.subject, 'there')
})

test('hashes the exact rendered content, template identity and both system links deterministically', () => {
  const original = input()
  const first = renderTemplate(original)
  assert.match(first.contentHash, /^[a-f0-9]{64}$/)
  assert.equal(
    renderTemplate(
      input(
        {},
        { ignored: 'different' },
        { unsubscribeUrl: SYSTEM_LINKS.unsubscribeUrl, invitationUrl: SYSTEM_LINKS.invitationUrl }
      )
    ).contentHash,
    first.contentHash
  )
  for (const changed of [
    input({ subject: 'Other' }),
    input({ paragraphs: [{ text: 'Other' }] }),
    input({ id: 'other' }),
    input({ version: 'other' }),
    input({}, {}, { ...SYSTEM_LINKS, invitationUrl: 'https://example.test/other' }),
    input({}, {}, { ...SYSTEM_LINKS, unsubscribeUrl: 'https://example.test/other' })
  ]) {
    assert.notEqual(renderTemplate(changed).contentHash, first.contentHash)
  }
  assert.deepEqual(original, input())
})

test('records omitted paragraph tokens and conditions as dependencies for later invalidation', () => {
  const result = renderTemplate(
    input({
      subject: 'Hi {{first_name}}',
      paragraphs: [
        { text: '{{last_template}} at {{company}}', whenPresent: 'last_template' },
        { text: 'A CMS paragraph.', whenPresent: 'cms' }
      ]
    })
  )
  assert.deepEqual(result.usedFields, ['first_name', 'unsubscribe_url'])
  assert.deepEqual(result.dependencyFields, [
    'cms',
    'company',
    'first_name',
    'last_template',
    'unsubscribe_url'
  ])
})

test('dependency fields include system template tokens exactly once in sorted order', () => {
  const result = renderTemplate(
    input({
      subject: '{{first_name}}',
      paragraphs: [{ text: '{{first_name}} {{invitation_url}} {{invitation_url}}' }]
    })
  )
  assert.deepEqual(result.dependencyFields, ['first_name', 'invitation_url', 'unsubscribe_url'])
})

test('refuses sparse paragraphs rather than silently omitting invalid entries', () => {
  const paragraphs = []
  paragraphs.length = 2
  paragraphs[1] = { text: 'Hello.' }
  assert.throws(() => renderTemplate(input({ paragraphs })), /paragraph/)
})

test('refuses invalid paragraph records rather than coercing their text', () => {
  for (const paragraph of [undefined, null, [], {}, { text: {} }]) {
    assert.throws(() => renderTemplate(input({ paragraphs: [paragraph] })), /paragraph/)
  }
})
