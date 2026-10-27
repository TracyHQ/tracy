<?php
/**
 * wp-ja-nova — what this target adds on top of the source theme: the JA Nova stylesheet, the dark
 * mode switch, the header drawer, the moving tag rows, the pricing tabs, the questions list and the
 * video dialog, the carousels the source runs, the queries the section patterns name by category
 * slug, the search page at the source's address, the seeded redirects and the 404 page's own words.
 * Loaded by the generic hook at the end of functions.php (the source theme has no inc/extra.php,
 * so it is inert there).
 *
 * Functions here carry the `wp_ja_nova_` prefix; the shared `tracy_*` helpers of functions.php
 * (tracy_page_kind() and friends) are already defined when this file runs.
 *
 * @package wp-ja-nova
 */

defined( 'ABSPATH' ) || exit;

// The identity tokens the pages and parts carry, and their filling.
require_once __DIR__ . '/identity.php';

/**
 * The motion the source runs, as the motion library's settings: the default of the `tracy_motion`
 * option, so a site that never saved the option wears the design's motion, and a site owner who
 * saves `{"effects":[]}` turns it all off. Measured on the source (29/09, templates/ja_nova): no
 * scroll-in reveal and no entrance (no AOS, no animate.css); two Owl carousels that step — the
 * client logos on their own every 5 s (assets/js/wp-ja-nova.js presses the carousel's next button),
 * the team from its two arrows. The moving tag rows are the theme's own (assets/js/wp-ja-nova.js).
 */
function wp_ja_nova_default_motion(): string {
	return (string) wp_json_encode(
		array(
			'effects' => array(
				array(
					'id' => 'carousel-step',
					'v'  => 2,
				),
			),
		)
	);
}
add_filter( 'default_option_tracy_motion', 'wp_ja_nova_default_motion' );

/**
 * The assets. The design pages (fixture, artifact) render a design system's own markup under its
 * own stylesheet and dequeue the theme's; nothing here belongs on them either.
 */
function wp_ja_nova_enqueue_assets(): void {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return;
	}
	$version = wp_get_theme()->get( 'Version' );
	wp_enqueue_style( 'wp-ja-nova', get_theme_file_uri( 'assets/css/wp-ja-nova.css' ), array( 'tracy', 'tracy-layout', 'tracy-sections' ), $version );
	// The Bootstrap components the source's Typography demo page uses (G15): scoped to that page's demo block,
	// so no other page pays for them.
	if ( is_page( 'typography' ) ) {
		wp_enqueue_style( 'wp-ja-nova-typography', get_theme_file_uri( 'assets/css/wp-ja-nova-typography.css' ), array( 'wp-ja-nova' ), $version );
	}
	// In the head, blocking, on purpose: it resolves the theme before the first paint, so a
	// visitor who chose dark never sees a light frame. It is a few hundred bytes.
	wp_enqueue_script( 'wp-ja-nova-dark', get_theme_file_uri( 'assets/js/wp-ja-nova-dark.js' ), array(), $version, array( 'in_footer' => false ) );
	wp_enqueue_script( 'wp-ja-nova', get_theme_file_uri( 'assets/js/wp-ja-nova.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	wp_localize_script(
		'wp-ja-nova',
		'wpJaNova',
		array(
			'openMenu'  => __( 'Open the menu', 'wp-ja-nova' ),
			'closeMenu' => __( 'Close the menu', 'wp-ja-nova' ),
			'close'     => __( 'Close', 'wp-ja-nova' ),
			'rest'      => esc_url_raw( rest_url( 'wp-ja-nova/v1/' ) ),
			'restNonce' => wp_create_nonce( 'wp_rest' ),
			'passkeyUnsupported' => __( 'This browser does not support passkeys.', 'wp-ja-nova' ),
			'passkeyCancelled'   => __( 'The passkey request was cancelled.', 'wp-ja-nova' ),
			'passkeyFailed'      => __( 'The passkey could not be used.', 'wp-ja-nova' ),
			'back'      => __( 'Back', 'wp-ja-nova' ),
			'backTo'    => __( 'Back to', 'wp-ja-nova' ),
			'video'     => __( 'Video', 'wp-ja-nova' ),
			'pages'        => __( 'Pages', 'wp-ja-nova' ),
			'previousPage' => __( 'Previous page', 'wp-ja-nova' ),
			'nextPage'     => __( 'Next page', 'wp-ja-nova' ),
		)
	);
	// The carousel's own buttons speak the site's language: the library reads `labels` beside its
	// effects. Added after functions.php set `window.TracyMotion`, before the library runs.
	wp_add_inline_script(
		'tracy-motion',
		'window.TracyMotion&&(window.TracyMotion.labels=' . wp_json_encode(
			array(
				'previous' => __( 'Previous slide', 'wp-ja-nova' ),
				'next'     => __( 'Next slide', 'wp-ja-nova' ),
				'slide'    => __( 'Go to slide', 'wp-ja-nova' ),
			)
		) . ');',
		'before'
	);
}
add_action( 'wp_enqueue_scripts', 'wp_ja_nova_enqueue_assets', 11 );

/**
 * The word the theme's style sheet prints before an author's name, as a CSS variable in the site's language.
 *
 * 🔒 A STYLE SHEET CARRIES NO VISITOR WORD (LANG-2, measured 10/10/2026 on dev g59-ess-wp-full, JA Essence WordPress 1.0.12,
 * Vietnamese): post cards read "By <author>" because the style sheet printed the word in `content:`, which no translation
 * reaches. The rules print `var(--wp-ja-nova-by)`; the word is WordPress's own "By %s" (the core translation every site
 * language ships), so a site in any language reads it in that language.
 */
function wp_ja_nova_css_words(): void {
	$by = preg_replace( '/[<>"\\\\\r\n]+/', ' ', str_replace( '%s', '', _x( 'By %s', 'theme author', 'default' ) ) );
	$by = trim( $by );
	wp_add_inline_style( 'wp-ja-nova', ':root{--wp-ja-nova-by:"' . $by . ' ";}' );
}
add_action( 'wp_enqueue_scripts', 'wp_ja_nova_css_words', 12 );

/**
 * `?theme=dark|light` decides by its FIRST value (assets/js/wp-ja-nova-dark.js). WordPress's canonical
 * redirect rebuilds the query from a parsed copy in which a repeated key keeps its LAST value, so
 * `?theme=dark&theme=light` would be sent to `?theme=light` before any script runs. Cancelled only when normalising the repeated key changes the
 * first value; any other redirect (host, scheme, port, path, fragment, other parameters) is left alone.
 *
 * @param string|false $redirect_url  The address WordPress wants to send the visitor to.
 * @param string       $requested_url The address that was asked for.
 * @return string|false
 */
function wp_ja_nova_keep_first_theme_value( $redirect_url, $requested_url ) {
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
add_filter( 'redirect_canonical', 'wp_ja_nova_keep_first_theme_value', 20, 2 );

/** The pattern category the overlay's patterns file under. */
function wp_ja_nova_register(): void {
	register_block_pattern_category( 'wp-ja-nova', array( 'label' => __( 'WP Nova', 'wp-ja-nova' ) ) );
	// The masthead prints a page's excerpt under its heading (the source's masthead description),
	// and core's excerpt block reads nothing for a post type without excerpt support.
	add_post_type_support( 'page', 'excerpt' );
	// A Joomla article kept as a page (the service pages) keeps its Joomla tags, which the tag list
	// (`wpJaNovaTags`) shows like the source's tag view.
	register_taxonomy_for_object_type( 'post_tag', 'page' );
}
add_action( 'init', 'wp_ja_nova_register' );

/** The stylesheet in the editor too, so sections look the same there. */
function wp_ja_nova_editor_styles(): void {
	add_editor_style( 'assets/css/wp-ja-nova.css' );
}
add_action( 'after_setup_theme', 'wp_ja_nova_editor_styles', 11 );

/**
 * The header is one bar, as the source's is. The theme.config.json of this target already names
 * nav `top-left` and hero `split`; the classes are restated after the source theme's filter so a
 * catalogue archetype can never float the header or recolour the hero copy (gotcha #7, #12).
 *
 * A page also carries `jn-route-<slug>` (and `jn-parent-<slug>` under a parent): the source draws
 * its component listings differently (the tag view is a list of titles, a category blog opens with
 * one wide item), and the seeded pages at those addresses hold the same query block, so the
 * stylesheet tells them apart by address.
 *
 * @param string[] $classes The body classes, with the source theme's already added.
 * @return string[]
 */
function wp_ja_nova_body_class( array $classes ): array {
	$navs      = array_map( static fn( string $nav ): string => 'tracy-nav-' . $nav, TRACY_NAVS );
	$heros     = array_map( static fn( string $hero ): string => 'tracy-hero-' . $hero, TRACY_HEROS );
	$classes   = array_values( array_diff( $classes, $navs, $heros ) );
	$classes[] = 'tracy-nav-top-left';
	$classes[] = 'tracy-hero-split';
	if ( is_page() ) {
		$page      = get_queried_object_id();
		$classes[] = 'jn-route-' . sanitize_html_class( (string) get_post_field( 'post_name', $page ) );
		$parent    = (int) wp_get_post_parent_id( $page );
		if ( $parent ) {
			$classes[] = 'jn-parent-' . sanitize_html_class( (string) get_post_field( 'post_name', $parent ) );
		}
	}
	return $classes;
}
add_filter( 'body_class', 'wp_ja_nova_body_class', 11 );

/**
 * The queries the patterns and templates name, resolved at render time. A pattern cannot know a
 * category's id (the seeder creates it), so the section patterns name the category by slug in
 * their query (`wpJaNovaCategory`, with its sub-categories, as the source's module does with
 * "show child category articles"); the service template asks for the current page's siblings
 * (`wpJaNovaSiblings`: the source's "Other Services"), the article template for the posts
 * sharing the most keywords with the current post (`wpJaNovaRelated`: "Continue Reading", see
 * wp_ja_nova_related_ids), the tag list for posts
 * carrying any of the named tags (`wpJaNovaTags`: the source's tag view, with its title filter
 * and "Display #" select, see wp_ja_nova_tag_filter). A tax query the owner sets in the editor
 * wins over the slugs.
 *
 * @param array    $query The WP_Query arguments the block built.
 * @param WP_Block $block The post template block.
 * @param int      $page  The page of the query being built.
 * @return array
 */
function wp_ja_nova_query_vars( array $query, WP_Block $block, $page = 1 ): array {
	$ctx = $block->context['query'] ?? array();
	if ( ! empty( $ctx['wpJaNovaTags'] ) && empty( $ctx['taxQuery'] ) ) {
		$query['tax_query'] = array(
			array(
				'taxonomy' => 'post_tag',
				'field'    => 'slug',
				'terms'    => array_values( array_filter( array_map( 'sanitize_title', (array) $ctx['wpJaNovaTags'] ) ) ),
			),
		);
		// The source's tag view lists every tagged item: articles kept as pages too.
		$query['post_type'] = array( 'post', 'page' );
		$filter = wp_ja_nova_tag_filter();
		if ( '' !== $filter['search'] ) {
			$query['s']              = $filter['search'];
			$query['search_columns'] = array( 'post_title' );
		}
		if ( null !== $filter['limit'] ) {
			// Core computed the offset from the block's own page size; the select changes it.
			$query['posts_per_page'] = 0 === $filter['limit'] ? -1 : $filter['limit'];
			$query['offset']         = 0 === $filter['limit'] ? 0 : $filter['limit'] * max( 0, (int) $page - 1 );
		}
	}
	if ( ! empty( $ctx['wpJaNovaCategory'] ) && empty( $ctx['taxQuery'] ) ) {
		$term = get_term_by( 'slug', sanitize_title( (string) $ctx['wpJaNovaCategory'] ), 'category' );
		$query['tax_query'] = array(
			array(
				'taxonomy'         => 'category',
				'field'            => 'term_id',
				'terms'            => $term ? array( (int) $term->term_id ) : array( 0 ),
				'include_children' => true,
			),
		);
	}
	if ( ! empty( $ctx['wpJaNovaSourceOrder'] ) ) {
		// The source lists its articles in the order of their ids (kept as post meta, D-13).
		$query['meta_key'] = WP_JA_NOVA_SOURCE_ID; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
		$query['orderby']  = 'meta_value_num';
		$query['order']    = 'ASC';
	}
	if ( ! empty( $ctx['wpJaNovaSiblings'] ) ) {
		$current = get_queried_object_id();
		$parent  = $current ? (int) wp_get_post_parent_id( $current ) : 0;
		$query['post_parent']  = $parent ? $parent : -1;
		$query['post__not_in'] = array( $current );
	}
	if ( ! empty( $ctx['wpJaNovaRelated'] ) ) {
		$ranked = wp_ja_nova_related_ids( get_queried_object_id() );
		// No shared keyword: an empty list, never every post.
		$query['post__in'] = $ranked ? $ranked : array( 0 );
		$query['orderby']  = 'post__in';
		// The featured (sticky) posts would otherwise be put first: the ranking decides alone.
		$query['ignore_sticky_posts'] = true;
		unset( $query['order'] );
	}
	return $query;
}
add_filter( 'query_loop_block_query_vars', 'wp_ja_nova_query_vars', 10, 3 );

/** The taxonomy holding each post's Joomla meta keywords (DECISIONS D-13). */
const WP_JA_NOVA_KEYWORDS = 'wp_ja_nova_keyword';

/** The post meta holding the Joomla article id a seeded post came from (its source order). */
const WP_JA_NOVA_SOURCE_ID = '_wp_ja_nova_source_id';

/**
 * Keywords: the words Joomla kept in an article's meta keywords, which picked its related items.
 * Not public — no archive, no tag strip, no query variable — but edited on the post screen like
 * tags, so the owner decides which posts are related. The post tags stay the source's tags.
 */
function wp_ja_nova_register_keywords(): void {
	register_taxonomy(
		WP_JA_NOVA_KEYWORDS,
		array( 'post' ),
		array(
			'labels'             => array(
				'name'                       => __( 'Keywords', 'wp-ja-nova' ),
				'singular_name'              => __( 'Keyword', 'wp-ja-nova' ),
				'search_items'               => __( 'Search Keywords', 'wp-ja-nova' ),
				'all_items'                  => __( 'All Keywords', 'wp-ja-nova' ),
				'edit_item'                  => __( 'Edit Keyword', 'wp-ja-nova' ),
				'update_item'                => __( 'Update Keyword', 'wp-ja-nova' ),
				'add_new_item'               => __( 'Add New Keyword', 'wp-ja-nova' ),
				'new_item_name'              => __( 'New Keyword Name', 'wp-ja-nova' ),
				'separate_items_with_commas' => __( 'Separate keywords with commas', 'wp-ja-nova' ),
				'add_or_remove_items'        => __( 'Add or remove keywords', 'wp-ja-nova' ),
				'choose_from_most_used'      => __( 'Choose from the most used keywords', 'wp-ja-nova' ),
				'not_found'                  => __( 'No keywords found.', 'wp-ja-nova' ),
				'menu_name'                  => __( 'Keywords', 'wp-ja-nova' ),
			),
			'description'        => __( 'Words that pick a post\'s related posts. Not shown on the site.', 'wp-ja-nova' ),
			'public'             => false,
			'publicly_queryable' => false,
			'hierarchical'       => false,
			'show_ui'            => true,
			'show_in_menu'       => true,
			'show_in_nav_menus'  => false,
			'show_tagcloud'      => false,
			'show_in_quick_edit' => true,
			'show_admin_column'  => true,
			// The block editor's panel reads and writes the terms through the REST API.
			'show_in_rest'       => true,
			'query_var'          => false,
			'rewrite'            => false,
		)
	);
}
add_action( 'init', 'wp_ja_nova_register_keywords' );

/**
 * The posts sharing a keyword with a post, most shared keywords first, then in the source's
 * article order (the Joomla article id the seeder recorded). Posts added in WordPress have no
 * source id and come after the seeded ones at the same score, oldest first. Joomla picked related
 * items by meta keywords; the port keeps those words in the Keywords taxonomy (DECISIONS D-13), so
 * the owner edits them and they decide the list, while the post tags stay the source's tags.
 *
 * @param int $post_id The post whose related posts are listed.
 * @return int[] Post IDs, best match first.
 */
function wp_ja_nova_related_ids( int $post_id ): array {
	if ( ! $post_id ) {
		return array();
	}
	$words = wp_get_object_terms( $post_id, WP_JA_NOVA_KEYWORDS, array( 'fields' => 'ids' ) );
	if ( ! $words || is_wp_error( $words ) ) {
		return array();
	}
	$candidates = get_posts(
		array(
			'post_type'           => get_post_type( $post_id ),
			'post_status'         => 'publish',
			'tax_query'           => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- the related list is a keyword match.
				array(
					'taxonomy' => WP_JA_NOVA_KEYWORDS,
					'field'    => 'term_id',
					'terms'    => array_map( 'intval', $words ),
				),
			),
			'post__not_in'        => array( $post_id ),
			'ignore_sticky_posts' => true,
			'fields'              => 'ids',
			'posts_per_page'      => -1,
			'orderby'             => 'ID',
			'order'               => 'ASC',
			'suppress_filters'    => false,
		)
	);
	$rank = array();
	foreach ( $candidates as $id ) {
		$own    = wp_get_object_terms( $id, WP_JA_NOVA_KEYWORDS, array( 'fields' => 'ids' ) );
		$source = get_post_meta( $id, WP_JA_NOVA_SOURCE_ID, true );
		$rank[] = array(
			'id'     => (int) $id,
			'score'  => is_array( $own ) ? count( array_intersect( $words, $own ) ) : 0,
			'source' => is_numeric( $source ) && (int) $source > 0 ? (int) $source : PHP_INT_MAX,
			'date'   => (string) get_post_field( 'post_date_gmt', $id ),
		);
	}
	usort(
		$rank,
		static function ( $a, $b ) {
			return $b['score'] <=> $a['score'] ?: ( $a['source'] <=> $b['source'] ?: ( $a['date'] <=> $b['date'] ?: $a['id'] <=> $b['id'] ) );
		}
	);
	return array_column( $rank, 'id' );
}

