// src/host/index.ts
import { createReadStream, promises as fs4, readFileSync } from "node:fs";
import path5 from "node:path";

// ../../core/tracy-core/src/site-dir/index.mjs
import path from "node:path";
var ALLOWED_FOLDERS_HEADER = "x-dsh-allowed-folders";
function firstGrantedFolder(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value === "") return null;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const first = parsed[0];
  return typeof first === "string" && path.isAbsolute(first) ? first : null;
}
function siteDirFor(config, req) {
  if (config.siteDir) return config.siteDir;
  return firstGrantedFolder(req.headers?.[ALLOWED_FOLDERS_HEADER]) ?? path.resolve(".");
}

// src/host/crawl.mjs
import { promises as fs } from "node:fs";
import path2 from "node:path";
import { fetchExternalBrandAsset } from "@tracy/od-brand-engine";
var PAGES_DIR = "pages";
var CRAWL_DEFAULTS = Object.freeze({
  maxPages: 20,
  maxDepth: 2,
  /** Per page, bytes. prefetch.ts caps the home page at 6 MB; a folder of 20 needs a lower one. */
  pageCap: 2 * 1024 * 1024,
  /** Stylesheets of the home page: same caps as prefetch.ts (6 × 400 KB). */
  maxCss: 6,
  cssCap: 400 * 1024,
  timeoutMs: 8e3
});
var SKIP_PATH = /(^|\/)(wp-admin|wp-login\.php|wp-json|xmlrpc\.php|administrator|admin|login|logout|signin|signout|cart|checkout|feed|rss|sitemap[^/]*\.xml)(\/|$)/i;
var NOT_A_PAGE = /\.(pdf|zip|gz|tgz|rar|7z|jpe?g|png|gif|webp|avif|svg|ico|bmp|css|js|mjs|cjs|json|xml|rss|atom|mp4|webm|mp3|wav|woff2?|ttf|otf|eot|txt|csv|docx?|xlsx?|pptx?)$/i;
var UA = { "user-agent": "Mozilla/5.0 (compatible; TracyBrandEngine/1.0; +https://tracy.ai)" };
function siteHostKey(host) {
  return String(host ?? "").toLowerCase().replace(/^www\./, "");
}
function normalizePageUrl(href, base) {
  let u;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.search = "";
  return u.href;
}
function defuseScripts(html) {
  return html.replace(/<script\b/gi, '<script type="text/od-defused-script"');
}
function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
}
function textOf(fragment) {
  return decodeEntities(fragment.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function firstMatch(html, re) {
  const m = re.exec(html);
  return m ? textOf(m[1] ?? "") : "";
}
function pageSlug(url) {
  const pathname = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
  if (!pathname) return "home";
  const slug = pathname.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "page";
}
function linksOf(html) {
  const out = [];
  const re = /<a\b[^>]*?\shref\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(decodeEntities(m[1] ?? ""));
  return out;
}
function stylesheetsOf(html) {
  const out = [];
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    if (!/\brel\s*=\s*["'][^"']*\bstylesheet\b/i.test(tag)) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (href) out.push(decodeEntities(href[1] ?? ""));
  }
  return out;
}
async function readCapped(res, cap) {
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.subarray(0, cap).toString("utf8");
}
var guardedFetch = (url, init) => fetchExternalBrandAsset(String(url), init);
async function crawlSite(startUrl, dir, o = {}) {
  const fetchImpl = o.fetch ?? guardedFetch;
  const maxPages = o.maxPages ?? CRAWL_DEFAULTS.maxPages;
  const maxDepth = o.maxDepth ?? CRAWL_DEFAULTS.maxDepth;
  const progress = o.onProgress ?? (() => {
  });
  const start = normalizePageUrl(startUrl, startUrl);
  if (start === null) throw new Error(`crawlSite: not an http(s) URL: ${String(startUrl).slice(0, 120)}`);
  const pagesDir = path2.join(dir, PAGES_DIR);
  await fs.rm(pagesDir, { recursive: true, force: true });
  await fs.mkdir(pagesDir, { recursive: true });
  const siteKey2 = siteHostKey(new URL(start).host);
  const queue = [{ url: start, depth: 0 }];
  const seen = /* @__PURE__ */ new Set([start]);
  const pages = [];
  let truncated = false;
  let css = null;
  while (queue.length > 0) {
    if (o.signal?.aborted) throw new Error("crawlSite: aborted");
    if (pages.length >= maxPages) {
      truncated = true;
      break;
    }
    const next = queue.shift();
    if (!next) break;
    const { url, depth } = next;
    let res;
    try {
      res = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(CRAWL_DEFAULTS.timeoutMs) });
    } catch {
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/text\/html|application\/xhtml\+xml/i.test(type)) {
      if (res.body) await res.body.cancel().catch(() => {
      });
      continue;
    }
    const html = await readCapped(res, CRAWL_DEFAULTS.pageCap);
    const effective = normalizePageUrl(res.url || url, url) ?? url;
    const n = pages.length + 1;
    const file = `${PAGES_DIR}/${String(n).padStart(2, "0")}-${pageSlug(effective)}.html`;
    await fs.writeFile(path2.join(dir, file), defuseScripts(html));
    pages.push({
      url,
      file,
      title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
      h1: firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i),
      depth,
      status: res.status
    });
    progress("crawl", `${n} ${effective}`);
    if (n === 1) {
      const parts = [];
      for (const href of stylesheetsOf(html).slice(0, CRAWL_DEFAULTS.maxCss)) {
        const cssUrl = normalizePageUrl(href, effective);
        if (cssUrl === null) continue;
        try {
          const r = await fetchImpl(cssUrl, {
            headers: UA,
            signal: AbortSignal.timeout(CRAWL_DEFAULTS.timeoutMs)
          });
          if (r.ok) parts.push(await readCapped(r, CRAWL_DEFAULTS.cssCap));
          else if (r.body) await r.body.cancel().catch(() => {
          });
        } catch {
        }
      }
      css = parts.join("\n");
    }
    if (depth >= maxDepth) continue;
    for (const href of linksOf(html)) {
      const link = normalizePageUrl(href, effective);
      if (link === null || seen.has(link)) continue;
      const u = new URL(link);
      if (siteHostKey(u.host) !== siteKey2) continue;
      if (SKIP_PATH.test(u.pathname) || NOT_A_PAGE.test(u.pathname)) continue;
      seen.add(link);
      queue.push({ url: link, depth: depth + 1 });
    }
  }
  await fs.writeFile(path2.join(pagesDir, "styles.css"), css ?? "");
  await fs.writeFile(
    path2.join(pagesDir, "pages.json"),
    `${JSON.stringify({ schemaVersion: "tracy-site-pages/v1", url: start, crawledAt: (/* @__PURE__ */ new Date()).toISOString(), truncated, pages }, null, 2)}
`
  );
  return { pages, truncated, dir };
}

// src/host/pipeline.mjs
import { promises as fs3 } from "node:fs";
import path4 from "node:path";
import {
  brandFromMaterial,
  brandToDesignMd,
  renderTypography,
  buildBrandSystem,
  ensureImageryFallback,
  ensureLogoFallback,
  prefetchBrand,
  prefetchFromHtml,
  selfHostGoogleFonts,
  slugify,
  tracyTokensCss,
  writeBrandSystem
} from "@tracy/od-brand-engine";

// ../../../scripts/lib/od-slots-dom.mjs
import { parseHTML } from "linkedom";

