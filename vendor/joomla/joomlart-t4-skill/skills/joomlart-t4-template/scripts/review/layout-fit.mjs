#!/usr/bin/env node
// Is the content using the width the design system asked for?
//
// Usage: node layout-fit.mjs <url> [--min-fill=0.7] [--module-fill=0.9] [--viewport=1440]
//
// A design system declares a container width. Nothing enforces that the page USES it. A reading
// measure meant for article prose, applied one level too high, binds every module inside it;
// a stack of marketing blocks then renders inside a narrow column, and the pricing cards inside
// come out a third of their intended width. Every card is internally correct — correct tokens,
// correct radius, correct contrast — so contrast, leak, seam, border, hover and toggle scanners
// all pass. The page is simply the wrong shape, and only a width measurement says so.
//
// TWO checks, because the failure has two shapes:
//
//   A. The widest content container against `--container-max`. Catches a whole page that has
//      lost its measure.
//   B. MODULE and ACM block wrappers against `--container-max`. Catches the far more common
//      case: one region pinched while the rest of the page is fine. This check needs no guessed
//      threshold, because a marketing module is SUPPOSED to fill the declared container — on a
//      correct build it measures at exactly `--container-max`. Article prose is deliberately
//      excluded: a reading measure narrower than the container is the point of a reading measure.
//
// Also reports anything past the right edge, since horizontal overflow is the same failure from
// the other direction. Only the right edge counts — an element parked off the LEFT is where a
// closed off-canvas drawer lives, and flagging it is a false alarm on every T4 page.
import { chromium } from 'playwright';

const [, , url, ...flags] = process.argv;
if (!url) {
  console.error('Usage: node layout-fit.mjs <url> [--min-fill=0.7] [--module-fill=0.9] [--viewport=1440]');
  process.exit(1);
}
const arg = (name, fallback) => {
  const hit = flags.find((f) => f.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const minFill = Number(arg('min-fill', 0.7));
const moduleFill = Number(arg('module-fill', 0.9));
const vw = Number(arg('viewport', 1440));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: vw, height: 900 } })).newPage();
await page.goto(url, { waitUntil: 'load' });