/**
 * A post's tags in the source's order: Joomla printed an article's tags in the tag tree's order,
 * which the seeding step records per post (`_wp_ja_nova_tag_order`, the names in that order).
 * Tags the owner adds later follow, by name, as WordPress lists them.
 *
 * @param WP_Term[]|false|WP_Error $terms    The post's terms.
 * @param int                      $post_id  The post.
 * @param string                   $taxonomy The taxonomy asked for.
 * @return WP_Term[]|false|WP_Error
 */
function wp_ja_nova_tag_order( $terms, $post_id, $taxonomy ) {
	if ( 'post_tag' !== $taxonomy || ! is_array( $terms ) || count( $terms ) < 2 ) {
		return $terms;
	}
	$order = json_decode( (string) get_post_meta( (int) $post_id, '_wp_ja_nova_tag_order', true ), true );
	if ( ! is_array( $order ) || ! $order ) {
		return $terms;
	}
	$rank = array();
	foreach ( array_values( $order ) as $i => $name ) {
		$rank[ strtolower( (string) $name ) ] = $i;
	}
	$at = static function ( $term ) use ( $rank ) {
		return $rank[ strtolower( $term->name ) ] ?? PHP_INT_MAX;
	};
	usort(
		$terms,
		static function ( $a, $b ) use ( $at ) {
			return $at( $a ) <=> $at( $b ) ?: strcasecmp( $a->name, $b->name );
		}
	);
	return $terms;
}
add_filter( 'get_the_terms', 'wp_ja_nova_tag_order', 10, 3 );

/** The page sizes the source's tag view offers in its "Display #" select; 0 is "All". */
const WP_JA_NOVA_TAG_LIMITS = array( 5, 10, 15, 20, 25, 30, 50, 100, 200, 500, 0 );

/**
 * The tag list's filter from the request: the part of a title to look for and the page size, when
 * one of the offered sizes was chosen (null keeps the block's own).
 *
 * @return array{search: string, limit: int|null}
 */
function wp_ja_nova_tag_filter(): array {
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- a public read-only filter.
	$search = isset( $_GET['filter-search'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['filter-search'] ) ) : '';
	$limit  = isset( $_GET['limit'] ) && is_numeric( $_GET['limit'] ) ? (int) $_GET['limit'] : null;
	// phpcs:enable
	return array(
		'search' => $search,
		'limit'  => in_array( $limit, WP_JA_NOVA_TAG_LIMITS, true ) ? $limit : null,
	);
}

/**
 * The tag list's filter bar, above the titles as on the source: a title filter with a search and
 * a clear button, and the "Display #" select. A plain GET form: the clear button sends an empty
 * filter after the field (the last value wins), the select submits on change from the theme
 * script and with the search button without it.
 *
 * @param string $content The rendered query block.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_nova_tag_filter_form( string $content, array $parsed ): string {
	if ( empty( $parsed['attrs']['query']['wpJaNovaTags'] ) || ! preg_match( '/^\s*<div\b[^>]*>/', $content, $open ) ) {
		return $content;
	}
	$filter  = wp_ja_nova_tag_filter();
	$current = $filter['limit'] ?? (int) ( $parsed['attrs']['query']['perPage'] ?? 20 );
	$options = '';
	foreach ( WP_JA_NOVA_TAG_LIMITS as $size ) {
		$options .= sprintf(
			'<option value="%1$d"%2$s>%3$s</option>',
			$size,
			selected( $size, $current, false ),
			0 === $size ? esc_html__( 'All', 'wp-ja-nova' ) : esc_html( (string) $size )
		);
	}
	$search = esc_attr__( 'Search', 'wp-ja-nova' );
	$clear  = esc_attr__( 'Clear', 'wp-ja-nova' );
	$form   = '<form class="jn-tagged__filters" method="get" action="' . esc_url( get_permalink() ) . '">'
		. '<div class="jn-tagged__search">'
		. '<label class="screen-reader-text" for="jn-tagged-search">' . esc_html__( 'Enter Part of Title', 'wp-ja-nova' ) . '</label>'
		. '<input type="text" id="jn-tagged-search" name="filter-search" value="' . esc_attr( $filter['search'] ) . '" placeholder="' . esc_attr__( 'Enter Part of Title', 'wp-ja-nova' ) . '">'
		. '<button type="submit" class="jn-tagged__button jn-tagged__button--search" title="' . $search . '"><span class="screen-reader-text">' . $search . '</span></button>'
		. '<button type="submit" class="jn-tagged__button jn-tagged__button--clear" name="filter-search" value="" title="' . $clear . '"><span class="screen-reader-text">' . $clear . '</span></button>'
		. '</div>'
		. '<label class="screen-reader-text" for="jn-tagged-limit">' . esc_html__( 'Display #', 'wp-ja-nova' ) . '</label>'
		. '<select id="jn-tagged-limit" class="jn-tagged__limit" name="limit">' . $options . '</select>'
		. '</form>';
	return $open[0] . $form . substr( $content, strlen( $open[0] ) );
}
add_filter( 'render_block_core/query', 'wp_ja_nova_tag_filter_form', 10, 2 );

/**
 * The source's search fields are not `required` (an empty submit lists the search page); core's Search block
 * renders `required` on its input, so the attribute is dropped from every search form of the theme.
 *
 * @param string $content The rendered Search block.
 * @return string
 */
function wp_ja_nova_search_not_required( string $content ): string {
	return (string) preg_replace_callback(
		'/<input\b[^>]*\btype="search"[^>]*>/i',
		static fn ( array $m ): string => (string) preg_replace( '/\s+required(?:=("|\')[^"\']*\1)?(?=[\s\/>])/i', '', $m[0] ),
		$content
	);
}
add_filter( 'render_block_core/search', 'wp_ja_nova_search_not_required' );

/**
 * The search page at the source's address. The source's search (com_finder) lives at
 * /smart-search, and its footer and menus link there; the seeder keeps that route's page as a
 * draft (patterns.map.json `views.search.servedAtPath`) and this answers the path with the
 * theme's search view: `s` (WordPress's form) or `q` (the source's) is the term, and an empty
 * term shows the form and no results, as com_finder does.
 */
const WP_JA_NOVA_SEARCH_PATHS = array( 'smart-search' );

/**
 * @param array $vars The parsed query variables.
 * @return array
 */
function wp_ja_nova_search_request( array $vars ): array {
	if ( is_admin() || empty( $vars['pagename'] ) || ! in_array( (string) $vars['pagename'], WP_JA_NOVA_SEARCH_PATHS, true ) ) {
		return $vars;
	}
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- a read-only search term.
	$term = isset( $_GET['s'] ) ? wp_unslash( $_GET['s'] ) : ( isset( $_GET['q'] ) ? wp_unslash( $_GET['q'] ) : '' );
	// phpcs:enable
	$term = sanitize_text_field( (string) $term );
	$out  = array(
		's'                 => $term,
		'wp_ja_nova_search' => 1,
	);
	if ( '' === $term ) {
		$out['post__in'] = array( 0 );
	}
	return $out;
}
add_filter( 'request', 'wp_ja_nova_search_request' );

/**
 * The search view's breadcrumb names the view as the source's menu does ("Smart Search"), whatever
 * the query: the source trail is Home / Smart Search on an empty form and on a result list alike.
 *
 * @param array[] $items Breadcrumb items (label, url, allow_html).
 * @return array[]
 */
function wp_ja_nova_search_breadcrumbs( array $items ): array {
	if ( ! is_search() || empty( $items ) ) {
		return $items;
	}
	$trail = array();
	foreach ( $items as $item ) {
		if ( ! empty( $item['url'] ) ) {
			$trail[] = $item;
		}
	}
	$trail[] = array( 'label' => __( 'Smart Search', 'wp-ja-nova' ) );
	return $trail;
}
add_filter( 'block_core_breadcrumbs_items', 'wp_ja_nova_search_breadcrumbs' );

/**
 * @param string[] $vars The public query variables.
 * @return string[]
 */
function wp_ja_nova_query_var( array $vars ): array {
	$vars[] = 'wp_ja_nova_search';
	return $vars;
}
add_filter( 'query_vars', 'wp_ja_nova_query_var' );

/** The request above is a search, even with an empty term (WordPress calls that the home page). */
function wp_ja_nova_search_flags( WP_Query $query ): void {
	if ( $query->is_main_query() && $query->get( 'wp_ja_nova_search' ) ) {
		$query->is_search = true;
		$query->is_home   = false;
		$query->is_404    = false;
	}
}
add_action( 'parse_query', 'wp_ja_nova_search_flags' );

/**
 * No canonical redirect for the search path: WordPress would send it to `/?s=`.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_nova_search_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_nova_search' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_nova_search_no_canonical' );

/**
 * A menu link to the search page points at its address: the page is a draft (the path answers
 * through the search view above), and core drops a navigation link to an unpublished page.
 *
 * @param string   $content The rendered link ('' when core dropped it).
 * @param array    $parsed  The parsed block.
 * @param WP_Block $block   The block instance.
 * @return string
 */
