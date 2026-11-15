// The check record as a page the owner reviews (ticket #585, product decision 6), written for someone who does not
// read code: a summary (what the build wrote, what the kit declares, what the build skipped and why, what is left
// unexplained, the findings by the fix they need), then one card per finding group with its cropped screenshot, what
// it is and where it comes from in plain words, the pages it shows on, and Correct / Wrong buttons with a note; a
// button copies every answer as text to paste back. Pure: the record in, HTML out. The record holds no machine
// address (`<site>`) and the pictures are paths next to the page.

const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )

const FIX = {
  kit_declare_keep: {
    title: 'Keep as interface text',
    what: 'Standard wording of Joomla, the template or an extension, the same on every site. The kit should declare it kept, with a reason.'
  },
  kit_write: {
    title: 'The kit should write it',
    what: 'A value that should come from the business (the logo, the business name, the account name). The kit should write it from a fact.'
  },
  build_gap: {
    title: 'The build left it',
    what: 'Demo content or an empty picture in a place the build writes. The build team fixes the write step.'
  },
  template_patch: {
    title: 'The template prints it',
    what: 'Fixed in the template files (a layout, a stylesheet, a picture file). Needs a change to the template.'
  },
  external_request: {
    title: 'Loaded from another site',
    what: 'The page asks another site for a font, a script or a picture. Not counted as a leak; listed for review.'
  },
  unclassified: {
    title: 'Source not found',
    what: 'The gate could not tell where this comes from. Please say what it is.'
  }
}
const ACCOUNT = {
  written: 'Written by the build',
  declared_not_written: 'Declared not written by the kit',
  skipped_by_writer: 'Skipped by the build',
  unexplained: 'Unexplained'
}

const STYLE = `
:root{--bg:#f7f6f3;--fg:#1d1b18;--muted:#625d55;--line:#e3dfd8;--card:#fff;--accent:#b75436;--bad:#b42318;--ok:#18794e;--chip:#f1eee8}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#171513;--fg:#f3f1ed;--muted:#a9a39a;--line:#36322d;--card:#211e1b;--accent:#e08a6c;--bad:#f97066;--ok:#47cd89;--chip:#2b2723}}
:root[data-theme="dark"]{--bg:#171513;--fg:#f3f1ed;--muted:#a9a39a;--line:#36322d;--card:#211e1b;--accent:#e08a6c;--bad:#f97066;--ok:#47cd89;--chip:#2b2723}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,sans-serif}
main{max-width:1080px;margin:0 auto;padding:28px 16px 80px}
h1{font-size:24px;margin:0}h2{font-size:18px;margin:36px 0 10px}h3{font-size:15px;margin:0}
.muted{color:var(--muted)}.verdict{display:inline-block;margin:10px 0 4px;padding:4px 12px;border-radius:999px;font-weight:600;border:1px solid currentColor}
.verdict.no{color:var(--bad)}.verdict.yes{color:var(--ok)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:14px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.tile b{display:block;font-size:26px;font-variant-numeric:tabular-nums}.tile span{color:var(--muted);font-size:13px}
.reasons{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:4px 14px}
.reasons div{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line);font-size:14px}
.reasons div:last-child{border-bottom:0}.reasons code{overflow-wrap:anywhere}
.filter{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 16px}
.filter button{font:inherit;font-size:13px;padding:5px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
.filter button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 14px;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px}
@media (max-width:760px){.card{grid-template-columns:minmax(0,1fr)}}
.card p{overflow-wrap:anywhere}
.card .value{font-size:16px;font-weight:600;overflow-wrap:anywhere;margin:6px 0}
.chip{display:inline-block;font-size:12px;padding:2px 9px;border-radius:999px;background:var(--chip);color:var(--muted);margin:0 6px 6px 0}
.chip.fix{color:var(--accent)}
.crop{width:100%;max-height:260px;object-fit:contain;object-position:top left;border:1px solid var(--line);border-radius:8px;background:#fff}
.nocrop{border:1px dashed var(--line);border-radius:8px;padding:14px;color:var(--muted);font-size:13px}
.where{font-size:13px;color:var(--muted)}.answer{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.answer button{font:inherit;font-size:14px;padding:6px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
.answer button[aria-pressed="true"].yes{border-color:var(--ok);color:var(--ok)}.answer button[aria-pressed="true"].no{border-color:var(--bad);color:var(--bad)}
textarea{width:100%;margin-top:8px;font:inherit;font-size:14px;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--fg);min-height:52px}
textarea:focus,button:focus-visible{outline:1px solid var(--accent);outline-offset:1px}
.bar{position:sticky;bottom:0;background:var(--bg);border-top:1px solid var(--line);padding:10px 0;display:flex;gap:12px;align-items:center}
.bar button{font:inherit;font-weight:600;padding:8px 16px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer}
details{margin:8px 0}summary{cursor:pointer;color:var(--muted)}
`

