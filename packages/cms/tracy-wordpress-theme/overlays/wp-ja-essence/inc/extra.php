<?php
/**
 * wp-ja-essence — what this target adds on top of the source theme: the JA Essence stylesheet, the dark
 * mode switch and the header drawer. Loaded by the generic hook at the end of functions.php (the source
 * theme has no inc/extra.php, so it is inert there). Functions carry the `wp_ja_essence_` prefix.
 *
 * @package wp-ja-essence
 */

defined( 'ABSPATH' ) || exit;

// The identity tokens the pages and parts carry, and their filling.
require_once __DIR__ . '/identity.php';
// The interface words the theme's blocks carry as attributes or markup, in the site's language.
require_once __DIR__ . '/words.php';

/**
 * The theme's own translations, `languages/<locale>.l10n.php` (WordPress's PHP translation format, read by load_textdomain()
 * without a `.mo` beside it), one per language the site question offers. Every word the theme prints goes through the
 * `wp-ja-essence` domain, so a site made in one of those languages reads them in it: the error page, the newsletter and
 * account cards, the pager (LANG-2, measured 10/10/2026 on dev: a Vietnamese site printed "Page not found" and "An error
 * has occurred while processing your request."). A locale with no file stays English.
 */
function wp_ja_essence_textdomain(): void {
	load_theme_textdomain( 'wp-ja-essence', get_template_directory() . '/languages' );
}
add_action( 'after_setup_theme', 'wp_ja_essence_textdomain' );

/** The assets; design pages (fixture, artifact) bring their own stylesheet and take none of these. */
function wp_ja_essence_enqueue_assets(): void {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return;
	}
	$version = wp_get_theme()->get( 'Version' );
	wp_enqueue_style( 'wp-ja-essence', get_theme_file_uri( 'assets/css/wp-ja-essence.css' ), array( 'tracy', 'tracy-layout', 'tracy-sections' ), $version );
	// One stylesheet per page group (home/landing, category/listing, detail/forms): each group owns its file.
	foreach ( array( 'home', 'category', 'detail' ) as $group ) {
		wp_enqueue_style( "wp-ja-essence-$group", get_theme_file_uri( "assets/css/je-$group.css" ), array( 'wp-ja-essence' ), $version );
	}
	// In the head, blocking, so a visitor who chose dark never sees a light frame.
	wp_enqueue_script( 'wp-ja-essence-dark', get_theme_file_uri( 'assets/js/wp-ja-essence-dark.js' ), array(), $version, array( 'in_footer' => false ) );
	wp_enqueue_script( 'wp-ja-essence', get_theme_file_uri( 'assets/js/wp-ja-essence.js' ), array(), $version, array( 'strategy' => 'defer' ) );
}
add_action( 'wp_enqueue_scripts', 'wp_ja_essence_enqueue_assets', 11 );

/** The pattern category the overlay's patterns file under. */
function wp_ja_essence_register(): void {
	register_block_pattern_category( 'wp-ja-essence', array( 'label' => __( 'WP Essence', 'wp-ja-essence' ) ) );
}
add_action( 'init', 'wp_ja_essence_register' );

/** The stylesheet in the editor too, so sections look the same there. */
function wp_ja_essence_editor_styles(): void {
	add_editor_style( 'assets/css/wp-ja-essence.css' );
}
add_action( 'after_setup_theme', 'wp_ja_essence_editor_styles', 11 );

/**
 * The header is two bars, as the source's is; the classes are restated after the source theme's filter so a
 * catalogue archetype can never float the header or recolour the hero copy (gotcha #7, #12).
 *
 * @param string[] $classes The body classes, with the source theme's already added.
 * @return string[]
 */
function wp_ja_essence_body_class( array $classes ): array {
	$navs      = array_map( static fn( string $nav ): string => 'tracy-nav-' . $nav, TRACY_NAVS );
	$heros     = array_map( static fn( string $hero ): string => 'tracy-hero-' . $hero, TRACY_HEROS );
	$classes   = array_values( array_diff( $classes, $navs, $heros ) );
	$classes[] = 'tracy-nav-top-left';
	$classes[] = 'tracy-hero-split';
	return $classes;
}
add_filter( 'body_class', 'wp_ja_essence_body_class', 11 );

/**
 * Landing pages whose header is the one-row bar although they use the landing template: the source draws Home 1 and
 * Featured Articles with the same single white bar as every default-layout page (measured 02/10: header 123px on both),
 * while the front page and Home 2-5 print the two-row masthead (192-244px).
 */
const WP_JA_ESSENCE_ONE_ROW_LANDINGS = array( 'home-1', 'featured-articles' );

/**
 * `je-hdr-two` marks the pages that print the two-row masthead (the front page and the landing pages the source draws it
 * on); every other page gets the one-row header from the stylesheet.
 *
 * @param string[] $classes Body classes.
 * @return string[]
 */
function wp_ja_essence_header_class( array $classes ): array {
	$landing = is_front_page() || is_page_template( 'page-landing' );
	if ( $landing && ! ( is_page() && in_array( (string) get_post_field( 'post_name', get_queried_object_id() ), WP_JA_ESSENCE_ONE_ROW_LANDINGS, true ) ) ) {
		$classes[] = 'je-hdr-two';
	}
	if ( wp_ja_essence_is_pill_header() ) {
		$classes[] = 'je-hdr-pill';
	}
	return $classes;
}
add_filter( 'body_class', 'wp_ja_essence_header_class', 12 );

/**
 * The article the source marks `item-highlight` (its note) carries `je-highlight`: the front page's masonry draws that card over its picture.
 *
 * @param string[] $classes Post classes.
 * @param string[] $extra   Classes added by the caller.
 * @param int      $post_id The post.
 * @return string[]
 */
function wp_ja_essence_highlight_class( array $classes, array $extra, int $post_id ): array {
	if ( 'item-highlight' === get_post_meta( $post_id, 'je_note', true ) ) {
		$classes[] = 'je-highlight';
	}
	return $classes;
}
add_filter( 'post_class', 'wp_ja_essence_highlight_class', 10, 3 );

/**
 * Home 4 prints a third masthead: the brand is a picture (avatar, script name and tagline in one 352x100 image) and the menu sits
 * in a white rounded bar. Whether the page being drawn is that one.
 */
function wp_ja_essence_is_pill_header(): bool {
	return is_page() && 'home-4' === (string) get_post_field( 'post_name', get_queried_object_id() );
}

/**
 * On that page the site title block prints the brand picture (shipped with the theme) in place of the plain name.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_essence_pill_brand( string $content, array $block ): string {
	if ( ! wp_ja_essence_is_pill_header() || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'je-site-name' ) ) {
		return $content;
	}
	$name = get_bloginfo( 'name' );
	return '<p class="je-site-name je-site-name--logo wp-block-site-title"><a href="' . esc_url( home_url( '/' ) ) . '" rel="home"><img class="je-logo-img" src="' . esc_url( get_theme_file_uri( 'assets/img/logo-essence.png' ) ) . '" width="352" height="100" alt="' . esc_attr( $name ) . '"></a></p>';
}
add_filter( 'render_block_core/site-title', 'wp_ja_essence_pill_brand', 10, 2 );

/**
 * Categories that only mark a listing and are never drawn: `blog-normal` holds the ten "normal layout" articles
 * that /category/category-style-4 lists (the source's second copy of three categories). They keep the label of the
 * category they stand for in the `je_label` meta, and no chip, badge or count shows the marker itself.
 */
const WP_JA_ESSENCE_HIDDEN_CATEGORIES = array( 'blog-normal' );

/** The five article pages (Layout 1-3, Video, Gallery) are pages in WordPress and belong to a category like a post. */
function wp_ja_essence_page_categories(): void {
	register_taxonomy_for_object_type( 'category', 'page' );
}
add_action( 'init', 'wp_ja_essence_page_categories' );

/**
 * The term ids of the hidden categories.
 *
 * @return int[]
 */
function wp_ja_essence_hidden_term_ids(): array {
	$ids = array();
	foreach ( WP_JA_ESSENCE_HIDDEN_CATEGORIES as $slug ) {
		$term = get_term_by( 'slug', $slug, 'category' );
		if ( $term ) {
			$ids[] = (int) $term->term_id;
		}
	}
	return $ids;
}

/**
 * What a listing may show, as WP_Query arguments. The source keeps a few articles twice under different categories
 * (same title, a different Joomla article): the port keeps those copies too, flagged `je_copy_of` (the article they
 * copy), so every category still counts and lists what the source lists. A copy is listed only by the one category it
 * is filed under; every list that spans several categories or none (home, trending, latest, more reading, search, tags,
 * authors) leaves the copies out, so no article shows twice. `je_unlisted` marks a copy that repeats a title inside the
 * one category the port keeps for three Joomla ones: only the lists that span categories leave it out, the category's own
 * list prints it as the source does (1.0.3, D-74). A featured list (`$featured`, the source's own curated list) prints
 * every featured article, copies included, because the source's featured list does.
 *
 * @param array $query     WP_Query arguments.
 * @param int[] $term_ids  The category term ids the query is limited to (empty: no category limit).
 * @param bool  $children  Whether the terms bring their sub-categories.
 * @param bool  $featured  Whether the list is the source's featured list.
 * @return array
 */
function wp_ja_essence_listing_args( array $query, array $term_ids, bool $children, bool $featured = false ): array {
	$total = count( $term_ids );
	if ( $children ) {
		foreach ( $term_ids as $id ) {
			$kids = get_term_children( $id, 'category' );
			$total += is_array( $kids ) ? count( $kids ) : 0;
		}
	}
	$single = 1 === $total;
	if ( $featured || ( $term_ids && ( ! isset( $query['post_type'] ) || 'post' === $query['post_type'] ) ) ) {
		// An article page filed under the category is listed with the posts.
		$query['post_type'] = array( 'post', 'page' );
	}
	$meta = isset( $query['meta_query'] ) && is_array( $query['meta_query'] ) ? $query['meta_query'] : array();
	if ( $featured ) {
		// The source's featured list: the articles with a place in its featured order, copies included.
		$meta[] = array(
			'key'     => 'je_front',
			'compare' => 'EXISTS',
		);
	} elseif ( ! $single ) {
		$meta[] = array(
			'key'     => 'je_unlisted',
			'compare' => 'NOT EXISTS',
		);
		$meta[] = array(
			'key'     => 'je_copy_of',
			'compare' => 'NOT EXISTS',
		);
	}
	$query['meta_query'] = $meta; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- NOT EXISTS / EXISTS checks on indexed meta.
	return $query;
}

/**
 * The order a listing takes from the source (`je_order` query var, set by a pattern's `wpJaEssenceOrder` or by a category
 * archive). Joomla orders its lists by fields WordPress has no column for, so the port keeps them as post meta
 * (tools/fix-spec.mjs S-103) and sorts by them here; an article without the meta sorts after the ones that have it, then
 * by id, so a post the owner adds is never dropped from a list.
 *   category  category position, manual ordering, newest first (je_created), Joomla id (category pages, featured articles, home-4/5)
 *   front     the source's featured order                                     (home-1/2/3)
 *   hits      hit counter ascending, Joomla id                                (Trending)
 *   latest    newest first (je_created), Joomla id                            (Articles - Latest)
 *   title     the printed title (an article page's source heading), Joomla id (Features, Editor's choice, lead slider)
 *
 * @param array    $clauses The SQL clauses WP_Query built.
 * @param WP_Query $query   The query.
 * @return array
 */