function wp_ja_nova_search_link( string $content, array $parsed, $block = null ): string {
	$attrs = $parsed['attrs'] ?? array();
	if ( '' !== $content || 'post-type' !== ( $attrs['kind'] ?? '' ) || empty( $attrs['id'] ) || ! function_exists( 'render_block_core_navigation_link' ) ) {
		return $content;
	}
	$page = get_post( (int) $attrs['id'] );
	if ( ! $page instanceof WP_Post || 'publish' === $page->post_status || ! in_array( $page->post_name, WP_JA_NOVA_SEARCH_PATHS, true ) ) {
		return $content;
	}
	$attrs['kind'] = 'custom';
	$attrs['url']  = home_url( '/' . $page->post_name . '/' );
	unset( $attrs['id'] );
	return (string) render_block_core_navigation_link( $attrs, '', $block );
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_nova_search_link', 10, 3 );

/**
 * The address of the menu entry a post belongs to, the way Joomla picks the active menu item of an
 * article: a menu item that names the article itself (seeded as a redirect from its source path to
 * the post), else the listing the post is shown under (`/<listing>/<slug>`, see
 * wp_ja_nova_listing_post_request), else the listing page of the post's own category that names
 * the fewest categories, the front page excepted (its news band is a module beside the page, not the
 * category's listing; Joomla routes an article through its most specific category item; measured
 * 29/09 on the source: article 42 is linked and marked as "Project Detail", a branding project as
 * "Branding", a blog post as "Blog"). Core marks a link current only by the id of the queried
 * object, and these entries are custom links or listing pages, so no entry was marked on a post.
 *
 * @return string The entry's path without trailing slash, '' when the request is not a post.
 */
function wp_ja_nova_post_menu_path(): string {
	static $path = null;
	if ( null !== $path ) {
		return $path;
	}
	$path = '';
	if ( is_search() ) {
		// The search view answers at the Smart Search menu entry's address, so that entry is the current item.
		$path = '/' . WP_JA_NOVA_SEARCH_PATHS[0];
		return $path;
	}
	if ( ! is_singular( 'post' ) ) {
		return $path;
	}
	$post = get_queried_object();
	$own  = wp_ja_nova_site_path( (string) get_permalink( $post ) );
	$path  = wp_ja_nova_redirect_from( $own );
	if ( '' !== $path ) {
		return $path;
	}
	global $wp;
	if ( get_query_var( 'wp_ja_nova_listing_post' ) && isset( $wp->request ) ) {
		$path = '/' . trim( dirname( trim( (string) $wp->request, '/' ) ), '/' );
		return $path;
	}
	$categories = wp_get_post_categories( $post->ID );
	$best       = null;
	$pages      = get_posts(
		array(
			'post_type'   => 'page',
			'post_status' => 'publish',
			'numberposts' => -1,
			'exclude'     => array( (int) get_option( 'page_on_front' ) ),
			'orderby'     => array(
				'menu_order' => 'ASC',
				'ID'         => 'ASC',
			),
		)
	);
	foreach ( $pages as $page ) {
		$names = wp_ja_nova_listing_categories( parse_blocks( $page->post_content ) );
		if ( $names && array_intersect( $categories, $names ) && ( null === $best || count( $names ) < $best[1] ) ) {
			$best = array( $page, count( $names ) );
		}
	}
	if ( $best ) {
		$path = '/' . get_page_uri( $best[0] );
	}
	return $path;
}

/**
 * A URL's path under the site's home, without trailing slash ('' for the home itself).
 *
 * @param string $url An absolute or root-relative URL.
 * @return string
 */
function wp_ja_nova_site_path( string $url ): string {
	$home = untrailingslashit( (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ) );
	$path = (string) wp_parse_url( $url, PHP_URL_PATH );
	if ( '' !== $home && str_starts_with( $path, $home ) ) {
		$path = substr( $path, strlen( $home ) );
	}
	return untrailingslashit( $path );
}

/**
 * The source path a seeded redirect sends to a post's own path (a menu item naming the article).
 *
 * @param string $own The post's path under the site's home.
 * @return string The source path without trailing slash, '' when no redirect names the post.
 */
function wp_ja_nova_redirect_from( string $own ): string {
	$rules = get_option( 'wp_ja_nova_redirects' );
	if ( is_string( $rules ) ) {
		$rules = json_decode( $rules, true );
	}
	foreach ( is_array( $rules ) ? $rules : array() as $rule ) {
		if ( ! empty( $rule['from'] ) && ! empty( $rule['to'] ) && untrailingslashit( (string) $rule['to'] ) === $own ) {
			return untrailingslashit( (string) $rule['from'] );
		}
	}
	return '';
}

/**
 * The published post a seeded redirect sends a source path to, if the rule's target is a post's own
 * path; null for any other rule or path.
 *
 * @param string $from A path under the site's home.
 * @return WP_Post|null
 */
function wp_ja_nova_redirect_post( string $from ): ?WP_Post {
	$rules = get_option( 'wp_ja_nova_redirects' );
	if ( is_string( $rules ) ) {
		$rules = json_decode( $rules, true );
	}
	foreach ( is_array( $rules ) ? $rules : array() as $rule ) {
		if ( empty( $rule['from'] ) || empty( $rule['to'] ) || untrailingslashit( (string) $rule['from'] ) !== untrailingslashit( $from ) ) {
			continue;
		}
		$to = trim( (string) $rule['to'], '/' );
		if ( '' === $to || false !== strpos( $to, '/' ) ) {
			return null;
		}
		$posts = get_posts(
			array(
				'name'        => sanitize_title( $to ),
				'post_type'   => 'post',
				'post_status' => 'publish',
				'numberposts' => 1,
			)
		);
		return $posts ? $posts[0] : null;
	}
	return null;
}

/**
 * The words of the menu entries by the path they link to, from every published navigation post
 * (first entry wins): an owner who renames an entry renames its place in the trail too.
 *
 * @return array<string,string> Path under the site's home => label.
 */
function wp_ja_nova_menu_labels(): array {
	static $labels = null;
	if ( null !== $labels ) {
		return $labels;
	}
	$labels = array();
	$walk   = static function ( array $blocks ) use ( &$walk, &$labels ) {
		foreach ( $blocks as $b ) {
			if ( in_array( $b['blockName'] ?? '', array( 'core/navigation-link', 'core/navigation-submenu' ), true ) ) {
				$url   = (string) ( $b['attrs']['url'] ?? '' );
				$label = trim( wp_strip_all_tags( (string) ( $b['attrs']['label'] ?? '' ) ) );
				if ( '' === $url && ! empty( $b['attrs']['id'] ) ) {
					$url = (string) get_permalink( (int) $b['attrs']['id'] );
				}
				if ( '' !== $url && '' !== $label ) {
					$path = wp_ja_nova_site_path( $url );
					if ( '' !== $path && ! isset( $labels[ $path ] ) ) {
						$labels[ $path ] = $label;
					}
				}
			}
			$walk( $b['innerBlocks'] ?? array() );
		}
	};
	$navs = get_posts(
		array(
			'post_type'   => 'wp_navigation',
			'post_status' => 'publish',
			'numberposts' => -1,
			'orderby'     => 'ID',
			'order'       => 'ASC',
		)
	);
	foreach ( $navs as $nav ) {
		$walk( parse_blocks( $nav->post_content ) );
	}
	return $labels;
}

/**
 * A post's breadcrumb follows the menu, as Joomla's does: Home, then each menu entry on the path of
 * the post's menu entry (wp_ja_nova_post_menu_path), then the post's title — except when the entry
 * names the article itself, which ends the trail (the source reads "Home › Blog Detail", not the
 * category and title). A path segment no entry links is left out, as Joomla has no item there.
 * Measured 30/09 on the source: /blog-detail "Home › Blog Detail", /project/project-detail
 * "Home › Project › Project Detail", a blog post "Home › Category Blog › <title>".
 *
 * @param array[] $items Breadcrumb items (label, url, allow_html).
 * @return array[]
 */
function wp_ja_nova_post_breadcrumbs( array $items ): array {
	if ( ! is_singular( 'post' ) || empty( $items ) ) {
		return $items;
	}
	$path = wp_ja_nova_post_menu_path();
	if ( '' === $path ) {
		return $items;
	}
	$labels = wp_ja_nova_menu_labels();
	$own    = '' !== wp_ja_nova_redirect_from( wp_ja_nova_site_path( (string) get_permalink( get_queried_object() ) ) );
	$trail  = array( $items[0] );
	$prefix = '';
	$parts  = array_values( array_filter( explode( '/', $path ), 'strlen' ) );
	$own_path = wp_ja_nova_site_path( (string) get_permalink( get_queried_object() ) );
	foreach ( $parts as $i => $part ) {
		$prefix .= '/' . $part;
		$last    = $own && count( $parts ) - 1 === $i;
		// The entry that names the article may link its permalink rather than the source path the redirect starts from.
		$label = $labels[ $prefix ] ?? ( $last ? ( $labels[ $own_path ] ?? null ) : null );
		if ( null === $label ) {
			continue;
		}
		$trail[] = $last ? array( 'label' => $label ) : array(
			'label' => $label,
			'url'   => home_url( $prefix . '/' ),
		);
	}
	if ( ! $own ) {
		$trail[] = $items[ count( $items ) - 1 ]; // Core's own crumb of the post: its title.
	}
	return count( $trail ) > 1 ? $trail : $items;
}
add_filter( 'block_core_breadcrumbs_items', 'wp_ja_nova_post_breadcrumbs' );

/**
 * Marks the menu entry of the post being read as the current item (class and aria-current), so the
 * entry and its parent submenu (core adds `current-menu-ancestor` when an inner link carries
 * `current-menu-item`) are highlighted as on the source.
 *
 * @param string $content The rendered link.
 * @return string
 */
function wp_ja_nova_post_menu_current( string $content ): string {
	if ( '' === $content || false !== strpos( $content, 'current-menu-item' ) ) {
		return $content;
	}
	$target = wp_ja_nova_post_menu_path();
	if ( '' === $target ) {
		return $content;
	}
	$tags = new WP_HTML_Tag_Processor( $content );
	if ( ! $tags->next_tag( 'li' ) ) {
		return $content;
	}
	$tags->set_bookmark( 'item' );
	if ( ! $tags->next_tag( 'a' ) ) {
		return $content;
	}
	$href = (string) $tags->get_attribute( 'href' );
	$host = wp_parse_url( $href, PHP_URL_HOST );
	if ( $host && wp_parse_url( home_url(), PHP_URL_HOST ) !== $host ) {
		return $content;
	}
	$home = untrailingslashit( (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ) );
	$link = untrailingslashit( substr( (string) wp_parse_url( $href, PHP_URL_PATH ), strlen( $home ) ) );
	if ( $link !== $target ) {
		return $content;
	}
	$tags->set_attribute( 'aria-current', 'page' );
	$tags->seek( 'item' );
	$tags->add_class( 'current-menu-item' );
	return $tags->get_updated_html();
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_nova_post_menu_current', 20 );

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
function wp_ja_nova_listing_post_request( array $vars ): array {
	// The matched path, not `pagename`: with /%postname%/ a two-segment path is first taken by the
	// attachment rule (`[^/]+/([^/]+)/?$`, measured 26/09), so `pagename` is never set for it.
	global $wp;
	$path = isset( $wp->request ) ? trim( (string) $wp->request, '/' ) : '';
	if ( is_admin() || '' === $path || isset( $vars['rest_route'] ) ) {
		return $vars;
	}
	if ( get_page_by_path( $path ) instanceof WP_Post ) {
		return $vars;
	}
	// A menu item that names the article itself (seeded as a redirect from its source path to the
	// post): the source answers that path with the article, 200 (/blog-detail, measured 30/09).
	$menu = wp_ja_nova_redirect_post( '/' . $path );
	if ( $menu ) {
		return array(
			'name'                    => $menu->post_name,
			'wp_ja_nova_listing_post' => 1,
		);
	}
	if ( false === strpos( $path, '/' ) ) {
		return $vars;
	}
	$slug   = basename( $path );
	$parent = get_page_by_path( dirname( $path ) );
	if ( ! $parent instanceof WP_Post || 'publish' !== $parent->post_status ) {
		return $vars;
	}
	$categories = wp_ja_nova_listing_categories( parse_blocks( $parent->post_content ) );
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
		'wp_ja_nova_listing_post' => 1,
	);
}
add_filter( 'request', 'wp_ja_nova_listing_post_request' );

/**
 * The categories a listing page shows: those named by the post queries in its blocks, by id
 * (`taxQuery.category`, what the seeder writes and the editor sets) or by slug
 * (`wpJaNovaCategory`). A page without such a query is not a listing and names none.
 *
 * @param array $blocks Parsed blocks.
 * @return int[]
 */
function wp_ja_nova_listing_categories( array $blocks ): array {
	$ids = array();
	foreach ( $blocks as $block ) {
		$query = $block['attrs']['query'] ?? null;
		if ( 'core/query' === ( $block['blockName'] ?? '' ) && is_array( $query ) && 'post' === ( $query['postType'] ?? 'post' ) ) {
			foreach ( (array) ( $query['taxQuery']['category'] ?? array() ) as $id ) {
				$ids[] = (int) $id;
			}
			if ( ! empty( $query['wpJaNovaCategory'] ) ) {
				$term = get_term_by( 'slug', sanitize_title( (string) $query['wpJaNovaCategory'] ), 'category' );
				if ( $term ) {
					$ids[] = (int) $term->term_id;
				}
			}
		}
		if ( ! empty( $block['innerBlocks'] ) ) {
			$ids = array_merge( $ids, wp_ja_nova_listing_categories( $block['innerBlocks'] ) );
		}
	}
	return array_values( array_unique( array_filter( $ids ) ) );
}

/**
 * @param string[] $vars The public query variables.
 * @return string[]
 */
function wp_ja_nova_listing_post_var( array $vars ): array {
	$vars[] = 'wp_ja_nova_listing_post';
	return $vars;
}
add_filter( 'query_vars', 'wp_ja_nova_listing_post_var' );

/**
 * No canonical redirect away from the source's address of a post.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_nova_listing_post_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_nova_listing_post' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_nova_listing_post_no_canonical' );

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
function wp_ja_nova_no_attachment_pages(): void {
	if ( is_admin() || ! is_attachment() ) {
		return;
	}
	global $wp_query, $post;
	$wp_query->set_404();
	$wp_query->set( 'wp_ja_nova_attachment_404', 1 );
	// set_404() keeps the found attachment as the query's post; the 404 page's own words then went
	// through the_content with the picture prepended (prepend_attachment, measured M4b on /404).
	$wp_query->posts      = array();
	$wp_query->post_count = 0;
	$wp_query->post       = null;
	$post                 = null; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- the 404 has no post.
	status_header( 404 );
	nocache_headers();
}
add_action( 'template_redirect', 'wp_ja_nova_no_attachment_pages', 1 );

/**
 * No canonical redirect for an attachment path turned into a 404 above.
 *
 * @param string|false $redirect_url The redirect WordPress chose.
 * @return string|false
 */
function wp_ja_nova_attachment_404_no_canonical( $redirect_url ) {
	return get_query_var( 'wp_ja_nova_attachment_404' ) ? false : $redirect_url;
}
add_filter( 'redirect_canonical', 'wp_ja_nova_attachment_404_no_canonical' );

/**
 * Redirects the seeder recorded in the `wp_ja_nova_redirects` option. Exact path match only,
 * query string carried over, and never for a request WordPress already resolved: a stale rule
 * must not shadow a page the owner later creates at that path.
 */
function wp_ja_nova_redirects(): void {
	if ( is_admin() || ! is_404() || ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return;
	}
	$rules = get_option( 'wp_ja_nova_redirects' );
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
add_action( 'template_redirect', 'wp_ja_nova_redirects' );

/**
 * The 404 page's own words: the seeder keeps the source's "not found" page as a draft (so the
 * path answers 404) and records it in `wp_ja_nova_404_page`; the template's group named
 * `404.body` renders that page's content, and the template's generic text stays as the fallback.
 * JA Nova's source has no such page (its 404 is Joomla's error.php), so the spec-pack carries a
 * path-less 404 page with error.php's words (tasks/ja-nova-wp7 fix-spec S-13): they stay editable, not baked.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_nova_404_body( string $content, array $block ): string {
	if ( ! is_404() || '404.body' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) {
		return $content;
	}
	$page = get_post( (int) get_option( 'wp_ja_nova_404_page' ) );
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
add_filter( 'render_block_core/group', 'wp_ja_nova_404_body', 10, 2 );

/**
 * The masthead heading. The seeder files a page under its menu word and keeps the heading the
 * source's masthead prints in `tracy_page_heading` ("Who We Are" on the page the menu calls
 * "About Us"); the title block named `page.title` prints that heading when the page has one.
 *
 * @param string $content The rendered post title block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_nova_page_heading( string $content, array $block ): string {
	if ( 'page.title' !== ( $block['attrs']['metadata']['name'] ?? '' ) || ! is_page() ) {
		return $content;
	}
	$heading = trim( (string) get_post_meta( get_queried_object_id(), 'tracy_page_heading', true ) );
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
add_filter( 'render_block_core/post-title', 'wp_ja_nova_page_heading', 10, 2 );

/**
 * The account page answers a visitor who is not signed in as the source does: Joomla's user profile
 * (com_users profile view, /user-profile) sends a guest to its login page with a 303. The page holds
 * nothing for a guest, and the seeder probes this answer (patterns.map.json `views.page-account.expect`).
 * A signed-in visitor sees the page.
 */
const WP_JA_NOVA_ACCOUNT_PATHS = array( 'user-profile' );

function wp_ja_nova_account_redirect(): void {
	if ( is_user_logged_in() || ! is_page() ) {
		return;
	}
	$slug = (string) get_post_field( 'post_name', get_queried_object_id() );
	if ( ! in_array( $slug, WP_JA_NOVA_ACCOUNT_PATHS, true ) ) {
		return;
	}
	$login = get_page_by_path( 'login-form' );
	$to    = ( $login && 'publish' === $login->post_status ) ? get_permalink( $login ) : wp_login_url();
	wp_safe_redirect( $to, 303 );
	exit;
}
add_action( 'template_redirect', 'wp_ja_nova_account_redirect', 5 );

/**
 * A project card closes with the client name and the budget, as the source's project category
 * blog prints them (`footer-info`). Both are post meta of the project (`prj-client-name`,
 * `prj-budget`, editable in the post's custom fields); a card whose post has neither prints
 * nothing extra. The listings under the Project page and the related projects under a project
 * article carry them.
 *
 * @param string   $content The rendered excerpt.
 * @param array    $parsed  The parsed block.
 * @param WP_Block $block   The block instance (its context names the post).
 * @return string
 */
function wp_ja_nova_project_card_meta( string $content, array $parsed, $block ): string {
	$parent  = is_page() ? (int) wp_get_post_parent_id( get_queried_object_id() ) : 0;
	$listing = $parent && 'project' === get_post_field( 'post_name', $parent );
	// The related projects under a project article are the same cards (Joomla's related items, project layout).
	$related = is_singular( 'post' ) && str_contains( (string) ( $parsed['attrs']['className'] ?? '' ), 'jn-related__excerpt' ) && wp_ja_nova_is_project_post( get_queried_object_id() );
	// The tabs on the Project page itself (pattern section-project-tabs) print the same cards.
	$tabs = str_contains( (string) ( $parsed['attrs']['className'] ?? '' ), 'jn-ptabs__excerpt' );
	if ( ! $listing && ! $related && ! $tabs ) {
		return $content;
	}
	$post_id = (int) ( $block->context['postId'] ?? 0 );
	if ( ! $post_id ) {
		return $content;
	}
	$fields = array(
		'client-name' => array( 'prj-client-name', __( 'Client name', 'wp-ja-nova' ) ),
		'item-budget' => array( 'prj-budget', __( 'Budget', 'wp-ja-nova' ) ),
	);
	$items  = '';
	foreach ( $fields as $class => list( $key, $label ) ) {
		$value = trim( (string) get_post_meta( $post_id, $key, true ) );
		if ( '' === $value ) {
			continue;
		}
		$items .= '<div class="jn-card-info__' . esc_attr( $class ) . '"><h5>' . esc_html( $label ) . '</h5><p>' . esc_html( $value ) . '</p></div>';
	}
	return '' === $items ? $content : $content . '<div class="jn-card-info">' . $items . '</div>';
}
add_filter( 'render_block_core/post-excerpt', 'wp_ja_nova_project_card_meta', 10, 3 );

/**
 * The source's project category layout opens the listing with the category name as a centred
 * heading (the blog category layout does not). The listing pages under the Project page print
 * their own title above their content, so renaming the page renames the heading.
 *
 * @param string $content The rendered post content block.
 * @return string
 */
function wp_ja_nova_project_list_heading( string $content ): string {
	if ( ! is_page() ) {
		return $content;
	}
	$page   = get_queried_object_id();
	$parent = (int) wp_get_post_parent_id( $page );
	if ( ! $parent || 'project' !== get_post_field( 'post_name', $parent ) ) {
		return $content;
	}
	return '<h1 class="jn-list-title">' . esc_html( get_the_title( $page ) ) . '</h1>' . $content;
}
add_filter( 'render_block_core/post-content', 'wp_ja_nova_project_list_heading' );

/**
 * One heading of level 1 per page. Most source pages have none (Joomla prints the menu title in the
 * breadcrumb band, or the component view shows its title as a smaller heading), so the look stays the
 * source's while the page gets a hidden level-1 heading naming it, for screen readers and outlines.
 * Pages whose content or template already prints one are left alone.
 *
 * @param string $label The page's name.
 * @return string
 */
function wp_ja_nova_hidden_heading( string $label ): string {
	return '<h1 class="screen-reader-text jn-page-heading">' . esc_html( $label ) . '</h1>';
}

/**
 * @param string $content The rendered post content block.
 * @return string
 */
function wp_ja_nova_page_level_heading( string $content ): string {
	if ( ! is_page() || false !== stripos( $content, '<h1' ) || 'page-service' === get_page_template_slug( get_queried_object_id() ) ) {
		return $content;
	}
	if ( (int) get_the_ID() !== (int) get_queried_object_id() ) {
		return $content;
	}
	return wp_ja_nova_hidden_heading( get_the_title( get_queried_object_id() ) ) . $content;
}
add_filter( 'render_block_core/post-content', 'wp_ja_nova_page_level_heading', 20 );

/**
 * The search view and the error page: the same hidden level-1 heading, after the breadcrumb band of
 * the search view and before the error code of the 404 page.
 *
 * @param string $content The rendered block.
 * @param array  $block   The block.
 * @return string
 */
function wp_ja_nova_view_heading( string $content, array $block ): string {
	if ( 'core/breadcrumbs' === $block['blockName'] && is_search() ) {
		return $content . wp_ja_nova_hidden_heading( __( 'Smart Search', 'wp-ja-nova' ) );
	}
	if ( 'core/paragraph' === $block['blockName'] && is_404() && false !== strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jn-404__code' ) ) {
		return wp_ja_nova_hidden_heading( __( 'Page not found', 'wp-ja-nova' ) ) . $content;
	}
	return $content;
}
add_filter( 'render_block', 'wp_ja_nova_view_heading', 10, 2 );

/**
 * The source shortens card texts by characters, not words: the news module keeps 100 characters
 * cut back to a whole word and closed by "..." (Joomla's string.truncate), the related-items
 * module keeps the first 150 characters as they fall and closes them with " ...", the latest-posts
 * module 140 (its first item) or 70. Core's excerpt
 * block counts words and closes with an ellipsis character, so the two cards are rewritten from
 * the post's own excerpt; the text stays the post's, edited in the post.
 *
 * @param string   $content The rendered excerpt.
 * @param array    $parsed  The parsed block.
 * @param WP_Block $block   The block instance (its context names the post).
 * @return string
 */
function wp_ja_nova_card_excerpt( string $content, array $parsed, $block ): string {
	$class = (string) ( $parsed['attrs']['className'] ?? '' );
	$mode  = str_contains( $class, 'jn-news__excerpt' ) ? 'news' : ( str_contains( $class, 'jn-related__excerpt' ) ? 'related' : ( str_contains( $class, 'jn-latest__excerpt' ) ? 'latest' : '' ) );
	$post  = (int) ( $block->context['postId'] ?? 0 );
	if ( '' === $mode || ! $post ) {
		return $content;
	}
	$text = trim( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( html_entity_decode( get_the_excerpt( $post ), ENT_QUOTES, 'UTF-8' ) ) ) );
	$text = trim( preg_replace( '/\s*(\[&hellip;\]|\[…\]|&hellip;|…)$/u', '', $text ) );
	if ( 'latest' === $mode ) {
		// The latest-posts module keeps 140 characters of its first (large) item and 70 of the others.
		static $latest = 0;
		$keep  = 0 === $latest++ ? 140 : 70;
		$short = mb_strlen( $text ) > $keep ? mb_substr( $text, 0, $keep ) . ' ...' : $text;
	} elseif ( 'related' === $mode ) {
		$short = mb_strlen( $text ) > 150 ? mb_substr( $text, 0, 150 ) . ' ...' : $text;
	} elseif ( mb_strlen( $text ) > 100 ) {
		$short = mb_substr( $text, 0, 100 );
		$short = mb_substr( $short, 0, (int) mb_strrpos( $short, ' ' ) + 1 );
		if ( mb_strlen( $short ) > 97 ) {
			$short = trim( mb_substr( $short, 0, (int) mb_strrpos( rtrim( $short ), ' ' ) ) );
		}
		$short = rtrim( $short ) . '...';
	} else {
		$short = $text;
	}
	$out = preg_replace_callback(
		'#(<p class="wp-block-post-excerpt__excerpt">)(.*?)(</p>)#s',
		// The dots are entities, so no text filter can join them into one ellipsis character.
		static fn( $m ) => $m[1] . str_replace( '...', '&#46;&#46;&#46;', esc_html( $short ) ) . $m[3],
		$content,
		1
	);
	return is_string( $out ) ? $out : $content;
}
add_filter( 'render_block_core/post-excerpt', 'wp_ja_nova_card_excerpt', 9, 3 );

/**
 * A navigation block the theme names `nav.<menutype>` (its metadata name) and that carries no `ref`
 * shows the navigation post of that slug. The seeder fills the refs of the header and footer parts
 * only; a template's menu (the services sidebar of page-service) is found here, by the same name, so
 * the owner edits it as a menu and core never falls back to the newest navigation post.
 *
 * @param array $parsed The parsed block.
 * @return array
 */
function wp_ja_nova_named_navigation( array $parsed ): array {
	if ( 'core/navigation' !== ( $parsed['blockName'] ?? '' ) || ! empty( $parsed['attrs']['ref'] ) ) {
		return $parsed;
	}
	$name = (string) ( $parsed['attrs']['metadata']['name'] ?? '' );
	if ( ! preg_match( '/^nav\.([a-z0-9_-]+)$/', $name, $m ) ) {
		return $parsed;
	}
	$nav = get_page_by_path( $m[1], OBJECT, 'wp_navigation' );
	if ( $nav instanceof WP_Post && 'publish' === $nav->post_status ) {
		$parsed['attrs']['ref'] = (int) $nav->ID;
	}
	return $parsed;
}
add_filter( 'render_block_data', 'wp_ja_nova_named_navigation' );

/**
 * The pages a navigation post links to, in its order (nested links included).
 *
 * @param string $slug The navigation post's slug.
 * @return int[]
 */
function wp_ja_nova_menu_page_ids( string $slug ): array {
	$nav = get_page_by_path( $slug, OBJECT, 'wp_navigation' );
	if ( ! $nav instanceof WP_Post ) {
		return array();
	}
	$ids  = array();
	$walk = static function ( array $blocks ) use ( &$walk, &$ids ) {
		foreach ( $blocks as $b ) {
			if ( in_array( $b['blockName'] ?? '', array( 'core/navigation-link', 'core/navigation-submenu' ), true ) && 'page' === ( $b['attrs']['type'] ?? '' ) && ! empty( $b['attrs']['id'] ) ) {
				$ids[] = (int) $b['attrs']['id'];
			}
			$walk( $b['innerBlocks'] ?? array() );
		}
	};
	$walk( parse_blocks( $nav->post_content ) );
	return $ids;
}

/**
 * Prev / Next step through the source's lists, not through dates. Joomla's article navigation follows
 * the order of the article's category: on a post that is the category's blog list, newest first, so
 * Prev is the newer post and Next the older one (core does the reverse); on a service page it is the
 * order the services menu lists (core would step through every page of the site by date). The first
 * entry has no Prev, the last no Next.
 *
 * @param string $content The rendered link.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_nova_neighbours( string $content, array $parsed ): string {
	$attrs = $parsed['attrs'] ?? array();
	$type  = 'previous' === ( $attrs['type'] ?? 'next' ) ? 'previous' : 'next';
	if ( is_singular( 'post' ) ) {
		$post   = get_adjacent_post( true, '', 'next' === $type, 'category' );
		$target = $post instanceof WP_Post ? (int) $post->ID : 0;
	} elseif ( is_page() && 'page-service' === get_page_template_slug( get_queried_object_id() ) ) {
		$ids  = wp_ja_nova_menu_page_ids( 'services' );
		$here = array_search( get_queried_object_id(), $ids, true );
		if ( false === $here ) {
			return '';
		}
		$target = $ids[ $here + ( 'next' === $type ? 1 : -1 ) ] ?? 0;
	} else {
		return $content;
	}
	if ( ! $target || 'publish' !== get_post_status( $target ) ) {
		return '';
	}
	$label = esc_html( '' !== (string) ( $attrs['label'] ?? '' ) ? (string) $attrs['label'] : get_the_title( $target ) );
	// The chevron is drawn by the stylesheet inside the link, as the source's icon: the link reads its label only.
	$link = sprintf( '<a href="%s" rel="%s">%s</a>', esc_url( get_permalink( $target ) ), 'next' === $type ? 'next' : 'prev', $label );
	$class = trim( 'post-navigation-link-' . $type . ' ' . ( $attrs['className'] ?? '' ) . ' wp-block-post-navigation-link' );
	return sprintf( '<div class="%s">%s</div>', esc_attr( $class ), $link );
}
add_filter( 'render_block_core/post-navigation-link', 'wp_ja_nova_neighbours', 10, 2 );

/**
 * Whether the template being served draws the content inside a `jn-main-body` column whose trailing
 * layout rows belong after it: single.html, page.html and the templates built on it (service,
 * sign-in, registration, account, contact). Read from the template WordPress resolved for this
 * request, not from the page's template setting: the front page is drawn by front-page.html whatever
 * its page says, and its sections are the whole page.
 *
 * @return bool
 */
function wp_ja_nova_holds_sections(): bool {
	global $_wp_current_template_id;
	$slug = is_string( $_wp_current_template_id ) ? substr( (string) strrchr( '/' . $_wp_current_template_id, '/' ), 1 ) : '';
	return in_array( $slug, array( 'single', 'single-project', 'page', 'page-service', 'page-login', 'page-register', 'page-account', 'page-contact' ), true );
}

/**
 * The sections a page's content ends with — the rows the source draws after its main body (an FAQ,
 * a call to action, related posts) — are printed after that main body, full width, as the source
 * draws them, rather than inside the content column. They stay content: the owner edits them in the
 * page like any block. While the post content of an article view renders, a top-level block carrying
 * `jn-sec` is marked here, held back by wp_ja_nova_hold_section and printed by
 * wp_ja_nova_print_sections after the `jn-main-body` group — or, should an edited template have lost
 * that group, before the footer, so a held section is never dropped.
 *
 * @param array         $parsed The parsed block.
 * @param array         $source The block as parsed from the content.
 * @param WP_Block|null $parent The parent block, null at the top level.
 * @return array
 */
function wp_ja_nova_mark_section( array $parsed, array $source = array(), $parent = null ): array {
	if ( null !== $parent || ! doing_filter( 'the_content' ) || ! wp_ja_nova_holds_sections() ) {
		return $parsed;
	}
	if ( get_the_ID() !== get_queried_object_id() ) {
		return $parsed;
	}
	// Sections before the first other block open the page (a listing's modules above its list) and
	// are printed before the main body; the rest close it and are printed after.
	static $body_seen = false;
	if ( in_array( 'jn-sec', preg_split( '/\s+/', (string) ( $parsed['attrs']['className'] ?? '' ) ), true ) ) {
		// The shared call to action sits in the layout's last row (section-12) wherever the seeder put it.
		$last                            = WP_JA_NOVA_SHARED_CTA === ( $parsed['attrs']['anchor'] ?? '' );
		$parsed['attrs']['wpJaNovaHeld'] = $body_seen || $last ? 'trail' : 'lead';
	} elseif ( null !== ( $parsed['blockName'] ?? null ) && 'tracy-base/slot' !== $parsed['blockName'] ) {
		$body_seen = true;
	}
	return $parsed;
}
add_filter( 'render_block_data', 'wp_ja_nova_mark_section', 10, 3 );

/**
 * The held sections, in content order: `lead` (before the main body) or `trail` (after it).
 *
 * @param string|null $html  A section to hold; null to take (and clear) what is held.
 * @param string      $where Which of the two.
 * @return string
 */
function wp_ja_nova_held_sections( ?string $html = null, string $where = 'trail' ): string {
	static $held = array(
		'lead'  => '',
		'trail' => '',
	);
	if ( null !== $html ) {
		$held[ $where ] .= $html;
		return '';
	}
	$out            = $held[ $where ];
	$held[ $where ] = '';
	return $out;
}

/**
 * Hold a marked section back (see wp_ja_nova_mark_section).
 *
 * @param string $content The rendered block.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_nova_hold_section( string $content, array $parsed ): string {
	if ( empty( $parsed['attrs']['wpJaNovaHeld'] ) ) {
		return $content;
	}
	return wp_ja_nova_held_sections( $content, 'lead' === $parsed['attrs']['wpJaNovaHeld'] ? 'lead' : 'trail' );
}
add_filter( 'render_block', 'wp_ja_nova_hold_section', 10, 2 );

/**
 * Print the held sections after the article's main body.
 *
 * @param string $content The rendered group.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_nova_print_sections( string $content, array $parsed ): string {
	if ( doing_filter( 'the_content' ) || ! in_array( 'jn-main-body', preg_split( '/\s+/', (string) ( $parsed['attrs']['className'] ?? '' ) ), true ) ) {
		return $content;
	}
	return wp_ja_nova_held_sections( null, 'lead' ) . $content . wp_ja_nova_held_sections( null, 'trail' );
}
add_filter( 'render_block_core/group', 'wp_ja_nova_print_sections', 10, 2 );

/**
 * The safety net of wp_ja_nova_print_sections: held sections still waiting when the footer part
 * renders are printed before it.
 *
 * @param string $content The rendered template part.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_nova_print_sections_before_footer( string $content, array $parsed ): string {
	if ( 'footer' !== ( $parsed['attrs']['slug'] ?? '' ) ) {
		return $content;
	}
	return wp_ja_nova_held_sections( null, 'lead' ) . wp_ja_nova_held_sections( null, 'trail' ) . wp_ja_nova_project_band() . wp_ja_nova_shared_cta() . $content;
}

/**
 * The anchor the seeder gives the recent-work module (Joomla module 138, "Check some of recent work",
 * position main-bottom-1 of the project layouts).
 */
const WP_JA_NOVA_PROJECT_BAND = 'acm-related-items-138';

/**
 * The recent-work band on the project listings. Joomla draws module 138 under every project category
 * list; outside an article it has no related items, so the source shows its title alone. The seeder
 * builds those listings from the archive template without the layout modules (S-20), so the band is
 * printed from the copy the project article holds (edited there, as the one module is edited once in
 * Joomla), minus its list of posts.
 *
 * @return string
 */
function wp_ja_nova_project_band(): string {
	if ( ! is_page() || ! in_array( 'jn-parent-project', get_body_class(), true ) || wp_ja_nova_project_band_seen() ) {
		return '';
	}
	$holders = get_posts(
		array(
			'post_type'        => 'post',
			'post_status'      => 'publish',
			's'                => WP_JA_NOVA_PROJECT_BAND,
			'posts_per_page'   => 1,
			'orderby'          => 'ID',
			'order'            => 'ASC',
			'suppress_filters' => true,
		)
	);
	if ( ! $holders ) {
		return '';
	}
	foreach ( parse_blocks( (string) $holders[0]->post_content ) as $block ) {
		if ( WP_JA_NOVA_PROJECT_BAND !== ( $block['attrs']['anchor'] ?? '' ) ) {
			continue;
		}
		$inner = $block['innerBlocks'][0] ?? null;
		if ( ! $inner ) {
			return '';
		}
		// Keep the heading group only: the list of related posts has nothing to relate to here.
		$kept                  = array( $inner['innerBlocks'][0] ?? $inner );
		$inner['innerBlocks']  = $kept;
		$inner['innerContent'] = array( $inner['innerContent'][0] ?? '', null, $inner['innerContent'][ count( $inner['innerContent'] ) - 1 ] ?? '' );
		$block['innerBlocks']  = array( $inner );
		$block['innerContent'] = array( $block['innerContent'][0] ?? '', null, $block['innerContent'][ count( $block['innerContent'] ) - 1 ] ?? '' );
		return str_replace( 'jn-related--projects', 'jn-related--projects jn-related--band', render_block( $block ) );
	}
	return '';
}

/**
 * Note that the recent-work band rendered on this request (from the page's own content), so a
 * listing that already holds it does not get a second copy under the main body.
 *
 * @param string $content The rendered block.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_nova_note_project_band( string $content, array $parsed ): string {
	if ( WP_JA_NOVA_PROJECT_BAND === ( $parsed['attrs']['anchor'] ?? '' ) ) {
		wp_ja_nova_project_band_seen( true );
	}
	return $content;
}
add_filter( 'render_block', 'wp_ja_nova_note_project_band', 9, 2 );

/**
 * @param bool $seen True to record that the band rendered.
 * @return bool Whether it rendered on this request.
 */
function wp_ja_nova_project_band_seen( bool $seen = false ): bool {
	static $rendered = false;
	$rendered = $rendered || $seen;
	return $rendered;
}

/**
 * The anchor the seeder gives the call to action the source assigns to every page (Joomla module
 * 131, "If you want to talk! We are here", position section-12 of both layouts).
 */
const WP_JA_NOVA_SHARED_CTA = 'acm-cta-131';

/**
 * Note that the shared call to action rendered on this request (from the page's own content).
 *
 * @param string $content The rendered block.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_nova_note_shared_cta( string $content, array $parsed ): string {
	if ( WP_JA_NOVA_SHARED_CTA === ( $parsed['attrs']['anchor'] ?? '' ) ) {
		wp_ja_nova_shared_cta_seen( true );
	}
	return $content;
}
add_filter( 'render_block', 'wp_ja_nova_note_shared_cta', 9, 2 );

/**
 * @param bool $seen True to record that the call to action rendered.
 * @return bool Whether it rendered on this request.
 */
function wp_ja_nova_shared_cta_seen( bool $seen = false ): bool {
	static $rendered = false;
	$rendered = $rendered || $seen;
	return $rendered;
}

/**
 * The call to action on a route whose content does not carry it. Joomla shows module 131 on every
 * route but the error page; the seeder writes a copy into each page it builds from a layout, but a
 * listing route (a category, tag or author list, the search page) gets its query only. Those routes,
 * and WordPress's own archives and search, print the copy the front page holds: it stays content,
 * edited on the front page, as the one module is edited once in Joomla. Nothing is printed on the
 * not-found page, when the front page has no such section, or when the page already drew one.
 *
 * @return string
 */
function wp_ja_nova_shared_cta(): string {
	if ( is_404() || wp_ja_nova_shared_cta_seen() ) {
		return '';
	}
	$front = (int) get_option( 'page_on_front' );
	if ( ! $front || $front === get_queried_object_id() || 'publish' !== get_post_status( $front ) ) {
		return '';
	}
	foreach ( parse_blocks( (string) get_post_field( 'post_content', $front ) ) as $block ) {
		if ( WP_JA_NOVA_SHARED_CTA === ( $block['attrs']['anchor'] ?? '' ) ) {
			return render_block( $block );
		}
	}
	return '';
}
add_filter( 'render_block_core/template-part', 'wp_ja_nova_print_sections_before_footer', 10, 2 );

/**
 * The sign-in form's words, as the source's form reads them (Joomla com_users login: "Username",
 * "Password", "Remember me", "Log in"). WordPress accepts a username or an email address in the
 * same field.
 *
 * @param array $defaults The wp_login_form() defaults.
 * @return array
 */
function wp_ja_nova_login_words( array $defaults ): array {
	return array_merge(
		$defaults,
		array(
			'label_username' => __( 'Username', 'wp-ja-nova' ),
			'label_password' => __( 'Password', 'wp-ja-nova' ),
			'label_remember' => __( 'Remember me', 'wp-ja-nova' ),
			'label_log_in'   => __( 'Log in', 'wp-ja-nova' ),
		)
	);
}
add_filter( 'login_form_defaults', 'wp_ja_nova_login_words' );

/**
 * The links under the sign-in form: the lost-password screen, and the site's registration page (the
 * page on template page-register) when there is one. The source's third link, a username reminder,
 * has no WordPress counterpart (DECISIONS D-07): the lost-password screen takes a username or email.
 *
 * @param string $html What the filter already holds.
 * @return string
 */
function wp_ja_nova_login_links( string $html ): string {
	$items = array( sprintf( '<li><a href="%s">%s</a></li>', esc_url( wp_lostpassword_url() ), esc_html__( 'Forgot your password?', 'wp-ja-nova' ) ) );
	$register = get_posts(
		array(
			'post_type'   => 'page',
			'post_status' => 'publish',
			'numberposts' => 1,
			'meta_key'    => '_wp_page_template', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_value'  => 'page-register', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			'fields'      => 'ids',
		)
	);
	if ( $register && wp_ja_nova_registration_open() ) {
		$items[] = sprintf( '<li><a href="%s">%s</a></li>', esc_url( get_permalink( $register[0] ) ), esc_html__( "Don't have an account?", 'wp-ja-nova' ) );
	}
	return $html . '<ul class="jn-login__links">' . implode( '', $items ) . '</ul>';
}
add_filter( 'login_form_bottom', 'wp_ja_nova_login_links' );

/**
 * The registration form on the page that uses template page-register, laid out as the source's Joomla
 * com_users registration form (legend "User Registration", "* Required field", label above field,
 * Register and Cancel) but with the two fields WordPress stores, Username and Email (DECISIONS D-17).
 * It posts to WordPress's own registration (`wp-login.php?action=register`): WordPress checks the
 * fields, sends the password by mail and redirects; `register_form` and `registration_redirect` still
 * run there. A signed-in visitor keeps the core block's own output (a "Log out" link).
 *
 * @param string $html  What the core Login/out block printed.
 * @param array  $block Parsed block.
 * @return string
 */
function wp_ja_nova_register_form( string $html, array $block ): string {
	if ( is_user_logged_in() || ! is_singular( 'page' ) || 'page-register' !== get_page_template_slug() ) {
		return $html;
	}
	ob_start();
	do_action( 'register_form' );
	$extra = (string) ob_get_clean();
	$row   = static function ( string $id, string $name, string $type, string $label, string $auto ): string {
		return sprintf(
			'<div class="jn-reg__group"><label for="%1$s">%3$s<span class="jn-reg__star" aria-hidden="true">&#160;*</span></label><input type="%2$s" name="%4$s" id="%1$s" class="input" size="30" autocomplete="%5$s" required></div>',
			esc_attr( $id ),
			esc_attr( $type ),
			esc_html( $label ),
			esc_attr( $name ),
			esc_attr( $auto )
		);
	};
	return sprintf(
		'<form id="registerform" class="jn-reg" name="registerform" action="%1$s" method="post" novalidate><fieldset><legend>%2$s</legend><div class="jn-reg__group jn-reg__note"><span><strong class="jn-reg__required">*</strong> %3$s</span></div>%4$s%5$s%6$s<input type="hidden" name="redirect_to" value="%10$s"><div class="jn-reg__submit"><button type="submit" name="wp-submit" id="wp-submit" class="jn-reg__register">%7$s</button><a class="jn-reg__cancel" href="%8$s" title="%9$s">%9$s</a></div></fieldset></form>',
		esc_url( site_url( 'wp-login.php?action=register', 'login_post' ) ),
		esc_html__( 'User Registration', 'wp-ja-nova' ),
		esc_html__( 'Required field', 'wp-ja-nova' ),
		$row( 'user_login', 'user_login', 'text', __( 'Username', 'wp-ja-nova' ), 'username' ),
		$row( 'user_email', 'user_email', 'email', __( 'Email Address', 'wp-ja-nova' ), 'email' ),
		$extra,
		esc_html__( 'Register', 'wp-ja-nova' ),
		esc_url( home_url( '/' ) ),
		esc_html__( 'Cancel', 'wp-ja-nova' ),
		esc_url( wp_ja_nova_registration_redirect( '' ) )
	);
}
add_filter( 'render_block_core/loginout', 'wp_ja_nova_register_form', 10, 2 );

/**
 * Joomla prints a category blog's "Page N of M" counter beside the pager's `<nav>`, not inside it
 * (`com-content-category-blog__navigation` holds the pagination and the counter as siblings). The
 * pager plugin the seeder installs writes the counter as the last child of the `<nav>`; it is moved
 * after it here, both wrapped in one row that lays them out as the plugin's `<nav>` did.
 *
 * @param string $content The rendered pager.
 * @return string
 */
function wp_ja_nova_pager_counter( string $content ): string {
	if ( ! str_contains( $content, 'tracy-pager__counter' ) ) {
		return $content;
	}
	if ( ! preg_match( '#^(\s*<nav\b[^>]*>)(.*)(<p class="tracy-pager__counter">.*?</p>)\s*</nav>\s*$#s', $content, $m ) ) {
		return $content;
	}
	return '<div class="jn-pager-row">' . $m[1] . $m[2] . '</nav>' . $m[3] . '</div>';
}
add_filter( 'render_block_core/query-pagination', 'wp_ja_nova_pager_counter', 20 );

/**
 * The blog listings (the category blog, the featured articles) whose seeded cards carry the posts'
 * category name as an eyebrow: Joomla's category blog prints the publishing date there instead
 * (`dd.published`: "July 11, 2023"), no category. The eyebrow of those cards renders as the post's
 * date; the card itself stays the seeded query block the owner edits.
 */
const WP_JA_NOVA_BLOG_LISTINGS = array( 'category-blog', 'featured-articles' );

/**
 * @param string   $content The rendered post terms.
 * @param array    $parsed  The parsed block.
 * @param WP_Block $block   The block instance.
 * @return string
 */
function wp_ja_nova_card_date( string $content, array $parsed, $block ): string {
	if ( ! is_page( WP_JA_NOVA_BLOG_LISTINGS ) || ! str_contains( (string) ( $parsed['attrs']['className'] ?? '' ), 'tracy-eyebrow' ) ) {
		return $content;
	}
	$post = (int) ( $block->context['postId'] ?? 0 );
	if ( ! $post ) {
		return $content;
	}
	return sprintf(
		'<div class="jn-card-date"><time datetime="%s">%s</time></div>',
		esc_attr( (string) get_the_date( 'c', $post ) ),
		esc_html( (string) get_the_date( '', $post ) )
	);
}
add_filter( 'render_block_core/post-terms', 'wp_ja_nova_card_date', 10, 3 );

/**
 * Text is printed as it was typed: Joomla prints straight quotes, three dots and double hyphens as
 * they stand in the article, while wptexturize() turns them into curly quotes, an ellipsis and
 * dashes, so every quoted phrase of the imported articles would read differently from the source.
 */
add_filter( 'run_wptexturize', '__return_false' );

/**
 * The category whose posts (and its sub-categories' posts) Joomla draws with its project article
 * layout: a fields row (client, services, date, the live link), the full-text picture across the
 * page, the intro under the title.
 */
const WP_JA_NOVA_PROJECT_CATEGORY = 'project';

/**
 * Whether a post is filed under the project category or below it.
 *
 * @param int $post Post id.
 * @return bool
 */
function wp_ja_nova_is_project_post( int $post ): bool {
	$root = get_category_by_slug( WP_JA_NOVA_PROJECT_CATEGORY );
	if ( ! $root ) {
		return false;
	}
	foreach ( wp_get_post_categories( $post ) as $cat ) {
		if ( (int) $cat === (int) $root->term_id || cat_is_ancestor_of( (int) $root->term_id, (int) $cat ) ) {
			return true;
		}
	}
	return false;
}

/**
 * A project post is drawn by single-project.html unless its own template is set, as Joomla picks
 * the article layout by category.
 *
 * @param string[] $templates The template candidates, most specific first.
 * @return string[]
 */
function wp_ja_nova_project_template( array $templates ): array {
	$post = get_queried_object_id();
	if ( ! $post || get_page_template_slug( $post ) || ! wp_ja_nova_is_project_post( $post ) ) {
		return $templates;
	}
	return array_merge( array( 'single-project' ), $templates );
}
add_filter( 'single_template_hierarchy', 'wp_ja_nova_project_template' );

/**
 * The full-text picture of a project, taken out of the article column (see
 * wp_ja_nova_project_body) and printed across the page before the share/article box.
 *
 * @param string|null $html The picture to keep; null to take it.
 * @return string
 */
function wp_ja_nova_project_picture( ?string $html = null ): string {
	static $picture = '';
	if ( null !== $html ) {
		$picture = $html;
		return '';
	}
	$out     = $picture;
	$picture = '';
	return $out;
}

/**
 * The body of a project post in single-project.html: its opening full-text picture is held for
 * wp_ja_nova_project_box and the intro before the "more" mark is left out, since the template prints
 * the intro (the post excerpt) under the title, as the source does.
 *
 * @param string $content The rendered post content.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_nova_project_body( string $content, array $parsed ): string {
	if ( ! str_contains( (string) ( $parsed['attrs']['className'] ?? '' ), 'jn-article__body' ) || ! is_singular( 'post' ) ) {
		return $content;
	}
	global $_wp_current_template_id;
	if ( ! is_string( $_wp_current_template_id ) || ! str_ends_with( $_wp_current_template_id, '//single-project' ) ) {
		return $content;
	}
	if ( preg_match( '#<figure\b[^>]*\bjn-fulltext-image\b.*?</figure>#s', $content, $m ) ) {
		wp_ja_nova_project_picture( $m[0] );
		$content = str_replace( $m[0], '', $content );
	}
	if ( has_excerpt() && preg_match( '#^(\s*<div\b[^>]*>)(.*?)<span id="more-\d+"></span>#s', $content, $m ) ) {
		$content = $m[1] . substr( $content, strlen( $m[0] ) );
	}
	return $content;
}
add_filter( 'render_block_core/post-content', 'wp_ja_nova_project_body', 10, 2 );

/**
 * Print the held project picture before the share/article box.
 *
 * @param string $content The rendered group.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_nova_project_box( string $content, array $parsed ): string {
	if ( ! in_array( 'jn-article__box', preg_split( '/\s+/', (string) ( $parsed['attrs']['className'] ?? '' ) ), true ) ) {
		return $content;
	}
	$picture = wp_ja_nova_project_picture();
	return '' !== $picture ? '<div class="jn-project__picture">' . $picture . '</div>' . $content : $content;
}
add_filter( 'render_block_core/group', 'wp_ja_nova_project_box', 10, 2 );

/**
 * The popular tags of the search band, most used first, as Joomla's popular-tags module orders them
 * (by count); the tag cloud block sorts by name. Only the band's cloud (`jn-search-band__tags`) is
 * reordered.
 *
 * @param array $parsed The parsed block.
 * @return array
 */
function wp_ja_nova_band_cloud( array $parsed ): array {
	if ( 'core/tag-cloud' === ( $parsed['blockName'] ?? '' ) ) {
		wp_ja_nova_band_cloud_on( str_contains( (string) ( $parsed['attrs']['className'] ?? '' ), 'jn-search-band__tags' ) );
	}
	return $parsed;
}
add_filter( 'render_block_data', 'wp_ja_nova_band_cloud' );

/**
 * @param bool|null $on Set whether the tag cloud rendering now is the band's; null to read it.
 * @return bool
 */
function wp_ja_nova_band_cloud_on( ?bool $on = null ): bool {
	static $band = false;
	if ( null !== $on ) {
		$band = $on;
	}
	return $band;
}

/**
 * The band's cloud, most used tag first (ties by name). Sorted on the cloud's data: a tag_cloud_sort
 * result equal to the terms as fetched (already by count) makes WordPress sort them by name again.
 *
 * @param array[] $data One entry per tag (`real_count`, `name`, …).
 * @return array[]
 */
function wp_ja_nova_tag_cloud_order( array $data ): array {
	if ( ! wp_ja_nova_band_cloud_on() ) {
		return $data;
	}
	usort(
		$data,
		static fn( array $a, array $b ): int => ( (int) $b['real_count'] <=> (int) $a['real_count'] ) ?: strcasecmp( (string) $a['name'], (string) $b['name'] )
	);
	return $data;
}
add_filter( 'wp_generate_tag_cloud_data', 'wp_ja_nova_tag_cloud_order' );

/**
 * The band's cloud as a list, one item per tag, as the source's popular-tags module writes it: the
 * block prints its links side by side in one paragraph, which reads as one run of words.
 *
 * @param string $content The rendered tag cloud.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_nova_band_cloud_list( string $content, array $parsed ): string {
	if ( ! str_contains( (string) ( $parsed['attrs']['className'] ?? '' ), 'jn-search-band__tags' ) ) {
		return $content;
	}
	if ( ! preg_match( '#^\s*<p(\s[^>]*)>(.*)</p>\s*$#s', $content, $m ) ) {
		return $content;
	}
	preg_match_all( '#<a\s[^>]*>.*?</a>#s', $m[2], $links );
	if ( empty( $links[0] ) ) {
		return $content;
	}
	return '<ul' . $m[1] . '><li>' . implode( '</li><li>', $links[0] ) . '</li></ul>';
}
add_filter( 'render_block_core/tag-cloud', 'wp_ja_nova_band_cloud_list', 10, 2 );

/** The social networks an author's profile may link, in the order the author list draws them. */
const WP_JA_NOVA_AUTHOR_SOCIALS = array(
	'facebook'  => 'Facebook',
	'instagram' => 'Instagram',
	'twitter'   => 'Twitter',
	'linkedin'  => 'LinkedIn',
	'youtube'   => 'YouTube',
);

/**
 * A social link as stored: an http(s) address, or "#" (a placeholder link the source ships).
 *
 * @param mixed $value The submitted value.
 * @return string
 */
function wp_ja_nova_sanitize_social( $value ): string {
	$value = trim( (string) $value );
	if ( '#' === $value ) {
		return '#';
	}
	return (string) esc_url_raw( $value, array( 'http', 'https' ) );
}

/**
 * The author profile fields the author list draws: a job title and social links, user meta the
 * owner edits on the WordPress profile screen (Joomla's profile.user_jobtitle and user_social).
 */
function wp_ja_nova_register_author_meta(): void {
	register_meta(
		'user',
		'wp_ja_nova_job_title',
		array(
			'type'              => 'string',
			'single'            => true,
			'sanitize_callback' => 'sanitize_text_field',
			'show_in_rest'      => true,
			'description'       => 'Job title shown under the author name.',
		)
	);
	foreach ( array_keys( WP_JA_NOVA_AUTHOR_SOCIALS ) as $network ) {
		register_meta(
			'user',
			'wp_ja_nova_social_' . $network,
			array(
				'type'              => 'string',
				'single'            => true,
				'sanitize_callback' => 'wp_ja_nova_sanitize_social',
				'show_in_rest'      => true,
			)
		);
	}
}
add_action( 'init', 'wp_ja_nova_register_author_meta' );

/**
 * The job title and social link fields on the profile screen.
 *
 * @param WP_User $user The user being edited.
 */
function wp_ja_nova_author_fields( WP_User $user ): void {
	?>
	<h2><?php esc_html_e( 'Author list', 'wp-ja-nova' ); ?></h2>
	<table class="form-table" role="presentation">
		<tr>
			<th><label for="wp_ja_nova_job_title"><?php esc_html_e( 'Job title', 'wp-ja-nova' ); ?></label></th>
			<td><input type="text" name="wp_ja_nova_job_title" id="wp_ja_nova_job_title" class="regular-text" value="<?php echo esc_attr( (string) get_user_meta( $user->ID, 'wp_ja_nova_job_title', true ) ); ?>" /></td>
		</tr>
		<?php foreach ( WP_JA_NOVA_AUTHOR_SOCIALS as $network => $label ) : ?>
		<tr>
			<th><label for="wp_ja_nova_social_<?php echo esc_attr( $network ); ?>"><?php echo esc_html( $label ); ?></label></th>
			<td><input type="text" name="wp_ja_nova_social_<?php echo esc_attr( $network ); ?>" id="wp_ja_nova_social_<?php echo esc_attr( $network ); ?>" class="regular-text code" value="<?php echo esc_attr( (string) get_user_meta( $user->ID, 'wp_ja_nova_social_' . $network, true ) ); ?>" /></td>
		</tr>
		<?php endforeach; ?>
	</table>
	<?php
}
add_action( 'show_user_profile', 'wp_ja_nova_author_fields' );
add_action( 'edit_user_profile', 'wp_ja_nova_author_fields' );

/**
 * Saves the profile fields; the profile form's own nonce is checked by WordPress before this runs.
 *
 * @param int $user_id The user being saved.
 */
function wp_ja_nova_save_author_fields( int $user_id ): void {
	if ( ! current_user_can( 'edit_user', $user_id ) ) {
		return;
	}
	check_admin_referer( 'update-user_' . $user_id );
	if ( isset( $_POST['wp_ja_nova_job_title'] ) ) {
		update_user_meta( $user_id, 'wp_ja_nova_job_title', sanitize_text_field( wp_unslash( $_POST['wp_ja_nova_job_title'] ) ) );
	}
	foreach ( array_keys( WP_JA_NOVA_AUTHOR_SOCIALS ) as $network ) {
		$key = 'wp_ja_nova_social_' . $network;
		if ( isset( $_POST[ $key ] ) ) {
			update_user_meta( $user_id, $key, wp_ja_nova_sanitize_social( wp_unslash( $_POST[ $key ] ) ) );
		}
	}
}
add_action( 'personal_options_update', 'wp_ja_nova_save_author_fields' );
add_action( 'edit_user_profile_update', 'wp_ja_nova_save_author_fields' );

/**
 * The author list (`jn-authors` group naming the authors in `wpJaNovaAuthors`, the source's
 * com_content author list): avatar and name leading to the author's page, job title, biography
 * (kept hidden as the source does) and social links, `wpJaNovaPerPage` a page with Joomla's pager
 * (`?start=N`). Every value is the user's own, edited on the profile screen.
 *
 * @param string $content The rendered group.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_nova_author_list( string $content, array $parsed ): string {
	$names = $parsed['attrs']['wpJaNovaAuthors'] ?? null;
	if ( ! is_array( $names ) || ! str_contains( (string) ( $parsed['attrs']['className'] ?? '' ), 'jn-authors' ) ) {
		return $content;
	}
	$users = array();
	foreach ( $names as $name ) {
		$user = get_user_by( 'slug', sanitize_title( (string) $name ) );
		if ( $user ) {
			$users[] = $user;
		}
	}
	$per   = max( 1, (int) ( $parsed['attrs']['wpJaNovaPerPage'] ?? 6 ) );
	$pages = max( 1, (int) ceil( count( $users ) / $per ) );
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a public read-only page offset.
	$start = isset( $_GET['start'] ) ? absint( wp_unslash( $_GET['start'] ) ) : 0;
	$page  = min( $pages, intdiv( $start, $per ) + 1 );
	$cards = '';
	foreach ( array_slice( $users, ( $page - 1 ) * $per, $per ) as $user ) {
		$url     = get_author_posts_url( $user->ID );
		$socials = '';
		foreach ( WP_JA_NOVA_AUTHOR_SOCIALS as $network => $label ) {
			$link = (string) get_user_meta( $user->ID, 'wp_ja_nova_social_' . $network, true );
			if ( '' !== $link ) {
				$socials .= sprintf( '<a class="jn-author__social jn-author__social--%1$s" href="%2$s" target="_blank" rel="noopener" title="%3$s"><span class="jn-author__social-icon" aria-hidden="true"></span><span class="screen-reader-text">%4$s</span></a>', esc_attr( $network ), esc_url( $link ), esc_attr( $network ), esc_html( $label ) );
			}
		}
		$title  = (string) get_user_meta( $user->ID, 'wp_ja_nova_job_title', true );
		$cards .= '<div class="jn-authors__col"><div class="jn-author">'
			. sprintf( '<div class="jn-author__avatar"><a href="%1$s"><img src="%2$s" alt="%3$s" width="600" height="600" loading="lazy" decoding="async" /></a></div>', esc_url( $url ), esc_url( (string) get_avatar_url( $user->ID, array( 'size' => 600 ) ) ), esc_attr( $user->display_name ) )
			. '<div class="jn-author__info">'
			. sprintf( '<div class="jn-author__name"><a href="%1$s">%2$s</a></div>', esc_url( $url ), esc_html( $user->display_name ) )
			. ( '' !== $title ? sprintf( '<div class="jn-author__title"><span>%s</span></div>', esc_html( $title ) ) : '' )
			. ( '' !== $user->description ? sprintf( '<div class="jn-author__about">%s</div>', esc_html( $user->description ) ) : '' )
			. ( '' !== $socials ? '<div class="jn-author__socials">' . $socials . '</div>' : '' )
			. '</div></div></div>';
	}
	$pager = '';
	if ( $pages > 1 ) {
		$base  = get_permalink();
		$link  = static function ( int $n ) use ( $base, $per ): string {
			return 1 === $n ? (string) $base : add_query_arg( 'start', ( $n - 1 ) * $per, (string) $base );
		};
		$item  = static function ( ?string $href, string $text, string $label, string $state = '' ): string {
			$cls = 'tracy-pager__item' . ( $state ? ' is-' . $state : '' );
			if ( null === $href ) {
				$aria = 'current' === $state ? ' aria-current="page" aria-label="' . esc_attr( $label ) . '"' : ' aria-hidden="true"';
				return '<li class="' . $cls . '"><span class="tracy-pager__link"' . $aria . '>' . $text . '</span></li>';
			}
			return '<li class="' . $cls . '"><a class="tracy-pager__link" href="' . esc_url( $href ) . '" aria-label="' . esc_attr( $label ) . '">' . $text . '</a></li>';
		};
		$items = $page > 1
			? $item( $link( 1 ), '&laquo;', __( 'Go to start page', 'wp-ja-nova' ) ) . $item( $link( $page - 1 ), '&lsaquo;', __( 'Go to previous page', 'wp-ja-nova' ) )
			: $item( null, '&laquo;', '', 'disabled' ) . $item( null, '&lsaquo;', '', 'disabled' );
		for ( $n = 1; $n <= $pages; $n++ ) {
			/* translators: %d: page number. */
			$items .= $n === $page ? $item( null, (string) $n, sprintf( __( 'Page %d', 'wp-ja-nova' ), $n ), 'current' ) : $item( $link( $n ), (string) $n, sprintf( __( 'Go to page %d', 'wp-ja-nova' ), $n ) );
		}
		$items .= $page < $pages
			? $item( $link( $page + 1 ), '&rsaquo;', __( 'Go to next page', 'wp-ja-nova' ) ) . $item( $link( $pages ), '&raquo;', __( 'Go to end page', 'wp-ja-nova' ) )
			: $item( null, '&rsaquo;', '', 'disabled' ) . $item( null, '&raquo;', '', 'disabled' );
		/* translators: 1: current page, 2: number of pages. */
		$pager = '<div class="jn-pager-row"><nav class="tracy-pager tracy-pagination tracy-joomla-pager" aria-label="' . esc_attr__( 'Pagination', 'wp-ja-nova' ) . '"><ul class="tracy-pager__list">' . $items . '</ul></nav><p class="tracy-pager__counter">' . esc_html( sprintf( __( 'Page %1$d of %2$d', 'wp-ja-nova' ), $page, $pages ) ) . '</p></div>';
	}
	$end = strrpos( $content, '</div>' );
	if ( false === $end ) {
		return $content;
	}
	// Spliced, not a regex replacement: a biography may hold "$1"-like text.
	return substr( $content, 0, $end ) . '<div class="jn-authors__grid">' . $cards . '</div>' . $pager . substr( $content, $end );
}
add_filter( 'render_block_core/group', 'wp_ja_nova_author_list', 10, 2 );

