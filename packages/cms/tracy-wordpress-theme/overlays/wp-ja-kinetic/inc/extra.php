<?php
/**
 * wp-ja-kinetic — what this target adds on top of the source theme: the chrome stylesheet, the
 * theme switch, the mega menu block and the `wp-ja-kinetic` pattern category. Loaded by the
 * generic hook at the end of functions.php (the source theme has no inc/extra.php, so it is
 * inert there).
 *
 * Functions here carry the `wp_ja_kinetic_` prefix; the shared `tracy_*` helpers of functions.php
 * (tracy_page_kind() and friends) are already defined when this file runs.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

// The body.item-<Itemid> class the ported per-page CSS overlays (css/page-<Itemid>.css) are keyed
// on — kept in its own file, `inc/item-ids.php`, because the map is data plus one lookup, not a
// chrome/block/aria concern like the rest of this file.
require get_theme_file_path( 'inc/item-ids.php' );

// The live parts of /product/blog and /pages/engineering a static template cannot express: the
// featured-post query exclusion and the helpers the dynamic blocks under blocks/ call for real
// counts. Its own file for the same reason as item-ids.php above.
require get_theme_file_path( 'inc/blog-dynamic.php' );

// Site-wide element-tag rewrite (D-11): a class → tag map plus a `render_block` filter that renames
// or unwraps a block's rendered markup to the Joomla source's own tag. Its own file for the same
// reason as item-ids.php above — it is data (the map) plus one filter, not a chrome/block/aria
// concern, and it is large enough on its own (run-3 audits' full tagDiff list) to earn the file.
require get_theme_file_path( 'inc/tag-parity.php' );

// The source's list views at its own addresses and the page templates the seeder does not choose,
// both keyed on page meta the run's post-seed step writes. Its own file for the same reason as
// item-ids.php above: a request/template concern, not chrome.
require get_theme_file_path( 'inc/list-pages.php' );

// The words the source keeps editable in its admin (D-40): the CTA band as named synced patterns,
// page ledes / archive crumb / empty message from the page. Its own file for the same reason as
// item-ids.php above.
require get_theme_file_path( 'inc/owner-text.php' );

// The pricing comparison table drops the empty feature row the demo content carries under each
// group divider. Its own file for the same reason as item-ids.php above.
require get_theme_file_path( 'inc/pricing-matrix.php' );

// The Contact page's mailboxes — the one it shows and the one its form sends to — read from the
// site, never written into a template (ledger L17). Its own file for the same reason as
// item-ids.php above.
require get_theme_file_path( 'inc/contact.php' );

// The identity tokens a page or part may carry (`{site.title}` in the footer's copyright line), filled from the
// site's own name. Its own file: it is the one list of tokens the theme answers for.
require get_theme_file_path( 'inc/identity.php' );

// Links the theme's templates write to the site's own pages, drawn only while that page is published, and the
// error page's newsletter link. Its own file for the same reason as item-ids.php above.
require get_theme_file_path( 'inc/page-links.php' );

/**
 * The chrome assets. The design pages (fixture, artifact) render a design system's own markup
 * under its own stylesheet and dequeue the theme's; nothing here belongs on them either.
 */