// ../../../scripts/lib/od-slot-rules.mjs
var SLOT_TAGS = /* @__PURE__ */ new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "button",
  "a",
  "label",
  "span",
  "strong",
  "em",
  "small",
  "li",
  "td",
  "th",
  "dt",
  "dd",
  "figcaption",
  "blockquote",
  "summary",
  "legend",
  "option"
]);
var SKIP_TAGS = /* @__PURE__ */ new Set(["script", "style", "svg", "template", "noscript", "head", "title"]);
function isNumberish(text) {
  const t = text.trim();
  return /\d/.test(t) && /^[~<>≤≥+\-–—]?\s?[$€£¥]?[\d.,]+(\s?[a-zA-Z%×x/]{1,5})?$/.test(t);
}
function isEyebrow(text) {
  const t = text.trim();
  if (t.length < 3 || t.length > 60) return false;
  const letters = t.replace(/[^A-Za-zÀ-ỹ]/g, "");
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^A-ZÀ-Ỹ]/g, "").length;
  return upper / letters.length >= 0.8;
}
function words(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
function roleOf(el) {
  const t = el.text.trim();
  const cls = el.classes.join(" ");
  if (/\b(logo|brand|wordmark|nav-logo)\b/.test(cls) && words(t) <= 3) return "brand";
  if (el.tag === "h1") return "headline";
  if (el.tag === "h2") return "title";
  if (el.tag === "h3" || el.tag === "h4") return "subtitle";
  if (el.tag === "blockquote") return "quote";
  if (el.tag === "button" || el.role === "button" || /\b(btn|button|cta|pill-button)\b/.test(cls)) {
    return "button";
  }
  if (el.tag === "a") return el.ancestors.includes("nav") || el.ancestors.includes("header") ? "nav" : "link";
  if (isNumberish(t)) return "number";
  if (el.tag === "label" || el.tag === "dt" || el.tag === "th" || el.tag === "legend" || el.tag === "option")
    return "label";
  if (isEyebrow(t) || /\b(eyebrow|kicker|overline|section-label)\b/.test(cls)) return "eyebrow";
  if (el.beforeHeading && words(t) <= 6 && (el.tag === "p" || el.tag === "span" || el.tag === "small"))
    return "eyebrow";
  if (el.tag === "p") return words(t) <= 4 ? "label" : "paragraph";
  return words(t) <= 5 ? "label" : "paragraph";
}
var GENERIC_GROUPS = /* @__PURE__ */ new Set(["layout", "typography"]);
function groupOf(groups, matches) {
  const ordered = [
    ...groups.filter((g) => !GENERIC_GROUPS.has(g.id)),
    ...groups.filter((g) => GENERIC_GROUPS.has(g.id))
  ];
  for (const g of ordered) {
    for (const sel of g.selectors ?? []) {
      if (sel.includes(":")) continue;
      try {
        if (matches(sel)) return g.id;
      } catch {
      }
    }
  }
  return null;
}
function slotRecord({ tag, n, text, role, group, inNav = false }) {
  const t = text.trim().replace(/\s+/g, " ");
  return { id: `${tag}.${String(n)}`, tag, n, role, group, inNav, text: t, chars: t.length, words: words(t) };
}

// ../../../scripts/lib/od-slots-dom.mjs
function ownText(el) {
  let out = "";
  for (const node of el.childNodes) if (node.nodeType === 3) out += node.textContent;
  return out.replace(/\s+/g, " ").trim();
}
function ancestorsOf(el) {
  const names = [];
  for (let p = el.parentElement; p; p = p.parentElement) names.push(p.tagName.toLowerCase());
  return names;
}
function insideSkipped(el) {
  for (let p = el; p; p = p.parentElement) {
    const tag = p.tagName?.toLowerCase();
    if (SKIP_TAGS.has(tag)) return true;
    if (p.getAttribute?.("aria-hidden") === "true") return true;
    if (p.getAttribute?.("data-slots") === "skip") return true;
  }
  return false;
}
function slotsOf(html, groups) {
  const { document } = parseHTML(html);
  const body = document.body;
  if (!body) return [];
  const counters = /* @__PURE__ */ new Map();
  const slots = [];
  for (const el of body.querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase();
    if (!SLOT_TAGS.has(tag)) continue;
    const n = counters.get(tag) ?? 0;
    counters.set(tag, n + 1);
    if (insideSkipped(el)) continue;
    const text = ownText(el);
    if (text.length === 0) continue;
    const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    const ancestors = ancestorsOf(el);
    const nextTag = el.nextElementSibling?.tagName?.toLowerCase();
    const role = roleOf({
      tag,
      classes,
      text,
      ancestors,
      role: el.getAttribute("role"),
      beforeHeading: nextTag === "h1" || nextTag === "h2"
    });
    const group = groupOf(groups, (sel) => el.closest(sel) !== null);
    const inNav = ancestors.includes("nav") || ancestors.includes("header");
    slots.push(slotRecord({ tag, n, text, role, group, inNav }));
  }
  return slots;
}

// src/host/recon.mjs
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs2 } from "node:fs";
import path3 from "node:path";
var RECON_DIR = "recon";
var RECON_SCRIPTS_DIR = "/opt/tracy/skills/web-clone/scripts";
var RECON_TIMEOUT_MS = 15e4;
var RECON_ROUTE_ARGS = ["--max-pages", "12", "--max-depth", "1"];
async function runRecon(url, dir, o = {}) {
  const scriptsDir = o.scriptsDir ?? RECON_SCRIPTS_DIR;
  const browser = o.browser === void 0 ? process.env.OD_BROWSER_EXECUTABLE_PATH?.trim() || null : o.browser;
  const progress = o.onProgress ?? (() => {
  });
  if (!browser) return { status: "skipped:no-browser" };
  if (!existsSync(path3.join(scriptsDir, "recon-site.mjs"))) return { status: "skipped:no-scripts" };
  const cwd = path3.join(dir, RECON_DIR);
  await fs2.rm(cwd, { recursive: true, force: true });
  await fs2.mkdir(cwd, { recursive: true });
  const deadline = Date.now() + (o.timeoutMs ?? RECON_TIMEOUT_MS);
  const env = { ...process.env, OD_BROWSER_EXECUTABLE_PATH: browser };
  const plan = [
    ["recon", "recon-site.mjs", ["--url", url, "--out", "RECON", "--label", "original"]],
    [
      "recon-routes",
      "route-crawl.mjs",
      ["--url", url, "--out", "RECON/routes", "--label", "original", ...RECON_ROUTE_ARGS]
    ],
    [
      "recon-dna",
      "dna-scaffold.mjs",
      ["--recon", "RECON/original-recon.json", "--out", "RECON/design-dna.json", "--name", new URL(url).host]
    ]
  ];
  for (const [step, script, args] of plan) {
    if (o.signal?.aborted) return { status: "failed:aborted" };
    progress(step);
    const left = deadline - Date.now();
    if (left <= 0) return { status: "failed:timeout", detail: step };
    const r = await runScript(path3.join(scriptsDir, script), args, {
      cwd,
      env,
      timeoutMs: left,
      signal: o.signal
    });
    if (r.status !== "ok")
      return { status: r.status === "timeout" ? "failed:timeout" : `failed:${step}`, detail: r.detail };
  }
  progress("recon-done");
  return { status: "done" };
}
function runScript(file, args, { cwd, env, timeoutMs, signal }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const keep = (chunk) => {
      tail = (tail + String(chunk)).slice(-2e3);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    let settled = false;
    const finish = (status, detail) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ status, detail });
    };
    const kill = () => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2e3).unref();
    };
    const timer = setTimeout(() => {
      kill();
      finish("timeout", tail.trim().slice(-300));
    }, timeoutMs);
    const onAbort = () => {
      kill();
      finish("exit", "aborted");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (error) => finish("exit", error.message));
    child.on("exit", (code) => finish(code === 0 ? "ok" : "exit", tail.trim().slice(-300)));
  });
}

