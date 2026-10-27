#!/usr/bin/env node
// Is the shared layer's rule the one that actually WINS?
//
// Usage: node cascade-ownership.mjs <url> [--prefix=tracy] [--props=color,background-color,…] [--limit=120]
//
// WHY THIS GATE EARNS ITS KEEP. Eight of the twenty-two defects fixed in one session were the same
// shape: a rule in the shared layer said the right thing and LOST. It lost to Bootstrap, to T4's
// base, or once to another partial of our own — and a losing rule is indistinguishable from a
// winning one by reading the stylesheet. Three of those eight cost three build-and-measure rounds
// each, because specificity was counted by eye and counted wrong:
//
//   · `.tracy-cattree__items { display: grid }` lost to `.categories-list .com-content-categories__items
//     { display: flex }` — two classes beat one, and the grid columns became inert;
//   · `.tracy-cardgrid__cell { flex: 1 1 100% }` beat `.col-md-6`, putting a blog list in one column;
//   · the megamenu type rule lost on the ELEMENT count to a selector carrying `li[data-align]`,
//     while sitting 3000 lines later in the same file.
//
// The browser knows the answer in one call. `CSS.getMatchedStylesForNode` returns matching rules in
// INCREASING priority, so the last one to declare a property is the one in force. This gate asks
// that question for every element the shared layer styles, and reports where our rule is present
// and beaten.
//
// It does NOT flag a property the shared layer never claimed — the framework is allowed to own
// everything we did not write a rule for. The finding is specifically: WE said something here, and
// something else is what the reader sees.
import { chromium } from 'playwright';

const [, , url, ...rest] = process.argv;
const opt = (n, d) => { const h = rest.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
if (!url) { console.error('Usage: node cascade-ownership.mjs <url> [--prefix=tracy] [--props=…] [--limit=…]'); process.exit(2); }

const PREFIX = opt('prefix', 'tracy');
const PROPS = opt('props', 'color,background-color,background,display,font-size,font-weight,font-family,border-radius,flex,width,grid-template-columns,justify-content,padding,margin').split(',');
const LIMIT = Number(opt('limit', 120));
const VW = Number(opt('viewport', 1440));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: VW, height: 900 } })).newPage();
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(300);

