<?php
/**
 * Group C: the author list page (/pages/j-content/author-listing). The source draws Joomla's author view, a
 * grid of every registered user (photo, name, job title, a biography clamped to three lines, social links);
 * WordPress has no block that lists users, so the grid is this theme's own block. It lists the users that
 * carry `author_order` (the source's user number, written for each source user by the seeder or by the
 * dossier's seed step), in that order. Job title and social links are user meta (`job_title`,
 * `author_social`: one "service|url" line each), editable with any user-meta tool.
 *
 * @package wp-ja-fresco
 */

defined( 'ABSPATH' ) || exit;

/**
 * The users the list shows, in the source's order.
 *
 * @return WP_User[]
 */
function wp_ja_fresco_authors(): array {
	return get_users(
		array(
			'meta_key' => 'author_order', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'orderby'  => 'meta_value_num',
			'order'    => 'ASC',
		)
	);
}

/**
 * A user's social links as core/social-links markup, rendered (the icons are core's own SVGs).
 *
 * @param int $user_id The user.
 * @return string
 */
function wp_ja_fresco_author_social( int $user_id ): string {
	$links = '';
	foreach ( preg_split( '/\R/', (string) get_user_meta( $user_id, 'author_social', true ) ) as $line ) {
		$parts = array_map( 'trim', explode( '|', $line, 2 ) );
		if ( 2 !== count( $parts ) || '' === $parts[0] || '' === $parts[1] ) {
			continue;
		}
		$links .= '<!-- wp:social-link ' . wp_json_encode(
			array(
				'url'     => $parts[1],
				'service' => sanitize_key( $parts[0] ),
			)
		) . ' /-->';
	}
	if ( '' === $links ) {
		return '';
	}
	return do_blocks( '<!-- wp:social-links {"className":"author-socials is-style-logos-only"} --><ul class="wp-block-social-links author-socials is-style-logos-only">' . $links . '</ul><!-- /wp:social-links -->' );
}

/**
 * A biography as the source prints it: the first paragraph, then each further line as an item of a list
 * (WordPress keeps a biography as plain text with its line breaks, S-12).
 *
 * @param string $text The biography.
 * @return string
 */
function wp_ja_fresco_author_about( string $text ): string {
	$blocks = preg_split( '/\R\s*\R/', trim( $text ), 2 );
	$out    = esc_html( trim( (string) ( $blocks[0] ?? '' ) ) );
	$items  = isset( $blocks[1] ) ? array_filter( array_map( 'trim', preg_split( '/\R/', $blocks[1] ) ) ) : array();
	if ( $items ) {
		$out .= '<ul class="list-special">';
		foreach ( $items as $item ) {
			$out .= '<li>' . esc_html( $item ) . '</li>';
		}
		$out .= '</ul>';
	}
	return $out;
}

/**
 * Render callback of the author grid.
 *
 * @return string
 */
function wp_ja_fresco_render_authors(): string {
	$cards = '';
	foreach ( wp_ja_fresco_authors() as $user ) {
		$avatar = (int) get_user_meta( $user->ID, 'tracy_avatar', true );
		$image  = $avatar ? wp_get_attachment_image( $avatar, 'large', false, array( 'alt' => $user->display_name ) ) : '';
		$job    = trim( (string) get_user_meta( $user->ID, 'job_title', true ) );
		$about  = trim( (string) $user->description );
		$url    = esc_url( get_author_posts_url( $user->ID ) );
		$cards .= '<li class="author"><div class="author-block author-block-list">';
		if ( '' !== $image ) {
			$cards .= '<div class="author-avatar"><a href="' . $url . '" tabindex="-1">' . $image . '</a></div>';
		}
		$cards .= '<div class="author-other-info"><h2 class="author-name"><a href="' . $url . '">' . esc_html( $user->display_name ) . '</a></h2>';
		if ( '' !== $job ) {
			$cards .= '<p class="author-title">' . esc_html( $job ) . '</p>';
		}
		if ( '' !== $about ) {
			$cards .= '<div class="author-about-me">' . wp_ja_fresco_author_about( $about ) . '</div>';
		}
		$cards .= wp_ja_fresco_author_social( $user->ID ) . '</div></div></li>';
	}
	if ( '' === $cards ) {
		return '';
	}
	return '<div class="wp-block-wp-ja-fresco-authors"><ul class="author-lists">' . $cards . '</ul></div>';
}

/** Registers the author grid block. */
function wp_ja_fresco_register_author_block(): void {
	register_block_type(
		'wp-ja-fresco/authors',
		array(
			'api_version'     => 3,
			'title'           => __( 'Author grid (JA Fresco)', 'wp-ja-fresco' ),
			'description'     => __( 'The site\'s people: photo, name, job title, a short biography and social links.', 'wp-ja-fresco' ),
			'category'        => 'widgets',
			'supports'        => array( 'html' => false ),
			'render_callback' => 'wp_ja_fresco_render_authors',
		)
	);
}
add_action( 'init', 'wp_ja_fresco_register_author_block' );

/**
 * Joomla prints a blog listing's "Page N of M" counter beside the pager's <nav>, not inside it (the source's
 * pagination-wrap holds the two as siblings). The seeder's pager writes the counter as the last child of the
 * <nav>; it is moved after it here, both wrapped in one row (gc.css lays the row out as the <nav> was).
 *
 * @param string $content The rendered pager.
 * @return string
 */
function wp_ja_fresco_pager_counter( string $content ): string {
	if ( ! str_contains( $content, 'tracy-pager__counter' ) ) {
		return $content;
	}
	if ( ! preg_match( '#^(\s*<nav\b[^>]*>)(.*)(<p class="tracy-pager__counter">.*?</p>)\s*</nav>\s*$#s', $content, $m ) ) {
		return $content;
	}
	return '<div class="jf-pager-row">' . $m[1] . $m[2] . '</nav>' . $m[3] . '</div>';
}
add_filter( 'render_block_core/query-pagination', 'wp_ja_fresco_pager_counter', 20 );
