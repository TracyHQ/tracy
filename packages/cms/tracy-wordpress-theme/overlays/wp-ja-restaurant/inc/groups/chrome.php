<?php
/**
 * Chrome group: the shared page frame (header menu, footer) where WordPress markup differs from the source's.
 *
 * @package wp-ja-restaurant
 */

/**
 * On the front page the menu marks Home only. A submenu child that is an alias of the front page (the source's
 * "Default Color" under Explore) would make WordPress mark its parent as current too; the source does not, so the
 * ancestor and the child lose their current marks while the front page is shown.
 *
 * @param string $content The rendered submenu.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_restaurant_front_page_alias( string $content, array $block ): string {
	if ( ! is_front_page() || ! str_contains( $content, 'current-menu-' ) ) {
		return $content;
	}
	$url = (string) ( $block['attrs']['url'] ?? '' );
	if ( '' !== $url && trailingslashit( $url ) === trailingslashit( home_url() ) ) {
		return $content;
	}
	$content = str_replace( array( ' current-menu-ancestor', ' current-menu-item' ), '', $content );
	return str_replace( ' aria-current="page"', '', $content );
}
add_filter( 'render_block_core/navigation-submenu', 'wp_ja_restaurant_front_page_alias', 30, 2 );

/**
 * The menu item the current view belongs to when no menu link points at it. The source's menu marks the blog for
 * its articles and category lists, the gallery for albums, and its Smart Search / Tagged Items entries under
 * Explore for the search view and the tag list; WordPress marks a link only when the page itself is the link.
 *
 * @return string Path of the link to mark ("/blog/"), or an empty string when the view needs no extra mark.
 */
function wp_ja_restaurant_chrome_menu_target(): string {
	$in_gallery = static fn( int $id ): bool => has_category( 'gallery', $id );
	if ( is_search() ) {
		return '/explore/j-pages/smart-search/';
	}
	if ( is_tag() ) {
		return '/explore/j-pages/tagged-items/';
	}
	if ( is_singular( 'post' ) ) {
		return $in_gallery( get_queried_object_id() ) ? '/gallery/' : '/blog/';
	}
	if ( is_category() ) {
		$term = get_queried_object();
		return $term instanceof WP_Term && 'gallery' === $term->slug ? '/gallery/' : '/blog/';
	}
	return '';
}

/**
 * Marks the menu link of the view's home (see wp_ja_restaurant_chrome_menu_target) as the current item; WordPress
 * itself then marks the submenu that holds it as the current ancestor.
 *
 * @param string $content The rendered menu link.
 * @return string
 */
function wp_ja_restaurant_chrome_menu_current( string $content ): string {
	$target = wp_ja_restaurant_chrome_menu_target();
	if ( '' === $target || str_contains( $content, 'current-menu-item' ) ) {
		return $content;
	}
	// The address the menu printed for the link (the saved url of a page link can be its plain `?page_id=` form).
	$path = preg_match( '/<a\b[^>]*\shref="([^"]*)"/', $content, $href ) ? (string) wp_parse_url( html_entity_decode( $href[1] ), PHP_URL_PATH ) : '';
	if ( trailingslashit( $path ) !== trailingslashit( (string) wp_parse_url( home_url( $target ), PHP_URL_PATH ) ) ) {
		return $content;
	}
	$content = preg_replace( '/^(\s*<li class="[^"]*)"/', '$1 current-menu-item"', $content, 1 );
	return (string) preg_replace( '/(<a class="wp-block-navigation-item__content"[^>]*?)>/', '$1 aria-current="page">', (string) $content, 1 );
}
add_filter( 'render_block_core/navigation-link', 'wp_ja_restaurant_chrome_menu_current' );

/**
 * A submenu that holds the marked link is the current ancestor, as the source's menu marks it.
 *
 * @param string $content The rendered submenu.
 * @return string
 */
function wp_ja_restaurant_chrome_menu_ancestor( string $content ): string {
	if ( '' === wp_ja_restaurant_chrome_menu_target() || ! str_contains( $content, 'current-menu-item' ) || str_contains( $content, 'current-menu-ancestor' ) ) {
		return $content;
	}
	return (string) preg_replace( '/^(\s*<li\b[^>]*\bclass="[^"]*)"/', '$1 current-menu-ancestor"', $content, 1 );
}
add_filter( 'render_block_core/navigation-submenu', 'wp_ja_restaurant_chrome_menu_ancestor', 20 );
