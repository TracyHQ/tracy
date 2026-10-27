/**
 * KEYTERMS (council 19/10/2026, A1): the site's own names — the business, what it sells, the pages and
 * menu entries a person named — handed to the speech service as words to listen for, so
 * "Bánh mì Phượng" or "Sofa Lindqvist" come back as the person said them instead of as the nearest common
 * words. ElevenLabs Scribe v2 Realtime takes them as `keyterms`, repeated in the handshake's query
 * (`speech/relay.js` `serviceAddress`); it bills a session that carries them about 20% more.
 *
 * 🔒 A PILOT, OFF BY DEFAULT. Only the sites an operator lists on /ops › Agents › Voice
 * (`speech_setting.keyterm_sites`, empty until someone fills it) send any. Everywhere else a voice
 * session is exactly what it was.
 *
 * 🔒 TRACY BUILDS THE LIST, FROM WHAT IT ALREADY HOLDS. Never the relay crawling a site, never the page
 * sending words: the page names only the site it stands in (`?site=` on the socket), and the relay
 * asks {@link speechKeyterms}, which reads the pilot list, then the signed-in account's live seat on
 * that site (`roleOnSite`), and only then the site's names. A page cannot get a list for a site its
 * account holds no seat on, nor put a word of its own into one. The list never rides a URL of
 * Tracy's and is never logged; the relay logs how many terms went, never which.
 *
 * WHERE THE NAMES COME FROM, in the council's order of worth — only what this database already holds:
 *   1. the business's name, as the customer gave it in Add site (`site_brief.normalized.name`, when
 *      `nameFrom` says it was typed or found in their own words, never one made from the address);
 *   2. products and services, 3. menu entries, 4. page titles: titles of the CMS records a person
 *      edited in the CMS admin (`site_cms_change.resource_title`, by record type; deleted ones left out).
 * NOT HELD HERE, SO NOT USED: a full list of the site's products, its menus or its page titles. Those
 * live in the customer's CMS; tracy-web keeps only what the admin log and the brief carried in. A site
 * born without a brief and never edited in its admin has no list, and its sessions send none.
 *
 * WHAT IS KEPT ({@link cleanKeyterms}): Unicode NFC, spaces trimmed and collapsed, the first spelling
 * of a name kept when it comes again in other case (its marks kept: "Phở" and "Pho" are two names);
 * no markup, no address, nothing without a letter, nothing longer than {@link KEYTERM_LIMITS}.chars
 * characters — a name too long is left out, never cut in half; and not the labels every site has
 * ("Home", "Contact", "Trang chủ"), which the service hears well without help. At most
 * {@link KEYTERM_LIMITS}.target names, below the service's ceiling of {@link KEYTERM_LIMITS}.max.
 */
import { roleOnSite } from './role-on-site.js'

export const KEYTERM_LIMITS = Object.freeze({
  /** The service's ceiling: terms one session may carry. */
  max: 50,
  /** Terms one site sends: the council's 20–30 good ones, not the ceiling. */
  target: 30,
  /** The longest term, in characters (code points). */
  chars: 20,
  /** Sites the pilot may list. */
  sites: 100,
  /** How long a site's list is kept before it is read again. */
  ttlMs: 10 * 60_000,
  /** Lists kept at once (site × language). */
  cacheEntries: 500
})

/** A site key as the workspace path names it (`workspace/scope.js` SITE_PATH): `shop.example.com`. */
export const SITE_KEY = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+$/
const SITE_KEY_MAX = 253

const MARKUP = /<[^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);/iu
const CONTROL = /[\p{Cc}\p{Cf}]/u
/** A web address or an email is not a word anyone says to name a thing. */
const ADDRESS = /:\/\/|^www\.|@|\.(?:com|net|org|io|vn|de|fr|it|es|nl|cn)(?:\/|$)/iu
const LETTER = /\p{L}/u