/**
 * The contact cards print the address as the source does: with ordinary spaces. The seeder writes a
 * no-break space after short words ("181C No. 930"), which moves the line break; the stored text keeps
 * it, the page draws it as a plain space (S-55).
 *
 * @param string $content The rendered block.
 * @param array  $parsed  The parsed block.
 * @return string
 */
function wp_ja_nova_contact_card_spaces( string $content, array $parsed ): string {
	if ( false === strpos( (string) ( $parsed['attrs']['className'] ?? '' ), 'jn-contact-card__text' ) ) {
		return $content;
	}
	return str_replace( array( "\xC2\xA0", '&nbsp;' ), ' ', $content );
}
add_filter( 'render_block_core/paragraph', 'wp_ja_nova_contact_card_spaces', 10, 2 );

/* ── Sign-in with a passkey (WebAuthn) ───────────────────────────────────────────────────────────
 * The source's login form carries a "Sign in with a passkey" button (Joomla's WebAuthn system plugin). This is the
 * WordPress counterpart, with the verification done here and nothing taken on trust from the browser:
 *
 *   - a person adds a passkey on their account page while signed in (`passkey/register-options` → the browser's
 *     navigator.credentials.create() → `passkey/register`), which stores the credential id and public key in user meta;
 *   - the login form's button asks for a challenge (`passkey/login-options`), the browser signs it with the passkey
 *     (navigator.credentials.get(), a discoverable credential, so no username is typed), and `passkey/login` checks the
 *     whole assertion before it sets the sign-in cookie.
 *
 * A challenge is 32 random bytes held in a transient for five minutes and deleted when it is used: an expired, unknown
 * or replayed one is refused. The assertion must be of type webauthn.get, carry that challenge, name this site's origin,
 * be made for this site's relying party id (rpIdHash), have the user-present flag, verify against the stored public key
 * (ES256 or RS256), and not roll the signature counter back. Attestation is not asked for ("none"). */
