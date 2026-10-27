<?php
/**
 * Content pages (group B): the two listing routes whose page holds no listing of its own.
 *
 * The seeder writes the Featured Articles page empty and the Tagged Items page with every post, but the
 * source lists the featured (sticky) posts three to a row, and the posts tagged Morgan two to a row. The
 * theme answers those two routes with its own patterns (patterns/b-*.php), so the list stays in blocks.
 *
 * @package wp-ja-morgan
 */

/**
 * The pattern that stands in for the content of a listing route, or '' for any other page.
 *
 * @return string The registered pattern slug.
 */
function wp_ja_morgan_b_route_pattern(): string {
	if ( ! is_page() ) {
		return '';
	}
	$map = array(
		'featured-articles' => 'wp-ja-morgan/b-featured-articles',
		'tagged-items'      => 'wp-ja-morgan/b-tagged-items',
		'list-of-all-tags'  => 'wp-ja-morgan/b-tag-list',
		'list-all-categories' => 'wp-ja-morgan/b-category-list',
	);
	$slug = (string) get_post_field( 'post_name', get_queried_object_id() );
	$path = trim( (string) wp_parse_url( get_permalink( get_queried_object_id() ), PHP_URL_PATH ), '/' );
	return ( isset( $map[ $slug ] ) && 0 === strpos( $path, 'joomlart-content/' ) ) ? $map[ $slug ] : '';
}

/**
 * Replaces the content of a listing route with its pattern.
 *
 * @param string $content The rendered post content block.
 * @return string
 */
function wp_ja_morgan_b_route_content( string $content ): string {
	$slug = wp_ja_morgan_b_route_pattern();
	if ( '' === $slug ) {
		return $content;
	}
	$pattern = WP_Block_Patterns_Registry::get_instance()->get_registered( $slug );
	if ( ! $pattern ) {
		return $content;
	}
	return '<div class="wp-block-post-content t3-content item-page">' . do_blocks( $pattern['content'] ) . '</div>';
}
add_filter( 'render_block_core/post-content', 'wp_ja_morgan_b_route_content', 20 );

/**
 * The hits line of a featured card: the count the source shows ("Hits: 29"), from the post meta.
 *
 * @param string   $content The rendered paragraph.
 * @param array    $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_b_hits( string $content, array $block ): string {
	if ( false === strpos( $content, '{jm-hits}' ) ) {
		return $content;
	}
	return str_replace( '{jm-hits}', (string) (int) get_post_meta( get_the_ID(), 'hits', true ), $content );
}
add_filter( 'render_block_core/paragraph', 'wp_ja_morgan_b_hits', 10, 2 );

/**
 * Straight quotes and dashes, as the source prints them. Joomla stores and prints article text
 * verbatim; WordPress would turn every quote into a curly one and every " - " into an en dash, so the
 * same sentence would read differently on the two sites.
 */
add_filter( 'run_wptexturize', '__return_false' );

/**
 * The Login module is assigned to every sidebar of the source except the one of the tag list.
 *
 * @param string $content The rendered group block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_b_login_module( string $content, array $block ): string {
	$class = (string) ( $block['attrs']['className'] ?? '' );
	if ( false === strpos( $class, 'jm-login' ) ) {
		return $content;
	}
	if ( is_page() && 'list-of-all-tags' === get_post_field( 'post_name', get_queried_object_id() ) ) {
		return '';
	}
	// The source's two fields show "Username" and "Password" inside the empty box; WordPress prints them bare (the labels stay for screen readers).
	$content = preg_replace( '/(<input\b[^>]*\bid="user_login")/', '$1 placeholder="' . esc_attr__( 'Username', 'wp-ja-morgan' ) . '"', $content, 1 ) ?? $content;
	return preg_replace( '/(<input\b[^>]*\bid="user_pass")/', '$1 placeholder="' . esc_attr__( 'Password', 'wp-ja-morgan' ) . '"', $content, 1 ) ?? $content;
}
add_filter( 'render_block_core/group', 'wp_ja_morgan_b_login_module', 10, 2 );

/**
 * The three links the source's Login module prints under the button (create an account, forgot the username, forgot the password)
 * sit inside the form, as the source's do, so the form box and the link row are one thing.
 *
 * @param string               $bottom The markup after the submit row.
 * @param array<string, mixed> $args   The form arguments.
 * @return string
 */
