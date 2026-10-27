<?php
/**
 * Chrome group: the shared page frame (header menu, footer) where WordPress markup differs from the source's.
 *
 * @package wp-ja-diner
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
function wp_ja_diner_front_page_alias( string $content, array $block ): string {
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
add_filter( 'render_block_core/navigation-submenu', 'wp_ja_diner_front_page_alias', 30, 2 );

/**
 * The menu item the current view belongs to when no menu link points at it. The source's menu marks the blog for
 * its articles and category lists, the gallery for albums, and its Smart Search / Tagged Items entries under
 * Explore for the search view and the tag list; WordPress marks a link only when the page itself is the link.
 *
 * @return string Path of the link to mark ("/our-blog/"), or an empty string when the view needs no extra mark.
 */
function wp_ja_diner_chrome_menu_target(): string {
	$in_gallery = static fn( int $id ): bool => has_category( 'gallery', $id );
	if ( is_search() ) {
		return '/other-pages/smart-search/';
	}
	if ( is_tag() ) {
		return '/content/tagged-items/';
	}
	if ( is_singular( 'post' ) ) {
		return $in_gallery( get_queried_object_id() ) ? '/gallery/' : '/our-blog/';
	}
	if ( is_category() ) {
		$term = get_queried_object();
		return $term instanceof WP_Term && 'gallery' === $term->slug ? '/gallery/' : '/our-blog/';
	}
	return '';
}

/**
 * Marks the menu link of the view's home (see wp_ja_diner_chrome_menu_target) as the current item; WordPress
 * itself then marks the submenu that holds it as the current ancestor.
 *
 * @param string $content The rendered menu link.
 * @return string
 */
function wp_ja_diner_chrome_menu_current( string $content ): string {
	$target = wp_ja_diner_chrome_menu_target();
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
add_filter( 'render_block_core/navigation-link', 'wp_ja_diner_chrome_menu_current' );

/**
 * A submenu that holds the marked link is the current ancestor, as the source's menu marks it.
 *
 * @param string $content The rendered submenu.
 * @return string
 */
function wp_ja_diner_chrome_menu_ancestor( string $content ): string {
	if ( '' === wp_ja_diner_chrome_menu_target() || ! str_contains( $content, 'current-menu-item' ) || str_contains( $content, 'current-menu-ancestor' ) ) {
		return $content;
	}
	return (string) preg_replace( '/^(\s*<li\b[^>]*\bclass="[^"]*)"/', '$1 current-menu-ancestor"', $content, 1 );
}
add_filter( 'render_block_core/navigation-submenu', 'wp_ja_diner_chrome_menu_ancestor', 20 );

/**
 * A group draws no flow layout of its own: the source spaces its blocks by its own rules (element and class margins), while
 * the global styles give every flow group's children a block gap, and take the first child's top and the last child's bottom
 * margin away (`:root :where(.is-layout-flow) > :last-child`, specificity 0,2,0, which beats the source's class rules).
 * The two flow classes are taken off the group's own tag, so those rules never reach the source's markup.
 *
 * @param string $html Rendered group block.
 * @return string
 */
function wp_ja_diner_chrome_group_flow( string $html ): string {
	if ( ! str_contains( $html, 'is-layout-flow' ) ) {
		return $html;
	}
	return (string) preg_replace_callback(
		'/^\s*<[a-z0-9]+\b[^>]*>/i',
		static fn( array $m ): string => (string) preg_replace( '/\s*\b(?:wp-block-group-is-layout-flow|is-layout-flow)\b/', '', $m[0] ),
		$html,
		1
	);
}
add_filter( 'render_block_core/group', 'wp_ja_diner_chrome_group_flow', 20 );
