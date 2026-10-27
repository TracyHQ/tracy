/**
 * The page half of the residue ledger: every piece of a page a template ships as demo material, read off the
 * DOM as text nodes and links. `demo-qa.js` keeps the template's pieces as the baseline's ledger and finds
 * those still shown after the agent's turn (`residueOf`); the web side plans the sweep that clears them.
 *
 * 🔒 IT READS WHAT A VISITOR CAN REACH, NOT ONLY WHAT IS ON SCREEN. A menu's Drinks and Dessert tabs are
 * hidden until clicked, so the visible-only blocks of `readInPage` never saw their dishes and their `$`
 * prices stayed through every check (lr-now, 24/10/2026). Hidden text is read and marked `hidden`.
 *
 * 🔒 ONE TEXT NODE IS ONE UNIT: the replace job matches words inside one text node (`replace.mjs`), so a
 * dish heading "Smoked Venison <span>$147</span>" is two units, its name and its price.
 *
 * Serialised by Playwright (`page.evaluate(readResidueInPage, {origin})`): it references nothing outside
 * itself. Tests call it with a parsed document.
 * @param {{origin?: string | null, filler?: string | null}} [args] `filler`: `FILLER_SOURCE` of `demo-qa.js`, a short
 *   line it matches is a unit wherever it stands.
 * @param {Document} [doc]
 */
