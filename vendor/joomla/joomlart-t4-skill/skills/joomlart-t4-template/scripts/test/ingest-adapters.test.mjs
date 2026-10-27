import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const SKILL = join(here, '..', '..');           // skills/joomlart-t4-template
const FIXTURES = join(here, 'fixtures');

const tmps = [];
function tmp(prefix) { const d = mkdtempSync(join(tmpdir(), prefix)); tmps.push(d); return d; }
test.after(() => { for (const d of tmps) rmSync(d, { recursive: true, force: true }); });

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ── from-html ─────────────────────────────────────────────────────────────────

test('from-html: manifest bundle → spec-pack with kind "html" and one reference per page', async () => {
  const out = join(tmp('fh-'), 'pack');
  await run('node', [join(SKILL, 'scripts/ingest/from-html.mjs'),
                     join(FIXTURES, 'bundle-min'), '--out', out], { cwd: SKILL });

  const map = readJson(join(out, 'page-map.json'));
  const ref = readJson(join(out, 'reference.json'));
  const prov = readJson(join(out, 'provenance.json'));

  assert.equal(ref.kind, 'html');
  assert.equal(prov.adapter, 'from-html');
  assert.ok(map.pages.length >= 3, 'expected the fixture bundle\'s pages');

  // every page-map page must have a reference entry whose file actually exists —
  // this is the invariant the validator enforces, so the adapter must satisfy it.
  for (const page of map.pages) {
    const entry = ref.pages.find(r => r.page === page.file);
    assert.ok(entry, `no reference entry for ${page.file}`);
    assert.ok(existsSync(join(out, entry.path)), `reference file missing for ${page.file}: ${entry.path}`);
  }

  // the pack points at its own sidecars
  assert.equal(map.reference, 'reference.json');
  assert.equal(map.provenance, 'provenance.json');
});

test('from-html: raw folder (no manifest) still produces a usable pack', async () => {
  const out = join(tmp('fh-raw-'), 'pack');
  await run('node', [join(SKILL, 'scripts/ingest/from-html.mjs'),
                     join(FIXTURES, 'raw-min'), '--out', out], { cwd: SKILL });

  const map = readJson(join(out, 'page-map.json'));
  const ref = readJson(join(out, 'reference.json'));

  assert.equal(ref.kind, 'html');
  assert.match(map.template.name, /^ja_/, 'template name must be ja_<slug>');
  assert.ok(map.theme.palette.light, 'a light palette must be extracted from the raw CSS');
  // the stylesheet must travel with the page, or the reference renders unstyled and
  // every parity check against it is meaningless
  assert.ok(existsSync(join(out, 'reference', 'style.css')), 'sibling stylesheet must be copied next to the reference page');
});

test('from-html: exits non-zero without --out', async () => {
  await assert.rejects(
    run('node', [join(SKILL, 'scripts/ingest/from-html.mjs'), join(FIXTURES, 'bundle-min')], { cwd: SKILL }),
    (e) => e.code === 2,
  );
});

test('from-html: copies the assets tree so reference pages render styled', async () => {
  const out = join(tmp('fh-as-'), 'pack');
  const src = join(tmp('fh-src-'), 'bundle');
  mkdirSync(join(src, 'pages'), { recursive: true });
  mkdirSync(join(src, 'assets', 'css'), { recursive: true });
  writeFileSync(join(src, 'assets', 'css', 'theme.css'), ':root{--accent:#2f6bff}body{background:#fff}');
  writeFileSync(join(src, 'manifest.json'), JSON.stringify({
    template: { name: 'ja_as', title: 'As' },
    theme: { palette: { light: { primary: '#2f6bff', secondary: '#111', body_bg: '#fff', text: '#111' } }, fonts: { body: 'Inter' } },
    positions: ['menu'],
    pages: [{ file: 'index.html', view: 'com_content.featured' }],
  }));
  writeFileSync(join(src, 'pages', 'index.html'), '<!doctype html><link rel=stylesheet href="../assets/css/theme.css"><h1>x</h1>');

  await run('node', [join(SKILL, 'scripts/ingest/from-html.mjs'), src, '--out', out], { cwd: SKILL });
  // an unstyled reference page makes every parity check against it meaningless
  assert.ok(existsSync(join(out, 'assets', 'css', 'theme.css')), 'assets/ must travel with the pages');
});

