<?php
/**
 * wp-ja-impact, page group gb: the listing pages (donations, events, the blog views, the article table, the
 * tagged items and the author list). The patterns draw each list as a Query Loop; this file resolves what a
 * pattern cannot know: the order the editors gave the articles, the tagged articles, the post fields a table
 * row prints (author, hits) and the grid of authors, which core has no block for.
 *
 * @package wp-ja-impact
 */

defined( 'ABSPATH' ) || exit;

/**
 * Query attributes the gb patterns add to a Query Loop.
 *
 * `wpJaImpactOrder: "joomla"` orders by the position the articles were given in the source (post field
 * `joomla-ordering`); `wpJaImpactTagged` lists the articles that carry at least one tag, leaving out the
 * archived ones.
 *
 * @param array    $query The WP_Query arguments the block built.
 * @param WP_Block $block The post template block.
 * @return array
 */
function wp_ja_impact_gb_query_vars( array $query, WP_Block $block ): array {
	$ctx = $block->context['query'] ?? array();
	if ( 'joomla' === ( $ctx['wpJaImpactOrder'] ?? '' ) ) {
		$query['meta_key'] = 'joomla-ordering'; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
		$query['orderby']  = array(
			'meta_value_num' => 'ASC',
			'ID'             => 'ASC',
		);
		unset( $query['order'] );
	}
	if ( 'featured' === ( $ctx['wpJaImpactOrder'] ?? '' ) ) {
		// The source lists its featured articles by the front-page ordering the dump does not carry: the order
		// printed by the running site is the post meta `featured-order` (spec step 54).
		$query['meta_key'] = 'featured-order'; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
		$query['orderby']  = array(
			'meta_value_num' => 'ASC',
			'ID'             => 'ASC',
		);
		unset( $query['order'] );
		$events = get_term_by( 'slug', 'events', 'category' );
		if ( $events ) {
			$query['category__not_in'] = array( (int) $events->term_id );
		}
	}
	if ( ! empty( $ctx['wpJaImpactTagged'] ) ) {
		$tax   = array(
			'relation' => 'AND',
			array(
				'taxonomy' => 'post_tag',
				'operator' => 'EXISTS',
			),
		);
		$older = get_term_by( 'slug', 'archived', 'post_tag' );
		if ( $older ) {
			$tax[] = array(
				'taxonomy' => 'post_tag',
				'field'    => 'term_id',
				'terms'    => array( (int) $older->term_id ),
				'operator' => 'NOT IN',
			);
		}
		$query['tax_query'] = $tax; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
	}
	return $query;
}
add_filter( 'query_loop_block_query_vars', 'wp_ja_impact_gb_query_vars', 11, 2 );

/**
 * The block bindings source of the article table: one printed value of the current post.
 *
 * @param array    $args  The binding's arguments: `field` (`written`, `hits`).
 * @param WP_Block $block The bound block (its postId context).
 * @return string|null
 */
function wp_ja_impact_gb_binding( array $args, $block ) {
	$post_id = (int) ( $block->context['postId'] ?? 0 );
	$field   = (string) ( $args['field'] ?? '' );
	if ( ! $post_id || '' === $field ) {
		return null;
	}
	switch ( $field ) {
		case 'written':
			$name = get_the_author_meta( 'display_name', (int) get_post_field( 'post_author', $post_id ) );
			/* translators: %s: an author's name. */
			return '' === $name ? '' : sprintf( __( 'Written by: %s', 'wp-ja-impact' ), $name );
		case 'published':
			return get_the_date( '', $post_id );
		case 'byline':
			$author = (int) get_post_field( 'post_author', $post_id );
			$name   = get_the_author_meta( 'display_name', $author );
			/* translators: %s: a link to an author's posts, carrying the author's name. */
			return '' === $name ? '' : sprintf( __( 'By %s', 'wp-ja-impact' ), '<a href="' . esc_url( get_author_posts_url( $author ) ) . '">' . esc_html( $name ) . '</a>' );
		case 'hits':
			$hits = trim( (string) get_post_meta( $post_id, 'hits', true ) );
			/* translators: %s: how many times an article was read. */
			return '' === $hits ? '' : sprintf( __( 'Hits: %s', 'wp-ja-impact' ), $hits );
	}
	return null;
}

