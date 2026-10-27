<?php
/**
 * Blog group: the article listings (Our Blog, Featured Articles, Tagged Items, All Categories, the archives), the
 * single article, the search view and the blog sidebar, drawn with the markup of the source's com_content, com_tags
 * and com_finder views (templates/ja_diner/html) so the carried template sheet applies as written.
 *
 * The seeder files each listing route as a page whose body is a masthead, a list and the Subscribe band. The page
 * content is rebuilt before it is rendered: the masthead and the band are kept as the seeder wrote them, the list
 * and the sidebar are drawn here from the site's articles, categories and tags.
 *
 * @package wp-ja-diner
 */

/**
 * The slug of the listing page being served, or '' when the request is not one of them.
 *
 * @return string
 */
function wp_ja_diner_blog_page_slug(): string {
	if ( ! is_page() ) {
		return '';
	}
	$slug = (string) get_post_field( 'post_name', get_queried_object_id() );
	return in_array( $slug, array( 'our-blog', 'tagged-items', 'fetured-articles', 'all-categories' ), true ) ? $slug : '';
}

/**
 * The category all the news categories sit under ("Our Blog" in the source's menu).
 *
 * @return WP_Term|null
 */
function wp_ja_diner_blog_root(): ?WP_Term {
	foreach ( array( 'our-blog', 'restaurant' ) as $slug ) {
		$term = get_term_by( 'slug', $slug, 'category' );
		if ( $term instanceof WP_Term ) {
			return $term;
		}
	}
	return null;
}

/**
 * The news categories (the children of the root), in the order the source lists them.
 *
 * @return WP_Term[]
 */
function wp_ja_diner_blog_categories(): array {
	$root = wp_ja_diner_blog_root();
	if ( ! $root ) {
		return array();
	}
	$terms = get_terms(
		array(
			'taxonomy'   => 'category',
			'parent'     => $root->term_id,
			'orderby'    => 'term_id',
			'hide_empty' => false,
		)
	);
	return is_array( $terms ) ? array_values( $terms ) : array();
}

/**
 * The first category an article is filed under below the root.
 *
 * @param int $post_id The article.
 * @return WP_Term|null
 */
function wp_ja_diner_blog_category( int $post_id ): ?WP_Term {
	$terms = get_the_category( $post_id );
	foreach ( $terms as $term ) {
		if ( $term->parent ) {
			return $term;
		}
	}
	return $terms ? $terms[0] : null;
}

/**
 * The articles of the news categories in the source's order: category by category, each in the order it was written.
 *
 * @return int[]
 */
function wp_ja_diner_blog_ordered_ids(): array {
	$ids = array();
	foreach ( wp_ja_diner_blog_categories() as $term ) {
		$found = get_posts(
			array(
				'category'            => $term->term_id,
				'numberposts'         => -1,
				'orderby'             => 'ID',
				'order'               => 'ASC',
				'fields'              => 'ids',
				'ignore_sticky_posts' => true,
				'suppress_filters'    => true,
			)
		);
		$ids   = array_merge( $ids, array_map( 'intval', $found ) );
	}
	return array_values( array_unique( $ids ) );
}

/**
 * The tags row of an article of the Featured Articles list.
 *
 * @param int $post_id The article.
 * @return string
 */
function wp_ja_diner_blog_tags_html( int $post_id ): string {
	$terms = get_the_terms( $post_id, 'post_tag' );
	if ( ! is_array( $terms ) || ! $terms ) {
		return '';
	}
	$out = '';
	foreach ( array_values( $terms ) as $i => $term ) {
		$out .= '<span class="tag-' . (int) $term->term_id . ' tag-list' . $i . '" itemprop="keywords"><a href="' . esc_url( get_term_link( $term ) ) . '" class="label label-info"> ' . esc_html( $term->name ) . ' </a></span>';
	}
	return '<div class="tags">' . $out . '</div>';
}

/**
 * The intro picture of an article in a list: the attachment kept in the article's `jd_intro_image` meta (the source's
 * lists draw a different picture from the article page), else the article's featured image.
 *
 * @param int   $post_id The article.
 * @param array $attrs   Attributes of the img element.
 * @return string An img element, or ''.
 */
function wp_ja_diner_blog_intro_picture( int $post_id, array $attrs ): string {
	$id = (int) get_post_meta( $post_id, 'jd_intro_image', true );
	return $id ? wp_get_attachment_image( $id, 'large', false, $attrs ) : get_the_post_thumbnail( $post_id, 'large', $attrs );
}

/**
 * One article of a listing in the markup of the source's blog layout: an `.isotope-item` holding the picture, the date,
 * the title, the intro and the Read more link.
 *
 * @param int    $post_id The article.
 * @param string $variant `blog` or `featured` (the same card; the featured one lists the tags and wraps the picture in `.imge-wrap`, as the source does).
 * @return string
 */