test('from-html: refuses a page path that escapes the bundle or the pack', async () => {
  const out = join(tmp('fh-tr-'), 'pack');
  const box = tmp('fh-box-');
  const src = join(box, 'bundle');
  mkdirSync(join(src, 'pages'), { recursive: true });
  writeFileSync(join(box, 'VICTIM.html'), 'original');
  writeFileSync(join(src, 'pages', 'ok.html'), '<h1>ok</h1>');
  writeFileSync(join(src, 'manifest.json'), JSON.stringify({
    template: { name: 'ja_tr', title: 'Tr' },
    theme: { palette: { light: { primary: '#fff', secondary: '#000', body_bg: '#fff', text: '#111' } }, fonts: { body: 'Inter' } },
    positions: ['menu'],
    pages: [{ file: '../../VICTIM.html', view: 'com_content.article' }, { file: 'ok.html', view: 'com_content.article' }],
  }));

  const { stderr } = await run('node', [join(SKILL, 'scripts/ingest/from-html.mjs'), src, '--out', out], { cwd: SKILL });
  assert.match(stderr, /resolves outside/, 'the traversal must be reported');
  assert.equal(readFileSync(join(box, 'VICTIM.html'), 'utf8'), 'original', 'nothing may be written outside --out');
  const ref = readJson(join(out, 'reference.json'));
  assert.deepEqual(ref.pages.map(p => p.page), ['ok.html'], 'only the safe page is referenced');
});

test('from-html: rejects a file (not a directory) as source', async () => {
  const f = join(tmp('fh-f-'), 'x.html');
  writeFileSync(f, '<h1>x</h1>');
  await assert.rejects(
    run('node', [join(SKILL, 'scripts/ingest/from-html.mjs'), f, '--out', join(tmp('fh-o-'), 'p')], { cwd: SKILL }),
    (e) => e.code === 2 && /must be a directory/.test(String(e.stderr)),
  );
});

test('from-html: reports a malformed manifest instead of dumping a stack trace', async () => {
  const src = join(tmp('fh-bad-'), 'bundle');
  mkdirSync(join(src, 'pages'), { recursive: true });
  writeFileSync(join(src, 'manifest.json'), '{ not json');
  await assert.rejects(
    run('node', [join(SKILL, 'scripts/ingest/from-html.mjs'), src, '--out', join(tmp('fh-bo-'), 'p')], { cwd: SKILL }),
    (e) => e.code === 2 && /not valid JSON/.test(String(e.stderr)) && !/at Object\./.test(String(e.stderr)),
  );
});

// ── inferView: the shared heuristic every adapter leans on ────────────────────

test('inferView: DOM signals beat the filename, filename beats nothing', async () => {
  const { inferView } = await import('../lib/html-bundle.mjs');
  const cases = [
    // [filename, html, expected, why]
    ['whatever.html', '<form><input type="password"></form>', 'com_users.login', 'password input'],
    ['whatever.html', '<form><input type="email"><textarea></textarea></form>', 'com_contact.contact', 'email + textarea'],
    ['blog.html', '<article><h1>t</h1></article>', 'com_content.article', 'DOM <article> overrides the blog filename'],
    ['blog.html', '<div>plain</div>', 'com_content.category.blog', 'filename: blog'],
    ['news.html', '<div>plain</div>', 'com_content.category.blog', 'filename: news'],
    ['signin.html', '<div>plain</div>', 'com_users.login', 'filename: signin'],
    ['signup.html', '<div>plain</div>', 'com_users.registration', 'filename: signup'],
    ['profile.html', '<div>plain</div>', 'com_users.profile', 'filename: profile'],
    ['search.html', '<div>plain</div>', 'com_finder.search', 'filename: search'],
    ['tag.html', '<div>plain</div>', 'com_tags.tag', 'filename: tag'],
    ['404.html', '<div>plain</div>', 'error', 'filename: 404'],
    ['offline.html', '<div>plain</div>', 'offline', 'filename: offline'],
    ['index.html', '<div>plain</div>', 'com_content.featured', 'filename: index'],
    ['zzz.html', '<div>plain</div>', 'com_content.article', 'safe default'],
  ];
  for (const [file, html, expected, why] of cases) {
    assert.equal(inferView(file, html), expected, `${file} (${why})`);
  }
});

