#!/usr/bin/env node
// Do the components use the SHAPE the design system declares?
//
// Usage: node geometry-fidelity.mjs <url> [--roles=<selector list>]
//
// WHY THIS IS ITS OWN GATE. Every colour gate can pass on a component that is the wrong shape. A
// pagination bar measured correct tokens for ink, correct family, correct contrast — and rendered
// as Bootstrap's square-cornered button group on a design system whose radius scale is 12px and
// whose pill is 980px. `border-radius` was 0. Nothing asked.
//
// WHAT IT COMPARES AGAINST. The system's own radius tokens, read from the live page — `--radius-sm`
// through `--radius-xl`, `--radius-pill`, and the template's `--tracy-capsule`. A value that is not
// one of those, and not zero-by-declaration, is a shape nobody chose: it came from the framework.
//
// WHY ZERO IS NOT AUTOMATICALLY WRONG. Some systems declare a square radius, and some elements are
// square on purpose — a table cell, a full-bleed image, a rule. So the scan looks only at elements
// that are unmistakably COMPONENTS: interactive controls and boxes carrying their own surface. And
// it accepts 0 when the system's own scale contains 0.
import { chromium } from 'playwright';

const [, , url, ...rest] = process.argv;
const opt = (n) => { const h = rest.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : null; };
if (!url) { console.error('Usage: node geometry-fidelity.mjs <url> [--roles=<selectors>]'); process.exit(2); }

// Controls, and boxes that paint their own surface. Deliberately NOT every element.
const ROLES = opt('roles')
  || '.btn, button, .page-link, .pagination a, .pagination span, input, select, textarea, '
   + '[class*="__card"], [class*="-card"], .card, [class*="__chip"], [class*="badge"], [class*="__pill"]';

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(300);

const res = await page.evaluate((roles) => {
  const root = getComputedStyle(document.documentElement);
  const px = (n) => {
    const v = root.getPropertyValue(n).trim();
    return v ? v : null;
  };
  const scale = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-pill', '--tracy-capsule']
    .map((n) => [n, px(n)]).filter(([, v]) => v);
  // Normalise to a number of px so `980px` and `9999px` compare, and a pill reads as "very large".
  const num = (v) => {
    const m = String(v).match(/^([\d.]+)px$/);
    return m ? parseFloat(m[1]) : null;
  };
  const allowed = new Map();
  for (const [name, v] of scale) { const n = num(v); if (n !== null) allowed.set(n, name); }
  // 50% is a circle — always a legitimate shape, and a system does not need a token for it.
  const okLiteral = new Set(['50%', '0px']);

  const seen = [];
  const bad = [];
  for (const el of document.querySelectorAll(roles)) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    // A box only shows its shape when it draws an edge — EXCEPT an interactive control, whose
    // resting state may be transparent while hover paints the same box. Its radius is part of the
    // contract either way, and skipping it dropped the pagination links, which are exactly what
    // this gate was written for: measured 2 components in scope on a page that has a dozen.
    // A LINK is text unless it paints a box. `<a>` with no ground and no border has no corners to
    // round, and reporting it produced findings on ordinary prose links.
    const formControl = el.matches('button, .btn, .page-link, input, select, textarea');
    const control = formControl || (el.matches('a') && (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0));

    // A SQUARE INSIDE A ROUNDED SHELL is the shell's decision. `.tracy-chip select` is deliberately
    // square because the chip around it carries the radius and clips — flagging the child reports
    // the same corner twice, once as right and once as wrong.
    const shell = el.parentElement && (() => {
      const ps = getComputedStyle(el.parentElement);
      return parseFloat(ps.borderTopLeftRadius) > 0 && (ps.overflow === 'hidden' || ps.overflow === 'clip' || ps.backgroundColor !== 'rgba(0, 0, 0, 0)');
    })();
    const paints = cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
      || parseFloat(cs.borderTopWidth) > 0
      || cs.boxShadow !== 'none';
    if (!paints && !control) continue;
    // A NATIVE control draws itself. `appearance: auto` means the browser paints the widget — a radio
    // is a circle on screen while its computed `border-radius` reads 0px, because CSS never touched
    // the shape. Reporting it asks the stylesheet to answer for something it does not control.
    if (cs.appearance === 'auto' && el.matches('input, select')) continue;

    if (shell && [cs.borderTopLeftRadius, cs.borderTopRightRadius].every((c) => c === '0px')) continue;
    const corners = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius];
    seen.push(el);
    const offScale = corners.filter((c) => {
      if (okLiteral.has(c)) return false;
      const n = num(c);
      if (n === null) return false;          // percentages other than 50% — leave to a human
      if (allowed.has(n)) return false;
      // A radius larger than the box is a pill however it was written.
      if (n >= Math.min(r.width, r.height) / 2) return false;
      return true;
    });
    // A component whose corners DISAGREE with each other is Bootstrap's group treatment, not a
    // design decision — `12px 0 0 12px` is the giveaway.
    // An INPUT GROUP is one control drawn as several boxes — the field and the button beside it
    // share a single outline, so the halves carry opposite corners on purpose. Same reasoning as the
    // shell above: the group owns the shape, not its parts.
    const inGroup = Boolean(el.closest('.input-group, .btn-group, .tracy-chip'));
    const mixed = !inGroup && new Set(corners).size > 1;
    const allZero = corners.every((c) => c === '0px') && !allowed.has(0);
    if (offScale.length || mixed || allZero) {
      bad.push({
        name: `${el.tagName}.${(el.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 34)}`,
        text: (el.textContent || '').trim().slice(0, 14),
        radius: corners.join(' '),
        why: allZero ? 'square, and the system declares no zero step'
          : mixed ? 'corners disagree — a framework group treatment, not a chosen shape'
          : 'off the scale',
      });
    }
  }
  return { scale, examined: seen.length, bad: bad.slice(0, 10) };
}, ROLES);
await browser.close();

console.log(`# geometry-fidelity  ${url}`);
console.log(`  radius scale: ${res.scale.map(([n, v]) => `${n.replace('--', '')}=${v}`).join(' · ') || '(none declared)'}`);
console.log(`  components examined: ${res.examined}`);

if (!res.scale.length) {
  console.log('FAIL — the page declares no radius token; there is nothing to measure against.');
  process.exit(2);
}
if (res.examined < 3) {
  console.log(`FAIL — only ${res.examined} component(s) in scope; a clean result here proves nothing.`);
  process.exit(2);
}
if (!res.bad.length) {
  console.log('OK — every component uses a shape from the system scale');
  process.exit(0);
}
console.log('');
for (const b of res.bad) console.log(`  ✗ ${b.name} "${b.text}"  radius: ${b.radius}  — ${b.why}`);
console.log('');
console.log('A shape that is not on the scale came from the framework, not from the design system.');
console.log('The usual source is a component nobody overrode: Bootstrap ships pagination, form');
console.log('controls and button groups with their own radii, and colour tokens alone do not reshape them.');
process.exit(1);