function wp_ja_kinetic_enqueue_assets(): void {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return;
	}
	// The theme version plus the newest asset file's time: a fix shipped without a version bump
	// (a site's own edit, or a patch in place) must not be served from a browser's cache for a year.
	$mtime   = max( array_map( 'filemtime', glob( get_theme_file_path( 'assets/{css,js}/wp-ja-kinetic*' ), GLOB_BRACE ) ?: array( __FILE__ ) ) );
	$version = wp_get_theme()->get( 'Version' ) . '.' . $mtime;
	wp_enqueue_style( 'wp-ja-kinetic', get_theme_file_uri( 'assets/css/wp-ja-kinetic.css' ), array( 'tracy', 'tracy-layout' ), $version );
	// The sections, after the chrome: the chrome sets no section rule, and the bridge at the top of
	// this file declares the source's own custom properties, which the ported section rules read.
	wp_enqueue_style( 'wp-ja-kinetic-sections', get_theme_file_uri( 'assets/css/wp-ja-kinetic-sections.css' ), array( 'wp-ja-kinetic' ), $version );
	// The article and listing chrome (`hx-article__*`, `hx-blogmast`, `hx-blog*`), after the
	// sections for the same reason: it reads the same bridge custom properties.
	wp_enqueue_style( 'wp-ja-kinetic-article', get_theme_file_uri( 'assets/css/wp-ja-kinetic-article.css' ), array( 'wp-ja-kinetic-sections' ), $version );
	// The search page and the login/register/account/password-reset chrome (`kinetic-finder`,
	// `kinetic-auth`), after the sections for the same reason: it reads the same bridge custom
	// properties.
	wp_enqueue_style( 'wp-ja-kinetic-finder-auth', get_theme_file_uri( 'assets/css/wp-ja-kinetic-finder-auth.css' ), array( 'wp-ja-kinetic-sections' ), $version );
	// In the head, blocking, on purpose: it resolves the theme before the first paint, so a
	// visitor who chose light never sees a dark frame. It is a few hundred bytes.
	wp_enqueue_script( 'wp-ja-kinetic-dark', get_theme_file_uri( 'assets/js/wp-ja-kinetic-dark.js' ), array(), $version, array( 'in_footer' => false ) );
	wp_enqueue_script( 'wp-ja-kinetic-mega', get_theme_file_uri( 'assets/js/wp-ja-kinetic-mega.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	// The mobile drawer's drill navigation (C-18) — mirrors core Navigation's own open state onto
	// the drill CSS in wp-ja-kinetic.css; see that file's own doc comment.
	wp_enqueue_script( 'wp-ja-kinetic-drawer', get_theme_file_uri( 'assets/js/wp-ja-kinetic-drawer.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	// The login/register password eye toggle + the search page's Advanced Search collapse — both
	// elements the source itself ships hidden (see each block's own render.php doc comment).
	wp_enqueue_script( 'wp-ja-kinetic-auth-finder', get_theme_file_uri( 'assets/js/wp-ja-kinetic-auth-finder.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	// The footer's fixed "back to top" button — parts/footer.html.
	wp_enqueue_script( 'wp-ja-kinetic-back-to-top', get_theme_file_uri( 'assets/js/wp-ja-kinetic-back-to-top.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	// The contact form's client-side required-field validation, the same `validate.js`-style
	// behaviour wp-ja-kinetic-auth-finder.js already gives the auth forms — kept in its own file
	// because that one is owned by the auth surface (blocks/kinetic-contact-form/render.php doc
	// comment; SB-33).
	if ( is_page_template( 'page-contact' ) ) {
		wp_enqueue_script( 'wp-ja-kinetic-contact', get_theme_file_uri( 'assets/js/wp-ja-kinetic-contact.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	}
}
add_action( 'wp_enqueue_scripts', 'wp_ja_kinetic_enqueue_assets', 11 );

/**
 * `?theme=dark|light` decides by its FIRST value (assets/js/wp-ja-kinetic-dark.js). WordPress's canonical
 * redirect rebuilds the query from a parsed copy in which a repeated key keeps its LAST value, so
 * `?theme=dark&theme=light` would be sent to `?theme=light` before any script runs. Cancelled only when normalising the repeated key changes the
 * first value; any other redirect (host, scheme, port, path, fragment, other parameters) is left alone.
 *
 * @param string|false $redirect_url  The address WordPress wants to send the visitor to.
 * @param string       $requested_url The address that was asked for.
 * @return string|false
 */
function wp_ja_kinetic_keep_first_theme_value( $redirect_url, $requested_url ) {
	if ( ! is_string( $redirect_url ) || ! is_string( $requested_url ) ) {
		return $redirect_url;
	}
	$asked  = wp_parse_url( $requested_url );
	$wanted = wp_parse_url( $redirect_url );
	if ( ! is_array( $asked ) || ! is_array( $wanted ) ) {
		return $redirect_url;
	}
	$asked_query  = isset( $asked['query'] ) ? (string) $asked['query'] : '';
	$wanted_query = isset( $wanted['query'] ) ? (string) $wanted['query'] : '';
	unset( $asked['query'], $wanted['query'] );
	// Scheme, host, port, path or fragment differ: that redirect is not about `theme`.
	if ( $asked !== $wanted ) {
		return $redirect_url;
	}
	// Split like URLSearchParams: pairs in order, cut at the first "=", key and value decoded.
	$split = static function ( $query ) {
		$theme = array();
		$other = array();
		foreach ( explode( '&', $query ) as $pair ) {
			if ( '' === $pair ) {
				continue;
			}
			$parts = explode( '=', $pair, 2 );
			if ( 'theme' === urldecode( $parts[0] ) ) {
				$theme[] = urldecode( isset( $parts[1] ) ? $parts[1] : '' );
			} else {
				$other[] = $pair;
			}
		}
		return array( $theme, $other );
	};
	list( $asked_theme, $asked_other )   = $split( $asked_query );
	list( $wanted_theme, $wanted_other ) = $split( $wanted_query );
	if ( count( $asked_theme ) < 2 || $asked_other !== $wanted_other ) {
		return $redirect_url;
	}
	$override = static function ( $values ) {
		return ( isset( $values[0] ) && in_array( $values[0], array( 'dark', 'light' ), true ) ) ? $values[0] : '';
	};
	if ( $override( $asked_theme ) === $override( $wanted_theme ) ) {
		return $redirect_url;
	}
	return false;
}
add_filter( 'redirect_canonical', 'wp_ja_kinetic_keep_first_theme_value', 20, 2 );

/**
 * The page's direction and default theme on <html> (D-14). The source's template style decides both
 * per menu item and prints them before the first paint (`index.php:53-65`: `data-style` always, the
 * theme from the cookie, else the style's `other_default_theme`): Terminal and Signal are dark by
 * default, Blueprint light. The run's post-seed step records a page's direction in
 * `wp_ja_kinetic_style` and its default in `wp_ja_kinetic_theme_default`; a page without them is
 * Terminal and dark. `data-theme-default` is read by assets/js/wp-ja-kinetic-dark.js when the visitor
 * has made no choice.
 *
 * @param string $output The attributes WordPress prints on <html>.
 * @return string
 */
function wp_ja_kinetic_direction_attributes( string $output ): string {
	if ( is_admin() ) {
		return $output;
	}
	$id        = is_singular() ? get_queried_object_id() : 0;
	$direction = $id ? (string) get_post_meta( $id, 'wp_ja_kinetic_style', true ) : '';
	$default   = $id ? (string) get_post_meta( $id, 'wp_ja_kinetic_theme_default', true ) : '';
	$output   .= ' data-style="' . esc_attr( in_array( $direction, array( 'terminal', 'blueprint', 'signal' ), true ) ? $direction : 'terminal' ) . '"';
	$output   .= ' data-theme-default="' . esc_attr( 'light' === $default ? 'light' : 'dark' ) . '"';
	return $output;
}
add_filter( 'language_attributes', 'wp_ja_kinetic_direction_attributes' );

/**
 * The browser title: the page's own title, then the site's name (1.1.9, so every tab names the customer's site; the
 * source's global `sitename_pagetitles` was off). The page's own title comes from the menu item it is reached by
 * (post-seed writes `wp_ja_kinetic_document_title`: the menu item's title, or the article's for an article menu item —
 * "Login" over the heading "Sign in to Kinetic", "About Kinetic"), a list page's for the list views it answers (D-33),
 * "<name> - <job title>" on the author view (the source's author override), and "404" on the error page (`error.php`).
 *
 * @param string $title The title WordPress would build; empty to let it.
 * @return string
 */
function wp_ja_kinetic_document_title( string $title ): string {
	// A title that already names the site (the home page's "<site> — <slogan>") is left as it is.
	$named = static fn( string $own ): string => esc_html( str_contains( $own, get_bloginfo( 'name' ) ) ? $own : $own . ' ' . apply_filters( 'document_title_separator', '–' ) . ' ' . get_bloginfo( 'name' ) );
	if ( is_404() ) {
		return $named( '404' );
	}
	$list = function_exists( 'wp_ja_kinetic_current_list' ) ? wp_ja_kinetic_current_list() : null;
	if ( $list && 'author' === $list['kind'] && is_author() ) {
		$user = get_queried_object();
		if ( $user instanceof WP_User ) {
			$job = (string) get_user_meta( $user->ID, 'wp_ja_kinetic_job_title', true );
			return $named( $user->display_name . ( '' !== $job ? ' - ' . $job : '' ) );
		}
	}
	$page = $list ? $list['page'] : ( is_singular() ? get_queried_object() : null );
	if ( $page instanceof WP_Post ) {
		$own = (string) get_post_meta( $page->ID, 'wp_ja_kinetic_document_title', true );
		return $named( '' !== $own ? $own : get_the_title( $page ) );
	}
	return $title;
}
add_filter( 'pre_get_document_title', 'wp_ja_kinetic_document_title' );

/**
 * Any other view keeps WordPress's own title with the site's name, without the tagline.
 *
 * @param array $parts The title parts.
 * @return array
 */
function wp_ja_kinetic_document_title_parts( array $parts ): array {
	unset( $parts['tagline'] );
	return $parts;
}
add_filter( 'document_title_parts', 'wp_ja_kinetic_document_title_parts' );

/**
 * The meta description the source prints on every view (Joomla's `metadesc`, the site's own as the
 * fallback): the page's `wp_ja_kinetic_metadesc`, else its stored excerpt, else the front page's,
 * else the tagline. WordPress core prints none; an SEO plugin that does is left to do it alone.
 */
function wp_ja_kinetic_meta_description(): void {
	if ( defined( 'WPSEO_VERSION' ) || defined( 'RANK_MATH_VERSION' ) || defined( 'AIOSEO_VERSION' ) || defined( 'SEOPRESS_VERSION' ) ) {
		return;
	}
	$of   = static function ( int $id ): string {
		$own = trim( (string) get_post_meta( $id, 'wp_ja_kinetic_metadesc', true ) );
		return '' !== $own ? $own : ( has_excerpt( $id ) ? trim( wp_strip_all_tags( get_the_excerpt( $id ) ) ) : '' );
	};
	$list = function_exists( 'wp_ja_kinetic_current_list' ) ? wp_ja_kinetic_current_list() : null;
	$page = $list ? $list['page'] : ( is_singular() ? get_queried_object() : null );
	$desc = $page instanceof WP_Post ? $of( $page->ID ) : '';
	if ( '' === $desc && is_author() && get_queried_object() instanceof WP_User ) {
		$desc = trim( (string) get_the_author_meta( 'description', get_queried_object_id() ) );
	}
	if ( '' === $desc && (int) get_option( 'page_on_front' ) ) {
		$desc = $of( (int) get_option( 'page_on_front' ) );
	}
	if ( '' === $desc ) {
		$desc = (string) get_bloginfo( 'description' );
	}
	if ( '' !== $desc ) {
		printf( "<meta name=\"description\" content=\"%s\">\n", esc_attr( wp_html_excerpt( $desc, 300 ) ) );
	}
}
add_action( 'wp_head', 'wp_ja_kinetic_meta_description', 1 );

/**
 * The site's icon is WordPress's own Site Icon (Settings > General, Customizer > Site Identity),
 * printed by core's wp_site_icon(). Until the owner sets one, the theme prints a single fallback:
 * the Kinetic mark of the header logo (parts/header.html, the same two strokes) in the accent
 * green, lime on a dark tab bar. The Joomla quickstart's favicon.ico is the Joomla logo, so it is
 * not carried. In the Customizer preview core prints its own placeholder icon even without a Site
 * Icon, so the fallback stays out there too: one icon link in the head in every case.
 */
function wp_ja_kinetic_favicon(): void {
	if ( has_site_icon() || is_customize_preview() ) {
		return;
	}
	printf( "<link rel=\"icon\" href=\"%s\" type=\"image/svg+xml\">\n", esc_url( get_theme_file_uri( 'assets/images/favicon.svg' ) ) );
}
add_action( 'wp_head', 'wp_ja_kinetic_favicon', 2 );

/**
 * AcyMailing's own frontend module stylesheet (`style_acymailing_module`, media/css/module.min.css)
 * is its admin-UI bundle reused as-is on the front end — an acymicon webfont plus generic
 * `.acym_module`/`.onefield`/button rules the source never carries (Joomla's ACYM component ships
 * its own separate CSS, none of which the WordPress plugin's stylesheet is). The chrome sheet
 * styles every one of the block's classes to match the source's own `.hx-foot-news-band` rules
 * (css/template.css:13074-13188) directly, so this bundle only adds conflicting cascade and an
 * unused webfont request; dequeued on the footer band, the one place the block renders.
 */
function wp_ja_kinetic_dequeue_acymailing_module_css(): void {
	wp_dequeue_style( 'style_acymailing_module' );
	wp_deregister_style( 'style_acymailing_module' );
}
add_action( 'wp_enqueue_scripts', 'wp_ja_kinetic_dequeue_acymailing_module_css', 999 );

/**
 * AcyMailing's email field has no admin-configurable placeholder distinct from its label — the
 * plugin sets `placeholder` to the field's own name ("Email") whenever the label itself is hidden
 * (back/Classes/FieldClass.php:550-551), and renaming the field would also rename its label
 * everywhere else in the plugin. The source's own field carries `placeholder="you@company.com"`
 * (css/template.css capture, acm-footerlegal band); the swap below is scoped to this one block's
 * rendered markup, not the field definition.
 */
function wp_ja_kinetic_newsletter_placeholder( string $content, array $block ): string {
	if ( 'acymailing/subscription-form' !== ( $block['blockName'] ?? '' ) ) {
		return $content;
	}
	return str_replace( 'placeholder="Email"', 'placeholder="you@company.com"', $content );
}
add_filter( 'render_block', 'wp_ja_kinetic_newsletter_placeholder', 10, 2 );

/**
 * AcyMailing's own template leaves a trailing newline/tab inside the submit button's text node
 * (measured live: `<button … class="… subbutton">Subscribe\t</button>`) — the source's own field
 * is a self-closing `<input type="button" value="Subscribe">`, so its label carries no such
 * whitespace. The browser collapses the stray whitespace to one visible space, which widened the
 * button against the source (css/template.css:13179-13188 padding unchanged, `13px 34px`, matches
 * this theme's own `.acysubbuttons .subbutton` rule already).
 * Trimmed here the same way the placeholder above is rewritten: scoped to this one block.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_newsletter_button_trim( string $content, array $block ): string {
	if ( 'acymailing/subscription-form' !== ( $block['blockName'] ?? '' ) ) {
		return $content;
	}
	// The whitespace sits between the label text and the closing tag ("Subscribe\t</button>"),
	// not right after the opening tag — this block renders exactly one `<button>`, so trimming
	// whatever whitespace immediately precedes any `</button>` in its markup is unambiguous.
	return (string) preg_replace( '/\s+(<\/button>)/', '$1', $content );
}
add_filter( 'render_block', 'wp_ja_kinetic_newsletter_button_trim', 10, 2 );

/** The mega menu block and the pattern category the overlay's patterns file under. */
function wp_ja_kinetic_register(): void {
	// Guarded: register_block_type() given a path that does not exist treats it as a block NAME
	// and logs a notice on every request; a theme copied without its blocks/ directory would
	// otherwise be noisy instead of merely lacking the block.
	$blocks = array(
		'mega-menu',
		// The search page and the login/register/account/password-reset forms: each posts to a
		// real WordPress endpoint (wp-login.php and friends), so each needs PHP to build the
		// current nonce-free query vars and conditionals a static pattern block cannot carry.
		'kinetic-search-form',
		'kinetic-auth-login',
		'kinetic-auth-register',
		'kinetic-auth-password',
		'kinetic-auth-account',
		'kinetic-search-results',
		'kinetic-auth-notice',
		// /company/contact: the source's live com_contact record (form fields, methods list) a
		// static pattern cannot express — see blocks/kinetic-contact-form/render.php.
		'kinetic-contact-form',
		// /product/blog and /pages/engineering: live counts and the featured-read card a static
		// template cannot express — see inc/blog-dynamic.php.
		'field-notes-featured',
		'blog-topics-items',
		'blog-rail',
		'blog-ledger-header',
		'category-siblings',
		'archive-months',
		'author-identity',
		'related-posts',
		// /product/authors, /product/all-categories, /pages/tags: generated directories, not
		// article content — a static pattern cannot carry a live get_users()/get_categories()/
		// get_tags() query, so each is a small dynamic block on its own page template.
		'authors-directory',
		'categories-index',
		'tags-cloud',
		// Steps 4-5 fix-to-identical round 2 — see inc/blog-dynamic.php: the source's own
		// computed-initials avatar, byline meta line, Joomla-shaped pagination, per-row read
		// time, and count-ordered tag rail, none of which a static pattern or a core block
		// alone can carry.
		'author-initials',
		'article-byline-meta',
		'kinetic-pagination',
		'post-readtime',
		'popular-tags',
		'current-term-name',
		'post-topic-eyebrow',
		'category-card-part',
		// The source's hidden article info block + prev/next nav (single.html).
		'article-foot',
	);
	foreach ( $blocks as $block ) {
		if ( is_readable( get_theme_file_path( "blocks/{$block}/block.json" ) ) ) {
			register_block_type( get_theme_file_path( "blocks/{$block}" ) );
		}
	}
	register_block_pattern_category( 'wp-ja-kinetic', array( 'label' => __( 'WP Kinetic', 'wp-ja-kinetic' ) ) );
}
add_action( 'init', 'wp_ja_kinetic_register' );

/**
 * WordPress core registers `post_tag` with no `sort` support, so `wp_set_object_terms()` never
 * populates `wp_term_relationships.term_order` for it — every relationship keeps the column's
 * default, `0` (verified: the theme's own bundled `wp-includes/taxonomy.php:2963` only runs the
 * `term_order` INSERT/UPDATE block `if ( ! $append && isset( $t->sort ) && $t->sort )`, and a
 * fresh probe with `wp_set_post_tags( $id, array( 'zeta', 'alpha', 'metrics' ), false )` left all
 * three at `term_order = 0`). `blocks/related-posts/render.php` needs that column to reproduce
 * the source's "first tag ASSIGNED, not first alphabetically" rule
 * (`article/default_related.php:56-71`, `tag_date ASC`) — so `post_tag` is opted into `sort`
 * here, on `init` after core's own `create_initial_taxonomies()` (priority 0) has already run.
 * Same probe with this hook active: `term_order` came back `1, 2, 3` in assignment order.
 *
 * This is a real, sitewide taxonomy behaviour change (every future `post_tag` assignment on this
 * site gets an ordered `term_order`, not only ones this theme's own code makes), not a
 * theme-local workaround — the only way to make `term_order` mean anything for `post_tag` at
 * all. See `posts.contract.json` for what this asks of the seeder.
 */
function wp_ja_kinetic_sort_post_tags(): void {
	global $wp_taxonomies;
	if ( isset( $wp_taxonomies['post_tag'] ) ) {
		$wp_taxonomies['post_tag']->sort = true;
	}
}
add_action( 'init', 'wp_ja_kinetic_sort_post_tags', 20 );

/**
 * A request path, trailing slash and query dropped, so two spellings of one page compare equal.
 *
 * @param string $url Any URL or path.
 * @return string
 */
function wp_ja_kinetic_path( string $url ): string {
	$path = untrailingslashit( (string) wp_parse_url( $url, PHP_URL_PATH ) );
	return '' === $path ? '/' : $path;
}

/**
 * The path of the menu item the page being read belongs to, as the source marks it. A Joomla article
 * is reached through the list its category belongs to, and that list's menu item is the one marked
 * current (measured 2026-09-25: `/index.php/pages/engineering/193-…` marks Engineering,
 * `/index.php/product/blog/150-…` marks Blog). A WordPress post has no such item, so it takes the
 * list page (`wp_ja_kinetic_list` `category:<slug>`, D-33) showing its most specific category or an
 * ancestor of it. The search view marks the search page's item. Anything else is its own address.
 *
 * @param string $request The request path (`wp_ja_kinetic_path()` of REQUEST_URI).
 * @return string
 */
function wp_ja_kinetic_menu_here( string $request ): string {
	static $cache = array();
	if ( ! isset( $cache[ $request ] ) ) {
		$cache[ $request ] = wp_ja_kinetic_menu_here_uncached( $request );
	}
	return $cache[ $request ];
}

/**
 * `wp_ja_kinetic_menu_here()` without the per-request cache (it runs for every menu block).
 *
 * @param string $request The request path.
 * @return string
 */
function wp_ja_kinetic_menu_here_uncached( string $request ): string {
	if ( is_search() ) {
		$pages = get_posts(
			array(
				'post_type'   => 'page',
				'post_status' => array( 'publish', 'draft' ),
				'numberposts' => 1,
				// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value -- one lookup per request.
				'meta_key'    => 'wp_ja_kinetic_list',
				'meta_value'  => 'search', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			)
		);
		return $pages ? '/' . get_page_uri( $pages[0] ) : $request;
	}
	// A tag archive is the source's tag view, one menu item for every tag (Itemid 231, `/pages/tags`).
	if ( is_tag() && defined( 'WP_JA_KINETIC_TAG_ITEM_ID' ) ) {
		$path = array_search( WP_JA_KINETIC_TAG_ITEM_ID, WP_JA_KINETIC_PAGE_ITEM_IDS, true );
		return false === $path ? $request : '/' . $path;
	}
	if ( ! is_singular( 'post' ) ) {
		return $request;
	}
	$best  = null;
	$depth = -1;
	foreach ( get_the_category( get_queried_object_id() ) as $term ) {
		$chain = array_merge( array( $term->term_id ), get_ancestors( $term->term_id, 'category', 'taxonomy' ) );
		foreach ( $chain as $level => $term_id ) {
			$slug  = get_term( $term_id, 'category' )->slug ?? '';
			$pages = get_posts(
				array(
					'post_type'   => 'page',
					'numberposts' => 1,
					// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value -- a few lookups per request.
					'meta_key'    => 'wp_ja_kinetic_list',
					'meta_value'  => 'category:' . $slug, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				)
			);
			// The deepest match wins: the category itself before any ancestor.
			$here_depth = count( $chain ) - $level;
			if ( $pages && $here_depth > $depth ) {
				$best  = $pages[0];
				$depth = $here_depth;
			}
		}
	}
	return $best ? '/' . get_page_uri( $best ) : $request;
}

/**
 * The link to the page being read gets `aria-current="page"` — what the source's own menu emits
 * on that link (`<a href="/index.php" … aria-current="page">` in the Home panel, measured on the
 * running site 2026-09-21) and what its stylesheet paints on every chrome nav/link list: the mega
 * panel (`.mega-nav > li.active > a`, weight 500, css/template.css:20129-20137), the desktop
 * top-level items and the "Pricing" plain link (`.hx-desknav … .nav > li.active > a`, weight 500,
 * css/template.css:20017-20031), the footer columns (`ul.menu li > a`, weight 700,
 * css/template.css:20647-20670), and the mobile drawer (`.t4-off-canvas-body li.active > a`,
 * colour only, css/template.css:20388-20395). WordPress sets `aria-current` on navigation-block
 * page links automatically; every one of these is a plain list or a "custom" navigation-link, so
 * nothing marks them without this filter. Scoped to each block's own wrapper class so it never
 * touches an unrelated list/paragraph/navigation elsewhere on the page.
 *
 * `review/mega-hover.mjs` reads the same attribute on the mega panel: it clicks a panel's first
 * link that is not the current page and expects the URL to change. On the front page the Home
 * panel's first link (`Terminal`) IS the page, so without the mark the script would click it and
 * read a menu that does not navigate.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_mega_current( string $content, array $block ): string {
	$block_name = $block['blockName'] ?? '';
	$scope      = array(
		'wp-ja-kinetic/mega-menu' => null,
		'core/paragraph'          => 'tracy-header__link',
		'core/list'               => 'tracy-footer__links',
		// The header menu (`tracy-nav`) and, since D-40, the three footer columns (`tracy-footer__links`).
		'core/navigation'         => array( 'tracy-nav', 'tracy-footer__links' ),
	);
	if ( ! array_key_exists( $block_name, $scope ) || is_404() || ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return $content;
	}
	$markers = (array) $scope[ $block_name ];
	if ( $markers && ! array_filter( $markers, static fn( string $m ): bool => false !== strpos( $content, $m ) ) ) {
		return $content;
	}
	$here = wp_ja_kinetic_menu_here( wp_ja_kinetic_path( (string) wp_unslash( $_SERVER['REQUEST_URI'] ) ) );
	// Attribute order is not fixed for every block that reaches this filter: the mega panel and
	// the footer/header plain links put `href` first (`<a href="…">`), but core's own Navigation
	// block puts its own `class` first (`<a class="…" href="…">`) — the pattern below matches
	// `href` wherever it sits in the tag and re-closes on whatever comes after it.
	$marked = (string) preg_replace_callback(
		'/<a\b([^>]*)\shref="([^"]*)"([^>]*)>/',
		static function ( array $a ) use ( $here ): string {
			if ( false !== strpos( $a[1] . $a[3], 'aria-current' ) ) {
				return $a[0];
			}
			// A fragment-only link (the drawer's submenu parents are `href="#"`) names no page;
			// its path would read as `/` and mark every parent current on the front page.
			if ( '' === $a[2] || '#' === $a[2][0] ) {
				return $a[0];
			}
			if ( wp_ja_kinetic_path( html_entity_decode( $a[2] ) ) !== $here ) {
				return $a[0];
			}
			return '<a' . $a[1] . ' href="' . $a[2] . '"' . $a[3] . ' aria-current="page">';
		},
		$content
	);
	// The trigger itself has no `href` (it is a `<button>`, blocks/mega-menu/render.php) so the
	// pass above never reaches it — but the source marks the whole ancestor chain to the current
	// page, not only the leaf link (`.hx-desknav … li.active > a`, weight 500,
	// css/template.css:20017-20031: Product stays highlighted on /product/features, not only the
	// panel's own "Features" row). Once a link inside this panel is marked, mark the trigger too.
	// The source walks its menu tree, not the panel: FAQ sits under Product in `mainmenu` but not in
	// the Product panel, and `/index.php/product/faq` still marks Product (measured 2026-09-25). The
	// site's page paths follow that tree, so a panel whose links all share a first segment also
	// claims every other page under it.
	$in_panel = false !== strpos( $marked, 'aria-current="page"' );
	if ( 'wp-ja-kinetic/mega-menu' === $block_name && ! $in_panel && preg_match_all( '/\shref="\/([^"\/#?]+)/', $marked, $m ) ) {
		$segments = array_unique( $m[1] );
		$in_panel = 1 === count( $segments ) && 0 === strpos( $here . '/', '/' . $segments[0] . '/' );
	}
	if ( 'wp-ja-kinetic/mega-menu' === $block_name && $in_panel ) {
		$marked = (string) preg_replace(
			'/(<button\b[^>]*\bclass="tracy-mega__trigger")([^>]*>)/',
			'$1 aria-current="page"$2',
			$marked,
			1
		);
	}
	return $marked;
}
add_filter( 'render_block', 'wp_ja_kinetic_mega_current', 10, 2 );

/**
 * C-18: the source's mobile drawer replaces the WHOLE top-level list with a submenu's own items
 * when a parent opens — a full-panel "drill", not an in-place accordion — and each replaced
 * panel carries its own back row as the submenu list's own first child, not wrapped in an `<li>`
 * (markup captured live on the running source, 2026-09-22: `<ul class="dropdown-menu" …><button
 * class="kinetic-drill-back"><svg …/><span>Home</span></button><div class="kinetic-drill-
 * sublabel">Home Styles</div><li>…`, css/template.css:20869-20899 for the row's own paint). Core's
 * `core/navigation-submenu` block has no such row; this filter adds only the missing button —
 * assets/js/wp-ja-kinetic-drawer.js reads core's own `aria-expanded` (untouched) to flag which
 * submenu is open, and the drill rules in assets/css/wp-ja-kinetic.css key off that flag to hide
 * every sibling item, matching the source's own effect without touching core's open/close JS.
 * The source's own sublabel (a second heading inside the drilled panel, e.g. "Home Styles") is
 * the mega panel's own column title text, already carried by the desktop mega block's markup
 * elsewhere on the page — added in the browser by assets/js/wp-ja-kinetic-drawer.js, which
 * regroups the panel by those columns as the source's own script does.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_drawer_drill_back( string $content, array $block ): string {
	if ( 'core/navigation-submenu' !== ( $block['blockName'] ?? '' ) ) {
		return $content;
	}
	$label = trim( (string) ( $block['attrs']['label'] ?? '' ) );
	if ( '' === $label ) {
		return $content;
	}
	$back = '<button type="button" class="tracy-nav__drill-back" data-tracy-drill-back>'
		. '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>'
		. '<span>' . esc_html( $label ) . '</span></button>';
	return (string) preg_replace(
		'/(<ul\b[^>]*\bclass="[^"]*wp-block-navigation__submenu-container[^"]*"[^>]*>)/',
		'$1' . $back,
		$content,
		1
	);
}
add_filter( 'render_block', 'wp_ja_kinetic_drawer_drill_back', 10, 2 );

/**
 * The drawer's "Start free" button ends in the source's own arrow, an inline `<svg class="hx-cta-arrow">`
 * (the header CTA markup the source prints twice). Core's navigation-link label is text only, so the
 * arrow is added here, after the label, as a real element: a mask drawn from CSS paints the same
 * pixels but is no icon to a reader of the panel's markup, and the source's panel holds two.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_drawer_cta_arrow( string $content, array $block ): string {
	if ( is_404() || 'core/navigation-link' !== ( $block['blockName'] ?? '' ) ) {
		return $content;
	}
	$classes = preg_split( '/\s+/', trim( (string) ( $block['attrs']['className'] ?? '' ) ) );
	if ( ! in_array( 'tracy-nav__cta', is_array( $classes ) ? $classes : array(), true ) ) {
		return $content;
	}
	$arrow = '<svg class="hx-cta-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
	return (string) preg_replace( '~(</span>)(\s*</a>)~', '$1' . $arrow . '$2', $content, 1 );
}
add_filter( 'render_block', 'wp_ja_kinetic_drawer_cta_arrow', 10, 2 );

/**
 * The source's error page prints its own static header, and its drawer differs from the site-wide one in
 * two places (`templates/ja_kinetic/error.php`, measured open on the source's 404 at 390): the fifth row
 * is a plain "Search" link where every other page has the "Pages" drill, and the "Start free" button has
 * no arrow (see wp_ja_kinetic_drawer_cta_arrow). The desktop menu of the error page is the full one, and
 * is a different block, so only the drawer's row is swapped.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_404_drawer_row( string $content, array $block ): string {
	if ( ! is_404() || 'core/navigation-submenu' !== ( $block['blockName'] ?? '' ) ) {
		return $content;
	}
	if ( 'Pages' !== trim( (string) ( $block['attrs']['label'] ?? '' ) ) ) {
		return $content;
	}
	return '<li class="wp-block-navigation-item wp-block-navigation-link"><a class="wp-block-navigation-item__content" href="'
		. esc_url( home_url( '/pages/search/' ) ) . '"><span class="wp-block-navigation-item__label">'
		. esc_html__( 'Search', 'wp-ja-kinetic' ) . '</span></a></li>';
}
add_filter( 'render_block', 'wp_ja_kinetic_404_drawer_row', 11, 2 );

/**
 * The source's drawer opens on a head row — the logo (glyph + site name, linking home) and the
 * close button, over a divider (`.t4-off-canvas-header`, markup captured live on the running
 * source: `<a href="/" class="kinetic-logo" aria-label="Kinetic home"><svg class="kinetic-logo-glyph"
 * …/><span class="kinetic-logo-text">Kinetic</span></a><button class="close js-offcanvas-close">`,
 * paint css/template.css:20304-20335). Core's overlay has only its close button, so the logo is
 * added here as the dialog's first child; assets/css/wp-ja-kinetic.css lays the row out and sets
 * core's close button into it. The name is the site title, as the source's is.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_drawer_head( string $content, array $block ): string {
	if ( 'core/navigation' !== ( $block['blockName'] ?? '' ) || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'tracy-nav' ) ) {
		return $content;
	}
	$name = get_bloginfo( 'name' );
	$head = '<div class="tracy-nav__drawer-head">'
		/* translators: %s: the site title. */
		. '<a class="tracy-nav__drawer-logo" href="' . esc_url( home_url( '/' ) ) . '" aria-label="' . esc_attr( sprintf( __( '%s home', 'wp-ja-kinetic' ), $name ) ) . '">'
		. '<svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M8 4 Q16 12 8 20 Q16 28 24 20" stroke="var(--kds-logo-mark)" stroke-width="2.6" stroke-linecap="round"></path><path d="M24 12 Q16 20 24 28 Q16 4 8 12" stroke="var(--kds-logo-mark)" stroke-width="2.6" stroke-linecap="round" opacity="0.5"></path></svg>'
		. '<span>' . esc_html( $name ) . '</span></a></div>';
	return (string) preg_replace(
		'/(<div\b[^>]*\bclass="wp-block-navigation__responsive-dialog"[^>]*>)/',
		'$1' . $head,
		$content,
		1
	);
}
add_filter( 'render_block', 'wp_ja_kinetic_drawer_head', 10, 2 );

/**
 * The source's menu button draws three stroked bars (`html/layouts/t4/element/offcanvas-toggle.php`:
 * a 20×20 svg, three `<line>`s, stroke 2, round caps); core's Navigation block draws its own
 * two-bar glyph and offers no attribute for this one. Swapped in the rendered button only.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_drawer_toggle_icon( string $content, array $block ): string {
	if ( 'core/navigation' !== ( $block['blockName'] ?? '' ) || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'tracy-nav' ) ) {
		return $content;
	}
	return (string) preg_replace(
		'/(<button\b[^>]*\bwp-block-navigation__responsive-container-open\b[^>]*>)\s*<svg\b.*?<\/svg>/s',
		'$1<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
		$content,
		1
	);
}
add_filter( 'render_block', 'wp_ja_kinetic_drawer_toggle_icon', 10, 2 );

/**
 * The chrome and section stylesheets in the editor too, so the mega panel, the footer columns and
 * every inserted section look the same there as on the page.
 */
function wp_ja_kinetic_editor_styles(): void {
	add_editor_style( 'assets/css/wp-ja-kinetic.css' );
	add_editor_style( 'assets/css/wp-ja-kinetic-sections.css' );
	add_editor_style( 'assets/css/wp-ja-kinetic-article.css' );
	add_editor_style( 'assets/css/wp-ja-kinetic-finder-auth.css' );
}
add_action( 'after_setup_theme', 'wp_ja_kinetic_editor_styles', 11 );

/**
 * The editor canvas wears the page's own theme and direction, as the page does. Without this the
 * canvas root carried neither `data-theme` nor `t4-dark`, so every `light-dark()` preset resolved
 * to its light half and every `html:not(.t4-dark)` rule applied: a page visitors see dark (every
 * page but Blueprint) was edited on a light canvas. The page's `data-style` and
 * `data-theme-default` (the same post meta wp_ja_kinetic_direction_attributes() reads) go on the
 * canvas root first, then the front end's own switch resolves the theme from them and from the
 * `tracy_theme` cookie, so the canvas shows what the editing person sees on the site.
 * `enqueue_block_assets` runs inside the editor iframe; the front end is left to
 * wp_ja_kinetic_enqueue_assets().
 */
function wp_ja_kinetic_editor_canvas_theme(): void {
	if ( ! is_admin() ) {
		return;
	}
	// Read only: the id picks which page's meta the canvas wears.
	$id        = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : (int) get_the_ID(); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$direction = $id ? (string) get_post_meta( $id, 'wp_ja_kinetic_style', true ) : '';
	$default   = $id ? (string) get_post_meta( $id, 'wp_ja_kinetic_theme_default', true ) : '';
	$direction = in_array( $direction, array( 'terminal', 'blueprint', 'signal' ), true ) ? $direction : 'terminal';
	$default   = 'light' === $default ? 'light' : 'dark';
	$version   = wp_get_theme()->get( 'Version' ) . '.' . filemtime( get_theme_file_path( 'assets/js/wp-ja-kinetic-dark.js' ) );
	wp_enqueue_script( 'wp-ja-kinetic-dark', get_theme_file_uri( 'assets/js/wp-ja-kinetic-dark.js' ), array(), $version, array( 'in_footer' => false ) );
	wp_add_inline_script(
		'wp-ja-kinetic-dark',
		sprintf(
			'document.documentElement.setAttribute("data-style",%s);document.documentElement.setAttribute("data-theme-default",%s);',
			wp_json_encode( $direction ),
			wp_json_encode( $default )
		),
		'before'
	);
}
add_action( 'enqueue_block_assets', 'wp_ja_kinetic_editor_canvas_theme' );

/**
 * `aria-hidden="true"` the source puts on elements block markup has no attribute for: the
 * repeated half of the clients ticker plus its live dot and bullet separators (source
 * `acm/clients/tmpl/style-1.php:92,97,100`), the decorative hairline rule/line elements of six
 * other patterns (source `acm/testimonials/tmpl/style-1.php:75`, `acm/pricing/tmpl/style-1.php:43`,
 * `acm/pricing-matrix/tmpl/style-1.php:60`, `acm/bento/tmpl/style-1.php:34`,
 * `acm/bento/tmpl/style-2.php:45`, `acm/incident-timeline/tmpl/style-1.php:84`), the clients
 * style-2 card's logo mark and arrow glyph (source `acm/clients/tmpl/style-2.php:101,116` — the
 * card's accessible name is its link, not the decorative icons inside it), every bento tile's
 * icon (`acm/bento/tmpl/style-1.php:76`, `acm/bento/tmpl/style-2.php:98`), and the team card's
 * initials chip, a decorative fallback for a missing avatar photo — the name still comes from
 * `.hx-team-name` (`acm/teams/tmpl/style-1.php:115`). A pattern's `className` gives no way to
 * write an arbitrary attribute, so this reaches into the rendered markup by class name instead —
 * the same technique as `wp_ja_kinetic_mega_current()` above.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_decorative_aria_hidden( string $content, array $block ): string {
	$class_attr = (string) ( $block['attrs']['className'] ?? '' );
	$classes    = '' === $class_attr ? array() : preg_split( '/\s+/', $class_attr );

	// The ticker's two halves are siblings inside the track; by the time the track block itself
	// renders, both are already in $content, so only the second (the duplicate) is marked. Each
	// half has already been through inc/tag-parity.php (it renders first, as an inner block), so
	// it arrives here as a `<span>`, not the group's own `<div>` — match either tag.
	if ( in_array( 'acm-tick-track', $classes, true ) ) {
		$seen = 0;
		return (string) preg_replace_callback(
			'/<(div|span)\b([^>]*\bclass="[^"]*\bacm-tick-group\b[^"]*"[^>]*)>/',
			static function ( array $m ) use ( &$seen ): string {
				++$seen;
				return ( 2 === $seen && false === strpos( $m[2], 'aria-hidden' ) )
					? '<' . $m[1] . $m[2] . ' aria-hidden="true">'
					: $m[0];
			},
			$content
		);
	}

	// The ticker band's fixed accessible name, a literal in the source template
	// (`acm/clients/tmpl/style-1.php:89`), not an editable field.
	if ( in_array( 'acm-clients-ticker', $classes, true ) && false === strpos( $content, 'aria-label' ) ) {
		return (string) preg_replace( '/<([a-z]+)\b([^>]*)>/', '<$1$2 aria-label="Live platform stats">', $content, 1 );
	}

	// Everything else in this list is aria-hidden on every occurrence, unconditionally. Not
	// anchored to the string start: render_block content is prefixed with whitespace, and the
	// wrapper's own opening tag is always the first tag the string contains regardless.
	$always_hidden = array( 'acm-tick-dot', 'acm-tick-sep', 'hx-sec-rule', 'hx-prose-rule', 'hx-testi-rule', 'acm-bento-rule', 'hx-inc-line', 'acm-clients-mark', 'acm-clients-card-arrow', 'acm-bento-ico', 'hx-team-chip' );
	if ( array_intersect( $always_hidden, $classes ) && false === strpos( $content, 'aria-hidden' ) ) {
		return (string) preg_replace( '/<([a-z]+)\b([^>]*)>/', '<$1$2 aria-hidden="true">', $content, 1 );
	}

	return $content;
}
add_filter( 'render_block', 'wp_ja_kinetic_decorative_aria_hidden', 10, 2 );

/**
 * The style-2 client cards are `<a>` elements in the source (`acm/clients/tmpl/style-2.php:100`),
 * one per card, with the URL an editable field (`clients.item-url`) that block markup cannot carry
 * on a `core/group` — WordPress has no anchor-tag group variant. The pattern keeps the card as a
 * group, so its image, name and description stay ordinary editable inner blocks, and carries the
 * URL in a custom `url` attribute on that same block (`patterns/section-clients-style-2.php`,
 * `metadata.name` `clients.item.<n>`); this filter swaps the rendered wrapper tag for `<a
 * href="…">`, adding `target="_blank" rel="noopener noreferrer"` for an absolute http(s) URL — the
 * same rule the source applies (`style-2.php:48-54`).
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_clients_card_link( string $content, array $block ): string {
	$name = (string) ( $block['attrs']['metadata']['name'] ?? '' );
	if ( 1 !== preg_match( '/^clients\.item\.\d+$/', $name ) ) {
		return $content;
	}

	// Style-1 client logos (`patterns/section-clients.php`) share this exact `clients.item.<n>`
	// metadata.name convention with the style-2 cards this filter targets — the item-index naming
	// is common to both patterns.map.json field sets. Only the style-2 pattern comment declares a
	// `url` attribute; gate on its presence (not just the name) so the style-1 logo group, which
	// the source renders as plain `<span class="acm-clients-logo is-text">` with no href at all,
	// is left as its ordinary wrapper instead of becoming an `<a href="#">` (SA-19).
	if ( ! array_key_exists( 'url', $block['attrs'] ?? array() ) ) {
		return $content;
	}

	$url = trim( (string) ( $block['attrs']['url'] ?? '' ) );
	// A card with no destination stays a plain card, as on the source after its own fix
	// (`acm/clients/tmpl/style-2.php`: no URL → `div.hx-card.is-static`, no arrow): an `<a href="#">`
	// with an arrow promised a link that went nowhere.
	if ( '' === $url || '#' === $url ) {
		$content = (string) preg_replace( '/<div\b([^>]*)\bclass="/', '<div$1class="is-static ', $content, 1 );
		return (string) preg_replace( '~<[a-z]+\b[^>]*\bacm-clients-card-arrow\b[^>]*>.*?</(?:p|span|div)>~s', '', $content, 1 );
	}
	$ext = (bool) preg_match( '~^https?://~i', $url );

	// Not anchored to the string start: render_block content is prefixed with whitespace, and
	// the wrapper's own opening <div> is always the first tag the string contains regardless.
	$attrs   = ' href="' . esc_url( $url ) . '"' . ( $ext ? ' target="_blank" rel="noopener noreferrer"' : '' );
	$content = (string) preg_replace( '/<div\b([^>]*)>/', '<a$1' . $attrs . '>', $content, 1 );
	return (string) preg_replace( '/<\/div>\s*$/', '</a>', $content, 1 );
}
add_filter( 'render_block', 'wp_ja_kinetic_clients_card_link', 10, 2 );

/**
 * The style-2 integration card's logo mark falls back to a plain initial-letter span in the
 * source when a card has no image asset (`acm/clients/tmpl/style-2.php:101-106`,
 * `<span class="acm-clients-mark-letter">`), rather than showing any placeholder graphic. The
 * pattern's `core/image` block always needs a src to exist in the editor, so it ships the
 * theme's own unseeded placeholder (`assets/img/hero-placeholder.svg`); this filter detects that
 * exact placeholder still being the rendered src (i.e. step 7 has not seeded a real logo for this
 * card) and swaps the wrapper's contents for the same letter fallback, reading the initial off
 * the placeholder `<img>`'s own alt text — which already carries the item name. Once step 7 seeds
 * a real image the src no longer matches, and the source's bare `<img>` inside the mark
 * (`style-2.php:103`) is restored by dropping core/image's `<figure>` around it. The mark itself is
 * a `<span>` on the source; inc/tag-parity.php renames the group's `<div>`.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_clients_mark_fallback( string $content, array $block ): string {
	$class_attr = (string) ( $block['attrs']['className'] ?? '' );
	$classes    = '' === $class_attr ? array() : preg_split( '/\s+/', $class_attr );
	if ( ! in_array( 'acm-clients-mark', $classes, true ) ) {
		return $content;
	}

	$placeholder = get_theme_file_uri( 'assets/img/hero-placeholder.svg' );
	if ( false === strpos( $content, $placeholder ) ) {
		return (string) preg_replace( '/<figure\b[^>]*>\s*(<img\b[^>]*>)\s*<\/figure>/s', '$1', $content, 1 );
	}
	if ( 1 !== preg_match( '/<img\b[^>]*\balt="([^"]*)"/', $content, $m ) ) {
		return $content;
	}

	$name    = html_entity_decode( $m[1], ENT_QUOTES, 'UTF-8' );
	$initial = function_exists( 'mb_substr' )
		? mb_strtoupper( mb_substr( trim( $name ), 0, 1, 'UTF-8' ), 'UTF-8' )
		: strtoupper( substr( trim( $name ), 0, 1 ) );
	$fallback = '<span class="acm-clients-mark-letter">' . esc_html( $initial ) . '</span>';
	return (string) preg_replace( '/<figure\b.*?<\/figure>/s', $fallback, $content, 1 );
}
add_filter( 'render_block', 'wp_ja_kinetic_clients_mark_fallback', 10, 2 );

/**
 * The integration card's mark is drawn inline, its strokes and fills in currentColor, so the
 * stylesheet colours it: the readable accent role under a design system, the picture's own lime
 * (olive on the light Integrations page) without one. The demo's marks are uploaded SVG pictures;
 * as an `<img>` no stylesheet reaches their strokes, and the client-side design system preview has
 * no server-side "worn" signal to switch on, so the mark is inline on every page view. Inline, not a
 * CSS mask: a mask is a second fetch (CORS mode) that a preview proxy or a missing file turns into
 * an empty tile; the inline mark has nothing left to load. Only a small, plain SVG file of this site
 * (uploads or the theme) is inlined; anything else keeps its `<img>`.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_clients_mark_inline( string $content, array $block ): string {
	$class_attr = (string) ( $block['attrs']['className'] ?? '' );
	if ( ! in_array( 'acm-clients-mark', preg_split( '/\s+/', $class_attr ), true ) ) {
		return $content;
	}
	if ( 1 !== preg_match( '/<img\b[^>]*\bsrc="([^"]+\.svg)"[^>]*>/i', $content, $m ) ) {
		return $content;
	}
	$svg = wp_ja_kinetic_local_svg( html_entity_decode( $m[1], ENT_QUOTES, 'UTF-8' ) );
	if ( null === $svg ) {
		return $content;
	}
	return str_replace( $m[0], $svg, $content );
}
add_filter( 'render_block', 'wp_ja_kinetic_clients_mark_inline', 11, 2 );

/**
 * A local SVG picture as inline markup painted in currentColor, or null when the address is not a
 * small, plain SVG file inside the uploads or theme folder.
 *
 * @param string $url The picture's address (absolute or root-relative).
 * @return string|null
 */
function wp_ja_kinetic_local_svg( string $url ): ?string {
	$path    = (string) wp_parse_url( $url, PHP_URL_PATH );
	$uploads = wp_get_upload_dir();
	$roots   = array(
		array( (string) wp_parse_url( $uploads['baseurl'], PHP_URL_PATH ), $uploads['basedir'] ),
		array( (string) wp_parse_url( get_stylesheet_directory_uri(), PHP_URL_PATH ), get_stylesheet_directory() ),
	);
	foreach ( $roots as list( $base_path, $base_dir ) ) {
		if ( '' === $base_path || ! str_starts_with( $path, trailingslashit( $base_path ) ) ) {
			continue;
		}
		$file = realpath( $base_dir . '/' . substr( $path, strlen( trailingslashit( $base_path ) ) ) );
		$root = realpath( $base_dir );
		if ( false === $file || false === $root || ! str_starts_with( $file, $root . DIRECTORY_SEPARATOR ) || filesize( $file ) > 8192 ) {
			return null;
		}
		$svg = (string) file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a local file.
		$svg = (string) preg_replace( '/^\s*(<\?xml[^>]*>\s*)?/', '', $svg );
		if ( 1 !== preg_match( '/^<svg\b[^>]*>.*<\/svg>\s*$/is', $svg ) || 1 === preg_match( '/<(script|style|foreignObject|image|use|a)\b|\son[a-z]+\s*=|href\s*=/i', $svg ) ) {
			return null;
		}
		// Every painted stroke and fill takes the text colour; "none" stays none.
		$svg = (string) preg_replace( '/\b(stroke|fill)="(?!none")[^"]*"/i', '$1="currentColor"', $svg );
		$svg = (string) preg_replace( '/^<svg\b([^>]*?)\s(?:width|height)="[^"]*"/i', '<svg$1', $svg );
		$svg = (string) preg_replace( '/^<svg\b([^>]*?)\s(?:width|height)="[^"]*"/i', '<svg$1', $svg );
		return (string) preg_replace( '/^<svg\b/i', '<svg class="acm-clients-mark-svg" aria-hidden="true" focusable="false"', trim( $svg ) );
	}
	return null;
}

/**
 * The source's section buttons carry decoration inside the anchor: a trailing arrow `<svg>` on the
 * hero/CTA primary and the FAQ support button, a `<span class="hx-prompt">$</span>` before the hero
 * ghost label, and the CTA chip's `$` sigil + label as two spans (the source's rendered hero 177,
 * CTA 184/195/211 and FAQ support 229, read live 2026-09-23; the SVG strings below are copied from it).
 * A `core/button` holds one editable text run, so the label stays the run and the decoration is
 * added here at render time: the editor keeps a plain editable label, a seeder that rewrites the
 * label cannot drop the decoration, and the source's own `.hx-btn svg` / `.hx-prompt` /
 * `.hx-cta-chip-sigil` / `.hx-sup-btn-ico` rules match again. Runs at 10, before
 * inc/tag-parity.php unwraps the button div at 20 (the unwrap keeps the anchor's inner HTML).
 */
const WP_JA_KINETIC_BUTTON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
const WP_JA_KINETIC_BUTTON_SUP_ARROW = '<svg class="hx-sup-btn-ico" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>';
/**
 * Two fixed, non-editable glyphs the source prints as inline SVG: the style-2 client card arrow
 * inside `span.acm-clients-card-arrow` (`acm/clients/tmpl/style-2.php:115`, no aria on the svg —
 * the span carries it) and the FAQ support card's life-buoy, the card's first child
 * (`acm/faq-support/tmpl/style-1.php:26`). The patterns keep an empty arrow paragraph / the bare
 * card group; the SVG is added here, and the CSS-mask glyphs stay for the editor only
 * (`:not(:has(> svg))`).
 */
const WP_JA_KINETIC_CLIENTS_CARD_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
const WP_JA_KINETIC_SUP_LIFE_BUOY    = '<svg class="hx-sup-icon" xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/></svg>';
/** Pattern `metadata.name`s (item index stripped) of the class-less text paragraphs unwrapped below. */
const WP_JA_KINETIC_TEXT_LEAF_UNWRAP = array( 'clients.logo-name', 'clients.ticker-label', 'features-ledger.card_badge', 'accordion.a', 'prose-quote.quote' );

/**
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_section_leaf_parity( string $content, array $block ): string {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return $content;
	}
	// Same text-leaf rule, one leaf beside the buttons: the hero trust line is a bare `<span>` in
	// `.hx-trust` on the source, a `core/paragraph` `<p>` here; the source's `.hx-trust span` rule
	// then applies as-is.
	$leaf_name = (string) ( $block['attrs']['metadata']['name'] ?? '' );
	if ( 'hero.trust' === $leaf_name ) {
		return wp_ja_kinetic_tag_parity_rename_root( $content, 'span' );
	}
	// The class-less text paragraphs inside a styled item group: the source holds the text directly
	// in that element (`span.acm-clients-logo`, `span.acm-tick-live`, `span.hx-metrics-badge`,
	// `div.hx-faq-a`, `blockquote.hx-prose-quote`), so only the paragraph's own `<p>` goes and its text lands in the group.
	// Class-less only: the ledger layout's `features-ledger.card_badge` is `.hx-spec-cardhead-r`, a
	// `<span>` of its own on the source, renamed by inc/tag-parity.php instead.
	if ( 'core/paragraph' === ( $block['blockName'] ?? '' )
		&& '' === trim( (string) ( $block['attrs']['className'] ?? '' ) )
		&& in_array( preg_replace( '/\.\d+$/', '', $leaf_name ), WP_JA_KINETIC_TEXT_LEAF_UNWRAP, true )
		&& 1 === preg_match( '/^\s*<p\b[^>]*>(.*)<\/p>\s*$/s', $content, $leaf )
	) {
		return trim( $leaf[1] );
	}
	// Article body quotes: every source article prints its quote as bare text in a class-less
	// `<blockquote>` (all 50 published `tr_content` quotes, no `<p>`, no `<cite>`), while core/quote
	// keeps that text in an inner paragraph for the editor. A class-less quote holding one
	// class-less paragraph and no citation drops the paragraph's `<p>` at render time.
	if ( 'core/quote' === ( $block['blockName'] ?? '' )
		&& '' === trim( (string) ( $block['attrs']['className'] ?? '' ) )
		&& 1 === count( $block['innerBlocks'] ?? array() )
		&& 'core/paragraph' === ( $block['innerBlocks'][0]['blockName'] ?? '' )
		&& '' === trim( (string) ( $block['innerBlocks'][0]['attrs']['className'] ?? '' ) )
		&& 1 === preg_match( '/^(\s*<blockquote\b[^>]*>)\s*<p\b[^>]*>(.*)<\/p>\s*(<\/blockquote>\s*)$/s', $content, $quote )
	) {
		return $quote[1] . trim( $quote[2] ) . $quote[3];
	}
	$classes = preg_split( '/\s+/', trim( (string) ( $block['attrs']['className'] ?? '' ) ) );
	sort( $classes );
	$sig = implode( '.', $classes );

	// The fixed SVGs above go in as the element's first child, once.
	if ( 'core/paragraph' === ( $block['blockName'] ?? '' ) && 'acm-clients-card-arrow' === $sig ) {
		return (string) preg_replace( '/^(\s*<p\b[^>]*>)\s*(?=<\/p>)/', '$1' . WP_JA_KINETIC_CLIENTS_CARD_ARROW, $content, 1 );
	}
	if ( 'core/group' === ( $block['blockName'] ?? '' ) && 'hx-sup-card' === $sig && ! str_contains( $content, 'hx-sup-icon' ) ) {
		return (string) preg_replace( '/^(\s*<div\b[^>]*>)/', '$1' . WP_JA_KINETIC_SUP_LIFE_BUOY, $content, 1 );
	}

	// A bare `core/buttons` row around one of these buttons: the source has the anchor directly in
	// its column, and the flex wrapper would blockify its `inline-flex` (measured on the KineticQL
	// split and FAQ support cards). Same for the pricing plan CTAs and the "every plan includes"
	// button (source acm/pricing/tmpl/style-1.php prints each `<a>` straight into its card / bar).
	// Its buttons have already been unwrapped to a single `<a>`.
	if ( 'core/buttons' === ( $block['blockName'] ?? '' ) ) {
		if ( '' === $sig && 1 === preg_match( '/^\s*<div\b[^>]*\bclass="wp-block-buttons\b[^"]*"[^>]*>\s*(<a class="(?:acm-split-cta|hx-sup-btn|hx-pi-btn|hx-btn hx-btn--(?:primary|ghost) hx-plan-cta)"[^>]*>.*?<\/a>)\s*<\/div>\s*$/s', $content, $m ) ) {
			return $m[1];
		}
		return $content;
	}
	if ( 'core/button' !== ( $block['blockName'] ?? '' ) ) {
		return $content;
	}
	$wrap = array(
		'hx-btn.hx-btn--primary'        => array( '', WP_JA_KINETIC_BUTTON_ARROW ),
		'hx-btn.hx-btn--ghost'          => array( '<span class="hx-prompt">$</span> ', '' ),
		'hx-cta-btn.hx-cta-btn-primary' => array( '', WP_JA_KINETIC_BUTTON_ARROW ),
		'hx-cta-chip'                   => array( '<span class="hx-cta-chip-sigil">$</span><span class="hx-cta-chip-text">', '</span>' ),
		'hx-sup-btn'                    => array( '', ' ' . WP_JA_KINETIC_BUTTON_SUP_ARROW ),
	);
	if ( ! isset( $wrap[ $sig ] ) ) {
		return $content;
	}
	// A label that already carries markup (the templates' CTA chip authors both spans in the run)
	// is left as authored, so the decoration is never doubled.
	return (string) preg_replace_callback(
		'/(<a\b[^>]*>)(.*?)(<\/a>)/s',
		static fn( array $m ): string => str_contains( $m[2], '<' ) ? $m[0] : $m[1] . $wrap[ $sig ][0] . $m[2] . $wrap[ $sig ][1] . $m[3],
		$content,
		1
	);
}
add_filter( 'render_block', 'wp_ja_kinetic_section_leaf_parity', 10, 2 );

/**
 * The team card's social row is a bare `<div class="hx-team-social">` of icon-only links on the
 * source (`acm/teams/tmpl/style-1.php:27-44`, `:128-131`): each `<a class="hx-team-social-link">`
 * names its network in `aria-label`, opens in a new tab and holds the source's own 15px
 * `currentColor` SVG (strings below copied from that template). The pattern keeps
 * `core/social-links`, so each URL stays an editable block; at render time each link is rebuilt as
 * the source anchor from its own `url`/`service` attributes, and the `<ul>` becomes that `<div>` —
 * without core's `<li>`, screen-reader label span, or the 24px / `align-items:center` core classes.
 */
const WP_JA_KINETIC_TEAM_SOCIAL_ICONS = array(
	'github'   => '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>',
	'x'        => '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M18.9 1.2h3.7l-8 9.1L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.5-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9zm-1.3 19.4h2L6.5 3.3H4.3l13.3 17.3z"/></svg>',
	'linkedin' => '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M20.4 3H3.6C2.7 3 2 3.7 2 4.6v14.8c0 .9.7 1.6 1.6 1.6h16.8c.9 0 1.6-.7 1.6-1.6V4.6c0-.9-.7-1.6-1.6-1.6zM8 18.3H5.3V9.7H8v8.6zM6.6 8.5a1.6 1.6 0 1 1 0-3.1 1.6 1.6 0 0 1 0 3.1zM18.7 18.3H16v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v4.3h-2.7V9.7h2.6v1.2h.1c.4-.7 1.3-1.4 2.6-1.4 2.8 0 3.3 1.8 3.3 4.2v4.6z"/></svg>',
	''         => '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9.2"/><path d="M3 12h18M12 2.8c2.5 2.6 3.9 5.9 3.9 9.2s-1.4 6.6-3.9 9.2c-2.5-2.6-3.9-5.9-3.9-9.2S9.5 5.4 12 2.8z"/></svg>',
);

/**
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_team_social( string $content, array $block ): string {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return $content;
	}
	$classes = preg_split( '/\s+/', trim( (string) ( $block['attrs']['className'] ?? '' ) ) );
	$name    = (string) ( $block['blockName'] ?? '' );
	if ( 'core/social-link' === $name && in_array( 'hx-team-social-link', $classes, true ) ) {
		$url = (string) ( $block['attrs']['url'] ?? '' );
		if ( '' === $url ) {
			return $content; // Core renders nothing for a link without a URL; keep that.
		}
		$net  = strtolower( (string) ( $block['attrs']['service'] ?? '' ) );
		$icon = WP_JA_KINETIC_TEAM_SOCIAL_ICONS[ 'twitter' === $net ? 'x' : $net ] ?? WP_JA_KINETIC_TEAM_SOCIAL_ICONS[''];
		return '<a class="hx-team-social-link" href="' . esc_url( $url ) . '" rel="noopener noreferrer" target="_blank" aria-label="' . esc_attr( '' !== $net ? $net : 'website' ) . '">' . $icon . '</a>';
	}
	if ( 'core/social-links' === $name && in_array( 'hx-team-social', $classes, true )
		&& 1 === preg_match( '/^\s*<ul\b[^>]*>(.*)<\/ul>\s*$/s', $content, $m )
	) {
		return '<div class="hx-team-social">' . $m[1] . '</div>';
	}
	return $content;
}
add_filter( 'render_block', 'wp_ja_kinetic_team_social', 10, 2 );

/**
 * A team card with no photo shows the member's initials in the chip, as the source does
 * (`acm/teams/tmpl/style-1.php`: no avatar → `<span class="hx-team-chip">JK</span>`). A card
 * whose content lost both the image and the chip otherwise showed an empty slot.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_team_chip_fallback( string $content, array $block ): string {
	if ( 'core/group' !== ( $block['blockName'] ?? '' ) || ! str_contains( (string) ( $block['attrs']['className'] ?? '' ), 'hx-team-card' )
		|| str_contains( $content, 'hx-team-avatar' ) || str_contains( $content, 'hx-team-chip' )
		|| 1 !== preg_match( '~<h3\b[^>]*hx-team-name[^>]*>(.*?)</h3>~s', $content, $m )
	) {
		return $content;
	}
	$initials = '';
	foreach ( preg_split( '/\s+/u', trim( wp_strip_all_tags( $m[1] ) ) ) as $word ) {
		$initials .= mb_strtoupper( mb_substr( $word, 0, 1 ) );
	}
	$chip = '<span class="hx-team-chip" aria-hidden="true">' . esc_html( mb_substr( $initials, 0, 2 ) ) . '</span>';
	return (string) preg_replace( '/^(\s*<div\b[^>]*>)/', '$1' . $chip, $content, 1 );
}
add_filter( 'render_block', 'wp_ja_kinetic_team_chip_fallback', 10, 2 );

/**
 * The team grid is a bare `<div class="hx-cols">` carrying its column count as an inline
 * `style="grid-template-columns:repeat(N,1fr)"` on the source (`acm/teams/tmpl/style-1.php:52-55`,
 * `:77`; N outside 2-4 falls back to 3). A pattern carries no inline style, so the seeded value
 * rides on an `hx-cols-<n>` class of the `teams.columns` group; at render time that class becomes
 * the source's inline style, leaving the source's class list. The features-intro grid
 * `<div class="hx-cols hx-fi-grid">` follows the same rule (`acm/features-intro/tmpl/style-1.php:64-67`,
 * `:89`; N outside 2-4 falls back to 3), carried by its `features-intro.columns` group.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_team_columns( string $content, array $block ): string {
	if ( 'core/group' !== ( $block['blockName'] ?? '' ) || ! in_array( $block['attrs']['metadata']['name'] ?? '', array( 'teams.columns', 'features-intro.columns' ), true )
		|| in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true )
	) {
		return $content;
	}
	return (string) preg_replace_callback(
		'/^(\s*<div\b[^>]*?\bclass=")([^"]*)"/',
		static function ( array $m ): string {
			$cols = 1 === preg_match( '/(?:^|\s)hx-cols-(\d+)(?=\s|$)/', $m[2], $n ) ? (int) $n[1] : 3;
			$cols = ( $cols < 2 || $cols > 4 ) ? 3 : $cols;
			return $m[1] . trim( (string) preg_replace( '/\s*(?<!\S)hx-cols-\d+(?!\S)/', '', $m[2] ) ) . '" style="grid-template-columns:repeat(' . $cols . ',1fr)"';
		},
		$content,
		1
	);
}
add_filter( 'render_block', 'wp_ja_kinetic_team_columns', 10, 2 );

/**
 * The source testimonials row (`acm/testimonials/tmpl/style-1.php:92-116`) is the first quote as
 * `figure.hx-card.hx-testi-hero` (author `hx-testi-author--lg`), then every other quote as
 * `figure.hx-card.hx-testi-small` (author `--sm`) inside one `div.hx-testi-stack` (only when there
 * is more than one quote), each author row inside a bare `<figcaption>` (`:99`, `:110`). The pattern
 * keeps every `testimonials.item.<n>` a direct child of the row because the toolkit's `repeatItems`
 * (block-fill.mjs) clones one template across one parent's children — so a filled row carries the
 * hero's classes on every item. The source picks hero vs small by position (item 1 is the
 * pull-quote), so the parsed tree is reshaped here before render: position sets the card and author
 * classes, items 2+ move into a `hx-testi-stack` group, the author group is wrapped in `<figcaption>`.
 * The editor keeps the flat, editable item list; a row of any other shape is left untouched.
 *
 * @param array $parsed_block The parsed block about to render.
 * @return array
 */
function wp_ja_kinetic_testimonials_row( array $parsed_block ): array {
	if ( 'core/group' !== ( $parsed_block['blockName'] ?? '' )
		|| ! in_array( 'hx-testi-row', preg_split( '/\s+/', trim( (string) ( $parsed_block['attrs']['className'] ?? '' ) ) ), true )
		|| in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true )
	) {
		return $parsed_block;
	}
	$items = array();
	foreach ( $parsed_block['innerBlocks'] ?? array() as $inner ) {
		if ( 1 !== preg_match( '/^testimonials\.item\.\d+$/', (string) ( $inner['attrs']['metadata']['name'] ?? '' ) ) ) {
			return $parsed_block;
		}
		$items[] = wp_ja_kinetic_testimonials_item( $inner, array() === $items );
	}
	if ( array() === $items ) {
		return $parsed_block;
	}
	$children = array( $items[0] );
	if ( count( $items ) > 1 ) {
		$small      = array_slice( $items, 1 );
		$open       = "\n<div class=\"wp-block-group hx-testi-stack\">";
		$children[] = array(
			'blockName'    => 'core/group',
			'attrs'        => array( 'className' => 'hx-testi-stack' ),
			'innerBlocks'  => $small,
			'innerHTML'    => $open . "</div>\n",
			'innerContent' => array_merge( array( $open ), array_fill( 0, count( $small ), null ), array( "</div>\n" ) ),
		);
	}
	$row_content                  = $parsed_block['innerContent'];
	$parsed_block['innerBlocks']  = $children;
	$parsed_block['innerContent'] = array_merge( array( $row_content[0] ), array_fill( 0, count( $children ), null ), array( end( $row_content ) ) );
	return $parsed_block;
}
add_filter( 'render_block_data', 'wp_ja_kinetic_testimonials_row' );

/**
 * One testimonials item for {@see wp_ja_kinetic_testimonials_row()}: hero or small classes by
 * position on the card and its author row, and the author group wrapped in `<figcaption>`.
 *
 * @param array $item The parsed `testimonials.item.<n>` group.
 * @param bool  $hero Whether this is the first (pull-quote) item.
 * @return array
 */
function wp_ja_kinetic_testimonials_item( array $item, bool $hero ): array {
	$swap  = $hero
		? array( 'hx-testi-small' => 'hx-testi-hero', 'hx-testi-author--sm' => 'hx-testi-author--lg' )
		: array( 'hx-testi-hero' => 'hx-testi-small', 'hx-testi-author--lg' => 'hx-testi-author--sm' );
	$retag = static function ( array $block ) use ( $swap ): array {
		$block['attrs']['className'] = strtr( (string) ( $block['attrs']['className'] ?? '' ), $swap );
		$block['innerHTML']          = strtr( (string) ( $block['innerHTML'] ?? '' ), $swap );
		if ( is_string( $block['innerContent'][0] ?? null ) ) {
			$block['innerContent'][0] = strtr( $block['innerContent'][0], $swap );
		}
		return $block;
	};
	$item = $retag( $item );
	$slot = 0;
	foreach ( $item['innerContent'] as $pos => $chunk ) {
		if ( null !== $chunk ) {
			continue;
		}
		$child = $item['innerBlocks'][ $slot ] ?? array();
		if ( in_array( 'hx-testi-author', preg_split( '/\s+/', trim( (string) ( $child['attrs']['className'] ?? '' ) ) ), true ) ) {
			$item['innerBlocks'][ $slot ] = $retag( $child );
			array_splice( $item['innerContent'], $pos, 1, array( '<figcaption>', null, '</figcaption>' ) );
			break;
		}
		++$slot;
	}
	return $item;
}

/**
 * The style-2 bento draws two decorations as inline SVG (`acm/bento/tmpl/style-2.php:21-39`,
 * `:98-100`, `:112`): each icon tile's `<span class="acm-bento-ico" aria-hidden="true"><svg>` picked
 * by its `tile-icon` key (unknown key → the square fallback), and the stat tile's line spark
 * `<svg class="acm-bento-spark">`. core/html is not allowed in patterns, so
 * `patterns/section-bento-style-2.php` ships an empty icon paragraph carrying the key as an
 * `is-ico-<key>` class and an empty spark group; both become the source markup here (strings copied
 * from that template). A filler may append its own `hx-ico-<key>` class after the pattern's, so the
 * last key class wins. The style-1 tile draws the same `span.acm-bento-ico > svg` from the same
 * icon set (`acm/bento/tmpl/style-1.php:13-26`, `:75-77`; `patterns/section-bento.php`), so the
 * icon swap runs on every bento tile of either style. Style-1's extra `bar-chart` key is not carried
 * (no source instance uses it; it would draw the square fallback).
 */
const WP_JA_KINETIC_BENTO_ICONS = array(
	'git-merge'  => '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
	'git-branch' => '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
	'bell'       => '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
	'database'   => '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
	'shield'     => '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
	'activity'   => '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
	'zap'        => '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
	'search'     => '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
	'lock'       => '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
	'layers'     => '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
	''           => '<rect x="3" y="3" width="18" height="18" rx="2"/>',
);
const WP_JA_KINETIC_BENTO_SPARK = '<svg class="acm-bento-spark" viewBox="0 0 120 70" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M0 60l20-8 20 4 20-18 20 6 20-22 20 8" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';

/**
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_bento_style2_svg( string $content, array $block ): string {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return $content;
	}
	$classes = preg_split( '/\s+/', trim( (string) ( $block['attrs']['className'] ?? '' ) ) );
	if ( 'core/group' === ( $block['blockName'] ?? '' ) && in_array( 'acm-bento-spark', $classes, true ) ) {
		return WP_JA_KINETIC_BENTO_SPARK;
	}
	if ( ! in_array( 'acm-bento-tile', $classes, true ) ) {
		return $content;
	}
	return (string) preg_replace_callback(
		'/<p\b[^>]*\bclass="(acm-bento-ico\b[^"]*)"[^>]*>\s*<\/p>/',
		static function ( array $m ): string {
			preg_match_all( '/\b(?:is|hx)-ico-([a-z0-9-]+)/', $m[1], $keys );
			$key = (string) ( end( $keys[1] ) ?: '' );
			$svg = WP_JA_KINETIC_BENTO_ICONS[ $key ] ?? WP_JA_KINETIC_BENTO_ICONS[''];
			return '<span class="acm-bento-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' . $svg . '</svg></span>';
		},
		$content,
		1
	);
}
add_filter( 'render_block', 'wp_ja_kinetic_bento_style2_svg', 10, 2 );

/**
 * Three pieces of the incident timeline the source template prints and block markup cannot hold
 * (`acm/incident-timeline/tmpl/style-1.php`):
 * - the step node is `<span class="hx-inc-node">` around an inline SVG picked by the step's icon
 *   key (`:30-55`, `:86`; paths copied from its kinetic_inc_icon(), an unknown key → its
 *   "activity" fallback — cloud/database/filter/gauge/git-merge/shield/trending-up in the measured
 *   content all hit it). The pattern ships an empty node group carrying the key as an
 *   `hx-ico-<key>` class (a filler may append its own, so the last one wins); it becomes the
 *   source markup here. The CSS-mask glyph in wp-ja-kinetic-sections.css stays for the editor,
 *   where render filters do not run.
 * - the badge box is printed only when `step_badge` is non-empty (`:94`), so a badge group with
 *   no text renders nothing.
 * - an empty eyebrow/title falls back to the template's own literals (`:20-21`), so the header
 *   exists on every instance even when a page hides it (changelog, `css/page-220.css:109`); a
 *   seeder drops both empty blocks and prunes the header group, which is put back here.
 * - the row wrapper is `div.hx-incident.cols-<n>` with n clamped to 3-4, anything else → 4
 *   (`:23-26`, `:74`). The seeded value rides on an `hx-cols-<n>` class of the
 *   `incident-timeline.columns` group (as for teams); it becomes the source's clamped `cols-<n>`.
 */
const WP_JA_KINETIC_INCIDENT_ICONS = array(
	'radar'          => '<path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>',
	'bell'           => '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
	'git-branch'     => '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
	'git-commit'     => '<circle cx="12" cy="12" r="3"/><line x1="3" x2="9" y1="12" y2="12"/><line x1="15" x2="21" y1="12" y2="12"/>',
	'check'          => '<path d="M20 6 9 17l-5-5"/>',
	'alert-triangle' => '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
	'zap'            => '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
	'rocket'         => '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
	'calendar'       => '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
	'search'         => '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
	'wrench'         => '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
	'flag'           => '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
	'clock'          => '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
	'sparkles'       => '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
	''               => '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
);

/**
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_incident_timeline( string $content, array $block ): string {
	if ( 'core/group' !== ( $block['blockName'] ?? '' ) || in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return $content;
	}
	$classes = preg_split( '/\s+/', trim( (string) ( $block['attrs']['className'] ?? '' ) ) );
	if ( in_array( 'hx-inc-node', $classes, true ) ) {
		$key = '';
		foreach ( $classes as $class ) {
			if ( 0 === strpos( $class, 'hx-ico-' ) ) {
				$key = substr( $class, 7 );
			}
		}
		$svg = WP_JA_KINETIC_INCIDENT_ICONS[ $key ] ?? WP_JA_KINETIC_INCIDENT_ICONS[''];
		return '<span class="hx-inc-node"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $svg . '</svg></span>';
	}
	if ( in_array( 'hx-inc-badge', $classes, true ) ) {
		return '' === trim( wp_strip_all_tags( $content ) ) ? '' : $content;
	}
	if ( 'incident-timeline.columns' === ( $block['attrs']['metadata']['name'] ?? '' ) ) {
		return (string) preg_replace_callback(
			'/^(\s*<div\b[^>]*?\bclass="[^"]*?)(?<!\S)hx-cols-(\d+)(?!\S)/',
			static function ( array $m ): string {
				$cols = (int) $m[2];
				return $m[1] . 'cols-' . ( ( $cols < 3 || $cols > 4 ) ? 4 : $cols );
			},
			$content,
			1
		);
	}
	if ( in_array( 'acm-incident-inner', $classes, true ) && false === strpos( $content, 'acm-incident-head' ) ) {
		$head = '<div class="wp-block-group acm-incident-head"><div class="hx-eyebrow">// anatomy of an incident</div><h2 class="wp-block-heading hx-h2">From blip to fixed, in one tool</h2></div>';
		return (string) preg_replace( '/^(\s*<div\b[^>]*>)/', '$1' . $head, $content, 1 );
	}
	return $content;
}
add_filter( 'render_block', 'wp_ja_kinetic_incident_timeline', 10, 2 );

/**
 * The features-ledger icon is `<span class="hx-spec-icon">` (ledger rows) or
 * `<span class="hx-stat-icon">` (stats cards) around an inline SVG picked by the row's icon key,
 * printed only when the key is set (`acm/features-ledger/tmpl/style-1.php:9-43`, `:138`, `:168`;
 * paths copied from its kinetic_fl_lucide(), an unknown key → its clock fallback). core/html is not
 * allowed in patterns, so the pattern ships an empty paragraph carrying the key as an `hx-ico-<key>`
 * class (a filler may append its own, so the last one wins); it becomes the source markup here. The
 * CSS-mask glyph on `p.hx-spec-icon` / `p.hx-stat-icon` stays for the editor, where render filters
 * do not run. The features-intro card icon is the same markup from a byte-identical path table
 * (`acm/features-intro/tmpl/style-1.php:20-55`, `:97-99`, kinetic_fi_lucide()): there the pattern
 * ships an empty `hx-feat-icon` group carrying the key, handled here too.
 */
const WP_JA_KINETIC_LEDGER_ICONS = array(
	'activity'       => '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
	'search'         => '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
	'bell'           => '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
	'git-branch'     => '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
	'database'       => '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
	'shield'         => '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
	'shield-check'   => '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
	'zap'            => '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
	'clock'          => '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
	'trending-up'    => '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
	'server'         => '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
	'gauge'          => '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
	'layers'         => '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12.18a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 .59-.92"/><path d="M2 17.18a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 .59-.92"/>',
	'check'          => '<polyline points="20 6 9 17 4 12"/>',
	'check-circle'   => '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
	'alert-triangle' => '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
	'box'            => '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
	'users'          => '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
	'dollar-sign'    => '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
	'lock'           => '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
	'eye'            => '<path d="M2.06 12.34a1 1 0 0 1 0-.68 10.94 10.94 0 0 1 19.88 0 1 1 0 0 1 0 .68 10.94 10.94 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
	'cpu'            => '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
	'globe'          => '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
	''               => '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/>',
);

/**
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_ledger_icon_svg( string $content, array $block ): string {
	if ( ! in_array( $block['blockName'] ?? '', array( 'core/paragraph', 'core/group' ), true ) || in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return $content;
	}
	$classes = preg_split( '/\s+/', trim( (string) ( $block['attrs']['className'] ?? '' ) ) );
	$wrap    = array_values( array_intersect( array( 'hx-spec-icon', 'hx-stat-icon', 'hx-feat-icon' ), $classes ) );
	if ( ! $wrap ) {
		return $content;
	}
	$key = null;
	foreach ( $classes as $class ) {
		if ( 0 === strpos( $class, 'hx-ico-' ) ) {
			$key = substr( $class, 7 );
		}
	}
	if ( null === $key || '' === $key ) {
		return '';
	}
	$svg = WP_JA_KINETIC_LEDGER_ICONS[ $key ] ?? WP_JA_KINETIC_LEDGER_ICONS[''];
	return '<span class="' . $wrap[0] . '"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $svg . '</svg></span>';
}
add_filter( 'render_block', 'wp_ja_kinetic_ledger_icon_svg', 10, 2 );

/**
 * A pricing plan's feature row is a tick and the feature text in a span
 * (`acm/pricing/tmpl/style-1.php:106-114`); the tick is template output, not a field. The seeder
 * fills the list with the text alone, so the row lost its tick and the span that narrows the text
 * beside it (measured 2026-09-25: rows one line tall instead of the source's two, the plans 118px
 * shorter at 1440). Drawn back here for every row that has no tick of its own.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_plan_feature_tick( string $content, array $block ): string {
	if ( 'core/list' !== ( $block['blockName'] ?? '' ) || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'hx-plan-features' ) ) {
		return $content;
	}
	return (string) preg_replace(
		'/<li>(?!\s*<svg)(.*?)<\/li>/s',
		'<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span>$1</span></li>',
		$content
	);
}
add_filter( 'render_block', 'wp_ja_kinetic_plan_feature_tick', 10, 2 );

/**
 * The FAQ question row is `summary.hx-faq-q > span.hx-faq-qtext + svg.hx-faq-ico` on the source
 * (`acm/accordion/tmpl/style-1.php:30`, `:65-68`; the SVG string below is copied from it).
 * `core/details` saves its summary as one class-less rich-text run, so the pattern keeps that
 * editable run and the source row is rebuilt here at render time: the source's own `.hx-faq-q` /
 * `.hx-faq-qtext` / `.hx-faq-ico` rules then apply unchanged, and a seeder that rewrites the
 * question (block-fill.mjs `setSummary` matches a bare `<summary>`) keeps working.
 */
const WP_JA_KINETIC_FAQ_ICO = '<svg class="hx-faq-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_faq_question( string $content, array $block ): string {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) || 'core/details' !== ( $block['blockName'] ?? '' ) ) {
		return $content;
	}
	if ( ! in_array( 'hx-faq-item', preg_split( '/\s+/', trim( (string) ( $block['attrs']['className'] ?? '' ) ) ), true ) ) {
		return $content;
	}
	return (string) preg_replace( '/<summary>(.*?)<\/summary>/s', '<summary class="hx-faq-q"><span class="hx-faq-qtext">$1</span>' . WP_JA_KINETIC_FAQ_ICO . '</summary>', $content, 1 );
}
add_filter( 'render_block', 'wp_ja_kinetic_faq_question', 10, 2 );

/**
 * The published page carrying a given custom page template, if one exists — e.g. the one page
 * using `page-login`. Used to send WordPress's own login/register/lost-password links to this
 * theme's styled pages instead of the bare wp-login.php screen, the way the source's own menu
 * points every "sign in" link at its one login menu item rather than a raw component URL.
 *
 * @param string $template Template slug, matching a `customTemplates` name in theme.overlay.json.
 * @return string The page's permalink, or '' if no published page uses that template.
 */
function wp_ja_kinetic_template_page_url( string $template ): string {
	static $cache = array();
	if ( array_key_exists( $template, $cache ) ) {
		return $cache[ $template ];
	}
	$ids = get_posts(
		array(
			'post_type'      => 'page',
			'post_status'    => 'publish',
			'posts_per_page' => 1,
			'meta_key'       => '_wp_page_template',
			'meta_value'     => $template,
			'fields'         => 'ids',
			'no_found_rows'  => true,
		)
	);
	$cache[ $template ] = $ids ? (string) get_permalink( $ids[0] ) : '';
	return $cache[ $template ];
}

/**
 * Point WordPress's own login/register/lost-password links at this theme's styled pages, when one
 * is published, instead of the bare wp-login.php screen — the source always sends a visitor to its
 * one login/register/reset menu item, never to a raw component URL. The actual form POSTs
 * (`site_url( 'wp-login.php', 'login_post' )` in the block render files) are untouched by this:
 * those call `site_url()` directly, not these filtered helpers, so credentials still go to the
 * real WordPress auth endpoint regardless of where the link that got the visitor here pointed.
 */
function wp_ja_kinetic_auth_page_url( string $url, string $template ): string {
	$page_url = wp_ja_kinetic_template_page_url( $template );
	return '' === $page_url ? $url : $page_url;
}
add_filter( 'login_url', static fn( $url ) => wp_ja_kinetic_auth_page_url( $url, 'page-login' ) );
add_filter( 'register_url', static fn( $url ) => wp_ja_kinetic_auth_page_url( $url, 'page-register' ) );
add_filter( 'lostpassword_url', static fn( $url ) => wp_ja_kinetic_auth_page_url( $url, 'page-password' ) );

/**
 * The account page requires a signed-in visitor, same as the source's own profile view
 * (`components/com_users/src/View/Profile/HtmlView.php` redirects a guest to login before this
 * theme's page-account.html ever renders — measured on the running source 2026-09-22: a
 * logged-out `GET /index.php/pages/profile` answers 303 to the login page). WordPress has no
 * built-in "this page needs a session" flag for a custom page template, so this is that check.
 * The source (`SiteApplication::authorise()`) answers 303 to the plain login URL and queues the
 * danger message "Please login first" as a session message: shown on that redirect's GET only, gone
 * on reload (measured 2026-09-23). Same here: 303 to the plain login page plus the one-shot
 * `login_required` flash (`wp_ja_kinetic_set_flash()` below). No `redirect_to` either: the source
 * keeps its return (the profile URL) in the session, and a sign-in with no return lands on the
 * profile anyway — `wp_ja_kinetic_login_submit()` does that.
 */
function wp_ja_kinetic_auth_guard(): void {
	if ( is_user_logged_in() || ! is_page_template( 'page-account' ) ) {
		return;
	}
	wp_ja_kinetic_flash_redirect( wp_login_url(), array( 'login_required' => true ) );
}
add_action( 'template_redirect', 'wp_ja_kinetic_auth_guard' );

/**
 * Auth state keys that outlive the page view they are shown on, as the source's own session user
 * state does: the registration form's typed values (`com_users.registration.data`, kept until a
 * registration succeeds — measured 2026-09-24: a reload after a failed register still shows them)
 * and the reset user + code between the confirm and complete steps (`com_users.reset.user`/`.token`).
 * Every other flash key is a session message: shown on the next auth page view only.
 */
const WP_JA_KINETIC_FLASH_STICKY = array( 'register_values', 'reset_key', 'reset_login' );

/**
 * The guest's flash id from its cookie, reduced to the alphanumerics `wp_generate_password()` makes.
 */
function wp_ja_kinetic_flash_id(): string {
	return isset( $_COOKIE['wp_ja_kinetic_flash'] ) ? (string) preg_replace( '/[^A-Za-z0-9]/', '', (string) wp_unslash( $_COOKIE['wp_ja_kinetic_flash'] ) ) : '';
}

/**
 * A Joomla session's stand-in for a guest, who has no WordPress session: the source answers every
 * auth form POST with a 303 and keeps what the next page shows in the session (its messages, plus
 * the sticky user state above). Here that state is a transient keyed by a fresh random id per
 * write (so a planted cookie id never carries anyone's reset code), held in an HttpOnly
 * browser-session cookie, and expiring after the source's own session `$lifetime` (15 minutes).
 * The cookie carries only that id; everything shown comes from the server-written state, read
 * back through the allowlisted keys in `kinetic-auth-notice/render.php`.
 *
 * @param array<string,mixed> $state       Auth state for the next auth page view.
 * @param bool                $keep_sticky Carry the current sticky keys over (false clears them).
 */
function wp_ja_kinetic_set_flash( array $state, bool $keep_sticky = true ): void {
	if ( $keep_sticky ) {
		$state += array_intersect_key( wp_ja_kinetic_auth_state(), array_flip( WP_JA_KINETIC_FLASH_STICKY ) );
	}
	$old = wp_ja_kinetic_flash_id();
	if ( '' !== $old ) {
		delete_transient( 'wp_ja_kinetic_flash_' . $old );
	}
	$id = wp_generate_password( 32, false );
	set_transient( 'wp_ja_kinetic_flash_' . $id, $state, 15 * MINUTE_IN_SECONDS );
	setcookie(
		'wp_ja_kinetic_flash',
		$id,
		array(
			'expires'  => 0,
			'path'     => COOKIEPATH,
			'domain'   => COOKIE_DOMAIN,
			'secure'   => is_ssl(),
			'httponly' => true,
			'samesite' => 'Lax',
		)
	);
}

/**
 * The source's POST → 303 → GET answer: store the next view's state, redirect, stop.
 *
 * @param string              $url         Where the source's controller redirects.
 * @param array<string,mixed> $state       See `wp_ja_kinetic_set_flash()`.
 * @param bool                $keep_sticky See `wp_ja_kinetic_set_flash()`.
 */
function wp_ja_kinetic_flash_redirect( string $url, array $state, bool $keep_sticky = true ): void {
	wp_ja_kinetic_set_flash( $state, $keep_sticky );
	wp_safe_redirect( $url, 303 );
	exit;
}

/**
 * Loads the guest's flash into this request's auth state on an auth page (before the handlers
 * below, which read the sticky keys), then drops its one-shot keys: a reload shows no message.
 */
function wp_ja_kinetic_take_flash(): void {
	$id = wp_ja_kinetic_flash_id();
	if ( '' === $id || ! is_page_template( array( 'page-login', 'page-register', 'page-password' ) ) ) {
		return;
	}
	$state = get_transient( 'wp_ja_kinetic_flash_' . $id );
	if ( ! is_array( $state ) ) {
		return;
	}
	wp_ja_kinetic_auth_state( $state );
	$sticky = array_intersect_key( $state, array_flip( WP_JA_KINETIC_FLASH_STICKY ) );
	if ( $sticky === $state ) {
		return;
	}
	if ( $sticky ) {
		set_transient( 'wp_ja_kinetic_flash_' . $id, $sticky, 15 * MINUTE_IN_SECONDS );
	} else {
		delete_transient( 'wp_ja_kinetic_flash_' . $id );
	}
}
add_action( 'template_redirect', 'wp_ja_kinetic_take_flash', 5 );

/**
 * The source's `BaseController::checkToken()` on a bad form token: 303 back to the referring page
 * (or the home page) with the `JINVALID_TOKEN_NOTICE` warning.
 *
 * @param string $action Nonce action the form was built with.
 */
function wp_ja_kinetic_check_form_nonce( string $action ): void {
	$nonce = isset( $_POST['wp_ja_kinetic_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['wp_ja_kinetic_nonce'] ) ) : '';
	if ( wp_verify_nonce( $nonce, $action ) ) {
		return;
	}
	wp_ja_kinetic_flash_redirect( wp_validate_redirect( (string) wp_get_raw_referer(), home_url( '/' ) ), array( 'invalid_token' => true ) );
}

/**
 * Per-request auth state (form errors, prefill values, success flags, the flash loaded above) for
 * the handlers below, read by the matching block's render.php. Every handler answers its POST with
 * a 303 like the source's controllers (`wp_ja_kinetic_flash_redirect()`), so what the next view
 * shows crosses that redirect through the flash, never through the POST response itself.
 *
 * @param array<string,mixed>|null $set Values to merge in, or null to only read.
 * @return array<string,mixed>
 */
function wp_ja_kinetic_auth_state( ?array $set = null ): array {
	static $state = array();
	if ( null !== $set ) {
		$state = array_merge( $state, $set );
	}
	return $state;
}

/**
 * Whether the current request is one of the source's own "plain in-card head" auth states —
 * register success (`registration/complete.php`), or reset confirm/new-password
 * (`reset/confirm.php`, `reset/complete.php` both layouts) — none of which the source ever wraps in
 * an outer `.kinetic-auth-masthead` section (kinetic-auth-register/render.php's own doc comment,
 * kinetic-auth-password/render.php's own doc comment). Mirrors the state each block's own render.php
 * resolves, at the boolean level only, so `wp_ja_kinetic_suppress_plain_masthead()` below — which
 * runs on the masthead's OWN block, earlier in template document order than the auth block that
 * knows this in full — can remove that section's block output outright rather than hide it with
 * CSS: real structural absence, the same as the source's own DOM on these states, not a WordPress
 * wrapper element merely toggled invisible. (The two blocks resolve the FULL state independently —
 * which exact plain card to render — this is only the shared "is it plain at all" boolean.)
 *
 * @return bool
 */
function wp_ja_kinetic_auth_is_plain_view(): bool {
	if ( is_page_template( 'page-register' ) ) {
		return ! empty( wp_ja_kinetic_auth_state()['register_success'] );
	}
	if ( is_page_template( 'page-password' ) && 237 !== wp_ja_kinetic_current_item_id() ) {
		return 'plain' !== wp_ja_kinetic_reset_view();
	}
	return false;
}

/**
 * Which of the source's own reset (Itemid 236) views the current request resolves to — the same
 * branching `kinetic-auth-password/render.php` performs to pick a form, factored out so the outer
 * `<main>` wrapper's own class list (below) can be corrected WITHOUT guessing at it independently;
 * both call sites read the exact same state. As on the source, the URL alone decides: `plain`
 * (`reset/default.php`, the email request form), `confirm` (`?layout=confirm`, `reset/confirm.php`
 * — Username + Verification Code; where a request submit redirects), or `complete`
 * (`?layout=complete`, `reset/complete.php`, the new-password form — rendered for any visitor, as the
 * source does; its submit checks the confirmed reset kept in the flash).
 *
 * @return string plain|confirm|complete.
 */
function wp_ja_kinetic_reset_view(): string {
	$layout = isset( $_GET['layout'] ) ? sanitize_key( wp_unslash( $_GET['layout'] ) ) : '';
	return in_array( $layout, array( 'confirm', 'complete' ), true ) ? $layout : 'plain';
}

/**
 * Removes the `.kinetic-auth-masthead` group block's own output on a plain-view state — genuine
 * structural absence (`render_block` runs before the block's markup is assembled into the page, so
 * an empty string here means the `<section>` never exists in the response at all). Unconditional on
 * every plain-view state, so no CSS backstop is needed alongside it. Scoped to the block's own
 * `className` attribute so it can never touch any other `core/group`.
 *
 * @param string               $content Block HTML.
 * @param array<string, mixed> $block   Parsed block, incl. `attrs.className`.
 * @return string
 */
function wp_ja_kinetic_suppress_plain_masthead( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'kinetic-auth-masthead' ) ) {
		return $content;
	}
	return wp_ja_kinetic_auth_is_plain_view() ? '' : $content;
}
add_filter( 'render_block', 'wp_ja_kinetic_suppress_plain_masthead', 10, 2 );

/**
 * The register page's `.kinetic-auth__split` group (page-register.html: a 2-col grid wrapping the
 * `kinetic-auth-register` block) has no source equivalent on the success state — measured live,
 * `registration/complete.php` sits directly under the outer `.kinetic-auth` div, no split, no grid
 * (kinetic-auth-register/render.php's own doc comment; AU-260, run-3 audit). Unwraps the block's own
 * `<div class="wp-block-group kinetic-auth__split">…</div>` down to its inner content — the same
 * "real structural removal" technique `wp_ja_kinetic_suppress_plain_masthead()` above uses, applied
 * here instead of there because this wrapper still has real content (the plain card) on this state,
 * it is only the WRAPPER that must go missing, not the whole block output.
 *
 * @param string               $content Block HTML.
 * @param array<string, mixed> $block   Parsed block, incl. `attrs.className`.
 * @return string
 */
function wp_ja_kinetic_unwrap_register_success_split( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'kinetic-auth__split' ) ) {
		return $content;
	}
	if ( ! is_page_template( 'page-register' ) || empty( wp_ja_kinetic_auth_state()['register_success'] ) ) {
		return $content;
	}
	// Not anchored to the string start: `render_block` output carries leading newlines ahead of the
	// wrapper's own opening tag (measured live — a literal `^` anchor silently no-opped here).
	$content = (string) preg_replace( '/<div\b[^>]*>/', '', $content, 1 );
	return (string) preg_replace( '/<\/div>\s*$/', '', $content, 1 );
}
add_filter( 'render_block', 'wp_ja_kinetic_unwrap_register_success_split', 10, 2 );

/**
 * The outer `<main class="kinetic-auth …">` wrapper (page-register.html / page-password.html) is
 * static block markup carrying a class list that only ever matches ONE of the source's own several
 * states per page — measured live per state (run-3 audit):
 *  - register: plain `com-users-registration registration`; success swaps to
 *    `com-users-registration-complete registration-complete` (AU-257/258).
 *  - reset/remind share one WordPress template (`page-password.html`) but the source has two
 *    separate Itemids/pages, each with only its OWN half of the static class list, never both
 *    (AU-295): remind is `kinetic-auth kinetic-auth--single hx-grid-bg com-users-remind remind`;
 *    reset's `request` view keeps `kinetic-auth--single` too (`com-users-reset reset`), but
 *    `confirm`/`complete` drop `kinetic-auth--single` and suffix the last two classes
 *    `-confirm`/`-complete` (`reset-confirm`/`reset-complete`).
 * `wp_ja_kinetic_reset_view()` above is the single source of truth for which of those the current
 * request is in; this only ever rewrites the literal static string page-password.html ships, never
 * guesses at a different one.
 *
 * @param string               $content Block HTML.
 * @param array<string, mixed> $block   Parsed block, incl. `attrs.tagName`/`attrs.className`.
 * @return string
 */
function wp_ja_kinetic_auth_main_state_classes( string $content, array $block ): string {
	if ( 'core/group' !== ( $block['blockName'] ?? '' ) || 'main' !== ( $block['attrs']['tagName'] ?? '' ) ) {
		return $content;
	}
	if ( is_page_template( 'page-register' ) && ! empty( wp_ja_kinetic_auth_state()['register_success'] ) ) {
		return str_replace(
			'kinetic-auth hx-grid-bg com-users-registration registration',
			'kinetic-auth hx-grid-bg com-users-registration-complete registration-complete',
			$content
		);
	}
	if ( is_page_template( 'page-password' ) ) {
		if ( 237 === wp_ja_kinetic_current_item_id() ) {
			return str_replace(
				'kinetic-auth kinetic-auth--single hx-grid-bg com-users-reset com-users-remind reset remind',
				'kinetic-auth kinetic-auth--single hx-grid-bg com-users-remind remind',
				$content
			);
		}
		$view = wp_ja_kinetic_reset_view();
		if ( 'plain' === $view ) {
			return str_replace(
				'kinetic-auth kinetic-auth--single hx-grid-bg com-users-reset com-users-remind reset remind',
				'kinetic-auth kinetic-auth--single hx-grid-bg com-users-reset reset',
				$content
			);
		}
		return str_replace(
			'kinetic-auth kinetic-auth--single hx-grid-bg com-users-reset com-users-remind reset remind',
			"kinetic-auth hx-grid-bg com-users-reset reset-{$view}",
			$content
		);
	}
	return $content;
}
add_filter( 'render_block', 'wp_ja_kinetic_auth_main_state_classes', 10, 2 );

/**
 * Search results: articles only, 20 per page — the source's Smart Search index never carries
 * static Pages (only `com_content` articles), and Joomla's own global `list_limit` default is 20,
 * the same value `wp_ja_kinetic_force_posts_per_page()` (inc/blog-dynamic.php) already uses for tag
 * archives — measured live, AU-024/025 (run-3 audit): source "74 results" articles-only, 20/page,
 * "Results 1 - 20 of 74"; WordPress's own default search covers every public post type at the
 * site's Reading-settings `posts_per_page` (was 10/page and included Pages).
 *
 * @param WP_Query $query The query WordPress is about to run.
 */
function wp_ja_kinetic_search_query( WP_Query $query ): void {
	if ( is_admin() || ! $query->is_main_query() || ! $query->is_search() ) {
		return;
	}
	$query->set( 'post_type', 'post' );
	$query->set( 'posts_per_page', 20 );
}
add_action( 'pre_get_posts', 'wp_ja_kinetic_search_query' );

/**
 * Search with an empty query: the source renders no results area at all — its
 * `#search-results.com-finder__results` is absent from the DOM, not merely empty (measured live on
 * the running source, `/pages/search` with no `q`). kinetic-search-results already renders nothing
 * for an empty term; this drops search.html's own wrapper group around it in that same state, so no
 * empty padded box is left under the form.
 *
 * @param string               $content Block HTML.
 * @param array<string, mixed> $block   Parsed block, incl. `attrs.className`.
 * @return string
 */
function wp_ja_kinetic_drop_empty_search_results( string $content, array $block ): string {
	if ( 'core/group' !== ( $block['blockName'] ?? '' ) || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'com-finder__results' ) ) {
		return $content;
	}
	return '' === trim( (string) get_search_query() ) ? '' : $content;
}
add_filter( 'render_block', 'wp_ja_kinetic_drop_empty_search_results', 10, 2 );

/**
 * `page-password.html` carries BOTH the reset and the remind masthead sub as static paragraphs —
 * one `kinetic-auth-password` block resolves the two source Itemids (that block's own doc comment)
 * — so, unlike every other class name this theme ports, these two also carry a `--reset`/`--remind`
 * modifier the source never has (it is a single page per Itemid there). Previously only CSS hid the
 * wrong one (still true — see wp-ja-kinetic-finder-auth.css — belt and braces); this filter is what
 * makes the DOM itself source-identical: the wrong variant's block output is dropped outright (real
 * structural absence, same technique as `wp_ja_kinetic_suppress_plain_masthead()` above), and the
 * right one has its modifier class stripped back to the source's own plain
 * `kinetic-auth-masthead__sub`, byte for byte.
 *
 * @param string               $content Block HTML.
 * @param array<string, mixed> $block   Parsed block, incl. `attrs.className`.
 * @return string
 */
function wp_ja_kinetic_normalize_password_masthead_sub( string $content, array $block ): string {
	$class_name = (string) ( $block['attrs']['className'] ?? '' );
	if ( false === strpos( $class_name, 'kinetic-auth-masthead__sub--' ) ) {
		return $content;
	}
	if ( ! is_page_template( 'page-password' ) ) {
		return $content;
	}
	$is_remind_variant = false !== strpos( $class_name, '--remind' );
	$is_remind_page     = 237 === wp_ja_kinetic_current_item_id();
	if ( $is_remind_variant !== $is_remind_page ) {
		return '';
	}
	return str_replace(
		array( ' kinetic-auth-masthead__sub--reset', ' kinetic-auth-masthead__sub--remind' ),
		'',
		$content
	);
}
add_filter( 'render_block', 'wp_ja_kinetic_normalize_password_masthead_sub', 10, 2 );

/**
 * The source's own `#system-message-container` notice — element tree measured directly on the
 * running source (wrong-credentials login, 2026-09-22): `<joomla-alert type="warning"
 * close-text="Close" dismiss="true">` (no class, the custom element itself carries none) containing,
 * in order, `button.joomla-alert--close` (`aria-label="Close"`, a bare
 * `<span aria-hidden="true">&times;</span>`), `div.alert-heading` (`span.{$type}` — an empty
 * icon glyph, then `span.visually-hidden` carrying the type label text, e.g. "Warning" — present in
 * the DOM and in `innerText`, only clipped visually, not `display:none`), then
 * `div.alert-wrapper > div.alert-message` with the message text. Reproduced verbatim rather than
 * the inert `.alert.alert-warning` div Joomla ships only for `<noscript>` — see the CSS file's own
 * header comment (`wp-ja-kinetic-finder-auth.css`) for the computed-style measurements this pairs
 * with. `$type` is one of the source's own four: warning, danger, success, info.
 *
 * The label is the source's `Joomla.Text._(type)`: `layouts/joomla/system/message.php` scripts only
 * ERROR, MESSAGE, NOTICE, WARNING and SUCCESS, so "warning"/"success" translate ("Warning",
 * "Success") while "danger"/"info" fall back to the bare key, lowercase. The icon span carries no
 * `aria-hidden` on the source.
 *
 * @param string $type    warning|danger|success|info.
 * @param string $message Already plain text — escaped here, not by the caller.
 * @return string
 */
function wp_ja_kinetic_notice( string $type, string $message ): string {
	$label = in_array( $type, array( 'warning', 'success' ), true ) ? ucfirst( $type ) : $type;
	return '<div id="system-message-container" aria-live="polite">'
		. '<joomla-alert type="' . esc_attr( $type ) . '" close-text="Close" dismiss="true" role="alert">'
		. '<button type="button" class="joomla-alert--close" aria-label="Close"><span aria-hidden="true">&times;</span></button>'
		. '<div class="alert-heading"><span class="' . esc_attr( $type ) . '"></span><span class="visually-hidden">' . esc_html( $label ) . '</span></div>'
		. '<div class="alert-wrapper"><div class="alert-message">' . esc_html( $message ) . '</div></div>'
		. '</joomla-alert>'
		. '</div>';
}

/**
 * A free WordPress username from an email/name pair. The source's own registration form hides
 * Username and mirrors it from Email client-side (`registration/default.php`'s inline `<script>`,
 * kept for this port in `blocks/kinetic-auth-register/render.php`); this is that same idea run
 * server-side for the handler below, which needs a real, unique `user_login` to call
 * `wp_insert_user()` with.
 *
 * @param string $email Registrant's email.
 * @param string $name  Registrant's full name (fallback source if the email's local part sanitizes empty).
 * @return string
 */
function wp_ja_kinetic_unique_username( string $email, string $name ): string {
	$local = explode( '@', $email )[0] ?? '';
	$base  = sanitize_user( $local, true );
	if ( '' === $base ) {
		$base = sanitize_user( $name, true );
	}
	if ( '' === $base ) {
		$base = 'member';
	}
	$username = $base;
	$suffix   = 1;
	while ( username_exists( $username ) ) {
		++$suffix;
		$username = $base . $suffix;
	}
	return $username;
}

/**
 * Login, handled on the Kinetic login page itself instead of wp-login.php, so a failed attempt
 * keeps the visitor on this theme's chrome with the source's own error text — verbatim strings
 * read from the running source (`joomla.ini`: `JGLOBAL_AUTH_EMPTY_PASS_NOT_ALLOWED`,
 * `JGLOBAL_AUTH_INVALID_PASS`/`_NO_USER`, both "Username and password do not match or you do not
 * have an account yet." — the same generic message for a wrong password and an unknown username,
 * which is why one generic message below covers everything `wp_signon()` itself can fail on).
 * `site_url( 'wp-login.php', 'login_post' )` is still the form action WordPress's own native
 * screen shows on *its* failure path if this handler is ever bypassed (JS off submits normally to
 * wp-login.php through `wp_signon()`'s own fallback there — see kinetic-auth-login/render.php);
 * this handler is what makes the normal path land back on the Kinetic page. Every outcome answers
 * 303 like the source's `UserController::login()` (measured 2026-09-23: a failed sign-in is
 * `POST 303 …/pages/login?task=user.login` → `GET 200 …/pages/login`, the warning shown once).
 */
function wp_ja_kinetic_login_submit(): void {
	if ( ! is_page_template( 'page-login' ) || empty( $_POST['wp_ja_kinetic_login'] ) ) {
		return;
	}
	wp_ja_kinetic_check_form_nonce( 'wp_ja_kinetic_login' );

	$username = isset( $_POST['log'] ) ? sanitize_user( wp_unslash( $_POST['log'] ) ) : '';
	$password = isset( $_POST['pwd'] ) ? (string) wp_unslash( $_POST['pwd'] ) : '';

	// No failure path below hands the typed username back to the form: the source's own
	// `UserController::login()` clears it on every failed attempt ("Clear user name, password and
	// secret key before sending the login form back to the user." — `$data['username'] = ''`).
	$error = '';
	if ( '' === $username ) {
		$error = 'Empty username not allowed.';
	} elseif ( '' === $password ) {
		$error = 'Empty password not allowed.';
	} else {
		$result = wp_signon(
			array(
				'user_login'    => $username,
				'user_password' => $password,
				'remember'      => false,
			),
			is_ssl()
		);
		if ( is_wp_error( $result ) ) {
			$error = 'Username and password do not match or you do not have an account yet.';
		}
	}
	if ( '' !== $error ) {
		wp_ja_kinetic_flash_redirect( (string) get_permalink(), array( 'login_error' => $error ) );
	}

	// No return posted (the form carries none) → the profile page, as the source's
	// `UserController::login()`: "Set the return URL if empty." → `index.php?option=com_users&view=profile`.
	$profile     = wp_ja_kinetic_template_page_url( 'page-account' );
	$fallback    = '' === $profile ? home_url( '/' ) : $profile;
	$redirect_to = isset( $_POST['redirect_to'] ) ? esc_url_raw( wp_unslash( $_POST['redirect_to'] ) ) : $fallback;
	wp_safe_redirect( '' === $redirect_to ? $fallback : $redirect_to, 303 );
	exit;
}
add_action( 'template_redirect', 'wp_ja_kinetic_login_submit' );

/**
 * Registration, handled on the Kinetic register page. WordPress core's own
 * `register_new_user( $user_login, $user_email )` (wp-login.php) takes only those two values and
 * never a password (it emails one) — the source's full field set (Full Name, Company, Email,
 * Password) needs `wp_insert_user()` run directly to honour the password the visitor typed and
 * keep Company, so this handler does that itself rather than calling core's registration
 * function. Error/success copy: `COM_USERS_REGISTRATION_SAVE_FAILED` ("Registration failed: %s")
 * and `COM_USERS_REGISTRATION_SAVE_SUCCESS` ("Thank you for registering. You may now log in using
 * the username and password you registered with."), both read from the source's own
 * `language/en-GB/com_users.ini`.
 */
function wp_ja_kinetic_register_submit(): void {
	if ( ! is_page_template( 'page-register' ) || empty( $_POST['wp_ja_kinetic_register'] ) ) {
		return;
	}
	wp_ja_kinetic_check_form_nonce( 'wp_ja_kinetic_register' );

	$name    = isset( $_POST['kinetic_name'] ) ? sanitize_text_field( wp_unslash( $_POST['kinetic_name'] ) ) : '';
	$company = isset( $_POST['kinetic_company'] ) ? sanitize_text_field( wp_unslash( $_POST['kinetic_company'] ) ) : '';
	$email   = isset( $_POST['user_email'] ) ? sanitize_email( wp_unslash( $_POST['user_email'] ) ) : '';
	$password = isset( $_POST['user_pass'] ) ? (string) wp_unslash( $_POST['user_pass'] ) : '';
	$values  = array(
		'name'    => $name,
		'company' => $company,
		'email'   => $email,
	);

	$error = '';
	if ( ! get_option( 'users_can_register' ) ) {
		$error = 'Registration failed: user registration is currently closed.';
	} elseif ( '' === $name ) {
		$error = 'Registration failed: please enter your name.';
	} elseif ( ! is_email( $email ) ) {
		$error = 'Registration failed: please enter a valid email address.';
	} elseif ( email_exists( $email ) ) {
		// Source text verbatim: `lib_joomla.ini` JLIB_DATABASE_ERROR_EMAIL_INUSE, no "Registration failed:" prefix.
		$error = 'The email address you entered is already in use. Please enter another email address.';
	} elseif ( strlen( $password ) < 6 ) {
		$error = 'Registration failed: please enter a password of at least 6 characters.';
	} else {
		// `wp_insert_user()` fires core's own `user_register` action itself (wp-includes/user.php).
		$user_id = wp_insert_user(
			array(
				'user_login'   => wp_ja_kinetic_unique_username( $email, $name ),
				'user_email'   => $email,
				'user_pass'    => $password,
				'display_name' => $name,
				'nickname'     => $name,
				'first_name'   => $name,
				'role'         => get_option( 'default_role', 'subscriber' ),
			)
		);
		if ( is_wp_error( $user_id ) ) {
			$error = 'Registration failed: ' . $user_id->get_error_message();
		} elseif ( '' !== $company ) {
			update_user_meta( $user_id, 'kinetic_company', $company );
		}
	}
	// The source's own `RegistrationController::register()` answers both ways with a 303 (measured
	// 2026-09-23/24): an error back to `…/pages/register`, the danger alert shown once and the typed
	// values kept in the session until a registration succeeds (a reload still shows them — the sticky
	// `register_values`); success to `…/pages/register?layout=complete`, its alert a session message
	// taken by `wp_ja_kinetic_register_complete_view()` below, the kept values dropped.
	if ( '' !== $error ) {
		wp_ja_kinetic_flash_redirect(
			(string) get_permalink(),
			array(
				'register_error'  => $error,
				'register_values' => $values,
			)
		);
	}
	wp_ja_kinetic_flash_redirect( add_query_arg( 'layout', 'complete', get_permalink() ), array( 'register_success_notice' => true ), false );
}
add_action( 'template_redirect', 'wp_ja_kinetic_register_submit' );

/**
 * The register page's own `?layout=complete` view (source `registration/complete.php`): a plain
 * GET renders the bare complete card; the success notice comes only from the one-shot flash set by
 * `wp_ja_kinetic_register_submit()` above (`register_success_notice`, loaded by
 * `wp_ja_kinetic_take_flash()`), so a reload shows the bare card, as the source does once its
 * session message is consumed.
 */
function wp_ja_kinetic_register_complete_view(): void {
	if ( ! is_page_template( 'page-register' ) || ! isset( $_GET['layout'] ) || 'complete' !== $_GET['layout'] || ! empty( $_POST['wp_ja_kinetic_register'] ) ) {
		return;
	}
	wp_ja_kinetic_auth_state( array( 'register_success' => true ) );
}
add_action( 'template_redirect', 'wp_ja_kinetic_register_complete_view' );

/**
 * "Forgot your username?" (source Itemid 237, `com_users` view `remind`) — WordPress core has one
 * lost-password flow and no "email me my username" feature, so this handler builds that feature:
 * find the account by email, mail the username, always answer with the source's own
 * non-enumerating copy (`COM_USERS_REMIND_REQUEST`, verbatim from the source's
 * `language/en-GB/com_users.ini`) whether or not an account exists for that address. Scoped by
 * `wp_ja_kinetic_current_item_id()` (inc/item-ids.php) rather than the page's own slug, so it
 * fires on exactly the page the source's own page-map.json names for Itemid 237 regardless of
 * what the seeder eventually titles or slugs it.
 */
function wp_ja_kinetic_remind_submit(): void {
	if ( 237 !== wp_ja_kinetic_current_item_id() || empty( $_POST['wp_ja_kinetic_remind'] ) ) {
		return;
	}
	wp_ja_kinetic_check_form_nonce( 'wp_ja_kinetic_remind' );

	$email = isset( $_POST['user_login'] ) ? sanitize_email( wp_unslash( $_POST['user_login'] ) ) : '';
	$user  = is_email( $email ) ? get_user_by( 'email', $email ) : false;
	if ( $user instanceof WP_User ) {
		// Subject/body are the source's own copy, verbatim from the running source's
		// `language/en-GB/com_users.ini` (not redefined by the template overlay — checked
		// `templates/ja_kinetic/language/en-GB/en-GB.tpl_ja_kinetic.ini`, absent there too):
		// COM_USERS_EMAIL_USERNAME_REMINDER_SUBJECT = "Your {SITENAME} username",
		// COM_USERS_EMAIL_USERNAME_REMINDER_BODY = "Hello,\n\nA username reminder has been
		// requested for your {SITENAME} account.\n\nYour username: {USERNAME}\n\nTo login to your
		// account, select the link below.\n\n{LINK_TEXT} \n\nThank you."
		$login_link = wp_ja_kinetic_item_page_url( 233 );
		$login_link = '' === $login_link ? wp_login_url() : $login_link;
		wp_mail(
			$user->user_email,
			sprintf( 'Your %s username', get_bloginfo( 'name' ) ),
			str_replace(
				array( '{SITENAME}', '{USERNAME}', '{LINK_TEXT}' ),
				array( get_bloginfo( 'name' ), $user->user_login, $login_link ),
				"Hello,\n\nA username reminder has been requested for your {SITENAME} account.\n\nYour username: {USERNAME}\n\nTo login to your account, select the link below.\n\n{LINK_TEXT} \n\nThank you."
			)
		);
	}

	// The source's own `RemindController::remind()` redirects to the LOGIN view
	// (`setRedirect(Route::_('index.php?option=com_users&view=login', …), $message, 'notice')`) —
	// not back to the remind page — for every address, a malformed one included: its error branch
	// needs JDEBUG, off on the source (`configuration.php` `$debug = false`; measured 2026-09-24,
	// `fd6@localhost` → `POST 303` → `GET 200 …/pages/login` with this same notice).
	wp_ja_kinetic_flash_redirect( wp_login_url(), array( 'remind_success' => true ) );
}
add_action( 'template_redirect', 'wp_ja_kinetic_remind_submit' );

/**
 * The published page for a given source Itemid, via the page-map.json path
 * `WP_JA_KINETIC_PAGE_ITEM_IDS` already carries the other way round (inc/item-ids.php) —
 * `array_search()` on that same map, then `get_page_by_path()`, which resolves a hierarchical
 * page path independently of the site's permalink structure. Used below to point the reset
 * email's link at Itemid 236 specifically (the reset menu item), not just "any page wearing the
 * page-password template" (which `wp_ja_kinetic_template_page_url()` cannot tell apart from
 * Itemid 237's remind page — both use that one template).
 *
 * @param int $item_id Source Itemid, e.g. 236.
 * @return string Permalink, or '' if no published page maps to it.
 */
function wp_ja_kinetic_item_page_url( int $item_id ): string {
	$path = array_search( $item_id, WP_JA_KINETIC_PAGE_ITEM_IDS, true );
	if ( false === $path ) {
		return '';
	}
	$post = get_page_by_path( $path );
	return $post instanceof WP_Post ? (string) get_permalink( $post ) : '';
}

/**
 * Reset request → confirm → new password → done, all on the Kinetic reset page (Itemid 236), the
 * way the source's own `reset/default.php` → `reset/confirm.php` → `reset/complete.php` never
 * leaves `.kinetic-auth` either. wp-login.php never appears to the visitor at any step:
 *  - **request**: this page's own form posts to itself; `wp_ja_kinetic_reset_request_submit()`
 *    below calls WordPress core's own `retrieve_password()` directly (the same function
 *    wp-login.php itself calls) instead of posting to `wp-login.php?action=lostpassword`.
 *  - **the emailed link**: `wp_ja_kinetic_reset_link_message()` rewrites the email WordPress
 *    core builds (`retrieve_password_message` — core's own filter for exactly this) to point at
 *    this page with `?key=…&login=…`, not at `wp-login.php?action=rp`. Subject and body are the
 *    source's own copy, verbatim from the running source's `language/en-GB/com_users.ini`:
 *    `COM_USERS_EMAIL_PASSWORD_RESET_SUBJECT` = "Your {SITENAME} password reset request",
 *    `COM_USERS_EMAIL_PASSWORD_RESET_BODY` = "Hello,\n\nA request has been made to reset your
 *    {SITENAME} account password. To reset your password, you will need to submit this
 *    verification code to verify that the request was legitimate.\n\nThe verification code is
 *    {TOKEN}\n\nSelect the URL below and proceed with resetting your password.\n\n{LINK_TEXT}
 *    \n\nThank you." — the template overlay does not redefine either string (checked
 *    `templates/ja_kinetic/language/en-GB/en-GB.tpl_ja_kinetic.ini`, both absent, so these are
 *    Joomla core's own, unmodified). `{SITENAME}` → `get_bloginfo('name')`, `{TOKEN}` → the reset
 *    key itself (WordPress's own key IS the verification code Joomla's `{TOKEN}` names — there is
 *    no separate manual-entry code in this port, see kinetic-auth-password/render.php's own doc
 *    comment for why), `{LINK_TEXT}` → the rewritten Kinetic-page link.
 *  - **confirm**: two paths reach the new-password step with the user + code kept in the flash
 *    (the source's `com_users.reset.user`/`.token` session state): clicking the emailed link
 *    (`wp_ja_kinetic_reset_link_landing()` below, the key moved off the URL the way core's own
 *    wp-login.php `rp` cookie does), or the source's own manual step — `reset/confirm.php`'s Username
 *    + Verification Code form (`components/com_users/forms/reset_confirm.xml`), handled by
 *    `wp_ja_kinetic_reset_confirm_submit()` below, which checks the code with core's own
 *    `check_password_reset_key()` first.
 *  - **new password**: that form posts to this page too;
 *    `wp_ja_kinetic_reset_new_password_submit()` validates the kept key and calls core's own
 *    `reset_password()`, then redirects to the login page with the source's own
 *    `COM_USERS_RESET_COMPLETE_SUCCESS` text.
 * Every step answers its POST with a 303 like the source's `ResetController` (measured 2026-09-24).
 */
function wp_ja_kinetic_reset_link_title( string $title ): string {
	return sprintf( 'Your %s password reset request', get_bloginfo( 'name' ) );
}
add_filter( 'retrieve_password_title', 'wp_ja_kinetic_reset_link_title' );

function wp_ja_kinetic_reset_link_message( string $message, string $key, string $user_login, $user_data ): string {
	$reset_url = wp_ja_kinetic_item_page_url( 236 );
	if ( '' === $reset_url ) {
		return $message;
	}
	$link = add_query_arg(
		array(
			'key'   => $key,
			'login' => rawurlencode( $user_login ),
		),
		$reset_url
	);
	return str_replace(
		array( '{SITENAME}', '{TOKEN}', '{LINK_TEXT}' ),
		array( get_bloginfo( 'name' ), $key, $link ),
		"Hello,\n\nA request has been made to reset your {SITENAME} account password. To reset your password, you will need to submit this verification code to verify that the request was legitimate.\n\nThe verification code is {TOKEN}\n\nSelect the URL below and proceed with resetting your password.\n\n{LINK_TEXT} \n\nThank you."
	);
}
add_filter( 'retrieve_password_message', 'wp_ja_kinetic_reset_link_message', 10, 4 );

function wp_ja_kinetic_reset_request_submit(): void {
	if ( 236 !== wp_ja_kinetic_current_item_id() || empty( $_POST['wp_ja_kinetic_reset'] ) ) {
		return;
	}
	wp_ja_kinetic_check_form_nonce( 'wp_ja_kinetic_reset' );
	$email = isset( $_POST['user_login'] ) ? sanitize_email( wp_unslash( $_POST['user_login'] ) ) : '';
	if ( is_email( $email ) ) {
		retrieve_password( $email );
	}
	// Non-enumerating on purpose, whether or not that email has an account or is even well formed —
	// the source's own `ResetController::request()` answers every address with a 303 to
	// `?layout=confirm` and COM_USERS_RESET_REQUEST (its error branches need JDEBUG, off on the source;
	// measured 2026-09-24 with `fd6@localhost`).
	wp_ja_kinetic_flash_redirect(
		add_query_arg( 'layout', 'confirm', get_permalink() ),
		array( 'reset_success' => 'If the email address you entered is registered on this site you will shortly receive an email with a link to reset the password for your account.' )
	);
}
add_action( 'template_redirect', 'wp_ja_kinetic_reset_request_submit' );

/**
 * The emailed link (`?key=…&login=…`, `wp_ja_kinetic_reset_link_message()` above): keep the pair in
 * the flash and 303 to `?layout=complete`, so the new-password form sits at the source's own URL and
 * the key leaves the address bar — core's wp-login.php does the same with its `rp` cookie.
 */
function wp_ja_kinetic_reset_link_landing(): void {
	if ( 236 !== wp_ja_kinetic_current_item_id() || 'GET' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || empty( $_GET['key'] ) || empty( $_GET['login'] ) ) {
		return;
	}
	wp_ja_kinetic_flash_redirect(
		add_query_arg( 'layout', 'complete', get_permalink() ),
		array(
			'reset_key'   => sanitize_text_field( wp_unslash( $_GET['key'] ) ),
			'reset_login' => sanitize_text_field( wp_unslash( $_GET['login'] ) ),
		)
	);
}
add_action( 'template_redirect', 'wp_ja_kinetic_reset_link_landing' );

/**
 * The source's own `reset/confirm.php` step: Username + Verification Code, typed by hand from the
 * emailed message rather than by clicking its link (`components/com_users/forms/reset_confirm.xml`
 * — field labels `COM_USERS_FIELD_RESET_CONFIRM_USERNAME_LABEL`/`_TOKEN_LABEL`, both verbatim from
 * the running source's own `language/en-GB/com_users.ini`). WordPress's reset key IS the
 * "verification code" the source's copy names, so typing it here reaches exactly the same
 * new-password step as clicking the emailed link. As the source's `ResetController::confirm()`: a
 * failure 303s back to `?layout=confirm` with `COM_USERS_RESET_CONFIRM_FAILED` + the model's
 * `COM_USERS_USER_NOT_FOUND` (measured 2026-09-24: "… was invalid. User not found."), a success 303s
 * to `?layout=complete` with the user + code kept, no message.
 */
function wp_ja_kinetic_reset_confirm_submit(): void {
	if ( 236 !== wp_ja_kinetic_current_item_id() || empty( $_POST['wp_ja_kinetic_reset_confirm'] ) ) {
		return;
	}
	wp_ja_kinetic_check_form_nonce( 'wp_ja_kinetic_reset_confirm' );

	$username = isset( $_POST['reset_confirm_username'] ) ? sanitize_user( wp_unslash( $_POST['reset_confirm_username'] ) ) : '';
	$token    = isset( $_POST['reset_confirm_token'] ) ? sanitize_text_field( wp_unslash( $_POST['reset_confirm_token'] ) ) : '';

	if ( is_wp_error( check_password_reset_key( $token, $username ) ) ) {
		wp_ja_kinetic_flash_redirect(
			add_query_arg( 'layout', 'confirm', get_permalink() ),
			array( 'reset_confirm_error' => 'Your password reset confirmation failed because the verification code was invalid. User not found.' )
		);
	}
	wp_ja_kinetic_flash_redirect(
		add_query_arg( 'layout', 'complete', get_permalink() ),
		array(
			'reset_key'   => $token,
			'reset_login' => $username,
		)
	);
}
add_action( 'template_redirect', 'wp_ja_kinetic_reset_confirm_submit' );

/**
 * The new-password step, in the source's `ResetModel::processResetComplete()` order (measured
 * 2026-09-24, every failure a 303 back to `?layout=complete`): the fields first (mismatch →
 * "Completing reset password failed: …" info), then the confirmed user + code kept by the confirm
 * step or the emailed link (none → the danger `COM_USERS_RESET_COMPLETE_TOKENS_MISSING`, what a plain
 * visit to `?layout=complete` gets on submit), then the code itself (`COM_USERS_USER_NOT_FOUND`). A
 * success 303s to the LOGIN view with `COM_USERS_RESET_COMPLETE_SUCCESS` (default type: success) and
 * drops the kept reset, as the source flushes `com_users.reset.*`.
 */
function wp_ja_kinetic_reset_new_password_submit(): void {
	if ( 236 !== wp_ja_kinetic_current_item_id() || empty( $_POST['wp_ja_kinetic_reset_complete'] ) ) {
		return;
	}
	wp_ja_kinetic_check_form_nonce( 'wp_ja_kinetic_reset_complete' );

	$state = wp_ja_kinetic_auth_state();
	$key   = (string) ( $state['reset_key'] ?? '' );
	$login = (string) ( $state['reset_login'] ?? '' );
	$pass1 = isset( $_POST['pass1'] ) ? (string) wp_unslash( $_POST['pass1'] ) : '';
	$pass2 = isset( $_POST['pass2'] ) ? (string) wp_unslash( $_POST['pass2'] ) : '';
	$back  = add_query_arg( 'layout', 'complete', get_permalink() );

	if ( '' === $pass1 || $pass1 !== $pass2 ) {
		wp_ja_kinetic_flash_redirect( $back, array( 'reset_complete_error' => 'Completing reset password failed: The passwords you entered do not match. Please enter your desired password in the password field and confirm your entry by entering it in the confirm password field.' ) );
	}
	if ( strlen( $pass1 ) < 6 ) {
		wp_ja_kinetic_flash_redirect( $back, array( 'reset_complete_error' => 'Please enter a password of at least 6 characters.' ) );
	}
	if ( '' === $key || '' === $login ) {
		wp_ja_kinetic_flash_redirect( $back, array( 'reset_complete_missing' => true ) );
	}
	$user = check_password_reset_key( $key, $login );
	if ( is_wp_error( $user ) ) {
		wp_ja_kinetic_flash_redirect( $back, array( 'reset_complete_error' => 'Completing reset password failed: User not found.' ) );
	}

	reset_password( $user, $pass1 );
	wp_ja_kinetic_flash_redirect( wp_login_url(), array( 'reset_complete_success' => true ), false );
}
add_action( 'template_redirect', 'wp_ja_kinetic_reset_new_password_submit' );

/**
 * The contact page's email form (`blocks/kinetic-contact-form/render.php`), handled here instead
 * of the raw `wp_mail()` call the block itself could make, for the same reason every other form on
 * this theme keeps its handler in this file: a failed submission has to keep the visitor on this
 * page's own chrome with the state the block reads back (`wp_ja_kinetic_auth_state()`), the same
 * `template_redirect`-before-render timing the login/register/reset handlers above already use —
 * see `wp_ja_kinetic_auth_state()`'s own doc comment for why a static beats a transient here.
 *
 * The source's own `ContactController::submit()` (`com_contact`) validates required fields, then
 * calls Joomla's mailer with a fixed subject line when the Subject field carries the source's own
 * design-dropped default (`kinetic-contact-form/render.php`'s own doc comment) and shows one
 * generic success notice on send, or a field-level error otherwise. `wp_mail()` is this theme's own
 * mailer; failure handling matches what a WordPress site actually reports (`wp_mail()` returns
 * `false` on failure, no exception), not a guess at Joomla's internal error text since this is a
 * different mail transport entirely.
 *
 * The message goes to `wp_ja_kinetic_contact_recipient()` (inc/contact.php): the recipient the site
 * was given, else its public contact address, else the administrator's `admin_email` (product
 * decision: a visitor's message never fails only because no recipient was configured). The visitor
 * is told the message was not sent only when wp_mail() fails or no valid address exists at all.
 */
function wp_ja_kinetic_contact_submit(): void {
	if ( ! is_page_template( 'page-contact' ) || empty( $_POST['wp_ja_kinetic_contact'] ) ) {
		return;
	}
	if ( ! isset( $_POST['wp_ja_kinetic_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wp_ja_kinetic_nonce'] ) ), 'wp_ja_kinetic_contact' ) ) {
		wp_ja_kinetic_auth_state( array( 'contact_error' => 'Security check failed. Please try again.' ) );
		return;
	}

	$name    = isset( $_POST['wp_ja_kinetic_contact_name'] ) ? sanitize_text_field( wp_unslash( $_POST['wp_ja_kinetic_contact_name'] ) ) : '';
	$email   = isset( $_POST['wp_ja_kinetic_contact_email'] ) ? sanitize_email( wp_unslash( $_POST['wp_ja_kinetic_contact_email'] ) ) : '';
	$message = isset( $_POST['wp_ja_kinetic_contact_message'] ) ? sanitize_textarea_field( wp_unslash( $_POST['wp_ja_kinetic_contact_message'] ) ) : '';

	$state = array(
		'contact_name'    => $name,
		'contact_email'   => $email,
		'contact_message' => $message,
	);

	/*
	 * Text matches the source's own server-side validation messages, measured live 2026-09-23
	 * (all fields empty, client validation bypassed): one `joomla-alert[type="danger"]` holding
	 * one `.alert-message` per missing field — "Field required: Name", "… Email", "… Message",
	 * "… Privacy Note". Joomla's `Form::validate()` lists every missing required field by label,
	 * and the privacy-consent field is `required` on the source regardless of this port's own
	 * consent flow being unwired (see the block's own doc comment), so it is always in that list
	 * whenever anything else is missing too. Stored as a list; the block prints one line each.
	 */
	$missing = array();
	if ( '' === $name ) {
		$missing[] = 'Name';
	}
	if ( '' === $email ) {
		$missing[] = 'Email';
	}
	if ( '' === $message ) {
		$missing[] = 'Message';
	}
	if ( ! empty( $missing ) ) {
		$missing[]               = 'Privacy Note';
		$state['contact_error'] = array_map(
			static function ( string $field ): string {
				return 'Field required: ' . $field;
			},
			$missing
		);
		wp_ja_kinetic_auth_state( $state );
		return;
	}
	if ( ! is_email( $email ) ) {
		$state['contact_error'] = 'Please enter a valid email address.';
		wp_ja_kinetic_auth_state( $state );
		return;
	}

	$to      = wp_ja_kinetic_contact_recipient();
	$subject = sprintf( '[%s] Website enquiry from %s', wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ), $name );
	$body    = $message . "\n\n---\nFrom: {$name} <{$email}>";
	$headers = array( "Reply-To: {$name} <{$email}>" );

	if ( '' === $to || ! wp_mail( $to, $subject, $body, $headers ) ) {
		$state['contact_error'] = 'An error occurred while sending the email.';
		wp_ja_kinetic_auth_state( $state );
		return;
	}

	wp_ja_kinetic_auth_state(
		array(
			'contact_success' => true,
			'contact_name'    => '',
			'contact_email'   => '',
			'contact_message' => '',
		)
	);
}
add_action( 'template_redirect', 'wp_ja_kinetic_contact_submit' );