function wp_ja_morgan_login_links( string $bottom, array $args ): string {
	if ( 'loginform' !== ( $args['form_id'] ?? '' ) ) {
		return $bottom;
	}
	// With registration closed the link would lead to a dead end, so it is not printed (as the list-item filter of the account group did).
	$create = get_option( 'users_can_register' ) ? '<li><a href="' . esc_url( home_url( '/j-pages/registration/' ) ) . '">' . esc_html__( 'Create an account', 'wp-ja-morgan' ) . '</a></li>' : '';
	return $bottom . '<ul class="wp-block-list unstyled">' . $create
		. '<li><a href="' . esc_url( home_url( '/username-reminder-request/' ) ) . '">' . esc_html__( 'Forgot your username?', 'wp-ja-morgan' ) . '</a></li>'
		. '<li><a href="' . esc_url( home_url( '/password-reset/' ) ) . '">' . esc_html__( 'Forgot your password?', 'wp-ja-morgan' ) . '</a></li></ul>';
}
add_filter( 'login_form_bottom', 'wp_ja_morgan_login_links', 10, 2 );

/**
 * A text cut the way the source cuts a listing text. The source cuts the article's stored HTML (`<p>text</p>` and a CRLF),
 * so its 150-character limit counts those 9 markup characters too: the text is cut on the last space of the first
 * 150 characters of the markup, and "..." follows the paragraph when something was left out.
 *
 * @param string $text   Plain text.
 * @param int    $length The character limit, counted on the markup.
 * @return array{0:string,1:bool} The text and whether it was cut.
 */
function wp_ja_morgan_b_truncate( string $text, int $length = 150 ): array {
	$text   = trim( wp_strip_all_tags( $text ) );
	$markup = "<p>{$text}</p>\r\n";
	if ( mb_strlen( $markup ) <= $length ) {
		return array( $text, false );
	}
	$cut   = mb_substr( $markup, 0, $length );
	$space = mb_strrpos( $cut, ' ' );
	$cut   = false === $space ? $cut : mb_substr( $cut, 0, $space );
	return array( trim( wp_strip_all_tags( $cut ) ), true );
}

/**
 * The text of a Tagged Items card: the article's intro as the editor wrote it, cut like the source.
 *
 * @param string $content The rendered excerpt block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_morgan_b_tag_body( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'tag-body' ) ) {
		return $content;
	}
	$excerpt = (string) get_post_field( 'post_excerpt', get_the_ID() );
	if ( '' === $excerpt ) {
		return $content;
	}
	list( $text, $cut ) = wp_ja_morgan_b_truncate( $excerpt );
	return '<div class="tag-body wp-block-post-excerpt"><p class="wp-block-post-excerpt__excerpt">' . esc_html( $text ) . '</p>' . ( $cut ? '...' : '' ) . '</div>';
}
add_filter( 'render_block_core/post-excerpt', 'wp_ja_morgan_b_tag_body', 10, 2 );

/**
 * The options of the "Display #" select, as the source offers them; 0 is "All".
 *
 * @return int[]
 */
function wp_ja_morgan_b_limits(): array {
	return array( 5, 10, 15, 20, 25, 30, 50, 100, 200, 500, 0 );
}

/**
 * What the visitor asked of a listing filter: the title part and the page size.
 *
 * `filter-search` is the source's field name. Anything that is not a plain string (an array, a
 * very long value) is ignored, and a limit outside the offered list falls back to 20.
 *
 * @return array{search:string,limit:int}
 */
