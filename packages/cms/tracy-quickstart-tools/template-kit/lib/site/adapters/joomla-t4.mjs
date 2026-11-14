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
 * tests the variable. Positive conjunction chains are known only when every arm requires that variable.
 * @param {string} php
 * @param {string} variable without the dollar sign
 */
export function emptyShowsOf(php, variable) {
  const text = String(php ?? '')
  const tokens = [...text.matchAll(/<\?php\s+(if\s*\((.*?)\)\s*:|else\s*:|elseif\s*\(.*?\)\s*:|endif\s*;)/g)]
  const stack = []
  for (const t of tokens) {
    const word = t[1].split(/[\s(:;]/)[0]
    if (word === 'if') stack.push({ tests: [t[2].trim()], start: t.index, elseAt: -1, fallbackAt: -1 })
    else if (word === 'else' || word === 'elseif') {
      const top = stack.at(-1)
      if (top) {
        if (top.elseAt < 0) top.elseAt = t.index
        if (word === 'else') top.fallbackAt = t.index
        else top.tests.push(/^elseif\s*\((.*?)\)\s*:/.exec(t[1])[1].trim())
      }
    } else if (word === 'endif') {
      const done = stack.pop()
      if (!done) continue
      const compound = done.tests.length > 1 || done.tests[0] !== `$${variable}`
      let elseAt = done.elseAt
      if (compound) {
        if (!done.tests.some((test) => (test.match(/\$\w+/g) ?? []).includes(`$${variable}`))) continue
        // Every arm must require this logo; calls, negation and alternative conditions stay unknown.
        if (
          !done.tests.every(
            (test) => /^\$\w+(?:\s*&&\s*\$\w+)*$/.test(test) && test.match(/\$\w+/g).includes(`$${variable}`)
          )
        )
          return null
        const chain = text.slice(done.start, t.index)
        if (
          [...chain.matchAll(/\$(\w+)\s*(?:\?\?=|[+*/%.-]?=(?!=)|\+\+|--)/g)].some((m) => m[1] === variable)
        )
          return null
        elseAt = done.fallbackAt
      }
      if (elseAt < 0) return 'nothing'
      const branch = text.slice(elseAt, t.index)
      const siteName = compound ? variableOf(text, 'site_name') : null
      if (
        compound
          ? siteName && new RegExp(`echo\\s+\\$${siteName}\\b`).test(branch)
          : /site[-_]?name/i.test(branch)
      )
        return 'name-as-text'
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

/**
 * The variable a layout reads a site setting into: `$logo = $site_settings->get('site_logo')` gives `logo`, and so
 * does a read wrapped on the same statement (`$logo = $s ? $clean($s->get('site_logo')) : ''`).
 */
export function variableOf(php, key) {
  const m = new RegExp(`\\$(\\w+)\\s*=\\s*[^;=\\n]{0,160}?\\$\\w+->get\\(\\s*['"]${key}['"]`).exec(
    String(php ?? '')
  )
  return m ? m[1] : null
}

/** The layouts of a T4 template that print the logo, with where each prints it. */
export function logoLayouts(readFile, template, listDir) {
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
  // Only an explicit logo element in an effective footer section proves the shared element prints there.
  const dirs = [`templates/${template}/local/etc/layout`, `templates/${template}/etc/layout`]
  const names = new Set(dirs.flatMap((dir) => listDir?.(dir) ?? []))
  const hasLogo = (node) =>
    (node?.type === 'element' && node.element === 'logo') ||
    (Array.isArray(node?.contents) && node.contents.some(hasLogo))
  const element = out.find((l) => l.where === 'header')
  for (const name of names) {
    if (!element || !/^[\w-]+\.json$/.test(name)) continue
    const text = readFile(`${dirs[0]}/${name}`) ?? readFile(`${dirs[1]}/${name}`)
    try {
      const sections = JSON.parse(text)?.layout?.sections
      if (Array.isArray(sections) && sections.some((s) => /^footer$/i.test(s.name) && hasLogo(s))) {
        out.push({ ...element, where: 'footer' })
        break
      }
    } catch {}
  }
  return out
}

/** Whether the T4 framework prints Open Graph tags (its document code writes `og:title`). */
export const t4PrintsOpenGraph = (readFile) =>
  /og:title/.test(readFile('plugins/system/t4/src/t4/Document/Template.php') ?? '') ||
  /og:title/.test(readFile('plugins/system/t4/src/t4/Helper/Metadata.php') ?? '')

/**
 * The block layouts of a T4 template's ACM blocks (`acm/<type>/tmpl/<style>.php`): a block layout may print the site
 * profile logo itself (a footer brand), and only the blocks set to that type and style print it.
 * @returns {Array<{type: string, style: string, file: string, php: string}>}
 */
export function acmLayouts(readFile, listDir, template) {
  if (!listDir || !readFile) return []
  const out = []
  for (const type of listDir(`templates/${template}/acm`)) {
    if (!/^[\w-]+$/.test(type)) continue
    for (const name of listDir(`templates/${template}/acm/${type}/tmpl`)) {
      if (!/^[\w-]+\.php$/.test(name)) continue
      const file = `templates/${template}/acm/${type}/tmpl/${name}`
      const php = readFile(file)
      if (php) out.push({ type, style: name.slice(0, -'.php'.length), file, php })
    }
  }
  return out
}

/** The ACM type and layout style a mod_ja_acm module's params name (`jatools-config`), or null. */
export function acmOfParams(params) {
  try {
    const config = JSON.parse(JSON.parse(params)['jatools-config'])
    const type = String(config[':type'] ?? '')
      .split(':')
      .pop()
    const style = config[type]?.[`jatools-layout-${type}`]
    return type && typeof style === 'string' ? { type, style } : null
  } catch {
    return null
  }
}
