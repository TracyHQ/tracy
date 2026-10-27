// Read an OpenDesign system's declared tokens.
//
// Extracted from `make-style.mjs` when a second generator needed the same two functions. Both of
// them carry a bug that was shipped once, and a copy of this code is a copy that will lose the
// comment explaining why the obvious version is wrong.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The `:root { … }` block of a tokens stylesheet, or null.
 *
 * Comments are stripped FIRST. Every vendored `tokens.css` opens with a header telling the reader
 * to "paste the `:root { … }` block verbatim", so the first `:root` in the file is PROSE — taking
 * it walked the brace matcher through a comment and returned a block with no tokens in it. Every
 * lookup then fell back to its default, and airbnb's style came out carrying Apple's 80px rhythm
 * instead of its own 64px: a wrong value that looks like a real one.
 */
export const rootBlock = (rawCss) => {
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = css.indexOf(':root');
  if (at < 0) return null;
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return null;
};

/**
 * One declaration's value, or null.
 *
 * Anchored on the token NAME, not on a line start: the first version used `(?:^|;)\s*--name` with
 * the `m` flag, which cannot match a declaration that begins with indentation, so every lookup
 * silently returned its fallback.
 */
export const decl = (block, name) => {
  const m = block?.match(new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+)`));
  return m ? m[1].trim() : null;
};

/** Every token file a system ships, already parsed. `dark` stays raw — it is a whole ruleset. */
export const readSystem = (odDir, system) => {
  const sysDir = path.join(odDir, 'systems', system);
  if (!existsSync(sysDir)) return null;
  const read = (f) => (existsSync(path.join(sysDir, f)) ? readFileSync(path.join(sysDir, f), 'utf8') : null);
  const tokens = read('tokens.css');
  if (!tokens) return null;
  const gaps = read('tokens.gaps.css');
  return {
    dir: sysDir,
    base: rootBlock(tokens),
    gaps: gaps ? rootBlock(gaps) : null,
    dark: read('tokens.dark.css'),
  };
};

/** A token looked up in `tokens.css`, then in `tokens.gaps.css`. Returns null when neither has it. */
export const token = (sys, name) => decl(sys.base, name) ?? decl(sys.gaps, name);

/**
 * Where the OpenDesign library lives, found rather than told.
 *
 * Measured on a real run: an agent asked to use these tools spent four of its seven shell commands
 * locating things — one of them hunting for `vendor/od-design-system`. A flag with no default makes
 * every caller, human or model, repeat that search. The library sits at a conventional path inside
 * a repo, so walking up from the caller finds it, and `--od` stays available for the case the
 * convention does not hold.
 *
 * Returns null when nothing is found; a caller that needs it should say so rather than guess.
 */
export const findOdDir = (from = process.cwd()) => {
  const CANDIDATES = ['vendor/od-design-system', 'vendor/tracy/od-design-system'];
  let dir = path.resolve(from);
  for (;;) {
    for (const c of CANDIDATES) {
      const guess = path.join(dir, c);
      // `systems/` is the check, not the directory name: a stale empty folder with the right name
      // would otherwise satisfy the search and every lookup would then fall back to its default.
      if (existsSync(path.join(guess, 'systems'))) return guess;
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
};