const SCRIPT = `
const answers={};
document.querySelectorAll('[data-g]').forEach(card=>{
  const id=card.dataset.g;answers[id]={answer:'',note:''};
  card.querySelectorAll('.answer button').forEach(b=>b.addEventListener('click',()=>{
    card.querySelectorAll('.answer button').forEach(x=>x.setAttribute('aria-pressed','false'));
    b.setAttribute('aria-pressed','true');answers[id].answer=b.dataset.a;}));
  card.querySelector('textarea').addEventListener('input',e=>{answers[id].note=e.target.value;});
});
document.querySelectorAll('.filter button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.filter button').forEach(x=>x.setAttribute('aria-pressed','false'));
  b.setAttribute('aria-pressed','true');const f=b.dataset.f;
  document.querySelectorAll('[data-sec]').forEach(c=>{c.hidden=!(f==='all'||c.dataset.sec===f);});
}));
document.getElementById('copy').addEventListener('click',async()=>{
  const lines=[];for(const [id,a] of Object.entries(answers)){if(!a.answer&&!a.note)continue;
    const card=document.querySelector('[data-g="'+id+'"]');
    lines.push(id+' | '+(a.answer||'no answer')+' | '+card.dataset.fix+' | '+card.dataset.v+(a.note?' | note: '+a.note.replace(/\\s+/g,' '):''));}
  const text=lines.length?lines.join('\\n'):'No answers yet.';
  try{await navigator.clipboard.writeText(text);}catch{const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();document.execCommand('copy');t.remove();}
  document.getElementById('copied').textContent=lines.length+' answer(s) copied';
});`

function card(g) {
  const fix = FIX[g.fixClass] ?? FIX.unclassified
  const pages = [...new Set(g.occurrences.map((o) => o.page))]
  const crop = g.cropFile
    ? `<img class="crop" loading="lazy" src="${esc(g.cropFile)}" alt="Where it shows on the page">`
    : `<div class="nocrop">${g.visible ? 'No picture: it is not drawn as a box on the page (a page title, a meta value or a request).' : 'Not visible on the page: it sits in the page but is hidden.'}</div>`
  const unknown =
    g.source?.class !== 'unknown'
      ? ''
      : g.source.searched?.length
        ? ` Searched: ${esc(g.source.searched.join(', '))}.`
        : ` ${esc(g.source.why ?? '')}.`
  const also =
    (g.values ?? []).length > 1
      ? `<p class="where">The same text with other words in it: ${esc(g.values.slice(1).join(' / '))}</p>`
      : ''
  return `<article class="card" data-g="${esc(g.id)}" data-fix="${esc(g.fixClass)}" data-v="${esc(String(g.value).slice(0, 80))}">
<div><span class="chip fix">${esc(fix.title)}</span><span class="chip">${esc(g.id)}</span><span class="chip">${g.count} time(s) on ${pages.length} page(s)</span>
<div class="value">${esc(String(g.value).slice(0, 220))}</div>
<p>${esc(g.label)}.${unknown}</p>${also}
<p class="where">Pages: ${esc(pages.slice(0, 8).join(', '))}${pages.length > 8 ? ` and ${pages.length - 8} more` : ''}</p>
<div class="answer"><button class="yes" data-a="correct" aria-pressed="false">Correct</button><button class="no" data-a="wrong" aria-pressed="false">Wrong</button></div>
<textarea aria-label="Note for ${esc(g.id)}" placeholder="Note (optional)"></textarea></div>
<div>${crop}</div></article>`
}

