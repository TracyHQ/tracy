#!/usr/bin/env node
/**
 * setup-demo-content.mjs
 *
 * Derives a declarative demo-content plan from a parsed page-map JSON
 * (the output of parse-html-bundle.mjs) and emits it in one of three formats.
 *
 * Does NOT touch any database.
 *
 * Usage:
 *   node scripts/setup-demo-content.mjs [--emit plan|sql|joomla-cli] <page-map.json|-|bundle-dir>
 *
 * Input:
 *   A file path to a page-map JSON, or "-" to read from stdin.
 *   If the argument is a directory it is treated as a bundle dir and parsed first.
 *
 * Flags:
 *   --emit plan        Pretty-print the plan object (default)
 *   --emit sql         Emit a commented INSERT SQL script
 *   --emit joomla-cli  Emit human-runnable admin/CLI guidance
 */

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// ─── view → menu item type mapping ────────────────────────────────────────────

const VIEW_TO_MENU_TYPE = {
  'com_content.featured':      'com_content.featured',
  'com_content.category.blog': 'com_content.category.blog',
  'com_content.article':       'com_content.article',
  'com_contact.contact':       'com_contact.contact',
  'com_users.login':           'com_users.login',
  'com_users.registration':    'com_users.registration',
  'com_users.profile':         'com_users.profile',
  'com_finder.search':         'com_finder.search',
  'com_tags.tag':              'com_tags.tag',
  // error / offline → no menu item (omit from mapping)
};

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Convert a string to a URL-safe alias. */
function toAlias(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Derive a human-readable title from a view string. */
function viewToTitle(view) {
  const map = {
    'com_content.featured':      'Home',
    'com_content.category.blog': 'Blog',
    'com_content.article':       'Article',
    'com_contact.contact':       'Contact',
    'com_users.login':           'Login',
    'com_users.registration':    'Register',
    'com_users.profile':         'Profile',
    'com_finder.search':         'Search',
    'com_tags.tag':              'Tags',
  };
  return map[view] ?? view.split('.').pop();
}

/** Derive a plausible title from an HTML page filename (without extension). */
function fileToTitle(file) {
  const base = file.replace(/\.html?$/i, '');
  return base.charAt(0).toUpperCase() + base.slice(1).replace(/[-_]/g, ' ');
}

// ─── core: buildPlan ──────────────────────────────────────────────────────────

/**
 * Derive a declarative demo-content plan from a parsed page-map.
 *
 * @param {object} pageMap  - output of parseBundle() / parse-html-bundle.mjs
 * @returns {object} plan
 */
export function buildPlan(pageMap) {
  const { template, positions = [], pages = [] } = pageMap;
  const templateName = template?.name ?? 'ja_template';

  // ── categories ──────────────────────────────────────────────────────────────
  // Derive one category for every blog/category page, plus a "General" fallback
  // for article pages when no blog page exists.  Never create a "Home" category.
  const categories = [];
  const categoryRefByView = {}; // view string → category alias (for article catid_ref)

  const hasBlog = pages.some(p => p.view === 'com_content.category.blog');
  const hasArticle = pages.some(p => p.view === 'com_content.article');
  const hasFeatured = pages.some(p => p.view === 'com_content.featured');

  if (hasBlog) {
    const blogCat = { title: 'Blog', alias: 'blog' };
    categories.push(blogCat);
    categoryRefByView['com_content.category.blog'] = 'blog';
    categoryRefByView['com_content.article'] = 'blog';
    categoryRefByView['com_content.featured'] = 'blog';
  }

  if (hasArticle && !hasBlog) {
    const generalCat = { title: 'General', alias: 'general' };
    categories.push(generalCat);
    categoryRefByView['com_content.article'] = 'general';
    categoryRefByView['com_content.featured'] = 'general';
  }

  if (hasFeatured && !hasBlog && !hasArticle) {
    // Featured page exists but no blog/article — create a General category
    const generalCat = { title: 'General', alias: 'general' };
    categories.push(generalCat);
    categoryRefByView['com_content.featured'] = 'general';
  }

  // ── articles ────────────────────────────────────────────────────────────────
  const articles = [];

  for (const page of pages) {
    if (page.view === 'com_content.article') {
      const title = fileToTitle(page.file);
      articles.push({
        title,
        alias: toAlias(title),
        catid_ref: categoryRefByView['com_content.article'] ?? (categories[0]?.alias ?? 'general'),
        introtext: `<!-- introtext extracted from ${page.file} -->`,
        image: null,
      });
    }
  }

  // If there is a featured page and no articles yet, add a placeholder article
  // so the featured view has something to render.
  if (hasFeatured && articles.length === 0) {
    const catRef = categoryRefByView['com_content.featured'] ?? (categories[0]?.alias ?? 'general');
    articles.push({
      title: 'Welcome to ' + (template?.title ?? templateName),
      alias: 'welcome',
      catid_ref: catRef,
      introtext: '<!-- introtext extracted from index.html hero section -->',
      image: null,
      featured: true,
    });
  } else if (hasFeatured) {
    // Mark existing articles as featured so the Featured Articles view fills
    if (articles.length > 0) articles[0].featured = true;
  }

  // ── menus ───────────────────────────────────────────────────────────────────
  const menus = [{ title: 'Main Menu', menutype: 'mainmenu' }];
  let homeAssigned = false;

  // ── menuItems ───────────────────────────────────────────────────────────────
  const menuItems = [];
  for (const page of pages) {
    const menuType = VIEW_TO_MENU_TYPE[page.view];
    if (!menuType) continue; // skip error/offline

    const title = page.title || fileToTitle(page.file);
    const alias = toAlias(page.file.replace(/\.html?$/i, ''));
    const isHome = page.view === 'com_content.featured';

    const item = {
      title,
      alias,
      type: menuType,
      link: `index.php?option=${menuType.split('.')[0]}&view=${menuType.split('.').slice(1).join('&layout=')}`,
      view: page.view,
    };
    if (isHome && !homeAssigned) { item.default = true; homeAssigned = true; }
    menuItems.push(item);
  }

  // ── modules ─────────────────────────────────────────────────────────────────
  const modules = [];

  // mod_menu → menu position (always)
  if (positions.includes('menu')) {
    modules.push({
      title: 'Main Navigation',
      module: 'mod_menu',
      position: 'menu',
      note: 'Set menutype=mainmenu, layout=mega (T4 megamenu host)',
    });
  }

  // mod_custom Hero → section-1 (always, if position exists)
  const heroPosition = positions.find(p => /section-?1|masthead|slideshow|hero/i.test(p)) ?? 'section-1';
  modules.push({
    title: 'Hero',
    module: 'mod_custom',
    position: heroPosition,
    note: 'carries HTML markup from the home hero — lift the <section> HTML from index.html and paste as module content',
  });

  // mod_articles_category "Latest" if blog/featured page exists
  if (hasBlog || hasFeatured) {
    const listingPosition = positions.find(p => /section-?[23]|bottom|content|main/i.test(p)) ?? 'section-2';
    modules.push({
      title: 'Latest Articles',
      module: 'mod_articles_category',
      position: listingPosition,
      note: 'Points at the blog category; use a card-grid layout; show on home/blog pages only',
    });
  }

  // mod_breadcrumbs if a breadcrumbs position is declared
  const breadcrumbsPosition = positions.find(p => /breadcrumb/i.test(p));
  if (breadcrumbsPosition) {
    modules.push({
      title: 'Breadcrumbs',
      module: 'mod_breadcrumbs',
      position: breadcrumbsPosition,
      note: 'Standard breadcrumb trail; assign to all pages except home',
    });
  }

  // mod_login if a login page exists and a sidebar/off-canvas position is declared
  if (pages.some(p => p.view === 'com_users.login')) {
    const sidebarPosition = positions.find(p => /sidebar|off.?canvas|aside/i.test(p));
    if (sidebarPosition) {
      modules.push({
        title: 'Login',
        module: 'mod_login',
        position: sidebarPosition,
        note: 'Show on pages where the design displays an inline login widget',
      });
    }
  }

  // mod_finder if search page exists
  if (pages.some(p => p.view === 'com_finder.search')) {
    const searchPosition = positions.find(p => /search|header/i.test(p)) ?? positions[0];
    if (searchPosition) {
      modules.push({
        title: 'Search',
        module: 'mod_finder',
        position: searchPosition,
        note: 'Smart Search input box; assign to header/top bar',
      });
    }
  }

  return {
    _meta: {
      template: templateName,
      generatedFrom: 'setup-demo-content.mjs',
      note: 'Draft content intent, not ready to apply. Resolve content, identities and relationships against the installed quickstart, then use reconcile-content.mjs.',
    },
    categories,
    articles,
    menus,
    menuItems,
    modules,
  };
}

// ─── emitters ─────────────────────────────────────────────────────────────────

/** --emit plan: pretty-print the plan as JSON. */
function emitPlan(plan) {
  console.log(JSON.stringify(plan, null, 2));
}

/** --emit sql: produce a commented INSERT SQL script. */
function emitSQL(plan) {
  throw new Error('Fixed-ID SQL export is retired. Use --emit plan, read the installed Joomla inventory, then reconcile-content.mjs. Apply through Joomla APIs to preserve nested sets, ACL and workflow relationships.');
}

/** --emit joomla-cli: human-runnable guidance steps. */
function emitJoomlaCLI(plan) {
  console.log([
    '# Apply using the authorized Joomla API/CLI for this installation.',
    '# 1. Fill the draft content; export current records and resolve natural keys.',
    '# 2. node scripts/reconcile-content.mjs desired.json inventory.json > content-plan.json',
    '# 3. Review create/update/keep. Recheck expected fields and write via Joomla APIs in a transaction.',
    '# 4. Re-export inventory; reconcile again and require all records to be keep.',
    '# 5. Read actual menu IDs; pass --items items.json to seed-megamenu.mjs.',
    '# 6. Clear T4 cache; verify frontend, admin editability and both palettes.',
    '# Full contract: references/content-reconciliation.md',
    '# Template: ' + plan._meta.template,
  ].join('\n'));
}

// ─── input loading ────────────────────────────────────────────────────────────

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function loadPageMap(source) {
  let raw;
  if (source === '-') {
    raw = await readStdin();
  } else {
    const absPath = resolve(source);
    // Check if it's a directory — if so, parse it as a bundle
    let isDir = false;
    try {
      const s = await stat(absPath);
      isDir = s.isDirectory();
    } catch { /* will error below */ }

    if (isDir) {
      // Dynamically import parseBundle so we don't duplicate the logic
      const { parseBundle } = await import('./lib/html-bundle.mjs');
      return parseBundle(absPath);
    }
    raw = await readFile(absPath, 'utf8');
  }
  return JSON.parse(raw);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // parse --emit flag
  const emitIdx = args.indexOf('--emit');
  const emit = emitIdx !== -1 ? args[emitIdx + 1] : 'plan';
  if (!['plan', 'sql', 'joomla-cli'].includes(emit)) {
    console.error(`Unknown --emit value: ${emit}. Use plan|sql|joomla-cli`);
    process.exit(2);
  }

  // remaining args (filter out --emit and its value)
  const rest = args.filter((_, i) => {
    if (emitIdx === -1) return true;
    return i !== emitIdx && i !== emitIdx + 1;
  });
  const source = rest[0];

  if (!source) {
    console.error('Usage: setup-demo-content.mjs [--emit plan|sql|joomla-cli] <page-map.json|-|bundle-dir>');
    process.exit(2);
  }

  const pageMap = await loadPageMap(source);
  const plan = buildPlan(pageMap);

  switch (emit) {
    case 'plan':       emitPlan(plan);      break;
    case 'sql':        emitSQL(plan);       break;
    case 'joomla-cli': emitJoomlaCLI(plan); break;
  }
}

// Guard: only run when this file is the entry point
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(__filename)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