// src/host/refine.mjs
import { luminance, saturation } from "@tracy/od-brand-engine";
var NOT_A_FAMILY_AT_ALL = /[_"'()[\]{}<>;:,\\/]|^-{2}/;
var NOT_A_BRAND_FONT = /glyphicons|font ?awesome|^fa[srlbd]?$|^fa-|icomoon|^slick$|material (icons|symbols)|dashicons|genericons|eicons|elementor-icons|themify|ionicons|simple-line-icons|linearicons|bootstrap-icons|feather|tabler-icons|line ?awesome|flaticon|\bicons?\b|^menlo$|^monaco$|^consolas$|^sfmono-regular$|^sf mono$|^ui-monospace$|^liberation mono$|^cascadia( code| mono)?$|^dejavu sans mono$|^andale mono$|^lucida console$|^courier|^source code pro$|^fira code$|^jetbrains mono$|^roboto mono$|^inherit$|^initial$|^sans-serif$|^serif$|^monospace$|^system-ui$|^-apple-system$|^blinkmacsystemfont$|^segoe ui$|^arial$|^helvetica( neue)?$|^ui-sans-serif$|^ui-serif$|^ui-monospace$/i;
var TITLE_SEPARATOR = /\s*(?:\||–|—|·|•|::|:|\s-\s)\s*/;
var MAX_NAME_WORDS = 4;
var words2 = (s) => s.trim().split(/\s+/).filter(Boolean).length;
function hostOf(url) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return h || null;
  } catch {
    return null;
  }
}
function pickName(material, host) {
  const siteName = (material.siteName ?? "").trim();
  if (siteName && words2(siteName) <= MAX_NAME_WORDS + 2 && !/[.!?]$/.test(siteName)) {
    return { name: siteName, from: "site-name" };
  }
  const title = (material.title ?? "").trim();
  if (title) {
    const segments = title.split(TITLE_SEPARATOR).map((s) => s.trim()).filter((s) => s.length > 0 && words2(s) <= MAX_NAME_WORDS && !/[.!?]$/.test(s));
    if (segments.length > 0) {
      segments.sort((a, b) => a.length - b.length);
      return { name: segments[0], from: "title" };
    }
  }
  return { name: host, from: "host" };
}
function pickFont(material) {
  const ranked = [...(material.fonts ?? []).map((f) => f.family), ...material.fontFaceFamilies ?? []];
  for (const raw of ranked) {
    const family = String(raw ?? "").replace(/^["']|["']$/g, "").trim();
    if (family && !NOT_A_FAMILY_AT_ALL.test(family) && !NOT_A_BRAND_FONT.test(family)) return family;
  }
  return null;
}
function googleFontsUrlFor(family, urls) {
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!slug) return null;
  return (urls ?? []).find(
    (u) => u.toLowerCase().replace(/[^a-z0-9]+/g, "").includes(slug)
  ) ?? null;
}
function guessGoogleFontsUrl(family) {
  const clean = family.replace(/^["']|["']$/g, "").trim();
  if (!clean || NOT_A_BRAND_FONT.test(clean) || !/^[a-z0-9 ]+$/i.test(clean)) return null;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(clean).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
}
var cp = (n) => String.fromCodePoint(n);
var NAMED = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: cp(8212),
  ndash: cp(8211),
  hellip: cp(8230),
  middot: cp(183),
  bull: cp(8226),
  lsquo: cp(8216),
  rsquo: cp(8217),
  ldquo: cp(8220),
  rdquo: cp(8221),
  laquo: cp(171),
  raquo: cp(187),
  times: cp(215),
  divide: cp(247),
  copy: cp(169),
  reg: cp(174),
  trade: cp(8482),
  sect: cp(167),
  para: cp(182),
  deg: cp(176),
  euro: cp(8364),
  pound: cp(163),
  yen: cp(165),
  cent: cp(162),
  agrave: cp(224),
  aacute: cp(225),
  acirc: cp(226),
  atilde: cp(227),
  auml: cp(228),
  aring: cp(229),
  egrave: cp(232),
  eacute: cp(233),
  ecirc: cp(234),
  euml: cp(235),
  igrave: cp(236),
  iacute: cp(237),
  icirc: cp(238),
  iuml: cp(239),
  ograve: cp(242),
  oacute: cp(243),
  ocirc: cp(244),
  otilde: cp(245),
  ouml: cp(246),
  ugrave: cp(249),
  uacute: cp(250),
  ucirc: cp(251),
  uuml: cp(252),
  ntilde: cp(241),
  ccedil: cp(231),
  szlig: cp(223),
  yacute: cp(253),
  Agrave: cp(192),
  Aacute: cp(193),
  Acirc: cp(194),
  Auml: cp(196),
  Aring: cp(197),
  Egrave: cp(200),
  Eacute: cp(201),
  Ecirc: cp(202),
  Euml: cp(203),
  Iacute: cp(205),
  Oacute: cp(211),
  Ocirc: cp(212),
  Ouml: cp(214),
  Uacute: cp(218),
  Uuml: cp(220),
  Ntilde: cp(209),
  Ccedil: cp(199)
};
function decodeText(s) {
  return String(s ?? "").replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&([a-z][a-z0-9]{1,9});/gi, (whole, name2) => NAMED[name2] ?? whole).replace(/\s+/g, " ").trim();
}
var LOOKS_LIKE_URL = /^(?:https?:\/\/|www\.)\S+$|^[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*$/i;
var sameName = (a, b) => {
  const k = (s) => String(s ?? "").toLowerCase().replace(/\.[a-z]{2,6}(\.[a-z]{2,3})?$/, "").replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/g, "");
  return k(a) !== "" && k(a) === k(b);
};
var MIN_TAGLINE_WORDS = 3;
var CHROME_HEADING = /^(?:side ?bar|main menu|menu|navigation|nav|search|search form|footer|header|categories|category|tags?|archives?|archive|log ?in|sign ?in|register|subscribe|newsletter|follow us|related|related posts?|popular|latest|recent|recent posts?|share|comments?|breadcrumbs?|skip to content|toggle|filters?|widgets?|about this site|links?|suggested searches?|common links|our priorities|home ?page|latest news|top stories|sections?|topics?|browse|explore|discover|overview|highlights)$/i;
function isChromeHeading(text, navLabels, name2) {
  const line = decodeText(text);
  if (sameName(line, name2)) return true;
  if (LOOKS_LIKE_URL.test(line)) return true;
  if (line === "") return false;
  if (CHROME_HEADING.test(line)) return true;
  if (words2(line) < MIN_TAGLINE_WORDS) return true;
  return (navLabels ?? []).some(
    (l) => String(l ?? "").trim().toLowerCase() === line.toLowerCase()
  );
}
function taglineFrom(material, name2) {
  const title = decodeText(material.title ?? "");
  const lower = String(name2 ?? "").trim().toLowerCase();
  const other = title.split(TITLE_SEPARATOR).map((seg) => seg.trim()).filter((seg) => seg !== "" && seg.toLowerCase() !== lower && words2(seg) >= 2);
  if (other.length > 0) return other.sort((a, b) => b.length - a.length)[0];
  const description = decodeText(material.description ?? "");
  return description === "" || sameName(description, name2) ? null : description;
}
function isAchromatic(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return true;
  const l = luminance(hex);
  return saturation(hex) < 0.18 || l > 0.92 || l < 0.02;
}
var DARK_SCOPE = /data-theme\s*=\s*["']?dark|data-(?:mode|color-mode|bs-theme)\s*=\s*["']?dark|prefers-color-scheme\s*:\s*dark|(?:^|[\s.#[])(?:dark|theme-dark|night)(?:[\s.[\]"']|$)|css-var:--(?:dm|dark)[-_]/i;
function isDarkModeOnly(candidate) {
  const sources = candidate?.sources ?? [];
  if (sources.length === 0) return false;
  return sources.every((s) => DARK_SCOPE.test(String(s)));
}
function isHeadingRule(selectors) {
  const bare = selectors.split(",").filter((sel) => /^\s*h[1-6]\s*$/i.test(sel)).length;
  return bare >= 3;
}
function headingFont(css) {
  const declarations = [];
  for (const m of String(css ?? "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!isHeadingRule(m[1] ?? "")) continue;
    const declared = /font-family\s*:\s*([^;}]+)/i.exec(m[2] ?? "")?.[1];
    if (declared) declarations.push(declared);
  }
  for (const declared of declarations.reverse()) {
    for (const raw of declared.split(",")) {
      const family = raw.replace(/^\s*["']|["']\s*$/g, "").trim();
      if (family === "" || NOT_A_FAMILY_AT_ALL.test(family)) continue;
      if (!NOT_A_BRAND_FONT.test(family)) return family;
    }
  }
  return null;
}
function topChromatic(material) {
  let best = null;
  let bestCount = 0;
  for (const c of material.colors ?? []) {
    const hex = String(c.hex ?? "").toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex) || c.extreme) continue;
    if (isDarkModeOnly(c)) continue;
    if (saturation(hex) < 0.25) continue;
    const l = luminance(hex);
    if (l < 0.03 || l > 0.8) continue;
    if (c.count > bestCount) {
      best = hex;
      bestCount = c.count;
    }
  }
  return best;
}
function refineBrand(brand, material, url, opts = {}) {
  const notes = [];
  const host = hostOf(material.finalUrl || url) ?? hostOf(url) ?? url;
  const out = structuredClone(brand);
  const picked = pickName(material, host);
  if (picked.name !== brand.name) {
    notes.push(
      `name: "${brand.name}" \u2192 "${picked.name}" (${picked.from === "host" ? "the title is a sentence; using the hostname" : `from the ${picked.from === "title" ? "shortest title segment" : "site name"}`})`
    );
    out.name = picked.name;
  }
  const heading = headingFont(opts.css ?? "");
  const displayNow = brand.typography?.display?.family ?? "";
  const sameFamily = heading !== null && heading.toLowerCase().trim() === displayNow.toLowerCase().trim();
  if (heading && !sameFamily) {
    notes.push(`font: display "${displayNow}" \u2192 "${heading}" (the family the site sets on h1..h6)`);
    out.typography.display = { ...out.typography.display, family: heading };
  }
  const font = pickFont(material);
  const current = out.typography?.display?.family ?? "";
  if (font && (!heading || sameFamily) && font !== current) {
    notes.push(
      NOT_A_BRAND_FONT.test(current) ? `font: "${current}" is an icon or code face \u2192 "${font}"` : `font: "${current}" \u2192 "${font}" (first brand face by frequency)`
    );
    out.typography.display = { ...out.typography.display, family: font };
    out.typography.body = { ...out.typography.body, family: font };
  } else if (!font && (!heading || sameFamily) && NOT_A_BRAND_FONT.test(current)) {
    notes.push(`font: "${current}" is an icon or code face and the site declared no other; kept`);
  }
  const bodyNow = out.typography?.body?.family ?? "";
  if (NOT_A_BRAND_FONT.test(bodyNow) && font && font !== bodyNow) {
    notes.push(`font: body "${bodyNow}" is an icon or code face \u2192 "${font}"`);
    out.typography.body = { ...out.typography.body, family: font };
  }
  for (
    const key of
    /** @type {const} */
    ["display", "body"]
  ) {
    const spec = out.typography?.[key];
    if (!spec || spec.googleFontsUrl) continue;
    const gf = googleFontsUrlFor(spec.family ?? "", material.googleFontsUrls) ?? guessGoogleFontsUrl(spec.family ?? "");
    if (gf) spec.googleFontsUrl = gf;
  }
  for (
    const key of
    /** @type {const} */
    ["name", "tagline", "description"]
  ) {
    if (typeof out[key] === "string") out[key] = decodeText(out[key]);
  }
  if (typeof out.tagline === "string" && isChromeHeading(out.tagline, material.navLabels, out.name)) {
    const replacement = taglineFrom(material, out.name);
    notes.push(
      replacement === null ? `tagline: "${out.tagline}" is page furniture and the page offered no other line; cleared` : `tagline: "${out.tagline}" is page furniture \u2192 "${replacement}" (the site's own words)`
    );
    out.tagline = replacement ?? "";
  }
  const accent = out.colors.find((c) => c.role === "accent");
  const chosen = (material.colors ?? []).find(
    (c) => String(c.hex ?? "").toLowerCase() === String(accent?.hex ?? "").toLowerCase()
  );
  const darkOnly = accent ? isDarkModeOnly(chosen ?? {}) : false;
  if (accent && (isAchromatic(accent.hex) || darkOnly)) {
    const replacement = topChromatic(material);
    if (replacement && replacement !== accent.hex.toLowerCase()) {
      notes.push(
        darkOnly ? `accent: ${accent.hex} is only painted in dark mode \u2192 ${replacement} (most-used chromatic colour)` : `accent: ${accent.hex} has no hue \u2192 ${replacement} (most-used chromatic colour)`
      );
      accent.hex = replacement;
      out.colors = out.colors.filter(
        (c) => c.role !== "accent-secondary" || c.hex.toLowerCase() !== replacement
      );
    } else if (!replacement) {
      notes.push(
        darkOnly ? `accent: ${accent.hex} is only painted in dark mode and the site has no other chromatic colour; kept` : `accent: ${accent.hex} has no hue and the site has no chromatic colour; kept (monochrome brand)`
      );
    }
  }
  return { brand: out, notes };
}

