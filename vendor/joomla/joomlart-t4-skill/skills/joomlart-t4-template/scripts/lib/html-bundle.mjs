import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { JSDOM } from 'jsdom';

const FILENAME_VIEW = [
  [/index|home/, 'com_content.featured'],
  [/blog|category|news/, 'com_content.category.blog'],
  [/single|article|post|detail/, 'com_content.article'],
  [/login|signin/, 'com_users.login'],
  [/register|signup/, 'com_users.registration'],
  [/profile|account/, 'com_users.profile'],
  [/search/, 'com_finder.search'],
  [/tag/, 'com_tags.tag'],
  [/contact|reach/, 'com_contact.contact'],
  [/404|error/, 'error'],
  [/offline|maintenance/, 'offline'],
];

export function inferView(filename, html) {
  const doc = new JSDOM(html).window.document;
  if (doc.querySelector('input[type="password"]')) return 'com_users.login';
  if (doc.querySelector('form') && doc.querySelector('textarea') &&
      doc.querySelector('input[name*="email" i], input[type="email"]')) return 'com_contact.contact';
  if (doc.querySelector('article')) return 'com_content.article';
  const lower = filename.toLowerCase();
  for (const [re, view] of FILENAME_VIEW) if (re.test(lower)) return view;
  return 'com_content.article';
}

// ── colour helpers ────────────────────────────────────────────────────────────

/**
 * Parse a CSS hex colour (#rgb, #rrggbb, #rgba, #rrggbbaa) into [r,g,b] 0–255.
 * Returns null on failure.
 */
function parseHex(hex) {
  const h = hex.trim().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length === 6 || h.length === 8) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

/**
 * Parse rgb(r,g,b) or rgba(r,g,b,a) into [r,g,b] 0–255.
 * Returns null on failure.
 */
function parseRgb(val) {
  const m = val.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}

/**
 * Relative luminance per WCAG 2 (sRGB linearise + Rec709 weights).
 * Returns a value 0–1 (0 = black, 1 = white), or null if colour unparseable.
 */
function relativeLuminance(colorStr) {
  let rgb = null;
  const trimmed = colorStr.trim();
  if (trimmed.startsWith('#')) rgb = parseHex(trimmed);
  else if (/^rgba?/i.test(trimmed)) rgb = parseRgb(trimmed);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(c => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ── CSS parsing helpers ───────────────────────────────────────────────────────

/**
 * Extract all CSS custom properties defined inside :root { ... } blocks.
 * Returns a Map of varName → raw value string (trimmed, without semicolon).
 */
function extractRootVars(cssText) {
  const vars = new Map();
  // Match all :root { ... } blocks (non-greedy, handles multiple blocks)
  const rootBlockRe = /:root\s*\{([^}]*)\}/g;
  let block;
  while ((block = rootBlockRe.exec(cssText)) !== null) {
    const body = block[1];
    const propRe = /(--[\w-]+)\s*:\s*([^;}\n]+)/g;
    let prop;
    while ((prop = propRe.exec(body)) !== null) {
      vars.set(prop[1].trim(), prop[2].trim());
    }
  }
  return vars;
}

/**
 * Resolve a CSS value one level deep: if it's `var(--x)` look it up in vars.
 */
