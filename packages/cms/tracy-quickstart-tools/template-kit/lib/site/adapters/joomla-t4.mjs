// The JoomlArt T4 framework layer of the Joomla adapter: its settings live in files of the template
// (`etc/<group>/<profile>.json`, a `local/etc` copy winning over the shipped one), and its logo layouts decide what
// prints when a logo setting is empty. Read-only.

/** A T4 settings group file, `local/etc` first, then `etc`; null when neither is there. */
export function t4Settings(readFile, template, group, profile = 'default') {
  for (const base of [`templates/${template}/local/etc`, `templates/${template}/etc`]) {
    const text = readFile(`${base}/${group}/${profile}.json`) ?? readFile(`${base}/${group}.json`)
    if (text)
      try {
        return {
          values: JSON.parse(text),
          file: `${base}/${group === 'global' ? 'global' : `${group}/${profile}`}.json`
        }
      } catch {}
  }
  return null
}

/**
 * What a PHP layout prints when the setting read into `$var` is empty, from the shape of its `if ($var) : ... else :
 * ... endif` blocks: `name-as-text` when the `else` branch prints the site name, `template-text` when it prints
 * something else (a fixed word), `nothing` when there is no `else` or it prints nothing; null when the layout never
 * tests the variable.
 * @param {string} php
 * @param {string} variable without the dollar sign
 */
export function emptyShowsOf(php, variable) {
  const text = String(php ?? '')
  const tokens = [...text.matchAll(/<\?php\s+(if\s*\((.*?)\)\s*:|else\s*:|elseif\s*\(.*?\)\s*:|endif\s*;)/g)]
  const stack = []
  for (const t of tokens) {
    const word = t[1].split(/[\s(:;]/)[0]
    if (word === 'if') stack.push({ test: t[2].trim(), elseAt: -1 })
    else if (word === 'else' || word === 'elseif') {
      const top = stack.at(-1)
      if (top && top.elseAt < 0) top.elseAt = t.index
    } else if (word === 'endif') {
      const done = stack.pop()
      if (!done || done.test !== `$${variable}`) continue
      if (done.elseAt < 0) return 'nothing'
      const branch = text.slice(done.elseAt, t.index)
      if (/site[-_]?name/i.test(branch)) return 'name-as-text'
      // Anything else the branch prints (a fixed template word, a language string): not the name, not nothing.
      const rest = branch.replace(
        /<\?php\s+(?:if\s*\(.*?\)\s*:|else\s*:|elseif\s*\(.*?\)\s*:|endif\s*;)\s*\?>/g,
        ''
      )
      // Drop PHP blocks and tags until the text is stable, so a nested "<<b>" cannot leave a tag behind.
      let visible = rest
      for (let before = ''; before !== visible; ) {
        before = visible
        visible = visible.replace(/<\?php[\s\S]*?\?>|<[^>]*>/g, '')
      }
      const prints = /<\?php\s+echo\b|<\?=/.test(rest) || /\S/.test(visible)
      return prints ? 'template-text' : 'nothing'
    }
  }
  return null
}

/** The variable a layout reads a site setting into: `$logo = $site_settings->get('site_logo')` gives `logo`. */
export function variableOf(php, key) {
  const m = new RegExp(`\\$(\\w+)\\s*=\\s*\\$\\w+->get\\(\\s*['"]${key}['"]`).exec(String(php ?? ''))
  return m ? m[1] : null
}

/** The layouts of a T4 template that print the logo, with where each prints it. */
export function logoLayouts(readFile, template) {
  const out = []
  for (const [where, rel] of [
    ['header', 'html/layouts/t4/element/logo.php'],
    ['offcanvas', 'html/layouts/t4/layout/offcanvas.php']
  ]) {
    const own = readFile(`templates/${template}/${rel}`)
    const base = own ?? readFile(`plugins/system/t4/themes/base/${rel}`)
    if (base)
      out.push({ where, php: base, file: own ? `templates/${template}/${rel}` : `t4 framework ${rel}` })
  }
  return out
}

/** Whether the T4 framework prints Open Graph tags (its document code writes `og:title`). */
export const t4PrintsOpenGraph = (readFile) =>
  /og:title/.test(readFile('plugins/system/t4/src/t4/Document/Template.php') ?? '') ||
  /og:title/.test(readFile('plugins/system/t4/src/t4/Helper/Metadata.php') ?? '')