export function readResidueInPage({ origin = null, filler = null } = {}, doc = document) {
  const MAX_UNITS = 1500
  const MAX_LINKS = 300
  // 🔒 A TEXT IS READ WHOLE, UP TO THE REPLACE JOB'S VALUE LIMIT (`REPLACE_VALUE_MAX`, 25/10/2026): a read that kept a
  // text's first 500 characters left the rest of a long template paragraph as sample text after the sweep replaced
  // its head. The sweep replaces a long text part by part (`residue-sweep.js`).
  const TEXT_MAX = 2000
  const SKIP =
    'script,style,template,noscript,svg,nav,[role="navigation"],.wp-block-navigation,form,.menu-item,select,textarea,' +
    '.screen-reader-text,.sr-only,.visually-hidden'
  const BLOCK = 'p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption,blockquote,dt,dd,address'
  const BUTTON = /\b(btn|button|cta)\b|wp-block-button__link|wp-element-button/i
  const BOOKING = /\b(?:book|reserv|table|order|appointment)|đặt/i
  const PRICE =
    /^(?:(?:[$€£₫]|usd|vnd|eur)\s*\d[\d.,]*|\d[\d.,]*\s*(?:[$€£₫]|đ|usd|vnd|eur|k))(?:\s*[-–/]\s*\S+)?$/i
  // 🔒 A DATE IS READ IN THE PAGE'S OWN LANGUAGE, NEVER A HAND LIST (product owner, 24/10/2026): month and weekday
  // names come from `Intl` for the page's `<html lang>` and English, so "24. Oktober 2026", "24 tháng 10, 2026" and
  // "piątek, 24 października 2026" are dates on any site, in whatever language `Intl` knows.
  const NAMES = (() => {
    const tags = ['en', 'en-GB']
    const lang = doc.documentElement?.getAttribute?.('lang')?.trim()
    try {
      if (lang) tags.unshift(...Intl.DateTimeFormat.supportedLocalesOf([lang]))
    } catch {}
    const months = new Set()
    const weekdays = new Set()
    for (const tag of tags)
      for (let m = 0; m < 12; m++) {
        const name = (o) => new Intl.DateTimeFormat(tag, { timeZone: 'UTC', ...o })
        const day = new Date(Date.UTC(2026, m, 15, 12))
        for (const month of ['long', 'short']) {
          months.add(name({ month }).format(day))
          // The month as a date says it ("października" beside a day, not the calendar's "październik").
          const part = name({ day: 'numeric', month })
            .formatToParts(day)
            .find((p) => p.type === 'month')
          if (part) months.add(part.value)
        }
        // 4 to 10 January 2026 is one week, Sunday to Saturday.
        if (m < 7)
          for (const weekday of ['long', 'short'])
            weekdays.add(name({ weekday }).format(new Date(Date.UTC(2026, 0, 4 + m, 12))))
      }
    // A name as a pattern, bounded where it starts or ends with a letter or a digit, longest first ("tháng 10"
    // before "tháng 1").
    const pattern = (names) =>
      [...names]
        .map((n) => n.trim().toLowerCase().replace(/\.$/, ''))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .map((n) => {
          const edge = (c) => (/\p{L}/u.test(c) ? '\\p{L}' : /\p{N}/u.test(c) ? '\\p{N}' : '')
          const [head, tail] = [edge(n[0]), edge(n.at(-1))]
          return `${head ? `(?<!${head})` : ''}${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.?${tail ? `(?!${tail})` : ''}`
        })
        .join('|')
    return { month: pattern(months), weekday: pattern(weekdays) }
  })()
  const MONTH = `(?:${NAMES.month})`
  const DAY = '\\d{1,2}(?:st|nd|rd|th|er|e|\\.|日)?'
  const YEAR = '(?:19|20)\\d{2}年?'
  const SEP = '[\\s,./-]*'
  const DATE_AT = `(?:\\d{1,2}[./-]\\d{1,2}[./-](?:19|20)\\d{2}|(?:19|20)\\d{2}[./-]\\d{1,2}[./-]\\d{1,2}|${MONTH}\\s*${DAY},?\\s+${YEAR}|${DAY}\\s*${MONTH},?\\s+${YEAR}|${YEAR}${SEP}${MONTH}${SEP}${DAY})`
  const DATE = new RegExp(`^${DATE_AT}$`, 'iu')
  const WEEKDAY = new RegExp(`${NAMES.weekday}`, 'giu')
  // A phone, an e-mail or a web address: a fact on its own, however short the line that shows it.
  const CONTACT_FACT = /^(?:\+?\(?\d[\d\s().-]{6,}\d|[^\s@]+@[^\s@]+\.\w+|(?:https?:\/\/|www\.)\S+)$/i
  const POST_HOLDER = 'article,li,.wp-block-post,.type-post,.hentry'
  const CARD = 'article,.wp-block-post,.type-post,.hentry'
  // A heading by its tag, or by the class a template styles a heading with (`p.section-sub.h2`).
  const HEADING_CLASS = /(?:^|\s)(?:h[1-6]|display-\d|[\w-]*(?:title|heading|headline)[\w-]*)(?:\s|$)/i
  const isHeading = (block) =>
    !!block && (/^H[1-6]$/.test(block.tagName) || HEADING_CLASS.test(classOf(block)))
  // 🔒 A PAGE'S LEAD IS EDITORIAL COPY THE AGENT WRITES (product owner, 24/10/2026): the short line right under a
  // heading (a banner's "Responsive WordPress theme for restaurant", a section's intro) says what the page or
  // section is about, so it is written from the research, never left as filler. Judged by the page's shape
  // alone: a block of at most LEAD_WORDS words right under a heading (`titleOf`), outside a card, on every CMS. Inside
  // an item only under the page's own title (an `h1`): a slideshow's slide is an item and its lead is the hero's
  // (lrsweep rig, 24/10/2026), while a card's line under its `h3` describes that card, not the page.
  const LEAD_WORDS = 30
  // The heading a lead sits under: the block's nearest non-empty sibling before it, or, for the first line of a
  // wrapper (`<header><h1/></header><div class="entry-content"><p>`), its wrapper's, up to two wrappers high.
  const titleOf = (block) => {
    let at = block
    for (let up = 0; up < 3 && at && at !== doc.body; up++, at = at.parentElement) {
      let e = at.previousElementSibling
      while (e && !squash(e.textContent)) e = e.previousElementSibling
      if (!e) continue
      const only = e.children.length === 1 ? e.firstElementChild : null
      if (isHeading(e)) return e
      return only && isHeading(only) && squash(only.textContent) === squash(e.textContent) ? only : null
    }
    return null
  }
  // 🔒 A GRID IS KNOWN BY ITS BOXES' SHAPE, NEVER THEIR CLASS LIST (review 24/10/2026): `col first` beside `col
  // last`, `item-1` beside `item-2`. A box's shape is its tag, its first heading's level and whether words follow
  // that heading; a box with a sibling of the same shape is one of a grid's cards, when the page lays the two out
  // on one row or their titles link (a list of posts). Two sections stacked one under the other are shaped alike
  // too (JA Diner's Reservation page, lrsweep rig 24/10/2026): each keeps its intro. A box the page does not lay
  // out (a hidden tab, a page read without layout) is judged by its shape alone.
  const TITLE = 'h1,h2,h3,h4,h5,h6,[class*="title"],[class*="heading"]'
  const shapeOf = (e) => {
    const title = e.querySelector(TITLE)
    if (!title) return null
    const level = /^H[1-6]$/.test(title.tagName) ? title.tagName : 'class'
    return `${e.tagName}|${level}|${squash(e.textContent).length > squash(title.textContent).length}`
  }
  const boxOf = (e) => {
    const r = e.getBoundingClientRect?.()
    return r && r.width > 0 && r.height > 0 ? r : null
  }
  // Side by side, or not laid out at all (a hidden tab, a page read without layout): then judged by shape alone.
  const oneRow = (a, b) => {
    const [ra, rb] = [boxOf(a), boxOf(b)]
    return !ra || !rb || (ra.top < rb.bottom - 1 && rb.top < ra.bottom - 1)
  }
  const linkedTitle = (e) =>
    !!e.querySelector('h1 a[href],h2 a[href],h3 a[href],h4 a[href],h5 a[href],h6 a[href]')
  const HEADINGS = 'h1,h2,h3,h4,h5,h6'
  // A box's or a block's rank: its highest heading's level (1 for an `h1`), 7 with none.
  const rankOf = (e) =>
    Math.min(
      7,
      ...(/^H[1-6]$/.test(e.tagName) ? [e] : [...e.querySelectorAll(HEADINGS)]).map((h) =>
        Number(h.tagName[1])
      )
    )
  // 🔒 A GRID IS KNOWN BY RANK, WHEREVER THE PAGE LAYS IT OUT (review 24/10/2026): boxes shaped alike under a nearer
  // heading of a higher rank that introduces them ("Our services" in an `h2` above `h3` boxes) are its cards, in a
  // row or stacked by a narrow screen. Boxes that each own the top-ranked heading of their part of the page are
  // sections, each with its intro, stacked like JA Diner's Reservation page (lrsweep rig, 24/10/2026). The nearest
  // heading before the group decides, however many wrappers lie between them (`<section><h2/><div class="container">
  // <div class="row">` cards), looked for no further than the group's own section; a page's `h1` titles the whole
  // page, never a grid.
  const introduced = (box, shape) => {
    const rank = rankOf(box)
    let child = box
    for (let at = box.parentElement; at && at !== doc.body; child = at, at = at.parentElement) {
      for (let s = child.previousElementSibling; s; s = s.previousElementSibling) {
        if (s.tagName === box.tagName && shapeOf(s) === shape) continue
        const level = rankOf(s)
        if (level < 7) return level > 1 && level < rank
      }
      if (isSection(at) || at.tagName === 'MAIN') break
    }
    return false
  }
  const repeated = (e) => {
    const shape = e.parentElement ? shapeOf(e) : null
    const like = shape
      ? [...e.parentElement.children].filter(
          (o) => o !== e && o.tagName === e.tagName && shapeOf(o) === shape
        )
      : []
    // Beside the rank, two boxes the page lays out on one row (a footer's columns, no heading above them), or
    // whose titles link (a list of posts), are a grid's.
    return (
      like.length > 0 &&
      (introduced(e, shape) || like.some((o) => oneRow(e, o) || (linkedTitle(e) && linkedTitle(o))))
    )
  }
  // A page's section: a `<section>`, or a box a template classes `*-section` (`t3-section`), never `section-title`.
  const isSection = (e) =>
    e.tagName === 'SECTION' ||
    classOf(e)
      .split(/\s+/)
      .some((c) => /(?:^|[-_])section$/i.test(c))
  // 🔒 A CARD'S LINE DESCRIBES THE CARD, NEVER THE PAGE (review 24/10/2026): a box classed `*card*`, a post box
  // (`article`, `.hentry`…) listed beside others or whose title links its post, or any box between the line and
  // its section repeated beside boxes of its shape: a features grid, a team's members under their `h2` names, a
  // footer's columns (lrsweep rig, 24/10/2026: "Head Sommelier", the footer's address). A page wrapped in its own
  // `<article>` is no card, nor are a page's sections shaped alike, each with its heading and its intro.
  const inCard = (block, title) => {
    if (block.closest('[class*="card"]')) return true
    const holder = block.closest(CARD)
    if (holder && (repeated(holder) || linkedTitle(holder))) return true
    if (title.tagName === 'H1') return false
    for (let e = block.parentElement; e && e !== doc.body && !isSection(e); e = e.parentElement)
      if (repeated(e)) return true
    return false
  }
  // A short line that labels rather than says: a badge, a button, or one that holds a link or a `<time>`.
  const META = /meta|date|time|categor|tag|label|badge|byline|author|eyebrow|kicker|price|btn|button|cta/i
  // "Recipes, Drinks", "Recipes | Drinks": two or more names of one or two words each, set apart by a separator;
  // never a lead, however many names it lists.
  const listLine = (text) => {
    const parts = text.split(/\s*[,|/·•]\s*/).filter(Boolean)
    return parts.length > 1 && parts.every((part) => words(part) <= 2 && !/\d/.test(part))
  }
  const labelLine = (block) => {
    if (block.querySelector('a[href],button,time')) return true
    for (let e = block; e && e !== doc.body; e = e.parentElement) {
      if (META.test(classOf(e)) || [...e.children].some((c) => META.test(classOf(c)))) return true
      if (e.parentElement && squash(e.parentElement.textContent) !== squash(e.textContent)) break
    }
    return false
  }
  // 🔒 A POST'S METADATA IS NEVER ITS LEAD, WHATEVER ITS LENGTH OR CLASS (review 24/10/2026): a byline ("By Admin",
  // "Posted by Admin on October 24, 2026"), a date ("Friday, October 24, 2026"), a count ("3 comments so far
  // today"), a line naming its author by `rel`/`itemprop` or linking the comments, or any line inside the post's
  // meta box (`.entry-meta`, `.post-meta`, `.byline`), however the line itself is classed.
  const BYLINE = /^(?:(?:posted|written|published)\s+(?:by|on|in)|by)\s/i
  // The few words that say "by" before a name, in the interface languages (de, fr/es, it, nl, vi), read only where
  // the markup says nothing: a byline names its author by `rel`/`itemprop` or a class in any language. Only before
  // one to three capitalised names, at most one word after the line's start ("Von Anna Holm", "Đăng bởi Admin"), so
  // "Par ici la bonne cuisine" stays words. Chinese says it with a colon ("作者：张三").
  const BY_WORD = /^(?:von|par|por|da|di|door|bởi)$/i
  const namedBy = (text) => {
    if (/^(?:作者|文)\s*[:：]/.test(text)) return true
    const w = text.split(' ')
    const at = BY_WORD.test(w[0]) ? 1 : w.length > 1 && BY_WORD.test(w[1]) ? 2 : 0
    const names = w.slice(at)
    return at > 0 && names.length >= 1 && names.length <= 3 && names.every((n) => /^\p{Lu}/u.test(n))
  }
  // A box classed for a post's stamp, whose words are all the line's: `<span class="author vcard">`, `.posted-on`.
  const STAMP_CLASS =
    /(?:^|[-_\s])(?:meta|byline|author|date|posted|published|updated|time|comments?)(?:$|[-_\s])/i
  const stampBox = (block, text) => {
    for (let e = block; e && e !== doc.body; e = e.parentElement) {
      if (squash(e.textContent) !== text) break
      if (STAMP_CLASS.test(classOf(e))) return true
    }
    return [...block.querySelectorAll('[class]')].some(
      (e) => STAMP_CLASS.test(classOf(e)) && squash(e.textContent) === text
    )
  }
  const META_BOX = /(?:^|[-_\s])(?:meta|byline)(?:$|[-_\s])/i
  // A count of a post's responses: a number and one word ("12 likes"), or a number (or "no") before what a post
  // counts ("3 comments so far today", "3 min read"), or that name before its number ("Comments (3)").
  // Beside English, the one count every blog shows in the interface languages, its comments ("3 Kommentare",
  // "3 commentaires", "3 bình luận", "3 条评论"), and a reading time ("5 Min. Lesezeit"); a number with one word
  // after it is a count in any language.
  const COUNTED =
    /comments?|repl(?:y|ies)|responses?|views?|likes?|shares?|min(?:ute)?s?\s+read|\p{L}*(?:comment|komment|coment)\p{L}*|reacties?|bình luận|条?评论|則?評論|min\.?\s+(?:lesezeit|leestijd|đọc|de lecture|di lettura|de lectura)/u
      .source
  const COUNT_AT = `(?<!\\p{L})(?:\\d[\\d.,]*|no|one)\\s*(?:${COUNTED})(?!\\p{L})|\\b(?:comments?|replies|responses|views|likes)\\s*\\(\\d[\\d.,]*\\)`
  const COUNT = new RegExp(`^(?:\\d[\\d.,]*\\s+\\S+$|${COUNT_AT})`, 'iu')
  const STAMP_IN = new RegExp(`${DATE_AT}|${COUNT_AT}`, 'giu')
  // What joins a post's stamps: a clock time, "by", "on", "in", "at", and the marks between its parts.
  const JOINERS =
    /\b\d{1,2}[:.]\d{2}(?:\s*[ap]\.?m\.?)?|\b(?:posted|written|published|updated|by|on|in|at)\b/gi
  // A line made of a post's stamps: once its dates (a `<time>`'s words too) and counts are taken out, with what
  // joins them, at most two words are left, or a list of names ("Friday, October 24, 2026 — 3 Comments",
  // "October 24, 2026 by Admin in Recipes", "Oct 24, 2026 / Admin / Recipes / Drinks", "Oct 24, 2026 at 7:00 pm").
  const stampLine = (block, text) => {
    let rest = text.replace(STAMP_IN, ' ')
    let found = rest !== text
    for (const time of block.querySelectorAll('time,[datetime]')) {
      const said = squash(time.textContent)
      if (said && rest.includes(said)) [rest, found] = [rest.replace(said, ' '), true]
    }
    if (!found) return false
    rest = squash(rest.replace(WEEKDAY, ' ').replace(JOINERS, ' '))
    return words(rest.replace(/[,|/·•:;()\u2013\u2014-]+/g, ' ')) <= 2 || listLine(rest)
  }
  const metaLine = (block, text) => {
    // Markup first, in any language: a line of digits and marks only ("12 · 3"), a box classed for a stamp, a link
    // to the comments, an author, tag or category by `rel`, a date or an author by microdata. Then words.
    if (!/\p{L}/u.test(text) || stampBox(block, text)) return true
    if (block.querySelector('a[href*="#comment"],a[href*="#respond"]')) return true
    if (
      block.querySelector(
        '[rel~="author"],[rel~="tag"],[rel~="category"],[itemprop~="author"],[itemprop~="datePublished"],' +
          '[itemprop~="dateModified"],[itemprop~="dateCreated"],[itemprop~="commentCount"]'
      )
    )
      return true
    if (BYLINE.test(text) || namedBy(text) || COUNT.test(text) || stampLine(block, text)) return true
    for (let e = block; e && e !== doc.body; e = e.parentElement) if (META_BOX.test(classOf(e))) return true
    return false
  }
  const LEAD_MIN_WORDS = 2
  // 🔒 A HEADING UNDER FOUR WORDS CAN NAME THE TEMPLATE'S BUSINESS (The Willow Nook build 13, 25/10/2026): About's
  // `h5` "Meet Three BroomSticks" was never read, so no check and no sweep saw the template's name. A heading of two
  // or three words with two capitalised words in a row is kept as `short`; the judge keeps it only when it holds a
  // name the template's sentences use (`residueOf`), so "Our rooms" and "Discover Our Menu" stay the frame.
  const shortName = (block, text, blockWords) =>
    blockWords >= 2 && blockWords < 4 && isHeading(block) && /\p{Lu}\p{L}*\s+\p{Lu}/u.test(text)
  const leadOf = (block, item, blockWords) => {
    if (blockWords > LEAD_WORDS || isHeading(block)) return false
    const text = squash(block.textContent)
    if (metaLine(block, text) || listLine(text)) return false
    const title = titleOf(block)
    if (!title || (item && title.tagName !== 'H1') || inCard(block, title)) return false
    // 🔒 Under four words a line is a lead only when it labels nothing ("Since 1998, Copenhagen", review
    // 24/10/2026); a badge or a button under a title stays what it is. Dates, counts, bylines and lists of names
    // are no lead at any length (`metaLine`, `listLine`).
    return blockWords >= 4 || (blockWords >= LEAD_MIN_WORDS && !labelLine(block))
  }
  const POST_TITLE = '[class*="post-title"] a[href], [class*="entry-title"] a[href], h2 a[href], h3 a[href]'
  const squash = (s) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  const classOf = (el) =>
    typeof el.className === 'string' ? el.className : (el.getAttribute?.('class') ?? '')
  const one = (e) =>
    e.tagName.toLowerCase() +
    (e.id ? `#${e.id}` : '') +
    classOf(e)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((c) => `.${c}`)
      .join('')
  const sel = (el) =>
    el.parentElement && el.parentElement !== doc.body ? `${one(el.parentElement)} > ${one(el)}` : one(el)
  // The elements holding a text's words, nearest first, up to its block and any link or button around it: the sweep
  // reads a slot by its nearest meaningful element (`slotOf`, `residue-sweep.js`), and `sel` keeps two. Null when it
  // says no more than `sel` (`h3 > strong > em` reads as `strong > em` there; a heading inside a card's link as `div > h3`).
  const holderOf = (el, block) => {
    const tags = []
    for (let e = el; e && e !== doc.body && tags.length < 8; e = e.parentElement) {
      tags.push(e.tagName.toLowerCase())
      if (e === block) break
    }
    const around = el.closest('a,button')
    if (around && !tags.includes(around.tagName.toLowerCase())) tags.push(around.tagName.toLowerCase())
    const named = el.parentElement && el.parentElement !== doc.body ? [el, el.parentElement] : [el]
    return tags.every((t, i) => named[i]?.tagName.toLowerCase() === t) ? null : tags
  }
  const hidden = (el) =>
    typeof el.checkVisibility === 'function'
      ? !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : false
  const words = (s) => squash(s).split(' ').filter(Boolean).length
  const FILLER = typeof filler === 'string' && filler !== '' ? new RegExp(filler, 'u') : null
  const isFiller = (s) => FILLER !== null && words(s) <= 12 && FILLER.test(squash(s).toLowerCase())
  // A dish or a menu row: an element classed `item` or `*-item` (`dish-item`), never a nav menu's `menu-item`.
  const itemOf = (el) => {
    for (let e = el; e && e !== doc.body; e = e.parentElement)
      if (
        /(?:^|\s)(?:[\w-]+-)?item(?:\s|$)/.test(classOf(e)) &&
        !/(?:^|\s)menu-item(?:\s|$)/.test(classOf(e))
      )
        return e
    return null
  }
  // Which field of a dish a text node fills, by the classes between it and the item, then by its tag.
  const fieldOf = (el, item, text) => {
    for (let e = el; e && e !== item.parentElement; e = e.parentElement) {
      const c = classOf(e)
      if (/price|cost/i.test(c)) return 'price'
      if (/desc|text|excerpt|ingredient|detail/i.test(c)) return 'desc'
      if (/name|title/i.test(c)) return 'name'
    }
    if (PRICE.test(text)) return 'price'
    const block = el.closest(BLOCK)
    return block && /^H\d$/.test(block.tagName) ? 'name' : 'desc'
  }
  // The post a date's card links, looked for no higher than the card or article holding the date: a single
  // post's header date must not take a related post's link from beside it (review 24/10/2026).
  const postOf = (el) => {
    let e = el
    for (let up = 0; up < 6 && e && e !== doc.body; up++, e = e.parentElement) {
      const a = e.querySelector?.(POST_TITLE)
      if (a) return a.getAttribute('href')
      if (e.matches?.(POST_HOLDER)) break
    }
    return null
  }
  // A block's words as a visitor reads them: a line break is a space, and words a screen reader alone hears
  // are none.
  const textOf = (block) => {
    let out = ''
    const all = doc.createTreeWalker(block, 5)
    for (let n = all.nextNode(); n; n = all.nextNode()) {
      if (n.nodeType === 1 && n.tagName === 'BR') out += ' '
      else if (n.nodeType === 3 && !n.parentElement?.closest(SKIP)) out += n.nodeValue
    }
    return squash(out)
  }
  const site = origin ?? globalThis.location?.origin ?? null
  // A link to a page of this site, the only place a post lives.
  const ownLink = (href) => {
    try {
      return site !== null && new URL(href, site).origin === site
    } catch {
      return false
    }
  }
  const body = doc.body
  const units = []
  const dishItems = new Set()
  const blocks = new Map()
  const walker = doc.createTreeWalker(body, 4)
  for (let node = walker.nextNode(); node && units.length < MAX_UNITS; node = walker.nextNode()) {
    const text = squash(node.nodeValue)
    const el = node.parentElement
    if (!text || !el || !/[\p{L}\p{N}]/u.test(text) || el.closest(SKIP)) continue
    const link = el.closest('a')
    if (link && BUTTON.test(classOf(link))) continue
    const item = itemOf(el)
    // A dish of the menu, priced or not (a filled dish may hold its neutral name with no price element).
    if (
      item &&
      (/dish|food|drink|price/i.test(classOf(item)) || item.querySelector('[class*="price"],[class*="dish"]'))
    )
      dishItems.add(item)
    const block = el.closest(BLOCK)
    // 🔒 A LINK'S SHORT WORDS ARE A LABEL ("Read More"), NEVER A FACT (lrsweep rig, 24/10/2026); a heading's link
    // is a card's title, naming the post it links, and a link of a sentence ("Reserve with OpenTable today") is one.
    // Counted as a visitor reads them: "Read More: <the post's title>" for a screen reader is still two words. An
    // address shown as a link (`Info@example.com`, `www.example.com`, a phone) is a fact, never a label.
    const linkText = link ? textOf(link) : ''
    if (link && !isHeading(block) && words(linkText) < 4 && !CONTACT_FACT.test(linkText)) continue
    const blockText = block ? textOf(block) : ''
    const blockWords = words(blockText)
    const lead = !!block && !link && leadOf(block, item, blockWords)
    if (block && !blocks.has(block)) blocks.set(block, blocks.size)
    const holder = holderOf(el, block)
    // Every kind carries the block its words sit in, as a text does: the sweep reads the slot from it (`slotOf`).
    const base = {
      text: text.slice(0, TEXT_MAX),
      selector: sel(el),
      ...(block ? { block: blockText.slice(0, 500) } : {}),
      ...(holder ? { holder } : {}),
      ...(hidden(el) ? { hidden: true } : {})
    }
    if (DATE.test(text) || (el.tagName === 'TIME' && /\d{4}/.test(text))) {
      const post = postOf(el)
      units.push({ ...base, kind: 'date', ...(post ? { post } : {}) })
    } else if (item && item.querySelector('[class*="price"]')) {
      units.push({ ...base, kind: 'dish', field: fieldOf(el, item, text), item: sel(item) })
    } else if (PRICE.test(text)) {
      units.push({ ...base, kind: 'price' })
    } else if (
      block &&
      (blockWords >= 4 ||
        CONTACT_FACT.test(text) ||
        lead ||
        isFiller(text) ||
        shortName(block, text, blockWords))
    ) {
      const heading = isHeading(block)
      const short = blockWords < 4 && !lead && shortName(block, text, blockWords)
      const href = link?.getAttribute('href') ?? null
      units.push({
        ...base,
        kind: 'text',
        block: blockText.slice(0, 500),
        b: blocks.get(block),
        ...(heading ? { heading: true } : {}),
        ...(short ? { short: true } : {}),
        ...(item || el.closest(CARD) ? { card: true } : {}),
        ...(lead ? { lead: true } : {}),
        ...(block.querySelector('a[href],button') ? { linked: true } : {}),
        // All a link's words: a link is never left without any (the replace job refuses to empty one).
        ...(link && squash(linkText) === text ? { label: true } : {}),
        // A heading's link, or a link that is all its line holds (a list of posts), names the post it opens. An
        // address shown as a link names no post, wherever it now leads ("http://vendor.com" sent to /contact-us/).
        ...(href &&
        (heading || (squash(linkText) === blockText && ownLink(href) && !CONTACT_FACT.test(linkText)))
          ? { post: href }
          : {})
      })
    }
  }
  // The block that shows the page's menu: the nearest element with an id that holds every dish (JA Diner's tabs
  // block, not one tab), so "View full menu" can lead to it (`demo-qa.js`); none, the page itself.
  let menu = null
  const dishes = [...dishItems]
  if (dishes.length > 0) {
    let anchor = null
    for (let e = dishes[0].parentElement; e && e !== body; e = e.parentElement)
      if (e.id && dishes.every((d) => e.contains(d))) {
        anchor = e.id
        break
      }
    menu = { anchor, dishes: dishes.length }
  }
  const links = []
  for (const a of body.querySelectorAll('a[href]')) {
    if (links.length >= MAX_LINKS) break
    if (a.closest('script,template,form')) continue
    const href = a.getAttribute('href') ?? ''
    let off = false
    try {
      const u = new URL(href, site ?? 'https://site.invalid')
      off = /^https?:$/.test(u.protocol) && site !== null && u.origin !== site
    } catch {
      continue
    }
    const button = BUTTON.test(classOf(a))
    if (!button && !off) continue
    const text = squash(`${a.textContent ?? ''} ${a.getAttribute('aria-label') ?? ''}`)
    links.push({
      href,
      text: text.slice(0, 80),
      selector: sel(a),
      ...(button ? { button } : {}),
      ...(BOOKING.test(text) && words(text) <= 6 ? { booking: true } : {}),
      ...(off ? { off } : {}),
      ...(a.closest('nav,[role="navigation"],.wp-block-navigation') ? { nav: true } : {}),
      ...(hidden(a) ? { hidden: true } : {})
    })
  }
  return { units, links, ...(menu ? { menu } : {}) }
}
