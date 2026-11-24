// node dom.mjs <url> <width> <selector> [depth]: outline of the first match: tag.classes rect, text start
import { chromium } from 'playwright'
const [url, w, sel, depth = '3'] = process.argv.slice(2)
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: 900 } })
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1200)
console.log((await p.evaluate(([sel, depth]) => { const out = []; const root = document.querySelector(sel); if (!root) return ['no match']
 const walk = (e, d) => { if (d > +depth) return; for (const c of e.children) { if (['SCRIPT','STYLE'].includes(c.tagName)) continue; const r = c.getBoundingClientRect(); const cs = getComputedStyle(c)
  out.push('  '.repeat(d) + c.tagName.toLowerCase() + (c.id ? '#' + c.id : '') + '.' + [...c.classList].slice(0, 4).join('.') + ` [${Math.round(r.left)},${Math.round(r.top + scrollY)} ${Math.round(r.width)}x${Math.round(r.height)}] ${cs.fontSize}/${cs.fontWeight} ${cs.color} ${cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? 'bg=' + cs.backgroundColor : ''} ${(c.children.length ? '' : (c.textContent || '').trim().slice(0, 40))}`); walk(c, d + 1) } }
 walk(root, 0); return out }, [sel, depth])).join('\n')); await b.close()