function wp_ja_diner_blog_item_html( int $post_id, string $variant = 'blog' ): string {
	$link    = esc_url( get_permalink( $post_id ) );
	$title   = esc_html( get_the_title( $post_id ) );
	$picture = wp_ja_diner_blog_intro_picture( $post_id, array( 'alt' => '', 'itemprop' => 'thumbnailUrl' ) );
	$wrap    = 'featured' === $variant ? 'imge-wrap' : 'image-wrap';
	$more    = esc_html__( 'Read more …', 'wp-ja-diner' );
	return '<div class="isotope-item"><div class="item" itemprop="blogPost" itemscope itemtype="https://schema.org/BlogPosting"><div class="system-unpublished"><article>'
		. ( '' !== $picture ? '<div class="' . $wrap . '"><div class="pull-none item-image"><a href="' . $link . '">' . $picture . '</a></div></div>' : '' )
		. '<aside class="article-aside clearfix"><dl class="article-info muted"><dt class="article-info-term">' . esc_html__( 'Details', 'wp-ja-diner' ) . '</dt>'
		. '<dd class="published hasTooltip" title="' . esc_attr__( 'Published: ', 'wp-ja-diner' ) . '"><i class="fa fa-calendar"></i><time datetime="' . esc_attr( get_the_date( 'c', $post_id ) ) . '" itemprop="datePublished">' . esc_html( get_the_date( 'j F Y', $post_id ) ) . '</time></dd></dl></aside>'
		. '<header class="article-header clearfix"><h2 class="article-title" itemprop="headline"><a href="' . $link . '" itemprop="url" title="' . esc_attr( wp_strip_all_tags( get_the_title( $post_id ) ) ) . '">' . $title . '</a></h2></header>'
		. '<section class="article-intro clearfix"><p>' . wp_kses_post( get_the_excerpt( $post_id ) ) . '</p></section>'
		. ( 'featured' === $variant ? wp_ja_diner_blog_tags_html( $post_id ) : '' )
		. '<section class="readmore"><a class="btn btn-default" href="' . $link . '" itemprop="url" aria-label="' . esc_attr( $more ) . '"><span><span class="icon-chevron-right" aria-hidden="true"></span> ' . $more . '</span></a></section>'
		. '</article></div></div></div>';
}

/**
 * One row of the Tagged Items list: the picture above the title and the intro, in an `.isotope-item`.
 *
 * @param int $post_id The article.
 * @return string
 */
function wp_ja_diner_blog_tag_item_html( int $post_id ): string {
	$picture = wp_ja_diner_blog_intro_picture( $post_id, array( 'alt' => '' ) );
	return '<div class="isotope-item"><div class="media-wrap">'
		. ( '' !== $picture ? '<div class="media-object image-wrap">' . $picture . '</div>' : '' )
		. '<div class="media-body"><h3 class="title"><a href="' . esc_url( get_permalink( $post_id ) ) . '"> ' . esc_html( get_the_title( $post_id ) ) . ' </a></h3><p>' . wp_kses_post( get_the_excerpt( $post_id ) ) . '</p></div></div></div>';
}

/**
 * The masonry frame the source's lists sit in (the carried sheet sizes `.isotope-item`; blog.js lays them out).
 *
 * @param string $items The `.isotope-item` markup.
 * @return string
 */
function wp_ja_diner_blog_grid( string $items ): string {
	return '<div class="ja-masonry-wrap isotope-layout"><div class="isotope grid clearfix grid-xs-1 grid-smx-2 grid-sm-2 grid-md-3 grid-lg-3"><div class="isotope-item grid-sizer"></div>' . $items . '</div></div>';
}

/**
 * The pager in the source's markup (`.pagination-wrap` with the counter and the Start / Prev / Next / End list).
 *
 * @param int    $page  The page shown.
 * @param int    $pages The number of pages.
 * @param string $base  The list's first-page URL.
 * @param string $tag   The wrapper element: the blog layout prints a div, the featured layout a nav.
 * @return string
 */
function wp_ja_diner_blog_pager_html( int $page, int $pages, string $base, string $tag = 'div' ): string {
	if ( $pages < 2 ) {
		return '';
	}
	$url   = static fn( int $n ): string => esc_url( 1 === $n ? $base : add_query_arg( 'paged', $n, $base ) );
	$link  = static fn( string $label, int $n, bool $on ): string => $on
		? '<li><a title="' . esc_attr( $label ) . '" href="' . $url( $n ) . '">' . esc_html( $label ) . '</a></li>'
		: '<li class="disabled"><a>' . esc_html( $label ) . '</a></li>';
	$items = $link( __( 'Start', 'wp-ja-diner' ), 1, $page > 1 ) . $link( __( 'Prev', 'wp-ja-diner' ), $page - 1, $page > 1 );
	for ( $n = 1; $n <= $pages; $n++ ) {
		$items .= $n === $page ? '<li class="active"><a>' . $n . '</a></li>' : '<li><a title="' . $n . '" href="' . $url( $n ) . '">' . $n . '</a></li>';
	}
	$items .= $link( __( 'Next', 'wp-ja-diner' ), $page + 1, $page < $pages ) . $link( __( 'End', 'wp-ja-diner' ), $pages, $page < $pages );
	/* translators: 1: the page shown, 2: the number of pages. */
	$counter = sprintf( __( 'Page %1$d of %2$d', 'wp-ja-diner' ), $page, $pages );
	return '<' . $tag . ' class="pagination-wrap' . ( 'nav' === $tag ? ' clearfix' : '' ) . '"><div class="counter"> ' . esc_html( $counter ) . '</div><ul class="pagination">' . $items . '</ul> </' . $tag . '>';
}

/**
 * The Our Blog list: twelve articles in the masonry grid, then "More Articles ..." with the next four titles, then the pager.
 *
 * @return string
 */
function wp_ja_diner_blog_list_html(): string {
	$ids   = wp_ja_diner_blog_ordered_ids();
	$per   = 12;
	$pages = max( 1, (int) ceil( count( $ids ) / $per ) );
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only list position, nothing is written.
	$page  = min( isset( $_GET['paged'] ) ? max( 1, (int) $_GET['paged'] ) : 1, $pages );
	$from  = ( $page - 1 ) * $per;
	$items = '';
	foreach ( array_slice( $ids, $from, $per ) as $id ) {
		$items .= wp_ja_diner_blog_item_html( (int) $id );
	}
	$more = '';
	foreach ( array_slice( $ids, $from + $per, 4 ) as $id ) {
		$more .= '<li><a href="' . esc_url( get_permalink( (int) $id ) ) . '"> ' . esc_html( get_the_title( (int) $id ) ) . ' </a></li>';
	}
	$more = '' === $more ? '' : '<div class="items-more"><section class="items-more"><h3>' . esc_html__( 'More Articles …', 'wp-ja-diner' ) . '</h3><ol class="nav">' . $more . '</ol></section></div>';
	return '<div class="blog" itemscope itemtype="https://schema.org/Blog">' . wp_ja_diner_blog_grid( $items ) . $more . wp_ja_diner_blog_pager_html( $page, $pages, (string) get_permalink() ) . '</div>';
}

