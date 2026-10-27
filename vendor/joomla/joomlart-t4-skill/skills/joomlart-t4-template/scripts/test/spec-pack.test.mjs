import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { validateSpecPack, initSpecPack, PAGE_FLOOR, REQUIRED_VIEWS } from '../ingest/spec-pack.mjs';

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── fixture builder ───────────────────────────────────────────────────────────
// Builds a spec-pack that PASSES, so each test can break exactly one thing and
// assert that the validator notices. If the baseline ever stops passing, every
// negative test below becomes vacuous — so test 1 pins it.

function makePages(n) {
  // start with one page per required view, pad to n with articles
  const pages = REQUIRED_VIEWS.map((view, i) => ({ file: `req-${i}.html`, view }));
  while (pages.length < n) {
    pages.push({ file: `page-${pages.length}.html`, view: 'com_content.article' });
  }
  return pages;
}

function buildPack(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'specpack-'));
  mkdirSync(join(dir, 'reference'), { recursive: true });

  const pages = overrides.pages ?? makePages(PAGE_FLOOR);

  const pageMap = {
    template: { name: 'ja_acme', title: 'Acme', bootstrap: 'bs5' },
    theme: {
      palette: {
        light: { primary: '#2f6bff', secondary: '#1b2a4a', body_bg: '#ffffff', text: '#1a1a1a' },
        dark: { primary: '#5b8cff', secondary: '#9db4e6', body_bg: '#0e1116', text: '#e6e8eb' },
      },
      fonts: { body: 'Inter', heading: 'Poppins' },
    },
    positions: ['menu', 'footer'],
    pages,
    ...(overrides.pageMap ?? {}),
  };
  writeFileSync(join(dir, 'page-map.json'), JSON.stringify(pageMap, null, 2));

  // a design-spec with NO "TODO" anywhere
  writeFileSync(join(dir, 'design-spec.md'),
    overrides.designSpec ?? '# Design Spec — Acme\n\nPalette, type and spacing all resolved.\n');

  const refPages = overrides.refPages ?? pages.map(p => ({ page: p.file, path: `reference/${p.file}` }));
  for (const rp of refPages) {
    if (rp.path) writeFileSync(join(dir, rp.path), '<!doctype html><title>x</title><body>x</body>');
    if (rp.shots) for (const k of Object.keys(rp.shots)) writeFileSync(join(dir, rp.shots[k]), 'PNGDATA');
  }

  writeFileSync(join(dir, 'reference.json'), JSON.stringify({
    kind: overrides.kind ?? 'html',
    viewports: overrides.viewports ?? [1440, 768, 390],
    modes: overrides.modes ?? ['light', 'dark'],
    pages: refPages,
  }, null, 2));

  writeFileSync(join(dir, 'provenance.json'), JSON.stringify({
    adapter: 'from-html',
    source: { kind: 'html-bundle', path: '/tmp/bundle' },
    generatedAt: new Date().toISOString(),
  }, null, 2));

  writeFileSync(join(dir, 'content-contract.json'), JSON.stringify({
    schemaVersion: 1, id: 'acme', revision: 1, mode: 'demo', language: 'en',
    identity: { name: 'company.name', summary: 'company.summary', disclosure: 'demo.disclosure' },
    voice: ['Plain English'], pending: [],
    sources: { fixture: { kind: 'demo', reference: 'test fixture', note: 'Fictional test company' } },
    facts: Object.fromEntries(Object.entries({ 'company.name': 'Acme', 'company.summary': 'Example studio', 'demo.disclosure': 'Illustrative demo' }).map(([key,value]) => [key,{value,status:'demo',source:'fixture'}])),
    surfaces: pageMap.pages.map(page => ({ id: page.file, purpose: 'Test view', requiredFacts: [] })),
  }));

  const design = JSON.parse(readFileSync(join(SKILL_DIR, 'examples/design-contract.json'), 'utf8'));
  design.pages = pageMap.pages.map(page => ({ ...design.pages[0], id: page.file,
    url: 'https://example.test/' + page.file, expectedUrl: 'https://example.test/' + page.file }));
  design.pilotPages = [pageMap.pages[0].file];
  writeFileSync(join(dir, 'design-contract.json'), JSON.stringify(design));

  return dir;
}

const packs = [];
function pack(overrides) { const d = buildPack(overrides); packs.push(d); return d; }
test.after(() => { for (const d of packs) rmSync(d, { recursive: true, force: true }); });

