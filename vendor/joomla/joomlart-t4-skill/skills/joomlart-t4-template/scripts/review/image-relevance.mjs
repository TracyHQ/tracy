#!/usr/bin/env node
// Does the picture actually illustrate the article it sits in?
//
// Usage: node image-relevance.mjs <base url> --collect[=<dir>] [--pages=…] [--max=20]
//        OPENROUTER_API_KEY=… node image-relevance.mjs <base url> [--pages=…] [--max=20] [--model=…]
//
// TWO WAYS TO ANSWER THE SAME QUESTION, and the first one needs no key.
//
// `--collect` does the half that needs no model: it walks the pages, pairs each content image with
// the heading and opening text it is supposed to illustrate, downloads the files, and writes an
// index. The agent running this skill then LOOKS at them — it is itself a model that can see, so
// paying a second one to do it was never necessary. Use this by default: no key, no bill, and the
// judgement lands with the party that can also fix what it finds.
//
// The second form is for running unattended, where there is no agent to look: CI, a scheduled
// sweep, a batch over many builds. That is what the API key buys — not the ability to judge, just
// the ability to judge with nobody watching.
//
// NOT IN THE SWEEP: it calls a model — seconds per image, money per image, and capable of being
// wrong. `run-all.sh` is meant to be run after every change; a gate with a per-run bill stops being
// run, and it would take the fast image checks down with it. This one is run ON PURPOSE, before a
// build ships.
//
// WHY THIS IS SEPARATE FROM `image-seo`. Everything that gate measures is deterministic: alt text
// is there or it is not, a file is 400 KB or it is not. This question is not. "Does this photograph
// belong beside this paragraph" needs something that can look at the picture and read the words,
// which means a model — slower by two orders of magnitude, costs money per image, and capable of
// being wrong. Merging the two would make the fast one slow, and a gate that is slow stops being
// run, which loses the alt-text check as collateral damage.
//
// WHY IT MATTERS. A demo build inherits the CMS's sample photographs, and they are about nothing:
// a beach, a flower, an open-plan office, dropped into an article on email marketing. Every other
// gate is happy — the image renders, it is the right size, it has a caption. A reader takes about
// one second to conclude the site is a template. It is the single loudest "this is not a real
// site" signal a build can carry, and no measurement of pixels can see it.
//
// HOW IT ANSWERS. For each content image: the article's own heading and opening text go to the
// model with the picture, and the model answers whether the picture illustrates THAT text. Images
// are sent inline as data URIs, because the site under test is on localhost and no model can reach
// it. The verdict carries the model's one-line reason, so a human can overrule it quickly — this
// gate advises, and says so.
//
// It FAILS LOUDLY without a key rather than passing: a check that silently does nothing is worse
// than no check, because it reports the same green as a check that ran.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [, , base, ...flags] = process.argv;
const opt = (n, d) => { const h = flags.find((f) => f.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const PAGES = opt('pages', 'scripts/review/pages.txt');
const MAX = Number(opt('max', 20));
const MODEL = opt('model', 'google/gemini-2.5-flash');
const KEY = process.env.OPENROUTER_API_KEY;
const COLLECT = flags.find((f) => f === '--collect' || f.startsWith('--collect='));
const COLLECT_DIR = COLLECT && COLLECT.includes('=') ? COLLECT.slice('--collect='.length) : '.image-relevance';

if (!base) {
  console.error('Usage: OPENROUTER_API_KEY=… node image-relevance.mjs <base url> [--max=20] [--model=…]');
  process.exit(2);
}

if (!KEY && !COLLECT) {
  console.log('# image-relevance');
  console.log('FAIL — no OPENROUTER_API_KEY in the environment.');
  console.log('');
  console.log('This gate needs a model that can see. Without the key it can only pretend to pass,');
  console.log('which reports the same green as a run that actually happened — so it stops instead.');
  console.log('');
  console.log('If an agent is running this, it does not need the key at all:');
  console.log(`  node image-relevance.mjs ${base} --collect`);
  console.log('collects the images with the words they illustrate, and the agent looks at them.');
  process.exit(2);
}

const paths = readFileSync(PAGES, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

// ── collect: one entry per content image, with the words it is supposed to illustrate ──────────
const jobs = [];

for (const p of paths) {
  if (jobs.length >= MAX) break;
  const res = await page.goto(base + p, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
  if (!res || res.status() !== 200) continue;

  // The unit is an ARTICLE, not a page: on a listing every card is its own subject, and judging a
  // card's photograph against the page heading ("Blog") asks a question with no answer. Where the
  // page is a single article, the whole prose region is that one unit.
  const found = await page.evaluate(() => {
    const usable = (img) => {
      const r = img.getBoundingClientRect();
      const src = img.getAttribute('src') || '';
      return r.width >= 200 && !/avatar|author|default\./i.test(src)
        && !img.closest('[class*="logo"], [class*="avatar"], [class*="author"]');
    };

    const describe = (scope, fallbackHeading) => {
      const heading = (scope.querySelector('h1, h2, h3, .item-title')?.textContent || fallbackHeading || '')
        .replace(/\s+/g, ' ').trim();
      const text = [...scope.querySelectorAll('p')]
        .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 40)
        .slice(0, 3).join(' ').slice(0, 700);
      const images = [...scope.querySelectorAll('img')].filter(usable).map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.getAttribute('alt') || '',
        caption: img.closest('figure')?.querySelector('figcaption')?.textContent.replace(/\s+/g, ' ').trim() || '',
      }));
      return heading && images.length ? { heading, text, images } : null;
    };

    const pageHeading = (document.querySelector('.page-header h1, .page-header h2, h1')?.textContent || '')
      .replace(/\s+/g, ' ').trim();

    const cards = [...document.querySelectorAll('article')].filter((a) => a.querySelector('img'));
    if (cards.length) {
      return cards.map((c) => describe(c, pageHeading)).filter(Boolean);
    }

    const scope = document.querySelector('.tracy-prose, .article-body, .com-content-article');
    const one = scope ? describe(scope, pageHeading) : null;
    return one ? [one] : [];
  }).catch(() => []);

  for (const unit of found) {
    for (const img of unit.images) {
      if (jobs.length >= MAX) break;
      jobs.push({ page: p, heading: unit.heading, text: unit.text, ...img });
    }
  }
}

