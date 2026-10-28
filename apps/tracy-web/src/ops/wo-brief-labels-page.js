/**
 * The review page of `/ops/wo` › Briefs: `renderBriefLabelsPage(views)` turns label views (`wo-brief-labels-view.js`) into
 * one HTML document, one section per brief revision. A pure function (views in, string out), so a test can render it
 * with no server. Internal and English only, like the rest of `/ops`; light and dark follow the browser.
 */
import { escapeHtml as esc } from '../lib/html.js'

const CSS = `:root{--bg:#f7f6f3;--card:#fff;--fg:#1d1d1f;--muted:#6b6b70;--line:#e3e1dc;--ok:#1a7f37;--okbg:#e8f5ec;--warn:#9a6700;--warnbg:#fff6dc;--bad:#b42318;--badbg:#fdecea;--accent:#bf5b3d}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--card:#1d1d20;--fg:#ececee;--muted:#9a9aa2;--line:#2e2e33;--ok:#7ee2a0;--okbg:#16301f;--warn:#f2c94c;--warnbg:#33290f;--bad:#ff8a80;--badbg:#3a1d1b;--accent:#e08a6d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px}h3{font-size:15px;margin:18px 0 6px}
.sub,.muted{color:var(--muted)}.sub{margin:0 0 16px}a{color:var(--accent)}
.rev{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:20px 0}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.stat{border:1px solid var(--line);border-radius:10px;padding:6px 12px}.stat b{font-size:20px;margin-right:6px}
.pill{display:inline-block;border-radius:999px;padding:0 10px;font-size:12px;font-weight:600;border:1px solid var(--line)}
.pass{color:var(--ok);background:var(--okbg)}.warn{color:var(--warn);background:var(--warnbg)}.block{color:var(--bad);background:var(--badbg)}.unknown{color:var(--muted)}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.pic{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--card)}
.frame{position:relative;background:var(--line);min-height:120px}.frame img{display:block;width:100%;height:auto}
.box{position:absolute;border:2px dashed var(--accent);pointer-events:none}.face{border:2px solid var(--ok)}
.pbody{padding:10px;font-size:13px}.kv{margin:3px 0}.kv b{color:var(--muted);font-weight:600;margin-right:4px}
code{font-size:12px;word-break:break-all}.none{color:var(--muted);font-style:italic}ul.q{margin:4px 0;padding-left:20px}`

const pill = (verdict) => `<span class="pill ${esc(verdict)}">${esc(verdict)}</span>`
const code = (v) => `<code>${esc(v)}</code>`

/** `[x, y, width, height]` fractions as an absolutely placed box over the picture. */
const boxHtml = (b, cls) =>
  `<div class="box ${cls}" style="left:${pct(b[0])};top:${pct(b[1])};width:${pct(b[2])};height:${pct(b[3])}"></div>`
const pct = (n) => `${Math.round(Math.min(1, Math.max(0, n)) * 10000) / 100}%`

/** A link as text: who it points to, how it was decided and the words that decided it. */
function linkHtml(link, empty) {
  if (!link) return `<span class="none">${esc(empty)}</span>`
  const name = link.label
    ? esc(link.label)
    : `${code(link.id)} <span class="none">not in the brief's list</span>`
  const quote = link.quote ? ` <span class="muted">"${esc(link.quote)}"</span>` : ''
  return `${name} <span class="muted">via ${esc(link.via)}</span>${quote}`
}

function photoHtml(p) {
  const frame = p.imageUrl
    ? `<div class="frame"><img src="${esc(p.imageUrl)}" alt="${esc(p.caption ?? 'photo without a caption')}" loading="lazy">${
        p.subjectBox ? boxHtml(p.subjectBox, 'subject') : ''
      }${p.faceBoxes.map((b) => boxHtml(b, 'face')).join('')}</div>`
    : `<div class="frame"><div class="pbody muted">${p.kind === 'video' ? 'Video, no preview' : 'No preview'}</div></div>`
  const offering = !p.labelled
    ? `<span class="pill warn">unlabelled</span>${p.unlabelledReason ? ` <span class="muted">${esc(p.unlabelledReason)}</span>` : ''}`
    : p.general
      ? `<span class="pill">general</span> <span class="muted">via ${esc(p.depicts.via)}</span>`
      : linkHtml(p.depicts, 'none')
  const credit = p.credit ? esc(p.credit) : '<span class="none">none</span>'
  const flags = [
    p.isLogo ? 'logo' : null,
    p.isGraphic ? 'graphic' : null,
    p.isOwnPhoto === true ? 'own photo' : p.isOwnPhoto === false ? 'not own' : null,
    p.peopleCount !== null ? `${p.peopleCount} people` : null
  ].filter(Boolean)
  return `<article class="pic">${frame}<div class="pbody">
<div class="kv">${code(p.id.slice(0, 8))} ${flags.map((f) => `<span class="pill">${esc(f)}</span>`).join(' ')}</div>
<div class="kv"><b>Offering</b> ${offering}</div>
<div class="kv"><b>Person</b> ${linkHtml(p.portraitOf, 'none')}</div>
<div class="kv"><b>Role</b> ${p.role ? code(p.role) : '<span class="none">none</span>'}</div>
<div class="kv"><b>Source</b> ${esc(p.source)}${p.sourceUrl ? ` <a href="${esc(p.sourceUrl)}" rel="noreferrer noopener" target="_blank">open</a>` : ''} <span class="muted">${esc(p.uploaderRole)}</span></div>
<div class="kv"><b>Credit</b> ${credit}</div>
<div class="kv"><b>Content</b> ${esc(p.content ?? '')} <span class="muted">${esc(p.category ?? '')} ${esc(p.quality ?? '')}</span></div>
<div class="kv"><b>Caption</b> ${p.caption ? esc(p.caption) : '<span class="none">none</span>'}</div>
</div></article>`
}

