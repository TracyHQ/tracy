// Explain where an UNMATCHED item comes from:
//   a = in the Joomla DB but not in the content map (capture hole)
//   b = hard-coded in template files / template language / T4 settings (template hole)
//   c = Joomla core, framework or language-pack string (acceptable, noted)
//   d = not found anywhere we can see (investigate)
//   e = a shop's catalogue (VirtueMart products, categories, manufacturers, prices, product media): the
//       shop owner's inventory, managed in the shop component, never a content contract slot (listed, never blocking)
import { searchDb } from './db-index.mjs'
import { searchSources, receiverLanguage, receiverProducer } from './sources.mjs'
import { normText, compact } from './normalize.mjs'
import { videoId, isRenderedDate } from './match.mjs'
import { physicalReceivers } from './items.mjs'

const UPLOADS = 'wp-content/uploads/'
/** A size WordPress generated from an upload (`cake-300x200.jpg`, `cake-scaled.jpg`): the upload, then the extension. */
const WORDPRESS_SIZE = /^(.+?)-(?:\d+x\d+|scaled)(\.[a-z0-9]+)$/i

const cut = (s) => String(s).slice(0, 200)
// Strings Joomla core or the framework generate whatever the site is (when no language file is given).
const CORE_TEXT =
  /^(read more( \.\.\.)?|read more:.*|search|search \.\.\.|prev|previous|next|start|end|home|you are here:?|page \d+ of \d+|written by|published:?|hits:?|category:?|details|back to top|toggle navigation|close|menu|skip to main content|share|tags:?|more articles|\d+ (min|mins|minutes) read|skip to content|leave a comment|search for:?|comments?|reply|log in|proudly powered by wordpress|powered by wordpress)$/

function describeDbHit(h, contract) {
  const entity = contract.entityOfRow(h.table, h.id, h.row)
  const field = h.path.length ? `${h.column} -> ${h.path.join('.')}` : h.column
  let note
  const lockedRow = entity ? contract.lock.entities?.[entity] : null
  const locked = !!lockedRow && Object.prototype.hasOwnProperty.call(lockedRow, h.column)
  if (entity && locked)
    note = `row is contract entity ${entity}, field pinned by the presentation lock with no slot (locked, not editable)`
  else if (entity)
    note = `row is contract entity ${entity}, but this field has no slot and is not in the lock`
  else if (h.table === 'configuration.php')
    note = 'global configuration (configuration.php), never in the contract'
  else note = 'row is not a contract entity at all'
  const kind = h.row?.module
    ? ` (${h.row.module}${h.row.title ? ` "${String(h.row.title).slice(0, 40)}"` : ''})`
    : ''
  return { where: `${h.table}#${h.id}.${field}${kind}`, exact: h.exact, note, entity: entity ?? null, locked }
}

/** A shop catalogue's tables and media: VirtueMart keeps every product, category, manufacturer and price there. */
const CATALOGUE_TABLE = /^virtuemart_/
const CATALOGUE_MEDIA = /^(images\/(stories\/)?virtuemart\/|components\/com_virtuemart\/)/
const catalogue = (label, evidence = []) => ({ class: 'e', label: `shop catalogue: ${label}`, evidence })