const found = await page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const declared = parseFloat(root.getPropertyValue('--container-max')) || null;

  const inMain = (el) => !el.closest('.t4-masthead, .t4-footer, .t4-footnav, nav, header, footer');
  const label = (el, n = 3) => (el.className || '').toString().split(/\s+/).filter(Boolean).slice(0, n).join('.') || el.tagName.toLowerCase();
  const box = (el) => ({ el, w: el.getBoundingClientRect().width });

  // A FULL-BLEED wrapper is not what `--container-max` governs, so counting it reports a
  // meaningless fill above 100%.
  // A region the template DECLARES as a reading column is not failing to use the measure — it is
  // the measure. `--narrow` is the shared layer's own name for that decision, so a container inside
  // one is excluded exactly as `.item-page` prose already is.
  //
  // Measured before this exclusion existed: the narrow rule resolves to `calc(720px + gutter*2)`,
  // so the SAME correct page reads 764px under a design system whose gutter is 22px and 800px under
  // one whose gutter is 40px. Against a declared container it scored 75% on the first and 63% on the
  // second — one green, one red, for markup that is identical. A gate whose verdict depends on which
  // design system is wearing the template is a gate that reports the design system, not the build.
  const containers = [...document.querySelectorAll('.container, .com-content-article, [class*="__inner"]')]
    .filter(inMain)
    .map(box)
    // Drop the FULL-BLEED wrapper — but only where "full width" means something. On a phone the
    // container legitimately fills the viewport, and this filter removed every candidate: the gate
    // then failed with "no content container matched" on every page at 390px, which is a gate that
    // cannot run rather than a page that is wrong.
    .filter((c) => c.w > 0 && (window.innerWidth <= declared || c.w < window.innerWidth - 1));

  // Module and ACM block wrappers — the things that must fill the container.
  const modules = [...document.querySelectorAll('.moduletable, [class*="acm-"], .ja-acm')]
    .filter(inMain)
    .filter((el) => !el.parentElement?.closest('.moduletable, .ja-acm'))
    .map(box).filter((c) => c.w > 0);

  const hidden = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return true;
      if (n.hasAttribute('aria-hidden') && n.getAttribute('aria-hidden') !== 'false') return true;
    }
    return false;
  };

  // CONTENT INSIDE A SCROLL CONTAINER IS NOT OVERFLOW. A carousel track is a real horizontal
  // scroller: its later slides sit outside the viewport ON PURPOSE, and the reader reaches them by
  // scrolling the track, not the page. Measured when the carousel block landed: the fourth and
  // fifth slides reported 101px and 315px "past the right edge" on two builds, which is the
  // mechanism working. What this check is for is content the page cannot reach at all.
  const inScroller = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };

  const overflowAll = [...document.querySelectorAll('body *')]
    .filter((el) => !hidden(el) && !inScroller(el))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.right > window.innerWidth + 1);
  // 🔒 THE CAP IS FINE; HIDING IT IS NOT. Five rows is the right amount to print — but the TOTAL is
  // what tells a reader whether the page has a stray element or a broken layout. `run-all.sh`'s own
  // note records the case: opening one drawer pushed 83 elements past the right edge at 800px, and
  // the report would have shown five with nothing saying how many more there were.
  const overflowTotal = overflowAll.length;
  const overflow = overflowAll
    .slice(0, 5)
    .map(({ el, r }) => ({ name: label(el, 2), right: Math.round(r.right), over: Math.round(r.right - window.innerWidth) }));

  // CONTENT CLIPPED INSIDE ITS OWN BOX. Overflow past the viewport is only half the failure: a card
  // whose text measures 412px inside a 348px box does not push the page at all, it cuts the words
  // off mid-word — "How to curabitu", "ullamcorper vulputa" — and every gate stays green because
  // nothing moved and no colour is wrong. A reader sees it instantly; nothing else here does.
  // Content is CUT only where the box actually clips it. `scrollWidth > clientWidth` alone is not
  // that test: with the default `overflow: visible` a wider child simply paints outside its parent,
  // which is exactly what the negative-margin breakout in gotcha #82 does on purpose — and the
  // first version of this check reported that fix as a 130px defect. Reserve the finding for
  // `hidden` and `clip`, where the words really are gone.
  const clips = (el) => {
    const s = getComputedStyle(el);
    return /(hidden|clip)/.test(s.overflowX) || /(hidden|clip)/.test(s.overflow);
  };
  const clipped = [...document.querySelectorAll('body *')]
    .filter((el) => !hidden(el) && inMain(el))
    // A container that is SUPPOSED to scroll is not clipping — that is what `.table-responsive` and
    // a code block are for.
    .filter((el) => !el.closest('[class*="table-responsive"], pre, code, [class*="-scroll"]'))
    .filter((el) => clips(el))
    // The screen-reader pattern clips ON PURPOSE: `.visually-hidden` and `.sr-only` collapse a
    // label to a 1px box so it is read aloud and not drawn. That is not a defect, it is the
    // accessible way to label a control, and flagging it fired on five correct pages. A box under
    // 24px is never a layout — no card, column or field is that narrow.
    .filter((el) => el.clientWidth >= 24 && !el.matches('.visually-hidden, .sr-only, .screen-reader-text'))
    .filter((el) => el.scrollWidth > el.clientWidth + 1)
    .slice(0, 6)
    .map((el) => ({
      name: label(el, 2),
      box: el.clientWidth,
      content: el.scrollWidth,
      cut: el.scrollWidth - el.clientWidth,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    }));

  // The CONTENT REGION — what a Joomla component view renders into. It is neither a `.container`
  // nor a module, so both measurements above walk straight past it: on a blog list bound to the
  // prose measure the container is a correct 1068px and there are no modules at all, and the page
  // still renders its articles in half the width it was given.
  // LIST and GRID views only. A single article's prose region is SUPPOSED to sit at the reading
  // measure — that is what a reading measure is for — and including `.item-page` here reported a
  // correct pricing page as 70.3% and wrong. What must fill the container is a view that renders a
  // set of items side by side.
  const regionEl = [...document.querySelectorAll('[class*="category-blog"], [class*="category-list"], .blog-items, [class*="__items"], .categories-list')]
    .filter((el) => !el.closest('.item-page'))
    .filter(inMain)
    .map(box)
    .filter((c) => c.w > 0 && c.w < window.innerWidth - 1)
    .reduce((a, b) => (b.w > a.w ? b : a), { w: 0, el: null });

  // A MEDIA SLOT ITS IMAGE DOES NOT FILL. When a card lays out as a row, the media column stretches
  // to the text column's height while the image keeps its own aspect — so the slot ends up part
  // picture, part empty ground. Measured on a real build: a 461x573 media column holding a 461x259
  // image, 314px of nothing, 55% of the column. `object-fit: cover` was already set and did nothing,
  // because cover fills the BOX and the box was never told to be tall.
  //
  // This is a LAYOUT defect, not an imagery one — the photo was a perfectly ordinary 960x540. It
  // sits in the seam between the two, which is why neither the width checks above nor Phase 6b
  // (licence-safe sourcing) looks for it.
  const unfilled = [...document.querySelectorAll('[class*="__media"], [class*="-media"], figure')]
    .filter(inMain)
    .filter((el) => !hidden(el))
    .map((el) => ({ el, img: el.querySelector('img'), r: el.getBoundingClientRect() }))
    .filter(({ img, r }) => img && r.height > 80)
    .map(({ el, img, r }) => {
      const ir = img.getBoundingClientRect();
      return { name: label(el, 2), slot: Math.round(r.height), image: Math.round(ir.height), gap: Math.round(r.height - ir.height) };
    })
    // A slot that hugs its image has no gap at all, so only STRETCHED slots can appear here. The
    // floor keeps a caption or a couple of pixels of rounding out of the report.
    .filter((u) => u.gap > 48 && u.image / u.slot < 0.8)
    .slice(0, 5);

  // A DECLARATION THAT CANNOT APPLY. `grid-template-columns` on a box whose `display` is not a grid
  // is not a style, it is a note about what somebody meant — the browser keeps it in the computed
  // style, so it reads back exactly like a working rule, and nothing renders an error.
  //
  // This is the check that was missing when a category page passed every width test and still looked
  // wrong. `.tracy-cattree__items` declared `display: grid` with two columns; T4's base ships
  // `.categories-list .com-content-categories__items { display: flex }`, which carries one more
  // class and therefore wins, so the element was a flex container holding `grid-template-columns:
  // repeat(2, minmax(0, 1fr))` that did nothing. The cards kept their intrinsic 353px inside a
  // 1058px region and the row stopped 328px short of the right edge. Both existing checks were
  // green: the CONTAINER filled its measure, and the fault was one level down, among its children.
  //
  // No threshold is involved and none is possible — the property either can apply or it cannot.
  const dead = [];
  for (const el of document.querySelectorAll('*')) {
    if (hidden(el) || !inMain(el)) continue;
    const cs = getComputedStyle(el);
    const d = cs.display;
    const isGrid = d === 'grid' || d === 'inline-grid';
    const isFlex = d === 'flex' || d === 'inline-flex';
    const gridProps = ['gridTemplateColumns', 'gridTemplateRows', 'gridAutoFlow', 'gridTemplateAreas'];
    if (!isGrid) {
      for (const prop of gridProps) {
        const v = cs[prop];
        if (!v || v === 'none' || v === 'row' || v === 'normal') continue;
        dead.push({ name: label(el, 2), prop: prop.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), value: v.slice(0, 40), display: d });
        break;
      }
    }
    // `gap` needs a flex, grid or multi-column formatting context; on a block box it is inert.
    if (!isGrid && !isFlex && d !== 'block' && cs.gap && cs.gap !== 'normal') {
      dead.push({ name: label(el, 2), prop: 'gap', value: cs.gap, display: d });
    }
  }

  // A GROUND THAT HUGS ITS WORDS. An element that paints its own background is making a promise —
  // this area is a thing — and an area with no inset reads as a mistake rather than a decision. The
  // pricing band declared `padding-block: var(--tracy-band-y)` and a background, and a rule meant to
  // stop ACM padding doubling the band's stripped the padding: measured 0px from the top edge to the
  // first word, on a block 100px of air was written for.
  //
  // No threshold is guessed. The test is whether the FIRST child starts at the ground's own edge,
  // which is 0 or it is not. Transparent boxes are not asked — they have no edge to respect.
  const hugging = [];
  for (const el of document.querySelectorAll('*')) {
    if (hidden(el) || !inMain(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.backgroundImage === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 200 || r.height < 80) continue;
    // The PAGE's own ground is not an area — the header is meant to sit against its top edge. Only
    // boxes that carve a region out of the page are making the promise this checks.
    if (r.height > document.documentElement.scrollHeight * 0.6) continue;
    // A BAR is not an area. Headers, footers and nav strips are meant to run edge to edge with their
    // contents centred inside — measuring them against the same rule reported every page's header,
    // on every build, which is how a check becomes something nobody reads.
    // Named, not pattern-matched: `[class*="nav"]` matched `body.navigation-default`, so the whole
    // page counted as a bar and the check reported nothing at all. Same mistake as drawer-state's
    // panel selector — a substring of a class name is not a category.
    if (el.closest('header, footer, .t4-header, .t4-footer, .navbar, .tracy-nav, .t4-offcanvas')) continue;
    // A ground identical to its parent's is not a new area either; it is the same surface continuing.
    // Against the ground it actually sits on, walking past transparent wrappers. `--canvas` paints
    // `var(--bg)` — the page's own white — so it declares no new area and needs no inset; comparing
    // with the immediate parent (a transparent `.container`) missed that and reported four pages.
    let underneath = null;
    for (let n = el.parentElement; n && !underneath; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg !== 'rgba(0, 0, 0, 0)') underneath = bg;
    }
    if (underneath && underneath === cs.backgroundColor) continue;
    const kid = [...el.children].find((c) => { const kr = c.getBoundingClientRect(); return kr.width > 0 && kr.height > 0; });
    if (!kid) continue;
    // MEDIA IS MEANT TO BLEED. A card that opens with a picture running to its own edges is the
    // "image-first composition" this library's systems describe, not a missing inset — measured on
    // 12 pages of two builds, every one of them a postcard or an iframe shell.
    if (kid.matches('img, picture, figure, video, iframe, [class*="media"], [class*="thumb"]')
        || kid.querySelector(':scope > img, :scope > picture, :scope > iframe')) continue;
    const kr = kid.getBoundingClientRect();
    const ks = getComputedStyle(kid);
    // The child may hold the inset itself — a `.container` carries its own gutters, and a header's
    // bar is meant to run to the edges while its contents do not. What matters is the distance from
    // the ground to the CONTENT, so a child that pads itself has already answered.
    const top = Math.round(kr.top - r.top) + parseFloat(ks.paddingTop || 0);
    const left = Math.round(kr.left - r.left) + parseFloat(ks.paddingLeft || 0);
    if (top <= 0 || left <= 0) {
      hugging.push({ name: label(el, 2), top, left, w: Math.round(r.width), h: Math.round(r.height) });
      if (hugging.length >= 5) break;
    }
  }

  // A GUTTER SPENT TWICE. T4 wraps a section's modules in `.t4-section-inner.container`, and every
  // ACM block ships a `.container` of its own — so the inner one insets AGAIN and the block's text
  // starts one gutter further in than the header, the page title and any full-bleed block above it.
  // Measured on two builds: the hero began at 208px and every chapter under it at 230px, the exact
  // width of one gutter, on every page that stacks ACM blocks. It is the misalignment a reader sees
  // first — a page whose left edge moves halfway down — and every width check here was green,
  // because 1024px inside 1068px is a perfectly reasonable fill and no threshold is crossed.
  //
  // Structural, so no threshold exists: a container inside a container has nothing left to inset,
  // and any padding it carries is the same gutter counted twice. Reported against the OUTER
  // container's own gutter, which is the number it duplicates.
  const doubled = [];
  for (const el of document.querySelectorAll('.container, .container-fluid, .container-lg, .container-xl')) {
    if (hidden(el) || !inMain(el)) continue;
    const outer = el.parentElement?.closest('.container, .container-fluid, .container-lg, .container-xl');
    if (!outer) continue;
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    if (pad <= 0) continue;
    const outerPad = parseFloat(getComputedStyle(outer).paddingLeft) || 0;
    doubled.push({
      name: label(el, 2),
      outerName: label(outer, 2),
      pad: Math.round(pad),
      outerPad: Math.round(outerPad),
      textEdge: Math.round(el.getBoundingClientRect().x + pad),
    });
    if (doubled.length >= 5) break;
  }

  // A PAGE WITH A SIDEBAR HAS A NARROWER MAIN COLUMN, and that is the layout working, not failing.
  // `--container-max` describes the whole row; when T4 renders a `sidebar-r`/`sidebar-l` column
  // beside the component, the content region is measured against the COLUMN it actually lives in.
  // Without this, turning the sidebar on reported six pages at 74-77% "bound by a measure meant for
  // prose" — the exact opposite of what had happened.
  const sidebarCol = document.querySelector('.t4-col.sidebar-r, .t4-col.sidebar-l, [class*="t4-sidebar"]');
  const mainCol = sidebarCol
    ? [...document.querySelectorAll('.t4-main-body .t4-col, .tracy-main .t4-col')]
        .filter((c) => c !== sidebarCol && !c.contains(sidebarCol))
        .reduce((a, c) => (c.getBoundingClientRect().width > (a ? a.getBoundingClientRect().width : 0) ? c : a), null)
    : null;
  const columnMax = mainCol ? Math.round(mainCol.getBoundingClientRect().width) : null;

  const pick = (list, cmp) => (list.length ? (() => { const x = list.reduce(cmp); return { w: Math.round(x.w), name: label(x.el) }; })() : null);

  return {
    columnMax,
    sidebar: Boolean(sidebarCol),
    doubled,
    hugging,
    dead: dead.slice(0, 8),
    declared,
    // Whether the page's content region is ITSELF the reading column. Then there is no container to
    // hold against `--container-max`, and the page is skipped rather than failed — the same stance
    // `band-rhythm` takes on a page with one band.
    narrowRegion: Boolean(document.querySelector('[class*="--narrow"]')),
    counted: containers.length,
    moduleCount: modules.length,
    widest: pick(containers, (a, b) => (b.w > a.w ? b : a)),
    narrowest: pick(containers, (a, b) => (b.w < a.w ? b : a)),
    thinnestModule: pick(modules, (a, b) => (b.w < a.w ? b : a)),
    widestModule: pick(modules, (a, b) => (b.w > a.w ? b : a)),
    region: regionEl.el ? { w: Math.round(regionEl.w), name: label(regionEl.el) } : null,
    overflow,
    overflowTotal,
    clipped,
    unfilled,
  };
});