function readinessHtml(r) {
  if (!r)
    return '<p class="muted">This revision has no readiness verdict: it was made before readiness was measured.</p>'
  const checks = r.checks
    .map(
      (c) =>
        `<tr><td>${code(c.id)}</td><td>${pill(c.verdict)}</td><td><code>${esc(JSON.stringify(c.measured))}</code></td></tr>`
    )
    .join('')
  const questions = r.ownerQuestions.length
    ? `<h3>Owner questions</h3><ul class="q">${r.ownerQuestions.map((q) => `<li>${esc(q.question)}</li>`).join('')}</ul>`
    : ''
  return `<p>Verdict ${pill(r.verdict)} <span class="muted">next step</span> ${code(r.next)}</p>
<table><thead><tr><th>Check</th><th>Verdict</th><th>Measured</th></tr></thead><tbody>${checks}</tbody></table>${questions}`
}

const shortId = (id) => esc(String(id).slice(0, 8))

function revisionHtml(v) {
  const c = v.counts
  const offerings = v.offerings.length
    ? v.offerings
        .map(
          (o) =>
            `<tr><td>${esc(o.label)}</td><td>${
              o.photos.length
                ? o.photos
                    .map(shortId)
                    .map((i) => `<code>${i}</code>`)
                    .join(' ')
                : '<span class="none">no photo</span>'
            }</td></tr>`
        )
        .join('')
    : '<tr><td colspan="2" class="none">The brief names no offering.</td></tr>'
  const people = v.people.length
    ? v.people
        .map(
          (p) =>
            `<tr><td>${esc(p.label)}</td><td>${
              p.portraits.length
                ? p.portraits
                    .map(shortId)
                    .map((i) => `<code>${i}</code>`)
                    .join(' ')
                : '<span class="none">no portrait</span>'
            }</td></tr>`
        )
        .join('')
    : '<tr><td colspan="2" class="none">The brief names no team member.</td></tr>'
  return `<section class="rev">
<h2>${esc(v.revision.business ?? 'Brief')} <span class="muted">revision ${esc(v.revision.n)} ${code(v.revision.id)}</span></h2>
<div class="stats">
<div class="stat"><b>${c.photos}</b>photos</div><div class="stat"><b>${c.labelled}</b>labelled</div>
<div class="stat"><b>${c.linkedToOffering}</b>linked to an offering</div><div class="stat"><b>${c.general}</b>general</div>
<div class="stat"><b>${c.unlabelled}</b>unlabelled</div>${c.videos ? `<div class="stat"><b>${c.videos}</b>videos</div>` : ''}</div>
<h3>Readiness</h3>${readinessHtml(v.readiness)}
<h3>Offerings and their photos</h3><table><tbody>${offerings}</tbody></table>
<h3>Named people and their portraits</h3><table><tbody>${people}</tbody></table>
<h3>Photos</h3><div class="grid">${v.photos.map(photoHtml).join('')}</div>
</section>`
}

/**
 * @param {ReturnType<import('./wo-brief-labels-view.js').briefLabelsViewOf>[]} views
 * @param {{title?: string, note?: string}} [opts]
 */
export function renderBriefLabelsPage(views, { title = 'Brief labels', note = '' } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><main>
<h1>${esc(title)}</h1><p class="sub">Read only. What each brief revision holds about its photos, and what a build would decide from it.${note ? ` ${esc(note)}` : ''}</p>
${views.length ? views.map(revisionHtml).join('\n') : '<p class="muted">No brief revision to show.</p>'}
</main></body></html>`
}