/** Registers the bindings source of the article table. */
function wp_ja_impact_gb_register_bindings(): void {
	if ( ! function_exists( 'register_block_bindings_source' ) ) {
		return;
	}
	register_block_bindings_source(
		'wp-ja-impact/gb',
		array(
			'label'              => __( 'Post field (JA Impact listings)', 'wp-ja-impact' ),
			'get_value_callback' => 'wp_ja_impact_gb_binding',
			'uses_context'       => array( 'postId' ),
		)
	);
}
add_action( 'init', 'wp_ja_impact_gb_register_bindings' );

/**
 * The authors the list shows: the people the importer created from the source's registered users, in the
 * order the source numbered them.
 *
 * @return WP_User[]
 */
function wp_ja_impact_gb_authors(): array {
	$users = get_users(
		array(
			'role'     => 'author',
			'meta_key' => 'tracy_source_author', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'orderby'  => 'ID',
		)
	);
	// A person with no published article is not an author of the site (the source's list leaves its administrator out).
	$users = array_values(
		array_filter(
			$users,
			static fn( WP_User $user ): bool => count_user_posts( $user->ID, 'post', true ) > 0 && '1' !== (string) get_user_meta( $user->ID, 'author_list_hidden', true )
		)
	);
	usort(
		$users,
		static function ( WP_User $a, WP_User $b ): int {
			$ka = (int) preg_replace( '/\D+/', '', (string) get_user_meta( $a->ID, 'tracy_source_author', true ) );
			$kb = (int) preg_replace( '/\D+/', '', (string) get_user_meta( $b->ID, 'tracy_source_author', true ) );
			return $ka <=> $kb;
		}
	);
	return $users;
}

/**
 * The pager of the author list, in the markup the theme's Joomla pager uses so one stylesheet draws both.
 *
 * @param int $page  The current page.
 * @param int $total The number of pages.
 * @return string
 */
function wp_ja_impact_gb_pager( int $page, int $total ): string {
	if ( $total < 2 ) {
		return '';
	}
	$link = static fn( int $n ): string => esc_url( 1 === $n ? remove_query_arg( 'authors-page' ) : add_query_arg( 'authors-page', $n ) );
	$item = static function ( string $label, string $aria, ?int $to, bool $current = false ) use ( $link ): string {
		if ( $current ) {
			return '<li class="tracy-pager__item is-current"><span class="tracy-pager__link" aria-current="page" aria-label="' . esc_attr( $aria ) . '">' . esc_html( $label ) . '</span></li>';
		}
		if ( null === $to ) {
			return '<li class="tracy-pager__item is-disabled"><span class="tracy-pager__link" aria-hidden="true">' . esc_html( $label ) . '</span></li>';
		}
		return '<li class="tracy-pager__item"><a class="tracy-pager__link" href="' . $link( $to ) . '" aria-label="' . esc_attr( $aria ) . '">' . esc_html( $label ) . '</a></li>';
	};
	$out  = '<nav class="tracy-pager tracy-pagination tracy-joomla-pager jim-gb__pager" aria-label="' . esc_attr__( 'Pagination', 'wp-ja-impact' ) . '"><ul class="tracy-pager__list">';
	$out .= $item( __( 'Start', 'wp-ja-impact' ), __( 'Go to start page', 'wp-ja-impact' ), $page > 1 ? 1 : null );
	$out .= $item( __( 'Previous', 'wp-ja-impact' ), __( 'Go to previous page', 'wp-ja-impact' ), $page > 1 ? $page - 1 : null );
	for ( $n = 1; $n <= $total; $n++ ) {
		/* translators: %d: a page number. */
		$out .= $item( (string) $n, sprintf( __( 'Page %d', 'wp-ja-impact' ), $n ), $n, $n === $page );
	}
	$out .= $item( __( 'Next', 'wp-ja-impact' ), __( 'Go to next page', 'wp-ja-impact' ), $page < $total ? $page + 1 : null );
	$out .= $item( __( 'End', 'wp-ja-impact' ), __( 'Go to end page', 'wp-ja-impact' ), $page < $total ? $total : null );
	/* translators: 1: the current page, 2: the number of pages. */
	$out .= '</ul></nav>';
	return $out;
}

/**
 * Render callback of the author grid.
 *
 * @param array $attributes Block attributes: `perPage`.
 * @return string
 */