function resolveVar(value, vars) {
  const m = value && value.match(/^var\((--[\w-]+)\)/);
  if (m) return vars.get(m[1]) ?? value;
  return value;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract palette and mode from CSS text.
 *
 * @param {string} cssText
 * @returns {{ vars: Map<string,string>, palette: object, mode: string }}
 *   vars     — all :root custom properties
 *   palette  — { primary, secondary, body_bg, text } (each null if unmapped)
 *   mode     — 'dark-primary' | 'light-primary'
 */
export function extractPaletteFromCss(cssText) {
  const vars = extractRootVars(cssText);

  // Ordered candidate lists — first match wins
  const SLOT_CANDIDATES = {
    primary:   ['--accent', '--primary', '--brand', '--color-primary'],
    secondary: ['--accent-2', '--secondary', '--text-secondary', '--muted'],
    body_bg:   ['--bg-primary', '--background', '--bg', '--body-bg', '--bg-body'],
    text:      ['--text-primary', '--text', '--foreground', '--color-text', '--body-color'],
  };

  const palette = {};
  for (const [slot, candidates] of Object.entries(SLOT_CANDIDATES)) {
    palette[slot] = null;
    for (const candidate of candidates) {
      if (vars.has(candidate)) {
        palette[slot] = resolveVar(vars.get(candidate), vars);
        break;
      }
    }
  }

  // Determine mode from body_bg luminance
  const lum = palette.body_bg ? relativeLuminance(palette.body_bg) : null;
  const mode = (lum !== null && lum < 0.5) ? 'dark-primary' : 'light-primary';

  return { vars, palette, mode };
}

/**
 * Extract font families from CSS.
 * Prefers --font-body/--font-display/--font-heading vars; falls back to
 * `font-family` declarations on `body {}` and `h1,h2 {}` rules.
 *
 * @param {string} cssText
 * @returns {{ body: string|null, heading: string|null }}
 */
export function extractFonts(cssText) {
  const vars = extractRootVars(cssText);

  function firstFamilyName(val) {
    if (!val) return null;
    // Strip surrounding quotes and take first comma-separated family
    return val.split(',')[0].trim().replace(/^['"]|['"]$/g, '').trim() || null;
  }

  // 1. Prefer CSS variables
  let body = null;
  let heading = null;

  if (vars.has('--font-body')) body = firstFamilyName(resolveVar(vars.get('--font-body'), vars));
  if (vars.has('--font-display')) heading = firstFamilyName(resolveVar(vars.get('--font-display'), vars));
  if (!heading && vars.has('--font-heading')) heading = firstFamilyName(resolveVar(vars.get('--font-heading'), vars));

  // 2. Fallback: parse font-family from body { } and h1/h2 { } rules
  if (!body || !heading) {
    // Match selector { ... font-family: ...; ... }
    const ruleRe = /([^{}]+)\{([^}]*)\}/g;
    let rule;
    while ((rule = ruleRe.exec(cssText)) !== null) {
      const selector = rule[1].trim();
      const decls = rule[2];
      const ffMatch = decls.match(/font-family\s*:\s*([^;}\n]+)/i);
      if (!ffMatch) continue;
      const ff = firstFamilyName(ffMatch[1].trim());
      if (!ff) continue;
      if (!body && /^body\s*$/.test(selector)) body = ff;
      if (!heading && /^(h1|h2)\b/.test(selector)) heading = ff;
    }
  }

  return { body: body ?? null, heading: heading ?? null };
}

/**
 * Sanitize a directory basename into a T4 machine-name suffix.
 * `2162_stackcraft` → `stackcraft`
 * `my-cool-template!` → `my-cool-template`
 */
function sanitizeName(dirBasename) {
  return dirBasename
    .toLowerCase()
    // strip leading digits, underscores, hyphens
    .replace(/^[\d_-]+/, '')
    // remove anything not alphanumeric or hyphen
    .replace(/[^a-z0-9-]/g, '')
    // collapse multiple hyphens
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Title-case a string (split on hyphens/underscores/spaces).
 */
function toTitleCase(str) {
  return str.replace(/[-_\s]+(.)/g, (_, c) => ' ' + c.toUpperCase())
    .replace(/^(.)/, c => c.toUpperCase());
}

/**
 * Derive a simple light palette from a dark one.
 * Intentionally minimal — documented as a placeholder.
 */
function deriveLightFromDark(darkPalette) {
  // Darken accent ~15% by mixing with black
  function darkenHex(hex, amount = 0.15) {
    const rgb = parseHex(hex);
    if (!rgb) return hex;
    const darkened = rgb.map(c => Math.round(c * (1 - amount)));
    return '#' + darkened.map(c => c.toString(16).padStart(2, '0')).join('');
  }
  return {
    primary:   darkPalette.primary ? darkenHex(darkPalette.primary) : null,
    secondary: darkPalette.secondary ?? null,
    body_bg:   '#faf8f3',
    text:      '#1c1a15',
  };
}

/**
 * Parse a raw (no-manifest) template directory and return the same shape as parseBundle.
 *
 * @param {string} dir  Path to the template directory (contains *.html + *.css)
 */
export async function parseRawTemplate(dir) {
  // 1. Find .html files (non-recursive), skip tiny stubs (<300 bytes)
  const entries = await readdir(dir);
  const htmlFiles = [];
  for (const entry of entries) {
    if (extname(entry).toLowerCase() !== '.html') continue;
    const filePath = join(dir, entry);
    const info = await stat(filePath);
    if (info.size < 300) continue; // skip timer/redirect stubs
    htmlFiles.push(entry);
  }

  // 2. Pick the primary/home HTML: prefer index.html, else largest
  let homeFile = htmlFiles.find(f => /^index\.html$/i.test(f));
  if (!homeFile && htmlFiles.length > 0) {
    let maxSize = -1;
    for (const f of htmlFiles) {
      const info = await stat(join(dir, f));
      if (info.size > maxSize) { maxSize = info.size; homeFile = f; }
    }
  }

  // 3. Find CSS files, pick the largest
  const cssFiles = [];
  for (const entry of entries) {
    if (extname(entry).toLowerCase() !== '.css') continue;
    cssFiles.push(entry);
  }
  let mainCssFile = null;
  if (cssFiles.length > 0) {
    let maxSize = -1;
    for (const f of cssFiles) {
      const info = await stat(join(dir, f));
      if (info.size > maxSize) { maxSize = info.size; mainCssFile = f; }
    }
  }

  // 4. Extract palette & fonts from main CSS
  const cssText = mainCssFile
    ? await readFile(join(dir, mainCssFile), 'utf8').catch(() => '')
    : '';
  const { palette, mode } = extractPaletteFromCss(cssText);
  const fonts = extractFonts(cssText);

  // 5. Build palette: always include both light and dark
  let lightPalette, darkPalette;
  if (mode === 'dark-primary') {
    darkPalette = palette;
    lightPalette = deriveLightFromDark(palette);
  } else {
    lightPalette = palette;
    darkPalette = null; // handed off to dark-mode skill
  }

  // 6. Build template.name from dir basename
  const dirBase = basename(dir);
  const safeSuffix = sanitizeName(dirBase);
  const templateName = 'ja_' + safeSuffix;
  const templateTitle = toTitleCase(safeSuffix);

  // 7. Build pages list
  const pages = [];
  for (const file of htmlFiles) {
    const html = await readFile(join(dir, file), 'utf8').catch(() => '');
    const isHome = file === homeFile;
    const view = isHome ? 'com_content.featured' : inferView(file, html);
    const entry = { file, view };
    if (isHome) entry.layout = 'home';
    pages.push(entry);
  }

  return {
    template: {
      name: templateName,
      title: templateTitle,
      bootstrap: 'bs5',
    },
    theme: {
      mode,
      palette: {
        dark: darkPalette,
        light: lightPalette,
      },
      fonts,
    },
    positions: ['menu', 'section-1', 'footer'],
    extends: [],
    pages,
  };
}

/**
 * Parse a bundle directory.
 * If `manifest.json` exists → read it (original behaviour).
 * Otherwise → auto-detect raw template and call parseRawTemplate.
 *
 * @param {string} dir
 * @param {{ single?: boolean }} [opts]
 */
export async function parseBundle(dir, opts = {}) {
  if (!opts.single) {
    try {
      const manifestRaw = await readFile(join(dir, 'manifest.json'), 'utf8');
      const manifest = JSON.parse(manifestRaw);
      const pages = [];
      for (const p of manifest.pages ?? []) {
        let view = p.view;
        if (!view) {
          const html = await readFile(join(dir, 'pages', p.file), 'utf8').catch(() => '');
          view = inferView(p.file, html);
        }
        pages.push({ ...p, view });
      }
      return {
        template: manifest.template,
        theme: manifest.theme,
        positions: manifest.positions ?? [],
        extends: manifest.extends ?? [],
        pages,
      };
    } catch (err) {
      // manifest.json not found → fall through to raw template mode
      if (err.code !== 'ENOENT') throw err;
    }
  }

  // Raw / no-manifest mode
  return parseRawTemplate(dir);
}