test('parseRawTemplate: skips tiny stubs and sanitises the template name', async () => {
  const { parseBundle } = await import('../lib/html-bundle.mjs');
  const dir = tmp('raw-');
  writeFileSync(join(dir, 'index.html'), '<!doctype html><body>' + 'x'.repeat(600) + '</body>');
  writeFileSync(join(dir, 'redirect.html'), '<meta http-equiv=refresh>');   // 40 bytes — a stub
  writeFileSync(join(dir, 'style.css'), ':root{--accent:#2f6bff;--bg-primary:#ffffff;--text-primary:#111}');
  const map = await parseBundle(dir);
  assert.ok(!map.pages.some(p => p.file === 'redirect.html'), 'sub-300-byte stubs are not pages');
  assert.match(map.template.name, /^ja_[a-z0-9-]+$/, 'machine name must be sanitised');
  assert.equal(map.theme.palette.light.primary, '#2f6bff', 'palette comes from :root vars');
});

// ── from-url ──────────────────────────────────────────────────────────────────

// The FOREIGN origin is a real, reachable second server, and the PDF really returns 200. An
// earlier version of this fixture used an unresolvable hostname and a 404ing .pdf, which made
// three assertions below pass even with the guards they claim to test deleted.
const FOREIGN = {
  '/': `<!doctype html><html><head><title>THIRD PARTY SITE</title></head><body>
        <main><section><h1>Someone else</h1></section></main>
        <p>${'padding '.repeat(400)}</p></body></html>`,
};

const SITE = (foreignBase) => ({
  '/': `<!doctype html><html><head><title>Acme — Home</title></head><body>
        <main><section class="hero"><h1>Acme</h1></section><section class="features"></section></main>
        <a href="/about">About</a> <a href="/blog">Blog</a> <a href="/contact">Contact</a>
        <a href="/login">Login</a> <a href="/tiny">Tiny</a>
        <a href="${foreignBase}/">Off-site (reachable!)</a>
        <a href="/brochure.pdf">PDF (serves 200!)</a>
        <a href="/partners">Partners (302 off-origin)</a>
        <a href="/gone">Gone (404)</a>
        <a href="/feed.xml">Feed (200, not html)</a>
        <a href="/api/data">API (200 JSON, no extension)</a>
        <a href="/report.zip">Zip that serves text/html</a>
        <a href="/a/dup">dup A</a> <a href="/b/dup">dup B</a>
        <a href="/about#team">About again</a></body></html>`,
  '/about': `<!doctype html><html><head><title>About</title></head><body><article><h1>About</h1><p>x</p></article></body></html>`,
  '/blog': `<!doctype html><html><head><title>Blog</title></head><body>
        <div class="card"><h2>A</h2><p>x</p></div><div class="card"><h2>B</h2><p>x</p></div>
        <div class="card"><h2>C</h2><p>x</p></div></body></html>`,
  '/contact': `<!doctype html><html><head><title>Contact</title></head><body>
        <form><input type="email" name="email"><textarea name="msg"></textarea></form></body></html>`,
  '/login': `<!doctype html><html><head><title>Sign in</title></head><body>
        <form><input type="text" name="u"><input type="password" name="p"></form></body></html>`,
  '/a/dup': `<!doctype html><html><head><title>Dup A</title></head><body><p>a</p></body></html>`,
  '/b/dup': `<!doctype html><html><head><title>Dup B</title></head><body><p>b</p></body></html>`,
  '/tiny': `<!doctype html><html><head><title>Tiny</title></head><body><p>t</p></body></html>`,
  '/welcome': `<!doctype html><html><head><title>Welcome</title></head><body>
        <a href="/tiny">Tiny</a> <a href="/contact">Contact</a>
        <p>${'lots of home page copy '.repeat(300)}</p></body></html>`,
});

async function withServer(fn) {
  const foreign = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(FOREIGN['/']);
  });
  await new Promise(r => foreign.listen(0, '127.0.0.1', r));
  const foreignBase = `http://127.0.0.1:${foreign.address().port}`;
  const pages = SITE(foreignBase);

  const server = createServer((req, res) => {
    const path = req.url.split('?')[0].replace(/(.)\/$/, '$1') || '/';
    if (path === '/partners') { res.writeHead(302, { location: `${foreignBase}/` }); res.end(); return; }
    if (path === '/brochure.pdf') { res.writeHead(200, { 'content-type': 'application/pdf' }); res.end('%PDF-1.4 fake'); return; }
    if (path === '/feed.xml') { res.writeHead(200, { 'content-type': 'application/xml' }); res.end('<rss/>'); return; }
    // no extension → only the content-type gate can reject it
    if (path === '/api/data') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"a":1}'); return; }
    // skipped extension but an HTML content-type → only SKIP_EXT can reject it
    if (path === '/report.zip') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><title>Zip</title><body>x</body></html>'); return; }
    if (pages[path] === undefined) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(pages[path]);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(base, foreignBase); } finally { server.close(); foreign.close(); }
}

