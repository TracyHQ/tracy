import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parse } from 'parse5'
import { translator } from '../src/lib/i18n/index.js'
import { renderQualityPage as renderPage } from '../src/opportunities-build/quality-page.js'

const renderQualityPage = (dto, { lang = 'en' } = {}) => renderPage(dto, { t: translator(lang) })

const base = () => ({
  run: { id: 'own-run', state: 'running', policy: { maxAttempts: 64, jobCapCents: 200 } },
  intent: { state: 'active', repairCount: 1, attemptCount: 12 },
  artifacts: {},
  links: {
    json: '/api/website-opportunities/quality/runs/own-run',
    cancel: '/api/website-opportunities/quality/runs/own-run/cancel',
    opportunity: '/new/?tab=website-opportunities'
  }
})
function elements(html, tag) {
  const found = []
  const walk = (node) => {
    if (node.tagName === tag) found.push(Object.fromEntries(node.attrs.map((a) => [a.name, a.value])))
    for (const child of node.childNodes ?? []) walk(child)
  }
  walk(parse(html))
  return found
}

test('an active owner sees a real same-origin Stop form, with explicit partial-write and recovery limits', () => {
  const html = renderQualityPage(base()),
    forms = elements(html, 'form')
  assert.deepEqual(
    forms.map((f) => ({ method: f.method, action: f.action })),
    [{ method: 'post', action: base().links.cancel }]
  )
  assert.ok(html.includes('A request already sent may still complete.'))
  assert.ok(html.includes('Undo by turn is unavailable.'))
  assert.ok(!html.includes('>Undo<'))
  assert.ok(html.includes('Unavailable'), 'missing financial data does not become an invented zero')
})

test('ready, cancelled and attention states remove Stop and keep human acceptance distinct', () => {
  const ready = base()
  ready.artifacts['review-r0-gate'] = { state: 'ready-for-human' }
  const readyHtml = renderQualityPage(ready)
  assert.ok(readyHtml.includes('Human acceptance is pending.'))
  assert.equal(elements(readyHtml, 'form').length, 0)
  const cancelled = base()
  cancelled.intent.state = 'cancelled'
  assert.equal(elements(renderQualityPage(cancelled), 'form').length, 0)
  const failed = base()
  failed.run.state = 'failed'
  failed.artifacts['review-r0-attention'] = { error: 'QUALITY_CAPTURE_INCOMPLETE' }
  assert.ok(renderQualityPage(failed).includes('QUALITY_CAPTURE_INCOMPLETE'))
  assert.equal(elements(renderQualityPage(failed), 'form').length, 0)
})

test('source text, markdown and findings remain escaped data, and credentials/hidden reasoning are omitted', () => {
  const dto = base(),
    injection = '<script>globalThis.pwned=true</script><img src=x onerror=alert(1)>'
  dto.artifacts = {
    dossier: {
      facts: [{ type: 'story', value: injection, sourceRefs: [{ sourceId: 'official', quote: injection }] }],
      conflicts: []
    },
    'plan-markdown': injection,
    'review-r0-semantic': {
      state: 'needs-attention',
      findings: [{ message: injection, evidence: injection }],
      apiKey: 'private-key-sentinel',
      reasoning_content: 'hidden-reasoning-sentinel'
    }
  }
  const html = renderQualityPage(dto)
  assert.equal(elements(html, 'script').length, 0)
  assert.equal(elements(html, 'img').length, 0)
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!html.includes('private-key-sentinel'))
  assert.ok(!html.includes('hidden-reasoning-sentinel'))
})

test('unsafe links/forms cannot be promoted from the public DTO to executable markup', () => {
  const dto = base()
  dto.links = {
    cancel: '//evil.test/cancel',
    json: 'javascript:alert(1)',
    opportunity: '/\\evil.test/',
    site: 'data:text/html,<script>1</script>'
  }
  const html = renderQualityPage(dto)
  assert.equal(elements(html, 'form').length, 0)
  assert.equal(elements(html, 'a').length, 0)
})

test('the latest applied plan is displayed with route coverage, receipts and real model effort/cost', () => {
  const dto = base()
  dto.artifacts = {
    plan: { records: [], coverage: [] },
    'plan-markdown': 'Old plan copy',
    'review-r0-patch-applied': {
      plan: {
        records: [{ key: 'home/home@en' }],
        coverage: [
          { key: 'home/home@en', route: '/', state: 'planned', reason: 'Corrected with source evidence' }
        ]
      }
    },
    'review-r0-patch-markdown': 'Corrected plan copy'
  }
  dto.operations = [
    {
      id: 'operation',
      state: 'conflict',
      kind: 'update',
      target: 'home/home@en',
      expectedBefore: { title: 'Before' },
      actualAfter: { title: 'Human edit retained' },
      receipt: { status: 'conflict' }
    }
  ]
  dto.attempts = [
    {
      stage: 'd-r0-1',
      state: 'succeeded',
      model: { model: 'deepseek-flash', reasoning: { effort: 'high' } },
      receipt: { costCents: 0.0123, durationMs: 1800, usage: { prompt_tokens: 1000 } }
    }
  ]
  dto.cost = { spentCents: 1, reservedCents: 0, unreconciledCents: 0 }
  const html = renderQualityPage(dto)
  assert.ok(html.includes('Corrected plan copy'))
  assert.ok(!html.includes('Old plan copy'))
  for (const expected of [
    'Corrected with source evidence',
    'Human edit retained',
    'deepseek-flash',
    'high',
    '0.0123',
    '1,800'
  ])
    assert.ok(html.includes(expected), expected)
})

test('the page uses all eight existing interface languages and readable Vietnamese body font', () => {
  for (const [lang, title] of Object.entries({
    en: 'Demo quality',
    vi: 'Chất lượng demo',
    de: 'Demoqualität',
    it: 'Qualità della demo',
    fr: 'Qualité de la démo',
    nl: 'Demokwaliteit',
    zh: '演示质量',
    es: 'Calidad de la demo'
  })) {
    const html = renderQualityPage(base(), { lang })
    assert.ok(html.includes(`<h1>${title}</h1>`), lang)
    assert.equal(elements(html, 'html')[0].lang, lang === 'zh' ? 'zh-CN' : lang)
    if (lang === 'vi') assert.ok(html.includes('Be+Vietnam+Pro'))
  }
})
