<?php
/**
 * wp-ja-kinetic — words the source keeps editable in its admin, kept editable here too (D-40), so no
 * template carries them:
 *
 * - The CTA band on the blog lists and on every article: the source's two ACM modules ("[Kinetic] Blog -
 *   CTA", "[Kinetic] Article - CTA") become two synced patterns (`wp_block`) the run's post-seed step
 *   writes. A template cannot know a post id, so it names the pattern — `<!-- wp:block
 *   {"metadata":{"name":"cta.blog"}} /-->` — and the pattern whose slug is `wp-ja-kinetic-<name>`
 *   (`wp-ja-kinetic-cta-blog`) fills the reference. The owner edits it under Patterns.
 * - The one-line lede under the heading of Sign in / Register / Password reset / Username reminder /
 *   Article archive (the source's menu-item description and template language strings): the page's
 *   own excerpt, edited under Pages. The archive's crumb labels and its empty-list message (language
 *   strings too) are that page's custom fields `wp_ja_kinetic_crumb_home|parent|current` and
 *   `wp_ja_kinetic_empty_text`. The template keeps the paragraph (its class, its place) with no words;
 *   `metadata.name` says which text goes in.
 *
 * A date archive (templates/date.html) has no page of its own: it reads the page the post-seed step
 * gives the `page-archive` template, as the source's archive view reads the same language strings.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

/** Pages carry an excerpt: it is where the owner edits a page's lede. */
function wp_ja_kinetic_page_excerpts(): void {
	add_post_type_support( 'page', 'excerpt' );
}
add_action( 'init', 'wp_ja_kinetic_page_excerpts' );

/**
 * A `core/block` named `<name>` in a template, with no reference, takes the synced pattern whose slug
 * is `wp-ja-kinetic-<name>` (dots as dashes). A block that already has a reference is left alone.
 *
 * @param array $parsed The parsed block.
 * @return array
 */
function wp_ja_kinetic_named_pattern( array $parsed ): array {
	if ( 'core/block' !== ( $parsed['blockName'] ?? '' ) || ! empty( $parsed['attrs']['ref'] ) ) {
		return $parsed;
	}
	$name = (string) ( $parsed['attrs']['metadata']['name'] ?? '' );
	if ( '' === $name ) {
		return $parsed;
	}
	$pattern = get_page_by_path( 'wp-ja-kinetic-' . str_replace( '.', '-', $name ), OBJECT, 'wp_block' );
	if ( $pattern instanceof WP_Post && 'publish' === $pattern->post_status ) {
		$parsed['attrs']['ref'] = $pattern->ID;
	}
	return $parsed;
}
add_filter( 'render_block_data', 'wp_ja_kinetic_named_pattern' );

/**
 * The page whose words a template shows: the page being viewed, or — on a date archive — the page
 * that renders the `page-archive` template.
 *
 * @return WP_Post|null
 */
function wp_ja_kinetic_text_page(): ?WP_Post {
	$object = get_queried_object();
	if ( $object instanceof WP_Post && 'page' === $object->post_type ) {
		return $object;
	}
	if ( ! is_date() ) {
		return null;
	}
	$found = get_posts(
		array(
			'post_type'   => 'page',
			'numberposts' => 1,
			// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value -- one lookup per date archive.
			'meta_key'    => 'wp_ja_kinetic_page_template',
			'meta_value'  => 'page-archive', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		)
	);
	return $found ? $found[0] : null;
}

/**
 * Fills a named paragraph from its page: `page.lede` (the excerpt), `page.crumb` (the archive's
 * crumb: a link home, then the parent and current labels), `page.empty` (the empty-list message).
 * Nothing to show → the paragraph is not printed.
 *
 * @param string $content The paragraph's rendered markup.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_kinetic_page_text( string $content, array $block ): string {
	$name = (string) ( $block['attrs']['metadata']['name'] ?? '' );
	if ( ! in_array( $name, array( 'page.lede', 'page.crumb', 'page.empty' ), true ) ) {
		return $content;
	}
	$page = wp_ja_kinetic_text_page();
	if ( ! $page ) {
		return '';
	}
	$field = static fn( string $key ): string => (string) get_post_meta( $page->ID, $key, true );
	switch ( $name ) {
		case 'page.lede':
			$inner = esc_html( $page->post_excerpt );
			break;
		case 'page.crumb':
			$home  = $field( 'wp_ja_kinetic_crumb_home' );
			$trail = array_filter( array( $field( 'wp_ja_kinetic_crumb_parent' ), $field( 'wp_ja_kinetic_crumb_current' ) ) );
			$inner = '' === $home ? '' : '<a class="hx-bc-home" href="' . esc_url( home_url( '/' ) ) . '">' . esc_html( $home ) . '</a>'
				. ( $trail ? '<span class="hx-bc-tail"> / ' . esc_html( implode( ' / ', $trail ) ) . '</span>' : '' );
			break;
		default:
			$inner = esc_html( $field( 'wp_ja_kinetic_empty_text' ) );
	}
	if ( '' === $inner ) {
		return '';
	}
	return (string) preg_replace( '#(<p\b[^>]*>).*?(</p>)#s', '${1}' . str_replace( array( '\\', '$' ), array( '\\\\', '\\$' ), $inner ) . '${2}', $content, 1 );
}
add_filter( 'render_block_core/paragraph', 'wp_ja_kinetic_page_text', 10, 2 );