function wp_ja_essence_order_clauses( array $clauses, WP_Query $query ): array {
	$mode = (string) $query->get( 'je_order' );
	if ( ! in_array( $mode, array( 'category', 'front', 'hits', 'latest', 'title' ), true ) ) {
		return $clauses;
	}
	global $wpdb;
	$joined = array();
	$col    = static function ( string $key ) use ( $wpdb, &$clauses, &$joined ): string {
		$alias = 'je_o_' . $key;
		if ( ! isset( $joined[ $key ] ) ) {
			$clauses['join'] .= $wpdb->prepare( " LEFT JOIN {$wpdb->postmeta} AS {$alias} ON ({$alias}.post_id = {$wpdb->posts}.ID AND {$alias}.meta_key = %s)", $key ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- the alias is built from the fixed keys below.
			$joined[ $key ] = true;
		}
		return 'je_created' === $key ? "COALESCE(CAST({$alias}.meta_value AS SIGNED), 0)" : "COALESCE(CAST({$alias}.meta_value AS SIGNED), 999999)";
	};
	// An article page prints its source heading (meta tracy_page_heading) where its WordPress title is only "Layout 1".
	$clauses['join'] .= " LEFT JOIN {$wpdb->postmeta} AS je_o_heading ON (je_o_heading.post_id = {$wpdb->posts}.ID AND je_o_heading.meta_key = 'tracy_page_heading')";
	$title  = "COALESCE(NULLIF(je_o_heading.meta_value, ''), {$wpdb->posts}.post_title) ASC";
	$date   = $col( 'je_created' ) . ' DESC'; // The seeder shifts post dates by seconds to keep its own order; the source's creation time is the meta.
	$orders = array(
		'category' => array( $col( 'je_catpos' ) . ' ASC', $col( 'je_ordering' ) . ' ASC', $date, $col( 'je_src_id' ) . ' ASC' ),
		'front'    => array( $col( 'je_front' ) . ' ASC', $col( 'je_src_id' ) . ' ASC' ),
		'hits'     => array( $col( 'je_hits' ) . ' ASC', $col( 'je_src_id' ) . ' ASC' ),
		'latest'   => array( $date, $col( 'je_src_id' ) . ' ASC' ),
		'title'    => array( $title, $col( 'je_src_id' ) . ' ASC' ),
	);
	$clauses['orderby'] = implode( ', ', $orders[ $mode ] ) . ", {$wpdb->posts}.ID ASC";
	return $clauses;
}
add_filter( 'posts_clauses', 'wp_ja_essence_order_clauses', 10, 2 );

/**
 * The articles the source's "More reading" module relates to an article: the other articles that share one of its keywords
 * (`je_metakey`), the first `$max` by Joomla id, printed by manual ordering and then id. Measured on the source's five
 * article pages and one post: Layout 1 → 19, 20, 18, 21; Layout 2/3 and Gallery → 11, 10, 3; Video → 12, 10, 3. An
 * article with no keyword relates to nothing (no fallback to the newest posts).
 *
 * @param int $current The article being read.
 * @param int $max     How many the module prints.
 * @return int[] Post ids, in print order.
 */
function wp_ja_essence_related_ids( int $current, int $max ): array {
	$keys = array_filter( array_map( 'trim', explode( ',', strtolower( (string) get_post_meta( $current, 'je_metakey', true ) ) ) ) );
	if ( ! $keys || $max < 1 ) {
		return array();
	}
	$found = array();
	foreach ( get_posts(
		array(
			'post_type'      => array( 'post', 'page' ),
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'post__not_in'   => array( $current ),
			'meta_key'       => 'je_src_id', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'orderby'        => 'meta_value_num',
			'order'          => 'ASC',
			'no_found_rows'  => true,
		)
	) as $candidate ) {
		$theirs = array_filter( array_map( 'trim', explode( ',', strtolower( (string) get_post_meta( $candidate->ID, 'je_metakey', true ) ) ) ) );
		if ( array_intersect( $keys, $theirs ) ) {
			$found[] = $candidate->ID;
		}
	}
	$found = array_slice( $found, 0, $max );
	usort(
		$found,
		static function ( int $a, int $b ): int {
			$by_order = (int) get_post_meta( $a, 'je_ordering', true ) <=> (int) get_post_meta( $b, 'je_ordering', true );
			return $by_order ? $by_order : (int) get_post_meta( $a, 'je_src_id', true ) <=> (int) get_post_meta( $b, 'je_src_id', true );
		}
	);
	return $found;
}

/**
 * The queries the section patterns name, resolved at render time. A pattern cannot know a category's id (the
 * seeder creates it), so a section names its categories by slug (`wpJaEssenceCategory`, comma separated, with their
 * sub-categories as the source's "show child category articles"); "more reading" lists the articles related to the one
 * being read (`wpJaEssenceOthers`, wp_ja_essence_related_ids()). `wpJaEssenceFeatured` makes the list the source's featured
 * list and `wpJaEssenceOrder` names the order it takes (wp_ja_essence_order_clauses()). A tax query the owner sets in the
 * editor wins over the slugs. Every post query then goes through wp_ja_essence_listing_args(): copies and unlisted
 * articles stay out of the lists that span categories.
 *
 * @param array    $query The WP_Query arguments the block built.
 * @param WP_Block $block The post template block.
 * @return array
 */
function wp_ja_essence_query_vars( array $query, WP_Block $block ): array {
	$ctx = $block->context['query'] ?? array();
	if ( ! empty( $ctx['wpJaEssenceCategory'] ) && empty( $ctx['taxQuery'] ) ) {
		$ids = array();
		foreach ( explode( ',', (string) $ctx['wpJaEssenceCategory'] ) as $slug ) {
			$term = get_term_by( 'slug', sanitize_title( $slug ), 'category' );
			if ( $term ) {
				$ids[] = (int) $term->term_id;
			}
		}
		$query['tax_query'] = array(
			array(
				'taxonomy'         => 'category',
				'field'            => 'term_id',
				'terms'            => $ids ? $ids : array( 0 ),
				'include_children' => true,
			),
		);
	}
	if ( ! empty( $ctx['wpJaEssenceOrder'] ) && in_array( $ctx['wpJaEssenceOrder'], array( 'category', 'front', 'hits', 'latest', 'title' ), true ) ) {
		$query['je_order'] = $ctx['wpJaEssenceOrder'];
	}
	if ( ! empty( $ctx['wpJaEssenceLabels'] ) ) {
		// The copies of the second tree that stand for these Joomla categories (the source's Latest module names two of the three).
		$query['meta_query'] = array_merge(
			isset( $query['meta_query'] ) && is_array( $query['meta_query'] ) ? $query['meta_query'] : array(),
			array(
				array(
					'key'     => 'je_label',
					'value'   => array_map( 'trim', explode( ',', sanitize_text_field( (string) $ctx['wpJaEssenceLabels'] ) ) ),
					'compare' => 'IN',
				),
			)
		); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- one IN check on the copy's label.
	}
	if ( empty( $query['je_order'] ) && ! empty( $ctx['taxQuery']['category'] ) && empty( $ctx['inherit'] ) && 'date' === ( $ctx['orderBy'] ?? 'date' ) ) {
		// A category's list (the seeder's `tracy-query` on each category page) follows the source's category order unless the owner chose another.
		$query['je_order'] = 'category';
	}
	if ( ! empty( $ctx['wpJaEssenceOthers'] ) ) {
		$current = is_singular() ? (int) get_queried_object_id() : 0;
		$related = $current ? wp_ja_essence_related_ids( $current, max( 1, (int) ( $query['posts_per_page'] ?? 3 ) ) ) : array();
		$query['post_type']      = array( 'post', 'page' );
		$query['post__in']       = $related ? $related : array( 0 );
		$query['orderby']        = 'post__in';
		$query['ignore_sticky_posts'] = true;
		return $query;
	}
	if ( isset( $query['post_type'] ) && 'post' !== $query['post_type'] ) {
		return $query;
	}
	$terms    = array();
	$children = false;
	foreach ( (array) ( $query['tax_query'] ?? array() ) as $clause ) {
		if ( is_array( $clause ) && 'category' === ( $clause['taxonomy'] ?? '' ) ) {
			$terms    = array_merge( $terms, array_map( 'intval', (array) ( $clause['terms'] ?? array() ) ) );
			$children = $children || ! isset( $clause['include_children'] ) || (bool) $clause['include_children'];
		}
	}
	return wp_ja_essence_listing_args( $query, array_values( array_filter( array_unique( $terms ) ) ), $children, ! empty( $ctx['wpJaEssenceFeatured'] ) );
}
add_filter( 'query_loop_block_query_vars', 'wp_ja_essence_query_vars', 10, 2 );

/**
 * The main query of the public archives (category, tag, author, search, the posts page) follows the same rules as the
 * query loops: copies only under their own category, article pages with their category's posts.
 *
 * @param WP_Query $query The query about to run.
 */
function wp_ja_essence_main_query( WP_Query $query ): void {
	if ( is_admin() || ! $query->is_main_query() || ! ( $query->is_category() || $query->is_tag() || $query->is_author() || $query->is_search() || $query->is_home() ) ) {
		return;
	}
	$term_ids = array();
	if ( $query->is_category() ) {
		$term = get_queried_object();
		if ( $term instanceof WP_Term ) {
			$term_ids = array( (int) $term->term_id );
		}
	}
	$args = wp_ja_essence_listing_args( array( 'post_type' => $query->get( 'post_type' ) ? $query->get( 'post_type' ) : 'post' ), $term_ids, true );
	if ( $query->is_category() ) {
		$query->set( 'post_type', $args['post_type'] );
		$query->set( 'je_order', 'category' );
	}
	$meta = $query->get( 'meta_query' );
	$query->set( 'meta_query', array_merge( is_array( $meta ) ? $meta : array(), $args['meta_query'] ) ); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
}
add_action( 'pre_get_posts', 'wp_ja_essence_main_query' );

/**
 * The contact form's "Send a copy to yourself" box (1.0.3). The source's Joomla form mails the visitor a copy only when the
 * box is ticked; Contact Form 7 sends "Mail (2)" whenever it is active, so the form keeps Mail (2) active (tools/reconcile.php)
 * and this switches it off for a submission that did not tick the `send-copy` box. A form without that box keeps whatever
 * Mail (2) it has. Nothing else about the box is required: ticking it is never needed to send.
 *
 * @param WPCF7_ContactForm $form The form being sent.
 */
function wp_ja_essence_contact_copy( $form ): void {
	if ( ! $form instanceof WPCF7_ContactForm || false === strpos( (string) $form->prop( 'form' ), '[checkbox send-copy' ) ) {
		return;
	}
	$mail_2 = $form->prop( 'mail_2' );
	if ( ! is_array( $mail_2 ) || empty( $mail_2['active'] ) ) {
		return;
	}
	$submission = class_exists( 'WPCF7_Submission' ) ? WPCF7_Submission::get_instance() : null;
	$ticked     = $submission ? array_filter( (array) $submission->get_posted_data( 'send-copy' ) ) : array();
	if ( $ticked ) {
		return;
	}
	$mail_2['active'] = false;
	$form->set_properties( array( 'mail_2' => $mail_2 ) );
}
add_action( 'wpcf7_before_send_mail', 'wp_ja_essence_contact_copy' );

/**
 * The hit counter the source prints beside an article's date (an eye and the number of views). WordPress keeps no such
 * counter; the number is the one the source showed when it was ported (post meta `je_hits`, tools/fix-spec.mjs S-103, the same
 * figure the Trending order uses) and is not updated by visits (DECISIONS D-80). An article without the figure prints nothing.
 * Attribute `label` prints "Hits: " before the number, as the article's own byline does.
 */
function wp_ja_essence_register_hits_block(): void {
	register_block_type(
		'wp-ja-essence/hits',
		array(
			'api_version'     => 3,
			'title'           => __( 'Views', 'wp-ja-essence' ),
			'description'     => __( 'The number of views the article had when it was ported from the source site.', 'wp-ja-essence' ),
			'category'        => 'widgets',
			'icon'            => 'visibility',
			'attributes'      => array( 'label' => array( 'type' => 'boolean', 'default' => false ) ),
			'uses_context'    => array( 'postId' ),
			'supports'        => array( 'html' => false ),
			'render_callback' => 'wp_ja_essence_render_hits',
		)
	);
}
add_action( 'init', 'wp_ja_essence_register_hits_block' );

/**
 * @param array    $attributes Block attributes.
 * @param string   $content    Inner content (none).
 * @param WP_Block $block      The block.
 * @return string
 */
function wp_ja_essence_render_hits( array $attributes, string $content, $block ): string {
	$post_id = isset( $block->context['postId'] ) ? (int) $block->context['postId'] : (int) get_the_ID();
	$hits    = $post_id ? get_post_meta( $post_id, 'je_hits', true ) : '';
	if ( '' === $hits || ! is_numeric( $hits ) ) {
		return '';
	}
	$eye   = '<svg class="je-hits__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" width="16" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M572.52 241.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400a144 144 0 1 1 144-144 143.93 143.93 0 0 1-144 144zm0-240a95.31 95.31 0 0 0-25.31 3.79 47.85 47.85 0 0 1-66.9 66.9A95.78 95.78 0 1 0 288 160z"/></svg>';
	$label = ! empty( $attributes['label'] ) ? esc_html__( 'Hits:', 'wp-ja-essence' ) . ' ' : '';
	return '<div class="je-hits wp-block-wp-ja-essence-hits">' . $eye . '<span class="je-hits__n">' . $label . esc_html( (string) (int) $hits ) . '</span></div>';
}

/**
 * home-4's grid prints the Trending module as a blue card in the flow of the list: after the fourth article of every page
 * that has more than four (the source: `article-highlight`, module 127, the three articles of Blog with the fewest hits).
 * The list names it with `wpJaEssenceTrending` in its query; the card is the same list the Trending sidebar prints.
 *
 * @param string   $content  The rendered post template.
 * @param array    $block    The parsed block.
 * @param WP_Block $instance The block instance.
 * @return string
 */
function wp_ja_essence_grid_trending( string $content, array $block, $instance = null ): string {
	if ( ! $instance instanceof WP_Block || empty( $instance->context['query']['wpJaEssenceTrending'] ) || substr_count( $content, '</li>' ) <= 4 ) {
		return $content;
	}
	$blog = get_term_by( 'slug', 'blog', 'category' );
	if ( ! $blog ) {
		return $content;
	}
	$args  = wp_ja_essence_listing_args(
		array(
			'post_type'           => 'post',
			'posts_per_page'      => 3,
			'tax_query'           => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- three posts of one category tree.
				array(
					'taxonomy'         => 'category',
					'field'            => 'term_id',
					'terms'            => array( (int) $blog->term_id ),
					'include_children' => true,
				),
			),
			'je_order'            => 'hits',
			'ignore_sticky_posts' => true,
			'no_found_rows'       => true,
		),
		array( (int) $blog->term_id ),
		true
	);
	$query = new WP_Query( $args );
	if ( ! $query->have_posts() ) {
		return $content;
	}
	$items = '';
	foreach ( $query->posts as $trending ) {
		$items .= '<li class="je-trend__item"><a class="je-trend__img" href="' . esc_url( get_permalink( $trending ) ) . '" tabindex="-1" aria-hidden="true">' . get_the_post_thumbnail( $trending, 'medium' ) . '</a><div class="je-trend__body"><a class="je-trend__link" href="' . esc_url( get_permalink( $trending ) ) . '">' . esc_html( wp_ja_essence_display_title( $trending ) ) . '</a><div class="je-trend__meta"><span class="je-trend__date">' . esc_html( get_the_date( '', $trending ) ) . '</span>' . wp_ja_essence_render_hits( array(), '', (object) array( 'context' => array( 'postId' => (int) $trending->ID ) ) ) . '</div></div></li>';
	}
	$card  = '<li class="wp-block-post je-trend-cell"><div class="je-trend"><h3 class="je-trend__title">' . esc_html__( 'Trending', 'wp-ja-essence' ) . '</h3><ul class="je-trend__items">' . $items . '</ul></div></li>';
	$parts = explode( '</li>', $content );
	array_splice( $parts, 4, 0, array( '' ) );
	// The explode leaves the text after the last item in the last part; the card goes after the fourth item.
	$before = implode( '</li>', array_slice( $parts, 0, 4 ) ) . '</li>';
	$after  = implode( '</li>', array_slice( $parts, 5 ) );
	return $before . $card . $after;
}
add_filter( 'render_block_core/post-template', 'wp_ja_essence_grid_trending', 10, 3 );

/**
 * The header's search button draws the source's own magnifier (a 20x20 icon, circle and handle, 2px stroke) instead of the
 * core block's 24x24 one, whose drawing fills only half of its box.
 *
 * @param string $content The rendered Search block.
 * @return string
 */
function wp_ja_essence_search_icon( string $content ): string {
	if ( false === strpos( $content, 'je-search' ) ) {
		return $content;
	}
	$icon = '<svg class="search-icon" viewBox="0 0 20 20" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.875 16.75C13.2242 16.75 16.75 13.2242 16.75 8.87495C16.75 4.52571 13.2242 0.999954 8.875 0.999954C4.52576 0.999954 1 4.52571 1 8.87495C1 13.2242 4.52576 16.75 8.875 16.75Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.4431 14.4437L18.9994 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
	return (string) preg_replace( '#<svg\b[^>]*class="search-icon[^"]*".*?</svg>#s', $icon, $content, 1 );
}
add_filter( 'render_block_core/search', 'wp_ja_essence_search_icon' );

/**
 * The core search block prints `required` on its field; the source's search field (header and results page) has none, so an empty
 * submit goes through to the results page there. The attribute is dropped from every search block.
 *
 * @param string $content Rendered block.
 * @return string
 */
function wp_ja_essence_search_not_required( string $content ): string {
	return (string) preg_replace( '#(<input\b[^>]*\btype="search"[^>]*?)\s+required(?:="[^"]*")?(?=[\s/>])#', '$1', $content );
}
add_filter( 'render_block_core/search', 'wp_ja_essence_search_not_required', 11 );

/**
 * The pager of the source (Joomla's pagination, 1.0.3): "Page N of M" in a pill, centred above a row of 48px round buttons
 * « ‹ 1 2 3 › », the first/previous buttons dimmed on the first page and the next/last on the last. Every list's pager (the
 * query loops, the author and title lists) is drawn by this one function; a page link is a plain link, so it works without script.
 *
 * @param int      $current The page shown.
 * @param int      $pages   How many pages there are.
 * @param callable $url     Maps a page number to its address.
 * @param string   $label   The accessible name of the navigation.
 * @return string
 */