await browser.close();

console.log(`# layout-fit  ${url}  @${vw}px`);

if (!found.declared) {
  console.log('FAIL — :root declares no `--container-max`; there is nothing to measure against.');
  process.exit(2);
}
if (found.counted === 0) {
  console.log('FAIL — no content container matched; nothing was measured.');
  process.exit(2);
}

// A page whose content region is declared a reading column has no container to hold against
// `--container-max` — the narrow measure is the decision, not a failure to use the full width. The
// rest of the scan (overflow, clipping, unfilled media slots) still runs; only the fill check goes.
if (found.narrowRegion) {
  console.log(`  --container-max declared: ${found.declared}px`);
  console.log(`  the content region is declared narrow — fill check skipped, it is a reading column`);
}

const fill = found.widest.w / found.declared;
if (!found.narrowRegion) console.log(`  --container-max declared: ${found.declared}px`);
console.log(`  widest content container: ${found.widest.w}px  (${found.widest.name})`);
console.log(`  narrowest:                ${found.narrowest.w}px  (${found.narrowest.name})`);
if (!found.narrowRegion && vw >= found.declared) console.log(`  fill: ${(fill * 100).toFixed(1)}% of declared  [${found.counted} containers measured]`);

const problems = [];
// The fill check compares the container against `--container-max`, which only asks a question when
// the VIEWPORT is at least that wide. On a 390px phone against a 1024px measure it reads 38% and
// says the page is not using its measure — for a page that is using exactly the measure it has.
// Same shape as the narrow-region exemption: a verdict that depends on the conditions rather than
// on the build.
const tooNarrowToJudge = vw < found.declared;
if (tooNarrowToJudge) console.log(`  viewport ${vw}px is narrower than the declared ${found.declared}px — fill check skipped`);

