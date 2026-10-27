#!/usr/bin/env node
/**
 * The eye check of a sweep: one page, one row per template, the first screen as released beside the
 * same screen under each system (desktop and phone), each flagged when it looks barely worn.
 *
 *   node scripts/sweep-gallery.mjs --out <gallery dir> <sweep dir> [<sweep dir> …]
 *
 * Reads every `<sweep dir>/<template>/final/flow.json` with its screenshots (flow.mjs) and writes
 * `<gallery dir>/index.html`, `<gallery dir>/gallery.json` and a JPEG of each first screen. Per
 * template × system × viewport:
 *   - `changed`: the share of the first screen's pixels that differ from the default's (any channel
 *     more than 24 apart) — a photo is the same in both, so a screen that is mostly photo changes
 *     little even when worn; read it with `left`;
 *   - `left`: flow.mjs's share of the first screen still in the template's own colours (pictures out);
 *   - the verdict, and the role checks it missed.
 * Flagged (`barely worn`) when `changed` is under 4%, or `left` is 15% or more: those are looked at
 * by a person before a template is called worn. Chrome over CDP (scripts/cdp.mjs), no dependency.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { browser } from './cdp.mjs'

const args = process.argv.slice(2)
const at = args.indexOf('--out')
const OUT = at === -1 ? null : args.splice(at, 2)[1]
const DIRS = args
if (!OUT || !DIRS.length) {
  console.error('usage: sweep-gallery.mjs --out <dir> <sweep dir>…')
  process.exit(2)
}
mkdirSync(join(OUT, 'img'), { recursive: true })

// a flow's screenshots: desktop at half scale (720 wide, first screen 450 tall), phone at full (390 × 900)
const SCREEN = { desktop: 450, phone: 900 }

/** In the page: both PNGs' first screens, the share of pixels that differ, and a JPEG of each. */
const COMPARE = (a, b, h) => `(async () => {
  const load = async (src) => { const i = new Image(); i.src = 'data:image/png;base64,' + src; await i.decode(); return i }
  const [x, y] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})])
  const w = Math.min(x.width, y.width)
  const hh = Math.min(${h}, x.height, y.height)
  const grab = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return c }
  const cx = grab(x)
  const cy = grab(y)
  const p = cx.getContext('2d').getImageData(0, 0, w, hh).data
  const q = cy.getContext('2d').getImageData(0, 0, w, hh).data
  let off = 0
  for (let i = 0; i < p.length; i += 4)
    if (Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])) > 24) off++
  return { changed: Math.round((off / (w * hh)) * 1000) / 1000, a: cx.toDataURL('image/jpeg', 0.7), b: cy.toDataURL('image/jpeg', 0.7) }
})()`

const rows = []
const b = await browser(9460)
try {
  await b.open('about:blank', 1440)
  for (const dir of DIRS)
    for (const name of readdirSync(dir).sort()) {
      const flowFile = join(dir, name, 'final', 'flow.json')
      if (!existsSync(flowFile)) continue
      const flow = JSON.parse(readFileSync(flowFile, 'utf8'))
      const shotOf = (row, vw) => join(dir, name, 'final', row.views[vw].shot)
      const base = flow.rows[0]
      const entry = { template: name, cms: flow.cms, systems: [] }
      for (const row of flow.rows.filter((r) => r.id)) {
        const sys = { id: row.id, label: row.label, views: {} }
        for (const vw of ['desktop', 'phone']) {
          const verdict = flow.verdicts?.find((v) => v.step === row.step && v.vw === vw) ?? null
          const left = verdict?.left?.first?.share ?? null
          let changed = null
          let files = null
          try {
            const r = await b.evaluate(
              COMPARE(
                readFileSync(shotOf(base, vw)).toString('base64'),
                readFileSync(shotOf(row, vw)).toString('base64'),
                SCREEN[vw]
              )
            )
            changed = r.changed
            const stem = `${name}-${vw}`
            const def = `img/${stem}-default.jpg`
            const worn = `img/${stem}-${basename(row.id.replace(':', '-'))}.jpg`
            writeFileSync(join(OUT, def), Buffer.from(r.a.split(',')[1], 'base64'))
            writeFileSync(join(OUT, worn), Buffer.from(r.b.split(',')[1], 'base64'))
            files = { def, worn }
          } catch {}
          const flagged = (changed !== null && changed < 0.04) || (left !== null && left >= 0.15)
          sys.views[vw] = {
            changed,
            left,
            pass: verdict?.pass ?? null,
            misses: verdict?.misses ?? [],
            flagged,
            files
          }
        }
        entry.systems.push(sys)
      }
      rows.push(entry)
    }
} finally {
  b.close()
}