/** assert the validator failed, and that some problem mentions `needle` */
function assertFails(dir, needle) {
  const { ok, problems } = validateSpecPack(dir);
  assert.equal(ok, false, `expected validation to FAIL but it passed`);
  assert.ok(problems.some(p => p.includes(needle)),
    `expected a problem mentioning "${needle}", got:\n  ${problems.join('\n  ')}`);
}

// ── 1. the baseline must pass ─────────────────────────────────────────────────

test('a complete spec-pack validates', () => {
  const { ok, problems, stats } = validateSpecPack(pack());
  assert.equal(ok, true, `expected pass, got problems:\n  ${problems.join('\n  ')}`);
  assert.equal(stats.pageCount, PAGE_FLOOR);
  assert.equal(stats.kind, 'html');
  assert.equal(stats.checkedTargets, PAGE_FLOOR);
});

// ── 2. each failure class, one at a time ──────────────────────────────────────

test('rejects a missing required file', () => {
  const dir = pack();
  rmSync(join(dir, 'reference.json'));
  assertFails(dir, 'missing required file: reference.json');
});

test('rejects unsafe template names', () => {
  assertFails(pack({ pageMap: { template: { name: '../acme', title: 'Acme' } } }), 'must match');
});

test('rejects an empty template title', () => {
  assertFails(pack({ pageMap: { template: { name: 'ja_acme', title: '   ' } } }), 'title is missing or empty');
});

test('rejects a missing light palette slot', () => {
  const dir = pack({
    pageMap: {
      theme: {
        palette: { light: { primary: '#fff', secondary: '#000', body_bg: '#fff' }, dark: null },
        fonts: { body: 'Inter' },
      },
    },
  });
  assertFails(dir, 'palette.light.text is missing');
});

test('rejects an unparseable colour', () => {
  const dir = pack({
    pageMap: {
      theme: {
        palette: {
          light: { primary: 'not a colour!!', secondary: '#000', body_bg: '#fff', text: '#111' },
          dark: null,
        },
        fonts: { body: 'Inter' },
      },
    },
  });
  assertFails(dir, 'is not a parseable CSS colour');
});

const LIGHT_ONLY = {
  palette: {
    light: { primary: '#2f6bff', secondary: '#1b2a4a', body_bg: '#ffffff', text: '#1a1a1a' },
    dark: null,
  },
  fonts: { body: 'Inter' },
};

test('rejects a null dark palette when the pack does not declare it derived', () => {
  assertFails(pack({ pageMap: { theme: LIGHT_ONLY } }), 'set page-map.theme.darkDerived = true');
});

test('ACCEPTS a null dark palette when theme.darkDerived is true', () => {
  const dir = pack({
    pageMap: { theme: { ...LIGHT_ONLY, darkDerived: true } },
    modes: ['light'],
  });
  const { ok, problems } = validateSpecPack(dir);
  assert.equal(ok, true, `expected pass, got:\n  ${problems.join('\n  ')}`);
});

test('prose in design-spec.md CANNOT unlock a null dark palette', () => {
  // This is the whole point of moving the declaration into data: a sentence that *denies*
  // derivation used to satisfy the old regex and silently disabled the modes check too.
  for (const prose of [
    'We do NOT derive dark; it is authored by hand.',
    'Never derive the dark palette from light.',
    'dark is derived — but only in a later project, not here',
  ]) {
    assertFails(pack({ pageMap: { theme: LIGHT_ONLY }, designSpec: `# Spec\n\n${prose}\n` }),
      'set page-map.theme.darkDerived = true');
  }
});

test('rejects darkDerived alongside an explicit dark palette', () => {
  assertFails(pack({ pageMap: { theme: { ...LIGHT_ONLY, darkDerived: true, palette: {
    light: LIGHT_ONLY.palette.light,
    dark: { primary: '#5b8cff', secondary: '#9db4e6', body_bg: '#0e1116', text: '#e6e8eb' },
  } } } }), 'say which one is authoritative');
});

test('rejects a page count under the coverage floor', () => {
  assertFails(pack({ pages: makePages(PAGE_FLOOR).slice(0, PAGE_FLOOR - 1) }),
    `the coverage floor is ${PAGE_FLOOR}`);
});

test('rejects a missing required view', () => {
  const pages = makePages(PAGE_FLOOR).map(p => p.view === 'offline' ? { ...p, view: 'com_content.article' } : p);
  assertFails(pack({ pages }), 'required view "offline"');
});