/**
 * Labels every site has, in the eight interface languages: the service hears them well, and a slot
 * spent on one is a name it does not get. Matched as the whole term, lower case. Written as regular
 * expressions, as `voice-turn-taking.mjs` writes its words: data to match, not text shown.
 */
const GENERIC = [
  /^(?:home|home ?page|about|about us|contact|contact us|blog|news|shop|store|services|products|gallery|portfolio|team|our team|careers|pricing|faq|faqs|privacy|privacy policy|cookie policy|terms|terms of service|terms and conditions|sitemap|search|menu|cart|checkout|my account|account|log ?in|sign in|register|read more|learn more|see more|view more|more|book now|order now|get started|subscribe|sample page|hello world!?|uncategorized)$/u, // en
  /^(?:trang chủ|giới thiệu|về chúng tôi|liên hệ|tin tức|bài viết|dịch vụ|sản phẩm|cửa hàng|thư viện|tuyển dụng|bảng giá|câu hỏi thường gặp|chính sách bảo mật|điều khoản|tìm kiếm|giỏ hàng|thanh toán|tài khoản|đăng nhập|đăng ký|xem thêm|đọc thêm|đặt ngay|chưa phân loại)$/u, // vi
  /^(?:startseite|über uns|kontakt|aktuelles|neuigkeiten|leistungen|produkte|galerie|karriere|preise|datenschutz|impressum|agb|suche|warenkorb|kasse|mein konto|anmelden|mehr|weiterlesen|mehr erfahren)$/u, // de
  /^(?:accueil|à propos|qui sommes-nous|contact|actualités|services|produits|boutique|galerie|carrières|tarifs|mentions légales|politique de confidentialité|recherche|panier|mon compte|connexion|en savoir plus|lire la suite|plus)$/u, // fr
  /^(?:chi siamo|contatti|notizie|servizi|prodotti|negozio|galleria|lavora con noi|prezzi|privacy policy|cerca|carrello|il mio account|accedi|leggi di più|scopri di più|altro)$/u, // it
  /^(?:inicio|sobre nosotros|quiénes somos|contacto|noticias|servicios|productos|tienda|galería|empleo|precios|política de privacidad|buscar|carrito|mi cuenta|iniciar sesión|leer más|ver más|más)$/u, // es
  /^(?:over ons|nieuws|diensten|producten|winkel|galerij|vacatures|prijzen|privacybeleid|zoeken|winkelwagen|mijn account|inloggen|lees meer|meer)$/u, // nl
  /^(?:首页|主页|关于我们|联系我们|新闻|服务|产品|商店|图库|招聘|价格|隐私政策|搜索|购物车|我的账户|登录|更多|了解更多|阅读更多)$/u // zh
]

/** Record types of the CMS admin log, by what their titles name (`site_cms_change.resource_type`). */
const PRODUCT_TYPES = /^(?:products?|services?|product_variation|download)$/u
const MENU_TYPES = /^(?:menu[_-]?items?|nav_menu_item|menus?)$/u
const PAGE_TYPES = /^(?:pages?|posts?|articles?)$/u
/** Admin actions after which a record is gone: its title is no name of the site any more. */
const GONE_OPS = new Set(['delete', 'trash'])
/** The admin log rows read for one site: the most recent first, enough for a list of thirty. */
const LOG_ROWS = 1000

/**
 * The terms worth sending, from candidates in order of worth: cleaned, deduplicated, bounded.
 * @param {readonly unknown[]} candidates
 * @param {{ target?: number }} [options]
 * @returns {string[]}
 */