test('from-url: crawls same-origin pages and emits kind "url"', async () => {
  await withServer(async (base) => {
    const out = join(tmp('fu-'), 'pack');
    await run('node', [join(SKILL, 'scripts/ingest/from-url.mjs'), base + '/', '--out', out], { cwd: SKILL });

    const map = readJson(join(out, 'page-map.json'));
    const ref = readJson(join(out, 'reference.json'));
    const crawl = readJson(join(out, 'reference', 'crawl.json'));

    assert.equal(ref.kind, 'url');
    assert.ok(map.pages.length >= 6, `expected the same-origin HTML pages, got ${map.pages.length}`);
    // every reference entry is an http url the validator will accept
    for (const entry of ref.pages) assert.match(entry.url, /^http:\/\/127\.0\.0\.1:/);
    // page-map and reference.json must agree, or the validator rejects the pack
    assert.deepEqual(map.pages.map(p => p.file).sort(), ref.pages.map(p => p.page).sort());
  });
});

test('from-url: a REACHABLE off-origin link is not crawled', async () => {
  await withServer(async (base, foreignBase) => {
    const out = join(tmp('fu-org-'), 'pack');
    await run('node', [join(SKILL, 'scripts/ingest/from-url.mjs'), base + '/', '--out', out], { cwd: SKILL });
    const crawl = readJson(join(out, 'reference', 'crawl.json'));
    assert.ok(!crawl.pages.some(p => p.url.startsWith(foreignBase)),
      'the foreign origin serves 200 — only the origin guard can keep it out');
    assert.ok(!crawl.pages.some(p => p.title === 'THIRD PARTY SITE'), 'foreign content must not enter the pack');
  });
});

test('from-url: a REDIRECT to another origin is rejected, and provenance stays truthful', async () => {
  await withServer(async (base, foreignBase) => {
    const out = join(tmp('fu-rd-'), 'pack');
    await run('node', [join(SKILL, 'scripts/ingest/from-url.mjs'), base + '/', '--out', out], { cwd: SKILL });
    const crawl = readJson(join(out, 'reference', 'crawl.json'));
    const prov = readJson(join(out, 'provenance.json'));

    // /partners 302s off-origin; the enqueue-time guard cannot see that
    assert.ok(!crawl.pages.some(p => p.url.startsWith(foreignBase)), 'redirect escaped the origin guard');
    assert.ok(crawl.failures.some(f => f.reason === 'redirected off-origin'), 'the escape should be recorded');
    // the rights/licence note in from-url.md depends on this record being true
    assert.equal(prov.source.sameOrigin, true);
    assert.equal(prov.source.origin, new URL(base).origin);
  });
});

test('from-url: skips non-HTML that returns 200', async () => {
  await withServer(async (base) => {
    const out = join(tmp('fu-ct-'), 'pack');
    await run('node', [join(SKILL, 'scripts/ingest/from-url.mjs'), base + '/', '--out', out], { cwd: SKILL });
    const crawl = readJson(join(out, 'reference', 'crawl.json'));
    // .pdf is filtered by extension; .xml only by content-type — both serve 200 here
    assert.ok(!crawl.pages.some(p => p.url.endsWith('.pdf')), 'extension filter must hold');
    assert.ok(!crawl.pages.some(p => p.url.endsWith('.xml')), 'xml must not become a page');
    // /report.zip serves text/html, so ONLY the extension filter can keep it out
    assert.ok(!crawl.pages.some(p => p.url.endsWith('.zip')), 'SKIP_EXT must reject a skipped extension even when it serves HTML');
    // /api/data has no extension, so ONLY the content-type gate can keep it out
    assert.ok(!crawl.pages.some(p => p.url.endsWith('/data')), 'the content-type gate must reject non-HTML with no extension');
  });
});

test('from-url: records 404s as failures rather than pages', async () => {
  await withServer(async (base) => {
    const out = join(tmp('fu-404-'), 'pack');
    await run('node', [join(SKILL, 'scripts/ingest/from-url.mjs'), base + '/', '--out', out], { cwd: SKILL });
    const crawl = readJson(join(out, 'reference', 'crawl.json'));
    assert.ok(!crawl.pages.some(p => p.url.endsWith('/gone')), 'a 404 must not become a page');
    assert.ok(crawl.failures.some(f => f.status === 404), 'a 404 must be recorded as a failure');
  });
});