// One representative element per class signature — a hundred cards with the same classes answer the
// same question, and asking once keeps the CDP round-trips down.
const ids = await page.evaluate(({ prefix, limit }) => {
  const seen = new Set();
  const out = [];
  // The layer styles far more than the elements that CARRY its prefix: `.tracy-pagination .page-link`,
  // `.tracy-field input`, `.tracy-auth .radio label`. Probing only prefixed elements missed every one
  // of those — and they are where the cascade fights happen, because that is exactly where the
  // framework has its own rules. So: any element inside a prefixed container counts too.
  const scope = [...document.querySelectorAll(`[class*="${prefix}-"]`)];
  const pool = new Set(scope);
  for (const root of scope) for (const d of root.querySelectorAll('*')) pool.add(d);
  for (const el of pool) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const sig = `${el.tagName}|${(el.className || '').toString().trim()}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const id = `cascade-probe-${out.length}`;
    el.setAttribute('data-cascade-probe', id);
    out.push({ id, sig: sig.split('|')[1].slice(0, 46), tag: el.tagName });
    if (out.length >= limit) break;
  }
  return out;
}, { prefix: PREFIX, limit: LIMIT });

const cdp = await page.context().newCDPSession(page);
await cdp.send('DOM.enable');
await cdp.send('CSS.enable');
const { root } = await cdp.send('DOM.getDocument', { depth: -1 });

// WHICH RULES ARE OURS. Not the ones whose selector mentions the prefix — half the shared layer
// deliberately targets the framework's own class names, because that is what overriding means. The
// honest boundary is POSITION: everything after the marker the layer opens with. Each stylesheet is
// read once and reduced to the line the marker sits on; a rule at or after it is ours.
//
// Selector-matching was tried first and reported a `.btn` base rule as "beaten" by its own
// `.btn.btn-primary` variant — a rule losing to itself, which is just how cascades work.
const MARK = 'data-tracy-layer-start';
const sheetInfo = new Map();
const infoOf = async (sheetId) => {
  if (sheetInfo.has(sheetId)) return sheetInfo.get(sheetId);
  let info = { mark: Infinity, lineStarts: [0] };
  try {
    const { text } = await cdp.send('CSS.getStyleSheetText', { styleSheetId: sheetId });
    // Character offsets, because the optimize bundle is ONE line: line numbers carry no information
    // there and every rule reports startLine 0.
    const lineStarts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
    const i = text.indexOf(MARK);
    info = { mark: i >= 0 ? i : Infinity, lineStarts };
  } catch { /* a sheet we cannot read is a sheet we do not own */ }
  sheetInfo.set(sheetId, info);
  return info;
};
const isOurs = async (r) => {
  const range = r.rule.style.range;
  if (!range) return false;
  const info = await infoOf(r.rule.styleSheetId);
  if (info.mark === Infinity) return false;
  const base = info.lineStarts[range.startLine] ?? 0;
  return base + range.startColumn >= info.mark;
};

const beaten = [];
for (const probe of ids) {
  const q = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-cascade-probe="${probe.id}"]` });
  if (!q.nodeId) continue;
  let m;
  try { m = await cdp.send('CSS.getMatchedStylesForNode', { nodeId: q.nodeId }); } catch { continue; }
  const rules = m.matchedCSSRules || [];
  for (const prop of PROPS) {
    // Every rule that declares this property, in increasing priority. The last is in force.
    const declaring = rules.filter((r) => (r.rule.style.cssProperties || []).some((p) => p.name === prop && !p.disabled));
    if (declaring.length < 2) continue;
    const winner = declaring[declaring.length - 1];
    const flags = [];
    for (const r of declaring) flags.push(await isOurs(r));
    const ours = declaring.filter((_, i) => flags[i]);
    if (!ours.length) continue;                     // we never claimed it — the framework may own it
    if (flags[flags.length - 1]) continue;          // we won
    const val = (sel) => (sel.rule.style.cssProperties.find((p) => p.name === prop) || {}).value;

    // BEING OVERRIDDEN IS NOT THE SAME AS BEING WRONG. A base rule is allowed to specialise a
    // general one: `a { color: var(--body-link-color) }` losing to `.navbar-brand a { color:
    // var(--fg) }` is the wordmark taking ink instead of link colour, which is correct — and it
    // accounted for 52 of 64 findings on a full sweep, 81% noise, on a gate nobody would then read.
    //
    // The distinction that holds: if the winner's value is also one of THIS system's tokens, the
    // cascade landed somewhere the design system still governs. What matters is our rule losing to a
    // value the design system does not name — a literal, or a framework variable.
    const winVal = String(val(winner) ?? '');
    const speaksTokens = /var\(--(?!t4-)/.test(winVal);
    if (speaksTokens) continue;

    beaten.push({
      el: `${probe.tag}.${probe.sig}`,
      prop,
      ourSel: ours[ours.length - 1].rule.selectorList.text.split(',')[0].trim().slice(0, 58),
      ourVal: String(val(ours[ours.length - 1])).slice(0, 26),
      winSel: winner.rule.selectorList.text.split(',')[0].trim().slice(0, 58),
      winVal: String(val(winner)).slice(0, 26),
    });
  }
}
await browser.close();

console.log(`# cascade-ownership  ${url}  @${VW}px`);
console.log(`  elements probed: ${ids.length}  ·  properties: ${PROPS.length}`);

if (!ids.length) {
  console.log(`FAIL — nothing on this page carries a \`${PREFIX}-\` class; a clean result proves nothing.`);
  process.exit(2);
}
if (!beaten.length) {
  console.log('OK — every rule the shared layer declares is the one in force');
  process.exit(0);
}
console.log('');
for (const b of beaten.slice(0, 20)) {
  console.log(`  ✗ ${b.el}`);
  console.log(`      ${b.prop}: ours \`${b.ourSel}\` → ${b.ourVal}`);
  console.log(`      ${' '.repeat(b.prop.length)}  wins \`${b.winSel}\` → ${b.winVal}`);
}
if (beaten.length > 20) console.log(`  … and ${beaten.length - 20} more`);
console.log('');
console.log('A rule that loses looks exactly like a rule that wins in the stylesheet, and being later');
console.log('in the file does not settle it. Match the winner\'s specificity by carrying its context —');
console.log('count all three columns, elements included — rather than reaching for !important.');
process.exit(1);