/**
 * The Featured Articles list: four sticky articles in the same grid, each with its tags, then the rest as links and the pager.
 *
 * @return string
 */
function wp_ja_diner_blog_featured_html(): string {
	$sticky = array_map( 'intval', (array) get_option( 'sticky_posts', array() ) );
	$ids    = array_values( array_filter( wp_ja_diner_blog_ordered_ids(), static fn( int $id ): bool => in_array( $id, $sticky, true ) ) );
	$per    = 4;
	$pages  = max( 1, (int) ceil( count( $ids ) / $per ) );
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only list position, nothing is written.
	$page   = min( isset( $_GET['paged'] ) ? max( 1, (int) $_GET['paged'] ) : 1, $pages );
	$from   = ( $page - 1 ) * $per;
	$items  = '';
	foreach ( array_slice( $ids, $from, $per ) as $id ) {
		$items .= wp_ja_diner_blog_item_html( $id, 'featured' );
	}
	$more = '';
	foreach ( array_slice( $ids, $from + $per, 4 ) as $id ) {
		$more .= '<li><a href="' . esc_url( get_permalink( $id ) ) . '"> ' . esc_html( get_the_title( $id ) ) . '</a></li>';
	}
	$more = '' === $more ? '' : '<section class="items-more"><h3>' . esc_html__( 'More Articles …', 'wp-ja-diner' ) . '</h3><ol class="nav nav-tabs nav-stacked">' . $more . '</ol></section>';
	return '<div class="blog-featured" itemscope itemtype="https://schema.org/Blog">' . wp_ja_diner_blog_grid( $items ) . $more . wp_ja_diner_blog_pager_html( $page, $pages, (string) get_permalink(), 'nav' ) . '</div>';
}

/**
 * The title typed into the tag list's filter field (the source's `filter-search`).
 *
 * @return string
 */
function wp_ja_diner_blog_tag_title_filter(): string {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only list filter, nothing is written.
	return isset( $_GET['filter-search'] ) ? trim( sanitize_text_field( wp_unslash( $_GET['filter-search'] ) ) ) : '';
}

/**
 * The number of rows the tag list's "Display #" select asks for; the source's default is 20 and 0 means all.
 *
 * @return int
 */
function wp_ja_diner_blog_tag_limit(): int {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only list filter, nothing is written.
	return isset( $_GET['limit'] ) ? max( 0, (int) $_GET['limit'] ) : 20;
}

/**
 * The Tagged Items list as the source draws it: a filter row (title field with Search and Clear buttons, and the
 * "Display #" select) above the tagged articles, ordered by title. The form sends its fields to the same page.
 *
 * @return string
 */
function wp_ja_diner_blog_tagged_html(): string {
	$tags  = get_terms( array( 'taxonomy' => 'post_tag', 'fields' => 'ids', 'hide_empty' => true ) );
	$text  = wp_ja_diner_blog_tag_title_filter();
	$limit = wp_ja_diner_blog_tag_limit();
	$ids   = array();
	if ( is_array( $tags ) && $tags ) {
		$ids = get_posts(
			array(
				'post_type'        => 'post',
				'numberposts'      => 0 === $limit ? -1 : $limit,
				'orderby'          => 'title',
				'order'            => 'ASC',
				'fields'           => 'ids',
				'tax_query'        => array( array( 'taxonomy' => 'post_tag', 'field' => 'term_id', 'terms' => $tags ) ), // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- a handful of articles.
				'suppress_filters' => false,
				's'                => $text,
				'jd_title_only'    => true,
			)
		);
	}
	$items = '';
	foreach ( $ids as $id ) {
		$items .= wp_ja_diner_blog_tag_item_html( (int) $id );
	}
	$options = '';
	foreach ( array( 5, 10, 15, 20, 25, 30, 50, 100, 200, 500, 0 ) as $n ) {
		$options .= '<option value="' . $n . '"' . selected( $limit, $n, false ) . '>' . ( 0 === $n ? esc_html__( 'All', 'wp-ja-diner' ) : (int) $n ) . '</option>';
	}
	$hint = esc_attr__( 'Enter Part of Title', 'wp-ja-diner' );
	return '<div class="com-tags-tag tag-category"><form action="' . esc_url( (string) get_permalink() ) . '" method="get" name="adminForm" id="adminForm" class="form-inline js-tag-filter"><fieldset class="filters d-flex justify-content-between mb-3"><div class="input-group">'
		. '<label class="filter-search-lbl sr-only" for="filter-search">' . esc_html__( 'Enter Part of Title', 'wp-ja-diner' ) . ' </label>'
		. '<input type="text" name="filter-search" id="filter-search" value="' . esc_attr( $text ) . '" class="form-control" title="' . esc_attr__( 'Enter all or part of the title to search for.', 'wp-ja-diner' ) . '" placeholder="' . $hint . '" />'
		. '<span class="input-group-btn"><button type="submit" name="filter-search-button" title="' . esc_attr__( 'Search', 'wp-ja-diner' ) . '" class="btn btn-light"><span class="fa fa-search" aria-hidden="true"></span></button>'
		. '<button type="button" name="filter-clear-button" title="' . esc_attr__( 'Clear', 'wp-ja-diner' ) . '" class="btn btn-light js-tag-filter-clear"><span class="fa fa-times" aria-hidden="true"></span></button></span></div>'
		. '<div class="btn-group pull-right"><label for="limit" class="sr-only">' . esc_html__( 'Display #', 'wp-ja-diner' ) . ' </label><select id="limit" name="limit" class="form-select">' . $options . '</select></div></fieldset>'
		. wp_ja_diner_blog_grid( $items ) . '</form></div>';
}

