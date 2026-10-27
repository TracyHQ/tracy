/** Owner-only run evidence, rendered as escaped text. JSON remains the source of truth. */
import { escapeHtml } from '../lib/html.js'
import { pageShell } from '../lib/page-shell.js'

const e = (value) => escapeHtml(value ?? '')
const rows = (value) => (Array.isArray(value) ? value : [])
const localHref = (href) =>
  typeof href === 'string' &&
  /^\/(?![/\\])[^\s\\]*$/.test(href) &&
  ![...href].some((char) => char.charCodeAt(0) < 32)
    ? href
    : null
function siteHref(href) {
  try {
    const u = new URL(href)
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null
  } catch {
    return null
  }
}
function safeJson(value) {
  return JSON.stringify(
    value,
    (key, item) =>
      /^(?:apiKey|authorization|credential|credentials|secret|password|accessToken|refreshToken|reasoning_content|reasoningContent|chainOfThought)$/i.test(
        key
      )
        ? undefined
        : item,
    2
  )
}
const json = (value) => `<pre>${e(safeJson(value))}</pre>`
const detail = (label, value) => `<details><summary>${e(label)}</summary>${json(value)}</details>`
const section = (id, title, body) =>
  `<section id="${e(id)}" class="quality-section"><h2>${e(title)}</h2>${body}</section>`
