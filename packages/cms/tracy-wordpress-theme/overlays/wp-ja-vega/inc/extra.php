<?php
/**
 * wp-ja-vega — what this target adds on top of the source theme: the JA Vega stylesheet and its
 * web font, the dark mode switch, the mega menu block, the header drawer and video dialog, the
 * motion the source runs (scroll-in reveals, three carousels, a pulsing play button), the queries
 * the section patterns name by category slug, the search page at the source's address, the
 * seeded redirects and the 404 page's own words. Loaded by the generic hook at the end of
 * functions.php (the source theme has no inc/extra.php, so it is inert there).
 *
 * Functions here carry the `wp_ja_vega_` prefix; the shared `tracy_*` helpers of functions.php
 * (tracy_page_kind() and friends) are already defined when this file runs.
 *
 * @package wp-ja-vega
 */

defined( 'ABSPATH' ) || exit;

// The identity tokens the pages and parts carry, and their filling.
require_once __DIR__ . '/identity.php';

/**
 * The motion the source runs, as the motion library's settings: the default of the `tracy_motion`
 * option, so a site that never saved the option wears the design's motion, and a site owner who
 * saves `{"effects":[]}` turns it all off. Measured on the source (26/09, templates/ja_vega):
 * AOS runs every `data-aos` element once with `duration: 1500` and is switched off below 992 px
 * (js/aos/script.js) — the `bold` intensity of `reveal` is that reading, `minWidth` that switch;
 * the three Owl carousels step only when asked (`autoplay: false`); the video button's two rings
 * pulse forever (css/template.css `pulse-border`).
 */
function wp_ja_vega_default_motion(): string {
	return (string) wp_json_encode(
		array(
			'effects' => array(
				array(
					'id'        => 'reveal',
					'v'         => 2,
					'intensity' => 'bold',
					'minWidth'  => 992,
				),
				array(
					'id' => 'carousel-step',
					'v'  => 2,
				),
				array(
					'id' => 'pulse',
					'v'  => 2,
				),
			),
		)
	);
}
add_filter( 'default_option_tracy_motion', 'wp_ja_vega_default_motion' );

/**
 * Text keeps the punctuation it was typed with. The source prints its quotes and apostrophes as stored
 * ("Sed viverra…" in the article blockquote, "don't" on /typography); WordPress's wptexturize turns them
 * into curly quotes on output, so the same words read differently. Off for the whole site, content and
 * titles alike; the stored text is unchanged.
 */
add_filter( 'run_wptexturize', '__return_false' );

/**
 * The assets. The design pages (fixture, artifact) render a design system's own markup under its
 * own stylesheet and dequeue the theme's; nothing here belongs on them either.
 */
function wp_ja_vega_enqueue_assets(): void {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return;
	}
	$version = wp_get_theme()->get( 'Version' );
	wp_enqueue_style( 'wp-ja-vega', get_theme_file_uri( 'assets/css/wp-ja-vega.css' ), array( 'tracy', 'tracy-layout', 'tracy-sections' ), $version );
	// In the head, blocking, on purpose: it resolves the theme before the first paint, so a
	// visitor who chose dark never sees a light frame. It is a few hundred bytes.
	wp_enqueue_script( 'wp-ja-vega-dark', get_theme_file_uri( 'assets/js/wp-ja-vega-dark.js' ), array(), $version, array( 'in_footer' => false ) );
	wp_enqueue_script( 'wp-ja-vega', get_theme_file_uri( 'assets/js/wp-ja-vega.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	wp_localize_script(
		'wp-ja-vega',
		'wpJaVega',
		array(
			'openMenu'  => __( 'Open the menu', 'wp-ja-vega' ),
			'closeMenu' => __( 'Close the menu', 'wp-ja-vega' ),
			'backMenu'  => __( 'Back to the main menu:', 'wp-ja-vega' ),
			'close'     => __( 'Close', 'wp-ja-vega' ),
			'video'     => __( 'Video', 'wp-ja-vega' ),
		)
	);
	// The carousel's own buttons speak the site's language: the library reads `labels` beside its
	// effects. Added after functions.php set `window.TracyMotion`, before the library runs.
	wp_add_inline_script(
		'tracy-motion',
		'window.TracyMotion&&(window.TracyMotion.labels=' . wp_json_encode(
			array(
				'previous' => __( 'Previous slide', 'wp-ja-vega' ),
				'next'     => __( 'Next slide', 'wp-ja-vega' ),
				'slide'    => __( 'Go to slide', 'wp-ja-vega' ),
			)
		) . ');',
		'before'
	);
}
add_action( 'wp_enqueue_scripts', 'wp_ja_vega_enqueue_assets', 11 );

/**
 * The word the theme's style sheet prints before an author's name, as a CSS variable in the site's language.
 *
 * 🔒 A STYLE SHEET CARRIES NO VISITOR WORD (LANG-2, measured 10/10/2026 on dev g59-ess-wp-full, JA Essence WordPress 1.0.12,
 * Vietnamese): post cards read "By <author>" because the style sheet printed the word in `content:`, which no translation
 * reaches. The rules print `var(--wp-ja-vega-by)`; the word is WordPress's own "By %s" (the core translation every site
 * language ships), so a site in any language reads it in that language.
 */
function wp_ja_vega_css_words(): void {
	$by = preg_replace( '/[<>"\\\\\r\n]+/', ' ', str_replace( '%s', '', _x( 'By %s', 'theme author', 'default' ) ) );
	$by = trim( $by );
	wp_add_inline_style( 'wp-ja-vega', ':root{--wp-ja-vega-by:"' . $by . ' ";}' );
}
add_action( 'wp_enqueue_scripts', 'wp_ja_vega_css_words', 12 );

/**
 * `?theme=dark|light` decides by its FIRST value (assets/js/wp-ja-vega-dark.js). WordPress's canonical
 * redirect rebuilds the query from a parsed copy in which a repeated key keeps its LAST value, so
 * `?theme=dark&theme=light` would be sent to `?theme=light` before any script runs. Cancelled only when normalising the repeated key changes the
 * first value; any other redirect (host, scheme, port, path, fragment, other parameters) is left alone.
 *
 * @param string|false $redirect_url  The address WordPress wants to send the visitor to.
 * @param string       $requested_url The address that was asked for.
 * @return string|false
 */