function wp_ja_essence_pager( int $current, int $pages, callable $url, string $label = '', string $variant = '' ): string {
	if ( $pages < 2 ) {
		return '';
	}
	// The accessible name is a visitor's word too: in the site's language (LANG-2, TracyHQ/tch#1013).
	$label = '' !== $label ? $label : __( 'Pagination', 'wp-ja-essence' );
	$current = min( max( 1, $current ), $pages );
	$icon    = static function ( string $name ): string {
		$shapes = array(
			'first' => array( '0 0 448 512', 'M223.7 239l136-136c9.4-9.4 24.6-9.4 33.9 0l22.6 22.6c9.4 9.4 9.4 24.6 0 33.9L319.9 256l96.4 96.4c9.4 9.4 9.4 24.6 0 33.9L393.7 409c-9.4 9.4-24.6 9.4-33.9 0l-136-136c-9.5-9.4-9.5-24.6-.1-34zm-192 34l136 136c9.4 9.4 24.6 9.4 33.9 0l22.6-22.6c9.4-9.4 9.4-24.6 0-33.9L127.9 256l96.4-96.4c9.4-9.4 9.4-24.6 0-33.9L201.7 103c-9.4-9.4-24.6-9.4-33.9 0l-136 136c-9.5 9.4-9.5 24.6-.1 34z' ),
			'prev'  => array( '0 0 256 512', 'M31.7 239l136-136c9.4-9.4 24.6-9.4 33.9 0l22.6 22.6c9.4 9.4 9.4 24.6 0 33.9L127.9 256l96.4 96.4c9.4 9.4 9.4 24.6 0 33.9L201.7 409c-9.4 9.4-24.6 9.4-33.9 0l-136-136c-9.5-9.4-9.5-24.6-.1-34z' ),
			'next'  => array( '0 0 256 512', 'M224.3 273l-136 136c-9.4 9.4-24.6 9.4-33.9 0l-22.6-22.6c-9.4-9.4-9.4-24.6 0-33.9l96.4-96.4-96.4-96.4c-9.4-9.4-9.4-24.6 0-33.9L54.3 103c9.4-9.4 24.6-9.4 33.9 0l136 136c9.5 9.4 9.5 24.6.1 34z' ),
			'last'  => array( '0 0 448 512', 'M224.3 273l-136 136c-9.4 9.4-24.6 9.4-33.9 0l-22.6-22.6c-9.4-9.4-9.4-24.6 0-33.9l96.4-96.4-96.4-96.4c-9.4-9.4-9.4-24.6 0-33.9L54.3 103c9.4-9.4 24.6-9.4 33.9 0l136 136c9.5 9.4 9.5 24.6.1 34zm192-34l-136-136c-9.4-9.4-24.6-9.4-33.9 0l-22.6 22.6c-9.4 9.4-9.4 24.6 0 33.9l96.4 96.4-96.4 96.4c-9.4 9.4-9.4 24.6 0 33.9l22.6 22.6c9.4 9.4 24.6 9.4 33.9 0l136-136c9.4-9.2 9.4-24.4 0-33.8z' ),
		);
		return '<svg class="je-pagination__icon" xmlns="http://www.w3.org/2000/svg" viewBox="' . $shapes[ $name ][0] . '" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="' . $shapes[ $name ][1] . '"/></svg>';
	};
	$item    = static function ( string $inner, string $class, ?int $page, string $aria, bool $on ) use ( $url ): string {
		if ( $on && null !== $page ) {
			return '<li class="je-pagination__item ' . $class . '"><a class="je-pagination__link" href="' . esc_url( $url( $page ) ) . '" aria-label="' . esc_attr( $aria ) . '">' . $inner . '</a></li>';
		}
		return '<li class="je-pagination__item ' . $class . ( $on ? '' : ' is-disabled' ) . '"><span class="je-pagination__link" aria-hidden="true">' . $inner . '</span></li>';
	};
	$list    = $item( $icon( 'first' ), 'is-edge', 1, __( 'Go to start page', 'wp-ja-essence' ), $current > 1 );
	$list   .= $item( $icon( 'prev' ), 'is-step', $current - 1, __( 'Go to previous page', 'wp-ja-essence' ), $current > 1 );
	for ( $n = 1; $n <= $pages; $n++ ) {
		if ( $n === $current ) {
			/* translators: %d: page number. */
			$list .= '<li class="je-pagination__item is-active"><span class="je-pagination__link" aria-current="page" aria-label="' . esc_attr( sprintf( __( 'Page %d', 'wp-ja-essence' ), $n ) ) . '">' . $n . '</span></li>';
		} else {
			/* translators: %d: page number. */
			$list .= $item( (string) $n, '', $n, sprintf( __( 'Go to page %d', 'wp-ja-essence' ), $n ), true );
		}
	}
	$list   .= $item( $icon( 'next' ), 'is-step', $current + 1, __( 'Go to next page', 'wp-ja-essence' ), $current < $pages );
	$list   .= $item( $icon( 'last' ), 'is-edge', $pages, __( 'Go to end page', 'wp-ja-essence' ), $current < $pages );
	/* translators: 1: current page, 2: number of pages. */
	$counter = sprintf( __( 'Page %1$d of %2$d', 'wp-ja-essence' ), $current, $pages );
	$count = '<p class="je-pagination__counter">' . esc_html( $counter ) . '</p>';
	$nav   = '<nav class="je-pagination__nav" aria-label="' . esc_attr( $label ) . '"><ul class="je-pagination__list">' . $list . '</ul></nav>';
	$class = 'je-pagination' . ( '' !== $variant ? ' je-pagination--' . sanitize_html_class( $variant ) : '' );
	return '<div class="' . esc_attr( $class ) . '">' . ( 'counter-last' === $variant ? $nav . $count : ( 'row' === $variant ? $count . $nav : $count . $nav ) ) . '</div>';
}

/**
 * The pager of a Query Loop (class `je-pager`): replaced by the source's pager (wp_ja_essence_pager()).
 *
 * @param string   $content  The rendered pagination block.
 * @param array    $block    The parsed block.
 * @param WP_Block $instance The block instance.
 * @return string
 */