const WP_JA_NOVA_PASSKEY_TTL     = 300;
const WP_JA_NOVA_PASSKEY_PREFIX  = 'wp_ja_nova_pk_';
const WP_JA_NOVA_PASSKEY_MAX     = 10;
const WP_JA_NOVA_PASSKEY_BODY    = 20000;

function wp_ja_nova_b64u_encode( string $bytes ): string {
	return rtrim( strtr( base64_encode( $bytes ), '+/', '-_' ), '=' );
}

/** Strict base64url: only its own alphabet, no padding, and it must round-trip. */
function wp_ja_nova_b64u_decode( $text ): ?string {
	if ( ! is_string( $text ) || '' === $text || strlen( $text ) > 8192 || ! preg_match( '/^[A-Za-z0-9_-]+$/', $text ) ) {
		return null;
	}
	$raw = base64_decode( strtr( $text, '-_', '+/' ) . str_repeat( '=', ( 4 - strlen( $text ) % 4 ) % 4 ), true );
	return ( false !== $raw && wp_ja_nova_b64u_encode( $raw ) === $text ) ? $raw : null;
}

/**
 * The relying party: the site's own host and origin, never read from the request.
 *
 * @return array{id: string, origin: string, name: string}
 */
function wp_ja_nova_passkey_rp(): array {
	$parts  = wp_parse_url( home_url() );
	$host   = strtolower( (string) ( $parts['host'] ?? '' ) );
	$origin = ( $parts['scheme'] ?? 'https' ) . '://' . $host . ( isset( $parts['port'] ) ? ':' . $parts['port'] : '' );
	return array(
		'id'     => $host,
		'origin' => $origin,
		'name'   => (string) get_bloginfo( 'name' ),
	);
}

