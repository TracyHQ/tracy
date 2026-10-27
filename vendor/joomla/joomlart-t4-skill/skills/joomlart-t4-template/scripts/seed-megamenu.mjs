/**
 * seed-megamenu.mjs
 *
 * Builds the T4 `navigation_mega_settings` JSON value that lives in
 * `#__template_styles.params`.
 *
 * Shape (stringified):
 *   { [menutype]: { [menuItemId]: { align, settings:[{contents:[…]}], name, col, type, id, …megaProps } } }
 *
 * PREFERRED path: use the Playwright admin builder which resolves real DB ids
 * from the live Joomla instance.  The --print-sql flag below is a fallback for
 * environments where Playwright is not available.
 *
 * NOTE on --template (dual meaning):
 *   - file-write mode (default): --template is a DIRECTORY — the template root;
 *     the navigation profile is written to <dir>/etc/navigation/default.json.
 *   - --print-sql mode: --template is the template NAME (the `template` column
 *     value in #__template_styles) used in the emitted UPDATE's WHERE clause.
 *   Pass the right one for the mode you're invoking.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Core export
// ---------------------------------------------------------------------------

/**
 * Build the mega-settings object and return it as a JSON string.
 *
 * @param {string} menutype   - e.g. 'mainmenu'
 * @param {Array}  menuItems  - array of item descriptors:
 *   { id, title, align?, columns?, megabuild?, width?, … }
 * @returns {string} JSON string
 */
export function buildMegaSettings(menutype, menuItems) {
  const perType = {};

  for (const item of menuItems) {
    const key = String(item.id);

    // Map each column descriptor to the T4 contents shape
    const rawColumns = item.columns ?? [{}];
    const contents = rawColumns.map(c => ({
      name:     c.title    ?? null,
      type:     c.type     ?? '',
      style:    c.style    ?? null,
      title:    c.title    ?? null,
      col:      c.col      ?? 'auto',
      module:   c.module   ?? null,
      position: c.position ?? null,
      items:    c.items    ?? null,
    }));

    const entry = {
      align:    item.align ?? 'left',
      settings: [{ contents }],
      name:     'None',
      col:      'auto',
      type:     '',
      id:       true,
    };

    // Merge optional mega props explicitly
    if (item.megabuild !== undefined) entry.megabuild = item.megabuild;
    if (item.width     !== undefined) entry.width     = item.width;

    perType[key] = entry;
  }

  return JSON.stringify({ [menutype]: perType });
}

// ---------------------------------------------------------------------------
// CLI (only when run as the entry point)
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };
  const has = (flag) => args.includes(flag);

  const menutype    = get('--menutype');
  const itemsFile   = get('--items');
  const templateDir = get('--template');
  const printSql    = has('--print-sql');

  if (!menutype || !templateDir) {
    console.error('Usage: seed-megamenu.mjs --menutype <type> [--items <json-file>] --template <dir|name> [--print-sql]');
    console.error('  --template is a DIRECTORY in file-write mode (default; writes etc/navigation/default.json),');
    console.error('             but a template NAME in --print-sql mode (used in the UPDATE WHERE clause).');
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // Load menu items
  // -----------------------------------------------------------------------
  let menuItems = [];
  if (itemsFile) {
    const raw = readFileSync(resolve(itemsFile), 'utf8');
    menuItems = JSON.parse(raw);
  }

  const megaSettings = buildMegaSettings(menutype, menuItems);

  // -----------------------------------------------------------------------
  // --print-sql fallback
  // NOTE: The PREFERRED path is the Playwright admin builder which resolves
  // real #__menu ids from the live Joomla instance.  Use --print-sql only
  // when Playwright is unavailable.
  // -----------------------------------------------------------------------
  if (printSql) {
    const tpl = templateDir; // re-used as template name for the SQL
    const escaped = megaSettings.replace(/'/g, "\\'");
    console.log(
      `UPDATE \`#__template_styles\` SET params = JSON_SET(params, '$.navigation_mega_settings', '${escaped}') WHERE template = '${tpl}';`
    );
    return;
  }

  // -----------------------------------------------------------------------
  // Write navigation profile JSON
  // -----------------------------------------------------------------------
  const navDir  = resolve(templateDir, 'etc', 'navigation');
  const outFile = resolve(navDir, 'default.json');

  mkdirSync(navDir, { recursive: true });

  const profile = {
    menu_type:         menutype,
    mega_settings:     megaSettings,
    mega_effect:       'slide',
    mega_duration:     '',
    mega_showsm:       false,
    oc_enabled:        true,
    oc_pos_name:       'off-canvas',
    oc_pos_style:      'JAxhtml',
    oc_effect:         'left-push',
    oc_menu_effect:    'drill',
    oc_rightside:      false,
    oc_showlg:         false,
    option_breakpoint: 'lg',
  };

  writeFileSync(outFile, JSON.stringify(profile, null, 2) + '\n', 'utf8');
  console.log(`Written: ${outFile}`);
}

// Guard: only run when this file is the entry point
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch(err => { console.error(err); process.exit(1); });
}
