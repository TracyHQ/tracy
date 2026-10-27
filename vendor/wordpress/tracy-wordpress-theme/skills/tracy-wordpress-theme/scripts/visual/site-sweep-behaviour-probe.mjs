// In-page readers of the behaviour checks of site-sweep (fixed widgets, icon controls, forms, text). Each function is
// SELF-CONTAINED (it is serialised into the page by page.evaluate) and read-only except `focusProbe`, which focuses a field and
// blurs it again. Nothing here knows a port: controls are found by role, name, shape and landmark.

/** Fixed (and small sticky) page widgets that are painted and on top at the centre of their box: back-to-top, floating buttons, cookie bars. */
export function widgetsInPage() {
  const vw = innerWidth
  const vh = innerHeight
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  const nameOf = (e) => norm(e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || e.querySelector('img')?.alt || e.querySelector('svg title')?.textContent || '')
  const out = []
  const seen = new Set()
  for (const e of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(e)
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue
    const r = e.getBoundingClientRect()
    if (r.width < 8 || r.height < 8 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue
    if (cs.visibility !== 'visible' || Number(cs.opacity) < 0.05 || cs.display === 'none') continue
    if (cs.position === 'sticky' && (r.width * r.height > vw * vh * 0.05 || r.top <= 2)) continue
    if (r.width * r.height > vw * vh * 0.45) continue
    // the site header (fixed or sticky at the top, or holding the navigation) is the header check's
    if (e.tagName === 'HEADER' || e.getAttribute('role') === 'banner' || e.querySelector('header, nav, [role=navigation]') || e.closest('header, nav, [role=banner]')) continue
    if (r.top <= 2 && r.width >= vw * 0.9 && r.height >= 40) continue
    const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2))
    const cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2))
    const top = document.elementFromPoint(cx, cy)
    if (!top || !(top === e || e.contains(top) || top.contains(e))) continue
    let nested = false
    for (let p = e.parentElement; p; p = p.parentElement) if (seen.has(p)) nested = true
    if (nested) continue
    seen.add(e)
    e.setAttribute('data-sweep-widget', String(out.length))
    const corner = (cy < vh / 2 ? 't' : 'b') + (cx < vw / 3 ? 'l' : cx > (2 * vw) / 3 ? 'r' : 'c')
    const mark = e.matches('svg, img, i') ? e : e.querySelector('svg, img, i, [class*=icon], [class*=fa-]')
    out.push({
      index: out.length,
      corner,
      name: nameOf(e).slice(0, 60),
      tag: e.tagName.toLowerCase(),
      href: e.getAttribute('href') || '',
      sel: e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}${[...e.classList].slice(0, 2).map((c) => `.${c}`).join('')}`,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      fromRight: vw - r.right,
      fromBottom: vh - r.bottom,
      hasMark: Boolean(mark) || norm(e.innerText).length > 0,
      text: norm(e.innerText).slice(0, 80)
    })
  }
  return out
}

/** Icon controls in the header and footer landmarks: a link or button that draws a mark and (almost) no words. */
export function iconsInPage() {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  const out = []
  // header and footer by element or role, else by an id/class of that name in the place such a region stands (a T4 template draws its footer in a div#t4-footer)
  const docH = document.documentElement.scrollHeight
  const regionOf = (e) => {
    if (e.closest('header, [role=banner]')) return 'header'
    if (e.closest('footer, [role=contentinfo]')) return 'footer'
    if (e.closest('aside, [role=complementary]')) return 'aside'
    for (let p = e; p && p !== document.body; p = p.parentElement) {
      if (p.matches('main, article, [role=main]')) return 'main'
      const tag = `${p.id} ${typeof p.className === 'string' ? p.className : ''}`.toLowerCase()
      const pr = p.getBoundingClientRect()
      const top = pr.top + scrollY
      if (/(^|[\s_-])footer($|[\s_-])/.test(tag) && top + pr.height / 2 > docH * 0.5) return 'footer'
      if (/(^|[\s_-])header($|[\s_-])/.test(tag) && top < 250) return 'header'
    }
    return 'main'
  }
  // the landmark the page declares (header, banner / footer, contentinfo) is the region; a box only named so by its id or class (a T4 template
  // draws its footer in a div#t4-footer, a hero section may be called "hero-header") stands in for it only on a page that declares none
  const shown = (e) => {
    const cs = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    if (!(r.width > 0 && r.height > 0) || cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false
    // the opacity of the box and of every ancestor: a box faded out by a parent is not drawn either
    for (let p = e; p; p = p.parentElement) if (!(Number(getComputedStyle(p).opacity) > 0)) return false
    return true
  }
  // → { roots, why }: why is 'missing' (no visible box) or 'ambiguous' (several visible boxes of that name) when no region can be read
  const regionRoots = (semantic, named, land) => {
    const declared = [...document.querySelectorAll(semantic)].filter((e) => regionOf(e) === land && !e.closest('main, article') && shown(e))
    if (declared.length) return { roots: declared }
    // a page without the element: a box named so stands in only when it is the one visible such box in the region; several cannot be told apart
    const cand = [...document.querySelectorAll(named)].filter((e) => regionOf(e) === land && !e.closest('main, article') && shown(e))
    return cand.length === 1 ? { roots: cand } : { roots: [], why: cand.length ? 'ambiguous' : 'missing' }
  }
  const lands = [
    ['header', regionRoots('header, [role=banner]', '[id*=header i], [class*=header i]', 'header')],
    ['footer', regionRoots('footer, [role=contentinfo]', '[id*=footer i], [class*=footer i]', 'footer')]
  ]
  // a control inside content, a sidebar, or a box collapsed to no width or height that clips what it holds, is not seen in the region
  const hiddenInside = (e) => {
    if (e.closest('main, article, aside, [role=main], [role=complementary]')) return true
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p)
      if (ps.overflow === 'visible') continue
      // what the box clips to is its content box (a list collapsed with width:0 still has its padding)
      const pr = p.getBoundingClientRect()
      const f = (...k) => k.reduce((n, x) => n + (parseFloat(ps[x]) || 0), 0)
      if (pr.width - f('paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth') < 1 || pr.height - f('paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth') < 1) return true
    }
    return false
  }
  // the top band: a topbar drawn BEFORE the header (a sibling above it) is the same row of controls as one drawn inside it, so its controls
  // are the header's. The header is the visible box the region is read from — the declared <header>, else the one visible box named so (a
  // template that draws its header in a div#site-header). Only what ends above its top and stands within the top 200 px of the page is the
  // band: content, sidebars, the footer and whatever follows the header are no part of it. Several boxes named so (nothing says which is
  // the header) leave no band: that case is already not measured.
  const headerRoots = lands[0][1].roots
  const headerTop = headerRoots.length ? Math.min(...headerRoots.map((x) => x.getBoundingClientRect().top + scrollY)) : 0
  const inBand = (e) => {
    if (!headerRoots.length || e.closest('footer, [role=contentinfo], main, article, aside, [role=main], [role=complementary]')) return false
    const b = e.getBoundingClientRect()
    return b.bottom + scrollY <= headerTop + 2 && b.top + scrollY < 200
  }
  // a search field collapsed to a tile (an input that is only its magnifier until it is opened) is the same control as a button drawn there
  const CONTROLS = 'a, button, [role=button], input[type=submit], input[type=search], form[role=search] input[type=text], form[class*=search i] input[type=text]'
  const bandControls = [...document.body.querySelectorAll(CONTROLS)].filter((e) => shown(e) && inBand(e))
  const seen = new Set()
  for (const [land, { roots, why }] of lands) {
    // a region that cannot be read is an entry of its own, never an empty list of controls; a top band that holds controls is a region
    // that can be read, with or without a header element
    const band = land === 'header' ? bandControls : []
    if (why && !band.length) out.push({ land, unmeasured: `${land} landmark ${why}` })
    let order = 0
    const pool = land === 'header' ? [...new Set([...roots.flatMap((root) => [...root.querySelectorAll(CONTROLS)]), ...band])].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)) : roots.flatMap((root) => [...root.querySelectorAll(CONTROLS)])
    {
      for (const e of pool) {
        if (seen.has(e) || hiddenInside(e)) continue
        const cs = getComputedStyle(e)
        let r = e.getBoundingClientRect()
        // an inline link is one text line high whatever it holds: its box is the box of the painted child it holds, as the visitor taps it
        if (cs.display === 'inline') {
          const kid = e.querySelector('svg, img, i, span, [class*=icon], [class*=fa-]')
          const kr = kid?.getBoundingClientRect()
          if (kr && kr.width > 0 && kr.height > 0) r = kr
        }
        if (e.matches('input[type=search], input[type=text]') && (r.width > 64 || r.height > 64)) continue
        if (r.width < 6 || r.height < 6 || r.width > 140 || r.height > 140 || cs.visibility !== 'visible' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue
        // the words drawn: a label only a screen reader gets (clipped to a pixel) is not text
        const shownText = () => {
          let t = ''
          const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
          for (let n = w.nextNode(); n; n = w.nextNode()) {
            const pr = n.parentElement.getBoundingClientRect()
            const pcs = getComputedStyle(n.parentElement)
            if (pr.width > 3 && pr.height > 3 && pcs.display !== 'none' && pcs.visibility !== 'hidden') t += n.data
          }
          return norm(t)
        }
        const text = shownText()
        const mark = e.querySelector('svg, img, i, [class*=icon], [class*=fa-], [class*=glyph]')
        const before = getComputedStyle(e, '::before').content
        // a control drawn by bars (the three-bar menu button: two or more thin painted boxes, with at most a hidden word inside)
        const bars = !text && [...e.querySelectorAll('*')].filter((d) => {
          const q = d.getBoundingClientRect()
          const ds = getComputedStyle(d)
          return q.height > 0 && q.height <= 6 && q.width >= 8 && ds.display !== 'none' && ds.visibility !== 'hidden'
        }).length >= 2
        const glyph = (mark && !text) || bars || (!text && before && before !== 'none' && before !== 'normal' && before !== '""') || (text.length <= 1 && Boolean(mark))
        const href = e.getAttribute('href') || ''
        const iconish = glyph || (!text && (e.getAttribute('aria-label') || e.getAttribute('title')))
        if (!iconish) continue
        // the chevron that opens a sub-level of a menu item is part of the menu, not an icon control of the header: a button named for a
        // sub-menu / caret / chevron (core's own sub-menu toggle included), or a button beside a link in a list item of a navigation
        const hint = `${typeof e.className === 'string' ? e.className : ''} ${e.id} ${e.getAttribute('aria-label') ?? ''}`.toLowerCase()
        if (/sub-?menu|dropdown-toggle|caret|chevron/.test(hint) && !/search|theme|dark/.test(hint)) continue
        if (e.tagName !== 'A' && e.hasAttribute('aria-expanded') && e.closest('nav, [role=navigation]') && e.closest('li')?.querySelector(':scope > a[href]')) continue
        // a fixed widget (back to top, a floating button) is the fixed-widgets check's, and a link home is the header's own (the logo)
        let fixedUp = false
        for (let p = e; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') fixedUp = true
        if (fixedUp) continue
        try {
          const u = new URL(href, location.href)
          if (u.origin === location.origin && (u.pathname === '/' || u.pathname === '') && !u.hash && e.tagName === 'A' && land === 'header') continue
        } catch {}
        // the logo is not an icon control: a link home that holds a wide picture
        const pic = e.querySelector('img, svg')
        if (pic && pic.getBoundingClientRect().width > 56 && !text) continue
        if (/^(\/|#)?$/.test(href) || href === location.origin + '/' || href === location.origin) { if (pic && pic.getBoundingClientRect().width > 40) continue }
        // the mark the control draws: its first descendant with a box, else the control itself
        const m = mark ?? e
        const mr = m.getBoundingClientRect()
        const mcs = getComputedStyle(m)
        let host = ''
        try {
          host = new URL(href, location.href).hostname.replace(/^www\./, '').split('.').slice(0, -1).join('.')
        } catch {}
        if (host && new URL(href, location.href).hostname === location.hostname) host = ''
        const name = norm(e.getAttribute('aria-label') || e.getAttribute('title') || e.querySelector('svg title')?.textContent || e.querySelector('.screen-reader-text, .sr-only, .visually-hidden')?.textContent || e.querySelector('img')?.alt || '')
        // the control and its mark must be on top at their centre: a control drawn under something else is not a control a visitor reaches
        const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)))
        // a tile: the control, a box inside it or the box that wraps it paints a filled shape of the control's own size (a round or square
        // badge behind the glyph). The shape the glyph draws is read apart from the tile's outline.
        const paints = (b, pseudo) => {
          const bs = getComputedStyle(b, pseudo)
          const bg = /rgba?\(([^)]*)\)/.exec(bs.backgroundColor)
          const alpha = bg ? (bg[1].split(/[,/ ]+/).filter(Boolean).length > 3 ? Number(bg[1].split(/[,/ ]+/).filter(Boolean)[3]) : 1) : 0
          return alpha > 0.05 || (bs.backgroundImage && bs.backgroundImage !== 'none')
        }
        const area = r.width * r.height
        const boxes = [e, ...e.querySelectorAll('*'), e.parentElement, e.parentElement?.parentElement].filter(Boolean)
        const tile = boxes.some((b) => {
          if (b === document.body || b === document.documentElement) return false
          const q = b.getBoundingClientRect()
          const size = q.width * q.height
          return size >= area * 0.5 && size <= area * 1.6 && q.width > 0 && (paints(b) || paints(b, '::before') || paints(b, '::after'))
        })
        // the control's own border (a divider drawn between controls) and its width: part of the box, no part of the glyph
        const borderW = Math.max(...['Top', 'Right', 'Bottom', 'Left'].map((k) => parseFloat(cs[`border${k}Width`]) || 0))
        const rim = borderW > 0 ? Math.ceil(borderW) + 1 : 0
        seen.add(e)
        e.setAttribute('data-sweep-icon', String(out.length))
        // what the control is for, from the words it carries (the name of one side and of the other differ; the purpose does not), and the internal page it links to
        const words = `${name} ${hint} ${e.querySelector('use')?.getAttribute('href') ?? ''} ${typeof mark?.className === 'string' ? mark.className : (mark?.className?.baseVal ?? '')}`.toLowerCase()
        // X: its own host (x.com) or the brand's old one, `x-twitter` in an icon class, or a lone `x` class/name token — never a word that merely
        // holds the letter, and never the x that closes something
        const closes = /close|dismiss|cancel|clear|remove|times|delete|\bnav-?toggle|burger/.test(words)
        const social = /(x-twitter|twitter|facebook|linkedin|instagram|youtube|pinterest|whatsapp|telegram|tiktok|github|dribbble|behance|vimeo|tumblr|reddit|mastodon)/.exec(words)?.[1] ?? (!closes && /(^|[^a-z0-9])x([^a-z0-9]|$)/.test(`${words} ${host}`) ? 'x-twitter' : undefined)
        // the network one control stands for, whatever the host or the class calls it (twitter.com and x.com are one network)
        const hostNet = /^(x|twitter|x-twitter)$/.test(host.split('.').pop() ?? '') ? 'x-twitter' : ''
        const network = hostNet || (social === 'twitter' || social === 'x-twitter' ? 'x-twitter' : social ?? '')
        const role = host ? '' : social ? `social:${social}` : /theme|dark|light-?mode|moon|\bsun\b|contrast|colou?r.?scheme/.test(words) ? 'theme' : /search|magnif/.test(words) ? 'search' : /off-?canvas|drawer|burger|navbar-toggler|nav.?toggle|menu/.test(words) ? 'menu' : /cart|basket|\bbag\b/.test(words) ? 'cart' : /log.?in|sign.?in|account|profile|\buser\b/.test(words) ? 'account' : /\brss\b|feed/.test(words) ? 'rss' : ''
        let path = ''
        try {
          const u = new URL(href, location.href)
          if (u.origin === location.origin && u.pathname.length > 1 && !/^(javascript|mailto|tel):/i.test(href)) path = u.pathname.replace(/\/+$/, '') + u.search
        } catch {}
        out.push({
          land,
          index: out.length,
          order: order++,
          role,
          network,
          tile,
          rim,
          path,
          key: (host || name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).slice(0, 40),
          name: name.slice(0, 50),
          href: href.slice(0, 80),
          tag: e.tagName.toLowerCase(),
          rect: { x: r.x, y: r.y + scrollY, w: r.width, h: r.height },
          mark: { x: mr.x, y: mr.y + scrollY, w: mr.width, h: mr.height, color: mcs.color, fill: mcs.fill, opacity: Number(mcs.opacity) },
          reachable: Boolean(top) && (top === e || e.contains(top) || top.contains(e)),
          visibleNow: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
        })
      }
    }
  }
  return out
}

/** Every visible form: its purpose, controls, labels, the links of its region and the focus the page gave. */
export function formsInPage() {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  const vis = (e) => {
    const cs = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
  }
  // header and footer by element or role, else by an id/class of that name in the place such a region stands (a T4 template draws its footer in a div#t4-footer)
  const docH = document.documentElement.scrollHeight
  const regionOf = (e) => {
    if (e.closest('header, [role=banner]')) return 'header'
    if (e.closest('footer, [role=contentinfo]')) return 'footer'
    if (e.closest('aside, [role=complementary]')) return 'aside'
    for (let p = e; p && p !== document.body; p = p.parentElement) {
      if (p.matches('main, article, [role=main]')) return 'main'
      const tag = `${p.id} ${typeof p.className === 'string' ? p.className : ''}`.toLowerCase()
      const pr = p.getBoundingClientRect()
      const top = pr.top + scrollY
      if (/(^|[\s_-])footer($|[\s_-])/.test(tag) && top + pr.height / 2 > docH * 0.5) return 'footer'
      if (/(^|[\s_-])header($|[\s_-])/.test(tag) && top < 250) return 'header'
    }
    return 'main'
  }
  const landOf = regionOf
  const out = []
  const active = document.activeElement
  for (const f of document.querySelectorAll('form, [role=search]')) {
    if (f.tagName !== 'FORM' && f.querySelector('form')) continue
    if (!vis(f)) continue
    const controls = [...f.querySelectorAll('input, textarea, select')].filter((c) => !['hidden', 'submit', 'button', 'image', 'reset'].includes(c.type) && vis(c) && getComputedStyle(c).position !== 'absolute' || (c.type === 'checkbox' && vis(c)))
    const visible = controls.filter((c) => {
      const r = c.getBoundingClientRect()
      return r.width > 1 && r.height > 1 && !(r.right < 0 || r.left < -500)
    })
    // the words of an element a visitor reads: text whose own box has a size (a label set to font-size:0, a screen-reader-only one clipped to a
    // pixel, or one in a wrapper with no size draws nothing)
    const drawnText = (root) => {
      let t = ''
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const p = n.parentElement
        const pcs = getComputedStyle(p)
        if (pcs.display === 'none' || pcs.visibility === 'hidden' || parseFloat(pcs.fontSize) < 1 || Number(pcs.opacity) < 0.05) continue
        const range = document.createRange()
        range.selectNodeContents(n)
        const rr = range.getBoundingClientRect()
        if (rr.width > 3 && rr.height > 3) t += n.data
      }
      return norm(t)
    }
    const labelOf = (c) => {
      const byFor = c.id ? document.querySelector(`label[for="${CSS.escape(c.id)}"]`) : null
      const wrap = c.closest('label')
      // the words a visitor sees: a label drawn on the page (a screen-reader-only label is not)
      const lab = [byFor, wrap].find((l) => l && l.getBoundingClientRect().width > 3 && l.getBoundingClientRect().height > 3)
      const own = lab ? drawnText(lab) : ''
      if (own) return own
      // a caption drawn beside the field with no <label for> tying it (a span, a div): a checkbox's words follow it, a text field's stand above it
      const parent = c.parentElement
      if (['checkbox', 'radio'].includes(c.type) && parent && parent.querySelectorAll('input, textarea, select').length === 1) {
        const t = drawnText(parent)
        return t.length <= 90 ? t : ''
      }
      const prev = c.previousElementSibling
      if (prev && !prev.matches('input, textarea, select, button, br, hr') && !prev.querySelector('input, textarea, select, button')) {
        const t = drawnText(prev)
        return t.length <= 60 ? t : ''
      }
      return ''
    }
    const kinds = visible.map((c) => (c.tagName === 'TEXTAREA' ? 'textarea' : c.tagName === 'SELECT' ? 'select' : c.type))
    const names = visible.map((c) => `${c.name} ${c.id} ${c.placeholder}`.toLowerCase()).join(' ')
    const action = f.getAttribute('action') || ''
    const cls = `${f.id} ${f.className} ${f.closest('[class]')?.className ?? ''}`.toLowerCase()
    const land = landOf(f)
    let purpose = 'other'
    const pw = kinds.filter((k) => k === 'password').length
    if (pw >= 2) purpose = 'registration'
    else if (pw === 1) purpose = 'login'
    else if (f.getAttribute('role') === 'search' || kinds.includes('search') || /(^|[\s_-])(s|q|search|query|keyword)([\s_-]|$)/.test(names) || /search/.test(action + cls)) purpose = 'search'
    else if (kinds.includes('textarea')) purpose = 'contact'
    else if (/newsletter|subscribe|mailchimp|acym|mc4wp|signup/.test(cls + action) || (kinds.length <= 2 && kinds.includes('email'))) purpose = 'newsletter'
    else if (/register|signup|sign-up/.test(action + cls)) purpose = 'registration'
    else if (/contact/.test(action + cls)) purpose = 'contact'
    const r = f.getBoundingClientRect()
    // the controls of the form: the box of its fields, their labels and its buttons (a link drawn as one included) — the same visual region on both sides, whichever element
    // (the form, a wrapper, nothing) holds the heading, the intro or the links around them
    const ctlRects = [...f.querySelectorAll('input, textarea, select, button, label, a[class*=btn], a[class*=button], a[role=button]')].filter((e) => vis(e) && !['hidden'].includes(e.type)).map((e) => e.getBoundingClientRect())
    const ctl = ctlRects.length ? { x0: Math.min(...ctlRects.map((q) => q.left)), y0: Math.min(...ctlRects.map((q) => q.top)), x1: Math.max(...ctlRects.map((q) => q.right)), y1: Math.max(...ctlRects.map((q) => q.bottom)) } : null
    // the links of the region: links of the form's own landmark within 60 px of its controls, by where they are drawn and not by which element holds them
    // (login links sit 20–44 px away on the measured pairs; a list of posts 100 px below flipped from outside to inside on a 1 px layout difference)
    // a list that starts inside that reach is the region's whole list: on a narrow screen the same links stack, and the last
    // one falls past 60 px on the side that draws one more row (ja-fresco login at 390: "don't have an account?" 68 px under the button)
    const candidates = ctl ? [...document.querySelectorAll('a[href]')].filter((a) => vis(a) && !a.closest('nav') && landOf(a) === land) : []
    const inReach = candidates.filter((a) => {
      const q = a.getBoundingClientRect()
      return q.right > ctl.x0 - 60 && q.left < ctl.x1 + 60 && q.bottom > ctl.y0 - 60 && q.top < ctl.y1 + 60
    })
    const lists = new Set(inReach.map((a) => a.closest('ul, ol')).filter((l) => l && !l.contains(f)))   // not a list that holds the form itself
    const links = candidates
      .filter((a) => inReach.includes(a) || lists.has(a.closest('ul, ol')))
      .map((a) => norm(drawnText(a) || a.getAttribute('aria-label')).toLowerCase())
      .filter(Boolean)
    // what the form's buttons say: a link drawn as a button on one side and a <button> on the other is the same button
    const buttons = [...f.querySelectorAll('button, input[type=submit], input[type=button], [role=button]')].filter(vis).map((b) => norm(drawnText(b) || b.value || b.getAttribute('aria-label')).toLowerCase()).filter(Boolean)
    out.push({
      purpose,
      land,
      id: f.id || '',
      action: action.slice(0, 60),
      box: { w: r.width, h: r.height },
      controlsBox: ctl ? { w: ctl.x1 - ctl.x0, h: ctl.y1 - ctl.y0 } : null,
      buttons: [...new Set(buttons)].slice(0, 6),
      fields: visible.map((c, i) => ({
        type: kinds[i],
        name: c.name || c.id || '',
        required: c.required || c.getAttribute('aria-required') === 'true',
        autofocus: c.autofocus,
        placeholder: norm(c.placeholder),
        label: labelOf(c),
        focusedOnLoad: c === active
      })),
      lead: Math.min(...[...f.querySelectorAll('label, input, textarea, select, button')].filter(vis).map((e) => e.getBoundingClientRect().top)) - r.top,
      headings: [...f.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(vis).map((h) => norm(h.innerText).toLowerCase()).slice(0, 4),
      linksIn: [...f.querySelectorAll('a[href]')].filter(vis).length,
      links: [...new Set(links)].slice(0, 12),
      focusedOnLoad: f.contains(active) && active !== document.body
    })
  }
  return out
}

/**
 * The focus look of the first text-like field of the n-th visible form: border, outline and shadow before and after focus().
 * Run by index of `formsInPage`. Returns null when the field cannot take focus.
 */
export function focusProbe(n) {
  const vis = (e) => {
    const cs = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const forms = [...document.querySelectorAll('form, [role=search]')].filter((f) => (f.tagName === 'FORM' || !f.querySelector('form')) && vis(f))
  const f = forms[n]
  if (!f) return null
  const c = [...f.querySelectorAll('input, textarea')].find((e) => !['hidden', 'submit', 'button', 'checkbox', 'radio', 'image', 'file', 'reset'].includes(e.type) && vis(e))
  if (!c) return null
  const read = () => {
    const s = getComputedStyle(c)
    return { border: s.borderTopColor, borderWidth: s.borderTopWidth, outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, outlineColor: s.outlineColor, shadow: s.boxShadow }
  }
  const was = document.activeElement
  c.blur()
  const before = read()
  c.focus({ preventScroll: true })
  const after = read()
  if (was && was !== c) was.focus?.({ preventScroll: true })
  else c.blur()
  return { before, after }
}

/** Text blocks (excerpts, card text) with their rendered words and the words a line clamp leaves visible, and labelled controls with their type. */
export function textInPage() {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  const vis = (e) => {
    const cs = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
  }
  // header and footer by element or role, else by an id/class of that name in the place such a region stands (a T4 template draws its footer in a div#t4-footer)
  const docH = document.documentElement.scrollHeight
  const regionOf = (e) => {
    if (e.closest('header, [role=banner]')) return 'header'
    if (e.closest('footer, [role=contentinfo]')) return 'footer'
    if (e.closest('aside, [role=complementary]')) return 'aside'
    for (let p = e; p && p !== document.body; p = p.parentElement) {
      if (p.matches('main, article, [role=main]')) return 'main'
      const tag = `${p.id} ${typeof p.className === 'string' ? p.className : ''}`.toLowerCase()
      const pr = p.getBoundingClientRect()
      const top = pr.top + scrollY
      if (/(^|[\s_-])footer($|[\s_-])/.test(tag) && top + pr.height / 2 > docH * 0.5) return 'footer'
      if (/(^|[\s_-])header($|[\s_-])/.test(tag) && top < 250) return 'header'
    }
    return 'main'
  }
  const landOf = regionOf
  // the words a visitor reads: those that sit above the lower edge of the block and of every ancestor that hides what does not fit
  // (overflow hidden, a line clamp on the card's text wrapper)
  const clampedText = (e) => {
    let bottom = e.getBoundingClientRect().bottom
    for (let p = e.parentElement, n = 0; p && p !== document.body && n < 5; p = p.parentElement, n++) {
      if (getComputedStyle(p).overflowY !== 'visible') bottom = Math.min(bottom, p.getBoundingClientRect().bottom)
    }
    // nothing hides any of it: the page text is what is read
    if (!(e.scrollHeight > e.clientHeight + 2) && bottom >= e.getBoundingClientRect().bottom - 1) return { text: norm(e.innerText), clipped: false }
    const words = []
    let cut = false
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      for (const m of n.data.matchAll(/\S+/g)) {
        const range = document.createRange()
        range.setStart(n, m.index)
        range.setEnd(n, m.index + m[0].length)
        const rr = range.getBoundingClientRect()
        if (rr.bottom <= bottom + 1) words.push(m[0])
        else cut = true
      }
    }
    return { text: norm(words.join(' ')), clipped: cut }
  }
  const blocks = []
  for (const e of document.body.querySelectorAll('p, li, div, span, a, blockquote, dd, figcaption')) {
    let own = 0
    for (const n of e.childNodes) if (n.nodeType === 3) own += norm(n.data).length
    if (own < 30 || !vis(e) || e.closest('script, style, noscript, nav')) continue
    const t = norm(e.innerText)
    let head = ''
    for (let p = e; p && p !== document.body && !head; p = p.parentElement) {
      for (let s = p.previousElementSibling; s; s = s.previousElementSibling) {
        const h = /^H[1-6]$/.test(s.tagName) ? s : s.querySelector?.('h1, h2, h3, h4, h5, h6')
        if (h) {
          head = norm(h.innerText).slice(0, 40)
          break
        }
      }
    }
    const c = clampedText(e)
    // the block is marked so that the browser can be asked which fonts painted it (readStatic); the mark changes nothing a visitor sees
    e.setAttribute('data-sweep-block', String(blocks.length))
    blocks.push({ n: blocks.length, land: landOf(e), head, tag: e.tagName.toLowerCase(), requested: getComputedStyle(e).fontFamily, fontStyle: getComputedStyle(e).fontStyle, fontWeight: getComputedStyle(e).fontWeight, fontStretch: getComputedStyle(e).fontStretch, text: t, visible: c.text, clipped: c.clipped })
    if (blocks.length >= 300) break
  }
  const styleOf = (e) => {
    const s = getComputedStyle(e)
    const ls = parseFloat(s.letterSpacing)
    return { size: parseFloat(s.fontSize), weight: Number(s.fontWeight) || (s.fontWeight === 'bold' ? 700 : 400), spacing: Number.isFinite(ls) ? ls : 0, transform: s.textTransform, family: s.fontFamily.split(',')[0].replace(/["']/g, '').trim() }
  }
  const labels = []
  const taken = new Set()
  // the internal page a control links to: the same link under other words is the same control
  const pathOf = (e) => {
    let a = e.closest('a[href]')
    // a line that holds exactly one link (Powered by <a>us</a>) goes where that link goes
    if (!a) {
      const inner = e.querySelectorAll('a[href]')
      a = inner.length === 1 ? inner[0] : null
    }
    if (!a) return ''
    try {
      const u = new URL(a.getAttribute('href'), location.href)
      return u.origin === location.origin && !/^(javascript|mailto|tel):/i.test(a.getAttribute('href')) ? u.pathname.replace(/\/+$/, '') + u.search : ''
    } catch {
      return ''
    }
  }
  const take = (kind, list) => {
    const seen = new Map()
    for (const e of list) {
      const text = norm(e.innerText || e.value)
      if (!text || text.length > 40 || !vis(e) || e.closest('script, style')) continue
      const k = `${kind}|${landOf(e)}|${text.toLowerCase()}`
      const n = seen.get(k) ?? 0
      seen.set(k, n + 1)
      const r = e.getBoundingClientRect()
      if (r.right < 0 || r.left > innerWidth) continue
      taken.add(e)
      // where it is drawn (page coordinates of its centre): the evidence a changed wording is paired by when no link or word does it
      labels.push({ kind, land: landOf(e), text, nth: n, path: pathOf(e), x: r.x + r.width / 2, y: r.y + scrollY + r.height / 2, ...styleOf(e) })
    }
  }
  const kindOf = (e) => (e.closest('[class*=breadcrumb i], [aria-label*=breadcrumb i], [id*=breadcrumb i]') ? 'breadcrumb' : e.closest('[class*=pagination i], [aria-label*=pagination i], [class*=pager i]') ? 'pagination' : 'nav')
  const navLinks = [...new Set(document.querySelectorAll('header nav a, [role=navigation] a, nav a, [class*=pagination i] a, [class*=pager i] a, [aria-label*=pagination i] a, [class*=breadcrumb i] a'))]
  for (const k of ['nav', 'breadcrumb', 'pagination']) take(k, navLinks.filter((e) => kindOf(e) === k))
  take('button', document.querySelectorAll('button, input[type=submit], [role=button], a[class*=btn], a[class*=button]'))
  // the logo in words: the link home of the header, or a box named for the logo / brand / site title, outermost only
  const logos = []
  for (const e of document.querySelectorAll('header a[href], [role=banner] a[href], [class*=logo i], [class*=brand i], [class*=site-title i], [class*=site-name i], [id*=logo i]')) {
    if (taken.has(e) || landOf(e) !== 'header' || e.closest('nav, [role=navigation], script, style')) continue
    if (e.tagName === 'A' && !/logo|brand|site-(title|name)/i.test(`${e.className} ${e.id} ${e.parentElement?.className ?? ''}`)) {
      // a link of the header that is no logo by name is the logo when it goes home
      let home = false
      try {
        const u = new URL(e.getAttribute('href'), location.href)
        home = u.origin === location.origin && (u.pathname === '/' || u.pathname === '') && !u.hash
      } catch {}
      if (!home) continue
    }
    if (logos.some((l) => l.contains(e) || e.contains(l))) continue
    logos.push(e)
  }
  take('logo', logos)
  // the short lines of the footer that no group above holds: a copyright line, a widget title, a contact line. A line is read WHOLE across
  // its inline children (Powered by <a>us</a> is one line of 13 characters, not "Powered by" and "us"); the box that holds it in block
  // children is not a line, its children are.
  const lines = []
  const inlineKid = (c) => /^inline/.test(getComputedStyle(c).display) || getComputedStyle(c).display === 'contents'
  for (const e of document.body.querySelectorAll('p, li, span, small, div, a, h1, h2, h3, h4, h5, h6, address, dt, dd, strong, b, em, i, label')) {
    if (taken.has(e) || e.closest('nav, [role=navigation], button, script, style, noscript')) continue
    if (lines.some((l) => l.contains(e)) || [...taken].some((t) => t.contains(e) || e.contains(t))) continue
    if (![...e.children].every(inlineKid)) continue
    const t = norm(e.innerText)
    if (t.length < 2 || t.length >= 30 || !/\p{L}/u.test(t) || landOf(e) !== 'footer') continue
    lines.push(e)
  }
  take('footer', lines)
  return { blocks, labels }
}