export function createClassifier(contract, dbIndex, sourceIndex) {
  const cache = new Map()
  const tpl = contract.template.toLowerCase()

  function fromSources(query) {
    if (!sourceIndex) return null
    const hits = searchSources(sourceIndex, query)
    if (!hits.length) return null
    const h = hits[0]
    return {
      class: h.origin.cls,
      label: h.origin.label,
      evidence: hits.map((x) => (x.key ? `${x.file} ${x.key}="${x.value.slice(0, 80)}"` : x.file))
    }
  }
  function fromDb(query) {
    if (!dbIndex) return null
    const hits = searchDb(dbIndex, query)
    if (!hits.length) return null
    const d = hits.map((h) => describeDbHit(h, contract))
    // Found only in the catalogue's own tables: a product, category or manufacturer row, not page copy.
    if (hits.every((h) => CATALOGUE_TABLE.test(h.table)))
      return catalogue(
        'VirtueMart table',
        d.map((x) => x.where)
      )
    return {
      class: 'a',
      label: d[0].note,
      lockState: d[0].locked ? 'locked' : 'undeclared',
      evidence: d.map((x) => `${x.where}${x.exact ? '' : ' (contains)'}`)
    }
  }

  const templateLanguage = new RegExp(
    `^(?:language/[^/]+/(?:[^/]+\\.)?tpl_${tpl}\\.ini|templates/${tpl}/language/[^/]+/(?:[^/]+\\.)?tpl_${tpl}\\.ini)$`
  )
  const coreLanguage = /^language\/[^/]+\/joomla\.ini$/
  const labelKeys = [
    'COM_USERS_LOGIN_USERNAME_LABEL',
    'JGLOBAL_PASSWORD',
    'COM_USERS_REGISTER_NAME_LABEL',
    'COM_USERS_PROFILE_PASSWORD1_LABEL'
  ]
  const labelValues = new Set(
    (sourceIndex?.ini ?? []).filter((s) => labelKeys.includes(s.key)).map((s) => normText(s.value))
  )
  const generatedSelector =
    /\.(?:hx-author__meta|hx-related__m|hx-auaside__meta|hx-bloglist__count|hx-blogdate|hx-blogdate__m|hx-blogdatetxt|hx-blogmeta)(?=[:. >]|$)|^#(?:username|password|jform_name|jform_password1)-lbl$/

  function generated(item, context, match) {
    if (
      contract.platform !== 'joomla' ||
      !sourceIndex ||
      item.inCode ||
      typeof item.codeText === 'string' ||
      item.kind !== 'text'
    )
      return null
    const copies = physicalReceivers(item)
    if (!copies) return null
    const selectors = [item.selector, ...copies.map((c) => c.selector)]
    const receiver = (re) => selectors.length > 0 && selectors.every((s) => re.test(s))
    const producer = (file, ...expressions) =>
      receiverProducer(
        sourceIndex,
        file,
        ...expressions.map((re) => new RegExp(re.source, re.flags.includes('i') ? re.flags : re.flags + 'i'))
      )

    const language = (key, file = coreLanguage) => {
      const found = receiverLanguage(
        sourceIndex,
        key,
        sourceIndex.ini.some((s) => s.key === key && templateLanguage.test(s.rel)) ? templateLanguage : file
      )
      return found ? { ...found, key } : null
    }
    const canonical = (value) => normText(value).replaceAll('·', '.')
    const norm = canonical(item.value)
    const base = `templates/${tpl}/html/com_content/`
    const proved = (file, label, ...langs) => {
      const evidence = [`source-bound ${label}: ${file}`, ...langs.flatMap((l) => l.evidence)]
      const template = langs.filter((l) => l.class === 'b')
      const owned = template.every((l) => {
        const keys = (match.slots ?? []).filter((key) => {
          const slot = contract.slotsByKey.get(key)
          const entity = slot && contract.entityByKey.get(slot.entity)
          const identity = entity?.identity
          return (
            slot?.type === 'text' &&
            slot.column === 'value' &&
            entity?.kind === 'languageString' &&
            identity?.extension === `tpl_${tpl}` &&
            identity.key === l.key &&
            canonical(slot.sample) === canonical(l.value) &&
            l.evidence.some(
              (e) => e.includes(`/${identity.language}/`) || e.includes(`/${identity.language}.override.ini `)
            )
          )
        })
        return new Set(keys).size === 1
      })
      // The formula proves only generated numbers/dates; every template word still needs its declared slot owner.
      if (template.length && owned)
        return {
          status: 'matched',
          by: 'source-bound declared language composite',
          slots: match.slots,
          evidence
        }
      return { class: template.length ? 'b' : 'c', label: `source-bound ${label}`, evidence }
    }
    if (
      tpl === 'ja_kinetic' &&
      item.tag === 'span' &&
      !item.attr &&
      ['desktop', 'phone'].every((vp) => Array.isArray(item.viewports?.[vp]?.receivers)) &&
      Object.values(item.viewports ?? {}).every((v) => Array.isArray(v?.receivers)) &&
      copies.every((c) => typeof c.value === 'string' && c.value === item.value)
    ) {
      const nth = '(?::nth-of-type\\([1-9][0-9]*\\))?'
      const archive = receiver(new RegExp(`\\bnav\\.hx-archmast__bc${nth} > span\\.hx-bc-tail${nth}$`))
      const author = receiver(new RegExp(`\\bnav\\.hx-author__bc${nth} > span\\.hx-author__bc-trail${nth}$`))
      const tag = receiver(
        new RegExp(`\\bnav\\.hx-author__bc\\.kinetic-tags-bc${nth} > span\\.hx-author__bc-trail${nth}$`)
      )
      if (archive || author || tag) {
        const breadcrumb = () => {
          let page, route
          try {
            page = new URL(context.url)
            route = decodeURIComponent(page.pathname)
              .replace(/^\/(?:index\.php\/?)?/, '')
              .replace(/\/$/, '')
          } catch {
            return null
          }
          const routing = ['option', 'view', 'layout', 'id', 'u_id', 'Itemid']
          if (routing.some((k) => page.searchParams.getAll(k).length > 1)) return null
          if ([...page.searchParams.keys()].some((k) => routing.some((r) => k.startsWith(r + '['))))
            return null
          const menus = contract.pages.flatMap((p) => {
            if (contract.entityByKey.get(p.entity)?.kind !== 'menuItem' || !p.link) return []
            try {
              const parsedLink = new URL(p.link, page)
              return parsedLink.origin === page.origin &&
                routing.every((k) => parsedLink.searchParams.getAll(k).length <= 1)
                ? [{ ...p, parsedLink }]
                : []
            } catch {
              return []
            }
          })
          const exact = menus.filter((p) =>
            page.searchParams.has('Itemid')
              ? String(p.sourceId) === page.searchParams.get('Itemid')
              : p.route?.replace(/^\/|\/$/g, '') === route
          )
          if (exact.length > 1 || (page.searchParams.has('Itemid') && exact.length !== 1)) return null
          if (!exact.length && route && routing.some((k) => page.searchParams.has(k))) return null
          let mapped = exact[0],
            sefEntity = null
          const entities = [...contract.entityByKey.values()]
          if (!mapped && !routing.some((k) => page.searchParams.has(k))) {
            const found = []
            for (const p of menus) {
              const prefix = p.route?.replace(/^\/|\/$/g, '')
              if (!prefix || !route.startsWith(prefix + '/')) continue
              const link = p.parsedLink
              const tail = route.slice(prefix.length + 1)
              if (
                author &&
                link.searchParams.get('option') === 'com_content' &&
                link.searchParams.get('view') === 'author' &&
                link.searchParams.get('layout') === 'list' &&
                /^author\/[^/]+$/.test(tail) &&
                receiverProducer(
                  sourceIndex,
                  'plugins/system/t4/src/t4/MVC/Router/T4.php',
                  /preg_match\("\/\\\/author\\\/\(\.\*\?\)\(\\\/\|\\\?\|\\&\|\$\)\/",\s*\$uri->toString\(array\('path',\s*'query',\s*'fragment'\)\),\s*\$matches\)/,
                  /\$uid\s*=\s*intval\(\$this->getUserId\(\$matches\[1\]\)\)/,
                  /\$vars\['view'\]\s*=\s*'author'/,
                  /\$vars\['option'\]\s*=\s*'com_content'/,
                  /\$vars\['layout'\]\s*=\s*'author'/,
                  /\$vars\['id'\]\s*=\s*\$uid/,
                  /->from\('#__users'\)\s*->where\('username = '\s*\.\s*\$this->db->quote\(\$username\)\)/
                )
              ) {
                for (const entity of entities.filter(
                  (e) => e.kind === 'user' && e.identity?.username === tail.slice(7)
                ))
                  found.push({ mapped: p, entity })
              }
              if (
                tag &&
                link.searchParams.get('option') === 'com_tags' &&
                link.searchParams.get('view') === 'tags' &&
                /^[^/:,]+$/.test(tail) &&
                !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(tail.trim()) &&
                receiverProducer(
                  sourceIndex,
                  'components/com_tags/src/Service/Router.php',
                  /\$slug\s*=\s*\$this->fixSegment\(\$id\)/,
                  /\$vars\['view'\]\s*=\s*'tag'/,
                  /\$alias\s*=\s*str_replace\(':',\s*'-',\s*\$segment\)/,
                  /->from\((?:'#__tags'|\$this->db->quoteName\('#__tags'\))\)\s*->where\(\$this->db->quoteName\('alias'\)\s*\.\s*' = :alias'\)\s*->bind\(':alias',\s*\$alias\)/
                )
              ) {
                // Stock capture declares path: a single segment is an alias only under the nested-table producer.
                const stockPath =
                  receiverProducer(
                    sourceIndex,
                    'administrator/components/com_tags/src/Table/TagTable.php',
                    /class TagTable extends Nested\b/,
                    /parent::__construct\('#__tags',\s*'id',\s*\$db/
                  ) &&
                  receiverProducer(
                    sourceIndex,
                    'libraries/src/Table/Nested.php',
                    /\$query\s*=\s*\$db->createQuery\(\)\s*->select\('p.alias'\)\s*->from\(\$this->_tbl \. ' AS n, ' \. \$this->_tbl \. ' AS p'\)\s*->where\('n.lft BETWEEN p.lft AND p.rgt'\)\s*->where\('n\.' \. \$this->_tbl_key \. ' = ' \. \(int\) \$pk\)\s*->order\('p.lft'\);\s*\$db->setQuery\(\$query\);\s*\$segments\s*=\s*\$db->loadColumn\(\);/,
                    /if\s*\(!empty\(\$segments\) && \$segments\[0\] === 'root'\)\s*\{\s*array_shift\(\$segments\);\s*\}/,
                    /\$path\s*=\s*trim\(implode\('\/',\s*\$segments\),/,
                    /\$query->clear\(\)\s*->update\(\$this->_tbl\)\s*->set\('path = '\s*\.\s*\$db->quote\(\$path\)\)\s*->where\(\$this->_tbl_key \. ' = ' \. \(int\) \$pk\);\s*\$db->setQuery\(\$query\)->execute\(\);/
                  )
                const tagEntities = entities.filter(
                  (e) => e.kind === 'tag' && (e.identity?.alias === tail || e.identity?.path === tail)
                )
                if (tagEntities.length > 1) return null
                for (const entity of tagEntities) {
                  const identity = entity.identity ?? {}
                  if (
                    (Object.hasOwn(identity, 'alias') && identity.alias !== tail) ||
                    (Object.hasOwn(identity, 'path') && identity.path !== tail)
                  )
                    return null
                  if (identity.alias === tail || (identity.path === tail && stockPath))
                    found.push({ mapped: p, entity })
                }
              }
            }
            if (found.length !== 1) return null
            mapped = found[0].mapped
            sefEntity = found[0].entity
          }
          const link = mapped?.parsedLink
          const param = (key) => page.searchParams.get(key) ?? link?.searchParams.get(key)
          if (
            link &&
            ['option', 'view'].some(
              (k) => page.searchParams.has(k) && page.searchParams.get(k) !== link.searchParams.get(k)
            )
          )
            return null
          const declared = (l) => {
            if (!l) return null
            const owners = [...contract.slotsByKey.values()].filter((s) => {
              const e = contract.entityByKey.get(s.entity)
              return (
                s.type === 'text' &&
                s.column === 'value' &&
                !s.xpath &&
                !s.jsonPath &&
                !s.nestedJson &&
                !s.leaf &&
                e?.kind === 'languageString' &&
                e.identity?.extension === `tpl_${tpl}` &&
                e.identity.key === l.key &&
                l.evidence.some(
                  (v) =>
                    v.includes(`/${e.identity.language}/`) ||
                    v.includes(`/${e.identity.language}.override.ini `)
                )
              )
            })
            return owners.length === 1 && canonical(owners[0].sample) === canonical(l.value)
              ? owners[0]
              : null
          }
          const result = (file, langs, owner = null) => {
            const slots = langs.map(declared)
            if (slots.some((s) => !s)) return null
            return {
              status: 'matched',
              by: 'source-bound declared breadcrumb',
              slots: [...slots.map((s) => s.key), ...(owner ? [owner.key] : [])],
              evidence: [
                `source-bound breadcrumb: ${file}`,
                ...langs.flatMap((l) => l.evidence),
                ...(owner ? [`route entity: ${owner.entity}`] : [])
              ]
            }
          }
          if (archive) {
            const file = base + 'archive/default.php'
            const first = language('TPL_JA_KINETIC_BLOG_KICKER_CAP', templateLanguage)
            const last = language('TPL_JA_KINETIC_ARCHIVE_CRUMB', templateLanguage)
            if (
              mapped &&
              param('option') === 'com_content' &&
              param('view') === 'archive' &&
              (!param('layout') || param('layout') === 'default') &&
              first &&
              last &&
              norm === canonical(`/ ${first.value} / ${last.value}`) &&
              receiverProducer(
                sourceIndex,
                file,
                /<span class=["']hx-bc-tail["']>\s*\/\s*<\?php\s+echo\s+Text::_\(['"]TPL_JA_KINETIC_BLOG_KICKER_CAP['"]\);\s*\?>\s*\/\s*<\?php\s+echo\s+Text::_\(['"]TPL_JA_KINETIC_ARCHIVE_CRUMB['"]\);\s*\?>\s*<\/span>/
              )
            )
              return result(file, [first, last])
            return null
          }
          const kind = author ? 'user' : 'tag'
          const id = param('id')
          if (page.searchParams.has('u_id') && page.searchParams.get('u_id') !== id) return null
          const candidates = sefEntity
            ? [sefEntity]
            : /^[1-9][0-9]*$/.test(id ?? '')
              ? entities.filter((e) => e.kind === kind && String(e.sourceId) === id)
              : []
          if (candidates.length !== 1) return null
          const entity = candidates[0]
          if (
            !Number.isInteger(entity.sourceId) ||
            entity.sourceId < 1 ||
            entities.filter((e) => e.kind === kind && e.sourceId === entity.sourceId).length !== 1
          )
            return null
          const owners = [...contract.slotsByKey.values()].filter(
            (s) =>
              s.entity === entity.key &&
              s.type === 'text' &&
              s.column === (author ? 'name' : 'title') &&
              !s.xpath &&
              !s.jsonPath &&
              !s.nestedJson &&
              !s.leaf &&
              (!author || s.role === 'person.name')
          )
          if (owners.length !== 1) return null
          const owner = owners[0]
          const lang = language(
            author ? 'TPL_JA_KINETIC_AUTHORS_CRUMB' : 'TPL_JA_KINETIC_TAGS_CRUMB',
            templateLanguage
          )
          if (!lang || norm !== canonical(`/ ${lang.value} / ${owner.sample}`)) return null
          if (author) {
            const file = base + 'author/author.php'
            if (
              (sefEntity ||
                (param('option') === 'com_content' &&
                  param('view') === 'author' &&
                  param('layout') === 'author')) &&
              receiverProducer(
                sourceIndex,
                file,
                /\$author\s*=\s*\$this->author;/,
                /<span class=["']hx-author__bc-trail["']>\s*\/\s*<a class=["']hx-author__bc-link["'] href=["']<\?php echo \$authorsUrl; \?>["']>\s*<\?php echo Text::_\(['"]TPL_JA_KINETIC_AUTHORS_CRUMB['"]\); \?>\s*<\/a>\s*\/\s*<\?php echo \$this->escape\(\$author->name\); \?>\s*<\/span>/
              )
            )
              return result(file, [lang], owner)
          } else {
            const file = `templates/${tpl}/html/com_tags/tag/default.php`
            if (
              (sefEntity ||
                (param('option') === 'com_tags' &&
                  param('view') === 'tag' &&
                  (!param('layout') || param('layout') === 'default'))) &&
              receiverProducer(
                sourceIndex,
                file,
                /\$tagTitleHtml\s*=\s*HTMLHelper::_\('content.prepare',\s*\$this->tags_title,\s*'',\s*'com_tags.tag'\);/,
                /\$hxTagName\s*=\s*trim\(strip_tags\(\(string\) \$tagTitleHtml\)\);/,
                /<span class=["']hx-author__bc-trail["'] style=["'][^"']*["']>\s*\/\s*<a class=["']hx-author__bc-link["'] href=["']<\?php echo \$hxTagsUrl; \?>["'] style=["'][^"']*["']>\s*<\?php echo Text::_\(['"]TPL_JA_KINETIC_TAGS_CRUMB['"]\); \?>\s*<\/a>\s*\/\s*<\?php echo \$this->escape\(\$hxTagName\); \?>\s*<\/span>/
              )
            )
              return result(file, [lang], owner)
          }
          return null
        }
        const result = breadcrumb()
        if (result) return result
      }
    }
    const covered = (part) => contract.index.text.has(normText(part))
    const integer = (value, lang, minimum = 0) => {
      if (!lang || (lang.value.match(/%d/g) ?? []).length !== 1 || lang.value.replace('%d', '').includes('%'))
        return null
      const escaped = canonical(lang.value)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace('%d', '(0|[1-9][0-9]*)')
      const m = new RegExp(`^${escaped}$`).exec(value)
      return m && Number(m[1]) >= minimum ? Number(m[1]) : null
    }
    const month = (value, abbreviated) => {
      const found = []
      const file = 'libraries/src/Date/Date.php'
      for (const [index, key] of [
        'JANUARY',
        'FEBRUARY',
        'MARCH',
        'APRIL',
        'MAY',
        'JUNE',
        'JULY',
        'AUGUST',
        'SEPTEMBER',
        'OCTOBER',
        'NOVEMBER',
        'DECEMBER'
      ].entries()) {
        const lang = language(key + (abbreviated ? '_SHORT' : ''))
        if (!lang || canonical(lang.value) !== value) continue
        if (
          !receiverProducer(
            sourceIndex,
            file,
            abbreviated
              ? /monthToString\(parent::format\(['"]n['"]\),\s*true\)/
              : /monthToString\(parent::format\(['"]n['"]\)\)/,
            new RegExp(`Text::_\\(['"]${key}${abbreviated ? '_SHORT' : ''}['"]\\)`)
          )
        )
          continue
        found.push({ lang, number: index + 1 })
      }
      return found.length === 1 ? found[0] : null
    }
    const date = (value, abbreviated = false) => {
      const m = (
        abbreviated ? /^(0[1-9]|[12][0-9]|3[01]) (.+)$/ : /^(0[1-9]|[12][0-9]|3[01]) (.+) ([1-9][0-9]{3})$/
      ).exec(value)
      if (!m) return null
      const format = abbreviated ? null : language('DATE_FORMAT_LC3')
      if (!abbreviated && format?.value.trim() !== 'd F Y') return null
      const found = month(m[2], abbreviated)
      if (!found) return null
      const year = Number(m[3])
      const leap = abbreviated || (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
      if (Number(m[1]) > days[found.number - 1]) return null
      return format ? [format, found.lang] : [found.lang]
    }
    const dateFile = base + 'category/blog_item.php'
    const dateSource = producer(dateFile, /\$datefield\s*=.*\$item->created/, /\$item->publish_up/)
    if (item.tag === 'time' && receiver(/\btime\.hx-blogdate(?::nth-of-type\([1-9][0-9]*\))?$/)) {
      const langs = date(norm, true)
      if (
        langs &&
        dateSource &&
        // PHP date-format literals are case-sensitive; bind each one to its exact receiver.
        receiverProducer(
          sourceIndex,
          dateFile,
          /class=['"]hx-blogdate__d['"]>\s*<\?php\s+echo\s+HTMLHelper::_\(['"]date['"],\s*\$dateField,\s*['"]d['"]\)/,
          /class=['"]hx-blogdate__m['"]>\s*<\?php\s+echo\s+HTMLHelper::_\(['"]date['"],\s*\$dateField,\s*['"]M['"]\)/
        )
      )
        return proved(dateFile, 'day/month date receiver', ...langs)
    }
    if (
      item.tag === 'span' &&
      copies.every((copy) => typeof copy.value === 'string' && canonical(copy.value) === norm)
    ) {
      if (
        receiver(
          /\bdiv\.hx-blogmeta(?::nth-of-type\([1-9][0-9]*\))? > span\.hx-blogdatetxt(?::nth-of-type\([1-9][0-9]*\))?$/
        )
      ) {
        const langs = date(norm)
        if (
          langs &&
          dateSource &&
          receiverProducer(
            sourceIndex,
            dateFile,
            /class=['"]hx-blogdatetxt['"]>\s*<\?php\s+echo\s+HTMLHelper::_\(['"]date['"],\s*\$dateField,\s*Text::_\(['"]DATE_FORMAT_LC3['"]\)\)\s*;\s*\?>\s*<\/span>/
          )
        )
          return proved(dateFile, 'full date leaf receiver', ...langs)
      }
      if (
        receiver(
          /\btime\.hx-blogdate(?::nth-of-type\([1-9][0-9]*\))? > span\.hx-blogdate__m(?::nth-of-type\([1-9][0-9]*\))?$/
        )
      ) {
        const found = month(norm, true)
        if (
          found &&
          dateSource &&
          receiverProducer(
            sourceIndex,
            dateFile,
            /class=['"]hx-blogdate__m['"]>\s*<\?php\s+echo\s+HTMLHelper::_\(['"]date['"],\s*\$dateField,\s*['"]M['"]\)\s*;\s*\?>\s*<\/span>/
          )
        )
          return proved(dateFile, 'abbreviated month leaf receiver', found.lang)
      }
    }
    if (receiver(/\bdiv\.hx-blogmeta(?::nth-of-type\([1-9][0-9]*\))?$/)) {
      const short = language('TPL_JA_KINETIC_BLOG_READMIN_SHORT', templateLanguage)
      for (const prefix of ['', ...contract.index.text.keys()]) {
        if (prefix && !norm.startsWith(canonical(prefix) + ' ')) continue
        const rest = prefix ? norm.slice(canonical(prefix).length + 1) : norm
        const m = /^(\d{2} .+ [1-9][0-9]{3}) (.+)$/.exec(rest)
        const langs = m && date(m[1])
        if (
          langs &&
          integer(m[2], short, 1) !== null &&
          dateSource &&
          producer(
            dateFile,
            /class=['"]hx-blogmeta['"]/,
            /class=['"]hx-blogauthor['"]/,
            /\$this->escape\(\$author\)/,
            /htmlhelper::_\(['"]date['"],\s*\$datefield,\s*text::_\(['"]date_format_lc3['"]\)\)/,
            /text::sprintf\(['"]tpl_ja_kinetic_blog_readmin_short['"],\s*\$readmins\)/
          )
        )
          return proved(dateFile, 'full date and duration receiver', ...langs, short)
      }
    }
    const authorMeta = /\bspan\.hx-author__meta(?::nth-of-type\([1-9][0-9]*\))?$/
    const relatedMeta =
      /\ba\.hx-related__card(?::nth-of-type\([1-9][0-9]*\))? > span\.hx-related__m(?::nth-of-type\([1-9][0-9]*\))?$/
    if (
      item.tag === 'span' &&
      !item.attr &&
      selectors.every((s) => authorMeta.test(s) || relatedMeta.test(s))
    ) {
      if (
        typeof item.value !== 'string' ||
        copies.some((c) => typeof c.value !== 'string' || c.value !== item.value)
      )
        return null
      const file = base + 'article/default.php'
      const relatedFile = base + 'article/default_related.php'
      const lang = language('TPL_JA_KINETIC_BLOG_READMIN', templateLanguage)
      const pieces = norm.split(' . ')
      const duration = pieces.pop()
      const langs = pieces.length ? date(pieces[pieces.length - 1]) : null
      if (langs) pieces.pop()
      const readtime = receiverProducer(
        sourceIndex,
        file,
        /function\s+kinetic_readtime\(\$html\)/,
        /str_word_count\(strip_tags\(\(string\)\s*\$html\)\)/,
        /max\(1,\s*\(int\)\s*ceil\(\$words\s*\/\s*200\)\)/
      )
      const author =
        receiverProducer(
          sourceIndex,
          file,
          /class=['"]hx-author__meta['"]/,
          /\$readmins\s*=\s*kinetic_readtime\(\(\$this->item->introtext\s*\?\?\s*['"]['"]\)\s*\.\s*['"] ['"]\s*\.\s*\(\$this->item->fulltext\s*\?\?\s*['"]['"]\)\)/,
          /\$hxMeta\[\]\s*=\s*Text::sprintf\(['"]TPL_JA_KINETIC_BLOG_READMIN['"],\s*\$readmins\)/,
          /implode\(['"] · ['"],\s*\$hxMeta\)/,
          /\$this->escape\(\$authorRole\)/
        ) &&
        (!langs ||
          receiverProducer(
            sourceIndex,
            file,
            /\$hxMeta\[\]\s*=\s*HTMLHelper::_\(['"]date['"],\s*\$this->item->(?:created|publish_up),\s*Text::_\(['"]DATE_FORMAT_LC3['"]\)\)/
          ))
      const related =
        langs &&
        pieces.length === 0 &&
        receiverProducer(sourceIndex, file, /\$this->loadTemplate\(['"]related['"]\)/) &&
        receiverProducer(
          sourceIndex,
          relatedFile,
          /class=['"]hx-related__card['"]/,
          /\$rmin\s*=\s*kinetic_readtime\(\(\$rel->introtext\s*\?\?\s*['"]['"]\)\s*\.\s*['"] ['"]\s*\.\s*\(\$rel->fulltext\s*\?\?\s*['"]['"]\)\)/,
          /class=['"]hx-related__m['"]>\s*<\?php\s+echo\s+HTMLHelper::_\(['"]date['"],\s*\$rel->created,\s*Text::_\(['"]DATE_FORMAT_LC3['"]\)\)\s*\.\s*['"] · ['"]\s*\.\s*Text::sprintf\(['"]TPL_JA_KINETIC_BLOG_READMIN['"],\s*\$rmin\)\s*;\s*\?>\s*<\/span>/
        )
      if (
        readtime &&
        integer(duration, lang, 1) !== null &&
        pieces.length <= 1 &&
        pieces.every(covered) &&
        // Equal words may come from different producers; every physical copy needs its own proof.
        copies.every((c) => (authorMeta.test(c.selector) ? author : related))
      )
        return proved(
          copies.some((c) => relatedMeta.test(c.selector)) ? `${file}, ${relatedFile}` : file,
          'article duration receiver',
          lang,
          ...(langs ?? [])
        )
    }
    if (receiver(/\bdiv\.hx-auaside__meta(?::nth-of-type\([1-9][0-9]*\))?$/)) {
      const file = base + 'author/author_info.php'
      const pieces = norm.split(' . '),
        phrase = pieces.pop()
      const singular = language('TPL_JA_KINETIC_N_ARTICLES_1', templateLanguage)
      const plural = language('TPL_JA_KINETIC_N_ARTICLES', templateLanguage)
      const lang =
        integer(phrase, singular) === 1
          ? singular
          : integer(phrase, plural) !== null && integer(phrase, plural) !== 1
            ? plural
            : null
      if (
        lang &&
        pieces.length <= 1 &&
        pieces.every(covered) &&
        producer(
          file,
          /class=['"]hx-auaside__meta['"]/,
          /class=['"]hx-auaside__c['"]/,
          /text::plural\(['"]tpl_ja_kinetic_n_articles['"],\s*\(int\)\s*\$hacount\)/,
          /\$this->escape\(\$harole\)/
        )
      )
        return proved(file, 'author article count receiver', lang)
    }
    if (receiver(/\bspan\.hx-bloglist__count(?::nth-of-type\([1-9][0-9]*\))?$/)) {
      const file = base + 'category/blog.php'
      const lang = language('TPL_JA_KINETIC_BLOG_POSTS_NEWEST', templateLanguage)
      const m = /^\/\/ (0[0-9]|[1-9][0-9]+) (.+)$/.exec(norm)
      if (
        m &&
        lang &&
        m[2] === canonical(lang.value) &&
        producer(
          file,
          /class=['"]hx-bloglist__count['"]/,
          /\$hxtotal\s*=\s*\(int\)\s*\(!empty\(\$this->pagination->total\)\s*\?\s*\$this->pagination->total\s*:\s*count\(\$rows\)\)/,
          /str_pad\(\(string\)\s*\$hxtotal,\s*2,\s*['"]0['"],\s*str_pad_left\)/,
          /text::_\(['"]tpl_ja_kinetic_blog_posts_newest['"]\)/
        )
      )
        return proved(file, 'category padded count receiver', lang)
    }
    if (item.tag === 'label') {
      let page
      try {
        page = new URL(context?.url)
      } catch {
        return null
      }
      const route = page.pathname.replace(/^\/(?:index\.php\/)?/, '').replace(/\/$/, '')
      const mapped = contract.pages.find((p) =>
        page.searchParams.has('Itemid')
          ? String(p.sourceId) === page.searchParams.get('Itemid')
          : String(p.route).replace(/^\/|\/$/g, '') === route
      )
      const link = mapped?.link ? new URL(mapped.link, page) : null
      const component = page.searchParams.get('option') ?? link?.searchParams.get('option')
      const view = page.searchParams.get('view') ?? link?.searchParams.get('view')
      if (component !== 'com_users') return null
      const fields = [
        ['login', 'username', 'username', 'COM_USERS_LOGIN_USERNAME_LABEL'],
        ['login', 'password', 'password', 'JGLOBAL_PASSWORD'],
        ['registration', 'name', 'jform_name', 'COM_USERS_REGISTER_NAME_LABEL'],
        ['registration', 'password1', 'jform_password1', 'COM_USERS_PROFILE_PASSWORD1_LABEL']
      ]
      for (const [form, field, id, key] of fields) {
        if (view !== form || !receiver(new RegExp(`^#${id}-lbl$`))) continue
        const file = `components/com_users/forms/${form}.xml`
        const languageFile = key === 'JGLOBAL_PASSWORD' ? coreLanguage : /^language\/[^/]+\/com_users\.ini$/
        const lang = language(key, languageFile)
        const componentLanguage = receiverLanguage(sourceIndex, key, languageFile)
        if (
          lang &&
          componentLanguage &&
          // A conflicting template value has no proven early-loader phase for this HTML form.
          canonical(lang.value) === canonical(componentLanguage.value) &&
          [canonical(lang.value), canonical(lang.value) + ' *'].includes(norm) &&
          producer(
            file,
            new RegExp(
              `<field\\b(?=[^>]*\\bname=['"]${field}['"])(?=[^>]*\\blabel=['"]${key.toLowerCase()}['"])(?=[^>]*\\brequired=['"]true['"])[^>]*>`
            )
          ) &&
          producer(
            'libraries/src/Form/FormField.php',
            /\$this->translatelabel\s*\?\s*text::_\(\$title\)/,
            /\$this->getrenderer\(\$this->renderlabellayout\)->render\(/
          ) &&
          producer(
            'layouts/joomla/form/renderlabel.php',
            /\$id\s*=\s*\$for\s*\.\s*['"]-lbl['"]/,
            /if\s*\(\$required\)/,
            /class=['"]star['"]/,
            /&#160;\*/
          )
        )
          return proved(file, 'required form label receiver', lang)
      }
    }
    return null
  }

  function socialAria(item) {
    if (
      contract.platform !== 'joomla' ||
      item.kind !== 'attr' ||
      item.attr !== 'aria-label' ||
      item.tag !== 'a' ||
      !sourceIndex
    )
      return null
    // Old merged observations cannot prove the module/card/entry of every physical receiver.
    const views = Object.values(item.viewports ?? {})
    if (!views.length || views.some((v) => !v || !Array.isArray(v.receivers))) return null
    const copies = physicalReceivers(item)
    if (!copies) return null
    const file = `templates/${tpl}/acm/teams/tmpl/style-1.php`
    if (
      !receiverProducer(
        sourceIndex,
        file,
        /\$count\s*=\s*\(int\)\s*\$helper->getRows\(['"]name['"]\)/,
        /for\s*\(\$i\s*=\s*0;\s*\$i\s*<\s*\$count;\s*\$i\+\+\)/,
        /preg_split\(['"]\/\\r\\n\|\\r\|\\n\/['"],\s*\(string\)\s*\$helper->get\(['"]socials['"],\s*\$i\)\)/,
        /\$parts\s*=\s*array_map\(['"]trim['"],\s*explode\(['"]\|['"],\s*\$line,\s*2\)\)/,
        /\$url\s*=\s*isset\(\$parts\[1\]\)\s*\?\s*\$parts\[1\]\s*:\s*['"]['"]/,
        /if\s*\(\$url\s*===\s*['"]['"]\)\s*\{\s*continue;/,
        /\$socials\[\]\s*=\s*array\(['"]net['"]\s*=>\s*strtolower\(\$parts\[0\]\),\s*['"]url['"]\s*=>\s*\$url\)/,
        /class=['"]hx-cols['"]/,
        /class=['"]hx-card hx-team-card['"]/,
        /class=['"]hx-team-social['"]/,
        /foreach\s*\(\$socials\s+as\s+\$s\)/,
        /class=['"]hx-team-social-link['"]\s+href=['"]<\?php\s+echo\s+htmlspecialchars\(\$s\[['"]url['"]\],\s*ENT_QUOTES,\s*['"]UTF-8['"]\);\s*\?>/,
        /aria-label=['"]<\?php\s+echo\s+htmlspecialchars\(\$s\[['"]net['"]\]\s*!==\s*['"]['"]\s*\?\s*\$s\[['"]net['"]\]\s*:\s*['"]website['"],\s*ENT_QUOTES,\s*['"]UTF-8['"]\);\s*\?>/
      )
    )
      return null
    const keys = new Set()
    for (const copy of copies) {
      if (typeof copy.value !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(copy.value)) return null
      const modules = Array.isArray(copy.scopes)
        ? copy.scopes.filter((s) => /^acm-teams-[1-9][0-9]*$/.test(s))
        : []
      const receiver =
        /(?:^| > )div\.hx-card\.hx-team-card(?::nth-of-type\(([1-9][0-9]*)\))? > div\.hx-team-social(?::nth-of-type\([1-9][0-9]*\))? > a\.hx-team-social-link(?::nth-of-type\(([1-9][0-9]*)\))?$/.exec(
          copy.selector
        )
      if (modules.length !== 1 || !receiver) return null
      const moduleId = Number(modules[0].slice('acm-teams-'.length))
      const row = Number(receiver[1] ?? 1) - 1,
        entry = Number(receiver[2] ?? 1) - 1
      const owners = (contract.index.socialAria ?? []).filter(
        (s) =>
          s.moduleId === moduleId &&
          s.row === row &&
          Number.isSafeInteger(entry) &&
          entry >= 0 &&
          entry < s.networks.length &&
          typeof s.networks[entry] === 'string' &&
          s.networks[entry] === copy.value
      )
      const owned = new Set(owners.map((s) => s.key))
      if (owned.size !== 1) return null
      keys.add([...owned][0])
    }
    return {
      status: 'matched',
      by: 'source-bound ACM social aria',
      slots: [...keys],
      evidence: [file, ...keys]
    }
  }

  function classifyText(value) {
    const norm = normText(value)
    const datePieces = norm
      .split('·')
      .map((part) => part.trim())
      .filter(Boolean)
    if (
      datePieces.some(isRenderedDate) &&
      datePieces.every((part) => isRenderedDate(part) || /^\d+ (min|mins|minutes)( read)?$/.test(part))
    )
      return { class: 'c', label: 'date rendered by Joomla', evidence: [] }
    if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(String(value).trim()))
      return {
        class: 'b',
        label: 'untranslated language key printed raw (missing string in the template language file)',
        evidence: [String(value).trim()]
      }
    if (/^(deprecated|warning|notice|fatal error|parse error):/i.test(norm))
      return {
        class: 'b',
        label: 'PHP message printed into the page by a template file',
        evidence: [cut(value)]
      }
    const db = fromDb({ norm })
    // A bare number of up to four digits that no database cell holds is a counter, a calendar day or
    // year, or a slide index a layout prints ("01", "28", "2026"); a price, phone or figure has more.
    if (!db && /^\d{1,4}$/.test(norm))
      return {
        class: 'c',
        label: 'bare number generated by a layout or script (counter, date part, index)',
        evidence: []
      }
    const lang = sourceIndex ? searchSources(sourceIndex, { norm }) : []
    const ini = lang.find((h) => h.key)
    // A language pattern ("Copyright %date% %sitename%") whose placeholder became a DB/config value:
    // the visible text changes with that value, so the value is the hole.
    if (
      ini?.gaps?.length &&
      ini.gaps.every((g) => contract.index.text.has(g) || contract.index.textCompact.has(compact(g)))
    ) {
      return {
        class: ini.origin.cls,
        label: `${ini.origin.label}, placeholder filled with slot text`,
        evidence: [`${ini.file} ${ini.key}="${ini.value.slice(0, 80)}"`]
      }
    }
    if (ini?.gaps?.length && dbIndex) {
      for (const g of ini.gaps.flatMap((x) => [
        x,
        x
          .replace(/\b\d{1,4}\b/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      ])) {
        // A placeholder filled with text the contract already holds (an article title) is fine.
        if (!g || contract.index.text.has(g) || contract.index.textCompact.has(compact(g))) continue
        const filled = fromDb({ norm: g })
        if (filled)
          return {
            class: 'a',
            label: `language pattern ${ini.key} filled with a value the contract does not hold: ${filled.label}`,
            evidence: [
              `"${g}" <- ${filled.evidence[0]}`,
              `${ini.file} ${ini.key}="${ini.value.slice(0, 80)}"`
            ]
          }
      }
    }
    // A short label that is both a language value and a DB cell is far more often the language string.
    const short = norm.split(' ').length <= 2
    if (db && ini && (short || db.evidence[0].includes('(contains)'))) {
      const src = fromSources({ norm })
      return { ...src, evidence: [...src.evidence, 'also in DB: ' + db.evidence[0]] }
    }
    if (db) return ini ? { ...db, evidence: [...db.evidence, `also language: ${ini.file} ${ini.key}`] } : db
    return (
      fromSources({ norm }) ??
      (CORE_TEXT.test(norm)
        ? { class: 'c', label: 'generic core string (no language file to prove it)', evidence: [] }
        : null) ?? { class: 'd', label: 'not found in DB dump or source files', evidence: [] }
    )
  }

  function classifyImage(path) {
    if (path.startsWith(`templates/${tpl}/`) || path.startsWith(`media/templates/site/${tpl}/`)) {
      const src = fromSources({ raw: path.split('/').slice(-2).join('/') })
      return {
        class: 'b',
        label: 'template image file (not a slot, not pinned)',
        evidence: [path, ...(src?.evidence ?? [])]
      }
    }
    if (CATALOGUE_MEDIA.test(path)) return catalogue('VirtueMart product or shop media', [path])
    const attachment = contract.platform === 'wordpress' ? wordpressAttachment(path) : null
    if (attachment) return attachment
    if (/^(media\/(system|vendor|plg_|mod_|com_|templates\/site\/cassiopeia)|plugins\/)/.test(path))
      return { class: 'c', label: 'core / extension media', evidence: [path] }
    const raw = path.replace(/^https?:\/\//, '')
    return (
      fromDb({ raw }) ??
      fromSources({ raw }) ?? {
        class: 'd',
        label: 'image path not found in DB dump or source files',
        evidence: [path]
      }
    )
  }

  /** A WordPress upload no slot names: the attachment, and the rows that print it by id (TracyHQ/tracy#459). */
  function wordpressAttachment(path) {
    const pictures = dbIndex?.pictures
    if (!pictures?.files.size || !path.startsWith(UPLOADS)) return null
    const rel = path.slice(UPLOADS.length).toLowerCase()
    const size = WORDPRESS_SIZE.exec(rel)
    const id = pictures.files.get(rel) ?? (size ? pictures.files.get(size[1] + size[2]) : undefined)
    if (id === undefined) return null
    const refs = pictures.refs.get(id) ?? []
    return {
      class: 'a',
      label: refs.length
        ? `WordPress attachment #${id}, printed from a row that points at it by id; no picture slot names it`
        : `WordPress attachment #${id}: no row points at it by id (a theme default, or a block of a page outside the contract)`,
      evidence: [path, ...refs]
    }
  }

  function classifyLink(value) {
    const raw = String(value)
      .trim()
      .toLowerCase()
      .replace(/\/$/, '')
      .replace(/^(mailto|tel|sms):/, '')
    if (!raw) return { class: 'd', label: 'empty href', evidence: [] }
    const vid = videoId(value)
    return (
      fromDb({ raw }) ??
      (vid ? fromDb({ raw: vid.toLowerCase() }) : null) ??
      fromSources({ raw }) ?? { class: 'd', label: 'href not found in DB dump or source files', evidence: [] }
    )
  }

  return function classify(item, m, context = {}) {
    const key = JSON.stringify([
      item.kind,
      item.zone,
      item.tag,
      item.attr,
      item.value,
      m.remainder,
      m.remainderParts,
      m.slots,
      m.path,
      item.selector,
      item.inCode,
      item.codeText,
      Object.values(item.viewports ?? {}).map((v) => [v?.count, v?.selector, v?.receivers]),
      context.url
    ])
    if (cache.has(key)) return cache.get(key)
    let res = item.zone ? null : (socialAria(item) ?? generated(item, context, m))
    if (res) {
      cache.set(key, res)
      return res
    }
    // Printed inside the shop component's own markup (a price, a size option, a product card, the cart).
    if (item.zone === 'catalogue') res = catalogue('printed inside VirtueMart markup')
    // An item of a remote feed: another site's words, fetched by Joomla's News Feeds when the page is viewed.
    else if (item.zone === 'feed')
      res = {
        class: 'c',
        label: 'remote news feed item fetched when the page is viewed (com_newsfeeds)',
        evidence: []
      }
    else if (item.kind === 'image') res = classifyImage(m.path ?? '')
    else if (item.kind === 'link') res = classifyLink(item.value)
    else if (m.remainder) {
      // A block that holds slot text plus words around it ("Next article: <title>"): the words
      // around it usually belong to a language pattern or one DB field, so try the whole block first.
      const whole = classifyText(item.value)
      res =
        whole.class !== 'd'
          ? { ...whole, label: whole.label + ' (whole block, around slot text)' }
          : classifyText(m.remainder)
    } else res = classifyText(item.value)
    if (
      contract.platform === 'joomla' &&
      !item.zone &&
      res.class === 'c' &&
      (generatedSelector.test(item.selector ?? '') ||
        labelValues.has(normText(item.value).replace(/ \*$/, '')))
    )
      res = fromDb({ norm: normText(item.value) }) ?? {
        class: 'd',
        label: 'generated value without a proven source receiver',
        evidence: res.evidence
      }
    if (!dbIndex && !sourceIndex && res.class === 'd')
      res.label = 'unclassified (no --db-dump / --webroot given)'
    cache.set(key, res)
    return res
  }
}
