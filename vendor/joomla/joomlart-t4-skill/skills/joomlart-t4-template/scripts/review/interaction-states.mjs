#!/usr/bin/env node
// Interactive-state audit (the verify-before-fix gate, automated).
// For every kind of interactive element on the page — INCLUDING items inside
// dropdowns/megamenus that it OPENS first (two-level hover, gotchas §36/§47) —
// hover it, then measure computed fg/bg in DARK vs LIGHT (same element, same
// state, theme flipped via the hook attribute+class without reloading) and flag
// where dark is notably WORSE than light. Identical light/dark relationships
// are skipped as by-design.
//
// Usage: node interaction-states.mjs <url> [extraSelector ...]
// Generic selector set below; pass template-specific extras as arguments.
import { chromium } from 'playwright';

const [, , url, ...extra] = process.argv;
if (!url) { console.error('Usage: node interaction-states.mjs <url> [extraSelector ...]'); process.exit(1); }

const SELECTORS = [
  // navs & menus (closed state)
  'nav a', '.navbar-nav > li > a', '.navbar-nav > li > .separator', '.nav > li > a',
  // common components
  '.btn', '.btn-default', '.btn-primary', '.btn-secondary',
  '.pagination > li > a', '.pagination > .active > a', '.pagenav li > a', '.pager a',
  '.nav-tabs > li > a', '.nav-tabs > li.active > a', '.nav-pills > li > a',
  '.breadcrumb > li > a', '.badge', '.label',
  // content links
  'h2 a, h3 a, h4 a', '.item-title a', 'article a', 'footer a',
  // tag/category pills
  '[class*="tag"] a', '[class*="category"] a',
  // DISCLOSURE CONTROLS. A `<summary>` is interactive and has hover states, and this list had no
  // entry for one — so an accordion whose hover DIMMED its question from #1d1d1f to #6e6e73 passed
  // on every page of both builds. A fixed selector list only sees the components somebody thought
  // of; the ones added later are invisible until their name is added too.
  'summary', 'details > summary', '[aria-expanded]', '.accordion-button', '[class*="faq"] summary',
  ...extra,
];
const OPENERS = [
  // hover these to open a panel, then scan links inside the opened panel
  '.navbar-nav > li.dropdown > a', '.navbar-nav > li.dropdown > .separator',
  '[class*="megamenu"] > ul > li.dropdown > a',
];
const INPUTS = ['.form-control', 'input.inputbox', 'input[type="text"]', 'input[type="search"]', 'textarea'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const lum = ([r, g, b]) => { const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  return .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b); };
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
const parse = c => { const m = (c || '').match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/);
  return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null; };
const setTheme = (mode) => page.evaluate((m) => {
  const r = document.documentElement;
  r.classList.toggle('t4-dark', m === 'dark');     // T4 hook
  r.setAttribute('data-theme', m);                  // T3 hook
}, mode);
const measure = (id) => page.evaluate((id) => {
  const e = document.querySelector(`[data-hs="${id}"]`);
  if (!e) return null;
  const cs = getComputedStyle(e);
  let n = e, bg = null;
  while (n) { const c = getComputedStyle(n).backgroundColor;
    if (c && !c.startsWith('rgba(0, 0, 0, 0')) { bg = c; break; } n = n.parentElement; }
  return { color: cs.color, bg: bg || 'rgb(255,255,255)' };
}, id);