function wp_ja_morgan_b_filter_params(): array {
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- a read-only display filter.
	$search = isset( $_GET['filter-search'] ) && is_string( $_GET['filter-search'] ) ? sanitize_text_field( wp_unslash( $_GET['filter-search'] ) ) : '';
	$limit  = isset( $_GET['limit'] ) && is_string( $_GET['limit'] ) && preg_match( '/^\d{1,3}$/', $_GET['limit'] ) ? (int) $_GET['limit'] : 20;
	// phpcs:enable
	if ( ! in_array( $limit, wp_ja_morgan_b_limits(), true ) ) {
		$limit = 20;
	}
	return array(
		'search' => mb_substr( trim( $search ), 0, 100 ),
		'limit'  => $limit,
	);
}

/**
 * The filter bar of the tag list and the tagged items: the title box with its search and clear
 * buttons, and the page size. It is a GET form to the page's own address, so a filtered list can be
 * shared; assets/js/wp-ja-morgan.js submits it when the size changes and clears the box.
 *
 * @param array{search:string,limit:int} $params The current filter.
 * @param string                         $class  Extra class of the form.
 * @return string
 */
function wp_ja_morgan_b_filter_form( array $params, string $class = '' ): string {
	$options = '';
	foreach ( wp_ja_morgan_b_limits() as $n ) {
		$label    = 0 === $n ? __( 'All', 'wp-ja-morgan' ) : (string) $n;
		$options .= '<option value="' . (int) $n . '"' . selected( $params['limit'], $n, false ) . '>' . esc_html( $label ) . '</option>';
	}
	return '<form class="tag-list-form ' . esc_attr( $class ) . '" method="get" action="' . esc_url( get_permalink( get_queried_object_id() ) ) . '" data-jm-filter>'
		. '<fieldset class="filters btn-toolbar"><div class="btn-group">'
		. '<label class="filter-search-lbl screen-reader-text" for="filter-search">' . esc_html__( 'Enter Part of Title', 'wp-ja-morgan' ) . '</label>'
		. '<input type="text" name="filter-search" id="filter-search" maxlength="100" value="' . esc_attr( $params['search'] ) . '" class="inputbox" placeholder="' . esc_attr__( 'Enter Part of Title', 'wp-ja-morgan' ) . '" />'
		. '<button type="submit" class="btn" title="' . esc_attr__( 'Search', 'wp-ja-morgan' ) . '"><span class="fa fa-search"></span></button>'
		. '<button type="button" class="btn" data-jm-filter-clear title="' . esc_attr__( 'Clear', 'wp-ja-morgan' ) . '"><span class="fa fa-remove"></span></button>'
		. '</div><div class="btn-group pull-right"><label for="limit" class="screen-reader-text">' . esc_html__( 'Display #', 'wp-ja-morgan' ) . '</label>'
		. '<select id="limit" name="limit" class="form-select">' . $options . '</select></div></fieldset></form>';
}

/**
 * The tag cards the filter lets through: the tags whose name holds the typed part (any case), cut
 * to the page size.
 *
 * @param array<string,array{0:string,1:string,2:int}> $cards  Slug => card.
 * @param array{search:string,limit:int}               $params The current filter.
 * @return array<string,array{0:string,1:string,2:int}>
 */
function wp_ja_morgan_b_filter_cards( array $cards, array $params ): array {
	if ( '' !== $params['search'] ) {
		$cards = array_filter(
			$cards,
			static function ( string $slug ) use ( $params ): bool {
				$term = get_term_by( 'slug', $slug, 'post_tag' );
				$name = $term ? $term->name : ucfirst( $slug );
				return false !== mb_stripos( $name, $params['search'] );
			},
			ARRAY_FILTER_USE_KEY
		);
	}
	return $params['limit'] > 0 ? array_slice( $cards, 0, $params['limit'], true ) : $cards;
}

/**
 * Tagged Items: the same filter reaches the listing's query (title part, page size) and the bar is
 * printed above it. Nothing here touches another query block.
 */