await browser.close();

console.log(`# image-relevance  ${base}`);
console.log(`  ${jobs.length} content image(s)` + (COLLECT ? ' · collected for the agent to look at' : ` · model ${MODEL}`));

if (!jobs.length) {
  // Same fail-open as `image-seo` had: a site with no pictures produced no verdicts and printed a
  // pass. This gate costs money per image, so it is the one most likely to be run once, believed,
  // and never run again — which makes a false green here more expensive, not less.
  console.log('');
  console.log(`FAIL — no content images found on ${paths.length} page(s), so nothing was judged.`);
  console.log('Nothing to judge is not a pass. Either Phase 6b has not put pictures on the pages');
  console.log('yet, or the pages listed are not the ones carrying them.');
  process.exit(2);
}

// ── collect: hand the question to whoever is already looking ───────────────────────────────────
if (COLLECT) {
  mkdirSync(COLLECT_DIR, { recursive: true });
  const index = [];
  for (const [i, job] of jobs.entries()) {
    const ext = (job.src.split('?')[0].match(/\.[a-z0-9]+$/i) || ['.jpg'])[0];
    const name = `${String(i + 1).padStart(2, '0')}${ext}`;
    try {
      const res = await fetch(job.src);
      if (!res.ok) throw new Error(String(res.status));
      writeFileSync(path.join(COLLECT_DIR, name), Buffer.from(await res.arrayBuffer()));
    } catch (e) {
      index.push({ file: null, error: `could not fetch: ${e.message}`, ...job });
      continue;
    }
    index.push({ file: path.join(COLLECT_DIR, name), page: job.page, heading: job.heading,
                 text: job.text, alt: job.alt, caption: job.caption, src: job.src });
  }
  writeFileSync(path.join(COLLECT_DIR, 'index.json'), JSON.stringify(index, null, 2));

  console.log('');
  console.log(`  ${index.filter((r) => r.file).length} image(s) written to ${COLLECT_DIR}/`);
  console.log('');
  for (const r of index) {
    console.log(`  ${r.file || '(fetch failed)'}`);
    console.log(`      page     ${r.page}`);
    console.log(`      heading  ${r.heading}`);
    console.log(`      opening  ${(r.text || '').slice(0, 110)}…`);
  }
  console.log('');
  console.log('Now LOOK at each file and ask, for each one: does this photograph illustrate THAT');
  console.log('article — its subject, or the world its subject belongs to? A stock photograph that');
  console.log('could sit beside any article does not. Report the ones that do not, with the reason.');
  console.log('');
  console.log('This is a judgement, so it can be wrong. Say which ones you were unsure about.');
  process.exit(0);
}