/**
 * `?layout=edit`'s own "Save changes" — the source's front-end profile edit form
 * (`profile/edit.php`), core identity fields only (kinetic-auth-account/render.php's own doc
 * comment on its edit branch: Name, Password, Email; Username is read-only there, same as the
 * source's own form). On success, redirects back to the plain profile view (no `layout` arg) —
 * the source's own `ProfileController::save()` returns to the profile view too.
 */
function wp_ja_kinetic_profile_edit_submit(): void {
	if ( ! is_page_template( 'page-account' ) || empty( $_POST['wp_ja_kinetic_profile_edit'] ) ) {
		return;
	}
	if ( ! is_user_logged_in() ) {
		return;
	}
	if ( ! isset( $_POST['wp_ja_kinetic_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wp_ja_kinetic_nonce'] ) ), 'wp_ja_kinetic_profile_edit' ) ) {
		wp_ja_kinetic_auth_state( array( 'profile_edit_error' => 'Security check failed. Please try again.' ) );
		return;
	}

	$name     = isset( $_POST['wp_ja_kinetic_display_name'] ) ? sanitize_text_field( wp_unslash( $_POST['wp_ja_kinetic_display_name'] ) ) : '';
	$email    = isset( $_POST['wp_ja_kinetic_email'] ) ? sanitize_email( wp_unslash( $_POST['wp_ja_kinetic_email'] ) ) : '';
	$password = isset( $_POST['wp_ja_kinetic_password1'] ) ? (string) wp_unslash( $_POST['wp_ja_kinetic_password1'] ) : '';
	$confirm  = isset( $_POST['wp_ja_kinetic_password2'] ) ? (string) wp_unslash( $_POST['wp_ja_kinetic_password2'] ) : '';

	if ( '' === $name || ! is_email( $email ) ) {
		wp_ja_kinetic_auth_state( array( 'profile_edit_error' => 'Please enter a name and a valid email address.' ) );
		return;
	}
	if ( '' !== $password && ( $password !== $confirm || strlen( $password ) < 6 ) ) {
		wp_ja_kinetic_auth_state( array( 'profile_edit_error' => 'Please enter matching passwords of at least 6 characters, or leave both blank to keep your current password.' ) );
		return;
	}

	$update = array(
		'ID'           => get_current_user_id(),
		'display_name' => $name,
		'user_email'   => $email,
	);
	if ( '' !== $password ) {
		$update['user_pass'] = $password;
	}
	$result = wp_update_user( $update );
	if ( is_wp_error( $result ) ) {
		wp_ja_kinetic_auth_state( array( 'profile_edit_error' => $result->get_error_message() ) );
		return;
	}
	wp_safe_redirect( get_permalink() );
	exit;
}
add_action( 'template_redirect', 'wp_ja_kinetic_profile_edit_submit' );