add_filter(
	'query_loop_block_query_vars',
	static function ( array $query, $block ): array {
		// The page holds one listing, so the route decides (the post template carries no class of the query block).
		if ( ! is_page() || 'wp-ja-morgan/b-tagged-items' !== wp_ja_morgan_b_route_pattern() ) {
			return $query;
		}
		// Only the listing itself (the query on a tag): the sidebar's "most read" query sits on the same page and keeps its own size.
		$context = isset( $block->context['query'] ) && is_array( $block->context['query'] ) ? $block->context['query'] : array();
		if ( empty( $context['taxQuery']['post_tag'] ) ) {
			return $query;
		}
		$params = wp_ja_morgan_b_filter_params();
		if ( '' !== $params['search'] ) {
			$query['jm_title_like'] = $params['search'];
		}
		$query['posts_per_page'] = 0 === $params['limit'] ? -1 : $params['limit'];
		return $query;
	},
	10,
	2
);
add_filter(
	'posts_where',
	static function ( string $where, WP_Query $query ): string {
		global $wpdb;
		$part = $query->get( 'jm_title_like' );
		if ( is_string( $part ) && '' !== $part ) {
			$where .= $wpdb->prepare( " AND {$wpdb->posts}.post_title LIKE %s", '%' . $wpdb->esc_like( $part ) . '%' );
		}
		return $where;
	},
	10,
	2
);
add_filter(
	'render_block_core/query',
	static function ( string $content, array $block ): string {
		if ( ! is_page() || 'wp-ja-morgan/b-tagged-items' !== wp_ja_morgan_b_route_pattern() || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'tag-category' ) ) {
			return $content;
		}
		$params = wp_ja_morgan_b_filter_params();
		$empty  = false === strpos( $content, 'class="item' ) ? '<p class="alert alert-info">' . esc_html__( 'No items match this filter.', 'wp-ja-morgan' ) . '</p>' : '';
		// The filter bar's styles hang on `.tag-category`; the query block that carries that class is the list, not its bar.
		return '<div class="tag-category jm-tagged-filter">' . wp_ja_morgan_b_filter_form( $params, 'tagged-items-form' ) . '</div>' . $content . $empty;
	},
	10,
	2
);

/**
 * The URL of a picture in the media library by file name, or '' when it was never imported.
 *
 * @param string $file File name, e.g. img-7-thumb.jpg.
 * @return string
 */
function wp_ja_morgan_b_media( string $file ): string {
	global $wpdb;
	$id = (int) $wpdb->get_var( $wpdb->prepare( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_wp_attached_file' AND (meta_value = %s OR meta_value LIKE %s) LIMIT 1", $file, '%/' . $wpdb->esc_like( $file ) ) );
	return $id ? (string) wp_get_attachment_url( $id ) : '';
}

/**
 * What the source's tag list prints for each tag (Joomla tag picture, description cut to its first
 * words, hit counter), by tag slug and in the source's order.
 *
 * @return array<string,array{0:string,1:string,2:int}> Slug => picture file, caption, hits.
 */
function wp_ja_morgan_b_tag_cards(): array {
	return array(
		'business' => array( 'img-7-thumb.jpg', 'Doing business', 3 ),
		'finance'  => array( 'img-11-thumb.jpg', 'Gregor then', 2 ),
		'platform' => array( 'img-17-thumb.jpg', 'He felt a', 8 ),
		'studio'   => array( 'img-8-thumb.jpg', 'I am so happy,', 8 ),
		'morgan'   => array( 'img-19-thumb.jpg', 'A wonderful', 218 ),
	);
}

/**
 * The categories the source's category list prints, in its order. The picture of each card is the attachment id stored on
 * the term (term meta `thumbnail_id`), set when the content is seeded; nothing here names a picture file.
 *
 * @return string[] Category slugs.
 */
function wp_ja_morgan_b_category_slugs(): array {
	return array(
		'investment-managment',
		'business-growth-advice',
		'tax-advice-and-management',
		'business-insights',
		'investment-and-superannuation',
		'retirement-planning',
		'tax-planning',
	);
}

/**
 * The source's log-in button reads "Log in"; WordPress capitalises it ("Log In").
 *
 * @param array<string, mixed> $defaults The login form defaults.
 * @return array<string, mixed>
 */
function wp_ja_morgan_login_label( array $defaults ): array {
	$defaults['label_log_in'] = __( 'Log in', 'wp-ja-morgan' );
	return $defaults;
}
add_filter( 'login_form_defaults', 'wp_ja_morgan_login_label' );