/**
 * The picture a category card draws: the attachment kept in the term's `jd_category_image` meta, else the source's
 * category picture found by its file name.
 *
 * @param WP_Term $term The category.
 * @return string An img element, or ''.
 */
function wp_ja_diner_blog_category_picture( WP_Term $term ): string {
	$id = (int) get_term_meta( $term->term_id, 'jd_category_image', true );
	if ( ! $id ) {
		$files = array(
			'restaurant-business'  => 'business-detail-1',
			'restaurant-marketing' => 'marketing-detail-1',
			'restaurant-news'      => 'news-detail-3',
			'restaurant-guide'     => 'guide-detail-3',
		);
		if ( isset( $files[ $term->slug ] ) ) {
			global $wpdb;
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- one lookup of an uploaded file by name.
			$id = (int) $wpdb->get_var( $wpdb->prepare( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_wp_attached_file' AND meta_value LIKE %s ORDER BY post_id LIMIT 1", '%/' . $wpdb->esc_like( $files[ $term->slug ] ) . '.jpg' ) );
		}
	}
	return $id ? wp_get_attachment_image( $id, 'large', false, array( 'alt' => '' ) ) : '';
}

/**
 * The All Categories list: one card per news category (picture, name, article count, description).
 *
 * @return string
 */
function wp_ja_diner_blog_categories_list_html(): string {
	$terms = wp_ja_diner_blog_categories();
	$last  = count( $terms ) - 1;
	$cards = '';
	foreach ( $terms as $i => $term ) {
		$image = wp_ja_diner_blog_category_picture( $term );
		$desc  = trim( wp_strip_all_tags( $term->description ) );
		/* translators: %d: number of articles in a category. */
		$tip    = sprintf( __( 'Article Count: %d', 'wp-ja-diner' ), (int) $term->count );
		$cards .= '<div class="category-item col-sm-12 col-md-4' . ( 0 === $i ? ' first' : '' ) . ( $i === $last ? ' last' : '' ) . ' col"><div class="category-inner">'
			. ( '' !== $image ? '<div class="description-image">' . $image . '</div>' : '' )
			. '<div class="category-info"><h3 class="item-title"><a href="' . esc_url( get_term_link( $term ) ) . '"> ' . esc_html( html_entity_decode( $term->name, ENT_QUOTES ) ) . '</a> ' // the source prints a space here: it lets the count wrap onto its own line under a long title
			. '<span class="badge badge-info tip hasTooltip" title="' . esc_attr( $tip ) . '"> ' . (int) $term->count . ' </span></h3>'
			. ( '' !== $desc ? '<div class="category-desc"><p>' . esc_html( $desc ) . '</p> </div>' : '' )
			. '</div></div></div>';
	}
	return '<div class="categories-list">' . $cards . '</div>';
}

/**
 * The categories module of the sidebar (mod_articles_categories): the news categories, linked.
 *
 * @return string
 */
function wp_ja_diner_blog_categories_html(): string {
	$items = '';
	foreach ( wp_ja_diner_blog_categories() as $term ) {
		$items .= '<li><h4><a href="' . esc_url( get_term_link( $term ) ) . '"> ' . esc_html( html_entity_decode( $term->name, ENT_QUOTES ) ) . ' </a></h4></li>';
	}
	return '' === $items ? '' : '<ul class="mod-articlescategories categories-module mod-list">' . $items . '</ul>';
}

/**
 * The latest news module of the sidebar (mod_articles_latest): the five newest articles of the news categories.
 *
 * @return string
 */
function wp_ja_diner_blog_latest_html(): string {
	$root  = wp_ja_diner_blog_root();
	$posts = get_posts(
		array(
			'numberposts'         => 5,
			'cat'                 => $root ? $root->term_id : 0,
			'orderby'             => array( 'date' => 'DESC', 'ID' => 'ASC' ),
			'ignore_sticky_posts' => true,
			'suppress_filters'    => true,
		)
	);
	$items = '';
	foreach ( $posts as $post ) {
		$items .= '<li itemscope itemtype="https://schema.org/Article"><a href="' . esc_url( get_permalink( $post ) ) . '" itemprop="url"><span itemprop="name"> ' . esc_html( get_the_title( $post ) ) . ' </span></a></li>';
	}
	return '<ul class="mod-articleslatest latestnews mod-list">' . $items . '</ul>';
}

/**
 * The login module of the sidebar (mod_login): the username and password fields, the remember box and the links.
 *
 * @return string
 */
function wp_ja_diner_blog_login_html(): string {
	if ( is_user_logged_in() ) {
		return '<p><a href="' . esc_url( wp_logout_url( home_url( '/' ) ) ) . '">' . esc_html__( 'Log out', 'wp-ja-diner' ) . '</a></p>';
	}
	$link = static function ( string $path, string $fallback ): string {
		$page = get_page_by_path( $path );
		return $page instanceof WP_Post ? (string) get_permalink( $page ) : $fallback;
	};
	$user = esc_attr__( 'Username', 'wp-ja-diner' );
	$pass = esc_attr__( 'Password', 'wp-ja-diner' );
	return '<form action="' . esc_url( wp_login_url() ) . '" method="post" id="login-form"><fieldset class="userdata">'
		. '<div id="form-login-username" class="form-group"><div class="input-group"><span class="input-group-addon"><span class="fa fa-user tip" title="' . $user . '"></span></span>'
		. '<input id="modlgn-username" type="text" name="log" class="input form-control" tabindex="0" size="18" placeholder="' . $user . '" aria-label="' . esc_attr__( 'username', 'wp-ja-diner' ) . '" /></div></div>'
		. '<div id="form-login-password" class="form-group"><div class="input-group"><span class="input-group-addon"><span class="fa fa-lock tip" title="' . $pass . '"></span></span>'
		. '<input id="modlgn-passwd" type="password" name="pwd" class="input form-control" tabindex="0" size="18" placeholder="' . $pass . '" aria-label="' . esc_attr__( 'password', 'wp-ja-diner' ) . '" /></div></div>'
		. '<div id="form-login-remember" class="form-group"><input id="modlgn-remember" type="checkbox" name="rememberme" class="input" value="forever" aria-label="' . esc_attr__( 'remember', 'wp-ja-diner' ) . '"/> ' . esc_html__( 'Remember Me', 'wp-ja-diner' ) . ' </div>'
		. '<div class="control-group"><input type="submit" name="Submit" class="btn btn-primary" value="' . esc_attr__( 'Log in', 'wp-ja-diner' ) . '"/></div>'
		. '<ul class="unstyled"><li><a href="' . esc_url( $link( 'j-pages/registration', wp_registration_url() ) ) . '"> ' . esc_html__( 'Create an account', 'wp-ja-diner' ) . ' <span class="fa fa-arrow-right"></span></a></li>'
		. '<li><a href="' . esc_url( $link( 'username-reminder-request', wp_lostpassword_url() ) ) . '"> ' . esc_html__( 'Forgot your username?', 'wp-ja-diner' ) . '</a></li>'
		. '<li><a href="' . esc_url( $link( 'password-reset', wp_lostpassword_url() ) ) . '">' . esc_html__( 'Forgot your password?', 'wp-ja-diner' ) . '</a></li></ul>'
		. '</fieldset></form>';
}

/**
 * Whether the page being served draws the sidebar's banner and categories modules. The source's finder views (search,
 * All Categories, Featured Articles) draw only the login and latest news modules.
 *
 * @return bool
 */
function wp_ja_diner_blog_sidebar_full(): bool {
	if ( is_search() ) {
		return false;
	}
	return ! in_array( wp_ja_diner_blog_page_slug(), array( 'fetured-articles', 'all-categories' ), true );
}

/**
 * The module frame of the source's sidebar.
 *
 * @param string $title Module title, or '' for a module without one.
 * @param string $body  Module content.
 * @return string
 */
function wp_ja_diner_blog_module( string $title, string $body ): string {
	return '<div class="t3-module module "><div class="module-inner">' . ( '' !== $title ? '<h3 class="module-title "><span>' . esc_html( $title ) . '</span></h3>' : '' ) . '<div class="module-ct">' . $body . '</div></div></div>';
}

/**
 * The blog sidebar: banner, Categories, Login and Latest News (the first two only where the source draws them).
 *
 * @return string
 */
function wp_ja_diner_blog_sidebar_html(): string {
	$out = '';
	if ( wp_ja_diner_blog_sidebar_full() ) {
		$id   = (int) get_option( 'wp_ja_diner_blog_banner_image', 0 );
		$url  = $id ? (string) wp_get_attachment_image_url( $id, 'large' ) : '';
		$out .= '' === $url ? '' : wp_ja_diner_blog_module( '', '<div class="mod-custom custom"><img src="' . esc_url( $url ) . '" alt=""/></div>' );
		$out .= wp_ja_diner_blog_module( __( 'Categories', 'wp-ja-diner' ), wp_ja_diner_blog_categories_html() );
	}
	$out .= wp_ja_diner_blog_module( __( 'Login', 'wp-ja-diner' ), wp_ja_diner_blog_login_html() );
	$out .= wp_ja_diner_blog_module( __( 'Latest News + Updates.', 'wp-ja-diner' ), wp_ja_diner_blog_latest_html() );
	return $out;
}

/**
 * The block of a page's content that carries the given metadata name, as serialized block markup.
 *
 * @param array  $blocks Parsed blocks.
 * @param string $name   The block's `metadata.name`.
 * @return string Block markup, or '' when the content has none.
 */
function wp_ja_diner_blog_find_block( array $blocks, string $name ): string {
	foreach ( $blocks as $b ) {
		if ( $name === ( $b['attrs']['metadata']['name'] ?? '' ) ) {
			return serialize_block( $b );
		}
		if ( ! empty( $b['innerBlocks'] ) ) {
			$found = wp_ja_diner_blog_find_block( $b['innerBlocks'], $name );
			if ( '' !== $found ) {
				return $found;
			}
		}
	}
	return '';
}

/**
 * The masthead of All Categories: the seeder files that page without one, the source draws its banner picture.
 *
 * @return string Block markup.
 */
function wp_ja_diner_blog_categories_masthead(): string {
	global $wpdb;
	// The picture is recorded by the quickstart's post-seed step in a media-named option (the pack prune sees it as a use);
	// without it, the uploaded file is found by name.
	$id = (int) get_option( 'wp_ja_diner_categories_banner_image', 0 );
	if ( ! $id ) {
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- one lookup of an uploaded file by name.
		$id = (int) $wpdb->get_var( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_wp_attached_file' AND meta_value LIKE '%/banner-categories.jpg' ORDER BY post_id LIMIT 1" );
	}
	$url = $id ? (string) wp_get_attachment_url( $id ) : '';
	$img = '' === $url ? '' : '<!-- wp:image {"sizeSlug":"full","className":"jd-masthead-bg","id":' . $id . '} --><figure class="wp-block-image size-full jd-masthead-bg"><img src="' . esc_url( $url ) . '" alt="" class="wp-image-' . $id . '"/></figure><!-- /wp:image -->';
	return '<!-- wp:group {"className":"wrap t3-masthead","metadata":{"name":"masthead.root"},"layout":{"type":"default"}} --><div class="wp-block-group wrap t3-masthead">'
		. '<!-- wp:group {"className":"ja-masthead has-bg","layout":{"type":"default"}} --><div class="wp-block-group ja-masthead has-bg">' . $img
		. '<!-- wp:group {"className":"ja-masthead-detail","layout":{"type":"default"}} --><div class="wp-block-group ja-masthead-detail">'
		. '<!-- wp:heading {"level":1,"className":"ja-masthead-title"} --><h1 class="wp-block-heading ja-masthead-title">' . esc_html__( 'All Categories', 'wp-ja-diner' ) . '</h1><!-- /wp:heading -->'
		. '<!-- wp:paragraph {"className":"ja-masthead-description"} --><p class="ja-masthead-description">' . esc_html__( 'Responsive WordPress theme for restaurant', 'wp-ja-diner' ) . '</p><!-- /wp:paragraph -->'
		. '</div><!-- /wp:group --></div><!-- /wp:group --></div><!-- /wp:group -->';
}

/**
 * The listing pages' content: the masthead and the Subscribe band the seeder wrote, around the list and the sidebar drawn here.
 *
 * @param string $content The page content, before blocks are rendered.
 * @return string
 */
function wp_ja_diner_blog_page_content( string $content ): string {
	$slug = wp_ja_diner_blog_page_slug();
	if ( '' === $slug || ! in_the_loop() || false !== strpos( $content, 'blog-body' ) ) {
		return $content;
	}
	$blocks    = parse_blocks( $content );
	$masthead  = wp_ja_diner_blog_find_block( $blocks, 'masthead.root' );
	$subscribe = wp_ja_diner_blog_find_block( $blocks, 'subscribe.root' );
	if ( '' === $masthead && 'all-categories' === $slug ) {
		$masthead = wp_ja_diner_blog_categories_masthead();
	}
	if ( '' === $subscribe ) {
		// A page the seeder filed without the band takes the one the Featured Articles page holds.
		$sibling   = get_page_by_path( 'content/fetured-articles' );
		$subscribe = $sibling instanceof WP_Post ? wp_ja_diner_blog_find_block( parse_blocks( (string) $sibling->post_content ), 'subscribe.root' ) : '';
	}
	// The source stands the band in `#t3-section-bottom.t3-section-wrap`, the scope its heading colours are written for.
	$band = '' === $subscribe ? '' : '<!-- wp:group {"className":"t3-section-wrap t3-section-bottom","anchor":"t3-section-bottom","layout":{"type":"default"}} --><div class="wp-block-group t3-section-wrap t3-section-bottom" id="t3-section-bottom">' . $subscribe . '</div><!-- /wp:group -->';
	return $masthead . "\n\n" . '<!-- wp:wp-ja-diner/blog-body {"view":"' . $slug . '"} /-->' . "\n\n" . $band;
}
add_filter( 'the_content', 'wp_ja_diner_blog_page_content', 7 );

/**
 * The masthead (or Subscribe band) of a page, drawn in a template: the first such group of the named page's content
 * (the seeder writes the modules there), so archives and the search view show the same banner.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_diner_blog_masthead( string $content, array $block ): string {
	$meta = $block['attrs']['metadata'] ?? array();
	$slug = (string) ( $meta['jrMasthead'] ?? $meta['jrSubscribe'] ?? '' );
	$want = isset( $meta['jrSubscribe'] ) ? 'subscribe.root' : 'masthead.root';
	if ( '' === $slug ) {
		return $content;
	}
	$page = get_page_by_path( $slug, OBJECT, 'page' );
	if ( ! $page instanceof WP_Post ) {
		return '';
	}
	$html = wp_ja_diner_blog_find_block( parse_blocks( $page->post_content ), $want );
	if ( '' === $html ) {
		return '';
	}
	$html = do_blocks( $html );
	return 'subscribe.root' === $want ? '<div id="t3-section-bottom" class="t3-section-wrap t3-section-bottom">' . $html . '</div>' : $html;
}
add_filter( 'render_block_core/group', 'wp_ja_diner_blog_masthead', 10, 2 );

/**
 * The post template of the archive templates (category, tag, home) as the source's masonry grid of article cards.
 *
 * @param string $content The rendered post template.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_diner_blog_archive_grid( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jd-blog-grid' ) ) {
		return $content;
	}
	return '<div class="blog">' . wp_ja_diner_blog_grid( (string) preg_replace( '#</?(?:ul|li)\b[^>]*>#', '', $content ) ) . '</div>';
}
add_filter( 'render_block_core/post-template', 'wp_ja_diner_blog_archive_grid', 10, 2 );

/**
 * The pager of the archive templates in the source's markup (`.pagination-wrap` with the counter and the Start / Prev / Next / End list).
 *
 * @param string $content The rendered pagination block.
 * @return string
 */
function wp_ja_diner_blog_pager( string $content ): string {
	if ( false === strpos( $content, 'tracy-pager__list' ) ) {
		return $content;
	}
	global $wp_query;
	return wp_ja_diner_blog_pager_html( max( 1, (int) get_query_var( 'paged' ) ), max( 1, (int) $wp_query->max_num_pages ), (string) get_pagenum_link( 1 ) );
}
add_filter( 'render_block_core/query-pagination', 'wp_ja_diner_blog_pager' );

/**
 * The details row of an article (the date) and its picture, as the source's article view prints them.
 *
 * @return string
 */
function wp_ja_diner_blog_article_info_html(): string {
	$id = get_the_ID();
	if ( ! $id ) {
		return '';
	}
	$image = get_the_post_thumbnail( $id, 'full', array( 'alt' => '' ) );
	return '<aside class="article-aside clearfix"><dl class="article-info muted"><dt class="article-info-term">' . esc_html__( 'Details', 'wp-ja-diner' ) . '</dt>'
		. '<dd class="published hasTooltip" title="' . esc_attr__( 'Published: ', 'wp-ja-diner' ) . '"><i class="fa fa-calendar"></i><time datetime="' . esc_attr( get_the_date( 'c', $id ) ) . '" itemprop="datePublished">' . esc_html( get_the_date( 'j F Y', $id ) ) . '</time></dd></dl></aside>'
		. ( $image ? '<figure class="none item-image">' . $image . '</figure>' : '' );
}

/**
 * Previous / next article links in the source's page navigation: the neighbours inside the article's category, in the
 * order the lists use. The source offers one link where the other side has no article.
 *
 * @return string
 */
function wp_ja_diner_blog_pagenav_html(): string {
	$id   = (int) get_the_ID();
	$term = wp_ja_diner_blog_category( $id );
	$ids  = $term ? array_map( 'intval', get_posts( array( 'category' => $term->term_id, 'numberposts' => -1, 'orderby' => 'ID', 'order' => 'ASC', 'fields' => 'ids', 'ignore_sticky_posts' => true, 'suppress_filters' => true ) ) ) : array();
	$at   = array_search( $id, $ids, true );
	$out  = '';
	foreach ( array( 'previous' => __( 'Prev', 'wp-ja-diner' ), 'next' => __( 'Next', 'wp-ja-diner' ) ) as $dir => $label ) {
		$neighbour = false === $at ? null : ( $ids[ $at + ( 'next' === $dir ? 1 : -1 ) ] ?? null );
		if ( null !== $neighbour ) {
			/* translators: %s: title of the neighbouring article. */
			$hidden = sprintf( 'next' === $dir ? __( 'Next article: %s', 'wp-ja-diner' ) : __( 'Previous article: %s', 'wp-ja-diner' ), get_the_title( $neighbour ) );
			$chev   = '<span class="icon-chevron-' . ( 'next' === $dir ? 'right' : 'left' ) . '" aria-hidden="true"></span>';
			$text   = '<span aria-hidden="true">' . esc_html( $label ) . '</span>';
			$out   .= '<a class="btn btn-sm btn-secondary ' . $dir . '" href="' . esc_url( get_permalink( $neighbour ) ) . '" rel="' . $dir . '"><span class="visually-hidden">' . esc_html( $hidden ) . ' </span>' . ( 'next' === $dir ? $text . ' ' . $chev : $chev . ' ' . $text ) . ' </a> ';
		}
	}
	return '<nav class="pagenavigation" aria-label="' . esc_attr__( 'Page Navigation', 'wp-ja-diner' ) . '"><span class="pagination ms-0">' . $out . '</span></nav>';
}

/**
 * The results of the search view in the source's finder markup.
 *
 * @return string
 */
function wp_ja_diner_blog_search_results_html(): string {
	global $wp_query;
	$term = trim( (string) get_search_query( false ) );
	if ( '' === $term ) {
		return '';
	}
	$total = (int) $wp_query->found_posts;
	$words = '<span class="term">' . esc_html( $term ) . '</span>';
	$list  = '';
	foreach ( $wp_query->posts as $post ) {
		$cat   = wp_ja_diner_blog_category( (int) $post->ID );
		$list .= '<li class="result__item"><p class="result__title"><a href="' . esc_url( get_permalink( $post ) ) . '" class="result__title-link"><span class="result__title-text">' . esc_html( get_the_title( $post ) ) . '</span><cite class="result__title-url">' . esc_html( get_permalink( $post ) ) . '</cite></a></p>'
			. '<p class="result__description"><time class="result__date" datetime="' . esc_attr( get_the_date( 'c', $post ) ) . '">' . esc_html( get_the_date( 'd F Y', $post ) ) . '</time> ' . esc_html( wp_trim_words( get_the_excerpt( $post ), 40, '...' ) ) . '</p>'
			. '<ul class="result__taxonomy"><li class="result__taxonomy-item result__taxonomy--Type"><span>' . esc_html__( 'Type:', 'wp-ja-diner' ) . '</span> ' . esc_html( 'page' === $post->post_type ? __( 'Page', 'wp-ja-diner' ) : __( 'Article', 'wp-ja-diner' ) ) . '</li>'
			. '<li class="result__taxonomy-item result__taxonomy--Author"><span>' . esc_html__( 'Author:', 'wp-ja-diner' ) . '</span> ' . esc_html( get_the_author_meta( 'display_name', (int) $post->post_author ) ) . '</li>'
			. ( $cat ? '<li class="result__taxonomy-item result__taxonomy--Category"><span>' . esc_html__( 'Category:', 'wp-ja-diner' ) . '</span> ' . esc_html( html_entity_decode( $cat->name, ENT_QUOTES ) ) . '</li>' : '' ) . '</ul></li>';
	}
	if ( '' === $list ) {
		return '<div id="search-results" class="com-finder__results"><div id="search-query-explained" class="com-finder__explained"><p role="alert">'
			. wp_kses_post( sprintf( /* translators: %s: the search term. */ __( 'Assuming %s, no results were found.', 'wp-ja-diner' ), '<span class="query-required">' . $words . esc_html__( ' is required', 'wp-ja-diner' ) . '</span>' ) )
			. ' <a href="#q">' . esc_html__( 'Search again.', 'wp-ja-diner' ) . '</a></p></div>'
			. '<div id="search-result-empty" class="com-finder__empty"><h2>' . esc_html__( 'No Results Found', 'wp-ja-diner' ) . '</h2><p>'
			. esc_html( sprintf( /* translators: %s: the search term. */ __( 'No search results could be found for query: %s.', 'wp-ja-diner' ), $term ) ) . '</p></div></div>';
	}
	$shown = count( $wp_query->posts );
	return '<div id="search-results" class="com-finder__results"><div id="search-query-explained" class="com-finder__explained"><p role="alert">'
		. wp_kses_post( sprintf( /* translators: %s: the search term. */ _n( 'Assuming %s, the following result was found.', 'Assuming %s, the following results were found.', $total, 'wp-ja-diner' ), '<span class="query-required">' . $words . esc_html__( ' is required', 'wp-ja-diner' ) . '</span>' ) )
		. '</p></div><ul id="search-result-list" class="js-highlight com-finder__results-list" start="1">' . $list . '</ul>'
		. '<div class="com-finder__navigation search-pagination"><div class="com-finder__pagination w-100"></div><div class="com-finder__counter search-pages-counter">'
		. wp_kses_post( sprintf( /* translators: 1: first result number, 2: last, 3: total. */ __( 'Results %1$s - %2$s of %3$s', 'wp-ja-diner' ), '<strong>1</strong>', '<strong>' . $shown . '</strong>', '<strong>' . $total . '</strong>' ) )
		. '</div></div></div>';
}

/**
 * The source's finder indexes articles; its answer to a term lists them, not the site's pages.
 *
 * @param WP_Query $query The query being built.
 */
function wp_ja_diner_blog_search_scope( WP_Query $query ): void {
	if ( ! is_admin() && $query->is_main_query() && $query->is_search() ) {
		$query->set( 'post_type', 'post' );
		$query->set( 'posts_per_page', 20 );
	}
}
add_action( 'pre_get_posts', 'wp_ja_diner_blog_search_scope' );

/**
 * A title-only match for the tag list filter: the source's field searches the item titles, not their text.
 *
 * @param string   $search The search clause WordPress built.
 * @param WP_Query $query  The query.
 * @return string
 */
function wp_ja_diner_blog_title_only( string $search, WP_Query $query ): string {
	global $wpdb;
	if ( ! $query->get( 'jd_title_only' ) ) {
		return $search;
	}
	$text = (string) $query->get( 's' );
	return '' === $text ? '' : $wpdb->prepare( " AND {$wpdb->posts}.post_title LIKE %s", '%' . $wpdb->esc_like( $text ) . '%' );
}
add_filter( 'posts_search', 'wp_ja_diner_blog_title_only', 10, 2 );

/**
 * The search field of the finder form echoes the term that was searched, as the source's field does.
 *
 * @param string $content The rendered HTML block.
 * @return string
 */
function wp_ja_diner_blog_search_echo( string $content ): string {
	if ( ! is_search() || false === strpos( $content, 'js-finder-search-query' ) ) {
		return $content;
	}
	return str_replace( 'js-finder-search-query form-control" value=""', 'js-finder-search-query form-control" value="' . esc_attr( get_search_query( false ) ) . '"', $content );
}
add_filter( 'render_block_core/html', 'wp_ja_diner_blog_search_echo' );

add_action(
	'init',
	static function () {
		register_block_type(
			'wp-ja-diner/blog-sidebar',
			array(
				'api_version'     => 3,
				'title'           => __( 'Blog sidebar modules', 'wp-ja-diner' ),
				'category'        => 'theme',
				'render_callback' => 'wp_ja_diner_blog_sidebar_html',
			)
		);
		register_block_type(
			'wp-ja-diner/blog-item',
			array(
				'api_version'     => 3,
				'title'           => __( 'Article of a list', 'wp-ja-diner' ),
				'category'        => 'theme',
				'uses_context'    => array( 'postId' ),
				'render_callback' => static function ( array $attrs, string $content, WP_Block $block ): string {
					$id = (int) ( $block->context['postId'] ?? 0 );
					return $id ? wp_ja_diner_blog_item_html( $id ) : '';
				},
			)
		);
		register_block_type(
			'wp-ja-diner/blog-article-info',
			array(
				'api_version'     => 3,
				'title'           => __( 'Article details', 'wp-ja-diner' ),
				'category'        => 'theme',
				'uses_context'    => array( 'postId' ),
				'render_callback' => 'wp_ja_diner_blog_article_info_html',
			)
		);
		register_block_type(
			'wp-ja-diner/blog-pagenav',
			array(
				'api_version'     => 3,
				'title'           => __( 'Article navigation', 'wp-ja-diner' ),
				'category'        => 'theme',
				'uses_context'    => array( 'postId' ),
				'render_callback' => 'wp_ja_diner_blog_pagenav_html',
			)
		);
		register_block_type(
			'wp-ja-diner/blog-search-results',
			array(
				'api_version'     => 3,
				'title'           => __( 'Search results', 'wp-ja-diner' ),
				'category'        => 'theme',
				'render_callback' => 'wp_ja_diner_blog_search_results_html',
			)
		);
		register_block_type(
			'wp-ja-diner/blog-body',
			array(
				'api_version'     => 3,
				'title'           => __( 'List page body', 'wp-ja-diner' ),
				'category'        => 'theme',
				'attributes'      => array( 'view' => array( 'type' => 'string', 'default' => 'our-blog' ) ),
				'render_callback' => static function ( array $attrs ): string {
					$list = array(
						'our-blog'         => 'wp_ja_diner_blog_list_html',
						'fetured-articles' => 'wp_ja_diner_blog_featured_html',
						'tagged-items'     => 'wp_ja_diner_blog_tagged_html',
						'all-categories'   => 'wp_ja_diner_blog_categories_list_html',
					);
					$view = (string) $attrs['view'];
					$html = isset( $list[ $view ] ) ? call_user_func( $list[ $view ] ) : '';
					return '<div id="t3-mainbody" class="container t3-mainbody jd-blog-body"><div class="row equal-height"><div id="t3-content" class="t3-content col col-xs-12 col-sm-8 col-md-9">' . $html . '</div>'
						. '<div class="t3-sidebar t3-sidebar-right col col-xs-12 col-sm-4 col-md-3 ">' . wp_ja_diner_blog_sidebar_html() . '</div></div></div>';
				},
			)
		);
	}
);