/**
 * A signed-in member sees the same front end as a visitor on the source: Joomla shows no toolbar
 * on its site pages for a Registered account, so WordPress's toolbar stays off for accounts that
 * cannot edit content (a member's profile, profile edit, login states — AU-018). Accounts that can
 * edit keep it.
 */
add_filter(
	'show_admin_bar',
	static function ( bool $show ): bool {
		return $show && current_user_can( 'edit_posts' );
	}
);

/**
 * The account page's masthead (page-account.html) is a static eyebrow/title/sub for the plain
 * profile view only — `?layout=edit` needs its own, measured live on the source's own edit view
 * (AU-018, run-3 audit): eyebrow stays "ACCOUNT", title "Edit profile", sub "Update your details,
 * password and notification preferences."
 *
 * @param string               $content Block HTML.
 * @param array<string, mixed> $block   Parsed block, incl. `attrs.className`.
 * @return string
 */
function wp_ja_kinetic_profile_edit_masthead( string $content, array $block ): string {
	if ( ! is_page_template( 'page-account' ) || ! isset( $_GET['layout'] ) || 'edit' !== $_GET['layout'] ) {
		return $content;
	}
	$class_name = (string) ( $block['attrs']['className'] ?? '' );
	if ( false !== strpos( $class_name, 'kinetic-auth-masthead__title' ) ) {
		return str_replace( 'Your profile', 'Edit profile', $content );
	}
	if ( false !== strpos( $class_name, 'kinetic-auth-masthead__sub' ) ) {
		return str_replace(
			'Manage your Kinetic account, active sessions and preferences.',
			'Update your details, password and notification settings.',
			$content
		);
	}
	// The page wrapper: the source's edit view is `.kinetic-auth.hx-grid-bg.com-users-profile__edit.profile-edit`
	// (profile/edit.php), not the profile view's `.com-users-profile.profile` — its own page-235.css
	// card width / padding rules key on those two classes.
	if ( false !== strpos( $class_name, 'kinetic-auth hx-grid-bg com-users-profile profile' ) ) {
		return preg_replace( '/\bcom-users-profile profile\b/', 'com-users-profile__edit profile-edit', $content, 1 );
	}
	return $content;
}
add_filter( 'render_block', 'wp_ja_kinetic_profile_edit_masthead', 10, 2 );