/** One CBOR data item (RFC 8949) from `$data` at `$pos`; maps, arrays, integers, byte and text strings, booleans and null. Throws on anything else. */
function wp_ja_nova_cbor_item( string $data, int &$pos, int $depth = 0 ) {
	if ( $depth > 8 || $pos >= strlen( $data ) ) {
		throw new UnexpectedValueException( 'cbor' );
	}
	$initial = ord( $data[ $pos++ ] );
	$major   = $initial >> 5;
	$info    = $initial & 31;
	if ( $info < 24 ) {
		$value = $info;
	} elseif ( $info <= 27 ) {
		$size = array( 24 => 1, 25 => 2, 26 => 4, 27 => 8 )[ $info ];
		if ( $pos + $size > strlen( $data ) ) {
			throw new UnexpectedValueException( 'cbor' );
		}
		$value = 0;
		for ( $i = 0; $i < $size; $i++ ) {
			$value = ( $value << 8 ) | ord( $data[ $pos++ ] );
		}
		if ( $value < 0 ) {
			throw new UnexpectedValueException( 'cbor' );
		}
	} else {
		if ( 7 === $major && in_array( $info, array( 20, 21, 22 ), true ) ) {
			return array( 20 => false, 21 => true, 22 => null )[ $info ];
		}
		throw new UnexpectedValueException( 'cbor' );
	}
	switch ( $major ) {
		case 0:
			return $value;
		case 1:
			return -1 - $value;
		case 2:
		case 3:
			if ( $value > strlen( $data ) - $pos ) {
				throw new UnexpectedValueException( 'cbor' );
			}
			$out  = substr( $data, $pos, $value );
			$pos += $value;
			return $out;
		case 4:
			if ( $value > 64 ) {
				throw new UnexpectedValueException( 'cbor' );
			}
			$list = array();
			for ( $i = 0; $i < $value; $i++ ) {
				$list[] = wp_ja_nova_cbor_item( $data, $pos, $depth + 1 );
			}
			return $list;
		case 5:
			if ( $value > 64 ) {
				throw new UnexpectedValueException( 'cbor' );
			}
			$map = array();
			for ( $i = 0; $i < $value; $i++ ) {
				$key = wp_ja_nova_cbor_item( $data, $pos, $depth + 1 );
				if ( ! is_int( $key ) && ! is_string( $key ) ) {
					throw new UnexpectedValueException( 'cbor' );
				}
				$map[ $key ] = wp_ja_nova_cbor_item( $data, $pos, $depth + 1 );
			}
			return $map;
	}
	throw new UnexpectedValueException( 'cbor' );
}