/** @param {object} record a `tracy-ai-quickstart-check-record/v1` document */
export function recordHtml(record) {
  const v = record.verdict
  const u = record.universe
  const m = record.markerTest
  const groups = m.groups ?? []
  const counts = m.groupCounts?.byFix ?? {}
  const tile = (label, value) => `<div class="tile"><b>${esc(value)}</b><span>${esc(label)}</span></div>`
  const skipped = Object.entries(record.split?.skipped_by_writer ?? {})
    .flatMap(([by, codes]) => Object.entries(codes).map(([code, n]) => ({ by, code, n })))
    .sort((a, b) => b.n - a.n)
  const c = record.demoScan?.controls ?? {}
  const control = (name, x, want) =>
    `<div><span>${esc(name)}</span><code>${
      x?.status !== 'run'
        ? 'not run'
        : x.failed
          ? `not measured: ${x.failed} of ${x.renders} page(s) did not load (${x.findings} demo finding(s) on the rest)`
          : `${x.findings} demo finding(s) on ${x.pages} page(s), ${want}`
    }</code></div>`
  const PENDING_NAMES = { minItems: 'the minimum number of items', linkCheck: 'the link check' }
  const notRun = (v.notRun ?? []).map((k) => `${PENDING_NAMES[k] ?? k} (ticket 586)`).join(', ')
  const leakGroups = groups.filter((g) => g.group !== 'outside_request').length
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quickstart check</title><style>${STYLE}</style></head><body><main>
<h1>Quickstart check: ${esc(record.template?.name ?? record.template?.slug ?? record.kit)} ${esc(record.template?.version ?? '')}</h1>
<p class="muted">Kit ${esc(record.kit)}. Plugin ${esc(record.plugin?.start ?? 'not run')}${record.plugin?.end ? ` at the start and ${esc(record.plugin.end)} at the end` : ''}. Finished ${esc(
    String(record.finishedAt ?? '')
      .slice(0, 16)
      .replace('T', ' ')
  )} UTC.</p>
<span class="verdict ${v.pass ? 'yes' : 'no'}">${v.pass ? 'Passed' : 'Not passed'}</span>
<p class="muted">${esc(v.leaks)} leak(s) in ${esc(leakGroups)} group(s), plus ${esc(groups.length - leakGroups)} request(s) to other sites; ${esc(v.demoFindings)} demo finding(s); ${esc(v.failedRenders ?? 0)} page view(s) that did not load as expected; ${esc(v.unexplained)} unexplained place(s)${notRun ? `. Not measured yet: ${esc(notRun)}` : ''}.</p>
<h2>What the build did with every place the kit declares</h2>
<div class="tiles">${Object.entries(ACCOUNT)
    .map(([k, label]) => tile(label, u?.[k] ?? 0))
    .join('')}${tile('Places in all', u?.universe ?? 0)}</div>
<details><summary>Why the build skipped ${esc(u?.skipped_by_writer ?? 0)} place(s)</summary><div class="reasons">${skipped
    .map(
      (s) =>
        `<div><code>${esc(s.code)}</code><span>${esc(s.n)} (${esc(s.by === 'writer' ? 'the build' : s.by)})</span></div>`
    )
    .join('')}</div></details>
<h2>Findings by the fix they need</h2>
<div class="tiles">${Object.entries(FIX)
    .map(([k, f]) => tile(f.title, counts[k] ?? 0))
    .join('')}</div>
<h2>The demo scan's controls</h2>
<div class="reasons">${control('The untouched human quickstart', c.human, 'should be many')}${control('The blank site before the build', c.blank, 'should be none')}</div>
<h2>Every finding group (${groups.length})</h2>
<p class="muted">Each card is one piece of text, picture, link or request, counted once however many pages show it. Press Correct when the gate is right that it should not be there, Wrong when it should, and add a note. Then copy your answers and paste them back.</p>
<div class="filter"><button data-f="all" aria-pressed="true">All</button>${Object.entries(FIX)
    .filter(([k]) => counts[k])
    .map(([k, f]) => `<button data-f="${k}" aria-pressed="false">${esc(f.title)} (${counts[k]})</button>`)
    .join('')}</div>
${Object.entries(FIX)
  .map(([k, f]) => {
    const of = groups.filter((g) => g.fixClass === k)
    return of.length
      ? `<section data-sec="${k}"><h3>${esc(f.title)} (${of.length})</h3><p class="muted">${esc(f.what)}</p>${of.map(card).join('')}</section>`
      : ''
  })
  .join('')}
<div class="bar"><button id="copy">Copy answers</button><span id="copied" class="muted"></span></div>
</main><script>${SCRIPT}</script></body></html>`
}
