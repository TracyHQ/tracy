// The fake WordPress site the whole-seed tests run against (seed-i18n, seed-m4b): a wp-cli runner
// over in-memory posts, terms, options and media.

// The one library pattern a posts index needs (postsQuery); the rest of the registry is empty.
const CARDS =
  '<!-- wp:query {"queryId":1,"query":{"perPage":6,"inherit":true},"className":"tracy-query"} -->\n<div class="wp-block-query tracy-query">\n<!-- wp:post-template -->\n<!-- wp:post-terms {"term":"category"} /-->\n<!-- wp:post-excerpt {"excerptLength":24} /-->\n<!-- /wp:post-template -->\n</div>\n<!-- /wp:query -->'

/**
 * A wp-cli runner over an in-memory site. It answers the commands seed.mjs issues (posts, terms,
 * options, meta, media, a few `wp eval`s) and keeps state across runs, so a second run against
 * the same fake is a second run against the same site. The Polylang evals are recognised by
 * the API they call and their payload (`base64_decode('…')`) is applied: a post's language
 * changes the URL the fake reports, the way Polylang's `force_lang=1` does.
 */
export function fakeSite({ languages = [] } = {}) {
  const site = {
    posts: new Map(),
    terms: new Map(),
    options: new Map(),
    languages: [...languages],
    defaultLang: null,
    pllOptions: {},
    postLang: new Map(),
    postGroups: [],
    termLang: new Map(),
    termGroups: [],
    userMeta: new Map(),
    // `avatarHook`: the theme draws a user's `tracy_avatar` attachment (pre_get_avatar_data);
    // so does a must-use plugin that hooks it (`muPlugins`: file → source, written by wp eval).
    // Without either get_avatar_url() answers Gravatar, as core does.
    avatarHook: false,
    muPlugins: new Map(),
    themeInstalls: [],
    nextId: 100,
    calls: [],
    evals: []
  }
  const arg = (args, name) => {
    const a = args.find((x) => x.startsWith(`--${name}=`))
    return a === undefined ? undefined : a.slice(name.length + 3)
  }
  // What WordPress stores for a user's biography (`pre_user_description`, wp_filter_kses with no
  // block-level tags allowed): measured on a real site, `<p>` and `<script>` go, inline `<b>` stays.
  const storedDescription = (text) => String(text).replace(/<\/?(?!(?:b|i|em|strong|a|br)\b)[a-z][^>]*>/gi, '')
  site.storedDescription = storedDescription
  // `wp option update <key> <json> --format=json` stores a PHP value: an empty object is an empty array,
  // and `wp option get --format=json` prints it as `[]` (measured on a real site).
  const asWordPressJson = (text) => {
    try {
      const v = JSON.parse(text)
      return v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length ? '[]' : text
    } catch {
      return text
    }
  }
  const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' })
  const fail = () => ({ code: 1, stdout: '', stderr: 'no' })
  const urlOf = (p) => {
    const lang = site.postLang.get(p.ID)
    const prefix = lang && lang !== site.defaultLang ? `/${lang}` : ''
    const chain = []
    for (let cur = p; cur; cur = site.posts.get(Number(cur.post_parent))) chain.unshift(cur.post_name)
    return `http://x${prefix}/${chain.join('/')}/`
  }
  const postFrom = (id, args, stdin) => {
    const p = { ID: id, meta: {} }
    for (const k of ['post_type', 'post_title', 'post_name', 'post_status', 'post_parent', 'post_category'])
      if (arg(args, k) !== undefined) p[k] = arg(args, k)
    if (arg(args, 'meta_input') !== undefined) Object.assign(p.meta, JSON.parse(arg(args, 'meta_input')))
    if (p.post_parent !== undefined) p.post_parent = Number(p.post_parent)
    p.content = stdin ?? ''
    return p
  }
  const payloadOf = (code) => {
    const m = /base64_decode\('([^']+)'\)/.exec(code)
    return m ? JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) : null
  }
  const evalPhp = (code) => {
    site.evals.push(code)
    if (code.includes('WPMU_PLUGIN_DIR')) {
      const file = /WPMU_PLUGIN_DIR\.'\/([^']+)'/.exec(code)[1]
      const body = Buffer.from(/base64_decode\('([^']+)'\)/.exec(code)[1], 'base64').toString('utf8')
      if (site.failMuPlugins?.has(file)) return 'failed'
      if (site.muPlugins.get(file) === body) return 'same'
      site.muPlugins.set(file, body)
      return 'written'
    }
    const d = payloadOf(code)
    if (code.includes('WP_Block_Patterns_Registry')) return JSON.stringify(site.registeredPatterns ?? { 'tracy/cards': CARDS })
    if (code.includes('get_block_file_template')) return ''
    // The theme's templates (seed.mjs themeTemplates) and the ones it offers each post type
    // (postTemplateEligibility): answered only when a test sets them — unset, the read fails, as
    // on a site that cannot be asked.
    if (code.includes('get_block_templates(') && site.blockTemplates) return JSON.stringify(site.blockTemplates)
    if (code.includes('get_post_templates()') && site.postTemplates) return JSON.stringify(site.postTemplates)
    if (code.includes('get_avatar_url(')) {
      const ids = JSON.parse(Buffer.from(/base64_decode\('([^']+)'\)/.exec(code)[1], 'base64').toString('utf8'))
      const hooked = site.avatarHook || [...site.muPlugins.values()].some((b) => /add_filter\(\s*'pre_get_avatar_data'/.test(b) && b.includes("'tracy_avatar'"))
      const url = (id) => {
        const att = hooked ? site.posts.get(Number(site.userMeta.get(Number(id))?.tracy_avatar)) : null
        return att ? `http://x/wp-content/uploads/${att.post_name}-96x96.jpg` : `https://secure.gravatar.com/avatar/${id}?s=96`
      }
      return JSON.stringify(Object.fromEntries(ids.map((id) => [id, url(id)])))
    }
    // The biographies WordPress would store (`pre_user_description`), asked read-only: a list of texts in, the list of stored texts out.
    if (code.includes('pre_user_description')) return JSON.stringify(d.map(storedDescription))
    // Who holds these post names, of any type and status (the posts table, as WordPress's slug check reads it): [{ ID, post_name, post_type, post_status }].
    if (code.includes('FROM {$wpdb->posts} WHERE post_name IN')) return JSON.stringify([...site.posts.values()].filter((p) => d.includes(p.post_name)).map((p) => ({ ID: String(p.ID), post_name: p.post_name, post_type: p.post_type, post_status: p.post_status ?? 'publish' })))
    // Every post's stored meta of one key, from the postmeta table: [{ post_id, meta_value }].
    if (code.includes('FROM {$wpdb->postmeta} WHERE meta_key')) {
      const key = /'(_tracy_[a-z_]+)'/.exec(code)[1]
      return JSON.stringify([...site.posts.values()].filter((p) => p.meta?.[key] !== undefined).map((p) => ({ post_id: String(p.ID), meta_value: String(p.meta[key]) })))
    }
    if (code.includes('languages->get_list')) return JSON.stringify(site.languages)
    if (code.includes('languages->add(')) {
      site.languages.push({ slug: d.slug, locale: d.locale, name: d.slug.toUpperCase() })
      return JSON.stringify({ ok: true })
    }
    if (code.includes('update_default(')) {
      let changed = 0
      for (const [k, v] of Object.entries(d.options))
        if (JSON.stringify(site.pllOptions[k]) !== JSON.stringify(v)) {
          site.pllOptions[k] = v
          changed++
        }
      if (site.defaultLang !== d.default) {
        site.defaultLang = d.default
        changed++
      }
      return JSON.stringify({ changed })
    }
    if (code.includes('pll_save_post_translations')) {
      const c = { lang: 0, groups: 0, termLang: 0, termGroups: 0 }
      for (const [id, l] of Object.entries(d.posts))
        if (site.postLang.get(Number(id)) !== l) {
          site.postLang.set(Number(id), l)
          c.lang++
        }
      for (const g of d.groups) {
        const key = JSON.stringify(g)
        if (!site.postGroups.includes(key)) {
          site.postGroups.push(key)
          c.groups++
        }
      }
      for (const [id, l] of Object.entries(d.terms))
        if (site.termLang.get(Number(id)) !== l) {
          site.termLang.set(Number(id), l)
          c.termLang++
        }
      for (const g of d.termGroups) {
        const key = JSON.stringify(g)
        if (!site.termGroups.includes(key)) {
          site.termGroups.push(key)
          c.termGroups++
        }
      }
      return JSON.stringify(c)
    }
    throw new Error(`fake wp: unsupported eval ${code.slice(0, 80)}`)
  }
  // wp_unique_post_slug(): a name taken by another post of the type gets `-2`, `-3`, …
  const unique = (p) => {
    if (p.post_type !== 'post' || !p.post_name) return p
    const base = p.post_name
    const taken = (n) => [...site.posts.values()].some((o) => o !== p && o.post_type === 'post' && o.post_status !== 'trash' && o.post_name === n)
    for (let n = 2; taken(p.post_name); n++) p.post_name = `${base}-${n}`
    return p
  }
  const run = (raw, { stdin } = {}) => {
    const args = raw.map(String)
    site.calls.push(args)
    const [cmd, sub] = args
    if (cmd === 'option' && sub === 'get') {
      // `optionErrors`: options whose next reads fail as a broken database would (a count each).
      if (site.optionErrors?.[args[2]] > 0) {
        site.optionErrors[args[2]]--
        return { code: 1, stdout: '', stderr: 'Error: Error establishing a database connection.' }
      }
      if (site.options.has(args[2])) return ok(args.includes('--format=json') ? asWordPressJson(site.options.get(args[2])) : site.options.get(args[2]))
      return { code: 1, stdout: '', stderr: `Error: Could not get '${args[2]}' option. Does it exist?` }
    }
    if (cmd === 'option' && sub === 'update') {
      site.options.set(args[2], args[3])
      return ok()
    }
    if (cmd === 'plugin' && sub === 'list') return ok(JSON.stringify([{ name: 'contact-form-7', status: 'active' }]))
    // Authors (seed.mjs seedAuthors): users created once and listed after; `--meta_key` /
    // `--meta_value` filter the list as get_users() does; user meta lives in `site.userMeta`.
    if (cmd === 'user' && sub === 'list') {
      let rows = [...(site.users ?? new Map()).values()]
      const mk = arg(args, 'meta_key')
      if (mk !== undefined) rows = rows.filter((u) => site.userMeta.get(u.ID)?.[mk] === arg(args, 'meta_value'))
      return ok(JSON.stringify(rows))
    }
    // A login or an email already in use is refused, as wp_insert_user() refuses it.
    if (cmd === 'user' && sub === 'create') {
      site.users ??= new Map()
      site.userEmails ??= new Map()
      if ([...site.users.values()].some((u) => u.user_login === args[2])) return { code: 1, stdout: '', stderr: 'Error: Sorry, that username already exists!' }
      if ([...site.userEmails.values()].includes(args[3])) return { code: 1, stdout: '', stderr: 'Error: Sorry, that email address is already used!' }
      const id = site.nextId++
      site.users.set(id, { ID: id, user_login: args[2], display_name: arg(args, 'display_name') ?? '', description: storedDescription(arg(args, 'description') ?? '') })
      site.userEmails.set(id, args[3])
      site.userRoles ??= new Map()
      site.userRoles.set(id, [arg(args, 'role') ?? 'subscriber'])
      return ok(String(id))
    }
    if (cmd === 'user' && sub === 'update') {
      const u = site.users?.get(Number(args[2]))
      if (u) {
        if (arg(args, 'display_name') !== undefined) u.display_name = arg(args, 'display_name')
        if (arg(args, 'description') !== undefined) u.description = storedDescription(arg(args, 'description'))
      }
      return ok()
    }
    if (cmd === 'user' && sub === 'meta') {
      const [, , op, id, key, value] = args
      const meta = site.userMeta.get(Number(id)) ?? {}
      site.userMeta.set(Number(id), meta)
      if (op === 'get') return meta[key] !== undefined ? ok(String(meta[key])) : fail()
      if (op === 'list') {
        const keys = arg(args, 'keys')?.split(',') ?? Object.keys(meta)
        return ok(JSON.stringify(keys.filter((k) => meta[k] !== undefined).map((k) => ({ user_id: Number(id), meta_key: k, meta_value: String(meta[k]) }))))
      }
      if (op === 'update') meta[key] = value
      return ok()
    }
    if (cmd === 'term' && sub === 'list')
      return ok(
        JSON.stringify(
          [...site.terms.values()].map((t) => ({ ...t, url: `http://x/category/${t.slug}/` }))
        )
      )
    if (cmd === 'term' && sub === 'create') {
      const id = site.nextId++
      site.terms.set(id, {
        term_id: id,
        slug: arg(args, 'slug'),
        parent: Number(arg(args, 'parent') ?? 0),
        // sanitize_term stores the name HTML-encoded, and `term list` prints it so.
        name: String(args[3]).replace(/&/g, '&amp;'),
        description: arg(args, 'description') ?? ''
      })
      return ok(String(id))
    }
    if (cmd === 'term' && sub === 'update') {
      const t = site.terms.get(Number(args[3]))
      Object.assign(t, { name: arg(args, 'name') !== undefined ? arg(args, 'name').replace(/&/g, '&amp;') : t.name, parent: Number(arg(args, 'parent') ?? t.parent) })
      return ok()
    }
    if (cmd === 'post' && sub === 'list') {
      const types = arg(args, 'post_type').split(',')
      // `failAttachmentList`: the next attachment reads that ask for post_parent fail (a count).
      if (types.includes('attachment') && String(arg(args, 'fields') ?? '').includes('post_parent') && site.failAttachmentList > 0) {
        site.failAttachmentList--
        return { code: 1, stdout: '', stderr: 'Error: Error establishing a database connection.' }
      }
      // `emptyAttachmentList`: the next attachment reads that ask for post_parent answer an empty list (a count).
      if (types.includes('attachment') && String(arg(args, 'fields') ?? '').includes('post_parent') && site.emptyAttachmentList > 0) {
        site.emptyAttachmentList--
        return ok('[]')
      }
      // `any` is every type that is not excluded from search: attachments and the editor's own types are left out, as WP_Query leaves them.
      const searchable = (p) => !['attachment', 'wp_navigation', 'wp_template', 'wp_template_part', 'wp_global_styles', 'revision', 'nav_menu_item'].includes(p.post_type)
      let rows = [...site.posts.values()].filter((p) => (types.includes('any') ? searchable(p) : types.includes(p.post_type)))
      const inn = arg(args, 'post__in')
      if (inn) rows = rows.filter((p) => inn.split(',').map(Number).includes(p.ID))
      const names = arg(args, 'post_name__in')
      if (names) rows = rows.filter((p) => names.split(',').includes(p.post_name))
      const status = arg(args, 'post_status')
      rows = status && status !== 'any' ? rows.filter((p) => status.split(',').includes(p.post_status)) : rows.filter((p) => p.post_status !== 'trash')
      // category_name: that category and every one below it, as WP_Query reads it.
      const cat = arg(args, 'category_name')
      if (cat !== undefined) {
        const ids = new Set([...site.terms.values()].filter((t) => t.slug === cat).map((t) => t.term_id))
        for (let grew = true; grew; ) {
          grew = false
          for (const t of site.terms.values())
            if (ids.has(t.parent) && !ids.has(t.term_id)) {
              ids.add(t.term_id)
              grew = true
            }
        }
        rows = rows.filter((p) => String(p.post_category ?? '').split(',').some((id) => ids.has(Number(id))))
      }
      // tag__not_in: tag ids, comma-separated (WP-CLI splits a `__` argument into a list).
      const notTags = arg(args, 'tag__not_in')
      if (notTags !== undefined) {
        const slugs = new Set(notTags.split(',').map((id) => site.terms.get(Number(id))?.slug).filter(Boolean))
        rows = rows.filter((p) => !String(p.tags_input ?? '').split(',').some((t) => slugs.has(t)))
      }
      if (arg(args, 'meta_key') !== undefined) rows = rows.filter((p) => String(p.meta?.[arg(args, 'meta_key')]) === arg(args, 'meta_value'))
      if (args.includes('--format=ids')) return ok(rows.map((p) => p.ID).join(' '))
      return ok(
        JSON.stringify(
          rows.map((p) => ({
            ...p,
            post_content: p.content,
            url: urlOf(p),
            guid: `http://x/wp-content/uploads/${p.post_name}.jpg`,
            page_template: p.meta._wp_page_template ?? ''
          }))
        )
      )
    }
    if (cmd === 'post' && sub === 'create') {
      const id = site.nextId++
      site.posts.set(id, postFrom(id, args.slice(3), stdin))
      return ok(String(id))
    }
    if (cmd === 'post' && sub === 'update') {
      const p = site.posts.get(Number(args[2]))
      const next = postFrom(p.ID, args.slice(3), stdin)
      Object.assign(p, { ...next, meta: { ...p.meta, ...next.meta } })
      unique(p)
      return ok()
    }
    if (cmd === 'post' && sub === 'meta') {
      const [, , op, id, key, value] = args
      const p = site.posts.get(Number(id))
      if (op === 'get') return p?.meta[key] !== undefined ? ok(String(p.meta[key])) : fail()
      // `post meta list <id> --keys=<k> --format=json`: [] when the post has none.
      if (op === 'list') {
        const keys = arg(args, 'keys')?.split(',') ?? Object.keys(p?.meta ?? {})
        return ok(JSON.stringify(keys.filter((k) => p?.meta[k] !== undefined).map((k) => ({ post_id: Number(id), meta_key: k, meta_value: String(p.meta[k]) }))))
      }
      if (op === 'update') p.meta[key] = value
      if (op === 'delete') delete p.meta[key]
      return ok()
    }
    if (cmd === 'post' && sub === 'term') return ok()
    // No --force: WordPress moves the post to the trash, where it can be restored.
    if (cmd === 'post' && sub === 'delete') {
      if (args.includes('--force')) throw new Error('fake wp: post delete --force')
      for (const id of args.slice(2).filter((a) => !a.startsWith('--'))) site.posts.get(Number(id)).post_status = 'trash'
      return ok()
    }
    if (cmd === 'media' && sub === 'import') {
      const ids = args
        .slice(2)
        .filter((a) => !a.startsWith('--'))
        .map((file) => {
          const id = site.nextId++
          // `attachmentName(file)`: the post_name WordPress gives the file (its basename, sanitised);
          // unset, every attachment has a name no route uses.
          site.posts.set(id, { ID: id, post_type: 'attachment', post_status: 'inherit', post_name: site.attachmentName?.(file) ?? `img-${id}`, post_parent: 0, meta: {} })
          return id
        })
      return ok(ids.join('\n'))
    }
    if (cmd === 'rewrite') return ok()
    // `theme install <zip> --force --activate` (seed.mjs rebuildTheme): recorded; `onThemeInstall`
    // lets a test change what the site answers once the theme is on it.
    if (cmd === 'theme' && sub === 'install') {
      site.themeInstalls.push(args[2])
      site.onThemeInstall?.(args[2])
      return ok()
    }
    if (cmd === 'eval') return ok(evalPhp(args[1]))
    if (cmd === 'eval-file' && sub === '-') return ok(evalFile(stdin))
    throw new Error(`fake wp: unsupported ${args.slice(0, 3).join(' ')}`)
  }
  // The two PHP files of lib/post-batch.mjs, by the marker on their second line; the payload is
  // the base64 JSON the prelude carries. upsert-posts is applied the way `post create` / `post
  // update` were: fields from the item, meta merged, template and category cleared on request.
  const evalFile = (code) => {
    const payload = JSON.parse(Buffer.from(/\$tracy_payload_b64 = '([^']*)'/.exec(code)[1], 'base64').toString('utf8'))
    if (/^\/\/ tracy-php: fingerprints$/m.test(code)) {
      const out = {}
      for (const p of site.posts.values()) if (p.meta?._tracy_seed !== undefined) out[p.ID] = String(p.meta._tracy_seed)
      return JSON.stringify(out)
    }
    if (/^\/\/ tracy-php: upsert-posts$/m.test(code)) {
      return JSON.stringify(
        payload.items.map((it) => {
          const fields = (p) => {
            for (const k of ['post_type', 'post_title', 'post_name', 'post_status', 'post_parent', 'menu_order', 'post_excerpt'])
              if (it[k] !== undefined) p[k] = k === 'post_parent' || k === 'menu_order' ? Number(it[k]) : it[k]
            if (it.post_category !== undefined) p.post_category = String(it.post_category)
            if (it.tags_input !== undefined) p.tags_input = it.tags_input
            if (it.post_author !== undefined) p.post_author = Number(it.post_author)
            p.content = it.post_content ?? ''
            p.meta = { ...p.meta, ...it.meta }
            if (it.clear_template) delete p.meta._wp_page_template
            if (it.clear_tags && it.tags_input === undefined) delete p.tags_input
            return p
          }
          if (it.meta_only) {
            const p = site.posts.get(it.existing_id)
            Object.assign(p.meta, it.meta)
            return { id: p.ID, slug: p.post_name, action: 'updated', error: null }
          }
          if (it.existing_id) {
            const p = unique(fields(site.posts.get(it.existing_id)))
            return { id: p.ID, slug: p.post_name, action: 'updated', error: null }
          }
          const id = site.nextId++
          const p = unique(fields({ ID: id, meta: {} }))
          site.posts.set(id, p)
          return { id, slug: p.post_name, action: 'created', error: null }
        })
      )
    }
    throw new Error(`fake wp: unsupported eval-file ${code.slice(0, 80)}`)
  }
  const out = (args, opts) => run(args, opts).stdout.trim()
  const json = (args, opts) => {
    const list = args.some((a) => String(a).startsWith('--format=')) ? args : [...args, '--format=json']
    const text = out(list, opts)
    return text ? JSON.parse(text) : null
  }
  const ids = (args, opts) => {
    const text = out([...args, '--format=ids'], opts)
    return text ? text.split(/\s+/).map(Number) : []
  }
  const phpEval = (code, opts) => out(['eval', code], opts)
  site.wp = { run, out, json, ids, phpEval, calls: site.calls, dryRun: false }
  site.page = (pred) => [...site.posts.values()].find((p) => p.post_type === 'page' && pred(p))
  site.post = (pred) => [...site.posts.values()].find((p) => p.post_type === 'post' && pred(p))
  site.payloads = (fn) => site.evals.filter((c) => c.includes(fn)).map(payloadOf)
  return site
}