function wp_ja_vega_keep_first_theme_value( $redirect_url, $requested_url ) {
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
add_filter( 'redirect_canonical', 'wp_ja_vega_keep_first_theme_value', 20, 2 );

/** The web font, preloaded: every heading and paragraph is set in it. */
function wp_ja_vega_preload_font(): void {
	printf(
		'<link rel="preload" href="%s" as="font" type="font/woff2" crossorigin>' . "\n",
		esc_url( get_theme_file_uri( 'assets/fonts/inter-tight-latin.woff2' ) )
	);
}
add_action( 'wp_head', 'wp_ja_vega_preload_font', 2 );

/** The mega menu block and the pattern category the overlay's patterns file under. */
function wp_ja_vega_register(): void {
	// Guarded: register_block_type() given a path that does not exist treats it as a block NAME
	// and logs a notice on every request (gotcha #6).
	if ( is_readable( get_theme_file_path( 'blocks/mega-menu/block.json' ) ) ) {
		register_block_type( get_theme_file_path( 'blocks/mega-menu' ) );
	}
	register_block_pattern_category( 'wp-ja-vega', array( 'label' => __( 'WP Vega', 'wp-ja-vega' ) ) );
	// The masthead prints a page's excerpt under its heading (the source's masthead description),
	// and core's excerpt block reads nothing for a post type without excerpt support.
	add_post_type_support( 'page', 'excerpt' );
	// G9: a portfolio article's Client, Date and Type (the source's article extra fields, printed
	// under the card text). Post meta shown in REST, so the card's bound paragraphs edit them in the
	// editor (Block Bindings, core/post-meta); the values are plain text.
	foreach ( array( 'jv_client', 'jv_date', 'jv_type' ) as $key ) {
		register_post_meta(
			'post',
			$key,
			array(
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => true,
				'default'           => '',
				'sanitize_callback' => 'sanitize_text_field',
				'auth_callback'     => static fn(): bool => current_user_can( 'edit_posts' ),
			)
		);
	}
}
add_action( 'init', 'wp_ja_vega_register' );

/** The stylesheet in the editor too, so sections and the mega panel look the same there. */
function wp_ja_vega_editor_styles(): void {
	add_editor_style( 'assets/css/wp-ja-vega.css' );
}
add_action( 'after_setup_theme', 'wp_ja_vega_editor_styles', 11 );

/**
 * The header is one bar, as the source's is. The theme.config.json of this target already names
 * nav `top-left` and hero `split`; the classes are restated after the source theme's filter so a
 * catalogue archetype can never float the header or recolour the hero copy (gotcha #7, #12).
 *
 * A page also carries `jv-route-<slug>` (and `jv-parent-<slug>` under a parent): the source draws
 * its component listings differently (the tag view is a list of titles, a category blog opens with
 * one wide item), and the seeded pages at those addresses hold the same query block, so the
 * stylesheet tells them apart by address.
 *
 * @param string[] $classes The body classes, with the source theme's already added.
 * @return string[]
 */
function wp_ja_vega_body_class( array $classes ): array {
	$navs      = array_map( static fn( string $nav ): string => 'tracy-nav-' . $nav, TRACY_NAVS );
	$heros     = array_map( static fn( string $hero ): string => 'tracy-hero-' . $hero, TRACY_HEROS );
	$classes   = array_values( array_diff( $classes, $navs, $heros ) );
	$classes[] = 'tracy-nav-top-left';
	$classes[] = 'tracy-hero-split';
	if ( is_singular( 'post' ) && 'post-project' === get_page_template_slug( (int) get_queried_object_id() ) ) {
		$classes[] = 'jv-project-page';
	}
	if ( is_page() ) {
		$page      = get_queried_object_id();
		$classes[] = 'jv-route-' . sanitize_html_class( (string) get_post_field( 'post_name', $page ) );
		$parent    = (int) wp_get_post_parent_id( $page );
		if ( $parent ) {
			$classes[] = 'jv-parent-' . sanitize_html_class( (string) get_post_field( 'post_name', $parent ) );
		}
	}
	return $classes;
}
add_filter( 'body_class', 'wp_ja_vega_body_class', 11 );

/**
 * The queries the patterns and templates name, resolved at render time. A pattern cannot know a
 * category's id (the seeder creates it), so the section patterns name the category by slug in
 * their query (`wpJaVegaCategory`, with its sub-categories, as the source's module does with
 * "show child category articles"); the service template asks for the current page's siblings
 * (`wpJaVegaSiblings`: the source's "Other Services"), the article template for posts of the
 * current post's categories (`wpJaVegaRelated`: "Continue Reading"). A tax query the owner sets
 * in the editor wins over the slug.
 *
 * @param array    $query The WP_Query arguments the block built.
 * @param WP_Block $block The post template block.
 * @return array
 */
function wp_ja_vega_query_vars( array $query, WP_Block $block ): array {
	$ctx = $block->context['query'] ?? array();
	if ( ! empty( $ctx['wpJaVegaCategory'] ) && empty( $ctx['taxQuery'] ) ) {
		$term = get_term_by( 'slug', sanitize_title( (string) $ctx['wpJaVegaCategory'] ), 'category' );
		$query['tax_query'] = array(
			array(
				'taxonomy'         => 'category',
				'field'            => 'term_id',
				'terms'            => $term ? array( (int) $term->term_id ) : array( 0 ),
				'include_children' => true,
			),
		);
	}
	if ( ! empty( $ctx['wpJaVegaSiblings'] ) ) {
		$current = get_queried_object_id();
		$parent  = $current ? (int) wp_get_post_parent_id( $current ) : 0;
		$query['post_parent']  = $parent ? $parent : -1;
		$query['post__not_in'] = array( $current );
	}
	if ( ! empty( $ctx['wpJaVegaRelated'] ) ) {
		$current = get_queried_object_id();
		$cats    = $current ? wp_get_post_categories( $current ) : array();
		$query['category__in'] = $cats ? $cats : array( 0 );
		$query['post__not_in'] = array( $current );
	}
	return $query;
}
add_filter( 'query_loop_block_query_vars', 'wp_ja_vega_query_vars', 10, 2 );

/**
 * The "More Articles …" list of a category blog (`/category-blog`, `/portfolio/<category>`): a
 * query of linked titles placed between the cards and their pager, whose `query` attribute carries
 * `tracyMore: { after: <the cards query's queryId>, skip: <cards a page> }` (the key the upstream
 * seeder writes for the same list). Joomla pages a category blog by its cards alone and lists
 * under page N the posts that open page N+1; core offsets a query by a fixed number only, so the
 * offset follows the cards query's own page (`?query-<after>-page=N`). A query without the key is
 * left alone.
 *
 * @param mixed $query The block's `query` attribute or context.
 * @return array|null `array( after, skip )`, or null when the query does not ask for it.
 */
function wp_ja_vega_more_articles_of( $query ): ?array {
	if ( ! is_array( $query ) || ! isset( $query['tracyMore'] ) || ! is_array( $query['tracyMore'] ) ) {
		return null;
	}
	$after = $query['tracyMore']['after'] ?? null;
	$skip  = $query['tracyMore']['skip'] ?? null;
	if ( ! is_int( $after ) || $after < 0 || ! is_int( $skip ) || $skip < 1 ) {
		return null;
	}
	return array(
		'after' => $after,
		'skip'  => $skip,
	);
}

/**
 * @param array    $query The WP_Query arguments the block built.
 * @param WP_Block $block The post template block.
 * @return array
 */
function wp_ja_vega_more_articles_vars( array $query, WP_Block $block ): array {
	$more = wp_ja_vega_more_articles_of( $block->context['query'] ?? null );
	if ( ! $more ) {
		return $query;
	}
	$key = 'query-' . $more['after'] . '-page';
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a page number, read as core's Query Loop reads it.
	$page                   = isset( $_GET[ $key ] ) ? max( 1, (int) $_GET[ $key ] ) : 1;
	$query['offset']        = $page * $more['skip'];
	$query['no_found_rows'] = true;
	return $query;
}
add_filter( 'query_loop_block_query_vars', 'wp_ja_vega_more_articles_vars', 20, 2 );

/**
 * A "More Articles" list with no post (the last page) prints nothing, its heading included, as
 * Joomla prints no `items-more` there; core/post-template prints nothing for an empty query.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_vega_more_articles_render( string $content, array $block ): string {
	if ( 'core/query' !== ( $block['blockName'] ?? '' ) ) {
		return $content;
	}
	if ( wp_ja_vega_more_articles_of( $block['attrs']['query'] ?? null ) ) {
		return false === strpos( $content, 'wp-block-post-template' ) ? '' : $content;
	}
	// /featured-articles: the list is its own query (offset past the cards) and carries the pager, so an
	// empty list (the last page) keeps the pager and drops only the heading.
	$class = (string) ( $block['attrs']['className'] ?? '' );
	if ( preg_match( '/(^|\s)jv-more(\s|$)/', $class ) && false === strpos( $content, 'wp-block-post-template' ) ) {
		return (string) preg_replace( '#<h[1-6]\b[^>]*\bjv-more__heading\b[^>]*>.*?</h[1-6]>\s*#s', '', $content );
	}
	return $content;
}
add_filter( 'render_block', 'wp_ja_vega_more_articles_render', 10, 2 );

/**
 * The search page at the source's address. The source's search (com_finder) lives at
 * /smart-search, and its footer and menus link there; the seeder keeps that route's page as a
 * draft (patterns.map.json `views.search.servedAtPath`) and this answers the path with the
 * theme's search view: `s` (WordPress's form) or `q` (the source's) is the term, and an empty
 * term shows the form and no results, as com_finder does.
 */
const WP_JA_VEGA_SEARCH_PATHS = array( 'smart-search' );

/**
 * @param array $vars The parsed query variables.
 * @return array
 */
function wp_ja_vega_search_request( array $vars ): array {
	if ( is_admin() || empty( $vars['pagename'] ) || ! in_array( (string) $vars['pagename'], WP_JA_VEGA_SEARCH_PATHS, true ) ) {
		return $vars;
	}
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- a read-only search term.
	$term = isset( $_GET['s'] ) ? wp_unslash( $_GET['s'] ) : ( isset( $_GET['q'] ) ? wp_unslash( $_GET['q'] ) : '' );
	// phpcs:enable
	$term = sanitize_text_field( (string) $term );
	$out  = array(
		's'                 => $term,
		'wp_ja_vega_search' => 1,
	);
	if ( '' === $term ) {
		$out['post__in'] = array( 0 );
	}
	return $out;
}
add_filter( 'request', 'wp_ja_vega_search_request' );

/**
 * @param string[] $vars The public query variables.
 * @return string[]
 */
function wp_ja_vega_query_var( array $vars ): array {
	$vars[] = 'wp_ja_vega_search';
	return $vars;
}
add_filter( 'query_vars', 'wp_ja_vega_query_var' );

/** The request above is a search, even with an empty term (WordPress calls that the home page). */
function wp_ja_vega_search_flags( WP_Query $query ): void {
	if ( $query->is_main_query() && $query->get( 'wp_ja_vega_search' ) ) {
		$query->is_search = true;
		$query->is_home   = false;
		$query->is_404    = false;
	}
}
add_action( 'parse_query', 'wp_ja_vega_search_flags' );

/**
 * No canonical redirect for the search path: WordPress would send it to `/?s=`.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_vega_search_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_vega_search' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_vega_search_no_canonical' );

/**
 * A menu link to the search page points at its address: the page is a draft (the path answers
 * through the search view above), and core drops a navigation link to an unpublished page.
 *
 * @param string   $content The rendered link ('' when core dropped it).
 * @param array    $parsed  The parsed block.
 * @param WP_Block $block   The block instance.
 * @return string
 */
function wp_ja_vega_search_link( string $content, array $parsed, $block = null ): string {
	$attrs = $parsed['attrs'] ?? array();
	if ( '' !== $content || 'post-type' !== ( $attrs['kind'] ?? '' ) || empty( $attrs['id'] ) || ! function_exists( 'render_block_core_navigation_link' ) ) {
		return $content;
	}
	$page = get_post( (int) $attrs['id'] );
	if ( ! $page instanceof WP_Post || 'publish' === $page->post_status || ! in_array( $page->post_name, WP_JA_VEGA_SEARCH_PATHS, true ) ) {
		return $content;
	}
	$attrs['kind'] = 'custom';
	$attrs['url']  = home_url( '/' . $page->post_name . '/' );
	unset( $attrs['id'] );
	return (string) render_block_core_navigation_link( $attrs, '', $block );
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_vega_search_link', 10, 3 );

/**
 * On a single post the source marks the menu item the article is routed under as current: Joomla
 * serves an article at `<menu item path>/<alias>`, so on /category-blog/<alias> "News" and
 * "Category Blog" (both /category-blog) carry `.current.active`, and on /blog-detail (its own menu
 * item) only that item does. Here a navigation link whose path is the request's path gets
 * `current-menu-item`; one whose path is a parent of it, `current-menu-ancestor`. Only on a single
 * post: pages keep core's own marking.
 *
 * @param string $content The rendered link.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_vega_listing_ancestor( string $content, array $parsed ): string {
	if ( '' === $content || ! is_singular( 'post' ) ) {
		return $content;
	}
	$attrs = $parsed['attrs'] ?? array();
	$url   = ! empty( $attrs['id'] ) && 'post-type' === ( $attrs['kind'] ?? '' ) ? get_permalink( (int) $attrs['id'] ) : ( $attrs['url'] ?? '' );
	$link  = trim( (string) wp_parse_url( (string) $url, PHP_URL_PATH ), '/' );
	$here  = trim( (string) wp_parse_url( (string) wp_unslash( $_SERVER['REQUEST_URI'] ?? '' ), PHP_URL_PATH ), '/' );
	if ( '' === $link || '' === $here ) {
		return $content;
	}
	if ( $link === $here ) {
		$class = 'current-menu-item';
	} elseif ( str_starts_with( $here, $link . '/' ) ) {
		$class = 'current-menu-ancestor';
	} else {
		return $content;
	}
	$tags = new WP_HTML_Tag_Processor( $content );
	if ( $tags->next_tag( 'li' ) ) {
		$tags->add_class( $class );
	}
	return $tags->get_updated_html();
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_vega_listing_ancestor', 20, 2 );

/**
 * A custom navigation link to the request's own path is the current item, as the source marks its menu
 * item on the page it opens (`item-110 current` on /smart-search). Core marks only links to a post or
 * a term, so the search link (a custom link: its page is a draft, see wp_ja_vega_search_link) stayed
 * unmarked on the search view. Read from the rendered href (the link the visitor gets), same host only.
 * Every search view is the search page here: the theme's search form sends `s` to the home address
 * (`/?s=…`, or `/search/…/` with pretty links), where the source keeps its results on `/smart-search?q=`.
 *
 * @param string $content The rendered link.
 * @param array  $parsed  The parsed block (unused).
 * @return string
 */
function wp_ja_vega_custom_link_current( string $content, array $parsed ): string {
	unset( $parsed );
	if ( '' === $content || str_contains( $content, 'aria-current=' ) ) {
		return $content;
	}
	$tags = new WP_HTML_Tag_Processor( $content );
	if ( ! $tags->next_tag( 'a' ) ) {
		return $content;
	}
	$href = (string) $tags->get_attribute( 'href' );
	$link = trim( (string) wp_parse_url( $href, PHP_URL_PATH ), '/' );
	$here = trim( (string) wp_parse_url( (string) wp_unslash( $_SERVER['REQUEST_URI'] ?? '' ), PHP_URL_PATH ), '/' );
	if ( is_search() ) {
		$here = WP_JA_VEGA_SEARCH_PATHS[0];
	}
	$guest = wp_ja_vega_guest_view_path();
	if ( '' !== $guest ) {
		$here = $guest;
	}
	$host = (string) wp_parse_url( $href, PHP_URL_HOST );
	if ( '' === $link || $link !== $here || null !== wp_parse_url( $href, PHP_URL_QUERY ) || ( '' !== $host && (string) wp_parse_url( home_url(), PHP_URL_HOST ) !== $host ) ) {
		return $content;
	}
	$tags->set_attribute( 'aria-current', 'page' );
	$marked = new WP_HTML_Tag_Processor( $tags->get_updated_html() );
	if ( $marked->next_tag( 'li' ) ) {
		$marked->add_class( 'current-menu-item' );
	}
	return $marked->get_updated_html();
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_vega_custom_link_current', 30, 2 );

/**
 * On a page that answers a visitor who is not signed in with another view (wp_ja_vega_guest_view_path), the
 * page's own navigation link is not current: core marks a post-type link to the queried page, the source marks
 * only the view's item. The mark (class `current-menu-item`, `aria-current`) comes off that one link.
 *
 * @param string $content The rendered link.
 * @param array  $parsed  The parsed block (unused).
 * @return string
 */
function wp_ja_vega_guest_link_uncurrent( string $content, array $parsed ): string {
	unset( $parsed );
	$guest = wp_ja_vega_guest_view_path();
	if ( '' === $guest || '' === $content ) {
		return $content;
	}
	$tags = new WP_HTML_Tag_Processor( $content );
	if ( ! $tags->next_tag( 'li' ) || ! $tags->has_class( 'current-menu-item' ) ) {
		return $content;
	}
	$item = new WP_HTML_Tag_Processor( $content );
	$item->next_tag( 'a' );
	$link = trim( (string) wp_parse_url( (string) $item->get_attribute( 'href' ), PHP_URL_PATH ), '/' );
	if ( $link === $guest ) {
		return $content;
	}
	$tags->remove_class( 'current-menu-item' );
	if ( $tags->next_tag( 'a' ) ) {
		$tags->remove_attribute( 'aria-current' );
	}
	return $tags->get_updated_html();
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_vega_guest_link_uncurrent', 40, 2 );

/**
 * The path of the view a visitor who is not signed in gets on this page, or ''. A page that carries
 * `tracy_page_heading_guest` answers such a visitor with another page's view (/profile shows the log-in
 * form under "Login Form", as the source's profile item does), and the source then marks that view's
 * menu item (`item-106 current`), not the page's own. The view is the published page titled with that
 * heading; none, or the visitor is signed in, and the page keeps its own marking.
 *
 * @return string The view's path without slashes, or ''.
 */
function wp_ja_vega_guest_view_path(): string {
	static $path = null;
	if ( null !== $path ) {
		return $path;
	}
	$path = '';
	if ( ! is_page() || is_user_logged_in() ) {
		return $path;
	}
	$heading = trim( (string) get_post_meta( get_queried_object_id(), 'tracy_page_heading_guest', true ) );
	if ( '' === $heading ) {
		return $path;
	}
	$views = get_posts(
		array(
			'post_type'      => 'page',
			'post_status'    => 'publish',
			'title'          => $heading,
			'posts_per_page' => 1,
			'fields'         => 'ids',
			'no_found_rows'  => true,
		)
	);
	if ( $views && (int) $views[0] !== get_queried_object_id() ) {
		$path = trim( (string) wp_parse_url( (string) get_permalink( (int) $views[0] ), PHP_URL_PATH ), '/' );
	}
	return $path;
}

/**
 * The search view's masthead line. The source prints its masthead description under "Smart Search";
 * the seeder keeps that line as the excerpt of the search path's draft page (seed.mjs pageExcerpt:
 * a synthetic archive page carries `archives[].excerpt`), so the site owner edits it there, like
 * every other page's masthead line. Text typed into the paragraph itself wins; neither, no line.
 *
 * @param string $content The rendered paragraph block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_vega_search_desc( string $content, array $block ): string {
	if ( 'search.desc' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) {
		return $content;
	}
	if ( '' !== trim( wp_strip_all_tags( $content ) ) ) {
		return $content;
	}
	$page = get_page_by_path( WP_JA_VEGA_SEARCH_PATHS[0], OBJECT, 'page' );
	$text = $page instanceof WP_Post ? trim( (string) $page->post_excerpt ) : '';
	if ( '' === $text ) {
		return '';
	}
	$safe = esc_html( $text );
	return (string) preg_replace_callback(
		'/^(\s*<p\b[^>]*>).*(<\/p>\s*)$/s',
		static fn( array $m ): string => $m[1] . $safe . $m[2],
		$content
	);
}
add_filter( 'render_block_core/paragraph', 'wp_ja_vega_search_desc', 10, 2 );

/**
 * A post at the source's address. Joomla files an article under its listing's menu path
 * (`/category-blog/<alias>`, `/portfolio/<category>/<alias>`), and that address is linked from the
 * source and listed in the page-map; WordPress gives the post `/<slug>/`. A request whose path is a
 * listing page followed by a post's slug is answered with that post, at that address, rather than
 * redirected. As in the source, the address holds only under the listing of the post's own
 * category: the parent must be a published page whose post query names categories, and the post
 * must be filed directly in one of them (measured 26/09 on the source: a post under `/contact/`, a
 * blog post under `/portfolio/<category>/` and a portfolio post under `/portfolio/` all answer 404).
 * Any other path keeps its meaning. The post's canonical link still names its own permalink.
 *
 * @param array $vars The parsed query variables.
 * @return array
 */
function wp_ja_vega_listing_post_request( array $vars ): array {
	// The matched path, not `pagename`: with /%postname%/ a two-segment path is first taken by the
	// attachment rule (`[^/]+/([^/]+)/?$`, measured 26/09), so `pagename` is never set for it.
	global $wp;
	$path = isset( $wp->request ) ? trim( (string) $wp->request, '/' ) : '';
	if ( is_admin() || '' === $path || false === strpos( $path, '/' ) || isset( $vars['rest_route'] ) ) {
		return $vars;
	}
	if ( get_page_by_path( $path ) instanceof WP_Post ) {
		return $vars;
	}
	$slug   = basename( $path );
	$parent = get_page_by_path( dirname( $path ) );
	if ( ! $parent instanceof WP_Post || 'publish' !== $parent->post_status ) {
		return $vars;
	}
	$categories = wp_ja_vega_listing_categories( parse_blocks( $parent->post_content ) );
	if ( ! $categories ) {
		return $vars;
	}
	$posts = get_posts(
		array(
			'name'        => sanitize_title( $slug ),
			'post_type'   => 'post',
			'post_status' => 'publish',
			'numberposts' => 1,
			'fields'      => 'ids',
		)
	);
	// Membership is checked here, not with `category__in`: a query by `name` is singular, and
	// WP_Query drops the tax query of a singular query (measured 26/09).
	if ( ! $posts || ! array_intersect( $categories, wp_get_post_categories( (int) $posts[0] ) ) ) {
		return $vars;
	}
	return array(
		'name'                    => sanitize_title( $slug ),
		'wp_ja_vega_listing_post' => 1,
	);
}
add_filter( 'request', 'wp_ja_vega_listing_post_request' );

/**
 * A single view of the source at its own menu address (/blog-detail: the menu item opens one
 * article, which stays a post of its category). The seeder records that address in
 * `wp_ja_vega_redirects` pointing at the post (singleViewRules), and patterns.map.json declares
 * `views.single.servedAtPath`: the address answers with the post itself (200, as the source does),
 * not with a redirect. Only for a rule whose target is a published post, and only when no published
 * page holds the path; the post's canonical link still names its own permalink.
 *
 * @param array $vars The parsed query variables.
 * @return array
 */
function wp_ja_vega_single_view_request( array $vars ): array {
	global $wp;
	$path = isset( $wp->request ) ? trim( (string) $wp->request, '/' ) : '';
	if ( is_admin() || '' === $path || isset( $vars['rest_route'] ) || ! empty( $vars['wp_ja_vega_listing_post'] ) ) {
		return $vars;
	}
	$page = get_page_by_path( $path );
	if ( $page instanceof WP_Post && 'publish' === $page->post_status ) {
		return $vars;
	}
	$rules = get_option( 'wp_ja_vega_redirects' );
	if ( is_string( $rules ) ) {
		$rules = json_decode( $rules, true );
	}
	foreach ( is_array( $rules ) ? $rules : array() as $rule ) {
		if ( ! is_array( $rule ) || empty( $rule['to'] ) || trim( (string) ( $rule['from'] ?? '' ), '/' ) !== $path ) {
			continue;
		}
		$post = get_post( url_to_postid( home_url( trailingslashit( (string) $rule['to'] ) ) ) );
		if ( $post instanceof WP_Post && 'post' === $post->post_type && 'publish' === $post->post_status ) {
			return array(
				'name'                    => $post->post_name,
				'wp_ja_vega_listing_post' => 1,
			);
		}
	}
	return $vars;
}
add_filter( 'request', 'wp_ja_vega_single_view_request', 11 );

/**
 * The categories a listing page shows: those named by the post queries in its blocks, by id
 * (`taxQuery.category`, what the seeder writes and the editor sets) or by slug
 * (`wpJaVegaCategory`). A page without such a query is not a listing and names none.
 *
 * @param array $blocks Parsed blocks.
 * @return int[]
 */
function wp_ja_vega_listing_categories( array $blocks ): array {
	$ids = array();
	foreach ( $blocks as $block ) {
		$query = $block['attrs']['query'] ?? null;
		if ( 'core/query' === ( $block['blockName'] ?? '' ) && is_array( $query ) && 'post' === ( $query['postType'] ?? 'post' ) ) {
			foreach ( (array) ( $query['taxQuery']['category'] ?? array() ) as $id ) {
				$ids[] = (int) $id;
			}
			if ( ! empty( $query['wpJaVegaCategory'] ) ) {
				$term = get_term_by( 'slug', sanitize_title( (string) $query['wpJaVegaCategory'] ), 'category' );
				if ( $term ) {
					$ids[] = (int) $term->term_id;
				}
			}
		}
		if ( ! empty( $block['innerBlocks'] ) ) {
			$ids = array_merge( $ids, wp_ja_vega_listing_categories( $block['innerBlocks'] ) );
		}
	}
	return array_values( array_unique( array_filter( $ids ) ) );
}

/**
 * @param string[] $vars The public query variables.
 * @return string[]
 */
function wp_ja_vega_listing_post_var( array $vars ): array {
	$vars[] = 'wp_ja_vega_listing_post';
	return $vars;
}
add_filter( 'query_vars', 'wp_ja_vega_listing_post_var' );

/**
 * No canonical redirect away from the source's address of a post.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_vega_listing_post_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_vega_listing_post' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_vega_listing_post_no_canonical' );

/**
 * No guessed redirects. On a 404 WordPress looks for a post whose slug starts like the path and
 * sends the visitor there: measured on this stand (26/09), /404 went to the picture `404.jpg` and
 * /error-page to `error-page-2`. The source answers an unknown path with 404, and every route this
 * site keeps is a real page or a seeded redirect below.
 */
add_filter( 'do_redirect_guess_404_permalink', '__return_false' );

/**
 * No attachment pages. With the /%postname%/ structure a top-level path that equals an image's
 * slug resolves to that attachment, and WordPress then redirects to the file: measured 26/09 (M4b),
 * /404 answered 301 → uploads/…/404.jpg once no draft page held the slug `404`. The source has no
 * address for a picture, so such a path is a 404 like any other unknown one. Runs before
 * redirect_canonical (priority 10), which would still add a trailing slash to the path (/404 → /404/,
 * measured) because the attachment's query vars stay set; the filter below stops that redirect.
 */
function wp_ja_vega_no_attachment_pages(): void {
	if ( is_admin() || ! is_attachment() ) {
		return;
	}
	global $wp_query, $post;
	$wp_query->set_404();
	$wp_query->set( 'wp_ja_vega_attachment_404', 1 );
	// set_404() keeps the found attachment as the query's post; the 404 page's own words then went
	// through the_content with the picture prepended (prepend_attachment, measured M4b on /404).
	$wp_query->posts      = array();
	$wp_query->post_count = 0;
	$wp_query->post       = null;
	$post                 = null; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- the 404 has no post.
	status_header( 404 );
	nocache_headers();
}
add_action( 'template_redirect', 'wp_ja_vega_no_attachment_pages', 1 );

/**
 * No canonical redirect for an attachment path turned into a 404 above.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_vega_attachment_404_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_vega_attachment_404' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_vega_attachment_404_no_canonical' );

/**
 * Redirects the seeder recorded in the `wp_ja_vega_redirects` option. Exact path match only,
 * query string carried over, and never for a request WordPress already resolved: a stale rule
 * must not shadow a page the owner later creates at that path.
 */
function wp_ja_vega_redirects(): void {
	if ( is_admin() || ! is_404() || ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return;
	}
	$rules = get_option( 'wp_ja_vega_redirects' );
	if ( is_string( $rules ) ) {
		$rules = json_decode( $rules, true );
	}
	if ( ! is_array( $rules ) ) {
		return;
	}
	$uri   = wp_unslash( $_SERVER['REQUEST_URI'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- compared, not printed.
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
add_action( 'template_redirect', 'wp_ja_vega_redirects' );

/**
 * The 404 page's own words: the seeder keeps the source's "not found" page as a draft (so the
 * path answers 404) and records it in `wp_ja_vega_404_page`; the template's group named
 * `404.body` renders that page's content, and the template's generic text stays as the fallback.
 * JA Vega's source has no such page (its 404 is Joomla's bare error.php), so the quickstart seed
 * adds a draft `page-not-found` carrying error.php's words (G54): they stay editable, not baked.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_vega_404_body( string $content, array $block ): string {
	if ( ! is_404() || '404.body' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) {
		return $content;
	}
	$page = get_post( (int) get_option( 'wp_ja_vega_404_page' ) );
	if ( ! $page instanceof WP_Post || '' === trim( $page->post_content ) ) {
		return $content;
	}
	$inner = (string) apply_filters( 'the_content', $page->post_content );
	return (string) preg_replace_callback(
		'/^(\s*<div\b[^>]*>)(.*)(<\/div>\s*)$/s',
		static fn( array $m ): string => $m[1] . $inner . $m[3],
		$content
	);
}
add_filter( 'render_block_core/group', 'wp_ja_vega_404_body', 10, 2 );

/**
 * The masthead heading. The seeder files a page under its menu word and keeps the heading the
 * source's masthead prints in `tracy_page_heading` ("Who We Are" on the page the menu calls
 * "About Us"); the title block named `page.title` prints that heading when the page has one.
 * A page the source answers differently for a visitor who is not signed in carries that
 * heading in `tracy_page_heading_guest` (/profile: the source shows such a visitor its login
 * view under "Login Form"); a signed-in visitor keeps the page's own heading.
 *
 * @param string $content The rendered post title block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_vega_page_heading( string $content, array $block ): string {
	if ( 'page.title' !== ( $block['attrs']['metadata']['name'] ?? '' ) || ! is_page() ) {
		return $content;
	}
	$page    = get_queried_object_id();
	$heading = is_user_logged_in() ? '' : trim( (string) get_post_meta( $page, 'tracy_page_heading_guest', true ) );
	if ( '' === $heading ) {
		$heading = trim( (string) get_post_meta( $page, 'tracy_page_heading', true ) );
	}
	if ( '' === $heading ) {
		return $content;
	}
	$safe = esc_html( $heading );
	return (string) preg_replace_callback(
		'/^(\s*<h1\b[^>]*>).*(<\/h1>\s*)$/s',
		static fn( array $m ): string => $m[1] . $safe . $m[2],
		$content
	);
}
add_filter( 'render_block_core/post-title', 'wp_ja_vega_page_heading', 10, 2 );

/**
 * A post's tags in the order they were created, not by name: the source prints an article's tags
 * in its tag tree order (business, technology, services), which is the order the importer created
 * them in, while WordPress sorts `get_the_terms()` by name (business, services, technology).
 *
 * @param WP_Term[]|WP_Error|false $terms    The post's terms.
 * @param int                      $post_id  The post.
 * @param string                   $taxonomy The taxonomy.
 * @return WP_Term[]|WP_Error|false
 */
function wp_ja_vega_tag_order( $terms, $post_id, $taxonomy ) {
	if ( 'post_tag' !== $taxonomy || ! is_array( $terms ) ) {
		return $terms;
	}
	usort( $terms, static fn( WP_Term $a, WP_Term $b ): int => $a->term_id <=> $b->term_id );
	return $terms;
}
add_filter( 'get_the_terms', 'wp_ja_vega_tag_order', 10, 3 );

/**
 * The listing pager as the source's Joomla pagination: first and previous cells before the page
 * numbers and next and last after them (disabled on the first and the last page, as the source
 * prints them), then the "Page N of M" counter, which drops under the cells when they do not
 * leave it room. The core block prints only the numbers and one arrow each side, and only when
 * there is a page that way. Both numbers come from the query the block paginates; a query of one
 * page keeps the block's own output (nothing, like the source).
 *
 * @param string   $content  The rendered pagination block.
 * @param array    $block    The parsed block.
 * @param WP_Block $instance The block instance (its context carries the query).
 * @return string
 */
function wp_ja_vega_pager( string $content, array $block, $instance ): string {
	if ( ! $instance instanceof WP_Block ) {
		return $content;
	}
	// A pager the seeder marked as Joomla's (`tracy-joomla-pager`, the category blogs) is drawn by the kit's
	// must-use plugin tracy-joomla-pagination.php when it is installed; the stylesheet gives both markups the
	// source's look. Without the plugin (the theme alone) this function draws it.
	$classes = preg_split( '/\s+/', (string) ( $block['attrs']['className'] ?? '' ) );
	if ( function_exists( 'tracy_joomla_pager_render' ) && in_array( 'tracy-joomla-pager', $classes, true ) ) {
		return $content;
	}
	$query   = $instance->context['query'] ?? array();
	$inherit = ! empty( $query['inherit'] );
	$key     = '';
	if ( $inherit ) {
		global $wp_query;
		$page  = max( 1, (int) get_query_var( 'paged' ) );
		$total = (int) $wp_query->max_num_pages;
	} else {
		$key  = isset( $instance->context['queryId'] ) ? 'query-' . $instance->context['queryId'] . '-page' : 'query-page';
		$page = empty( $_GET[ $key ] ) ? 1 : max( 1, (int) $_GET[ $key ] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- the page number the core block reads.
		// The listing's pages, not the query's: a list that starts past the cards (an offset, the
		// /featured-articles "More Articles" query that carries the pager) pages with the cards.
		$vars = build_query_vars_from_query_block( $instance, 1 );
		unset( $vars['offset'] );
		$vars['paged']         = 1;
		$vars['fields']        = 'ids';
		$vars['no_found_rows'] = false;
		$counted               = new WP_Query( $vars );
		$total                 = (int) $counted->max_num_pages;
		if ( ! empty( $query['pages'] ) ) {
			$total = min( $total, (int) $query['pages'] );
		}
	}
	if ( $total < 2 || $page > $total ) {
		return $content;
	}
	$url  = static function ( int $n ) use ( $inherit, $key ): string {
		if ( $inherit ) {
			return get_pagenum_link( $n );
		}
		return 1 === $n ? remove_query_arg( $key ) : add_query_arg( $key, $n );
	};
	$cell = static function ( int $to, bool $off, string $glyph, string $label, string $kind ) use ( $url ): string {
		$class = 'jv-pager__cell jv-pager__' . $kind;
		$span  = '<span class="jv-pager__glyph" aria-hidden="true">' . $glyph . '</span>';
		if ( $off ) {
			return '<span class="' . $class . ' is-disabled" aria-hidden="true">' . $span . '</span>';
		}
		return '<a class="' . $class . '" href="' . esc_url( $url( $to ) ) . '" aria-label="' . esc_attr( $label ) . '">' . $span . '</a>';
	};
	// The block's own previous / next links give way to the four cells.
	$inner = (string) preg_replace( '#<a\b[^>]*\bwp-block-query-pagination-(?:previous|next)\b[^>]*>.*?</a>#s', '', $content );
	if ( preg_match( '#^(\s*<nav\b[^>]*>)(.*)(</nav>\s*)$#s', $inner, $m ) ) {
		$open  = (string) preg_replace( '#\bclass="#', 'class="jv-pager ', $m[1], 1 );
		$cells = trim( $m[2] );
		$close = $m[3];
	} else {
		// Core printed nothing: the page past a list's last post (the offset list above on the last
		// page). The listing still has this page, so the pager is drawn here, numbers included.
		$class   = trim( 'jv-pager ' . ( $block['attrs']['className'] ?? '' ) . ' wp-block-query-pagination is-layout-flex wp-block-query-pagination-is-layout-flex' );
		$numbers = paginate_links(
			array(
				'base'      => $inherit ? str_replace( PHP_INT_MAX, '%#%', esc_url( get_pagenum_link( PHP_INT_MAX ) ) ) : '%_%',
				'format'    => $inherit ? '' : '?' . $key . '=%#%',
				'current'   => $page,
				'total'     => $total,
				'prev_next' => false,
				'mid_size'  => 4,
				'add_args'  => $inherit || 1 === $page ? array() : array( 'cst' => '' ),
			)
		);
		$open    = '<nav class="' . esc_attr( $class ) . '" aria-label="' . esc_attr__( 'Pagination', 'wp-ja-vega' ) . '">';
		$cells   = '<div class="wp-block-query-pagination-numbers">' . $numbers . '</div>';
		$close   = '</nav>';
	}
	$before = $cell( 1, 1 === $page, '&laquo;', __( 'Go to first page', 'wp-ja-vega' ), 'first' )
		. $cell( $page - 1, 1 === $page, '&lsaquo;', __( 'Go to previous page', 'wp-ja-vega' ), 'prev' );
	$after  = $cell( $page + 1, $page === $total, '&rsaquo;', __( 'Go to next page', 'wp-ja-vega' ), 'next' )
		. $cell( $total, $page === $total, '&raquo;', __( 'Go to end page', 'wp-ja-vega' ), 'last' );
	/* translators: 1: the page shown, 2: the number of pages. */
	$counter = sprintf( __( 'Page %1$d of %2$d', 'wp-ja-vega' ), $page, $total );
	return $open . '<div class="jv-pager__cells">' . $before . $cells . $after . '</div>'
		. '<p class="jv-pager__counter">' . esc_html( $counter ) . '</p>' . $close;
}
add_filter( 'render_block_core/query-pagination', 'wp_ja_vega_pager', 10, 3 );

/**
 * The login form's labels in the source's words: Joomla prints "Username", "Remember me" and a "Log in"
 * button, core "Username or Email Address", "Remember Me" and "Log In" (the field still takes either).
 * core/loginout draws its form with wp_login_form(), which reads these defaults.
 *
 * @param array $defaults The form's arguments.
 * @return array
 */
function wp_ja_vega_login_form_defaults( array $defaults ): array {
	$defaults['label_username'] = __( 'Username', 'wp-ja-vega' );
	$defaults['label_remember'] = __( 'Remember me', 'wp-ja-vega' );
	$defaults['label_log_in']   = __( 'Log in', 'wp-ja-vega' );
	return $defaults;
}
add_filter( 'login_form_defaults', 'wp_ja_vega_login_form_defaults' );

/**
 * What the source's login view adds around the form (D-61): a show/hide button inside the password
 * field and, under the form, a "Forgot your password?" link, here to WordPress's own lost-password
 * screen. The source's "Forgot your username?" has no WordPress view (the field takes the e-mail
 * address too) and its "Don't have an account?" leads to registration, which stays off (D-45); neither
 * is drawn. Only a form core/loginout printed whole is touched: exactly one `#loginform` holding
 * exactly one `#user_pass` field, not already given its button. Anything else (the signed-in "Log out" link, a
 * form another plugin changed, a block this filter already saw) is returned as it came. The button starts `hidden`; assets/js/wp-ja-vega.js shows it and
 * switches the field, so a page without the script has no button that does nothing.
 *
 * Like the source's form, both fields are `required` (the password also `aria-required`) and the username field takes
 * the focus on load (`autofocus`, which the browser honours without script).
 *
 * @param string $html The rendered block.
 * @return string
 */
function wp_ja_vega_login_helpers( string $html ): string {
	if ( str_contains( $html, 'jv-password__toggle' )
		|| 1 !== preg_match_all( '/<form\b[^>]*\bid="loginform"/', $html )
		|| 1 !== preg_match_all( '/<input\b[^>]*\bid="user_pass"[^>]*>/', $html, $field )
		|| 1 !== substr_count( $html, '</form>' ) ) {
		return $html;
	}
	$toggle = sprintf(
		'<button type="button" class="jv-password__toggle" aria-controls="user_pass" aria-pressed="false" aria-label="%s" hidden></button>',
		esc_attr__( 'Show password', 'wp-ja-vega' )
	);
	$password = str_replace( '<input', '<input required aria-required="true"', $field[0][0] );
	$html     = str_replace( $field[0][0], '<span class="jv-password">' . $password . $toggle . '</span>', $html );
	$html     = preg_replace( '/<input\b(?=[^>]*\bid="user_login")/', '<input required autofocus', $html, 1 );
	$links    = sprintf(
		'<ul class="jv-login-links"><li><a href="%s">%s</a></li></ul>',
		esc_url( wp_lostpassword_url() ),
		esc_html__( 'Forgot your password?', 'wp-ja-vega' )
	);
	return str_replace( '</form>', '</form>' . $links, $html );
}
add_filter( 'render_block_core/loginout', 'wp_ja_vega_login_helpers' );

/**
 * The search field is not `required`, as the source's `q` field is not: an empty submit goes through (the source
 * shows the empty-search page), where the core Search block prints `required` and blocks it in the browser.
 *
 * @param string $html The rendered block.
 * @return string
 */
function wp_ja_vega_search_not_required( string $html ): string {
	return (string) preg_replace( '/(<input\b[^>]*\bwp-block-search__input\b[^>]*?)\s+required(?:="[^"]*")?(?=[\s\/>])/', '$1', $html );
}
add_filter( 'render_block_core/search', 'wp_ja_vega_search_not_required' );

/**
 * The intro of a "More our projects" card is cut on the server, as the source's Joomla module does with
 * `HTMLHelper::_( 'string.truncate', $text, 100 )`: at most 100 characters, the cut moved back to the last space, then
 * "..." (three ASCII dots), so "…because it is..." where the full text goes on "…because it is pain, but…". The
 * template marks the block `jv-excerpt-100`; the CSS clamp stays as a second guard. The rule is Joomla's own
 * (StringHelper::truncate, no HTML, words not split), so a different text is cut where the source cuts it.
 *
 * @param string $html  The rendered block.
 * @param array  $block The block.
 * @return string
 */
function wp_ja_vega_card_excerpt( string $html, array $block ): string {
	$class = (string) ( $block['attrs']['className'] ?? '' );
	if ( ! preg_match( '/(^|\s)jv-excerpt-100(\s|$)/', $class ) ) {
		return $html;
	}
	return (string) preg_replace_callback(
		'#(<p class="wp-block-post-excerpt__excerpt">)(.*?)(</p>)#s',
		static function ( array $m ): string {
			$text = trim( html_entity_decode( wp_strip_all_tags( $m[2] ), ENT_QUOTES, 'UTF-8' ) );
			if ( mb_strlen( $text ) > 100 ) {
				$cut    = trim( mb_substr( $text, 0, 100 ) );
				$offset = mb_strrpos( $cut, ' ' );
				if ( false === $offset ) {
					$text = '...';
				} else {
					$cut = mb_substr( $cut, 0, $offset + 1 );
					if ( mb_strlen( $cut ) > 97 ) {
						$cut = trim( mb_substr( $cut, 0, (int) mb_strrpos( $cut, ' ' ) ) );
					}
					$text = $cut . '...';
				}
			}
			return $m[1] . esc_html( $text ) . $m[3];
		},
		$html,
		1
	);
}
add_filter( 'render_block_core/post-excerpt', 'wp_ja_vega_card_excerpt', 10, 2 );

/**
 * The Portfolio mega panel's project pictures draw the attachment itself, as the source's `.latestnews` does with
 * its 700 px intro image. When WordPress lazy-loads them (a page whose own content comes first, the search page)
 * it adds `sizes="auto"`, and the browser then takes the 300 px rendition for the 80 px square: its crop differs
 * from the source's at the edges (measured open on /smart-search at 1440). The panel's pictures keep the width
 * list WordPress wrote and load eagerly, so the rendition does not depend on the page the panel is opened on.
 *
 * @param string $html  The rendered block.
 * @param array  $block The block.
 * @return string
 */
function wp_ja_vega_mega_thumb_sizes( string $html, array $block ): string {
	$class = (string) ( $block['attrs']['className'] ?? '' );
	if ( ! preg_match( '/(^|\s)jv-mega__thumb(\s|$)/', $class ) ) {
		return $html;
	}
	// `sizes="auto"` is added later, to lazy images only (wp_img_tag_add_auto_sizes): the panel's pictures load
	// eagerly, so they keep the width list.
	return str_replace( array( 'sizes="auto, ', ' loading="lazy"' ), array( 'sizes="', ' loading="eager"' ), $html );
}
add_filter( 'render_block_core/post-featured-image', 'wp_ja_vega_mega_thumb_sizes', 10, 2 );

/**
 * The "Other Services" band of a service page (templates/page-service.html) sits on the source's wave
 * picture (`bg-wave-1.jpg`, cover; hidden in dark), the same picture the home page's team band shows
 * from the media library. The band is part of the template, so the picture is laid under it here from
 * that media item (D-08: a content image stays in the media library, not in the theme); a site without
 * it keeps the drawn gradient.
 *
 * @param string $content The rendered group.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_vega_service_wave( string $content, array $parsed ): string {
	static $image = null;
	$class = (string) ( $parsed['attrs']['className'] ?? '' );
	// "Other Services" under a service page and "More our projects" under a project page: the same band on the source's wave.
	$band = ( str_contains( $class, 'jv-related' ) && is_page_template( 'page-service' ) )
		|| ( str_contains( $class, 'jv-more-projects' ) && 'post-project' === get_page_template_slug( (int) get_queried_object_id() ) );
	if ( ! $band || 'section' !== ( $parsed['attrs']['tagName'] ?? '' ) ) {
		return $content;
	}
	if ( null === $image ) {
		$found = get_posts(
			array(
				'post_type'        => 'attachment',
				'post_status'      => 'inherit',
				'posts_per_page'   => 1,
				'fields'           => 'ids',
				'orderby'          => 'ID',
				'order'            => 'ASC',
				'suppress_filters' => false,
				'meta_query'       => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- one indexed lookup per request, cached below.
					array(
						'key'     => '_wp_attached_file',
						'value'   => '/bg-wave-1.jpg',
						'compare' => 'LIKE',
					),
				),
			)
		);
		$image = $found ? (string) wp_get_attachment_image(
			(int) $found[0],
			'full',
			false,
			array(
				'alt'     => '',
				'class'   => 'wp-image-' . (int) $found[0],
				'loading' => 'lazy',
			)
		) : '';
	}
	if ( '' === $image ) {
		return $content;
	}
	return (string) preg_replace( '#^(\s*<section\b[^>]*>)#', '$1<figure class="wp-block-image size-full jv-bg jv-bg--wave">' . $image . '</figure>', $content, 1 );
}
add_filter( 'render_block_core/group', 'wp_ja_vega_service_wave', 10, 2 );

/**
 * The footer's newsletter form (the source's mod_acym "Join 150K+ Designers For Weekly Creative Insights": an
 * email field and Subscribe). WordPress has no mailing list, so the form does what a site without one can do
 * truthfully: it mails the address to the site owner (wp_ja_vega_contact_to()) as a subscription request, and says
 * "sent" only when wp_mail() accepted the message; every other outcome is named on the page. The form posts to
 * admin-post.php with a nonce and a hidden field only a bot fills, a malformed address is refused, and the same
 * address asked twice within an hour sends one message.
 *
 * @return string The form and, after a submit, its one-line result.
 */
function wp_ja_vega_newsletter_shortcode(): string {
	$messages = array(
		'sent'    => __( 'Thank you. Your subscription request was sent to the site owner.', 'wp-ja-vega' ),
		'invalid' => __( 'Enter a valid email address.', 'wp-ja-vega' ),
		'failed'  => __( 'Your request could not be sent. Please try again later.', 'wp-ja-vega' ),
	);
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only result word, matched against a fixed list.
	$state = isset( $_GET['jv_newsletter'] ) ? sanitize_key( wp_unslash( $_GET['jv_newsletter'] ) ) : '';
	$state = isset( $messages[ $state ] ) ? $state : '';
	$id    = wp_unique_id( 'jv-newsletter-email-' );
	ob_start();
	?>
	<form class="jv-newsletter__form" id="jv-newsletter" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
		<input type="hidden" name="action" value="wp_ja_vega_newsletter">
		<?php wp_nonce_field( 'wp_ja_vega_newsletter', '_jv_nonce' ); ?>
		<p class="jv-newsletter__trap" aria-hidden="true"><input type="text" name="jv_website" value="" tabindex="-1" autocomplete="off"></p>
		<div class="jv-newsletter__row">
			<label class="screen-reader-text" for="<?php echo esc_attr( $id ); ?>"><?php esc_html_e( 'Email', 'wp-ja-vega' ); ?></label>
			<input class="jv-newsletter__email" id="<?php echo esc_attr( $id ); ?>" type="email" name="jv_email" required autocomplete="email" placeholder="<?php esc_attr_e( 'Email', 'wp-ja-vega' ); ?>">
			<button class="jv-newsletter__submit" type="submit"><?php esc_html_e( 'Subscribe', 'wp-ja-vega' ); ?></button>
		</div>
		<p class="jv-newsletter__status<?php echo '' !== $state ? ' jv-newsletter__status--' . esc_attr( $state ) : ''; ?>" role="status"><?php echo '' !== $state ? esc_html( $messages[ $state ] ) : ''; ?></p>
	</form>
	<?php
	// One line: a shortcode's output runs through wpautop, which turns every newline into a <br> inside the form.
	return trim( (string) preg_replace( '/\s*\n\s*/', ' ', (string) ob_get_clean() ) );
}
add_shortcode( 'wp_ja_vega_newsletter', 'wp_ja_vega_newsletter_shortcode' );

/**
 * Where the site owner's mail goes: the address the customer gave when the site was built (`tracy_contact_to`),
 * or the one a `tracy_contact_to` filter names, as in tracy-base. There is no fallback to the site's admin
 * address: on a site Tracy built that is Tracy's own mailbox, not the customer's.
 *
 * @return string The address, or '' when there is none.
 */
function wp_ja_vega_contact_to(): string {
	$to = get_option( 'tracy_contact_to' );
	$to = apply_filters( 'tracy_contact_to', is_string( $to ) && is_email( $to ) ? $to : '' );
	return is_string( $to ) && is_email( $to ) ? $to : '';
}

/**
 * Handle the newsletter form (see wp_ja_vega_newsletter_shortcode()) and send the visitor back to it.
 */
function wp_ja_vega_newsletter_submit(): void {
	$back = wp_get_referer();
	$back = $back ? $back : home_url( '/' );
	$back = remove_query_arg( 'jv_newsletter', $back );
	$done = static function ( string $state ) use ( $back ): void {
		wp_safe_redirect( add_query_arg( 'jv_newsletter', $state, $back ) . '#jv-newsletter' );
		exit;
	};
	$nonce = isset( $_POST['_jv_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['_jv_nonce'] ) ) : '';
	if ( ! wp_verify_nonce( $nonce, 'wp_ja_vega_newsletter' ) ) {
		$done( 'failed' );
	}
	// The field no visitor sees: a bot filled it. Nothing is sent, and the bot is told nothing useful.
	if ( ! empty( $_POST['jv_website'] ) ) {
		$done( 'sent' );
	}
	$email = isset( $_POST['jv_email'] ) ? sanitize_email( wp_unslash( $_POST['jv_email'] ) ) : '';
	if ( '' === $email || ! is_email( $email ) ) {
		$done( 'invalid' );
	}
	$to = wp_ja_vega_contact_to();
	if ( '' === $to ) {
		$done( 'failed' );
	}
	$key = 'jv_nl_' . md5( strtolower( $email ) );
	if ( false !== get_transient( $key ) ) {
		$done( 'sent' );
	}
	set_transient( $key, 1, HOUR_IN_SECONDS );
	$sent = wp_mail(
		$to,
		sprintf(
			/* translators: %s: the site name. */
			__( '[%s] Newsletter subscription request', 'wp-ja-vega' ),
			wp_specialchars_decode( (string) get_option( 'blogname' ), ENT_QUOTES )
		),
		sprintf(
			/* translators: %s: the visitor's email address. */
			__( 'Please add this address to your mailing list: %s', 'wp-ja-vega' ),
			$email
		),
		array( 'Reply-To: ' . $email )
	);
	if ( ! $sent ) {
		delete_transient( $key );
		$done( 'failed' );
	}
	$done( 'sent' );
}
add_action( 'admin_post_nopriv_wp_ja_vega_newsletter', 'wp_ja_vega_newsletter_submit' );
add_action( 'admin_post_wp_ja_vega_newsletter', 'wp_ja_vega_newsletter_submit' );

/**
 * A project page (template post-project) sits under Portfolio in the source's menu, where its category's item is the current
 * one (item 132 "Database Security" for the audited projects). The project posts live at the site root, so the address alone
 * cannot say so: the menu's Portfolio item and the link to the post's category are marked current from the post's category.
 *
 * @param string $url A menu item's address.
 * @return bool True when $url is /portfolio (the section) or /portfolio/<the current project's category>.
 */
function wp_ja_vega_is_project_of( string $url ): bool {
	if ( ! is_singular( 'post' ) || 'post-project' !== get_page_template_slug( (int) get_queried_object_id() ) ) {
		return false;
	}
	$path = untrailingslashit( (string) wp_parse_url( $url, PHP_URL_PATH ) );
	if ( '/portfolio' === $path ) {
		return true;
	}
	$cats = get_the_category( (int) get_queried_object_id() );
	return ! empty( $cats ) && '/portfolio/' . $cats[0]->slug === $path;
}

/**
 * Mark the link to a project's category current inside the Portfolio panel (see wp_ja_vega_is_project_of()).
 *
 * @param string $content The rendered navigation link.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_vega_project_current_link( string $content, array $parsed ): string {
	$url = (string) ( $parsed['attrs']['url'] ?? '' );
	if ( '' === $url || '/portfolio' === untrailingslashit( (string) wp_parse_url( $url, PHP_URL_PATH ) ) || ! wp_ja_vega_is_project_of( $url ) ) {
		return $content;
	}
	$content = (string) preg_replace( '#^(<li class="[^"]*)"#', '$1 current-menu-item"', $content, 1 );
	return (string) preg_replace( '#(<a class="wp-block-navigation-item__content")#', '$1 aria-current="page"', $content, 1 );
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_vega_project_current_link', 10, 2 );