export function cleanKeyterms(candidates, { target = KEYTERM_LIMITS.target } = {}) {
  const limit = Math.min(target, KEYTERM_LIMITS.max)
  /** @type {string[]} */
  const out = []
  const seen = new Set()
  for (const candidate of candidates) {
    if (out.length >= limit) break
    if (typeof candidate !== 'string') continue
    const term = candidate.normalize('NFC').replace(/\s+/gu, ' ').trim()
    if (term === '' || [...term].length > KEYTERM_LIMITS.chars) continue
    if (MARKUP.test(term) || CONTROL.test(term) || ADDRESS.test(term) || !LETTER.test(term)) continue
    const key = term.toLowerCase()
    if (seen.has(key) || GENERIC.some((label) => label.test(key))) continue
    seen.add(key)
    out.push(term)
  }
  return out
}

/**
 * The site's names as this database holds them, in order of worth (see the file comment). A row of a
 * deleted site left under the same key is not read: a brief or a log row older than the site standing
 * there now is that other site's (the rule `sites/brief-store.js` keeps, TCH #1013).
 * @param {{ query: Function }} pool
 * @param {string} siteKey
 * @returns {Promise<string[]>}
 */
export async function readKeytermCandidates(pool, siteKey) {
  const [brief, log] = await Promise.all([
    pool.query(
      `select b.normalized->>'name' as name, b.normalized->>'nameFrom' as name_from
         from site_brief b left join site s on s.site_key = b.site_key
        where b.site_key = $1 and (s.created_at is null or b.created_at >= s.created_at)`,
      [siteKey]
    ),
    pool.query(
      `select c.resource_type, c.resource_id, c.resource_title, c.op
         from site_cms_change c left join site s on s.site_key = c.site_key
        where c.site_key = $1 and c.resource_title is not null
          and (s.created_at is null or c.pulled_at >= s.created_at)
        order by c.occurred_at desc, c.id desc
        limit ${LOG_ROWS}`,
      [siteKey]
    )
  ])
  const row = brief.rows[0]
  // A name made from the site's address is Tracy's guess, not the business's name.
  const brand = row && ['answer', 'text'].includes(row.name_from) && row.name ? [row.name] : []
  /** @type {Record<'product' | 'menu' | 'page', string[]>} */
  const titles = { product: [], menu: [], page: [] }
  // The newest row of each record says what it is now: a record deleted last is no name any more.
  const latest = new Set()
  for (const r of log.rows) {
    const type = String(r.resource_type ?? '')
      .trim()
      .toLowerCase()
    const record = `${type}\n${r.resource_id ?? r.resource_title}`
    if (latest.has(record)) continue
    latest.add(record)
    if (GONE_OPS.has(String(r.op))) continue
    const kind = PRODUCT_TYPES.test(type)
      ? 'product'
      : MENU_TYPES.test(type)
        ? 'menu'
        : PAGE_TYPES.test(type)
          ? 'page'
          : null
    if (kind) titles[kind].push(String(r.resource_title))
  }
  return [...brand, ...titles.product, ...titles.menu, ...titles.page]
}

/**
 * Each site's list, kept per site and language for {@link KEYTERM_LIMITS}.ttlMs; one read at a time
 * per list (a voice conversation opens a session per phrase). A read that fails is not kept: the
 * session goes without terms and the next one reads again. The list does not differ by language
 * today; keyed by it (council A1) so a list per edition needs no second cache.
 * @param {{ read: (siteKey: string, language: string) => Promise<readonly unknown[]>, now?: () => number, ttlMs?: number, entries?: number }} deps
 */
export function keytermBook({
  read,
  now = Date.now,
  ttlMs = KEYTERM_LIMITS.ttlMs,
  entries = KEYTERM_LIMITS.cacheEntries
}) {
  /** @type {Map<string, { at: number, terms: Promise<string[]> }>} */
  const kept = new Map()
  return {
    /**
     * @param {string} siteKey
     * @param {string} [language]
     * @returns {Promise<string[]>}
     */
    termsFor(siteKey, language = '') {
      const key = `${siteKey}\n${language}`
      const hit = kept.get(key)
      if (hit && now() - hit.at < ttlMs) return hit.terms
      /** @type {{ at: number, terms: Promise<string[]> }} */
      const entry = { at: now(), terms: Promise.resolve([]) }
      entry.terms = read(siteKey, language).then(
        (candidates) => Object.freeze(cleanKeyterms(candidates)),
        () => {
          if (kept.get(key) === entry) kept.delete(key)
          return []
        }
      )
      kept.delete(key)
      kept.set(key, entry)
      while (kept.size > entries) kept.delete(/** @type {string} */ (kept.keys().next().value))
      return entry.terms
    },
    /** Lists kept now (tests). */
    get size() {
      return kept.size
    }
  }
}