// 🔒 TWO NUMBERS, TWO QUESTIONS, AND THEY ARE NOT THE SAME NUMBER.
//   `_rendered` — how many elements the PAGE has. It answers "did this page render at all", and a
//     page that did not is a page whose clean result proves nothing.
//   `_measured` — how many interactive elements this scan actually READ a state from. It answers
//     "did the scan examine anything", which is the question the report is signed for.
// They used to be one number, `document.body.querySelectorAll('*').length`, printed as
// "[N elements examined]" and checked against a floor of 20. Measured 2026-09-17 on a fixture of
// ten links and sixteen filler divs: the scanner printed `OK — interactive states clean
// [29 elements examined]` having measured exactly ONE element. Every skip below is a finding now,
// because an element the scan could not examine is not an element that passed.
const issues = [];
let _targeted = 0, _measured = 0;
async function gateHover(t) {
  const el = page.locator(`[data-hs="${t.id}"]`).first();
  // AT REST FIRST. The gate asked only whether the hovered state is legible, and a hover that DIMS
  // is perfectly legible — an accordion question went #1d1d1f → #6e6e73 on hover, contrast 4.6, and
  // passed on every page of both builds. A pointer is a promise of emphasis; a control that recedes
  // when you point at it is telling the reader the opposite of what it means.
  let restState = null;
  _targeted++;
  try { await el.scrollIntoViewIfNeeded({ timeout: 3000 }); }
  catch (e) { issues.push(`NOT-MEASURED ${t.sel}  "${t.txt}"  could not be scrolled into view`); return; }
  restState = await measure(t.id);
  if (!restState) { issues.push(`NOT-MEASURED ${t.sel}  "${t.txt}"  the tag was gone before the rest state could be read`); return; }

  try { await el.hover({ timeout: 3000, force: true }); }
  catch (e) { issues.push(`NOT-MEASURED ${t.sel}  "${t.txt}"  the pointer could not reach it`); return; }
  await page.waitForTimeout(60);

  {
    const hoverState = await measure(t.id);
    if (!hoverState) { issues.push(`NOT-MEASURED ${t.sel}  "${t.txt}"  the tag was gone before the hovered state could be read`); return; }
    const rc = parse(restState.color), rb = parse(restState.bg);
    const hc = hoverState && parse(hoverState.color), hb = hoverState && parse(hoverState.bg);
    // `parse` reads rgb()/rgba() only. A theme in `oklch()` or `color()` lands here with every
    // colour null and the judgement below simply does not run -- a state read but never judged,
    // which is the shape this gate was rewritten to stop reporting as a pass.
    if (!rc || !rb || !hc || !hb) { issues.push(`NOT-MEASURED ${t.sel}  "${t.txt}"  colours are not rgb(): rest ${restState.color}/${restState.bg}, hover ${hoverState.color}/${hoverState.bg}`); return; }
    if (rc && rb && hc && hb) {
      const before = ratio(rc.c, rb.c), after = ratio(hc.c, hb.c);
      // A tenth of a step is rounding; a fifth is a decision. Only text is judged — an image or a
      // media tile fading under the pointer is a different, legitimate idiom.
      // Weaker is not the same as unreadable. A link that turns accent on hover is the oldest
      // convention on the web and it measured 15.85 → 7 here: quieter, still perfectly legible.
      // What is worth a person's attention is a hover that drops the label BELOW the reading floor —
      // "Start free" going white → accent-on-accent, 6.96 → 1.05, a label that vanishes under the
      // pointer. Both halves are needed: the drop says something changed, the floor says it matters.
      if (before - after > before * 0.2 && after < 4.5 && t.txt && t.txt.trim().length > 2) {
        issues.push(`${t.sel} "${t.txt.trim().slice(0, 26)}" — hover WEAKENS it: contrast ${before.toFixed(2)} → ${after.toFixed(2)}`);
      }
    }
  }
  await setTheme('dark');  const d = await measure(t.id);
  if (!d) { issues.push(`NOT-MEASURED ${t.sel}  "${t.txt}"  the tag was gone in dark`); return; }
  await setTheme('light'); const l = await measure(t.id);
  await setTheme('dark');
  if (!l) { issues.push(`NOT-MEASURED ${t.sel}  "${t.txt}"  the tag was gone in light`); return; }
  const dc = parse(d.color), db = parse(d.bg), lc = parse(l.color), lb = parse(l.bg);
  // Same reason as the rest/hover pair above: a colour this parser cannot read is a state that was
  // never judged, and it used to count as measured while returning in silence.
  if (!dc || !db || !lc || !lb) { issues.push(`NOT-MEASURED ${t.sel}  "${t.txt}"  dark/light colours are not rgb(): ${d.color}/${d.bg}, ${l.color}/${l.bg}`); return; }
  _measured++;
  const rD = ratio(dc.c, db.c), rL = ratio(lc.c, lb.c);
  if ((rD < 2.2 && rL > rD * 1.6) || rD < 1.45)
    issues.push(`HOVER ${t.sel}  "${t.txt}"  dark ${d.color} on ${d.bg} (${rD.toFixed(2)})  vs light ${l.color} on ${l.bg} (${rL.toFixed(2)})`);
}
const collect = (sels, prefix) => page.evaluate(({ sels, prefix }) => {
  const out = []; const seen = new Set();
  sels.forEach((sel, si) => {
    let i = 0;
    let list; try { list = document.querySelectorAll(sel) } catch (e) { return }
    for (const e of list) {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      if (r.width < 6 || r.height < 6 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (!e.offsetParent && cs.position !== 'fixed') continue;
      // 🔒 AN ELEMENT ALREADY TAGGED KEEPS ITS FIRST ID. `data-hs` is a single attribute, so
      // re-tagging under a later selector OVERWRITES it and strands the earlier id: that id is
      // still in the list the caller walks, but no node carries it any more. The overlap is the
      // default, not the exception — `<a class="btn btn-primary">` inside a `<nav>` matches three
      // of the selectors below. Measured 2026-09-17 on exactly that markup: one element produced
      // three targets and TWO `NOT-MEASURED` findings accusing a perfectly reachable link, which
      // is worse than the silence this gate replaced.
      if (e.hasAttribute('data-hs')) continue;
      const sig = sel + '|' + (e.className || '').toString().trim();
      if (seen.has(sig)) continue; seen.add(sig);
      const id = prefix + si + '-' + (i++);
      e.setAttribute('data-hs', id);
      out.push({ sel, id, txt: (e.textContent || '').trim().slice(0, 22) });
      if (i >= 2) break;
    }
  });
  return out;
}, { sels, prefix });

try {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo(0, y); await new Promise(r => setTimeout(r, 25)); } window.scrollTo(0, 0); });

  // pass 1: closed-state elements
  for (const t of await collect(SELECTORS, 'a')) await gateHover(t);

  // pass 2: open each dropdown/megamenu, then gate the items INSIDE it
  for (const opener of OPENERS) {
    const tops = page.locator(opener);
    const n = Math.min(await tops.count(), 6);
    for (let i = 0; i < n; i++) {
      try { await tops.nth(i).hover({ timeout: 3000, force: true }); } catch (e) { continue; }
      await page.waitForTimeout(400);
      const inner = await collect([
        '.dropdown-menu a', '.dropdown-menu .dropdown-header',
        '.dropdown-menu h4 a, .dropdown-menu h3 a', '.dropdown-menu li > span'],
        `m${i}-`);
      // only items actually visible (inside the OPEN panel)
      for (const t of inner) await gateHover(t);
    }
  }

  // pass 3: input focus
  for (const sel of INPUTS) {
    const el = page.locator(sel).first();
    if (!(await el.count())) continue;
    // A focused input IS an interactive state, so it counts toward what this scan examined. Leaving
    // it out made a form page with inputs and no hover target fail with "not one interactive state
    // was measured" -- a false statement about a page the scan had in fact examined.
    _targeted++;
    try { await el.focus({ timeout: 2000 }); }
    catch (e) { issues.push(`NOT-MEASURED ${sel}  the field could not take focus`); continue; }
    await setTheme('dark');
    const f = await page.evaluate((sel) => { const e = document.querySelector(sel); const cs = getComputedStyle(e);
      return { color: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor }; }, sel);
    const fc = parse(f.color), fb = parse(f.bg), fbr = parse(f.border);
    // `parse` reads rgb()/rgba() only. A theme written in `oklch()` or `color()` lands here with
    // every colour null, and the block below simply does not run -- the shape this whole gate was
    // rewritten to remove. Say it instead.
    if (!fc || !fb) issues.push(`NOT-MEASURED ${sel}  focus colours are not rgb(): ${f.color} on ${f.bg}`);
    else _measured++;
    if (fc && fb && fb.a > .5) {
      const r = ratio(fc.c, fb.c);
      if (r < 3) issues.push(`FOCUS ${sel}  dark ${f.color} on ${f.bg} (${r.toFixed(2)})`);
      if (lum(fb.c) > .7) issues.push(`FOCUS ${sel}  bg stays light: ${f.bg}`);
      if (fbr && ratio(fbr.c, fb.c) < 1.15) issues.push(`FOCUS ${sel}  border invisible vs field fill: ${f.border} on ${f.bg}`);
    }
  }

  const _rendered = await page.evaluate(() => document.body ? document.body.querySelectorAll('*').length : 0);
  const blank = _rendered < 20;
  if (blank) {
    console.error(`ERR coverage — only ${_rendered} element(s) in scope on ${url}; the page did not render. A clean result here proves nothing.`);
    process.exitCode = 1;
  } else if (!_measured) {
    console.error(`ERR coverage — the page rendered (${_rendered} elements) but not one interactive state was measured on ${url}; ${_targeted} element(s) were targeted. A clean result here proves nothing.`);
    process.exitCode = 1;
  } else if (!issues.length) console.log(`OK — interactive states clean  ${url}  [${_measured} of ${_targeted} interactive element(s) measured]`);
  // The findings are printed whether or not the coverage verdict above already failed the run. They
  // used to hang off the `else` of that chain, so a run that measured NOTHING -- the case where the
  // reasons matter most -- printed the verdict and swallowed every reason for it.
  if (issues.length) {
    console.log(`# interactive-state issues  ${url}  [${_measured} of ${_targeted} measured]`);
    for (const i of issues) console.log('  ' + i);
    // A NOT-MEASURED finding among successfully measured ones must not exit 0. The coverage branch
    // above only catches the all-or-nothing case, so one good target beside one vanished target
    // printed the reason and still reported success -- the same false pass in a smaller dose.
    if (issues.some((i) => i.startsWith('NOT-MEASURED')) && !process.exitCode) process.exitCode = 1;
  }
} catch (e) {
  // Fail LOUDLY. A scanner that prints ERR and exits 0 is indistinguishable from a clean page —
  // exactly the false-confidence trap review.md warns about.
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally { await browser.close(); }
