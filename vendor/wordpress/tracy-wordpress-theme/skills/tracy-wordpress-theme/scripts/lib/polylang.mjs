// polylang.mjs — what the seeder asks Polylang (3.8, free) to do, through `wp eval` only.
//
// Polylang keeps a language as a term pair plus a row in its `polylang` option; the plugin's own
// model is the one safe writer of that (PLL()->model->languages, PLL()->options), so every call
// here is a PHP snippet run through wp-cli, with its data passed as one base64 JSON argument —
// a title with a quote or a Cyrillic slug never meets a shell or a PHP string literal.
//
// The free plugin: a post or term has one language (pll_set_*_language) and one translation
// group (pll_save_*_translations, keyed by language slug); `wp_navigation` posts have neither;
// two languages cannot share a slug (that is Pro's "share slugs"). Everything below stays within
// that. Each write is read-first, so a second run changes nothing and says so.

/** The WordPress locale a spec locale code maps to; `<code>_<CODE>` for one not listed. */
const WP_LOCALES = { en: 'en_US', ru: 'ru_RU', vi: 'vi', de: 'de_DE', fr: 'fr_FR', es: 'es_ES' }
const wpLocale = (code) => WP_LOCALES[code] ?? `${code}_${String(code).toUpperCase()}`

const php = (data, body) =>
  `$d=json_decode(base64_decode('${Buffer.from(JSON.stringify(data)).toString('base64')}'),true);${body}`

const parse = (text, what) => {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`polylang ${what}: not JSON: ${text.slice(0, 200)} (${e.message})`)
  }
}

/** The languages the site has: `[{ slug, locale, name }]`. */
function pllLanguages(wp) {
  return (
    parse(
      wp.phpEval(
        `echo json_encode(array_values(array_map(fn($l)=>['slug'=>$l->slug,'locale'=>$l->locale,'name'=>$l->name],PLL()->model->languages->get_list())));`
      ),
      'languages'
    ) ?? []
  )
}

/** Add one language; name, flag and direction come from Polylang's own table for the locale. */
function pllAddLanguage(wp, { locale, slug, term_group }) {
  const r = parse(
    wp.phpEval(
      php(
        { locale, slug, term_group },
        `$r=PLL()->model->languages->add($d);echo json_encode(is_wp_error($r)?['error'=>$r->get_error_message()]:['ok'=>true]);`
      ),
      { mutate: true }
    ),
    'add'
  )
  if (r?.error) throw new Error(`polylang: cannot add language ${slug} (${locale}): ${r.error}`)
}

/**
 * The default language and the URL options, written only when they differ. `force_lang: 1`
 * is the language as a directory (`/ru/`), `hide_default` keeps the default language at `/`,
 * `browser` and `redirect_lang` off so a probe from any client sees the page it asked for.
 */
function pllConfigure(wp, { defaultLocale, options }) {
  const r = parse(
    wp.phpEval(
      php(
        { default: defaultLocale, options },
        `$c=0;foreach($d['options'] as $k=>$v){if(PLL()->options->get($k)!==$v){PLL()->options->set($k,$v);$c++;}}` +
          `if(PLL()->options->get('default_lang')!==$d['default']){PLL()->model->languages->update_default($d['default']);$c++;}` +
          `if($c){PLL()->options->save_all();}echo json_encode(['changed'=>$c]);`
      ),
      { mutate: true }
    ),
    'configure'
  )
  return r?.changed ?? 0
}

/**
 * Languages and translation groups of posts and terms, in one call: `posts` and `terms` map
 * id → language slug, `groups` and `termGroups` are `{ <lang>: id }` objects. Returns how many
 * of each were changed (a language already set, a group already saved, is a no-op). Ends by
 * clearing Polylang's languages cache, so the static-page translations are seen.
 */
export function pllLink(wp, { posts = {}, groups = [], terms = {}, termGroups = [] }) {
  return (
    parse(
      wp.phpEval(
        php(
          { posts, groups, terms, termGroups },
          `$c=['lang'=>0,'groups'=>0,'termLang'=>0,'termGroups'=>0];` +
            `foreach($d['posts'] as $id=>$l){if(pll_get_post_language((int)$id)!==$l){pll_set_post_language((int)$id,$l);$c['lang']++;}}` +
            `foreach($d['groups'] as $g){$g=array_map('intval',$g);$cur=array_map('intval',(array)pll_get_post_translations(reset($g)));ksort($g);ksort($cur);if($cur!==$g){pll_save_post_translations($g);$c['groups']++;}}` +
            `foreach($d['terms'] as $id=>$l){if(pll_get_term_language((int)$id)!==$l){pll_set_term_language((int)$id,$l);$c['termLang']++;}}` +
            `foreach($d['termGroups'] as $g){$g=array_map('intval',$g);$cur=array_map('intval',(array)pll_get_term_translations(reset($g)));ksort($g);ksort($cur);if($cur!==$g){pll_save_term_translations($g);$c['termGroups']++;}}` +
            // The languages cache carries each language's page_on_front / page_for_posts, computed
            // when the language was created — before these translations existed. Stale, the
            // secondary locale's posts index renders as a plain page and the switcher on its
            // front page says "no translation". Cleaned here, it is rebuilt on the next request.
            `PLL()->model->clean_languages_cache();` +
            `echo json_encode($c);`
        ),
        { mutate: true }
      ),
      'link'
    ) ?? { lang: 0, groups: 0, termLang: 0, termGroups: 0 }
  )
}

/**
 * The languages step: every locale of the spec exists (created in spec order, `term_group` is
 * that order), the default is the spec's, the URL options are set. Returns the report entry.
 */
export function seedLanguages(wp, { locales, defaultLocale }) {
  const have = new Set(pllLanguages(wp).map((l) => l.slug))
  const created = []
  locales.forEach((code, i) => {
    if (have.has(code)) return
    pllAddLanguage(wp, { locale: wpLocale(code), slug: code, term_group: i })
    created.push(code)
  })
  const changed = pllConfigure(wp, {
    defaultLocale,
    options: { force_lang: 1, hide_default: true, browser: false, redirect_lang: false }
  })
  if (created.length || changed) wp.run(['rewrite', 'flush'])
  return {
    plugin: 'polylang',
    languages: locales.map((code) => code),
    created,
    optionsChanged: changed
  }
}