test('from-url: dedupes fragments and disambiguates colliding basenames', async () => {
  await withServer(async (base) => {
    const out = join(tmp('fu-dd-'), 'pack');
    await run('node', [join(SKILL, 'scripts/ingest/from-url.mjs'), base + '/', '--out', out], { cwd: SKILL });
    const crawl = readJson(join(out, 'reference', 'crawl.json'));
    const map = readJson(join(out, 'page-map.json'));

    // "/about" and "/about#team" are one page
    assert.equal(crawl.pages.filter(p => p.url.endsWith('/about')).length, 1, 'fragment links must dedupe');
    // /a/dup and /b/dup both want "dup.html" — the validator forbids duplicate filenames
    const dups = map.pages.map(p => p.file).filter(f => f.startsWith('dup'));
    assert.equal(dups.length, 2, 'both colliding pages should be present');
    assert.equal(new Set(dups).size, 2, `colliding basenames must be disambiguated, got ${dups}`);
  });
});

test('from-url: the largest page becomes the featured home even when its name does not say so', async () => {
  await withServer(async (base) => {
    const out = join(tmp('fu-big-'), 'pack');
    // start at /welcome — inferView maps "welcome.html" to article, so ONLY the
    // largest-page heuristic can make it com_content.featured.
    await run('node', [join(SKILL, 'scripts/ingest/from-url.mjs'), base + '/welcome', '--out', out], { cwd: SKILL });
    const map = readJson(join(out, 'page-map.json'));
    const featured = map.pages.filter(p => p.view === 'com_content.featured');
    assert.equal(featured.length, 1, 'exactly one page must be the featured home');
    assert.equal(featured[0].file, 'welcome.html', 'the biggest page must be promoted, whatever it is called');
  });
});

test('from-url: infers Joomla views from DOM shape', async () => {
  await withServer(async (base) => {
    const out = join(tmp('fu-v-'), 'pack');
    await run('node', [join(SKILL, 'scripts/ingest/from-url.mjs'), base + '/', '--out', out], { cwd: SKILL });
    const map = readJson(join(out, 'page-map.json'));
    const view = (f) => map.pages.find(p => p.file === f)?.view;

    // index.html would map to featured by filename alone, so assert on a page where only the
    // size heuristic can decide: the home page here is NOT the largest by filename convention.
    assert.equal(view('index.html'), 'com_content.featured');
    assert.equal(view('contact.html'), 'com_contact.contact', 'email + textarea, no password → contact');
    assert.equal(view('about.html'), 'com_content.article', 'a single <article> → article view');
    assert.equal(view('login.html'), 'com_users.login', 'a password input → login');
    assert.equal(view('tiny.html'), 'com_content.article', 'unremarkable page → article default');
  });
});

test('from-url: rejects a non-numeric --max-pages instead of crawling nothing', async () => {
  await withServer(async (base) => {
    const out = join(tmp('fu-mp-'), 'pack');
    await assert.rejects(
      run('node', [join(SKILL, 'scripts/ingest/from-url.mjs'), base + '/', '--out', out, '--max-pages', 'all'], { cwd: SKILL }),
      (e) => e.code === 2 && /positive integer/.test(String(e.stderr)),
    );
  });
});

test('from-url: refuses to overwrite an existing pack', async () => {
  await withServer(async (base) => {
    const out = join(tmp('fu-ow-'), 'pack');
    const args = [join(SKILL, 'scripts/ingest/from-url.mjs'), base + '/', '--out', out];
    await run('node', args, { cwd: SKILL });
    await assert.rejects(run('node', args, { cwd: SKILL }),
      (e) => e.code === 1 && /already exists/.test(String(e.stderr)));
    // ...but --force is allowed
    await run('node', [...args, '--force'], { cwd: SKILL });
  });
});

test('from-url: leaves the palette null on purpose', async () => {
  await withServer(async (base) => {
    const out = join(tmp('fu-p-'), 'pack');
    await run('node', [join(SKILL, 'scripts/ingest/from-url.mjs'), base + '/', '--out', out], { cwd: SKILL });
    const map = readJson(join(out, 'page-map.json'));
    // A crawler cannot know the RENDERED colour; leaving it null makes the gap loud
    // instead of shipping a plausible-looking wrong hex into design-spec.md.
    assert.equal(map.theme.palette.light.primary, null);
    assert.equal(map.theme.palette.dark, null);
  });
});

test('from-url: exits non-zero on an unreachable start URL', async () => {
  const out = join(tmp('fu-x-'), 'pack');
  await assert.rejects(
    run('node', [join(SKILL, 'scripts/ingest/from-url.mjs'), 'http://127.0.0.1:1/', '--out', out], { cwd: SKILL }),
    (e) => e.code === 1,
  );
});