function wp_ja_nova_der_length( int $length ): string {
	if ( $length < 128 ) {
		return chr( $length );
	}
	$bytes = ltrim( pack( 'N', $length ), "\0" );
	return chr( 0x80 | strlen( $bytes ) ) . $bytes;
}

function wp_ja_nova_der_integer( string $unsigned ): string {
	$unsigned = ltrim( $unsigned, "\0" );
	if ( '' === $unsigned || ord( $unsigned[0] ) > 127 ) {
		$unsigned = "\0" . $unsigned;
	}
	return "\x02" . wp_ja_nova_der_length( strlen( $unsigned ) ) . $unsigned;
}

/** A COSE public key (ES256 on P-256, or RS256) as a PEM public key, or null when it is neither. @return array{pem: string, alg: int}|null */
function wp_ja_nova_cose_to_pem( array $cose ): ?array {
	$kty = $cose[1] ?? null;
	$alg = $cose[3] ?? null;
	if ( 2 === $kty && -7 === $alg && 1 === ( $cose[-1] ?? null ) && is_string( $cose[-2] ?? null ) && is_string( $cose[-3] ?? null ) && 32 === strlen( $cose[-2] ) && 32 === strlen( $cose[-3] ) ) {
		$der = hex2bin( '3059301306072a8648ce3d020106082a8648ce3d030107034200' ) . "\x04" . $cose[-2] . $cose[-3];
	} elseif ( 3 === $kty && -257 === $alg && is_string( $cose[-1] ?? null ) && is_string( $cose[-2] ?? null ) && strlen( $cose[-1] ) >= 256 && strlen( $cose[-1] ) <= 1024 ) {
		$rsa  = wp_ja_nova_der_integer( $cose[-1] ) . wp_ja_nova_der_integer( $cose[-2] );
		$rsa  = "\x30" . wp_ja_nova_der_length( strlen( $rsa ) ) . $rsa;
		$bits = "\x03" . wp_ja_nova_der_length( strlen( $rsa ) + 1 ) . "\0" . $rsa;
		$algo = hex2bin( '300d06092a864886f70d0101010500' );
		$body = $algo . $bits;
		$der  = "\x30" . wp_ja_nova_der_length( strlen( $body ) ) . $body;
	} else {
		return null;
	}
	return array(
		'pem' => "-----BEGIN PUBLIC KEY-----\n" . chunk_split( base64_encode( $der ), 64, "\n" ) . '-----END PUBLIC KEY-----',
		'alg' => $alg,
	);
}

/**
 * The authenticator data of a response: the relying party hash, the flags, the counter and, when it carries one, the credential.
 *
 * @return array<string, mixed>|null
 */
function wp_ja_nova_passkey_auth_data( string $auth, bool $with_credential ): ?array {
	if ( strlen( $auth ) < 37 ) {
		return null;
	}
	$out = array(
		'rp_hash' => substr( $auth, 0, 32 ),
		'flags'   => ord( $auth[32] ),
		'count'   => (int) unpack( 'N', substr( $auth, 33, 4 ) )[1],
	);
	if ( ! $with_credential ) {
		return $out;
	}
	if ( ! ( $out['flags'] & 0x40 ) || strlen( $auth ) < 55 ) {
		return null;
	}
	$id_length = (int) unpack( 'n', substr( $auth, 53, 2 ) )[1];
	if ( $id_length < 16 || $id_length > 1023 || strlen( $auth ) < 55 + $id_length ) {
		return null;
	}
	$out['credential_id'] = substr( $auth, 55, $id_length );
	try {
		$pos         = 55 + $id_length;
		$cose        = wp_ja_nova_cbor_item( $auth, $pos );
		$out['cose'] = is_array( $cose ) ? $cose : null;
	} catch ( UnexpectedValueException $e ) {
		return null;
	}
	return $out['cose'] ? $out : null;
}

/**
 * Checks the client data of a response: its type, a challenge this site issued for this purpose (spent now), and its origin.
 *
 * @return array{ok: bool, user: int, error: string}
 */
function wp_ja_nova_passkey_client_data( $client_json, string $type, string $purpose ): array {
	$fail = static fn( string $error ): array => array(
		'ok'    => false,
		'user'  => 0,
		'error' => $error,
	);
	if ( ! is_string( $client_json ) ) {
		return $fail( 'client data' );
	}
	$client = json_decode( $client_json, true );
	if ( ! is_array( $client ) || ( $client['type'] ?? '' ) !== $type || ! is_string( $client['challenge'] ?? null ) || ! is_string( $client['origin'] ?? null ) ) {
		return $fail( 'client data' );
	}
	$key    = WP_JA_NOVA_PASSKEY_PREFIX . 'c_' . hash( 'sha256', $client['challenge'] );
	$stored = get_transient( $key );
	delete_transient( $key );
	if ( ! is_array( $stored ) || ( $stored['purpose'] ?? '' ) !== $purpose || ( $stored['expires'] ?? 0 ) < time() ) {
		return $fail( 'challenge' );
	}
	if ( ! hash_equals( wp_ja_nova_passkey_rp()['origin'], $client['origin'] ) || ! empty( $client['crossOrigin'] ) ) {
		return $fail( 'origin' );
	}
	return array(
		'ok'    => true,
		'user'  => (int) ( $stored['user'] ?? 0 ),
		'error' => '',
	);
}

/** The user-meta key one credential lives under: a fixed prefix and the first half of its id's hash. */
function wp_ja_nova_passkey_meta_key( string $credential_id ): string {
	return WP_JA_NOVA_PASSKEY_PREFIX . 'k_' . substr( hash( 'sha256', $credential_id ), 0, 32 );
}

/** The user holding a credential, or 0. */
function wp_ja_nova_passkey_owner( string $credential_id ): int {
	$found = get_users(
		array(
			'meta_key'     => wp_ja_nova_passkey_meta_key( $credential_id ), // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_compare' => 'EXISTS',
			'number'       => 1,
			'fields'       => 'ID',
		)
	);
	return $found ? (int) $found[0] : 0;
}

/** At most 30 challenges per client address per five minutes: a challenge costs a database row. */
function wp_ja_nova_passkey_throttled(): bool {
	$key   = WP_JA_NOVA_PASSKEY_PREFIX . 't_' . hash( 'sha256', (string) ( $_SERVER['REMOTE_ADDR'] ?? '' ) );
	$count = (int) get_transient( $key );
	if ( $count >= 30 ) {
		return true;
	}
	set_transient( $key, $count + 1, WP_JA_NOVA_PASSKEY_TTL );
	return false;
}

function wp_ja_nova_passkey_issue( string $purpose, int $user ): string {
	$challenge = wp_ja_nova_b64u_encode( random_bytes( 32 ) );
	set_transient(
		WP_JA_NOVA_PASSKEY_PREFIX . 'c_' . hash( 'sha256', $challenge ),
		array(
			'purpose' => $purpose,
			'user'    => $user,
			'expires' => time() + WP_JA_NOVA_PASSKEY_TTL,
		),
		WP_JA_NOVA_PASSKEY_TTL
	);
	return $challenge;
}

/** The credentials a user holds: [ [ id, name, created ], … ] from the meta rows. */
function wp_ja_nova_passkeys_of( int $user_id ): array {
	$out = array();
	foreach ( get_user_meta( $user_id ) as $key => $rows ) {
		if ( ! str_starts_with( (string) $key, WP_JA_NOVA_PASSKEY_PREFIX . 'k_' ) ) {
			continue;
		}
		$row = maybe_unserialize( $rows[0] ?? '' );
		if ( is_array( $row ) && isset( $row['id'] ) ) {
			$out[] = $row;
		}
	}
	return $out;
}

function wp_ja_nova_passkey_body( WP_REST_Request $request ): ?array {
	$raw = $request->get_body();
	if ( strlen( $raw ) > WP_JA_NOVA_PASSKEY_BODY ) {
		return null;
	}
	$data = json_decode( $raw, true );
	return is_array( $data ) ? $data : null;
}

function wp_ja_nova_passkey_error( string $message, int $status = 400 ): WP_REST_Response {
	return new WP_REST_Response( array( 'error' => $message ), $status );
}

/** Challenge for a new passkey of the signed-in user. */
function wp_ja_nova_rest_passkey_register_options(): WP_REST_Response {
	if ( wp_ja_nova_passkey_throttled() ) {
		return wp_ja_nova_passkey_error( __( 'Too many attempts. Try again in a few minutes.', 'wp-ja-nova' ), 429 );
	}
	$user = wp_get_current_user();
	$rp   = wp_ja_nova_passkey_rp();
	$have = wp_ja_nova_passkeys_of( $user->ID );
	if ( count( $have ) >= WP_JA_NOVA_PASSKEY_MAX ) {
		return wp_ja_nova_passkey_error( __( 'You have reached the passkey limit.', 'wp-ja-nova' ), 409 );
	}
	return new WP_REST_Response(
		array(
			'challenge'              => wp_ja_nova_passkey_issue( 'register', $user->ID ),
			'rp'                     => array(
				'id'   => $rp['id'],
				'name' => $rp['name'],
			),
			'user'                   => array(
				'id'          => wp_ja_nova_b64u_encode( hash( 'sha256', 'wp-ja-nova-passkey|' . home_url() . '|' . $user->ID, true ) ),
				'name'        => $user->user_login,
				'displayName' => $user->display_name,
			),
			'pubKeyCredParams'       => array(
				array(
					'type' => 'public-key',
					'alg'  => -7,
				),
				array(
					'type' => 'public-key',
					'alg'  => -257,
				),
			),
			'excludeCredentials'     => array_map(
				static fn( array $row ): array => array(
					'type' => 'public-key',
					'id'   => $row['id'],
				),
				$have
			),
			'authenticatorSelection' => array(
				'residentKey'      => 'required',
				'userVerification' => 'preferred',
			),
			'attestation'            => 'none',
			'timeout'                => 60000,
		)
	);
}

/** Stores the passkey a browser made: checks the attestation object, the challenge, the origin and the relying party. */
function wp_ja_nova_rest_passkey_register( WP_REST_Request $request ): WP_REST_Response {
	$data   = wp_ja_nova_passkey_body( $request );
	$bad    = wp_ja_nova_passkey_error( __( 'The passkey could not be saved.', 'wp-ja-nova' ) );
	$user   = get_current_user_id();
	$client = wp_ja_nova_b64u_decode( $data['clientDataJSON'] ?? null );
	$object = wp_ja_nova_b64u_decode( $data['attestationObject'] ?? null );
	if ( null === $client || null === $object ) {
		return $bad;
	}
	$checked = wp_ja_nova_passkey_client_data( $client, 'webauthn.create', 'register' );
	if ( ! $checked['ok'] || $checked['user'] !== $user ) {
		return $bad;
	}
	try {
		$pos    = 0;
		$parsed = wp_ja_nova_cbor_item( $object, $pos );
	} catch ( UnexpectedValueException $e ) {
		return $bad;
	}
	$auth = is_array( $parsed ) && is_string( $parsed['authData'] ?? null ) ? wp_ja_nova_passkey_auth_data( $parsed['authData'], true ) : null;
	if ( ! $auth || ! hash_equals( hash( 'sha256', wp_ja_nova_passkey_rp()['id'], true ), $auth['rp_hash'] ) || ! ( $auth['flags'] & 0x01 ) ) {
		return $bad;
	}
	$key = wp_ja_nova_cose_to_pem( $auth['cose'] );
	if ( ! $key || wp_ja_nova_b64u_decode( $data['id'] ?? null ) !== $auth['credential_id'] ) {
		return $bad;
	}
	if ( wp_ja_nova_passkey_owner( $auth['credential_id'] ) || count( wp_ja_nova_passkeys_of( $user ) ) >= WP_JA_NOVA_PASSKEY_MAX ) {
		return wp_ja_nova_passkey_error( __( 'This passkey is already registered.', 'wp-ja-nova' ), 409 );
	}
	$name = isset( $data['name'] ) && is_string( $data['name'] ) ? sanitize_text_field( mb_substr( $data['name'], 0, 60 ) ) : '';
	add_user_meta(
		$user,
		wp_ja_nova_passkey_meta_key( $auth['credential_id'] ),
		array(
			'id'      => wp_ja_nova_b64u_encode( $auth['credential_id'] ),
			'pem'     => $key['pem'],
			'alg'     => $key['alg'],
			'count'   => $auth['count'],
			'name'    => '' !== $name ? $name : __( 'Passkey', 'wp-ja-nova' ),
			'created' => time(),
		),
		true
	);
	return new WP_REST_Response( array( 'ok' => true ) );
}