writeFileSync(join(OUT, 'gallery.json'), `${JSON.stringify(rows, null, 1)}\n`)
const pct = (x) => (x === null ? '—' : `${Math.round(x * 100)}%`)
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const flaggedCount = rows
  .flatMap((r) => r.systems.flatMap((s) => Object.values(s.views)))
  .filter((v) => v.flagged).length
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design system sweep</title><style>
:root{--bg:#fff;--fg:#1d1d1f;--muted:#6e6e73;--line:#e5e5ea;--bad:#c4321c;--ok:#1f7a3a}
@media (prefers-color-scheme:dark){:root{--bg:#111;--fg:#f2f2f2;--muted:#9a9a9f;--line:#2c2c2e;--bad:#ff6b57;--ok:#4cc46a}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 16px}
.t{border-top:1px solid var(--line);padding:12px 0}.t h2{font-size:15px;margin:0 0 8px}
.grid{display:flex;gap:8px;overflow-x:auto}.cell{flex:0 0 auto;width:220px}.cell.p{width:110px}
.cell img{width:100%;display:block;border:1px solid var(--line)}.cell.bad img{outline:2px solid var(--bad);outline-offset:-2px}
.m{font-size:12px;color:var(--muted)}.m b.bad{color:var(--bad)}.m b.ok{color:var(--ok)}
label{display:inline-flex;gap:6px;align-items:center;margin:0 0 12px}
</style></head><body>
<h1>Design system sweep</h1>
<p class="sub">${rows.length} templates · ${flaggedCount} screens flagged barely worn (first screen changed &lt; 4%, or ≥ 15% still the template's own colours)</p>
<label><input type="checkbox" id="only"> Only templates with a flagged screen</label>
${rows
  .map((r) => {
    const any = r.systems.some((s) => Object.values(s.views).some((v) => v.flagged))
    const cells = ['desktop', 'phone']
      .map((vw) => {
        const first = r.systems.find((s) => s.views[vw]?.files)
        const def = first
          ? `<div class="cell ${vw === 'phone' ? 'p' : ''}"><img loading="lazy" src="${first.views[vw].files.def}" alt="default ${vw}"><div class="m">default · ${vw}</div></div>`
          : ''
        return (
          def +
          r.systems
            .map((s) => {
              const v = s.views[vw]
              if (!v?.files) return ''
              return `<div class="cell ${vw === 'phone' ? 'p' : ''} ${v.flagged ? 'bad' : ''}"><img loading="lazy" src="${v.files.worn}" alt="${esc(s.label)} ${vw}"><div class="m">${esc(s.label)} · <b class="${v.pass ? 'ok' : 'bad'}">${v.pass ? 'pass' : 'fail'}</b> · changed ${pct(v.changed)} · left ${pct(v.left)}${v.misses.length ? `<br>${esc(v.misses.slice(0, 2).join('; '))}` : ''}</div></div>`
            })
            .join('')
        )
      })
      .join('')
    return `<section class="t" data-flag="${any ? 1 : 0}"><h2>${esc(r.template)} <span class="m">${esc(r.cms ?? '')}</span></h2><div class="grid">${cells}</div></section>`
  })
  .join('\n')}
<script>document.getElementById('only').addEventListener('change',(e)=>{for(const s of document.querySelectorAll('section.t'))s.hidden=e.target.checked&&s.dataset.flag!=='1'})</script>
</body></html>`
writeFileSync(join(OUT, 'index.html'), html)
console.log(`${rows.length} templates, ${flaggedCount} flagged screens → ${join(OUT, 'index.html')}`)