// src/host/pipeline.mjs
var BRAND_DIR = "Brand";
var EXTRACT_TIMEOUT_MS = 9e4;
var SAFE_HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
function brandHostOf(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const host = hostOf(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!host || !SAFE_HOST.test(host) || /^[0-9.]+$/.test(host)) return null;
  return host;
}
function urlOf(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  return brandHostOf(raw) ? `https://${brandHostOf(raw)}/` : null;
}
function kindOf(host, siteKey2, requested) {
  if (requested === "own" || requested === "reference") return requested;
  return siteKey2 !== null && host === siteKey2.toLowerCase().replace(/^www\./, "") ? "own" : "reference";
}
function manifestOf(m) {
  return {
    id: `brand:${m.host}`,
    host: m.host,
    kind: m.kind,
    slug: m.slug,
    name: m.name,
    category: m.kind === "own" ? "Your brand" : "Reference",
    description: m.description,
    nav: "top-left",
    hero: "centered",
    source: {
      url: m.url,
      finalUrl: m.finalUrl,
      extractedAt: m.extractedAt,
      thin: m.thin,
      blocked: m.blocked,
      ...m.pages === void 0 ? {} : { pages: m.pages },
      ...m.recon === void 0 ? {} : { recon: m.recon }
    },
    refined: m.notes,
    counts: m.counts
  };
}
var LIVE_ENRICH = {
  logo: ensureLogoFallback,
  imagery: ensureImageryFallback,
  googleFonts: selfHostGoogleFonts
};
async function writeDirection(material, o) {
  const progress = o.onProgress ?? (() => {
  });
  const enrich = { ...LIVE_ENRICH, ...o.enrich };
  await fs3.mkdir(path4.join(o.dir, "prefetch"), { recursive: true });
  await fs3.writeFile(path4.join(o.dir, "prefetch", "material.md"), material.materialMd);
  progress("brand");
  const provisional = brandFromMaterial(material, o.url);
  const css = await fs3.readFile(path4.join(o.dir, "prefetch", "styles.css"), "utf8").catch(() => "");
  const { brand, notes } = refineBrand(provisional, material, o.url, { css });
  if (brand.logo.primary === null) {
    progress("logo-fallback");
    await enrich.logo(o.url, path4.join(o.dir, "logos"), brand.logo).catch(() => ({ changed: false }));
    if (brand.logo.primary !== null)
      notes.push(`logo: none in the page; took ${brand.logo.primary} from the site's icons`);
  }
  progress("imagery");
  const imagery = { samples: brand.imagery.samples ?? [] };
  await enrich.imagery(o.url, path4.join(o.dir, "imagery"), imagery).catch(() => ({ changed: false }));
  if (imagery.samples && imagery.samples.length > 0)
    brand.imagery = { ...brand.imagery, samples: imagery.samples };
  progress("imagery-done", `${imagery.samples?.length ?? 0} images`);
  progress("google-fonts");
  let fontFiles = material.fontFiles ?? [];
  try {
    const hosted = await enrich.googleFonts(brand, o.dir);
    if (hosted.length > fontFiles.length) {
      notes.push(
        `fonts: ${hosted.length - fontFiles.length} faces self-hosted from Google Fonts (${brand.typography.display.family})`
      );
    }
    if (hosted.length > 0) fontFiles = hosted;
  } catch {
  }
  progress("google-fonts-done", `${fontFiles.length} font files`);
  await fs3.writeFile(path4.join(o.dir, "brand.json"), `${JSON.stringify(brand, null, 2)}
`);
  progress("system");
  const system = buildBrandSystem(brand, { fontFiles });
  writeBrandSystem(system, path4.join(o.dir, "system"));
  const designMd = brandToDesignMd(brand);
  await fs3.writeFile(
    path4.join(o.dir, "system", "artifacts", "typography.html"),
    renderTypography(brand, system.themes.default, { designMd })
  );
  system.files["artifacts/typography.html"] = renderTypography(brand, system.themes.default, { designMd });
  progress("library");
  const kit = system.files["kit.html"] ?? "";
  const display = brand.typography?.display?.family ?? null;
  await fs3.writeFile(path4.join(o.dir, "DESIGN.md"), designMd);
  const tokensCss = tracyTokensCss(system.themes.default, display);
  await fs3.writeFile(path4.join(o.dir, "tokens.css"), tokensCss);
  await fs3.writeFile(path4.join(o.dir, "components.html"), kit);
  await fs3.writeFile(path4.join(o.dir, "USAGE.md"), usageMdOf(brand, system.seed));
  await fs3.writeFile(
    path4.join(o.dir, "components.manifest.json"),
    `${JSON.stringify(componentsManifestOf(`brand:${o.host}`, kit, tokensCss), null, 2)}
`
  );
  const slots = slotsOf(kit, []);
  await fs3.writeFile(
    path4.join(o.dir, "slots.json"),
    `${JSON.stringify({ schemaVersion: "tracy-od-slots/v1", slots }, null, 1)}
`
  );
  const artifacts = {};
  for (const kind of ["landing", "deck", "poster", "email", "newsletter", "form", "typography"]) {
    const html = system.files[`artifacts/${kind}.html`];
    if (typeof html === "string") artifacts[kind] = slotsOf(html, []);
  }
  await fs3.writeFile(
    path4.join(o.dir, "artifact-slots.json"),
    `${JSON.stringify({ schemaVersion: "tracy-od-slots/v1", artifacts }, null, 1)}
`
  );
  const manifest = manifestOf({
    host: o.host,
    kind: o.kind,
    slug: slugify(brand.name),
    name: brand.name,
    description: brand.description,
    url: o.url,
    finalUrl: material.finalUrl,
    thin: material.thin,
    blocked: material.blocked,
    notes,
    extractedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...o.pages === void 0 ? {} : { pages: true, recon: o.recon },
    counts: {
      ...o.pages === void 0 ? {} : { pages: o.pages },
      colors: material.colors.length,
      fonts: material.fonts.length,
      logos: material.logos.length + (brand.logo.primary && !material.logos.length ? 1 : 0),
      imagery: imagery.samples?.length ?? 0,
      fonts_files: fontFiles.length,
      headings: material.headings.length,
      engineFiles: Object.keys(system.files).length,
      slots: slots.length
    }
  });
  await fs3.writeFile(path4.join(o.dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}
`);
  progress("done", `${brand.name} \xB7 accent ${system.seed.colorPrimary} \xB7 ${slots.length} slots`);
  return manifest;
}
async function extractBrand(o) {
  const host = brandHostOf(o.input);
  const url = urlOf(o.input);
  if (host === null || url === null) {
    return {
      ok: false,
      code: "BAD_URL",
      error: `Not a public http(s) site: ${String(o.input).slice(0, 120)}`
    };
  }
  const kind = kindOf(host, o.siteKey, o.kind);
  const dir = path4.join(o.siteDir, BRAND_DIR, host);
  const wasFork = await fs3.access(path4.join(dir, PAGES_DIR, "pages.json")).then(() => true).catch(() => false);
  const pages = o.pages === true || wasFork;
  const aside = `${dir}.prev`;
  await fs3.rm(aside, { recursive: true, force: true });
  const hadPrevious = await fs3.rename(dir, aside).then(() => true).catch(() => false);
  const rollBack = async () => {
    await fs3.rm(dir, { recursive: true, force: true });
    if (hadPrevious) await fs3.rename(aside, dir).catch(() => void 0);
  };
  await fs3.mkdir(dir, { recursive: true });
  let material;
  let pageCount;
  try {
    if (pages) {
      const crawl = await crawlSite(url, dir, { fetch: o.fetch, onProgress: o.onProgress, signal: o.signal });
      pageCount = crawl.pages.length;
      const home = crawl.pages[0];
      const html = home ? await fs3.readFile(path4.join(dir, home.file), "utf8") : "";
      const css = await fs3.readFile(path4.join(dir, PAGES_DIR, "styles.css"), "utf8").catch(() => "");
      material = await prefetchFromHtml(html, css, url, dir, o.onProgress);
      if (material && home) material = { ...material, finalUrl: home.url };
    } else {
      material = await prefetchBrand(url, dir, { onProgress: o.onProgress, signal: o.signal });
    }
  } catch (error) {
    await rollBack();
    const aborted = o.signal?.aborted === true;
    return {
      ok: false,
      code: aborted ? "ABORTED" : "NO_MATERIAL",
      error: aborted ? "Extraction stopped." : error instanceof Error ? error.message : String(error)
    };
  }
  if (!material) {
    await rollBack();
    return { ok: false, code: "NO_MATERIAL", error: `${host} could not be fetched from the lane.` };
  }
  let recon;
  if (pages) {
    const r = await runRecon(url, dir, {
      scriptsDir: o.reconScriptsDir,
      onProgress: o.onProgress,
      signal: o.signal
    });
    recon = r.status;
    if (r.detail) o.onProgress?.("recon-note", `${r.status}: ${r.detail}`);
  }
  const manifest = await writeDirection(material, {
    url,
    host,
    kind,
    dir,
    onProgress: o.onProgress,
    enrich: o.enrich,
    pages: pageCount,
    recon
  });
  await fs3.rm(aside, { recursive: true, force: true });
  return { ok: true, manifest };
}
async function listBrands(siteDir) {
  const out = [];
  let entries;
  try {
    entries = await fs3.readdir(path4.join(siteDir, BRAND_DIR), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory() || !SAFE_HOST.test(e.name)) continue;
    try {
      const parsed = JSON.parse(
        await fs3.readFile(path4.join(siteDir, BRAND_DIR, e.name, "manifest.json"), "utf8")
      );
      if (parsed && typeof parsed === "object" && parsed.id === `brand:${e.name}`) out.push(parsed);
    } catch {
    }
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "own" ? -1 : 1;
    return String(b.source?.extractedAt ?? "").localeCompare(String(a.source?.extractedAt ?? ""));
  });
  return out;
}
function usageMdOf(brand, seed) {
  const accent = brand.colors?.find((c) => c.role === "accent")?.hex ?? seed.colorPrimary ?? "";
  const display = brand.typography?.display?.family ?? "";
  const body = brand.typography?.body?.family ?? "";
  return [
    `# ${brand.name} Usage`,
    "",
    "The customer's own brand as a design-system package, extracted by Tracy's brand engine.",
    "",
    "## Read Order",
    "",
    "1. Read this file first to understand the package contract.",
    "2. Read `DESIGN.md` for visual intent, constraints, and anti-patterns.",
    "3. Take every colour, font, size and space from `tokens.css` (the 56 tokens every Tracy system shares).",
    "4. Use `components.manifest.json` for the compact component inventory; open `components.html` when exact selectors or states matter.",
    "5. `system/artifacts/*.html` are sample products in this brand; `logos/`, `fonts/`, `imagery/` are the harvested assets.",
    "",
    "## Design Highlights",
    "",
    `- Brand: ${brand.name}${brand.description ? ` \u2014 ${brand.description}` : ""}`,
    `- Primary: \`${accent}\` \u2014 the accent of the harvested site.`,
    `- Type: ${display || "system"} for display${body ? `, ${body} for body` : ""}.`,
    "",
    "## Do",
    "",
    "- Keep the palette and type to the tokens; a colour or font outside them is not this brand.",
    "- Reuse the components of `components.html` before inventing parallel ones.",
    "",
    "## Avoid",
    "",
    "- Avoid raw hex values outside the copied `:root` token block.",
    "- Avoid other brands' logos, taglines or imagery: these files hold the customer's own.",
    ""
  ].join("\n");
}
var COMPONENT_GROUPS = [
  ["buttons", "Buttons and calls to action", /\b(btn|button|cta)\b/i, ["button"], /role="button"|<button\b/i],
  [
    "inputs",
    "Form fields and controls",
    /\b(field|input|select|textarea|checkbox|radio|control)\b/i,
    ["input", "select", "textarea", "label"],
    /<(input|select|textarea)\b/i
  ],
  ["cards", "Cards and panels", /\b(card|panel|tile)\b/i, [], null],
  ["badges", "Badges, tags and chips", /\b(badge|tag|chip|pill)\b/i, [], null],
  [
    "navigation",
    "Navigation and headers",
    /\b(nav|header|menu|topbar|brand)\b/i,
    ["nav", "header"],
    /<(nav|header)\b/i
  ],
  ["hero", "Hero and lead sections", /\b(hero|lead|masthead)\b/i, [], null],
  ["tables", "Tables and lists", /\b(table|row|list)\b/i, ["table", "ul", "ol"], /<table\b/i],
  ["footer", "Footer", /\b(footer)\b/i, ["footer"], /<footer\b/i],
  [
    "feedback",
    "Alerts, notices and status",
    /\b(alert|notice|toast|status|banner)\b/i,
    [],
    /role="alert"|role="status"/i
  ]
];
function componentsManifestOf(brandId, kitHtml, tokensCss) {
  const styles = [...kitHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const css = styles.join("\n");
  const selectors = [
    ...new Set(
      [...css.matchAll(/(?:^|[}\s])([^{}@/]+?)\s*\{/g)].flatMap((m) => m[1].split(",").map((x) => x.trim())).filter((x) => x && !x.startsWith("@"))
    )
  ].sort();
  const classes = [
    ...new Set([...kitHtml.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean))
  ].sort();
  const elements = [
    ...new Set(
      [...kitHtml.matchAll(/<([a-z][a-z0-9-]*)\b/g)].map((m) => m[1]).filter((t) => !["html", "head", "body", "style", "script", "meta", "link", "title"].includes(t))
    )
  ].sort();
  const declared = [
    ...new Set(
      [...tokensCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])
    )
  ].sort();
  const title = /<title>([^<]*)<\/title>/i.exec(kitHtml)?.[1]?.trim() ?? "";
  const groups = COMPONENT_GROUPS.map(([id, label, re, tags, markup]) => {
    const groupSelectors = selectors.filter(
      (sel) => re.test(sel) || tags.some((t) => new RegExp(`(^|[\\s>+~])${t}(?![a-z0-9-])`).test(sel))
    );
    const groupClasses = classes.filter((c) => re.test(c));
    const groupElements = elements.filter((e) => tags.includes(e));
    const inMarkup = markup !== null && markup.test(kitHtml);
    const refs = [
      ...new Set(
        groupSelectors.flatMap((sel) => {
          const i = css.indexOf(sel);
          if (i < 0) return [];
          const block = css.slice(i, css.indexOf("}", i));
          return [...block.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]);
        })
      )
    ].sort();
    return {
      id,
      label,
      present: inMarkup || groupSelectors.length > 0 || groupClasses.length > 0 || groupElements.length > 0,
      selectors: groupSelectors,
      classes: groupClasses,
      elements: groupElements,
      tokenReferences: refs
    };
  });
  return {
    schemaVersion: 1,
    brandId,
    source: { componentsHtml: "components.html", tokensCss: "tokens.css" },
    fixture: {
      title,
      description: "Component kit generated by the brand engine from the harvested brand.",
      styleBlockCount: styles.length,
      selectorCount: selectors.length,
      classCount: classes.length,
      elementCount: elements.length
    },
    tokens: { declared },
    selectors,
    classes,
    elements,
    groups
  };
}