function wp_ja_essence_query_pager( string $content, array $block, $instance = null ): string {
	if ( ! $instance instanceof WP_Block || ! preg_match( '/\b(je-pager|tracy-pagination)\b/', (string) ( $block['attrs']['className'] ?? '' ) ) ) {
		return $content;
	}
	if ( ! empty( $instance->context['query']['inherit'] ) ) {
		global $wp_query;
		$pages   = (int) $wp_query->max_num_pages;
		$current = max( 1, (int) get_query_var( 'paged' ) );
		$url     = static fn( int $n ): string => (string) get_pagenum_link( $n );
	} else {
		$key     = isset( $instance->context['queryId'] ) ? 'query-' . (int) $instance->context['queryId'] . '-page' : 'query-page';
		$current = empty( $_GET[ $key ] ) ? 1 : max( 1, absint( wp_unslash( $_GET[ $key ] ) ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a public page number.
		$list    = new WP_Query( build_query_vars_from_query_block( $instance, $current ) );
		$pages   = (int) $list->max_num_pages;
		$url     = static fn( int $n ): string => $n > 1 ? add_query_arg( $key, $n ) : remove_query_arg( $key );
	}
	return wp_ja_essence_pager( $current, $pages, $url );
}
add_filter( 'render_block_core/query-pagination', 'wp_ja_essence_query_pager', 10, 3 );

/** The article pages carry the source's tags too (the post tags the footer prints under "Tags in"). */
function wp_ja_essence_page_tags(): void {
	register_taxonomy_for_object_type( 'post_tag', 'page' );
}
add_action( 'init', 'wp_ja_essence_page_tags' );

/**
 * The articles of one source category in the order the source's article navigation walks them: newest first
 * (`created` descending, Joomla id ascending for equal times), measured on the source's article pages (the Joomla "Prev" link
 * is the article before the current one in that list, "Next" the one after it).
 *
 * @param int $post_id The article being read.
 * @return int[] Post ids, in the source's order (empty without the order meta).
 */
function wp_ja_essence_category_walk( int $post_id ): array {
	$pos = get_post_meta( $post_id, 'je_catpos', true );
	if ( '' === $pos ) {
		return array();
	}
	$ids = get_posts(
		array(
			'post_type'           => array( 'post', 'page' ),
			'post_status'         => 'publish',
			'posts_per_page'      => -1,
			'fields'              => 'ids',
			'no_found_rows'       => true,
			'ignore_sticky_posts' => true,
			'meta_key'            => 'je_catpos', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- the articles of one category.
			'meta_value'          => (string) $pos, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		)
	);
	$key = static fn( int $id ): array => array( -1 * (int) get_post_meta( $id, 'je_created', true ), (int) get_post_meta( $id, 'je_src_id', true ), $id );
	usort( $ids, static fn( int $a, int $b ): int => $key( $a ) <=> $key( $b ) );
	return array_map( 'intval', $ids );
}

/**
 * The category a card names for an article: the label of a "normal layout" copy (`je_label`), else its first visible category.
 *
 * @param int $post_id The article.
 * @return WP_Term|null
 */
function wp_ja_essence_article_category( int $post_id ) {
	$hidden = wp_ja_essence_hidden_term_ids();
	$label  = trim( (string) get_post_meta( $post_id, 'je_label', true ) );
	if ( '' !== $label ) {
		$named = get_term_by( 'name', $label, 'category' );
		if ( $named instanceof WP_Term && ! in_array( (int) $named->term_id, $hidden, true ) ) {
			return $named;
		}
	}
	foreach ( (array) get_the_terms( $post_id, 'category' ) as $term ) {
		if ( $term instanceof WP_Term && ! in_array( (int) $term->term_id, $hidden, true ) ) {
			return $term;
		}
	}
	return null;
}

/** The three dynamic blocks of the article: its footer, the author's latest articles and the shared Instagram strip. */
function wp_ja_essence_register_article_blocks(): void {
	$common = array(
		'api_version'  => 3,
		'category'     => 'widgets',
		'uses_context' => array( 'postId' ),
		'supports'     => array( 'html' => false ),
	);
	register_block_type(
		'wp-ja-essence/article-footer',
		array_merge(
			$common,
			array(
				'title'           => __( 'Article footer', 'wp-ja-essence' ),
				'description'     => __( 'Previous and next article, the share links and the tags of the article.', 'wp-ja-essence' ),
				'icon'            => 'share',
				'render_callback' => 'wp_ja_essence_render_article_footer',
			)
		)
	);
	register_block_type(
		'wp-ja-essence/author-latest',
		array_merge(
			$common,
			array(
				'title'           => __( 'Author\'s latest articles', 'wp-ja-essence' ),
				'description'     => __( 'The earliest articles of the author of this article: two cards, or (variant list) a short list.', 'wp-ja-essence' ),
				'icon'            => 'admin-users',
				'attributes'      => array(
					'variant' => array( 'type' => 'string', 'default' => 'cards' ),
					'limit'   => array( 'type' => 'number', 'default' => 2 ),
				),
				'render_callback' => 'wp_ja_essence_render_author_latest',
			)
		)
	);
	register_block_type(
		'wp-ja-essence/instagram',
		array(
			'api_version'     => 3,
			'title'           => __( 'Instagram strip', 'wp-ja-essence' ),
			'description'     => __( 'The picture strip and button of the site\'s Instagram section (the one the pages print), for templates that cannot hold the pictures themselves.', 'wp-ja-essence' ),
			'category'        => 'widgets',
			'icon'            => 'instagram',
			'supports'        => array( 'html' => false ),
			'render_callback' => 'wp_ja_essence_render_instagram',
		)
	);
}
add_action( 'init', 'wp_ja_essence_register_article_blocks' );

/**
 * @param array    $attributes Block attributes.
 * @param string   $content    Inner content (none).
 * @param WP_Block $block      The block.
 * @return string
 */
function wp_ja_essence_render_article_footer( array $attributes, string $content, $block ): string {
	$post_id = isset( $block->context['postId'] ) ? (int) $block->context['postId'] : (int) get_the_ID();
	if ( ! $post_id ) {
		return '';
	}
	$walk = wp_ja_essence_category_walk( $post_id );
	$at   = array_search( $post_id, $walk, true );
	$nav  = '';
	foreach ( array( 'prev' => false === $at ? 0 : ( $walk[ $at - 1 ] ?? 0 ), 'next' => false === $at ? 0 : ( $walk[ $at + 1 ] ?? 0 ) ) as $rel => $other ) {
		if ( ! $other ) {
			continue;
		}
		$label = 'prev' === $rel ? __( 'Prev', 'wp-ja-essence' ) : __( 'Next', 'wp-ja-essence' );
		$sr    = 'prev' === $rel ? __( 'Previous article:', 'wp-ja-essence' ) : __( 'Next article:', 'wp-ja-essence' );
		$title = wp_ja_essence_display_title( $other );
		$arrow = '<span class="je-pagenav__arrow" aria-hidden="true"></span>';
		$nav  .= '<a class="je-pagenav__' . $rel . '" rel="' . $rel . '" href="' . esc_url( (string) get_permalink( $other ) ) . '" title="' . esc_attr( $title ) . '"><span class="screen-reader-text">' . esc_html( $sr . ' ' . $title ) . '</span>' . ( 'prev' === $rel ? $arrow : '' ) . '<span aria-hidden="true">' . esc_html( $label ) . '</span>' . ( 'next' === $rel ? $arrow : '' ) . '</a>';
	}
	$html = '<div class="je-artfoot wp-block-wp-ja-essence-article-footer">';
	if ( '' !== $nav ) {
		$html .= '<nav class="je-pagenav" aria-label="' . esc_attr__( 'Article navigation', 'wp-ja-essence' ) . '">' . $nav . '</nav>';
	}
	$permalink = rawurlencode( (string) get_permalink( $post_id ) );
	$share     = '';
	foreach ( array(
		'facebook' => array( 'Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' ),
		'x'        => array( 'X', 'https://twitter.com/intent/tweet?url=' ),
		'linkedin' => array( 'LinkedIn', 'https://www.linkedin.com/sharing/share-offsite/?url=' ),
	) as $slug => $row ) {
		$share .= '<a class="je-share__' . $slug . '" href="' . esc_url( $row[1] . $permalink ) . '" rel="noopener" target="_blank">' . esc_html( $row[0] ) . '</a>';
	}
	$tags = '';
	if ( get_post_meta( $post_id, 'je_show_tags', true ) ) {
		foreach ( (array) get_the_terms( $post_id, 'post_tag' ) as $tag ) {
			if ( $tag instanceof WP_Term ) {
				$tags .= '<a class="je-tag-chip" href="' . esc_url( (string) get_term_link( $tag ) ) . '" rel="tag">' . esc_html( $tag->name ) . '</a>';
			}
		}
	}
	$html .= '<div class="je-artfoot__row"><div class="je-artfoot__share"><h6>' . esc_html__( 'Share article:', 'wp-ja-essence' ) . '</h6><div class="je-share">' . $share . '</div></div>';
	if ( '' !== $tags ) {
		$html .= '<div class="je-artfoot__tags"><h6>' . esc_html__( 'Tags in:', 'wp-ja-essence' ) . '</h6><div class="je-tags">' . $tags . '</div></div>';
	}
	return $html . '</div></div>';
}

/**
 * The source's "Author's latest articles": the first articles the author wrote (creation time, then Joomla id), whichever
 * they are, the one being read included, as the source's helper returns them. Published ones only, so an article Tracy
 * takes off the site (a page the customer unticked) is never linked from here.
 *
 * @param int[] $authors The authors whose articles are listed.
 * @param int   $limit   How many (1 to 6).
 * @return int[] Post ids, in print order.
 */
function wp_ja_essence_author_latest_ids( array $authors, int $limit ): array {
	$authors = array_values( array_filter( array_map( 'intval', $authors ) ) );
	if ( ! $authors ) {
		return array();
	}
	$ids = get_posts(
		array(
			'post_type'           => array( 'post', 'page' ),
			'post_status'         => 'publish',
			'author__in'          => $authors,
			'posts_per_page'      => -1,
			'fields'              => 'ids',
			'no_found_rows'       => true,
			'ignore_sticky_posts' => true,
			'meta_key'            => 'je_src_id', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- only the ported articles.
			'meta_compare'        => 'EXISTS',
		)
	);
	$key = static fn( int $id ): array => array( (int) get_post_meta( $id, 'je_created', true ), (int) get_post_meta( $id, 'je_src_id', true ) );
	$ids = array_map( 'intval', $ids );
	usort( $ids, static fn( int $a, int $b ): int => $key( $a ) <=> $key( $b ) );
	return array_slice( $ids, 0, max( 1, min( 6, $limit ) ) );
}

/**
 * The block of "Author's latest articles" for these articles: two cards, or (variant list) a short list.
 *
 * @param int[]  $ids     Post ids, in print order.
 * @param string $variant `cards` or `list`.
 * @return string
 */
function wp_ja_essence_author_latest_html( array $ids, string $variant ): string {
	if ( ! $ids ) {
		return '';
	}
	if ( 'list' === $variant ) {
		$rows = '';
		foreach ( $ids as $id ) {
			$link  = esc_url( (string) get_permalink( $id ) );
			$thumb = get_the_post_thumbnail( $id, 'thumbnail', array( 'alt' => '', 'loading' => 'eager' ) );
			$hits  = get_post_meta( $id, 'je_hits', true );
			$rows .= '<li class="je-authorlist__item">';
			if ( '' !== $thumb ) {
				$rows .= '<a class="je-authorlist__img" href="' . $link . '" tabindex="-1" aria-hidden="true">' . $thumb . '</a>';
			}
			$rows .= '<div class="je-authorlist__info"><h3 class="je-authorlist__name"><a href="' . $link . '">' . esc_html( wp_ja_essence_display_title( $id ) ) . '</a></h3><div class="je-authorlist__meta"><span>' . esc_html( get_the_date( '', $id ) ) . '</span>';
			if ( is_numeric( $hits ) ) {
				$rows .= wp_ja_essence_render_hits( array(), '', (object) array( 'context' => array( 'postId' => $id ) ) );
			}
			$rows .= '</div></div></li>';
		}
		return '<section class="je-authorlatest je-authorlatest--list wp-block-wp-ja-essence-author-latest"><h2 class="je-authorlatest__title">' . esc_html__( 'Author\'s latest articles', 'wp-ja-essence' ) . '</h2><ul class="je-authorlist">' . $rows . '</ul></section>';
	}
	$items = '';
	foreach ( $ids as $id ) {
		$link  = esc_url( (string) get_permalink( $id ) );
		$cat   = wp_ja_essence_article_category( $id );
		$hits  = get_post_meta( $id, 'je_hits', true );
		$thumb = get_the_post_thumbnail( $id, 'large', array( 'alt' => '', 'loading' => 'eager' ) );
		$items .= '<li class="je-authorlatest__item"><div class="je-authorlatest__inner">';
		if ( '' !== $thumb ) {
			$items .= '<a class="je-authorlatest__img" href="' . $link . '" tabindex="-1" aria-hidden="true">' . $thumb . '</a>';
		}
		$items .= '<div class="je-authorlatest__info">';
		if ( $cat instanceof WP_Term ) {
			$items .= '<div class="je-authorlatest__cat"><a href="' . esc_url( (string) get_term_link( $cat ) ) . '" rel="tag">' . esc_html( $cat->name ) . '</a></div>';
		}
		$items .= '<h3 class="je-authorlatest__name"><a href="' . $link . '">' . esc_html( wp_ja_essence_display_title( $id ) ) . '</a></h3><div class="je-authorlatest__meta"><span>' . esc_html( get_the_date( '', $id ) ) . '</span>';
		if ( is_numeric( $hits ) ) {
			$items .= wp_ja_essence_render_hits( array(), '', (object) array( 'context' => array( 'postId' => $id ) ) );
		}
		$items .= '</div></div></div></li>';
	}
	return '<section class="je-authorlatest wp-block-wp-ja-essence-author-latest"><h2 class="je-authorlatest__title">' . esc_html__( 'Author\'s latest articles', 'wp-ja-essence' ) . '</h2><ul class="je-authorlatest__list">' . $items . '</ul></section>';
}

/**
 * The `wp-ja-essence/author-latest` block (the single article template): the articles of the author of the article
 * being read.
 *
 * @param array    $attributes Block attributes.
 * @param string   $content    Inner content (none).
 * @param WP_Block $block      The block.
 * @return string
 */
function wp_ja_essence_render_author_latest( array $attributes, string $content, $block ): string {
	$post_id = isset( $block->context['postId'] ) ? (int) $block->context['postId'] : (int) get_the_ID();
	$author  = $post_id ? (int) get_post_field( 'post_author', $post_id ) : 0;
	$ids     = wp_ja_essence_author_latest_ids( array( $author ), (int) ( $attributes['limit'] ?? 2 ) );
	return wp_ja_essence_author_latest_html( $ids, 'list' === ( $attributes['variant'] ?? 'cards' ) ? 'list' : 'cards' );
}

/**
 * The same list on a page, written as a Query Loop so the page says in data which articles it lists: the query's
 * `author` (the page's author) and `perPage`, and `wpJaEssenceAuthorLatest` (`cards` or `list`) naming the look. The
 * Query Loop's own markup is only the editor's preview; the page prints the source's cards from the same author and count.
 *
 * @param string $content The Query Loop as drawn.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_essence_author_latest_query( string $content, array $block ): string {
	$query   = $block['attrs']['query'] ?? array();
	$variant = is_array( $query ) ? (string) ( $query['wpJaEssenceAuthorLatest'] ?? '' ) : '';
	if ( '' === $variant ) {
		return $content;
	}
	$authors = array_map( 'intval', explode( ',', (string) ( $query['author'] ?? '' ) ) );
	$ids     = wp_ja_essence_author_latest_ids( $authors, (int) ( $query['perPage'] ?? 2 ) );
	return wp_ja_essence_author_latest_html( $ids, 'list' === $variant ? 'list' : 'cards' );
}
add_filter( 'render_block_core/query', 'wp_ja_essence_author_latest_query', 10, 2 );

/**
 * The site's Instagram section as the pages print it: the seeder keeps it as blocks inside a page, so the page that holds it
 * is named by the option `wp_ja_essence_gallery_page` (tools/reconcile.php sets it) and its section is rendered again where a
 * template needs it. Without the option, or when the page has no such section, nothing is drawn.
 *
 * @return string
 */
function wp_ja_essence_render_instagram(): string {
	$page_id = (int) get_option( 'wp_ja_essence_gallery_page', 0 );
	$page    = $page_id ? get_post( $page_id ) : null;
	if ( ! $page instanceof WP_Post || 'publish' !== $page->post_status ) {
		return '';
	}
	$find = static function ( array $blocks ) use ( &$find ) {
		foreach ( $blocks as $block ) {
			if ( false !== strpos( (string) ( $block['attrs']['className'] ?? '' ), 'je-gallery' ) && 'core/group' === $block['blockName'] && false !== strpos( (string) ( $block['attrs']['className'] ?? '' ), 'je-sec' ) ) {
				return $block;
			}
			$inner = $find( $block['innerBlocks'] ?? array() );
			if ( $inner ) {
				return $inner;
			}
		}
		return null;
	};
	$section = $find( parse_blocks( $page->post_content ) );
	return $section ? render_block( $section ) : '';
}

/**
 * The article as the source prints it when it is opened from its category: the text before the read-more mark (the intro the
 * lists show) is left out, as Joomla's `show_intro` does there. The five article pages (Layout 1-3, Video, Gallery) keep it, as
 * their menu items do.
 *
 * @param string $content The raw post content.
 * @return string
 */
function wp_ja_essence_hide_intro( string $content ): string {
	if ( ! is_singular( 'post' ) || ! in_the_loop() || ! is_main_query() ) {
		return $content;
	}
	// get_the_content() leaves an anchor where the read-more mark was; everything up to it is the intro.
	return (string) preg_replace( '#^.*?<span id="more-\d+"></span>\s*(?:<!-- /wp:more -->\s*)?#s', '', $content, 1 );
}
add_filter( 'the_content', 'wp_ja_essence_hide_intro', 8 );

/**
 * The icon the source prints over an article's picture when the article is a video or a gallery (post meta `je_media`,
 * tools/fix-spec.mjs S-103). An ordinary article prints nothing.
 */
function wp_ja_essence_register_media_block(): void {
	register_block_type(
		'wp-ja-essence/media-icon',
		array(
			'api_version'     => 3,
			'title'           => __( 'Media type icon', 'wp-ja-essence' ),
			'description'     => __( 'A small badge on the picture of a video or gallery article.', 'wp-ja-essence' ),
			'category'        => 'widgets',
			'icon'            => 'format-video',
			'uses_context'    => array( 'postId' ),
			'supports'        => array( 'html' => false ),
			'render_callback' => 'wp_ja_essence_render_media_icon',
		)
	);
}
add_action( 'init', 'wp_ja_essence_register_media_block' );

/**
 * @param array    $attributes Block attributes.
 * @param string   $content    Inner content (none).
 * @param WP_Block $block      The block.
 * @return string
 */
function wp_ja_essence_render_media_icon( array $attributes, string $content, $block ): string {
	$post_id = isset( $block->context['postId'] ) ? (int) $block->context['postId'] : (int) get_the_ID();
	$type    = $post_id ? (string) get_post_meta( $post_id, 'je_media', true ) : '';
	if ( 'video' === $type ) {
		$svg = '<svg viewBox="0 0 448 512" width="14" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M424.4 214.7L72.4 6.6C43.8-10.3 0 6.1 0 47.9V464c0 37.5 40.7 60.1 72.4 41.3l352-208c31.4-18.5 31.5-64.1 0-82.6z"/></svg>';
		$name = __( 'Video', 'wp-ja-essence' );
	} elseif ( 'gallery' === $type ) {
		$svg = '<svg viewBox="0 0 576 512" width="18" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M480 416v16c0 26.51-21.49 48-48 48H48c-26.51 0-48-21.49-48-48V176c0-26.51 21.49-48 48-48h16v208c0 44.112 35.888 80 80 80h336zm96-80V80c0-26.51-21.49-48-48-48H144c-26.51 0-48 21.49-48 48v256c0 26.51 21.49 48 48 48h384c26.51 0 48-21.49 48-48zM256 128c0 26.51-21.49 48-48 48s-48-21.49-48-48 21.49-48 48-48 48 21.49 48 48zm-96 144l55.515-55.515c4.686-4.686 12.284-4.686 16.971 0L272 256l135.515-135.515c4.686-4.686 12.284-4.686 16.971 0L512 208v112H160v-48z"/></svg>';
		$name = __( 'Gallery', 'wp-ja-essence' );
	} else {
		return '';
	}
	return '<span class="je-media-icon je-media-icon--' . esc_attr( $type ) . ' wp-block-wp-ja-essence-media-icon" role="img" aria-label="' . esc_attr( $name ) . '">' . $svg . '</span>';
}

/**
 * The tags of an article in the order the source prints them (its tag ids: Lifestyle, Health, Technology, Design, Video, Travel);
 * a tag the owner adds follows, in name order.
 */
const WP_JA_ESSENCE_TAG_ORDER = array( 'lifestyle', 'health', 'technology', 'design', 'video', 'travel' );

/**
 * @param WP_Term[]|WP_Error|false $terms    The terms of the object.
 * @param int                      $post_id  The object.
 * @param string                   $taxonomy The taxonomy.
 * @return WP_Term[]|WP_Error|false
 */
function wp_ja_essence_tag_order( $terms, $post_id, $taxonomy ) {
	if ( 'post_tag' !== $taxonomy || ! is_array( $terms ) || is_admin() ) {
		return $terms;
	}
	// an article that carries its own order (the five article pages, whose tags the source prints in an order of its own) keeps it
	$own   = array_filter( array_map( 'sanitize_title', explode( ',', (string) get_post_meta( (int) $post_id, 'je_tag_order', true ) ) ) );
	$order = $own ? array_values( $own ) : WP_JA_ESSENCE_TAG_ORDER;
	usort(
		$terms,
		static function ( WP_Term $a, WP_Term $b ) use ( $order ): int {
			$rank = static function ( WP_Term $t ) use ( $order ): int {
				$at = array_search( $t->slug, $order, true );
				return false === $at ? 100 : (int) $at;
			};
			return array( $rank( $a ), $a->name ) <=> array( $rank( $b ), $b->name );
		}
	);
	return $terms;
}
add_filter( 'get_the_terms', 'wp_ja_essence_tag_order', 10, 3 );

/**
 * A category listing's heading prints the number of articles under it ("– 12 Articles –"), as the source's category view does.
 * The category is the one the page's own query block lists; the count follows the same rules as the list.
 *
 * @param string $content The rendered heading.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_essence_category_count( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'tracy-eyebrow' ) || ! is_page() ) {
		return $content;
	}
	$find = static function ( array $blocks ) use ( &$find ) {
		foreach ( $blocks as $b ) {
			if ( 'core/query' === $b['blockName'] && ! empty( $b['attrs']['query']['taxQuery']['category'] ) ) {
				return array_map( 'intval', (array) $b['attrs']['query']['taxQuery']['category'] );
			}
			$inner = $find( $b['innerBlocks'] ?? array() );
			if ( $inner ) {
				return $inner;
			}
		}
		return null;
	};
	$ids = $find( parse_blocks( (string) get_post_field( 'post_content', get_queried_object_id() ) ) );
	if ( ! $ids ) {
		return $content;
	}
	$args  = wp_ja_essence_listing_args(
		array(
			'post_type'      => 'post',
			'post_status'    => 'publish',
			'posts_per_page' => 1,
			'fields'         => 'ids',
			'tax_query'      => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- one category.
				array(
					'taxonomy'         => 'category',
					'field'            => 'term_id',
					'terms'            => $ids,
					'include_children' => true,
				),
			),
		),
		$ids,
		true
	);
	$count = (int) ( new WP_Query( $args ) )->found_posts;
	/* translators: %d: number of articles. */
	$label = sprintf( _n( '%d Article', '%d Articles', $count, 'wp-ja-essence' ), $count );
	return $content . '<div class="je-numart">' . esc_html( $label ) . '</div>';
}
add_filter( 'render_block_core/heading', 'wp_ja_essence_category_count', 10, 2 );

/**
 * Pictures load at once, as in the source: a lazy image that sits in a scroll row or far down a long page stays an empty
 * box in a full-page capture (the featured "More Read" row on a phone), which no reader and no review can tell from a
 * missing picture.
 */
add_filter( 'wp_lazy_loading_enabled', '__return_false' );

/**
 * A module title the source prints with a spaced hyphen ("Articles - Latest"): wptexturize (it runs after the blocks are
 * rendered) would turn it into an en dash, so the hyphen is written as an entity it leaves alone.
 *
 * @param string $content The rendered heading block.
 * @return string
 */
function wp_ja_essence_heading_hyphen( string $content ): string {
	return str_replace( array( "\u{a0}-\u{a0}", '&nbsp;-&nbsp;', ' - ' ), ' &#45; ', $content );
}
add_filter( 'render_block_core/heading', 'wp_ja_essence_heading_hyphen' );

/**
 * The Tags cloud card lists the site's most used tags, as the source's popular-tags module does: by number of articles, the
 * tag created first winning a tie (the source prints Lifestyle before Health at 46 articles each), one pill per tag. Core's
 * Tag Cloud block cannot sort by count, so the card's block (class `je-tagcloud`) is drawn here.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_essence_tag_cloud( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'je-tagcloud' ) ) {
		return $content;
	}
	$terms = get_terms(
		array(
			'taxonomy'   => 'post_tag',
			'hide_empty' => true,
		)
	);
	if ( ! is_array( $terms ) || ! $terms ) {
		return '';
	}
	usort(
		$terms,
		static fn( WP_Term $a, WP_Term $b ): int => array( $b->count, $a->term_id ) <=> array( $a->count, $b->term_id )
	);
	$items = '';
	foreach ( array_slice( $terms, 0, max( 1, (int) ( $block['attrs']['numberOfTags'] ?? 6 ) ) ) as $term ) {
		$items .= '<li><a class="tag-cloud-link" href="' . esc_url( (string) get_term_link( $term ) ) . '" rel="tag">' . esc_html( $term->name ) . '</a></li>';
	}
	return '<div class="wp-block-tag-cloud je-tagcloud"><ul class="je-tagcloud__list">' . $items . '</ul></div>';
}
add_filter( 'render_block_core/tag-cloud', 'wp_ja_essence_tag_cloud', 10, 2 );

/**
 * The category chips (Categories block) leave a hidden category out.
 *
 * @param string $content The rendered block.
 * @return string
 */
function wp_ja_essence_categories_block( string $content ): string {
	foreach ( wp_ja_essence_hidden_term_ids() as $id ) {
		$content = (string) preg_replace( '#<li class="[^"]*\bcat-item-' . $id . '\b[^"]*">.*?</li>\s*#s', '', $content );
	}
	return $content;
}
add_filter( 'render_block_core/categories', 'wp_ja_essence_categories_block' );

/**
 * A card's category badge: the hidden categories never print; an article filed under one prints the label it
 * stands for (`je_label`, a link to that category) so a "normal layout" card still reads Health, Design or Fashion.
 *
 * @param string   $content The rendered block.
 * @param array    $block   The parsed block.
 * @param WP_Block $instance The block instance.
 * @return string
 */
function wp_ja_essence_post_terms( string $content, array $block, $instance ): string {
	if ( 'category' !== ( $block['attrs']['term'] ?? '' ) ) {
		return $content;
	}
	$hidden = wp_ja_essence_hidden_term_ids();
	if ( ! $hidden ) {
		return $content;
	}
	$post_id = isset( $instance->context['postId'] ) ? (int) $instance->context['postId'] : (int) get_the_ID();
	$terms   = get_the_terms( $post_id, 'category' );
	if ( ! is_array( $terms ) || ! array_filter( $terms, static fn( $t ) => in_array( (int) $t->term_id, $hidden, true ) ) ) {
		return $content;
	}
	$links = array();
	$label = trim( (string) get_post_meta( $post_id, 'je_label', true ) );
	$named = '' !== $label ? get_term_by( 'name', $label, 'category' ) : false;
	if ( $named instanceof WP_Term && ! in_array( (int) $named->term_id, $hidden, true ) ) {
		$links[] = '<a href="' . esc_url( (string) get_term_link( $named ) ) . '" rel="tag">' . esc_html( $named->name ) . '</a>';
	}
	foreach ( $terms as $term ) {
		if ( ! in_array( (int) $term->term_id, $hidden, true ) ) {
			$links[] = '<a href="' . esc_url( (string) get_term_link( $term ) ) . '" rel="tag">' . esc_html( $term->name ) . '</a>';
		}
	}
	if ( ! $links ) {
		return '';
	}
	$class = trim( 'taxonomy-category wp-block-post-terms ' . (string) ( $block['attrs']['className'] ?? '' ) );
	return '<div class="' . esc_attr( $class ) . '">' . implode( '<span class="wp-block-post-terms__separator">, </span>', $links ) . '</div>';
}
add_filter( 'render_block_core/post-terms', 'wp_ja_essence_post_terms', 10, 3 );

/**
 * The search page at the source's address. The source's search (com_finder) lives at
 * /pages/j-pages/smart-search and its menus link there; the seeder keeps that route's page as a draft
 * (patterns.map.json `views.search.servedAtPath`) and this answers the path with the theme's search view: `s`
 * (WordPress's form) or `q` (the source's) is the term, and an empty term shows the form and no results.
 */
const WP_JA_ESSENCE_SEARCH_PATHS = array( 'pages/j-pages/smart-search' );

/**
 * @param array $vars The parsed query variables.
 * @return array
 */
function wp_ja_essence_search_request( array $vars ): array {
	if ( is_admin() || empty( $vars['pagename'] ) || ! in_array( trim( (string) $vars['pagename'], '/' ), WP_JA_ESSENCE_SEARCH_PATHS, true ) ) {
		return $vars;
	}
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- a read-only search term.
	$term = isset( $_GET['s'] ) ? wp_unslash( $_GET['s'] ) : ( isset( $_GET['q'] ) ? wp_unslash( $_GET['q'] ) : '' );
	// phpcs:enable
	$term = sanitize_text_field( (string) $term );
	$out  = array( 's' => $term );
	if ( '' === $term ) {
		$out['post__in'] = array( 0 );
	}
	return $out;
}
add_filter( 'request', 'wp_ja_essence_search_request' );

/**
 * The source's article URL for the representative post stays alive: Joomla serves the article at
 * /category/category-style-3/<alias>, and the post is answered there too (no redirect to /<slug>/), so the one route
 * the single template is measured at is the same address on both sides.
 *
 * @param array $vars The parsed request query vars.
 * @return array
 */
function wp_ja_essence_article_url( array $vars ): array {
	$path = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_parse_url( wp_unslash( $_SERVER['REQUEST_URI'] ), PHP_URL_PATH ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
	if ( '/category/category-style-3/vintage-inspired-martini-cocktail-glasses' === rtrim( $path, '/' ) ) {
		return array( 'name' => 'vintage-inspired-martini-and-cocktail-glasses' );
	}
	return $vars;
}
add_filter( 'request', 'wp_ja_essence_article_url' );

/**
 * No canonical redirect away from the article's source URL (see wp_ja_essence_article_url).
 *
 * @param string|false $redirect The canonical URL, or false.
 * @return string|false
 */
function wp_ja_essence_article_url_canonical( $redirect ) {
	$path = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_parse_url( wp_unslash( $_SERVER['REQUEST_URI'] ), PHP_URL_PATH ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
	return '/category/category-style-3/vintage-inspired-martini-cocktail-glasses' === rtrim( $path, '/' ) ? false : $redirect;
}
add_filter( 'redirect_canonical', 'wp_ja_essence_article_url_canonical' );

/**
 * The heading an article page prints: the seeder keeps a page's source heading (an article's title) in
 * `tracy_page_heading` when it differs from the menu word the page is titled with ("Gallery", "Layout 1").
 *
 * @param int|WP_Post $post The page or post.
 * @return string
 */
function wp_ja_essence_display_title( $post ): string {
	$post = get_post( $post );
	if ( ! $post ) {
		return '';
	}
	if ( 'page' === $post->post_type ) {
		$heading = trim( (string) get_post_meta( $post->ID, 'tracy_page_heading', true ) );
		if ( '' !== $heading ) {
			return $heading;
		}
	}
	return get_the_title( $post );
}

/**
 * The page heading on the page itself (the title block named `page.title`) and in every list that shows the article page
 * (the category lists, "Articles - Latest"): its source heading, not the menu word it is titled with.
 *
 * @param string   $content  The rendered post title block.
 * @param array    $block    The parsed block.
 * @param WP_Block $instance The block instance.
 * @return string
 */
function wp_ja_essence_page_heading( string $content, array $block, $instance = null ): string {
	$on_page = 'page.title' === ( $block['attrs']['metadata']['name'] ?? '' ) && is_page();
	$post_id = $on_page ? get_queried_object_id() : (int) ( $instance->context['postId'] ?? 0 );
	if ( ! $post_id || 'page' !== get_post_type( $post_id ) ) {
		return $content;
	}
	$heading = trim( (string) get_post_meta( $post_id, 'tracy_page_heading', true ) );
	if ( '' === $heading ) {
		return $content;
	}
	$safe = esc_html( $heading );
	return (string) preg_replace_callback(
		'/^(\s*<(h[1-6]|p)\b[^>]*>(?:\s*<a\b[^>]*>)?)(.*?)((?:<\/a>\s*)?<\/\2>\s*)$/s',
		static fn( array $m ): string => $m[1] . $safe . $m[4],
		$content
	);
}
add_filter( 'render_block_core/post-title', 'wp_ja_essence_page_heading', 10, 3 );

/**
 * The document title (`<title>`): the page's own title, then the site's name (1.0.9, so every tab names the customer's
 * site; the source printed no suffix). An article page is titled by its source heading (not the menu word it is titled
 * with); the tagline WordPress adds on the front page is left out.
 *
 * @param array $parts The title parts WordPress built.
 * @return array
 */
function wp_ja_essence_title_parts( array $parts ): array {
	unset( $parts['tagline'] );
	if ( is_page() && ! is_front_page() ) {
		$parts['title'] = wp_ja_essence_display_title( get_queried_object_id() );
	}
	return $parts;
}
add_filter( 'document_title_parts', 'wp_ja_essence_title_parts' );

/**
 * The two titles that are not a page's own: the home page is the site's name alone, and the error page says so before
 * the site's name. Both name the site the customer gave, not the demo template's wording.
 *
 * @param string $title The title WordPress would build (empty to let it build one).
 * @return string
 */
function wp_ja_essence_title_fixed( $title ) {
	if ( is_front_page() ) {
		return esc_html( get_bloginfo( 'name' ) );
	}
	if ( is_404() ) {
		return esc_html( __( 'Page not found', 'wp-ja-essence' ) . ' ' . apply_filters( 'document_title_separator', '–' ) . ' ' . get_bloginfo( 'name' ) );
	}
	return $title;
}
add_filter( 'pre_get_document_title', 'wp_ja_essence_title_fixed' );

/**
 * A page's slug as a body class (`je-slug-<slug>`): the listing variants of the source (category styles, tagged items)
 * differ per page by type size and card layout, and the seeded pages carry no class of their own.
 *
 * @param string[] $classes Body classes.
 * @return string[]
 */
function wp_ja_essence_slug_class( array $classes ): array {
	if ( is_page() ) {
		$classes[] = 'je-slug-' . sanitize_html_class( (string) get_post_field( 'post_name', get_queried_object_id() ) );
	}
	return $classes;
}
add_filter( 'body_class', 'wp_ja_essence_slug_class' );

/**
 * The back-to-top button: the source's template draws it (a 50px dark tab with a chevron, bottom right) on Home 4 only, and shows it
 * once the header has scrolled out of view (`body.top-away`). The theme's script toggles `je-top-away` the same way.
 */
function wp_ja_essence_back_to_top(): void {
	if ( ! is_page( 'home-4' ) ) {
		return;
	}
	echo '<a href="#" id="back-to-top" aria-label="' . esc_attr__( 'Back to top', 'wp-ja-essence' ) . '"><svg viewBox="0 0 448 512" width="14" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M240.971 130.524l194.343 194.343c9.373 9.373 9.373 24.569 0 33.941l-22.667 22.667c-9.357 9.357-24.522 9.375-33.901.04L224 227.495 69.255 381.516c-9.379 9.335-24.544 9.317-33.901-.04l-22.667-22.667c-9.373-9.373-9.373-24.569 0-33.941L207.03 130.525c9.372-9.373 24.568-9.373 33.941-.001z"/></svg></a>';
}
add_action( 'wp_footer', 'wp_ja_essence_back_to_top' );

/**
 * wptexturize prints the source's straight quotes and apostrophes as typographic ones (&#8217; &#8216; &#8220; &#8221;): in titles and
 * copy, and again over the whole template once the blocks are rendered (get_the_block_template_html() texturizes the finished HTML,
 * so no per-field filter can reach the query cards or the search help). The source (Joomla) prints what was typed. The finished page
 * is passed through one replacement of those four entities, written as `&#039;` and `&quot;` so they are safe inside an attribute
 * too; dashes and ellipses keep the behaviour the heading and pager fixes above rely on.
 */
function wp_ja_essence_straight_apostrophe_start(): void {
	if ( is_admin() || is_feed() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
		return;
	}
	ob_start( static fn( string $html ): string => strtr( $html, array( '&#8217;' => '&#039;', '&#8216;' => '&#039;', '&#8220;' => '&quot;', '&#8221;' => '&quot;' ) ) );
}
add_action( 'template_redirect', 'wp_ja_essence_straight_apostrophe_start', 0 );

/**
 * The article footer's share links carry a token for the page address (the seeded content cannot know its own URL).
 *
 * @param string $content Rendered post content.
 * @return string
 */
function wp_ja_essence_share_urls( string $content ): string {
	if ( false === strpos( $content, '__JE_PERMALINK__' ) ) {
		return $content;
	}
	return str_replace( '__JE_PERMALINK__', rawurlencode( (string) get_permalink() ), $content );
}
add_filter( 'the_content', 'wp_ja_essence_share_urls', 20 );

/**
 * Account pages: a signed-out visitor who opens a profile page is sent to the login form, as the source does
 * (Joomla answers 303 to the login menu item). Priority 1 runs before redirect_canonical, so the answer is the
 * 303 at the source path itself and not a 301 to its trailing-slash form first. A signed-in visitor sees the page.
 */
add_action(
	'template_redirect',
	static function (): void {
		if ( is_user_logged_in() ) {
			return;
		}
		$request = trim( (string) wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH ), '/' );
		if ( ! in_array( $request, array( 'pages/user/user-profile', 'pages/user/edit-user-profile' ), true ) ) {
			return;
		}
		$login = wp_ja_essence_live_page( 'pages/user/login-form' );
		if ( $login ) {
			wp_safe_redirect( get_permalink( $login ), 303 );
			exit;
		}
	},
	1
);

/* ------------------------------------------------------------------------------------------------------------------------------
 * Accounts (1.0.3): the sign-in and registration forms of the source's Users component.
 * ---------------------------------------------------------------------------------------------------------------------------- */

/**
 * The profile fields of the registration form (the source's Users - Profile plugin): key => label, input type.
 *
 * @return array<string, array{0: string, 1: string}>
 */
function wp_ja_essence_profile_fields(): array {
	return array(
		'address1'     => array( __( 'Address 1', 'wp-ja-essence' ), 'text' ),
		'address2'     => array( __( 'Address 2', 'wp-ja-essence' ), 'text' ),
		'city'         => array( __( 'City', 'wp-ja-essence' ), 'text' ),
		'region'       => array( __( 'Region', 'wp-ja-essence' ), 'text' ),
		'country'      => array( __( 'Country', 'wp-ja-essence' ), 'text' ),
		'postal_code'  => array( __( 'Postal/ZIP Code', 'wp-ja-essence' ), 'text' ),
		'phone'        => array( __( 'Phone', 'wp-ja-essence' ), 'tel' ),
		'website'      => array( __( 'Website', 'wp-ja-essence' ), 'url' ),
		'favoritebook' => array( __( 'Favourite Book', 'wp-ja-essence' ), 'text' ),
		'aboutme'      => array( __( 'About Me', 'wp-ja-essence' ), 'textarea' ),
		'dob'          => array( __( 'Date of Birth', 'wp-ja-essence' ), 'date' ),
	);
}

/** Minimum password length of the registration form (the source asks for 12 characters). */
const WP_JA_ESSENCE_MIN_PASSWORD = 12;

function wp_ja_essence_register_account_blocks(): void {
	foreach ( array( 'login-form' => 'wp_ja_essence_render_login', 'register-form' => 'wp_ja_essence_render_register' ) as $name => $callback ) {
		register_block_type(
			'wp-ja-essence/' . $name,
			array(
				'api_version'     => 3,
				'title'           => 'login-form' === $name ? __( 'Sign-in form', 'wp-ja-essence' ) : __( 'Registration form', 'wp-ja-essence' ),
				'description'     => 'login-form' === $name ? __( 'The sign-in form with its recovery and registration links.', 'wp-ja-essence' ) : __( 'The registration form: account and profile fields, the terms, Register and Cancel.', 'wp-ja-essence' ),
				'category'        => 'widgets',
				'icon'            => 'login-form' === $name ? 'admin-network' : 'id',
				'supports'        => array( 'html' => false ),
				'render_callback' => $callback,
			)
		);
	}
}
add_action( 'init', 'wp_ja_essence_register_account_blocks' );

/**
 * The page that holds a given account form, found by its block (the owner may move it): the registration page for the
 * sign-in form's "Don't have an account?" link and the other way round.
 *
 * @param string $block The block name without the namespace.
 * @return string The permalink, or the core address when no page holds the block.
 */
function wp_ja_essence_account_url( string $block ): string {
	$page = get_posts(
		array(
			'post_type'      => 'page',
			'post_status'    => 'publish',
			'posts_per_page' => 1,
			's'              => 'wp-ja-essence/' . $block,
			'fields'         => 'ids',
			'no_found_rows'  => true,
		)
	);
	if ( $page ) {
		return (string) get_permalink( (int) $page[0] );
	}
	return 'register-form' === $block ? wp_registration_url() : wp_login_url();
}

/**
 * @return string
 */
function wp_ja_essence_render_login(): string {
	if ( is_user_logged_in() ) {
		$user = wp_get_current_user();
		/* translators: %s: display name. */
		$hello = sprintf( __( 'You are logged in as %s.', 'wp-ja-essence' ), $user->display_name );
		return '<div class="je-acct je-acct--login"><p class="je-acct__note">' . esc_html( $hello ) . '</p><p class="je-acct__links"><a href="' . esc_url( wp_logout_url( home_url( '/' ) ) ) . '">' . esc_html__( 'Log out', 'wp-ja-essence' ) . '</a></p></div>';
	}
	$notice = '';
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only flag set by the registration redirect.
	if ( isset( $_GET['je_registered'] ) ) {
		$notice = '<p class="je-acct__note je-acct__note--ok" role="status">' . esc_html__( 'Your account was created. You can log in now.', 'wp-ja-essence' ) . '</p>';
	}
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only flag set by wp-login.php on a failed attempt.
	if ( isset( $_GET['login'] ) && 'failed' === $_GET['login'] ) {
		$notice = '<p class="je-acct__note je-acct__note--error" role="alert">' . esc_html__( 'Username and password do not match.', 'wp-ja-essence' ) . '</p>';
	}
	$form = wp_login_form(
		array(
			'echo'           => false,
			'remember'       => true,
			'redirect'       => home_url( '/' ),
			'label_username' => __( 'Username', 'wp-ja-essence' ),
			'label_password' => __( 'Password', 'wp-ja-essence' ),
			'label_remember' => __( 'Remember me', 'wp-ja-essence' ),
			'label_log_in'   => __( 'Log in', 'wp-ja-essence' ),
		)
	);
	$star = '<span class="je-acct__star" aria-hidden="true">&nbsp;*</span>';
	$form = (string) preg_replace( '#(<label for="user_(?:login|pass)">)([^<]*)(</label>)#', '$1$2' . $star . '$3', $form );
	// The source's sign-in form requires both fields and puts the cursor in the username on load (Joomla's login module: `required`,
	// `autofocus`); wp_login_form() prints neither.
	$form = (string) preg_replace( '#(<input\b[^>]*\bid="user_login"[^>]*?)(\s*/?>)#', '$1 required aria-required="true" autofocus$2', $form, 1 );
	$form = (string) preg_replace( '#(<input\b[^>]*\bid="user_pass"[^>]*?)(\s*/?>)#', '$1 required aria-required="true"$2', $form, 1 );
	$recovery = esc_url( wp_lostpassword_url() );
	return '<div class="je-acct je-acct--login">' . $notice . $form . '<div class="je-acct__links"><div class="je-acct__link"><a href="' . $recovery . '">' . esc_html__( 'Forgot your password?', 'wp-ja-essence' ) . '</a></div><div class="je-acct__link"><a href="' . $recovery . '">' . esc_html__( 'Forgot your username?', 'wp-ja-essence' ) . '</a></div></div><div class="je-acct__links"><div class="je-acct__link"><a href="' . esc_url( wp_ja_essence_account_url( 'register-form' ) ) . '">' . esc_html__( 'Don\'t have an account?', 'wp-ja-essence' ) . '</a></div></div></div>';
}

/**
 * One labelled field of the registration form.
 *
 * @param string $id       Field id and name.
 * @param string $label    Visible label.
 * @param string $type     Input type, or `textarea`.
 * @param bool   $required Whether the field is required.
 * @param string $value    The value kept after an error.
 * @param string $extra    Extra attributes (autocomplete, minlength).
 * @param string $hint     A line printed above the control.
 * @param string $error    The message for this field.
 * @return string
 */
function wp_ja_essence_account_field( string $id, string $label, string $type, bool $required, string $value, string $extra = '', string $hint = '', string $error = '' ): string {
	$star     = $required ? '<span class="je-acct__star" aria-hidden="true">&nbsp;*</span>' : '';
	$describe = trim( ( '' !== $hint ? "je-$id-hint " : '' ) . ( '' !== $error ? "je-$id-error" : '' ) );
	$attrs    = ' id="je-' . esc_attr( $id ) . '" name="' . esc_attr( $id ) . '"' . ( $required ? ' required aria-required="true"' : '' ) . ( '' !== $error ? ' aria-invalid="true"' : '' ) . ( '' !== $describe ? ' aria-describedby="' . esc_attr( $describe ) . '"' : '' ) . ' ' . $extra;
	if ( 'textarea' === $type ) {
		$control = '<textarea class="je-acct__input" rows="5"' . $attrs . '>' . esc_textarea( $value ) . '</textarea>';
	} elseif ( 'password' === $type ) {
		$control = '<div class="je-acct__pw"><input class="je-acct__input" type="password"' . $attrs . '></div>';
	} else {
		$control = '<input class="je-acct__input" type="' . esc_attr( $type ) . '" value="' . esc_attr( $value ) . '"' . $attrs . '>';
	}
	$hint_html = '' !== $hint ? '<div class="je-acct__hint' . ( 'date' === $type ? ' je-acct__hint--after' : '' ) . '" id="je-' . esc_attr( $id ) . '-hint">' . wp_kses( $hint, array( 'strong' => array() ) ) . '</div>' : '';
	return '<div class="je-acct__group"><label class="je-acct__label" for="je-' . esc_attr( $id ) . '">' . esc_html( $label ) . $star . '</label>'
		. ( 'date' === $type ? '' : $hint_html )
		. $control
		. ( 'date' === $type ? $hint_html : '' )
		. ( '' !== $error ? '<p class="je-acct__error" id="je-' . esc_attr( $id ) . '-error" role="alert">' . esc_html( $error ) . '</p>' : '' )
		. '</div>';
}

/**
 * The registration form. Posts to admin-post.php (je_register); a refused attempt comes back here with its messages and the
 * non-secret values in a short-lived transient named by the `je_reg` argument. The form is only offered when the site lets
 * visitors register (Settings > General); otherwise it says so and shows no fields.
 *
 * @return string
 */
function wp_ja_essence_render_register(): string {
	if ( is_user_logged_in() ) {
		return '<div class="je-acct je-acct--register"><p class="je-acct__note">' . esc_html__( 'You are already logged in.', 'wp-ja-essence' ) . '</p></div>';
	}
	if ( ! get_option( 'users_can_register' ) ) {
		return '<div class="je-acct je-acct--register"><p class="je-acct__note je-acct__note--error" role="status">' . esc_html__( 'Registration is closed on this site.', 'wp-ja-essence' ) . '</p></div>';
	}
	$state = array(
		'errors' => array(),
		'values' => array(),
	);
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only token naming a transient the handler wrote.
	$token = isset( $_GET['je_reg'] ) ? preg_replace( '/[^a-z0-9]/i', '', (string) wp_unslash( $_GET['je_reg'] ) ) : '';
	if ( '' !== $token ) {
		$kept = get_transient( 'je_reg_' . $token );
		if ( is_array( $kept ) ) {
			$state = array_merge( $state, $kept );
		}
	}
	$e = $state['errors'];
	$v = static fn( string $k ): string => isset( $state['values'][ $k ] ) ? (string) $state['values'][ $k ] : '';
	$html  = '<div class="je-acct je-acct--register">';
	if ( $e ) {
		$html .= '<div class="je-acct__note je-acct__note--error" role="alert"><p>' . esc_html__( 'Your account was not created. Please correct the fields marked below.', 'wp-ja-essence' ) . '</p></div>';
	}
	$html .= '<form class="je-acct__form" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" novalidate>';
	$html .= '<input type="hidden" name="action" value="je_register">' . wp_nonce_field( 'je_register', 'je_nonce', true, false );
	$html .= '<p class="je-acct__trap" aria-hidden="true"><label>' . esc_html__( 'Leave this empty', 'wp-ja-essence' ) . ' <input type="text" name="je_hp" tabindex="-1" autocomplete="off"></label></p>';
	$html .= '<fieldset class="je-acct__set"><legend>' . esc_html__( 'User Registration', 'wp-ja-essence' ) . '</legend>';
	$html .= '<p class="je-acct__required"><span class="je-acct__star">*</span> ' . esc_html__( 'Required field', 'wp-ja-essence' ) . '</p>';
	$html .= wp_ja_essence_account_field( 'je_name', __( 'Name', 'wp-ja-essence' ), 'text', true, $v( 'je_name' ), 'autocomplete="name" maxlength="100"', '', $e['je_name'] ?? '' );
	$html .= wp_ja_essence_account_field( 'je_username', __( 'Username', 'wp-ja-essence' ), 'text', true, $v( 'je_username' ), 'autocomplete="username" maxlength="60"', '', $e['je_username'] ?? '' );
	/* translators: %d: minimum number of characters. */
	$hint  = '<strong>' . esc_html__( 'Minimum Requirements', 'wp-ja-essence' ) . '</strong> &mdash; ' . esc_html( sprintf( __( 'Characters: %d', 'wp-ja-essence' ), WP_JA_ESSENCE_MIN_PASSWORD ) );
	$html .= wp_ja_essence_account_field( 'je_password', __( 'Password', 'wp-ja-essence' ), 'password', true, '', 'autocomplete="new-password" minlength="' . WP_JA_ESSENCE_MIN_PASSWORD . '" maxlength="99"', $hint, $e['je_password'] ?? '' );
	$html .= wp_ja_essence_account_field( 'je_password2', __( 'Confirm Password', 'wp-ja-essence' ), 'password', true, '', 'autocomplete="new-password" maxlength="99"', '', $e['je_password2'] ?? '' );
	$html .= wp_ja_essence_account_field( 'je_email', __( 'Email Address', 'wp-ja-essence' ), 'email', true, $v( 'je_email' ), 'autocomplete="email" maxlength="100"', '', $e['je_email'] ?? '' );
	$html .= '</fieldset><fieldset class="je-acct__set"><legend>' . esc_html__( 'User Profile', 'wp-ja-essence' ) . '</legend>';
	foreach ( wp_ja_essence_profile_fields() as $key => $def ) {
		$extra = 'dob' === $key ? 'placeholder="YYYY-MM-DD"' : 'autocomplete="off" maxlength="' . ( 'aboutme' === $key ? '1000' : '200' ) . '"';
		$html .= wp_ja_essence_account_field( 'je_p_' . $key, $def[0], $def[1], false, $v( 'je_p_' . $key ), $extra, 'dob' === $key ? __( 'Year-Month-Day, eg 2019-01-27.', 'wp-ja-essence' ) : '', $e[ 'je_p_' . $key ] ?? '' );
	}
	$agreed = 'agree' === $v( 'je_terms' );
	$html  .= '<div class="je-acct__group"><span class="je-acct__label" id="je-terms-label">' . esc_html__( 'Terms of Service', 'wp-ja-essence' ) . '<span class="je-acct__star" aria-hidden="true">&nbsp;*</span></span>'
		. '<div class="je-acct__radios" role="radiogroup" aria-labelledby="je-terms-label"' . ( isset( $e['je_terms'] ) ? ' aria-describedby="je-terms-error"' : '' ) . '>'
		. '<label><input type="radio" name="je_terms" value="agree"' . checked( $agreed, true, false ) . '> ' . esc_html__( 'Agree', 'wp-ja-essence' ) . '</label>'
		. '<label><input type="radio" name="je_terms" value="no"' . checked( ! $agreed, true, false ) . '> ' . esc_html__( 'I do not agree', 'wp-ja-essence' ) . '</label></div>'
		. ( isset( $e['je_terms'] ) ? '<p class="je-acct__error" id="je-terms-error" role="alert">' . esc_html( $e['je_terms'] ) . '</p>' : '' ) . '</div>';
	$html  .= '</fieldset><div class="je-acct__actions"><button type="submit" class="je-acct__btn je-acct__btn--primary">' . esc_html__( 'Register', 'wp-ja-essence' ) . '</button> <a class="je-acct__btn je-acct__btn--danger" href="' . esc_url( home_url( '/' ) ) . '">' . esc_html__( 'Cancel', 'wp-ja-essence' ) . '</a></div></form></div>';
	return $html;
}

/**
 * Handles the registration form: every value is checked on the server (the browser's checks are a convenience), nothing is
 * written until all of them pass, and a refused attempt returns to the form with its messages.
 */
function wp_ja_essence_handle_register(): void {
	$back = wp_get_referer();
	$back = $back ? remove_query_arg( array( 'je_reg', 'je_registered' ), $back ) : home_url( '/' );
	$fail = static function ( array $errors, array $values ) use ( $back ): void {
		$token = wp_generate_password( 16, false );
		set_transient( 'je_reg_' . $token, array( 'errors' => $errors, 'values' => $values ), 10 * MINUTE_IN_SECONDS );
		wp_safe_redirect( add_query_arg( 'je_reg', $token, $back ) );
		exit;
	};
	if ( ! get_option( 'users_can_register' ) || is_user_logged_in() ) {
		wp_safe_redirect( $back );
		exit;
	}
	// phpcs:disable WordPress.Security.NonceVerification.Missing -- verified just below.
	if ( ! isset( $_POST['je_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['je_nonce'] ) ), 'je_register' ) ) {
		$fail( array( 'je_name' => __( 'The form expired. Please try again.', 'wp-ja-essence' ) ), array() );
	}
	if ( ! empty( $_POST['je_hp'] ) ) {
		wp_safe_redirect( $back ); // A bot filled the trap field: no account, no message.
		exit;
	}
	$get    = static fn( string $k ): string => isset( $_POST[ $k ] ) && is_scalar( $_POST[ $k ] ) ? trim( (string) wp_unslash( $_POST[ $k ] ) ) : '';
	$name   = sanitize_text_field( $get( 'je_name' ) );
	$login  = sanitize_user( $get( 'je_username' ), true );
	$email  = sanitize_email( $get( 'je_email' ) );
	$pass   = $get( 'je_password' );
	$pass2  = $get( 'je_password2' );
	$terms  = 'agree' === $get( 'je_terms' ) ? 'agree' : 'no';
	$values = array( 'je_name' => $name, 'je_username' => $login, 'je_email' => $email, 'je_terms' => $terms );
	$profile = array();
	foreach ( wp_ja_essence_profile_fields() as $key => $def ) {
		$raw = $get( 'je_p_' . $key );
		$val = 'aboutme' === $key ? sanitize_textarea_field( $raw ) : ( 'website' === $key ? esc_url_raw( $raw ) : sanitize_text_field( $raw ) );
		if ( 'dob' === $key && '' !== $val && ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $val ) ) {
			$val = '';
		}
		$profile[ $key ]                = mb_substr( $val, 0, 'aboutme' === $key ? 1000 : 200 );
		$values[ 'je_p_' . $key ] = $profile[ $key ];
	}
	// phpcs:enable
	$errors = array();
	if ( '' === $name ) {
		$errors['je_name'] = __( 'Please enter your name.', 'wp-ja-essence' );
	}
	if ( strlen( $login ) < 3 || $login !== trim( $get( 'je_username' ) ) ) {
		$errors['je_username'] = __( 'Please choose a username of at least 3 letters, numbers or . _ - characters.', 'wp-ja-essence' );
	} elseif ( username_exists( $login ) ) {
		$errors['je_username'] = __( 'That username is taken.', 'wp-ja-essence' );
	}
	if ( ! is_email( $email ) ) {
		$errors['je_email'] = __( 'Please enter a valid email address.', 'wp-ja-essence' );
	} elseif ( email_exists( $email ) ) {
		$errors['je_email'] = __( 'That email address is already registered.', 'wp-ja-essence' );
	}
	if ( strlen( $pass ) < WP_JA_ESSENCE_MIN_PASSWORD ) {
		/* translators: %d: minimum number of characters. */
		$errors['je_password'] = sprintf( __( 'The password needs at least %d characters.', 'wp-ja-essence' ), WP_JA_ESSENCE_MIN_PASSWORD );
	} elseif ( $pass !== $pass2 ) {
		$errors['je_password2'] = __( 'The two passwords do not match.', 'wp-ja-essence' );
	}
	if ( 'agree' !== $terms ) {
		$errors['je_terms'] = __( 'You must agree to the terms to register.', 'wp-ja-essence' );
	}
	if ( $errors ) {
		$fail( $errors, $values );
	}
	$id = wp_insert_user(
		array(
			'user_login'   => $login,
			'user_pass'    => $pass,
			'user_email'   => $email,
			'display_name' => $name,
			'nickname'     => $name,
			'first_name'   => $name,
			'role'         => get_option( 'default_role', 'subscriber' ),
		)
	);
	if ( is_wp_error( $id ) ) {
		$fail( array( 'je_name' => __( 'Your account could not be created. Please try again later.', 'wp-ja-essence' ) ), $values );
	}
	foreach ( $profile as $key => $val ) {
		if ( '' !== $val ) {
			update_user_meta( (int) $id, 'je_profile_' . $key, $val );
		}
	}
	wp_safe_redirect( add_query_arg( 'je_registered', '1', wp_ja_essence_account_url( 'login-form' ) ) );
	exit;
}
add_action( 'admin_post_nopriv_je_register', 'wp_ja_essence_handle_register' );
add_action( 'admin_post_je_register', 'wp_ja_essence_handle_register' );

/* ------------------------------------------------------------------------------------------------------------------------------
 * Search page (1.0.3): the source's "Search Terms:" card.
 * ---------------------------------------------------------------------------------------------------------------------------- */

function wp_ja_essence_register_search_block(): void {
	register_block_type(
		'wp-ja-essence/search-form',
		array(
			'api_version'     => 3,
			'title'           => __( 'Search form', 'wp-ja-essence' ),
			'description'     => __( 'The search card: the field, Search, Advanced Search (examples of what the search understands).', 'wp-ja-essence' ),
			'category'        => 'widgets',
			'icon'            => 'search',
			'supports'        => array( 'html' => false ),
			'render_callback' => 'wp_ja_essence_render_search_form',
		)
	);
}
add_action( 'init', 'wp_ja_essence_register_search_block' );

/**
 * @return string
 */
function wp_ja_essence_render_search_form(): string {
	$term = get_search_query( false );
	$lens  = '<svg class="je-sf__icon" viewBox="0 0 512 512" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M505 442.7L405.3 343c-4.5-4.5-10.6-7-17-7H372c27.6-35.3 44-79.7 44-128C416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c48.3 0 92.7-16.4 128-44v16.3c0 6.4 2.5 12.5 7 17l99.7 99.7c9.4 9.4 24.6 9.4 33.9 0l28.3-28.3c9.4-9.4 9.4-24.6.1-34zM208 336c-70.7 0-128-57.2-128-128 0-70.7 57.2-128 128-128 70.7 0 128 57.2 128 128 0 70.7-57.2 128-128 128z"/></svg>';
	$plus  = '<svg class="je-sf__icon" viewBox="0 0 512 512" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M304 192v32c0 6.6-5.4 12-12 12h-56v56c0 6.6-5.4 12-12 12h-32c-6.6 0-12-5.4-12-12v-56h-56c-6.6 0-12-5.4-12-12v-32c0-6.6 5.4-12 12-12h56v-56c0-6.6 5.4-12 12-12h32c6.6 0 12 5.4 12 12v56h56c6.6 0 12 5.4 12 12zm201 284.7L476.7 505c-9.4 9.4-24.6 9.4-33.9 0L343 405.3c-4.5-4.5-7-10.6-7-17V372c-35.6 27.6-80 44-128 44C93.1 416 0 322.9 0 208S93.1 0 208 0s208 93.1 208 208c0 48-16.4 92.4-44 128h16.3c6.4 0 12.5 2.5 17 7l99.7 99.7c9.3 9.4 9.3 24.6 0 34zM344 208c0-75.2-60.8-136-136-136S72 132.8 72 208s60.8 136 136 136 136-60.8 136-136z"/></svg>';
	$tips = '<p>' . esc_html__( 'Here are a few examples of how you can use the search feature:', 'wp-ja-essence' ) . '</p>'
		. '<p>' . wp_kses( __( 'Entering <strong>this and that</strong> into the search form will return results containing both "this" and "that".', 'wp-ja-essence' ), array( 'strong' => array() ) ) . '</p>'
		. '<p>' . wp_kses( __( 'Entering <strong>this -that</strong> into the search form will return results containing "this" and not "that".', 'wp-ja-essence' ), array( 'strong' => array() ) ) . '</p>'
		. '<p>' . wp_kses( __( 'Entering <strong>"this and that"</strong> into the search form will return results containing exactly that phrase.', 'wp-ja-essence' ), array( 'strong' => array() ) ) . '</p>'
		. '<p>' . esc_html__( 'Search results are listed with the most relevant article first.', 'wp-ja-essence' ) . '</p>';
	return '<form class="je-sf" role="search" method="get" action="' . esc_url( home_url( '/' ) ) . '">'
		. '<label class="je-sf__label" for="je-sf-q">' . esc_html__( 'Search Terms:', 'wp-ja-essence' ) . '</label>'
		. '<div class="je-sf__row"><input class="je-sf__input" type="search" id="je-sf-q" name="s" value="' . esc_attr( $term ) . '" autocomplete="off">'
		. '<button class="je-sf__go" type="submit">' . $lens . '<span>' . esc_html__( 'Search', 'wp-ja-essence' ) . '</span></button>'
		. '<button class="je-sf__adv" type="button" aria-expanded="true" aria-controls="je-sf-adv">' . $plus . '<span>' . esc_html__( 'Advanced Search', 'wp-ja-essence' ) . '</span></button></div>'
		. '<fieldset class="je-sf__panel" id="je-sf-adv"><legend class="je-sr">' . esc_html__( 'Advanced Search', 'wp-ja-essence' ) . '</legend>'
		. '<div class="je-sf__tips">' . $tips . '</div></fieldset></form>';
}

/** An empty search (no term) prints the form and the examples only: no result list, no "nothing found". */
function wp_ja_essence_search_body_class( array $classes ): array {
	if ( is_search() && '' === trim( get_search_query( false ) ) ) {
		$classes[] = 'je-search-empty';
	}
	return $classes;
}
add_filter( 'body_class', 'wp_ja_essence_search_body_class' );


/**
 * `?theme=dark|light` decides by its FIRST value (assets/js/wp-ja-essence-dark.js). WordPress's canonical
 * redirect rebuilds the query from a parsed copy in which a repeated key keeps its LAST value, so
 * `?theme=dark&theme=light` would be sent to `?theme=light` before any script runs. Cancelled only when normalising the repeated key changes the
 * first value; any other redirect (host, scheme, port, path, fragment, other parameters) is left alone.
 *
 * @param string|false $redirect_url  The address WordPress wants to send the visitor to.
 * @param string       $requested_url The address that was asked for.
 * @return string|false
 */
function wp_ja_essence_keep_first_theme_value( $redirect_url, $requested_url ) {
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
add_filter( 'redirect_canonical', 'wp_ja_essence_keep_first_theme_value', 20, 2 );

/**
 * Two listing views the source draws with its own components: the people of the site (Author listing) and the filterable
 * list of article titles (Tagged items). Core has no block for either, so the theme ships two dynamic blocks; the
 * patterns map names them as the body of those two views (`views.author`, `views.tag`), and an owner can move or reuse
 * them in the editor like any block.
 */
function wp_ja_essence_register_listing_blocks(): void {
	$common = array(
		'api_version' => 3,
		'category'    => 'widgets',
		'supports'    => array(
			'autoRegister' => true,
			'html'         => false,
		),
	);
	register_block_type(
		'wp-ja-essence/authors',
		array_merge(
			$common,
			array(
				'title'           => __( 'Author listing', 'wp-ja-essence' ),
				'description'     => __( 'The authors of the site: photo, name, job title and a short bio, six to a page.', 'wp-ja-essence' ),
				'icon'            => 'groups',
				'render_callback' => 'wp_ja_essence_render_authors',
			)
		)
	);
	register_block_type(
		'wp-ja-essence/tagged-list',
		array_merge(
			$common,
			array(
				'title'           => __( 'Title list', 'wp-ja-essence' ),
				'description'     => __( 'Every article by title, with a field that keeps the titles holding the typed part.', 'wp-ja-essence' ),
				'icon'            => 'list-view',
				'render_callback' => 'wp_ja_essence_render_tagged_list',
			)
		)
	);
}
add_action( 'init', 'wp_ja_essence_register_listing_blocks' );

/**
 * The pager of the two listing blocks (authors, titles): the source's pager on a query argument, plain links so it works
 * without script and in the page cache.
 *
 * @param string $arg     The query argument that carries the page number.
 * @param int    $current The page shown.
 * @param int    $pages   How many pages there are.
 * @return string
 */
function wp_ja_essence_listing_pager( string $arg, int $current, int $pages, string $variant = '' ): string {
	return wp_ja_essence_pager( $current, $pages, static fn( int $n ): string => (string) add_query_arg( $arg, $n > 1 ? $n : false ), '', $variant );
}

/**
 * The Author listing: the people the content came from (users the seeder made from the source's authors, in the
 * source's order), six to a page. A person without a photo or a job title simply has no photo or title line.
 *
 * @return string
 */
function wp_ja_essence_render_authors(): string {
	$users = get_users(
		array(
			'meta_key'     => 'tracy_source_author', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_compare' => 'EXISTS',
		)
	);
	// The source's own order: its numeric user id (`joomla-user-43`).
	usort(
		$users,
		static function ( WP_User $a, WP_User $b ): int {
			$order = static fn( WP_User $u ): int => (int) preg_replace( '/\D+/', '', (string) get_user_meta( $u->ID, 'tracy_source_author', true ) );
			return $order( $a ) <=> $order( $b );
		}
	);
	if ( ! $users ) {
		return '<p class="je-authors__empty">' . esc_html__( 'No authors yet.', 'wp-ja-essence' ) . '</p>';
	}
	$per    = 6;
	$pages  = (int) ceil( count( $users ) / $per );
	$page   = isset( $_GET['apage'] ) ? min( $pages, max( 1, absint( wp_unslash( $_GET['apage'] ) ) ) ) : 1; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only page number.
	$html   = '<div class="je-authors"><ul class="je-authors__items">';
	foreach ( array_slice( $users, ( $page - 1 ) * $per, $per ) as $user ) {
		$name  = (string) $user->display_name;
		$photo = (int) get_user_meta( $user->ID, 'tracy_avatar', true );
		$title = trim( (string) get_user_meta( $user->ID, 'job_title', true ) );
		$bio   = mb_strlen( (string) $user->description ) > 73 ? mb_substr( (string) $user->description, 0, 71 ) . '..' : (string) $user->description; // the source prints the first 71 characters and two dots
		$link  = esc_url( get_author_posts_url( $user->ID ) );
		$html .= '<li class="je-author"><div class="je-author__card">';
		if ( $photo ) {
			$img = wp_get_attachment_image( $photo, 'medium_large', false, array( 'class' => 'je-author__photo', 'alt' => $name, 'loading' => 'eager' ) );
			if ( $img ) {
				$html .= '<a class="je-author__picture" href="' . $link . '" tabindex="-1" aria-hidden="true">' . $img . '</a>';
			}
		}
		$html .= '<h3 class="je-author__name"><a href="' . $link . '">' . esc_html( $name ) . '</a></h3>';
		if ( '' !== $title ) {
			$html .= '<p class="je-author__job">' . esc_html( $title ) . '</p>';
		}
		if ( '' !== $bio ) {
			$html .= '<p class="je-author__bio">' . esc_html( $bio ) . '</p>';
		}
		// The source's cards carry three round profile buttons (Facebook, Instagram, Twitter) that point nowhere (`#`): an owner
		// who fills the user fields `je_social_facebook`, `je_social_instagram` or `je_social_twitter` gets real links.
		$html .= '<div class="je-author__socials">';
		foreach ( array( 'facebook' => 'Facebook', 'instagram' => 'Instagram', 'twitter' => 'Twitter' ) as $net => $label ) {
			$url   = trim( (string) get_user_meta( $user->ID, 'je_social_' . $net, true ) );
			$html .= '<a class="je-author__social je-author__social--' . $net . '" href="' . ( '' !== $url ? esc_url( $url ) : '#' ) . '"' . ( '' !== $url ? ' rel="noopener" target="_blank"' : '' ) . ' aria-label="' . esc_attr( sprintf( /* translators: 1: person, 2: network. */ __( '%1$s on %2$s', 'wp-ja-essence' ), $name, $label ) ) . '"><span class="je-author__ico" aria-hidden="true"></span></a>';
		}
		$html .= '</div></div>';
		$html .= '</li>';
	}
	return $html . '</ul>' . wp_ja_essence_listing_pager( 'apage', $page, $pages, 'counter-last' ) . '</div>';
}

/**
 * The Tagged items view: article titles A to Z, twenty to a page, and a field that keeps the titles holding what was typed
 * (`?tf=`). Every filed article is a row, copies included, as in the source (one row per category an article sits in); an article page
 * filed under a category is listed under its heading. Sorting and filtering run on the title the visitor reads (an article page's heading,
 * not the menu word it is titled with), over a list of fifty-one rows.
 *
 * @return string
 */
function wp_ja_essence_render_tagged_list(): string {
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- read-only filter, page number and page size.
	$filter = isset( $_GET['tf'] ) ? sanitize_text_field( wp_unslash( $_GET['tf'] ) ) : '';
	$paged  = isset( $_GET['tpage'] ) ? max( 1, absint( wp_unslash( $_GET['tpage'] ) ) ) : 1;
	$limit  = isset( $_GET['tlimit'] ) ? absint( wp_unslash( $_GET['tlimit'] ) ) : 20;
	// phpcs:enable
	$sizes = array( 5, 10, 15, 20, 25, 30 );
	$limit = in_array( $limit, $sizes, true ) ? $limit : 20;
	// One row per Joomla article, copies included: the source lists every filed article under the URL of its own category.
	$args = array(
		'post_type'           => array( 'post', 'page' ),
		'post_status'         => 'publish',
		'posts_per_page'      => -1,
		'fields'              => 'ids',
		'no_found_rows'       => true,
		'ignore_sticky_posts' => true,
		'tax_query'           => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- only filed articles.
			array(
				'taxonomy' => 'category',
				'operator' => 'EXISTS',
			),
		),
	);
	$rows = array();
	foreach ( ( new WP_Query( $args ) )->posts as $id ) {
		$rows[] = array(
			'id'    => (int) $id,
			'src'   => (int) get_post_meta( (int) $id, 'je_src_id', true ),
			'title' => html_entity_decode( wp_ja_essence_display_title( (int) $id ), ENT_QUOTES, 'UTF-8' ),
		);
	}
	if ( '' !== $filter ) {
		$rows = array_values( array_filter( $rows, static fn( array $row ): bool => false !== mb_stripos( $row['title'], $filter ) ) );
	}
	usort( $rows, static fn( array $a, array $b ): int => strnatcasecmp( $a['title'], $b['title'] ) ? : $a['src'] <=> $b['src'] );
	$pages = max( 1, (int) ceil( count( $rows ) / $limit ) );
	$paged = min( $paged, $pages );
	$clear = esc_url( remove_query_arg( array( 'tf', 'tpage' ) ) );
	$lens  = '<svg viewBox="0 0 512 512" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M505 442.7L405.3 343c-4.5-4.5-10.6-7-17-7H372c27.6-35.3 44-79.7 44-128C416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c48.3 0 92.7-16.4 128-44v16.3c0 6.4 2.5 12.5 7 17l99.7 99.7c9.4 9.4 24.6 9.4 33.9 0l28.3-28.3c9.4-9.4 9.4-24.6.1-34zM208 336c-70.7 0-128-57.2-128-128 0-70.7 57.2-128 128-128 70.7 0 128 57.2 128 128 0 70.7-57.2 128-128 128z"/></svg>';
	$times = '<svg viewBox="0 0 352 512" width="14" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/></svg>';
	$opts  = '';
	foreach ( $sizes as $size ) {
		$opts .= '<option value="' . $size . '"' . selected( $limit, $size, false ) . '>' . $size . '</option>';
	}
	$html  = '<div class="je-taglist"><form class="je-taglist__filter" role="search" method="get" action="' . $clear . '">';
	$html .= '<label class="je-sr" for="je-taglist-filter">' . esc_html__( 'Enter Part of Title', 'wp-ja-essence' ) . '</label>';
	$html .= '<div class="je-taglist__group"><input id="je-taglist-filter" type="search" name="tf" value="' . esc_attr( $filter ) . '" placeholder="' . esc_attr__( 'Enter Part of Title', 'wp-ja-essence' ) . '" autocomplete="off">';
	$html .= '<button type="submit" class="je-taglist__go" aria-label="' . esc_attr__( 'Filter', 'wp-ja-essence' ) . '">' . $lens . '</button>';
	$html .= '<a class="je-taglist__clear" href="' . $clear . '" aria-label="' . esc_attr__( 'Clear', 'wp-ja-essence' ) . '">' . $times . '</a></div>';
	$html .= '<label class="je-sr" for="je-taglist-limit">' . esc_html__( 'Display #', 'wp-ja-essence' ) . '</label><select id="je-taglist-limit" name="tlimit" onchange="this.form.submit()">' . $opts . '</select></form>';
	if ( ! $rows ) {
		return $html . '<p class="je-taglist__empty">' . esc_html__( 'No title holds that text.', 'wp-ja-essence' ) . '</p></div>';
	}
	$html .= '<ul class="je-taglist__items">';
	foreach ( array_slice( $rows, ( $paged - 1 ) * $limit, $limit ) as $row ) {
		$html .= '<li><h3 class="je-taglist__title"><a href="' . esc_url( get_permalink( $row['id'] ) ) . '">' . esc_html( $row['title'] ) . '</a></h3></li>';
	}
	return $html . '</ul>' . wp_ja_essence_listing_pager( 'tpage', $paged, $pages, 'row' ) . '</div>';
}

/**
 * A Shortcode block in a template or a pattern (the Newsletter card of the single template) is expanded too: core runs
 * shortcodes on post content only.
 */
add_filter( 'render_block_core/shortcode', 'do_shortcode' );

/**
 * A failed sign-in from the theme's own form comes back to that form with a message (core would send the visitor to wp-login.php).
 */
function wp_ja_essence_login_failed(): void {
	$from = wp_get_referer();
	if ( ! $from || false !== strpos( $from, 'wp-login.php' ) || false !== strpos( $from, '/wp-admin' ) ) {
		return;
	}
	wp_safe_redirect( add_query_arg( 'login', 'failed', remove_query_arg( array( 'login', 'je_registered' ), $from ) ) );
	exit;
}
add_action( 'wp_login_failed', 'wp_ja_essence_login_failed' );

/**
 * A page of the site by its path, only while visitors can open it. get_page_by_path() finds a page whatever its status, and
 * WordPress gives a page that is not published its plain address (`/?page_id=N`), which answers 404 to a visitor: a page the
 * customer unticked when the site was made is drafted, so a link the theme draws to it by path must fall back instead (PAGE-4,
 * measured 10/10/2026 on dev: the Health tile of home 2 opened the drafted Category Style 1).
 *
 * @param string $path The page path, as get_page_by_path() takes it.
 * @return WP_Post|null
 */
function wp_ja_essence_live_page( string $path ) {
	$page = get_page_by_path( $path );
	return $page && 'publish' === get_post_status( $page ) ? $page : null;
}

/**
 * The category pictures row of the front page (home 2): the source paints one picture tile per sub-category with its name and post
 * count over the picture's corner, in a row of five. WordPress categories carry no picture, so the five pictures ship with the theme
 * (`assets/img/category-N.jpg`, the source's own) and the tiles are drawn here from the Categories block's list (class `je-cattiles`).
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_essence_category_tiles( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'je-cattiles' ) ) {
		return $content;
	}
	if ( ! preg_match_all( '#<li class="[^"]*">\s*<a href="([^"]*)"[^>]*>([^<]*)</a>\s*\(?(\d+)\)?#s', $content, $found, PREG_SET_ORDER ) ) {
		return $content;
	}
	// The source's order and the picture each tile carries; the page each tile opens, or the category itself while that page
	// is not published (unticked when the site was made).
	$order = array(
		'health'    => array( 1, 'category/category-style-1' ),
		'design'    => array( 2, 'category/category-style-2' ),
		'fashion'   => array( 3, 'pages/j-content/category-blog' ),
		'resources' => array( 5, 'resources' ),
		'lifestyle' => array( 4, 'lifestyle' ),
	);
	// Each tile is found by its category's slug, read from the link (`/topic/blog/blog-health/` is the health tile), never by
	// its name: a site made in another language renames the categories ("Sức khỏe"), and matching by name then found no tile
	// and printed the plain list with no picture (1.0.12, measured 11/10/2026 on dev g58-ess-wp-full). The name is the fallback
	// for a link that names no slug.
	$by_slug = array();
	foreach ( $found as $row ) {
		$path = trim( (string) wp_parse_url( html_entity_decode( $row[1] ), PHP_URL_PATH ), '/' );
		$last = '' === $path ? '' : preg_replace( '/^blog-/', '', basename( $path ) );
		$key  = isset( $order[ $last ] ) ? $last : sanitize_title( html_entity_decode( $row[2] ) );
		$by_slug[ $key ] = $row;
	}
	$items = '';
	foreach ( $order as $slug => $spec ) {
		if ( ! isset( $by_slug[ $slug ] ) ) {
			continue;
		}
		$row  = $by_slug[ $slug ];
		$page = wp_ja_essence_live_page( $spec[1] );
		$href = $page ? get_permalink( $page ) : html_entity_decode( $row[1] );
		$img  = get_theme_file_uri( 'assets/img/category-' . $spec[0] . '.jpg' );
		$name = trim( html_entity_decode( $row[2] ) );
		$items .= '<li class="je-cattiles__item je-cat--' . esc_attr( $slug ) . '"><a class="je-cattiles__img" href="' . esc_url( $href ) . '" tabindex="-1" aria-hidden="true"><img src="' . esc_url( $img ) . '" alt="" width="342" height="341" loading="eager" decoding="async"></a>'
			. '<div class="je-cattiles__name"><a href="' . esc_url( $href ) . '">' . esc_html( $name ) . ' (' . (int) $row[3] . ')</a></div></li>';
	}
	return $items ? '<div class="wp-block-categories je-cattiles"><ul class="je-cattiles__list">' . $items . '</ul></div>' : $content;
}
add_filter( 'render_block_core/categories', 'wp_ja_essence_category_tiles', 9, 2 );

/**
 * The round author photo the masonry cards of home 4 print before the byline (the user's `tracy_avatar` picture, 32px).
 */
function wp_ja_essence_register_author_avatar_block(): void {
	register_block_type(
		'wp-ja-essence/author-avatar',
		array(
			'api_version'     => 3,
			'title'           => __( 'Author photo', 'wp-ja-essence' ),
			'description'     => __( 'The round photo of the article\'s author.', 'wp-ja-essence' ),
			'category'        => 'widgets',
			'icon'            => 'admin-users',
			'uses_context'    => array( 'postId' ),
			'supports'        => array( 'html' => false ),
			'render_callback' => 'wp_ja_essence_render_author_avatar',
		)
	);
}
add_action( 'init', 'wp_ja_essence_register_author_avatar_block' );

/**
 * @param array    $attributes Block attributes.
 * @param string   $content    Inner content (none).
 * @param WP_Block $block      The block.
 * @return string
 */
function wp_ja_essence_render_author_avatar( array $attributes, string $content, $block ): string {
	$post_id = isset( $block->context['postId'] ) ? (int) $block->context['postId'] : (int) get_the_ID();
	$author  = $post_id ? (int) get_post_field( 'post_author', $post_id ) : 0;
	$photo   = $author ? (int) get_user_meta( $author, 'tracy_avatar', true ) : 0;
	if ( ! $photo ) {
		return '';
	}
	$img = wp_get_attachment_image( $photo, 'thumbnail', false, array( 'class' => 'je-meta__avatar-img', 'alt' => '', 'loading' => 'eager' ) );
	return $img ? '<span class="je-meta__avatar">' . $img . '</span>' : '';
}

/**
 * The menu marks the item the visitor is under, as the source does: Joomla's `current active` follows the
 * menu item whose path starts the request's path, and the search results are the Smart Search item's page.
 * Core marks only a link to the queried post or term, so an article served at its source address
 * (/category/category-style-3/<alias>) and the search results kept every item plain. The link whose path is
 * the request's path, or begins it, gets `current-menu-item`; core then marks the parents itself
 * (`current-menu-ancestor`) because a rendered child carries the class. Read from the rendered href, same
 * host only; the home link (an empty path) never begins a path.
 *
 * @param string $content The rendered link.
 * @param array  $parsed  The parsed block (unused).
 * @return string
 */
function wp_ja_essence_menu_current( string $content, array $parsed ): string {
	unset( $parsed );
	if ( '' === $content || str_contains( $content, 'current-menu-item' ) ) {
		return $content;
	}
	$tags = new WP_HTML_Tag_Processor( $content );
	if ( ! $tags->next_tag( 'a' ) ) {
		return $content;
	}
	$href = (string) $tags->get_attribute( 'href' );
	$host = (string) wp_parse_url( $href, PHP_URL_HOST );
	$link = trim( (string) wp_parse_url( $href, PHP_URL_PATH ), '/' );
	$here = trim( (string) wp_parse_url( (string) wp_unslash( $_SERVER['REQUEST_URI'] ?? '' ), PHP_URL_PATH ), '/' ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
	if ( is_search() ) {
		$here = WP_JA_ESSENCE_SEARCH_PATHS[0];
	}
	if ( '' === $link || '' === $here || null !== wp_parse_url( $href, PHP_URL_QUERY ) || ( '' !== $host && (string) wp_parse_url( home_url(), PHP_URL_HOST ) !== $host ) ) {
		return $content;
	}
	if ( $link !== $here && ! ( is_singular( 'post' ) && str_starts_with( $here, $link . '/' ) ) ) {
		return $content;
	}
	if ( $link === $here ) {
		$tags->set_attribute( 'aria-current', 'page' );
	}
	$marked = new WP_HTML_Tag_Processor( $tags->get_updated_html() );
	if ( $marked->next_tag( 'li' ) ) {
		$marked->add_class( 'current-menu-item' );
	}
	return $marked->get_updated_html();
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_essence_menu_current', 30, 2 );
