/**
 * The two ways a seeded site gets written, behind one small interface.
 *
 * WHY TWO. Until 08/09 the seeder always ran on the machine that held the webroot, so `wp` was the
 * only writer it needed. Then *Create with* began building a **new** site: its files live in that
 * site's own container, and the lane the customer is sitting in holds neither the files nor any
 * credential for them (tasks/todo-build-new-site.md). What it does hold is a seat, so the writes go
 * through the seat book's Apply door as the person who pressed — allowlisted, role-checked, audited.
 *
 * WHY ONE INTERFACE. The plan above these writers says what a seeded site looks like: which pages,
 * in which order, with which words. That is the same answer whichever machine does the writing, and
 * a second copy of it would be a second answer to the only question this package exists to answer.
 * So the plan is applied once, and only these five verbs differ.
 *
 * The verbs: `find` a page by slug, `upsert` one, `setMeta`, `deleteMeta`, `setOption`. Everything a
 * seeded WordPress site needs and nothing more — a sixth verb here would be a feature nobody asked
 * for, carried by two implementations for ever.
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * @typedef {object} SiteOps
 * @property {(type: string, slug: string) => Promise<number | null>} find
 * @property {(page: { type: string, slug: string, title: string, content: string, excerpt?: string, date?: string, categories?: number[] }) => Promise<number>} upsert
 * @property {(id: number, key: string, value: string) => Promise<void>} setMeta
 * @property {(id: number, key: string) => Promise<void>} deleteMeta
 * @property {(name: string, value: string) => Promise<void>} setOption
 * @property {(id: number, lang: string, translations?: Record<string, number>, locale?: string) => Promise<void>} setLanguage
 * @property {(wpLocale: string) => Promise<unknown>} [installLocale] make WordPress fetch a core translation
 * @property {(name: string) => Promise<number | null>} category the blog category's id, made if absent
 * @property {(cover: { postId: number, slug: string, title: string, bytes: Buffer, mime: string, dir: string }) => Promise<boolean>} cover
 * @property {() => Promise<void>} flush
 */

/**
 * The writer a lane uses on its own site: wp-cli against the working copy.
 * @param {{ run: (cmd: string, args: string[], stdin?: string) => Promise<{ code: number, stdout: string, stderr: string }>, webroot?: string }} deps
 * @returns {SiteOps}
 */
export function wpCliOps({ run, webroot = '.webroot' }) {
  const wp = async (args, stdin) => {
    const r = await run('wp', [...args, `--path=${webroot}`, '--allow-root'], stdin)
    if (r.code !== 0)
      throw new Error(`wp ${args[0]} ${args[1] ?? ''}: ${(r.stderr || r.stdout).trim().split('\n')[0]}`)
    return r.stdout.trim()
  }
  const find = async (type, slug) => {
    const out = await wp([
      'post',
      'list',
      `--post_type=${type}`,
      `--name=${slug}`,
      '--post_status=any',
      '--field=ID'
    ])
    const id = Number.parseInt(out.split('\n')[0], 10)
    return Number.isInteger(id) && id > 0 ? id : null
  }
  return {
    find,
    async upsert({ type, slug, title, content, excerpt, date, categories }) {
      const extra = []
      if (excerpt !== undefined) extra.push(`--post_excerpt=${excerpt}`)
      if (date !== undefined) extra.push(`--post_date=${date}`)
      if (categories?.length) extra.push(`--post_category=${categories.join(',')}`)
      const existing = await find(type, slug)
      if (existing) {
        await wp(
          [
            'post',
            'update',
            String(existing),
            '-',
            `--post_title=${title}`,
            '--post_status=publish',
            ...extra
          ],
          content
        )
        return existing
      }
      const out = await wp(
        [
          'post',
          'create',
          '-',
          `--post_type=${type}`,
          `--post_title=${title}`,
          `--post_name=${slug}`,
          '--post_status=publish',
          '--porcelain',
          ...extra
        ],
        content
      )
      return Number.parseInt(out, 10)
    },
    /**
     * Make WordPress fetch one core translation from translate.wordpress.org.
     *
     * 🔒 THE LOCALE IS WORDPRESS'S SPELLING, NOT THE PRODUCT'S — `pt_BR`, not `pt-br`. This is the
     * one edge where the two meet, which is why `wpLocaleFor` is called by the caller and the
     * string arrives here already translated.
     *
     * Nothing is pinned: WordPress downloads over its own update channel. A locale that is already
     * there answers "Language already installed" on stdout with code 0, so a rerun is free.
     */
    async installLocale(wpLocale) {
      await wp(['language', 'core', 'install', wpLocale])
    },
    async setMeta(id, key, value) {
      await wp(['post', 'meta', 'update', String(id), key, value])
    },
    async deleteMeta(id, key) {
      await wp(['post', 'meta', 'delete', String(id), key]).catch(() => undefined)
    },
    async setOption(name, value) {
      await wp(['option', 'update', name, value])
    },
    /**
     * Which language a page is in, and which pages are each other's translations.
     *
     * 🔒 THROUGH `wp eval`, NOT A WP-CLI COMMAND. Polylang ships WP-CLI only in its Pro build
     * (wordpress.org #2653), so the free plugin's way in is its PHP API — the same road the theme's
     * `tracy_apply_inspiration` already takes. Measured on Polylang 3.8.8, 08/09:
     * `pll_set_post_language` and `pll_save_post_translations` both exist and read back.
     */
    async setLanguage(id, lang, translations) {
      const map = Object.entries(translations ?? {})
        .map(([l, pid]) => `'${l}' => ${Number(pid)}`)
        .join(', ')
      const php =
        `if (function_exists('pll_set_post_language')) { pll_set_post_language(${Number(id)}, '${lang}');` +
        (map === '' ? '' : ` pll_save_post_translations([${map}]);`) +
        ` }`
      await wp(['eval', php])
    },
    async category(name) {
      const found = (await wp(['term', 'list', 'category', `--name=${name}`, '--field=term_id'])).split(
        '\n'
      )[0]
      const id = Number.parseInt(found || (await wp(['term', 'create', 'category', name, '--porcelain'])), 10)
      return Number.isInteger(id) && id > 0 ? id : null
    },
    async cover({ postId, slug, title, bytes, mime, dir }) {
      const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png'
      const file = path.join(dir, `${slug}.${ext}`)
      writeFileSync(file, bytes)
      await wp([
        'media',
        'import',
        file,
        `--post_id=${postId}`,
        `--title=${title}`,
        '--featured_image',
        '--porcelain'
      ])
      return true
    },
    async flush() {
      await wp(['cache', 'flush']).catch(() => undefined)
    }
  }
}