// ../../tools/tracy-subprocess-docker/src/route.mjs
var LABEL = /^[a-z0-9][a-z0-9-]{0,62}$/;
var EXEC_USER = Object.freeze({
  "danger-full-access": "www-data",
  "workspace-write": "www-data",
  "read-only": "nobody"
});
function trimRoot(root) {
  const trimmed = root.replace(/\/+$/, "");
  if (trimmed === "") throw new Error("subprocess-docker: sitesRoot must not be the filesystem root");
  return trimmed;
}
function resolveSitesRoot(config, env = process.env) {
  const root = config?.sitesRoot ?? env.TRACY_SITES_ROOT ?? "/site";
  if (typeof root !== "string" || root.trim() === "" || !root.startsWith("/")) {
    throw new Error(`subprocess-docker: sitesRoot must be an absolute path, got ${JSON.stringify(root)}`);
  }
  return root;
}
function siteOf(cwd, sitesRoot) {
  const root = trimRoot(sitesRoot);
  if (!cwd.startsWith(`${root}/`)) {
    throw new Error(
      `subprocess-docker: cwd ${JSON.stringify(cwd)} is outside ${root} \u2014 nothing runs on the harness host`
    );
  }
  const rest = cwd.slice(root.length + 1);
  const segments = rest.split("/");
  const label = segments[0];
  if (!LABEL.test(label)) throw new Error(`subprocess-docker: ${JSON.stringify(label)} is not a site label`);
  if (segments.includes("..")) {
    throw new Error(
      `subprocess-docker: cwd ${JSON.stringify(cwd)} is not a site path \u2014 a ".." segment leaves the site folder`
    );
  }
  return { label, relative: rest.slice(label.length).replace(/^\/+/, "") };
}
var RG_HARNESS_FLAGS = Object.freeze([
  "--no-config",
  "--json",
  "--files",
  "--hidden",
  "--no-ignore",
  "--sort=modified"
]);
var RG_HARNESS_VALUE_FLAGS = Object.freeze(["--regexp=", "--glob="]);
var BLANKED_SECRET_ENV = Object.freeze([
  "JOOMLA_ADMIN_PASSWORD",
  "JOOMLA_DB_PASSWORD",
  "EMDASH_ENCRYPTION_KEY",
  "TRACY_MAIL_TOKEN"
]);
var READ_ONLY_BLANKED_ENV = Object.freeze(["WORDPRESS_DB_PASSWORD"]);
var FS_TOOL_ARGS = Object.freeze({
  read: { paths: ["file_path"], content: [] },
  read_image: { paths: ["file_path"], content: [] },
  // `sandbox_permissions` and `justification` are the escalation fields `FsSandboxController`
  // spreads into both mutations — a mode name and a sentence for the user, never a path.
  write: { paths: ["file_path"], content: ["content", "sandbox_permissions", "justification"] },
  edit: {
    paths: ["file_path"],
    content: ["old_string", "new_string", "sandbox_permissions", "justification"]
  },
  str_replace_editor: {
    paths: ["path"],
    // `insert_line` and `view_range` are numbers whose DESCRIPTIONS talk about paths; naming them
    // here is what keeps `test/fs-tool-schemas.test.mjs` from reading them as unfenced paths.
    content: ["file_text", "new_str", "old_str", "insert_line", "view_range"]
  },
  // `pattern` IS a path pattern for glob (`src/**/*.ts`), and a REGEX for grep (`/etc/` is a
  // legitimate expression, not a directory) — so it is a path in one and content in the other.
  glob: { paths: ["path", "pattern"], content: [] },
  grep: { paths: ["path"], content: ["pattern", "include"] },
  // Also covered by `workdirDecision`, deliberately. That one compares site LABELS with no I/O;
  // this one resolves symlinks. A `/site/wpdemo/link-to-elsewhere` passes the first and fails here.
  bash: { paths: ["workdir"], content: ["command", "description"] },
  // `pwsh` was in NEITHER table until the schema test found it (06/09). It is a composed row in the
  // fleet profile, it takes the same model-chosen `workdir` as `bash`, and whether its shell exists
  // in the container is not a boundary — the fence must not depend on a binary being missing.
  pwsh: { paths: ["workdir"], content: ["command", "description"] },
  terminal_open: { paths: ["cwd"], content: [] }
});
var URL_PATH_ARGS = Object.freeze({
  tracy_design_check: Object.freeze(["path"])
});
function siteRootOf(sessionCwd, sitesRoot) {
  const { label } = siteOf(sessionCwd, sitesRoot);
  return `${trimRoot(sitesRoot)}/${label}`;
}
var WORKDIR_ARG = Object.freeze({ bash: "workdir", pwsh: "workdir", terminal_open: "cwd" });