// ── ask ─────────────────────────────────────────────────────────────────────────────────────────
const asDataUri = async (url) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  const type = res.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${type};base64,${buf.toString('base64')}`;
};

const verdicts = [];

for (const job of jobs) {
  const dataUri = await asDataUri(job.src).catch(() => null);
  if (!dataUri) {
    verdicts.push({ ...job, ok: null, why: 'the image could not be fetched' });
    continue;
  }

  const prompt = [
    'You are reviewing a website before it ships.',
    '',
    `Article heading: ${job.heading}`,
    `Article opening: ${job.text}`,
    '',
    'Does the attached photograph illustrate THAT article — the subject it is about, or the world',
    'that subject belongs to? A generic stock photograph that could sit beside any article does not.',
    '',
    'Answer with JSON only: {"relevant": true|false, "why": "<one short sentence>"}',
  ].join('\n');

  const body = {
    model: MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUri } },
      ],
    }],
    temperature: 0,
    max_tokens: 200,
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((e) => ({ ok: false, statusText: e.message }));

  if (!res.ok) {
    console.log('');
    console.log(`FAIL — the model call failed (${res.status || ''} ${res.statusText || ''}).`);
    console.log('The gate stops rather than reporting green on images it never looked at.');
    process.exit(2);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? '';
  let parsed = null;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/gm, '').trim());
  } catch { /* a model that did not answer in JSON is reported as unknown, not as a pass */ }

  verdicts.push({
    ...job,
    ok: parsed ? Boolean(parsed.relevant) : null,
    why: parsed?.why || raw.slice(0, 120) || 'no answer',
  });
}

const bad = verdicts.filter((v) => v.ok === false);
const unknown = verdicts.filter((v) => v.ok === null);

console.log('');
for (const v of verdicts) {
  const mark = v.ok === true ? ' ' : v.ok === false ? '✗' : '?';
  const file = (v.src.split('/').pop() || '').split('?')[0];
  console.log(`  ${mark} ${v.page.padEnd(28)} ${file.padEnd(22)} ${v.why}`);
}

if (!bad.length && !unknown.length) {
  console.log('');
  console.log('OK — every content image illustrates the article it sits in');
  process.exit(0);
}

console.log('');
if (bad.length) {
  console.log(`  ✗ ${bad.length} image(s) do not illustrate their article`);
}
if (unknown.length) {
  console.log(`  ? ${unknown.length} image(s) could not be judged — treated as unresolved, not as a pass`);
}
console.log('');
console.log('A stock photograph about nothing is the loudest "this is a template" signal a build can');
console.log('carry, and it is invisible to every other gate. This one ADVISES: the reason is printed');
console.log('so a human can overrule it in a second, which is the right relationship with a check');
console.log('that is capable of being wrong.');
process.exit(1);