test('rejects an unresolved `TODO` slot in design-spec.md', () => {
  assertFails(pack({ designSpec: '# Design Spec\n\n- Dark hook: `TODO` — pin in Phase 0\n' }),
    'unresolved `TODO` slot');
});

test('the word TODO in prose is NOT a slot', () => {
  // make-design-spec.mjs writes an instructional header that talks about slots. Matching the bare
  // word made the generator emit a file that could never pass its own gate.
  const dir = pack({
    designSpec: '# Design Spec\n\n> Resolve every slot before dispatching. This is not a TODO list.\n',
  });
  const { ok, problems } = validateSpecPack(dir);
  assert.equal(ok, true, `expected pass, got:\n  ${problems.join('\n  ')}`);
});

test('the generator output can actually reach a passing state', async () => {
  // Regression guard for the circular workflow: generate → resolve slots → must validate.
  const { execFileSync } = await import('node:child_process');
  const { readFileSync: rf } = await import('node:fs');
  const dir = pack();
  execFileSync('node', [join(SKILL_DIR, 'scripts/make-design-spec.mjs'),
                        join(dir, 'page-map.json'), '--out', join(dir, 'design-spec.md')]);
  // sanity: the generator really did leave slots to resolve
  assert.ok(/`TODO`/.test(rf(join(dir, 'design-spec.md'), 'utf8')), 'generator emitted no slots');
  assertFails(dir, 'unresolved `TODO` slot');

  // resolve them all, exactly as the operator would
  const resolved = rf(join(dir, 'design-spec.md'), 'utf8').replace(/`TODO`/g, '`resolved`');
  writeFileSync(join(dir, 'design-spec.md'), resolved);
  const { ok, problems } = validateSpecPack(dir);
  assert.equal(ok, true, `generator output could not be completed into a valid pack:\n  ${problems.join('\n  ')}`);
});

test('rejects an empty design-spec.md', () => {
  assertFails(pack({ designSpec: '   \n' }), 'design-spec.md is empty');
});

test('rejects a dangling reference path', () => {
  const pages = makePages(PAGE_FLOOR);
  const refPages = pages.map(p => ({ page: p.file, path: `reference/${p.file}` }));
  const dir = pack({ pages, refPages });
  rmSync(join(dir, refPages[0].path));           // the file the pack claims to compare against
  assertFails(dir, 'points at a missing file');
});

test('rejects an empty reference file', () => {
  const pages = makePages(PAGE_FLOOR);
  const refPages = pages.map(p => ({ page: p.file, path: `reference/${p.file}` }));
  const dir = pack({ pages, refPages });
  writeFileSync(join(dir, refPages[0].path), '');
  assertFails(dir, 'reference file is empty');
});

test('rejects a page with no reference entry', () => {
  const pages = makePages(PAGE_FLOOR);
  const refPages = pages.slice(1).map(p => ({ page: p.file, path: `reference/${p.file}` }));
  assertFails(pack({ pages, refPages }), 'has no entry in reference.json');
});

test('rejects an invalid reference kind', () => {
  assertFails(pack({ kind: 'screenshot' }), 'must be one of');
});

test('rejects viewports with no mobile width', () => {
  assertFails(pack({ viewports: [1440, 1280] }), 'must include a mobile width');
});

test('rejects viewports with no desktop width', () => {
  assertFails(pack({ viewports: [390, 768] }), 'must include a desktop width');
});

test('rejects modes missing dark when dark is not declared derived', () => {
  assertFails(pack({ modes: ['light'] }), 'must contain both');
});

test('rejects a url-kind page with no url', () => {
  const pages = makePages(PAGE_FLOOR);
  const refPages = pages.map((p, i) => i === 0 ? { page: p.file } : { page: p.file, url: 'https://example.com/x' });
  assertFails(pack({ kind: 'url', pages, refPages }), 'is missing "url"');
});

test('rejects a url-kind page with a non-http url', () => {
  const pages = makePages(PAGE_FLOOR);
  const refPages = pages.map(p => ({ page: p.file, url: 'ftp://example.com/x' }));
  assertFails(pack({ kind: 'url', pages, refPages }), 'is not http(s)');
});

test('rejects an image-kind page with no shots', () => {
  const pages = makePages(PAGE_FLOOR);
  const refPages = pages.map(p => ({ page: p.file }));
  assertFails(pack({ kind: 'image', pages, refPages }), 'has no "shots"');
});