/**
 * The sites in the pilot (`speech_setting.keyterm_sites`); none without a database or a row. A
 * database that cannot be read THROWS: the caller sends no terms.
 * @param {{ query: Function } | null} pool
 * @returns {Promise<string[]>}
 */
export async function keytermSites(pool) {
  if (!pool) return []
  const { rows } = await pool.query('select keyterm_sites from speech_setting where id')
  const sites = rows[0]?.keyterm_sites
  return Array.isArray(sites) ? sites.filter((site) => typeof site === 'string') : []
}

/**
 * Check the list typed on /ops: site keys, at most {@link KEYTERM_LIMITS}.sites, each once.
 * @param {unknown} value
 * @returns {{ ok: true, sites: string[] } | { ok: false, error: string }}
 */
export function parseKeytermSites(value) {
  if (!Array.isArray(value)) return { ok: false, error: 'SITES_NOT_LIST' }
  /** @type {string[]} */
  const sites = []
  for (const item of value) {
    if (typeof item !== 'string') return { ok: false, error: 'SITE_KEY_INVALID' }
    const site = item.trim().toLowerCase()
    if (site === '') continue
    if (site.length > SITE_KEY_MAX || !SITE_KEY.test(site)) return { ok: false, error: 'SITE_KEY_INVALID' }
    if (!sites.includes(site)) sites.push(site)
  }
  if (sites.length > KEYTERM_LIMITS.sites) return { ok: false, error: 'TOO_MANY_SITES' }
  return { ok: true, sites }
}

/**
 * Save the pilot list. The key's own stamp (`updated_by`, `updated_at`: who saved the speech key) is
 * left as it is; a deployment with no row yet gets one, with no key in it.
 * @param {{ query: Function }} pool
 * @param {string[]} sites - checked by {@link parseKeytermSites}
 * @param {string} by - who pressed Save
 */
export async function saveKeytermSites(pool, sites, by) {
  await pool.query(
    `insert into speech_setting (id, keyterm_sites, updated_by) values (true, $1::text[], $2)
     on conflict (id) do update set keyterm_sites = excluded.keyterm_sites`,
    [sites, by]
  )
}

/**
 * What the relay asks per voice session (`speech/relay.js` `keyterms`): the terms for `siteKey`, or
 * none — the site not in the pilot, the account without a live seat on it, or anything that cannot
 * be read. Never throws.
 * @param {{
 *   pool: { query: Function } | null,
 *   seats: { accountByEmail: Function, grantFor: Function } | null,
 *   book?: ReturnType<typeof keytermBook>
 * }} deps
 * @returns {(asked: { email: string, siteKey: string, language?: string }) => Promise<readonly string[]>}
 */
export function speechKeyterms({ pool, seats, book }) {
  const lists =
    book ?? keytermBook({ read: (siteKey) => readKeytermCandidates(/** @type {any} */ (pool), siteKey) })
  return async ({ email, siteKey, language = '' }) => {
    if (!pool || !seats || typeof siteKey !== 'string' || !SITE_KEY.test(siteKey)) return []
    try {
      if (!(await keytermSites(pool)).includes(siteKey)) return []
      if ((await roleOnSite(pool, seats, email, siteKey)) === null) return []
      return await lists.termsFor(siteKey, language)
    } catch {
      return []
    }
  }
}