if (fill < minFill && !found.narrowRegion && !tooNarrowToJudge) {
  problems.push(
    `widest content container is ${found.widest.w}px against a declared ${found.declared}px `
      + `(${(fill * 100).toFixed(1)}%, threshold ${(minFill * 100).toFixed(0)}%) — the page is not using its measure`,
  );
}

// Against the column the content actually sits in — see `columnMax` above.
const against = found.columnMax || found.declared;
if (found.sidebar) console.log(`  a sidebar is present, so widths are held against the main column (${found.columnMax}px), not the full container`);

if (!tooNarrowToJudge && found.region) {
  const rf = found.region.w / against;
  console.log(`  content region:           ${found.region.w}px  (${found.region.name})  = ${(rf * 100).toFixed(1)}% of declared`);
  if (rf < moduleFill) {
    problems.push(
      `the content region \`${found.region.name}\` renders at ${found.region.w}px inside a declared `
        + `${found.declared}px container (${(rf * 100).toFixed(1)}%, threshold ${(moduleFill * 100).toFixed(0)}%) — `
        + 'a component view is bound by a measure meant for prose',
    );
  }
}

if (found.moduleCount === 0) {
  console.log(`  modules: none on this page`);
} else {
  const mf = found.thinnestModule.w / against;
  console.log(`  modules: ${found.thinnestModule.w}px … ${found.widestModule.w}px  = ${(mf * 100).toFixed(1)}% … ${((found.widestModule.w / against) * 100).toFixed(1)}% of declared  [${found.moduleCount} measured]`);
  // Same exemption the fill and region checks already carry, and forgotten here: a module cannot be
  // wider than the viewport, so on a 390px phone against a 1024px measure it reads 35% and the gate
  // called it pinched. Sixteen findings on a full sweep, every one at 390px or 768px, none a defect.
  if (mf < moduleFill && !tooNarrowToJudge) {
    problems.push(
      `module \`${found.thinnestModule.name}\` renders at ${found.thinnestModule.w}px inside a declared `
        + `${found.declared}px container (${(mf * 100).toFixed(1)}%, threshold ${(moduleFill * 100).toFixed(0)}%) — `
        + 'a marketing block is bound by a measure meant for prose',
    );
  }
}