test('rejects an image-kind page whose shot file is missing', () => {
  const pages = makePages(PAGE_FLOOR);
  const refPages = pages.map(p => ({
    page: p.file,
    shots: { light: `reference/${p.file}.light.png`, dark: `reference/${p.file}.dark.png` },
  }));
  const dir = pack({ kind: 'image', pages, refPages });
  rmSync(join(dir, refPages[0].shots.dark));
  assertFails(dir, 'points at a missing file');
});

test('kind "none" needs no reference targets but still enforces the rest', () => {
  const pages = makePages(PAGE_FLOOR);
  const dir = pack({ kind: 'none', pages, refPages: pages.map(p => ({ page: p.file })) });
  const { ok, problems, stats } = validateSpecPack(dir);
  assert.equal(ok, true, `expected pass, got:\n  ${problems.join('\n  ')}`);
  assert.equal(stats.checkedTargets, 0);

  // ...but the page floor still applies
  const thin = pack({ kind: 'none', pages: pages.slice(0, 3), refPages: pages.slice(0, 3).map(p => ({ page: p.file })) });
  assertFails(thin, 'coverage floor');
});

test('rejects provenance with no adapter', () => {
  const dir = pack();
  writeFileSync(join(dir, 'provenance.json'), JSON.stringify({ source: {}, generatedAt: 'x' }));
  assertFails(dir, 'provenance.json.adapter is missing');
});

test('reports malformed JSON rather than throwing', () => {
  const dir = pack();
  writeFileSync(join(dir, 'page-map.json'), '{ not json');
  const { ok, problems } = validateSpecPack(dir);
  assert.equal(ok, false);
  assert.ok(problems[0].includes('not valid JSON'));
});

// ── 3. bypasses that used to slip through ─────────────────────────────────────

test('rejects a made-up colour word', () => {
  const dir = pack({
    pageMap: { theme: { palette: {
      light: { primary: 'banana', secondary: '#000', body_bg: '#fff', text: '#111' }, dark: null,
    }, fonts: { body: 'Inter' }, darkDerived: true } },
    modes: ['light'],
  });
  assertFails(dir, '"banana" is not a parseable CSS colour');
});

test('accepts real CSS colour forms', () => {
  for (const c of ['#fff', '#ffffff', '#ffffffff', 'rgb(1,2,3)', 'rgba(1,2,3,.5)',
                   'hsl(1 2% 3%)', 'oklch(0.7 0.1 200)', 'white', 'rebeccapurple', 'transparent']) {
    const dir = pack({
      pageMap: { theme: { palette: {
        light: { primary: c, secondary: '#000', body_bg: '#fff', text: '#111' }, dark: null,
      }, fonts: { body: 'Inter' }, darkDerived: true } },
      modes: ['light'],
    });
    const { ok, problems } = validateSpecPack(dir);
    assert.equal(ok, true, `"${c}" should be a valid colour, got:\n  ${problems.join('\n  ')}`);
  }
});

test('duplicate page filenames cannot satisfy the coverage floor', () => {
  // 12 copies of one page is not 12 pages.
  const one = { file: 'req-0.html', view: 'com_content.featured' };
  const pages = Array.from({ length: PAGE_FLOOR }, () => ({ ...one }));
  assertFails(pack({ pages, refPages: [{ page: 'req-0.html', path: 'reference/req-0.html' }] }),
    'is a duplicate');
});

test('rejects a reference path that escapes the pack', () => {
  const pages = makePages(PAGE_FLOOR);
  const refPages = pages.map(p => ({ page: p.file, path: `../../OUTSIDE-${p.file}` }));
  assertFails(pack({ pages, refPages }), 'escapes the spec-pack');
});

test('rejects an image shot that escapes the pack', () => {
  const pages = makePages(PAGE_FLOOR);
  const refPages = pages.map(p => ({ page: p.file, shots: { light: `../../OUT-${p.file}.png` } }));
  assertFails(pack({ kind: 'image', pages, refPages }), 'escapes the spec-pack');
});

test('a page cannot opt out of verification with kind "none"', () => {
  const pages = makePages(PAGE_FLOOR);
  const refPages = pages.map(p => ({ page: p.file, kind: 'none' }));
  assertFails(pack({ kind: 'html', pages, refPages }), 'cannot opt out of verification');
});

test('rejects non-numeric viewports', () => {
  assertFails(pack({ viewports: ['tiny', 390, 1440, {}] }), 'must be positive numbers');
});