/**
 * Redirects the seeder recorded in the `wp_ja_kinetic_redirects` option (seed.mjs `redirectsOption`)
 * — the source routes this port answers elsewhere, e.g. `/home-menu/home` → `/`. Exact path match
 * only, query string carried over, and never for a request WordPress already resolved: a stale rule
 * must not shadow a page the owner later creates at that path. The rules live in the database, not
 * in the theme, so the site owner can edit them with a single option and the theme ships no
 * site-specific paths. Same contract as tracy-base's `tracy_base_redirects()`, hooked at priority 1: a
 * source address under `/index.php/…` must be matched before redirect_canonical (priority 10) strips
 * `/index.php` and lands the visitor on a 404 the rule no longer names.
 */
function wp_ja_kinetic_redirects(): void {
	if ( is_admin() || ! is_404() ) {
		return;
	}
	$rules = get_option( 'wp_ja_kinetic_redirects' );
	if ( is_string( $rules ) ) {
		$rules = json_decode( $rules, true );
	}
	if ( ! is_array( $rules ) || ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return;
	}
	$uri   = wp_unslash( $_SERVER['REQUEST_URI'] );
	$path  = untrailingslashit( (string) wp_parse_url( $uri, PHP_URL_PATH ) );
	$query = (string) wp_parse_url( $uri, PHP_URL_QUERY );
	foreach ( $rules as $rule ) {
		$from = isset( $rule['from'] ) ? untrailingslashit( (string) $rule['from'] ) : '';
		if ( '' === $from || $from !== $path || empty( $rule['to'] ) ) {
			continue;
		}
		$to = home_url( trailingslashit( (string) $rule['to'] ) );
		if ( '' !== $query ) {
			$to .= '?' . $query;
		}
		wp_safe_redirect( $to, (int) ( $rule['status'] ?? 301 ) );
		exit;
	}
}
add_action( 'template_redirect', 'wp_ja_kinetic_redirects', 1 );