for (const o of found.overflow) problems.push(`${o.name} runs ${o.over}px past the right edge (right=${o.right}, viewport=${vw})`);
// The list is capped at five; the count is not. "5 of 83" and "5 of 5" are different pages.
if (found.overflowTotal > found.overflow.length) problems.push(`… and ${found.overflowTotal - found.overflow.length} more element(s) past the right edge (${found.overflowTotal} in total)`);
for (const u of found.unfilled) {
  problems.push(
    `${u.name} is a ${u.slot}px media slot holding a ${u.image}px image — ${u.gap}px of it is empty `
      + `(${Math.round((u.image / u.slot) * 100)}% filled)`,
  );
}
for (const c of found.clipped) {
  problems.push(`${c.name} CLIPS its content — ${c.content}px of content in a ${c.box}px box, ${c.cut}px cut off: "${c.text}"`);
}
for (const h of found.hugging) {
  problems.push(
    `${h.name} paints a ${h.w}x${h.h} ground whose first child starts ${h.top}px from the top and `
      + `${h.left}px from the left — a background with no inset reads as a mistake, not an area`,
  );
}
for (const d of found.doubled) {
  problems.push(
    `${d.name} sits inside \`${d.outerName}\` and insets AGAIN — ${d.pad}px on top of the outer `
      + `${d.outerPad}px, so its text starts at ${d.textEdge}px while the header and any full-bleed `
      + 'block start one gutter further left. A container inside a container has nothing left to inset',
  );
}
for (const d of found.dead) {
  problems.push(
    `${d.name} declares \`${d.prop}: ${d.value}\` but its display is \`${d.display}\` — the property `
      + 'cannot apply, so the layout it describes is not the layout on screen',
  );
}

if (problems.length === 0) {
  console.log('OK — the page fills its declared measure and nothing overflows');
  process.exit(0);
}

console.log('');
for (const p of problems) console.log(`  ✗ ${p}`);
console.log('');
if (found.clipped.length) {
  console.log('Clipped content is never a design decision: a box narrower than the words in it cuts them off');
  console.log('mid-word, and no colour, contrast or overflow check can see it because nothing moved.');
}
console.log('Fix: a reading measure belongs on the PROSE, not on the region that holds modules.');
console.log('Breaking a stack back out of a narrow column needs BOTH an explicit width and a negative');
console.log('margin — the margin alone leaves the element at the narrow column\'s width.');
process.exit(1);