test('rejects a page entry with no file', () => {
  const pages = makePages(PAGE_FLOOR);
  pages[3] = { view: 'com_content.article' };            // no `file`
  assertFails(pack({ pages }), 'pages[3].file is missing');
});

test('rejects a missing light palette entirely', () => {
  assertFails(pack({ pageMap: { theme: { palette: { dark: null }, fonts: { body: 'Inter' }, darkDerived: true } } }),
    'palette.light is missing');
});

test('rejects a bad colour in the DARK palette too', () => {
  assertFails(pack({ pageMap: { theme: { palette: {
    light: { primary: '#2f6bff', secondary: '#1b2a4a', body_bg: '#ffffff', text: '#1a1a1a' },
    dark: { primary: 'nope-not-a-colour', secondary: '#9db4e6', body_bg: '#0e1116', text: '#e6e8eb' },
  }, fonts: { body: 'Inter' } } } }), 'palette.dark.primary "nope-not-a-colour" is not a parseable CSS colour');
});

test('rejects a missing body font', () => {
  assertFails(pack({ pageMap: { theme: { palette: {
    light: { primary: '#2f6bff', secondary: '#1b2a4a', body_bg: '#ffffff', text: '#1a1a1a' }, dark: null,
  }, fonts: { heading: 'Poppins' }, darkDerived: true } }, modes: ['light'] }), 'fonts.body is missing');
});

test('rejects provenance with no source or no timestamp', () => {
  for (const [missing, needle] of [['source', 'provenance.json.source is missing'],
                                   ['generatedAt', 'provenance.json.generatedAt is missing']]) {
    const dir = pack();
    const prov = { adapter: 'from-html', source: { kind: 'x' }, generatedAt: 'now' };
    delete prov[missing];
    writeFileSync(join(dir, 'provenance.json'), JSON.stringify(prov));
    assertFails(dir, needle);
  }
});

// ── 4. initSpecPack ───────────────────────────────────────────────────────────

test('initSpecPack refuses to overwrite an existing pack', () => {
  const dir = pack();
  assert.throws(
    () => initSpecPack(dir, { pageMap: { pages: [] } }),
    /already exists/,
    'a second adapter run must not silently discard hand-completed work',
  );
});

test('initSpecPack overwrites only with force', () => {
  const dir = pack();
  const res = initSpecPack(dir, { pageMap: { pages: [{ file: 'a.html' }] }, force: true });
  assert.equal(res.reference.pages.length, 1);
});

test('initSpecPack writes sane defaults and owns the sidecar keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'init-')); packs.push(dir);
  const res = initSpecPack(dir, {
    // a caller must not be able to redirect these two
    pageMap: { pages: [{ file: 'a.html' }], reference: 'evil.json', provenance: 'evil.json' },
    adapter: 'from-test',
  });
  const map = JSON.parse(readFileSync(join(dir, 'page-map.json'), 'utf8'));
  assert.equal(map.reference, 'reference.json');
  assert.equal(map.provenance, 'provenance.json');
  // defaults must satisfy the validator's own viewport/mode rules
  assert.ok(res.reference.viewports.some(v => v <= 430), 'default viewports need a mobile width');
  assert.ok(res.reference.viewports.some(v => v >= 1280), 'default viewports need a desktop width');
  assert.deepEqual(res.reference.modes, ['light', 'dark']);
  assert.equal(res.provenance.adapter, 'from-test');
  assert.ok(res.provenance.generatedAt, 'provenance must be timestamped');
});

// ── 5. the CLI layer (previously untested — this is where the silent-pass bug lived) ──