const table = (headers, records) =>
  `<div class="quality-table"><table><thead><tr>${headers.map((h) => `<th scope="col">${e(h)}</th>`).join('')}</tr></thead><tbody>${records.map((record) => `<tr>${record.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
const finalEntry = (artifacts, pattern) =>
  Object.entries(artifacts)
    .filter(([key]) => pattern.test(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .at(-1)

export function renderQualityPage(dto, { t } = {}) {
  if (typeof t !== 'function' || !t.htmlLang) throw new Error('QUALITY_PAGE_TRANSLATOR')
  const lang = t.lang ?? t.htmlLang,
    text = (key, values) => t(`woQuality.${key}`, values),
    empty = `<p class="quality-muted">${e(text('empty'))}</p>`
  const artifacts = dto.artifacts ?? {},
    run = dto.run ?? {},
    intent = dto.intent ?? {},
    links = dto.links ?? {},
    cost = dto.cost ?? {}
  const latestPatch = finalEntry(artifacts, /^review-r[012]-patch-applied$/),
    plan = latestPatch?.[1]?.plan ?? artifacts.plan,
    dossier = artifacts.dossier,
    semantic = finalEntry(artifacts, /^review-r[012]-semantic$/)?.[1],
    mechanical = finalEntry(artifacts, /^review-r[012]-mechanical$/)?.[1],
    attention = finalEntry(artifacts, /^review-r[012]-attention$/)?.[1],
    gate = finalEntry(artifacts, /^review-r[012]-gate$/)?.[1],
    render = finalEntry(artifacts, /^review-r[012]-render$/)?.[1]
  const cancelled = run.state === 'cancelled' || intent.state === 'cancelled'
  const ready = !cancelled && gate?.state === 'ready-for-human' && !attention
  const needsAttention =
    !cancelled &&
    !ready &&
    (attention ||
      ['failed', 'uncertain'].includes(run.state) ||
      intent.state === 'failed' ||
      semantic?.state === 'needs-attention')
  const state = cancelled ? 'cancelled' : ready ? 'ready' : needsAttention ? 'attention' : 'running'
  const canStop =
    !ready &&
    !cancelled &&
    !needsAttention &&
    ['pending', 'running'].includes(run.state) &&
    !['cancelled', 'failed', 'succeeded'].includes(intent.state)
  const cancel = localHref(links.cancel),
    back = localHref(links.opportunity),
    raw = localHref(links.json),
    site = siteHref(links.site)
  const number = (value) =>
    Number.isFinite(value)
      ? new Intl.NumberFormat(lang, { maximumFractionDigits: 6 }).format(value)
      : text('unknown')
  const pill = `<span class="quality-state quality-${state}">${e(text(state))}</span>`
  const nav = `<nav aria-label="${e(text('details'))}" class="quality-actions">${back ? `<a href="${e(back)}">${e(text('back'))}</a>` : ''}${raw ? `<a href="${e(raw)}">${e(text('json'))}</a>` : ''}${site ? `<a href="${e(site)}" target="_blank" rel="noopener noreferrer">${e(text('site'))}</a>` : ''}</nav>`
  const stop =
    canStop && cancel
      ? `<form method="post" action="${e(cancel)}"><button class="outline" type="submit">${e(text('stop'))}</button><p class="quality-muted">${e(text('stopHelp'))}</p></form>`
      : ''
  const progress = section(
    'progress',
    text('progress'),
    `<div class="quality-summary">${pill}<dl><div><dt>${e(text('repairs'))}</dt><dd>${e(number(intent.repairCount))} / 2</dd></div><div><dt>${e(text('callLimit'))}</dt><dd>${e(number(intent.attemptCount))} / ${e(number(run.policy?.maxAttempts))}</dd></div><div><dt>${e(text('spent'))}</dt><dd>${e(number(cost.spentCents))}</dd></div><div><dt>${e(text('held'))}</dt><dd>${e(number(cost.reservedCents))}</dd></div><div><dt>${e(text('uncertain'))}</dt><dd>${e(number(cost.unreconciledCents))}</dd></div></dl></div><p class="quality-muted">${e(text('cost'))} · ${e(text('upperBound'))}</p>${ready ? `<p>${e(text('human'))}</p>` : ''}${attention?.error ? `<p class="quality-error"><code>${e(attention.error)}</code></p>` : ''}${stop}${detail(text('policy'), { ...run.policy, deadline: intent.deadline, release: run.release })}`
  )
  const factRows = rows(dossier?.facts).map((fact) => [
    `<strong>${e(fact.type)}</strong><p>${e(fact.value)}</p><code>${e(fact.id)}</code>`,
    `${e(fact.status)}<p class="quality-muted">${e(fact.branch)}</p>`,
    rows(fact.sourceRefs)
      .map(
        (ref) =>
          `<blockquote>${e(ref.quote)}<cite>${e(ref.sourceId)} · ${e(ref.start)}–${e(ref.end)}</cite></blockquote>`
      )
      .join('')
  ])
  const facts = section(
    'facts',
    text('facts'),
    factRows.length
      ? table([text('claim'), text('state'), text('source')], factRows) +
          (rows(dossier.conflicts).length ? detail(text('conflicts'), dossier.conflicts) : '')
      : empty
  )
  const mdKey = latestPatch?.[0]?.replace('-patch-applied', '-patch-markdown')
  const md = (mdKey && artifacts[mdKey]) || (!latestPatch && artifacts['plan-markdown'])
  const brief = section(
    'brief',
    text('brief'),
    typeof md === 'string'
      ? `<pre class="quality-prose">${e(md)}</pre>`
      : plan
        ? detail(text('details'), plan)
        : empty
  )
  const chosenKeys = new Set(rows(plan?.records).map((record) => record.key)),
    coverage = rows(plan?.coverage)
  const coverageRows = coverage
    .filter((row) => chosenKeys.has(row.key))
    .map((row) => [`<code>${e(row.route ?? row.key)}</code>`, e(row.state), e(row.reason)])
  const cover = section(
    'coverage',
    text('coverage'),
    plan
      ? `<p>${e(text('coverageCount', { count: coverage.length }))}</p>${coverageRows.length ? table([text('route'), text('state'), text('reason')], coverageRows) : empty}<p class="quality-muted">${e(text('navfooter'))}</p>${render ? detail(text('evidence'), { hash: render.hash, contentHash: render.contentHash, coverage: render.coverage, captures: rows(render.captures).map((c) => ({ route: c.route, viewport: c.viewport, png: c.png, imageHash: c.imageHash, sourceHash: c.sourceHash, textHash: c.textHash, slices: c.slices })) }) : empty}`
      : empty
  )
  const operations = rows(dto.operations)
  const changes = section(
    'changes',
    text('changes'),
    `<p class="quality-muted">${e(text('noUndo'))}</p>${
      operations.length
        ? table(
            [text('stage'), text('state'), text('evidence')],
            operations.map((op) => [
              e(op.kind ?? op.target?.kind ?? op.id),
              e(op.state),
              detail(text('details'), {
                target: op.target,
                expectedBefore: op.expectedBefore,
                actualAfter: op.actualAfter,
                receipt: op.receipt,
                error: op.error
              })
            ])
          )
        : empty
    }`
  )
  const review = section(
    'review',
    text('review'),
    (semantic
      ? `<p>${e(semantic.state)}</p>${
          rows(semantic.findings).length
            ? table(
                [text('route'), text('reason'), text('evidence')],
                semantic.findings.map((finding) => [
                  `<code>${e(finding.route)} @ ${e(finding.width)}</code><p>${e(finding.severity)}</p>`,
                  e(finding.message),
                  `${e(finding.evidence)}<p><code>${e(finding.field ?? finding.selector)}</code></p><code>${e(finding.imageHash)}</code>`
                ])
              )
            : ''
        }${detail(text('details'), semantic)}`
      : empty) + (mechanical ? detail(text('evidence'), mechanical) : '')
  )
  const attempts = section(
    'attempts',
    text('attempts'),
    rows(dto.attempts).length
      ? table(
          [text('stage'), text('state'), text('model'), text('cost'), text('duration'), text('usage')],
          dto.attempts.map((attempt) => [
            `<code>${e(attempt.stage)}</code>`,
            `${e(attempt.state)}${attempt.error ? `<p><code>${e(attempt.error)}</code></p>` : ''}`,
            `${e(attempt.model?.model)}<p>${e(attempt.model?.reasoning?.effort ?? text('unknown'))}</p>`,
            e(number(attempt.receipt?.costCents)),
            e(number(attempt.receipt?.durationMs)),
            attempt.receipt?.usage ? detail(text('details'), attempt.receipt.usage) : e(text('unknown'))
          ])
        )
      : empty
  )
  const body = `<header class="quality-header"><div><p class="quality-muted">Website Opportunities</p><h1>${e(text('title'))}</h1><p>${e(text('subtitle'))}</p><p class="quality-muted">${e(text('identity'))} <code>${e(run.id)}</code></p></div>${nav}</header>${progress}${facts}${brief}${cover}${changes}${review}${attempts}`
  return pageShell(text('title'), body, '', { lang: t.htmlLang, style: QUALITY_PAGE_STYLE })
}

export const QUALITY_PAGE_STYLE = `
main,main:has(table){max-width:72rem;margin:0 auto;gap:1.5rem}
.brand{justify-content:flex-start}.quality-header{display:flex;justify-content:space-between;gap:2rem;align-items:start}
.quality-header h1{font-size:1.75rem}.quality-header p{margin:.375rem 0}.quality-actions{display:flex;flex-wrap:wrap;gap:.75rem;max-width:20rem}
.quality-actions a{color:var(--foreground);text-underline-offset:3px}.quality-section{border-top:1px solid var(--border);padding-top:1.5rem;display:grid;gap:1rem;min-width:0}
.quality-section p{margin:0}.quality-muted{color:var(--muted-foreground);font-size:.8125rem}.quality-state{border:1px solid var(--border);border-radius:var(--radius);padding:.25rem .5rem;display:inline-block;font-weight:500}
.quality-ready{color:var(--success)}.quality-attention,.quality-error{color:var(--destructive)}.quality-summary{display:flex;gap:2rem;flex-wrap:wrap;align-items:center}
dl{display:flex;gap:1.5rem;flex-wrap:wrap;margin:0}dt{color:var(--muted-foreground);font-size:.75rem}dd{margin:.125rem 0 0;font-variant-numeric:tabular-nums}
.quality-table{max-width:100%;overflow:auto}.quality-table table{min-width:32rem}.quality-table td{vertical-align:top;max-width:32rem;overflow-wrap:anywhere}
pre{margin:0;padding:1rem;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--muted);color:var(--foreground);white-space:pre-wrap;overflow-wrap:anywhere;font-size:.75rem;line-height:1.6;max-height:32rem;overflow:auto}
pre.quality-prose{font-family:inherit;font-size:.875rem;background:var(--card);max-height:40rem}code{font-size:.75rem;overflow-wrap:anywhere}blockquote{margin:0 0 .75rem;padding-left:.75rem;border-left:1px solid var(--border)}cite{display:block;color:var(--muted-foreground);font-size:.75rem;font-style:normal}
details{min-width:0}summary{cursor:pointer;color:var(--muted-foreground);font-size:.8125rem;padding:.375rem 0}summary:focus-visible{outline:1px solid var(--ring);outline-offset:2px}form{align-items:flex-start}
@media(max-width:640px){body{padding:24px 16px}.quality-header{display:grid;gap:1rem}.quality-summary{gap:1rem}.quality-section{padding-top:1rem}.quality-actions{max-width:none}dl{gap:1rem}}
`