// src/host/index.ts
var name = "tracy-brand-engine";
var inject = ["webServer", "tools"];
var PREFIX = "/api/tracy-brand-engine";
var MAX_BODY = 4 * 1024;
var MATERIAL_CAP = 16 * 1024;
var RECON_CAP = 8 * 1024;
var PAGES_CAP = 40;
var FRESH_MS = 24 * 60 * 60 * 1e3;
var START_FROM_FILE = path5.join("docs", "agents", "start-from.json");
var jobs = /* @__PURE__ */ new Map();
var jobKey = (config, host) => `${siteDirOf(config)}
${host}`;
var DEEP_SIDE_DIR = ".brand-deep";
async function swapOver(from, to) {
  await fs4.mkdir(to, { recursive: true });
  const incoming = await fs4.readdir(from, { withFileTypes: true });
  for (const entry of incoming) {
    const src = path5.join(from, entry.name);
    const dst = path5.join(to, entry.name);
    const dstIsDir = await fs4.stat(dst).then((st) => st.isDirectory()).catch(() => false);
    if (entry.isDirectory() && dstIsDir) {
      await swapOver(src, dst);
      continue;
    }
    if (dstIsDir || entry.isDirectory()) await fs4.rm(dst, { recursive: true, force: true });
    await fs4.rename(src, dst);
  }
  const kept = new Set(incoming.map((e) => e.name));
  for (const stale of await fs4.readdir(to)) {
    if (!kept.has(stale)) await fs4.rm(path5.join(to, stale), { recursive: true, force: true });
  }
  await fs4.rm(from, { recursive: true, force: true }).catch(() => void 0);
}
var REUSE_MS = 30 * 24 * 60 * 60 * 1e3;
var LOCK_DIR = ".locks";
var LOCK_STALE_MS = EXTRACT_TIMEOUT_MS + RECON_TIMEOUT_MS + 3e4;
var siteKey;
function laneSiteKey() {
  if (siteKey !== void 0) return siteKey;
  siteKey = process.env.MCP_TRACY_SITE_KEY?.trim() || null;
  if (siteKey === null) {
    const file = process.env.DSH_PASSWORDS_ENV_FILE?.trim();
    if (file) {
      try {
        const m = /^MCP_TRACY_SITE_KEY=(.+)$/m.exec(readFileSync(file, "utf8"));
        siteKey = m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
      } catch {
        siteKey = null;
      }
    }
  }
  return siteKey;
}
var siteDirOf = (config) => config.siteDir ?? path5.resolve(".");
function scopedTo(config, place) {
  if (config.siteDir !== void 0 || typeof place !== "string" || place === "") return config;
  const root = resolveSitesRoot(void 0);
  if (place !== root && !place.startsWith(`${root}/`)) return { ...config, siteDir: place };
  try {
    return { ...config, siteDir: siteRootOf(place, root) };
  } catch {
    return null;
  }
}
function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > MAX_BODY) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}
function publicJob(j) {
  const out = {
    host: j.host,
    kind: j.kind,
    state: j.state,
    startedAt: j.startedAt,
    steps: j.steps
  };
  if (j.endedAt !== void 0) out.endedAt = j.endedAt;
  if (j.manifest !== void 0) out.manifest = j.manifest;
  if (j.error !== void 0) out.error = j.error;
  if (j.phase !== void 0) out.phase = j.phase;
  if (j.deepError !== void 0) out.deepError = j.deepError;
  return out;
}
function startJob(config, input, host, requested, pages = false, deep = false, beforeDone) {
  const running = jobs.get(jobKey(config, host));
  if (running && running.state === "running") return running;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    pages || deep ? EXTRACT_TIMEOUT_MS + RECON_TIMEOUT_MS : EXTRACT_TIMEOUT_MS
  );
  const job = {
    host,
    kind: kindOf(host, laneSiteKey(), requested),
    state: "running",
    startedAt: Date.now(),
    steps: [],
    controller,
    done: Promise.resolve()
  };
  const lock = takeLock(config, host).catch(() => void 0);
  const settle = () => lock.then(() => releaseLock(config, host));
  job.done = extractBrand({
    input,
    siteDir: siteDirOf(config),
    siteKey: laneSiteKey(),
    kind: requested,
    pages,
    fetch: config.fetch,
    enrich: config.enrich,
    reconScriptsDir: config.reconScriptsDir,
    signal: controller.signal,
    onProgress: (step, detail) => {
      const s = { step, at: Date.now() };
      if (detail !== void 0) s.detail = String(detail).slice(0, 200);
      job.steps.push(s);
    }
  }).then(async (r) => {
    if (!r.ok) {
      await settle();
      job.state = "failed";
      job.error = { code: r.code, error: r.error };
      return r;
    }
    job.manifest = r.manifest;
    job.kind = r.manifest.kind;
    if (!deep) {
      if (beforeDone) await beforeDone();
      await settle();
      job.state = "done";
      return r;
    }
    job.phase = "quick";
    const sideSiteDir = path5.join(siteDirOf(config), DEEP_SIDE_DIR);
    const deepResult = await extractBrand({
      input,
      siteDir: sideSiteDir,
      siteKey: laneSiteKey(),
      kind: requested,
      pages: true,
      fetch: config.fetch,
      enrich: config.enrich,
      reconScriptsDir: config.reconScriptsDir,
      signal: controller.signal,
      onProgress: (step, detail) => {
        const s = { step: `deep:${step}`, at: Date.now() };
        if (detail !== void 0) s.detail = String(detail).slice(0, 200);
        job.steps.push(s);
      }
    }).catch((error) => ({
      ok: false,
      code: "EXTRACT_FAILED",
      error: error instanceof Error ? error.message : String(error)
    }));
    if (deepResult.ok) {
      await swapOver(path5.join(sideSiteDir, BRAND_DIR, host), path5.join(siteDirOf(config), BRAND_DIR, host));
      job.manifest = deepResult.manifest;
    } else {
      job.deepError = { code: deepResult.code, error: deepResult.error };
    }
    await fs4.rm(sideSiteDir, { recursive: true, force: true }).catch(() => void 0);
    job.phase = "full";
    if (beforeDone) await beforeDone();
    await settle();
    job.state = "done";
    return deepResult.ok ? deepResult : r;
  }).catch(async (error) => {
    await settle();
    job.state = "failed";
    job.error = { code: "EXTRACT_FAILED", error: error instanceof Error ? error.message : String(error) };
    return { ok: false, ...job.error };
  }).finally(() => {
    clearTimeout(timer);
    job.endedAt = Date.now();
  });
  jobs.set(jobKey(config, host), job);
  return job;
}
var LOGO_FILE = /^[a-z0-9][a-z0-9._-]{0,120}\.(png|svg|ico|jpe?g|webp|gif|avif)$/i;
var IMAGE_DIRS = /* @__PURE__ */ new Set(["logos", "imagery"]);
var LOGO_TYPES = {
  png: "image/png",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif"
};
function brandSummary(brand) {
  const b = brand && typeof brand === "object" ? brand : null;
  if (!b) return null;
  const logo = (b.logo && typeof b.logo === "object" ? b.logo : {}).primary;
  const typo = b.typography && typeof b.typography === "object" ? b.typography : {};
  const samples = (b.imagery && typeof b.imagery === "object" ? b.imagery : {}).samples;
  return {
    name: typeof b.name === "string" ? b.name : "",
    tagline: typeof b.tagline === "string" ? b.tagline : "",
    logo: typeof logo === "string" ? logo : null,
    imagery: Array.isArray(samples) ? samples.map((x) => x && typeof x === "object" ? x.file : null).filter((f) => typeof f === "string") : [],
    colors: Array.isArray(b.colors) ? b.colors.filter((c) => c && typeof c === "object").map((c) => ({
      role: String(c.role ?? ""),
      hex: String(c.hex ?? "")
    })) : [],
    display: typeof typo.display?.family === "string" ? typo.display.family : null,
    body: typeof typo.body?.family === "string" ? typo.body.family : null
  };
}
async function writeStartFrom(config, url, host) {
  const file = path5.join(siteDirOf(config), START_FROM_FILE);
  await fs4.mkdir(path5.dirname(file), { recursive: true });
  const record = {
    schemaVersion: "tracy-start-from/v1",
    url,
    host,
    id: `brand:${host}`,
    mode: "rewrite",
    at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await fs4.writeFile(file, `${JSON.stringify(record, null, 2)}
`);
}
async function freshFork(config, host) {
  const raw = await brandText(config, host, "manifest.json");
  if (raw === null) return null;
  try {
    const m = JSON.parse(raw);
    const at = typeof m.source?.extractedAt === "string" ? Date.parse(m.source.extractedAt) : NaN;
    if (m.source?.pages !== true || !Number.isFinite(at) || Date.now() - at > FRESH_MS) return null;
    return m;
  } catch {
    return null;
  }
}
async function pagesOf(config, host) {
  const raw = await brandText(config, host, path5.join(PAGES_DIR, "pages.json"));
  if (raw === null) return null;
  try {
    const rows = JSON.parse(raw).pages;
    if (!Array.isArray(rows)) return null;
    return rows.slice(0, PAGES_CAP).map((r) => {
      const p = r ?? {};
      return {
        url: String(p.url ?? ""),
        title: String(p.title ?? ""),
        h1: String(p.h1 ?? ""),
        file: String(p.file ?? "")
      };
    });
  } catch {
    return null;
  }
}
async function brandText(config, host, file) {
  try {
    return await fs4.readFile(path5.join(siteDirOf(config), BRAND_DIR, host, file), "utf8");
  } catch {
    return null;
  }
}
async function manifestOnDisk(config, host) {
  const raw = await brandText(config, host, "manifest.json");
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
function reusable(manifest, wantPages, now = Date.now()) {
  const at = manifest?.source?.extractedAt;
  if (typeof at !== "string") return false;
  const stamp = Date.parse(at);
  if (!Number.isFinite(stamp) || now - stamp > REUSE_MS || stamp > now + 6e4) return false;
  return !wantPages || manifest?.source?.pages === true;
}
function jobFromDisk(host, manifest, reused) {
  const at = Date.parse(String(manifest.source?.extractedAt ?? "")) || Date.now();
  return {
    host,
    kind: manifest.kind === "own" ? "own" : "reference",
    state: "done",
    phase: "full",
    startedAt: at,
    endedAt: at,
    steps: [{ step: reused ? "reused" : "on-disk", detail: String(manifest.source?.extractedAt ?? ""), at }],
    // Whether this measurement still answers for the site, decided HERE so the caller does not
    // carry a second copy of the thirty days. `cowork-web` reads it to skip a human check nobody
    // needs when there is nothing to run.
    fresh: reusable(manifest, false),
    manifest
  };
}
var lockFile = (config, host) => path5.join(siteDirOf(config), BRAND_DIR, LOCK_DIR, host);
async function lockedElsewhere(config, host) {
  try {
    const stat = await fs4.stat(lockFile(config, host));
    return Date.now() - stat.mtimeMs < LOCK_STALE_MS;
  } catch {
    return false;
  }
}
async function takeLock(config, host) {
  const file = lockFile(config, host);
  await fs4.mkdir(path5.dirname(file), { recursive: true });
  await fs4.writeFile(file, `${process.pid} ${(/* @__PURE__ */ new Date()).toISOString()}
`);
}
async function releaseLock(config, host) {
  await fs4.rm(lockFile(config, host), { force: true }).catch(() => void 0);
}
var DESCRIPTION = 'The customer\'s brand as their live site shows it \u2014 colours, fonts, logo, tagline, sample images \u2014 or any public site\'s, as a design template of its own: `brand:<host>`. action="read" (url default: this site) \u2192 {manifest, brand, material}; NOT_EXTRACTED \u2192 extract it first. action="extract" measures it (4\u201310 s); one measured in the last 30 days comes back as it stands, `reused: true`, unless refresh. pages:true also crawls its pages ("Fork a site"): write the customer\'s own pages from that list, never the source\'s words. action="list" \u2192 every extracted brand. Refusals: BAD_URL (not a public site), NO_MATERIAL (could not be fetched from here: say so, offer to look in the browser). How it feeds a redesign: the tracy-design-inspiration skill.';
function apply(ctx, bundleConfig = {}) {
  const route = {
    kind: "prefix",
    path: PREFIX,
    handler: (req, res) => {
      const scoped = { ...bundleConfig, siteDir: siteDirFor(bundleConfig, req) };
      const pathname = (req.url ?? "").split("?")[0] ?? "";
      const rest = pathname.slice(PREFIX.length).replace(/^\/+/, "").replace(/\/+$/, "");
      const parts = rest.split("/").map((p) => decodeURIComponent(p));
      const method = req.method ?? "GET";
      if (method === "POST" && rest === "extract") {
        void readJson(req).then(async (body) => {
          const b = body && typeof body === "object" ? body : {};
          const key = laneSiteKey();
          const input = typeof b.url === "string" && b.url.trim() ? b.url.trim() : key ? `https://${key}/` : "";
          const host = brandHostOf(input);
          if (host === null) {
            writeJson(res, 400, { ok: false, code: "BAD_URL", error: "url must name a public http(s) site" });
            return;
          }
          const deep = b.deep === true;
          const running = jobs.get(jobKey(scoped, host));
          if (b.refresh !== true && !(running && running.state === "running")) {
            const manifest = await manifestOnDisk(scoped, host);
            if (reusable(manifest, deep)) {
              writeJson(res, 200, { ok: true, reused: true, ...jobFromDisk(host, manifest, true) });
              return;
            }
          }
          if (!(running && running.state === "running") && await lockedElsewhere(scoped, host)) {
            writeJson(res, 202, {
              ok: true,
              host,
              kind: kindOf(host, laneSiteKey(), b.kind === "own" ? "own" : void 0),
              state: "running",
              startedAt: Date.now(),
              steps: [{ step: "waiting-for-writer", at: Date.now() }]
            });
            return;
          }
          const requested = b.kind === "own" || b.kind === "reference" ? b.kind : void 0;
          const job = startJob(scoped, input, host, requested, false, deep);
          writeJson(res, 202, { ok: true, ...publicJob(job) });
        });
        return;
      }
      if (method === "POST" && rest === "start-from") {
        void readJson(req).then(async (body) => {
          const b = body && typeof body === "object" ? body : {};
          const input = typeof b.url === "string" ? b.url.trim() : "";
          const host = brandHostOf(input);
          const url = urlOf(input);
          if (host === null || url === null) {
            writeJson(res, 400, { ok: false, code: "BAD_URL", error: "url must name a public http(s) site" });
            return;
          }
          const running = jobs.get(jobKey(scoped, host));
          if (!running || running.state !== "running") {
            const fresh = await freshFork(scoped, host);
            if (fresh) {
              await writeStartFrom(scoped, url, host);
              writeJson(res, 200, { ok: true, reused: true, host, kind: "reference", manifest: fresh });
              return;
            }
          }
          const job = startJob(
            scoped,
            input,
            host,
            "reference",
            true,
            false,
            () => writeStartFrom(scoped, url, host)
          );
          writeJson(res, 202, { ok: true, ...publicJob(job) });
        });
        return;
      }
      if (method === "GET" && rest === "jobs") {
        const all = [...jobs.entries()].filter(([key]) => key.startsWith(`${siteDirOf(scoped)}
`)).map(([, job]) => job).sort((a, b) => b.startedAt - a.startedAt).map(publicJob);
        writeJson(res, 200, { ok: true, jobs: all });
        return;
      }
      if (method === "GET" && parts.length === 2 && parts[0] === "extract") {
        const host = brandHostOf(parts[1] ?? "");
        const job = host ? jobs.get(jobKey(scoped, host)) : void 0;
        if (job) {
          writeJson(res, 200, { ok: true, ...publicJob(job) });
          return;
        }
        void (async () => {
          const manifest = host === null ? null : await manifestOnDisk(scoped, host);
          if (manifest === null) {
            writeJson(res, 404, { ok: false, code: "NO_JOB" });
            return;
          }
          writeJson(res, 200, { ok: true, ...jobFromDisk(host, manifest, false) });
        })();
        return;
      }
      if (method === "GET" && rest === "brands") {
        void listBrands(siteDirOf(scoped)).then(async (brands) => {
          const out = [];
          for (const m of brands) {
            const raw = await brandText(scoped, m.host, "brand.json");
            let brand = null;
            try {
              brand = raw === null ? null : brandSummary(JSON.parse(raw));
            } catch {
              brand = null;
            }
            out.push({ ...m, brand });
          }
          writeJson(res, 200, { ok: true, brands: out });
        });
        return;
      }
      if (method === "GET" && parts.length === 4 && parts[0] === "brands" && IMAGE_DIRS.has(parts[2] ?? "")) {
        const host = brandHostOf(parts[1] ?? "");
        const file = parts[3] ?? "";
        if (host === null || !LOGO_FILE.test(file)) {
          writeJson(res, 404, { ok: false, code: "NO_SUCH_FILE" });
          return;
        }
        const full = path5.join(siteDirOf(scoped), BRAND_DIR, host, parts[2], file);
        void fs4.stat(full).then((stat) => {
          res.writeHead(200, {
            "content-type": LOGO_TYPES[file.split(".").pop().toLowerCase()] ?? "application/octet-stream",
            "content-length": String(stat.size),
            "cache-control": "no-store"
          });
          createReadStream(full).pipe(res);
        }).catch(() => writeJson(res, 404, { ok: false, code: "NO_SUCH_FILE" }));
        return;
      }
      if (method === "DELETE" && parts.length === 2 && parts[0] === "brands") {
        const host = brandHostOf(parts[1] ?? "");
        if (host === null) {
          writeJson(res, 400, { ok: false, code: "BAD_URL" });
          return;
        }
        const running = jobs.get(jobKey(scoped, host));
        if (running && running.state === "running") running.controller.abort();
        jobs.delete(jobKey(scoped, host));
        void fs4.rm(path5.join(siteDirOf(scoped), BRAND_DIR, host), { recursive: true, force: true }).then(() => writeJson(res, 200, { ok: true, host })).catch(() => writeJson(res, 500, { ok: false, code: "NOT_REMOVED" }));
        return;
      }
      writeJson(res, 404, { code: "UNKNOWN_ROUTE" });
    }
  };
  ctx.effect(() => {
    const dispose = ctx.webServer.register(route);
    return () => dispose();
  }, "tracy-brand-engine: routes");
  ctx.effect(
    () => ctx.tools.register({
      name: "tracy_brand",
      description: DESCRIPTION,
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["read", "extract", "list"] },
          url: { type: "string", description: "A URL or a bare host; omit for this site." },
          kind: {
            type: "string",
            enum: ["own", "reference"],
            description: "extract: force the label (default: own for this site, reference otherwise)."
          },
          pages: { type: "boolean", description: "extract: also crawl up to 20 pages." },
          refresh: {
            type: "boolean",
            description: "extract: measure again even if measured in the last 30 days."
          }
        },
        required: ["action"]
      },
      output: {
        schema: {},
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
      },
      async execute(args, exec) {
        const config = scopedTo(bundleConfig, exec?.agent?.session?.header?.cwd);
        if (config === null)
          return { ok: false, code: "NO_SITE", error: "This conversation is not in a site's workspace." };
        const a = args && typeof args === "object" ? args : {};
        const action = typeof a.action === "string" ? a.action : "";
        const key = laneSiteKey();
        if (action === "list") return { ok: true, brands: await listBrands(siteDirOf(config)) };
        const input = typeof a.url === "string" && a.url.trim() ? a.url.trim() : key ? `https://${key}/` : "";
        const host = brandHostOf(input);
        if (host === null) {
          return {
            ok: false,
            code: input ? "BAD_URL" : "NO_SITE",
            error: input ? `Not a public http(s) site: ${input.slice(0, 120)}` : "This lane serves no site (MCP_TRACY_SITE_KEY is unset); pass a url."
          };
        }
        if (action === "extract") {
          const requested = a.kind === "own" || a.kind === "reference" ? a.kind : void 0;
          const wantPages = a.pages === true;
          if (a.refresh !== true) {
            const onDisk = await manifestOnDisk(config, host);
            if (reusable(onDisk, wantPages)) return { ok: true, reused: true, manifest: onDisk };
          }
          const job = startJob(config, input, host, requested, wantPages);
          const r = await job.done;
          return r.ok ? { ok: true, manifest: job.manifest } : { ok: false, ...job.error };
        }
        if (action === "read") {
          const [manifest, brand, material] = await Promise.all([
            brandText(config, host, "manifest.json"),
            brandText(config, host, "brand.json"),
            brandText(config, host, path5.join("prefetch", "material.md"))
          ]);
          if (manifest === null || brand === null) {
            return {
              ok: false,
              code: "NOT_EXTRACTED",
              error: `No brand extracted for ${host} yet; call action='extract' first.`
            };
          }
          const md = material ?? "";
          const pages = await pagesOf(config, host);
          const recon = await brandText(config, host, path5.join(RECON_DIR, "RECON", "original-summary.md"));
          return {
            ok: true,
            manifest: JSON.parse(manifest),
            brand: JSON.parse(brand),
            material: md.length > MATERIAL_CAP ? `${md.slice(0, MATERIAL_CAP)}

\u2026 (${md.length - MATERIAL_CAP} more characters in Brand/${host}/prefetch/material.md)` : md,
            ...pages === null ? {} : { pages },
            ...recon === null ? {} : { recon: recon.length > RECON_CAP ? `${recon.slice(0, RECON_CAP)}
\u2026` : recon }
          };
        }
        return { ok: false, code: "BAD_ACTION", error: "action must be 'read', 'extract' or 'list'." };
      }
    }),
    "tracy-brand-engine: tracy_brand"
  );
}
export {
  apply,
  inject,
  name,
  swapOver
};