/**
 * The seeded pages carry a no-break space on each side of the middle dot in some lines (Pricing's "Every plan includes" text), so
 * the line cannot break at the dots and wraps one line longer on a phone than the source's, whose spaces are plain. Page content
 * is stored in the site's database; this filter fixes what is printed, so a site that already has the content gets it with the
 * theme update.
 *
 * @param string $content Page content after blocks are rendered.
 * @return string
 */
function wp_ja_kinetic_dot_spaces( string $content ): string {
	return str_replace( "\u{00A0}·\u{00A0}", ' · ', $content );
}
add_filter( 'the_content', 'wp_ja_kinetic_dot_spaces', 99 );

/**
 * Three demo pictures are drawn in the template's lime: the hero terminal, the KineticQL code
 * panel and the bento telemetry chart (raster pictures, owner-swappable image blocks). A worn
 * design system cannot recolour a raster, so each one gets a drawn twin: the same picture as an
 * inline SVG whose lime marks read `--ds-c-accent-on-ink` (the accent readable on a dark band) and
 * whose status colours (INFO/WARN/ERROR, the timings) stay the picture's own. The twin is printed
 * hidden after the `<img>` on every page view, so the client-side preview gets it too; the slot
 * contract's sideRules lay the twin over the picture (the same box; the picture and its alt text stay
 * under it) while a system is worn. Without a system the page renders the picture alone, as before. Only the template's own picture (matched by file
 * name) gets a twin: a picture the owner put in its place is left alone.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_picture_twin( string $content, array $block ): string {
	if ( 'core/image' !== ( $block['blockName'] ?? '' ) ) {
		return $content;
	}
	if ( 1 !== preg_match( '/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/i', $content, $m ) ) {
		return $content;
	}
	$path = (string) wp_parse_url( html_entity_decode( $m[1], ENT_QUOTES, 'UTF-8' ), PHP_URL_PATH );
	$name = (string) pathinfo( $path, PATHINFO_FILENAME );
	$twins = array( 'hero-terminal-panel-terminal', 'kineticql-code-panel-terminal', 'bento-telemetry-chart' );
	if ( 'webp' !== strtolower( (string) pathinfo( $path, PATHINFO_EXTENSION ) ) || ! in_array( $name, $twins, true ) ) {
		return $content;
	}
	$file = get_theme_file_path( 'assets/twins/' . $name . '.svg' );
	if ( ! is_readable( $file ) ) {
		return $content;
	}
	$svg = trim( (string) file_get_contents( $file ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a theme file.
	$svg = (string) preg_replace( '/^<svg\b/i', '<svg class="hx-twin" aria-hidden="true" focusable="false"', $svg );
	return substr_replace( $content, $m[0] . $svg, strpos( $content, $m[0] ), strlen( $m[0] ) );
}
add_filter( 'render_block', 'wp_ja_kinetic_picture_twin', 12, 2 );