test('the CLI reports invalid packs with exit 1, through symlinked and awkward paths', async () => {
  const { execFileSync } = await import('node:child_process');
  const { symlinkSync, cpSync } = await import('node:fs');

  const empty = mkdtempSync(join(tmpdir(), 'emptypack-')); packs.push(empty);
  const good = pack();

  // The recommended install symlinks the skill into ~/.claude/skills, and macOS /tmp is itself a
  // symlink — both used to make the CLI block silently not run, exiting 0 with no output.
  const linkRoot = mkdtempSync(join(tmpdir(), 'symroot-')); packs.push(linkRoot);
  symlinkSync(SKILL_DIR, join(linkRoot, 'skill'));

  const spaced = mkdtempSync(join(tmpdir(), 'sp ace-')); packs.push(spaced);
  cpSync(join(SKILL_DIR, 'scripts'), join(spaced, 'scripts'), { recursive: true });

  const entries = [
    ['direct', join(SKILL_DIR, 'scripts/ingest/spec-pack.mjs')],
    ['symlinked install', join(linkRoot, 'skill/scripts/ingest/spec-pack.mjs')],
    ['path with a space', join(spaced, 'scripts/ingest/spec-pack.mjs')],
  ];

  for (const [label, script] of entries) {
    // invalid pack → exit 1 AND a message
    let code = 0, stderr = '';
    try {
      execFileSync('node', [script, '--validate', empty], { stdio: 'pipe' });
    } catch (e) { code = e.status; stderr = String(e.stderr); }
    assert.equal(code, 1, `${label}: expected exit 1 on an invalid pack, got ${code}`);
    assert.match(stderr, /INVALID/, `${label}: expected a printed reason`);

    // valid pack → exit 0 AND a message (silence is not a pass)
    const stdout = execFileSync('node', [script, '--validate', good], { encoding: 'utf8' });
    assert.match(stdout, /spec-pack OK/, `${label}: a passing run must SAY it passed`);
  }
});

test('the CLI exits 2 on a missing pack dir and 2 with no args', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = join(SKILL_DIR, 'scripts/ingest/spec-pack.mjs');
  for (const args of [['--validate', join(tmpdir(), 'does-not-exist-xyz')], []]) {
    let code = 0;
    try { execFileSync('node', [script, ...args], { stdio: 'pipe' }); }
    catch (e) { code = e.status; }
    assert.equal(code, 2, `expected usage//not-found exit 2 for args ${JSON.stringify(args)}`);
  }
});

for (const mode of ['website', 'edit']) {
  test(`${mode} validates the agreed small page set without template distribution floor`, () => {
    const pages = [{ file: 'home.html', view: 'com_content.featured' }];
    const d = pack({ pages, pageMap: { scope: { mode, reason: 'One requested landing page', pages: ['home.html'] } } });
    assert.equal(validateSpecPack(d).ok, true);
    const m = JSON.parse(readFileSync(join(d, 'page-map.json')));
    m.scope.pages.push('missing.html'); writeFileSync(join(d, 'page-map.json'), JSON.stringify(m));
    assertFails(d, 'exactly match');
  });
}
test('accepts existing quickstart and Tracy template names', () => {
  for (const name of ['ja_acme', 'tracy_apple', 'acme'])
    assert.equal(validateSpecPack(pack({ pageMap: { template: { name, title: 'Acme' } } })).ok, true);
});

test('content contract is required even for existing packs', () => {
  const dir=pack();rmSync(join(dir,'content-contract.json'));
  assertFails(dir,'content-contract.json');
});
test('spec gate rejects a content contract that omits a mapped page', () => {
  const dir=pack();const file=join(dir,'content-contract.json');const contract=JSON.parse(readFileSync(file));
  contract.surfaces.pop();writeFileSync(file,JSON.stringify(contract));assertFails(dir,'has no surface');
});
test('adapter initializes a blocked contract and preserves authored facts on force', () => {
  const dir=mkdtempSync(join(tmpdir(),'content-init-'));packs.push(dir);
  const map={template:{name:'ja_example'},pages:[{file:'home.html'}]};
  initSpecPack(dir,{pageMap:map});
  const file=join(dir,'content-contract.json');const contract=JSON.parse(readFileSync(file));
  assert.equal(contract.pending.length,1);assert.equal(contract.mode,null);
  contract.facts={'company.name':{value:'Keep this customer name'}};writeFileSync(file,JSON.stringify(contract));
  initSpecPack(dir,{pageMap:map,force:true});
  assert.deepEqual(JSON.parse(readFileSync(file)),contract);
});

test('design contract cannot be omitted or leave page coverage incomplete', () => {
  const dir=pack(),file=join(dir,'design-contract.json');
  const design=JSON.parse(readFileSync(file));design.pages.pop();writeFileSync(file,JSON.stringify(design));
  assertFails(dir,'design-contract.json has no page');
  rmSync(file);assertFails(dir,'missing required file: design-contract.json');
});
test('adapter force preserves the measured design contract', () => {
  const dir=pack(),file=join(dir,'design-contract.json'),before=readFileSync(file,'utf8');
  initSpecPack(dir,{pageMap:JSON.parse(readFileSync(join(dir,'page-map.json'))),force:true});
  assert.equal(readFileSync(file,'utf8'),before);
});