/**
 * The writer for a site this machine does not hold: one Apply call per write, as the viewer.
 *
 * `apply_id` rides every write because that is what the door files an undo under — a seeded site is
 * a deliverable, and `apply.revert` replaying it is the condition the component puts on a change
 * being guaranteed at all.
 *
 * @param {{ apply: (call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<unknown>, siteKey: string, applyId: string }} deps
 * @returns {SiteOps}
 */
/**
 * How a door says it has never heard of a verb.
 *
 * Both engines answer `bad_action` with `unknown action: <name>`, and the seat book refuses an
 * action missing from its own `APPLY_RULES` with `ACTION_NOT_ALLOWED`. Either means the same
 * thing to a caller — this site cannot do that yet — and nothing else does: a locale WordPress
 * does not publish, or a role that may not write code, are real answers to a verb that exists.
 */
const DOOR_DOES_NOT_KNOW = /unknown action|bad_action|ACTION_NOT_ALLOWED/i

export function doorOps({ apply, siteKey, applyId }) {
  const call = async (action, params) => {
    const answer = await apply({ siteKey, action, params })
    const a = /** @type {Record<string, unknown>} */ (answer && typeof answer === 'object' ? answer : {})
    if (a.ok === false) {
      // The door's own sentence, not ours: `TOOLSET_NOT_GRANTED` tells the customer to ask their
      // Owner, and "the site said no" would send them hunting instead.
      const words = [a.message, a.error, a.code].find((w) => typeof w === 'string' && w !== '')
      throw new Error(String(words ?? `${action} was refused`))
    }
    return a
  }
  const find = async (type, slug) => {
    const answer = await call('content.list', { name: slug, post_type: type, limit: 1 })
    const items = Array.isArray(answer.items) ? answer.items : []
    const id = Number(/** @type {Record<string, unknown>} */ (items[0] ?? {}).id ?? 0)
    return Number.isInteger(id) && id > 0 ? id : null
  }
  return {
    find,
    async upsert({ type, slug, title, content, excerpt, date, categories }) {
      const existing = await find(type, slug)
      /** @type {Record<string, unknown>} */
      const fields = { post_title: title, post_content: content, post_status: 'publish' }
      if (excerpt !== undefined) fields.post_excerpt = excerpt
      if (date !== undefined) fields.post_date = date
      if (categories?.length) fields.post_category = categories
      // A slug and a type belong to the CREATE only: rewriting them on an update would rename a
      // page somebody may already have linked to.
      if (existing === null) {
        fields.post_name = slug
        fields.post_type = type
      }
      const answer = await call('content.update', {
        apply_id: applyId,
        kind: 'post',
        id: existing ?? 0,
        fields
      })
      const id = Number(answer.id ?? existing ?? 0)
      if (!Number.isInteger(id) || id <= 0) throw new Error(`the door wrote ${slug} without an id`)
      return id
    },
    async setMeta(id, key, value) {
      await call('content.update', {
        apply_id: applyId,
        kind: 'postmeta',
        id,
        key,
        fields: { value }
      })
    },
    async deleteMeta(id, key) {
      // No delete for a meta that may not be there: writing an empty value is the same site, and a
      // 'not found' refusal on a page that never had the meta is noise, not news.
      await call('content.update', {
        apply_id: applyId,
        kind: 'postmeta',
        id,
        key,
        fields: { value: '' }
      }).catch(() => undefined)
    },
    /**
     * The door has no PHP, so the language is a VERB rather than a field: a Polylang language is a
     * taxonomy relation, and `content.update` only carries post, postmeta and option.
     *
     * ⚠ A verb needs its name in THREE allowlists — the component on the customer's site, the seat
     * book's `APPLY_RULES`, and `RELAY_ACTIONS` of `tracy-site-tools`. The last two are in this
     * repo and now carry it; the component is not, so a site whose component predates this verb
     * answers "unknown action". That refusal is readable and the caller treats it as a warning —
     * same shape `theme.style` shipped in on 08/09.
     */
    /**
     * Make WordPress itself speak the language, not only mark the pages with it.
     *
     * 🔒 THE VERB IS NEWER THAN THE SITES. `language.install` landed in the WordPress component on
     * 22/09/2026 (claude-cowork 0.11.0). A site running an older plugin answers `bad_action` —
     * "unknown action" — and that is the ONLY case where the old refusal still belongs: it names
     * the missing half so the caller can warn instead of failing the build. Every other refusal is
     * the door's own sentence (`TOOLSET_NOT_GRANTED`, a locale WordPress does not publish, a host
     * that forbids language packs) and is passed through untouched, because replacing it with our
     * sentence would send the customer hunting for the wrong thing.
     *
     * The locale arrives in WORDPRESS's spelling — `pt_BR`, not `pt-br`; `wpLocaleFor` is the
     * caller's job, the same as on the wp-cli side.
     */
    async installLocale(wpLocale) {
      try {
        // The answer's `follow` (plugin after 0.18.7): what followed the language on its own, the Contact Form 7 forms'
        // locale and WordPress's date and time formats.
        return await call('language.install', { locale: wpLocale })
      } catch (error) {
        const said = error instanceof Error ? error.message : String(error)
        if (!DOOR_DOES_NOT_KNOW.test(said)) throw error
        throw new Error(
          `this site cannot be told to install the ${wpLocale} translation: its Tracy plugin is older than the language action`
        )
      }
    },
    /**
     * `lang` is the URL slug the page is filed under, sent whole (`pt-br` stays `pt-br`); `locale`
     * is the exact WordPress locale of that language (`pt_BR`). The plugin uses the locale only
     * when it creates the language, and resolves a language named only as a translation key
     * without one — so the caller declares each language as `lang` before naming it as a twin.
     * No locale sent: the plugin falls back to its default table, as for the chat agent.
     */
    async setLanguage(id, lang, translations, locale) {
      await call('content.language', {
        apply_id: applyId,
        id,
        lang,
        ...(locale ? { locale } : {}),
        translations: translations ?? {}
      })
    },
    async setOption(name, value) {
      await call('content.update', {
        apply_id: applyId,
        kind: 'option',
        id: 0,
        key: name,
        fields: { value }
      })
    },
    /**
     * The stored content of one post, for a writer that edits a block INSIDE it (the quickstart
     * contract writer changes one named block of a synced pattern). `content.list` answers whichever
     * of `post_content`/`content` the door carries; a door that carries neither answers null, and
     * the caller reports the slot as not written rather than overwriting a pattern it never read.
     */
    async readContent(id) {
      // 🔒 ONE RECORD IS `content.get`, NOT A PAGE OF `content.list`. The list reads neither
      // `include` nor `post__in` and carries no body unless asked (`include_body`), so asking it
      // for one id answered with the site's first post, bodiless — and every pattern a contract
      // names was skipped as "the door did not return the content". Measured 23/09/2026 on
      // `wp-sodgdm` (`tracy-business/wp7/1.1.0`): 168 planned slots, 0 written. `content.get` is
      // `get_post($id, ARRAY_A)` on every Claude Cowork plugin; `kind` is read from 0.10 on, ignored before.
      const answer = await call('content.get', { kind: 'post', id })
      const item = /** @type {Record<string, unknown>} */ (
        answer.item && typeof answer.item === 'object' ? answer.item : {}
      )
      const content = [item.post_content, item.content].find((c) => typeof c === 'string')
      return typeof content === 'string' ? content : null
    },
    async setContent(id, content) {
      await call('content.update', { apply_id: applyId, kind: 'post', id, fields: { post_content: content } })
    },
    /** The stored markup of a template part (`header`, `footer`), by its slug, or null when the door holds none. */
    async readPart(slug) {
      const answer = await call('content.get', { kind: 'templatePart', key: slug })
      const content = /** @type {any} */ (answer.item)?.content
      return typeof content === 'string' ? content : null
    },
    async setPart(slug, content) {
      await call('content.update', {
        apply_id: applyId,
        kind: 'templatePart',
        key: slug,
        fields: { content }
      })
    },
    async category() {
      // No door reads terms by name yet, and inventing a category id would file the blog under
      // somebody else's. The posts are written either way; they are simply uncategorised until
      // there is a door for it. Said out loud by the caller rather than swallowed here.
      return null
    },
    async cover({ postId, slug, bytes, mime }) {
      await call('media.upload', {
        apply_id: applyId,
        post_id: postId,
        filename: `${slug}.${mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png'}`,
        mime,
        featured: true,
        data: Buffer.from(bytes).toString('base64')
      })
      return true
    },
    async flush() {
      // A site this machine does not hold flushes its own caches; there is nothing here to clear.
    }
  }
}