function wp_ja_impact_gb_render_authors( array $attributes ): string {
	$people = wp_ja_impact_gb_authors();
	if ( ! $people ) {
		return '';
	}
	$per   = max( 1, (int) ( $attributes['perPage'] ?? 6 ) );
	$total = (int) ceil( count( $people ) / $per );
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$page  = isset( $_GET['authors-page'] ) ? max( 1, min( $total, (int) $_GET['authors-page'] ) ) : 1;
	$cards = '';
	foreach ( array_slice( $people, ( $page - 1 ) * $per, $per ) as $user ) {
		$avatar = (int) get_user_meta( $user->ID, 'tracy_avatar', true );
		$image  = $avatar ? wp_get_attachment_image( $avatar, 'large', false, array( 'alt' => $user->display_name ) ) : '';
		$job    = trim( (string) get_user_meta( $user->ID, 'job_title', true ) );
		$parts  = preg_split( '/\R\s*\R/', trim( (string) $user->description ) );
		$about  = $parts ? trim( (string) $parts[0] ) : '';
		$url    = esc_url( get_author_posts_url( $user->ID ) );
		$cards .= '<li class="jim-author">';
		if ( '' !== $image ) {
			$cards .= '<a class="jim-author__image" href="' . $url . '">' . $image . '</a>';
		}
		$cards .= '<div class="jim-author__info"><h4 class="jim-author__name"><a href="' . $url . '">' . esc_html( $user->display_name ) . '</a></h4>';
		if ( '' !== $job ) {
			$cards .= '<p class="jim-author__job">' . esc_html( $job ) . '</p>';
		}
		if ( '' !== $about ) {
			$cards .= '<p class="jim-author__about">' . esc_html( $about ) . '</p>';
		}
		$cards .= '</div></li>';
	}
	return '<div class="wp-block-wp-ja-impact-gb-authors jim-author-list"><ul class="jim-author-grid">' . $cards . '</ul>' . wp_ja_impact_gb_pager( $page, $total ) . '</div>';
}

/** Registers the author grid block. */
function wp_ja_impact_gb_register_blocks(): void {
	register_block_type(
		'wp-ja-impact/gb-authors',
		array(
			'api_version'     => 3,
			'title'           => __( 'Author grid (JA Impact)', 'wp-ja-impact' ),
			'description'     => __( 'The site\'s authors: photo, name, job title and a short biography.', 'wp-ja-impact' ),
			'category'        => 'widgets',
			'attributes'      => array(
				'perPage' => array(
					'type'    => 'integer',
					'default' => 6,
				),
			),
			'render_callback' => 'wp_ja_impact_gb_render_authors',
		)
	);
}
add_action( 'init', 'wp_ja_impact_gb_register_blocks' );

/**
 * The attachment that holds a post's intro picture (the post field `intro-image` names its file).
 *
 * @param int $post_id The post.
 * @return int Attachment id, 0 when the post has none.
 */
function wp_ja_impact_gb_intro_attachment( int $post_id ): int {
	$held = (int) get_post_meta( $post_id, 'intro-image-id', true );
	if ( $held && 'attachment' === get_post_type( $held ) ) {
		return $held;
	}
	$file = trim( (string) get_post_meta( $post_id, 'intro-image', true ) );
	if ( '' === $file ) {
		return 0;
	}
	$key = 'wp_ja_impact_gb_intro_' . md5( $file );
	$id  = wp_cache_get( $key, 'wp-ja-impact' );
	if ( false === $id ) {
		global $wpdb;
		$like = '%/' . $wpdb->esc_like( $file );
		$id   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_wp_attached_file' AND meta_value LIKE %s ORDER BY post_id ASC LIMIT 1", $like ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		wp_cache_set( $key, $id, 'wp-ja-impact' );
	}
	return (int) $id;
}

/**
 * The cards of the listings print the article's intro picture rather than its full-text one.
 *
 * @param string   $content  The block's HTML.
 * @param array    $block    The parsed block.
 * @param WP_Block $instance The block instance (its context).
 * @return string
 */
function wp_ja_impact_gb_card_picture( string $content, array $block, $instance ): string {
	$class = (string) ( $block['attrs']['className'] ?? '' );
	if ( '' === $content || false === strpos( $class, 'jim-gb-image' ) ) {
		return $content;
	}
	$attachment = wp_ja_impact_gb_intro_attachment( (int) ( $instance->context['postId'] ?? 0 ) );
	if ( ! $attachment ) {
		return $content;
	}
	$style = '';
	if ( preg_match( '/<img[^>]*\sstyle="([^"]*)"/', $content, $found ) ) {
		$style = $found[1];
	}
	$image = wp_get_attachment_image( $attachment, 'large', false, '' === $style ? array() : array( 'style' => $style ) );
	if ( '' === $image ) {
		return $content;
	}
	return (string) preg_replace( '/<img\b[^>]*>/', $image, $content, 1 );
}
add_filter( 'render_block_core/post-featured-image', 'wp_ja_impact_gb_card_picture', 11, 3 );