/** A challenge for a sign-in with any passkey (discoverable: no username is asked). */
function wp_ja_nova_rest_passkey_login_options(): WP_REST_Response {
	if ( wp_ja_nova_passkey_throttled() ) {
		return wp_ja_nova_passkey_error( __( 'Too many attempts. Try again in a few minutes.', 'wp-ja-nova' ), 429 );
	}
	$rp = wp_ja_nova_passkey_rp();
	return new WP_REST_Response(
		array(
			'challenge'        => wp_ja_nova_passkey_issue( 'login', 0 ),
			'rpId'             => $rp['id'],
			'userVerification' => 'preferred',
			'timeout'          => 60000,
		)
	);
}

/** Verifies an assertion and signs the user in. */
function wp_ja_nova_rest_passkey_login( WP_REST_Request $request ): WP_REST_Response {
	$data   = wp_ja_nova_passkey_body( $request );
	$bad    = wp_ja_nova_passkey_error( __( 'The passkey could not be verified.', 'wp-ja-nova' ), 401 );
	$id     = wp_ja_nova_b64u_decode( $data['id'] ?? null );
	$client = wp_ja_nova_b64u_decode( $data['clientDataJSON'] ?? null );
	$auth   = wp_ja_nova_b64u_decode( $data['authenticatorData'] ?? null );
	$sig    = wp_ja_nova_b64u_decode( $data['signature'] ?? null );
	if ( null === $id || null === $client || null === $auth || null === $sig || strlen( $id ) > 1023 ) {
		return $bad;
	}
	$checked = wp_ja_nova_passkey_client_data( $client, 'webauthn.get', 'login' );
	if ( ! $checked['ok'] ) {
		return $bad;
	}
	$parsed = wp_ja_nova_passkey_auth_data( $auth, false );
	if ( ! $parsed || ! hash_equals( hash( 'sha256', wp_ja_nova_passkey_rp()['id'], true ), $parsed['rp_hash'] ) || ! ( $parsed['flags'] & 0x01 ) ) {
		return $bad;
	}
	$meta_key = wp_ja_nova_passkey_meta_key( $id );
	$user_id  = wp_ja_nova_passkey_owner( $id );
	$row      = $user_id ? get_user_meta( $user_id, $meta_key, true ) : null;
	if ( ! is_array( $row ) || wp_ja_nova_b64u_decode( $row['id'] ?? null ) !== $id ) {
		return $bad;
	}
	$signed = $auth . hash( 'sha256', $client, true );
	// ES256 and RS256 both sign a SHA-256 digest.
	if ( 1 !== openssl_verify( $signed, $sig, (string) $row['pem'], OPENSSL_ALGO_SHA256 ) ) {
		return $bad;
	}
	// A counter that does not move forward, when either side uses one, is a cloned authenticator.
	if ( ( $parsed['count'] > 0 || (int) $row['count'] > 0 ) && $parsed['count'] <= (int) $row['count'] ) {
		return $bad;
	}
	$row['count'] = $parsed['count'];
	update_user_meta( $user_id, $meta_key, $row );
	$user = get_userdata( $user_id );
	if ( ! $user ) {
		return $bad;
	}
	wp_set_current_user( $user_id );
	wp_set_auth_cookie( $user_id, true );
	do_action( 'wp_login', $user->user_login, $user );
	$account = get_page_by_path( 'user-profile' );
	return new WP_REST_Response(
		array(
			'ok'       => true,
			'redirect' => $account && 'publish' === $account->post_status ? get_permalink( $account ) : home_url( '/' ),
		)
	);
}

/** Removes one of the signed-in user's passkeys. */
function wp_ja_nova_rest_passkey_remove( WP_REST_Request $request ): WP_REST_Response {
	$data = wp_ja_nova_passkey_body( $request );
	$id   = wp_ja_nova_b64u_decode( $data['id'] ?? null );
	if ( null === $id ) {
		return wp_ja_nova_passkey_error( __( 'The passkey could not be removed.', 'wp-ja-nova' ) );
	}
	$meta_key = wp_ja_nova_passkey_meta_key( $id );
	return delete_user_meta( get_current_user_id(), $meta_key )
		? new WP_REST_Response( array( 'ok' => true ) )
		: wp_ja_nova_passkey_error( __( 'The passkey could not be removed.', 'wp-ja-nova' ), 404 );
}

function wp_ja_nova_register_passkey_routes(): void {
	$signed_in = static fn(): bool => is_user_logged_in();
	$routes    = array(
		'passkey/login-options'    => array( 'wp_ja_nova_rest_passkey_login_options', '__return_true' ),
		'passkey/login'            => array( 'wp_ja_nova_rest_passkey_login', '__return_true' ),
		'passkey/register-options' => array( 'wp_ja_nova_rest_passkey_register_options', $signed_in ),
		'passkey/register'         => array( 'wp_ja_nova_rest_passkey_register', $signed_in ),
		'passkey/remove'           => array( 'wp_ja_nova_rest_passkey_remove', $signed_in ),
	);
	foreach ( $routes as $path => $handler ) {
		register_rest_route(
			'wp-ja-nova/v1',
			'/' . $path,
			array(
				'methods'             => 'POST',
				'callback'            => $handler[0],
				'permission_callback' => $handler[1],
			)
		);
	}
}
add_action( 'rest_api_init', 'wp_ja_nova_register_passkey_routes' );

/**
 * The sign-in form's own words and rules: both fields are required, as the source's are (the stylesheet draws the star, `required`
 * is on the input), and the passkey button sits above Log in, as the source's does.
 *
 * @param string $html  What the core Login/out block printed.
 * @param array  $block Parsed block.
 * @return string
 */
function wp_ja_nova_login_form( string $html, array $block ): string {
	if ( ! str_contains( $html, 'id="loginform"' ) ) {
		return $html;
	}
	$html = (string) preg_replace( '/<input\b([^>]*\bid="(?:user_login|user_pass)"[^>]*?)\s*\/?>/', '<input$1 required aria-required="true" />', $html );
	$button = '<p class="jn-passkey"><button type="button" class="jn-passkey__button" data-jn-passkey="login" title="' . esc_attr__( 'Sign in with a passkey', 'wp-ja-nova' ) . '"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><circle cx="10.5" cy="6" r="4.5"/><path d="M22.5,10.5a3.5,3.5,0,1,0-5,3.15V19L19,20.5,21.5,18,20,16.5,21.5,15l-1.24-1.24A3.5,3.5,0,0,0,22.5,10.5Zm-3.5,0a1,1,0,1,1,1-1A1,1,0,0,1,19,10.5Z"/><path d="M14.44,12.52A6,6,0,0,0,12,12H9a6,6,0,0,0-6,6v2H16V14.49A5.16,5.16,0,0,1,14.44,12.52Z"/></svg>' . esc_html__( 'Sign in with a passkey', 'wp-ja-nova' ) . '</button><span class="jn-passkey__status" role="status" aria-live="polite"></span></p>';
	if ( preg_match( '/<p class="login-submit">/', $html ) ) {
		$html = (string) preg_replace( '/<p class="login-submit">/', $button . '<p class="login-submit">', $html, 1 );
	}
	return $html;
}
add_filter( 'render_block_core/loginout', 'wp_ja_nova_login_form', 9, 2 );

/**
 * The account page lists the signed-in person's passkeys and adds one.
 *
 * @param string $html  What the core Login/out block printed.
 * @param array  $block Parsed block.
 * @return string
 */
function wp_ja_nova_account_passkeys( string $html, array $block ): string {
	if ( ! is_user_logged_in() || ! is_singular( 'page' ) || 'page-account' !== get_page_template_slug() ) {
		return $html;
	}
	$items = '';
	foreach ( wp_ja_nova_passkeys_of( get_current_user_id() ) as $row ) {
		$items .= sprintf(
			'<li data-id="%1$s"><span>%2$s</span> <button type="button" class="jn-passkeys__remove" data-jn-passkey-remove="%1$s">%3$s</button></li>',
			esc_attr( (string) $row['id'] ),
			esc_html( (string) ( $row['name'] ?? '' ) ),
			esc_html__( 'Remove', 'wp-ja-nova' )
		);
	}
	return $html . '<section class="jn-passkeys"><h2>' . esc_html__( 'Passkeys', 'wp-ja-nova' ) . '</h2><ul class="jn-passkeys__list">' . $items . '</ul><p><button type="button" class="jn-passkey__button" data-jn-passkey="register">' . esc_html__( 'Add a passkey', 'wp-ja-nova' ) . '</button><span class="jn-passkey__status" role="status" aria-live="polite"></span></p></section>';
}
add_filter( 'render_block_core/loginout', 'wp_ja_nova_account_passkeys', 11, 2 );

/**
 * The registration form answers honestly when the site does not take sign-ups: WordPress refuses the post with
 * `registration=disabled`, so the page says so instead of drawing a form that cannot work. (The quickstart ships with
 * registration on and new people as subscribers; a site owner who turns it off gets this notice.)
 *
 * @param string $html  What the core Login/out block printed.
 * @param array  $block Parsed block.
 * @return string
 */
function wp_ja_nova_register_closed( string $html, array $block ): string {
	if ( is_user_logged_in() || get_option( 'users_can_register' ) || ! is_singular( 'page' ) || 'page-register' !== get_page_template_slug() ) {
		return $html;
	}
	return '<p class="jn-reg__closed" role="status">' . esc_html__( 'Registration is closed on this site.', 'wp-ja-nova' ) . '</p>';
}
add_filter( 'render_block_core/loginout', 'wp_ja_nova_register_closed', 8, 2 );

/**
 * Whether new people can register: the sign-in form links to the registration page only then.
 */
function wp_ja_nova_registration_open(): bool {
	return (bool) get_option( 'users_can_register' );
}

/**
 * After a successful registration WordPress sends the person to its own check-your-email screen; the site's sign-in page
 * says it instead, in the theme.
 *
 * @param mixed $redirect What WordPress would use (the redirect_to it was given).
 * @return string
 */
function wp_ja_nova_registration_redirect( $redirect ): string {
	$login = get_page_by_path( 'login-form' );
	return ( $login && 'publish' === $login->post_status ) ? add_query_arg( 'registered', '1', get_permalink( $login ) ) : (string) $redirect;
}
add_filter( 'registration_redirect', 'wp_ja_nova_registration_redirect' );

/** The sign-in page's note after a registration (only the exact `?registered=1`). */
function wp_ja_nova_registered_note( string $html, array $block ): string {
	if ( ! str_contains( $html, 'id="loginform"' ) || '1' !== ( $_GET['registered'] ?? '' ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return $html;
	}
	return '<p class="jn-reg__done" role="status">' . esc_html__( 'Registration complete. Your password has been sent to your email address.', 'wp-ja-nova' ) . '</p>' . $html;
}
add_filter( 'render_block_core/loginout', 'wp_ja_nova_registered_note', 12, 2 );

/**
 * The search page's "Advanced Search" button and its panel, as the source's Smart Search form has them (measured on the
 * source 03/10: the button toggles a card of tips, open on arrival, and the filter window under it holds no filter, because
 * the source defines none). The panel is part of the search form; the button works without the filter list, which the
 * site does not have either.
 *
 * @param string $content The rendered search block.
 * @param array  $block   Parsed block.
 * @return string
 */
function wp_ja_nova_advanced_search( string $content, array $block ): string {
	if ( ! in_array( 'jn-search', preg_split( '/\s+/', (string) ( $block['attrs']['className'] ?? '' ) ), true ) || str_contains( $content, 'jn-search__advanced' ) ) {
		return $content;
	}
	$button = '<button type="button" class="jn-search__advanced" aria-expanded="true" aria-controls="advancedSearch"><span class="jn-search__advanced-icon" aria-hidden="true"></span>' . esc_html__( 'Advanced Search', 'wp-ja-nova' ) . '</button>';
	$tips   = '<fieldset id="advancedSearch" class="jn-search__panel"><legend class="screen-reader-text">' . esc_html__( 'Advanced Search', 'wp-ja-nova' ) . '</legend><div class="jn-search__tips">'
		. '<p>' . esc_html__( 'Here are a few examples of how you can use the search feature:', 'wp-ja-nova' ) . '</p>'
		. '<p>' . wp_kses( __( 'Entering <strong>this and that</strong> into the search form will return results containing both "this" and "that".', 'wp-ja-nova' ), array( 'strong' => array() ) ) . '</p>'
		. '<p>' . wp_kses( __( 'Entering <strong>this not that</strong> into the search form will return results containing "this" and not "that".', 'wp-ja-nova' ), array( 'strong' => array() ) ) . '</p>'
		. '<p>' . wp_kses( __( 'Entering <strong>this or that</strong> into the search form will return results containing either "this" or "that".', 'wp-ja-nova' ), array( 'strong' => array() ) ) . '</p>'
		. '<p>' . esc_html__( 'Search results can also be filtered using a variety of criteria. Select one or more filters below to get started.', 'wp-ja-nova' ) . '</p>'
		. '</div><div class="jn-search__filters" id="finder-filter-window"></div></fieldset>';
	$end    = strrpos( $content, '</form>' );
	$inner  = strrpos( $content, '</div>', $end ? $end - strlen( $content ) : 0 );
	if ( false === $end || false === $inner ) {
		return $content;
	}
	return substr( $content, 0, $inner ) . $button . substr( $content, $inner, $end - $inner ) . $tips . substr( $content, $end );
}
add_filter( 'render_block_core/search', 'wp_ja_nova_advanced_search', 10, 2 );

/**
 * An icon-only social link names itself with aria-label instead of a 1 px visually hidden label.
 *
 * The core block prints the network name in `span.wp-block-social-link-label.screen-reader-text` beside the icon. That span is a
 * second box inside the link, away from the icon, so a layout probe reads the one-word link as wrapping onto several lines.
 * The accessible name is the same either way; the link keeps its icon and its size.
 *
 * @param string $content Rendered block.
 * @return string
 */
function wp_ja_nova_social_link_name( $content ) {
	if ( ! is_string( $content ) || false === strpos( $content, 'wp-block-social-link-label' ) ) {
		return $content;
	}
	if ( ! preg_match( '#<span class="wp-block-social-link-label[^"]*screen-reader-text[^"]*">([^<]+)</span>#', $content, $m ) ) {
		return $content;
	}
	$name = trim( wp_strip_all_tags( $m[1] ) );
	if ( '' === $name || false !== strpos( $content, 'aria-label=' ) ) {
		return $content;
	}
	$content = str_replace( $m[0], '', $content );
	return preg_replace( '#<a #', '<a aria-label="' . esc_attr( $name ) . '" ', $content, 1 );
}
add_filter( 'render_block_core/social-link', 'wp_ja_nova_social_link_name' );
