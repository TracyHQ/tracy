<?php
/**
 * Blog group: article listings (blog, gallery, tags, search), the single article, the 404 page and the
 * blog sidebar. The seeder files each listing route as a page whose body is [masthead, post query,
 * subscribe] (with a sidebar column on routes that have one); this file redraws that body with the
 * source's own markup so the carried Joomla CSS applies, and gives the templates the same pieces.
 *
 * @package wp-ja-restaurant
 */

/**
 * The slug of the listing page being served, or '' when the request is not one of them.
 *
 * @return string
 */
function wp_ja_restaurant_blog_page_slug(): string {
	if ( ! is_page() ) {
		return '';
	}
	$slug = (string) get_post_field( 'post_name', get_queried_object_id() );
	return in_array( $slug, array( 'blog', 'gallery', 'tagged-items', 'featured-articles' ), true ) ? $slug : '';
}

/**
 * The first category an article is filed under below the "Restaurant" parent, the one the source prints.
 *
 * @param int $post_id The article.
 * @return WP_Term|null
 */
function wp_ja_restaurant_blog_category( int $post_id ): ?WP_Term {
	$terms = get_the_category( $post_id );
	foreach ( $terms as $term ) {
		if ( $term->parent ) {
			return $term;
		}
	}
	return $terms ? $terms[0] : null;
}

/**
 * The intro of a tag list row as the source prints it: the text cut at a word boundary within 95 characters, in a paragraph, then "...".
 *
 * @param int $post_id The article.
 * @return string
 */
function wp_ja_restaurant_blog_tag_body( int $post_id ): string {
	$text = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( get_the_excerpt( $post_id ) ) ) );
	if ( mb_strlen( $text ) > 95 ) {
		$cut  = mb_substr( $text, 0, 96 );
		$text = rtrim( mb_substr( $cut, 0, (int) mb_strrpos( $cut, ' ' ) ), " \t" );
	}
	return '<p>' . esc_html( $text ) . '</p>...';
}

/**
 * One article of a listing, in the markup of the source's blog layout (`.item` of an `.items-row`).
 *
 * @param int    $post_id The article.
 * @param string $variant `blog` (picture, title, details, intro), `gallery` (album tile) or `tag` (media row).
 * @return string
 */
function wp_ja_restaurant_blog_item_html( int $post_id, string $variant ): string {
	$link  = esc_url( get_permalink( $post_id ) );
	$title = esc_html( get_the_title( $post_id ) );
	$image = get_the_post_thumbnail( $post_id, 'large', array( 'alt' => 'gallery' === $variant ? wp_strip_all_tags( get_the_title( $post_id ) ) : '' ) );
	if ( 'gallery' === $variant ) {
		$photos = (int) get_post_meta( $post_id, 'jr_photos', true );
		if ( ! $photos ) {
			$photos = substr_count( (string) get_post_field( 'post_content', $post_id ), '<img' );
		}
		/* translators: %d: number of pictures of an album. */
		$count = sprintf( _n( '%d Photo', '%d Photos', max( 1, $photos ), 'wp-ja-restaurant' ), max( 1, $photos ) );
		return '<div class="item col col-sm-3"><article class="default"><div class="item-image ja-gallery-list"><span class="btn-play"><i class="ion-android-camera"></i><span class="num-photos"> ' . esc_html( $count ) . '</span></span><span class="gallery-mask"></span>' . $image . '<a class="jr-album-link" href="' . $link . '" tabindex="-1" aria-hidden="true"></a></div><header class="article-header clearfix"><h4 class="article-title"><a href="' . $link . '" title="' . esc_attr( wp_strip_all_tags( get_the_title( $post_id ) ) ) . '">' . $title . '</a></h4></header></article></div>';
	}
	if ( 'tag' === $variant ) {
		// The row's own `li.media.cat-list-rowN` classes come from the post template filter below; the picture is a direct child, as in the source.
		$picture = get_the_post_thumbnail( $post_id, 'full', array( 'class' => 'media-object pull-left', 'alt' => '' ) );
		return $picture . '<div class="media-body"><h3 class="tag-title"><a href="' . $link . '">' . $title . '</a></h3> <span class="tag-body">' . wp_ja_restaurant_blog_tag_body( $post_id ) . '</span></div>';
	}
	$term = wp_ja_restaurant_blog_category( $post_id );
	$cat  = $term ? '<dd class="category-name"><i class="fa fa-folder-open"></i><a href="' . esc_url( get_term_link( $term ) ) . '"><span>' . esc_html( html_entity_decode( $term->name, ENT_QUOTES ) ) . '</span></a></dd>' : '';
	$date = get_the_date( 'j F Y', $post_id );
	return '<div class="items-row cols-1 row"><div class="col-sm-12"><div class="item column-1"><article>'
		. '<div class="intro-image"><div class="pull-none item-image"><a href="' . $link . '">' . $image . '</a></div></div>'
		. '<div class="info-article"><header class="article-header clearfix"><h2 class="article-title"><a href="' . $link . '" title="' . esc_attr( wp_strip_all_tags( get_the_title( $post_id ) ) ) . '">' . $title . '</a></h2></header>'
		. '<aside class="article-aside clearfix"><dl class="article-info muted"><dt class="article-info-term">' . esc_html__( 'Details', 'wp-ja-restaurant' ) . '</dt>'
		. '<dd class="createdby"><i class="fa fa-user"></i><span>' . esc_html( get_the_author_meta( 'display_name', (int) get_post_field( 'post_author', $post_id ) ) ) . '</span></dd>'
		. $cat
		. '<dd class="published"><i class="fa fa-calendar"></i><time datetime="' . esc_attr( get_the_date( 'c', $post_id ) ) . '">' . esc_html( $date ) . '</time></dd></dl></aside>'
		. '<section class="article-intro clearfix"><p>' . wp_kses_post( get_the_excerpt( $post_id ) ) . '</p></section>'
		. ( 'featured-articles' === wp_ja_restaurant_blog_page_slug() ? wp_ja_restaurant_blog_tags_html( $post_id ) : '' ) . '</div>'
		. '</article></div></div></div>';
}

/**
 * The article's tags as the source's featured layouts print them under the intro (the Featured Articles page and the news
 * module of the home page; the blog list shows none): `div.tags > span.tag-<n>.tag-list<i> > a.label.label-info`, in the
 * order the tags were created.
 *
 * @param int $post_id The article.
 * @return string Empty when the article has no tag.
 */
function wp_ja_restaurant_blog_tags_html( int $post_id ): string {
	$terms = wp_get_post_terms( $post_id, 'post_tag', array( 'orderby' => 'term_id' ) );
	if ( is_wp_error( $terms ) || ! $terms ) {
		return '';
	}
	$out = '';
	foreach ( array_values( $terms ) as $i => $term ) {
		$out .= '<span class="tag-' . (int) $term->term_id . ' tag-list' . (int) $i . '"><a href="' . esc_url( get_term_link( $term ) ) . '" class="label label-info">' . esc_html( html_entity_decode( $term->name, ENT_QUOTES ) ) . '</a></span> ';
	}
	return '<div class="tags">' . rtrim( $out ) . '</div>';
}

/**
 * The home page's news module (pattern acm-home-news-default: a query of sticky articles whose excerpt carries
 * `article-intro`) prints each article's tags under its intro, as the source does.
 *
 * @param string   $content  The rendered excerpt.
 * @param array    $block    The parsed block.
 * @param WP_Block $instance The block instance (its context names the article).
 * @return string
 */
function wp_ja_restaurant_blog_intro_tags( string $content, array $block, WP_Block $instance ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'article-intro' ) ) {
		return $content;
	}
	$id = (int) ( $instance->context['postId'] ?? 0 );
	return $id ? $content . wp_ja_restaurant_blog_tags_html( $id ) : $content;
}
add_filter( 'render_block_core/post-excerpt', 'wp_ja_restaurant_blog_intro_tags', 10, 3 );

add_action(
	'init',
	static function () {
		register_block_type(
			'wp-ja-restaurant/blog-item',
			array(
				'api_version'     => 3,
				'title'           => __( 'Article of a list', 'wp-ja-restaurant' ),
				'category'        => 'theme',
				'uses_context'    => array( 'postId' ),
				'attributes'      => array( 'variant' => array( 'type' => 'string', 'default' => 'blog' ) ),
				'render_callback' => static function ( array $attrs, string $content, WP_Block $block ): string {
					$id = (int) ( $block->context['postId'] ?? 0 );
					return $id ? wp_ja_restaurant_blog_item_html( $id, (string) $attrs['variant'] ) : '';
				},
			)
		);
		register_block_type(
			'wp-ja-restaurant/blog-categories',
			array(
				'api_version'     => 3,
				'title'           => __( 'Categories of the news', 'wp-ja-restaurant' ),
				'category'        => 'theme',
				'render_callback' => 'wp_ja_restaurant_blog_categories_html',
			)
		);
		register_block_type(
			'wp-ja-restaurant/blog-mostread',
			array(
				'api_version'     => 3,
				'title'           => __( 'Most read articles', 'wp-ja-restaurant' ),
				'category'        => 'theme',
				'render_callback' => 'wp_ja_restaurant_blog_mostread_html',
			)
		);
	}
);

/**
 * The listing body the seeder wrote draws each article as a card; the source draws a row. The post
 * template of those queries is swapped for the article block of the page's variant.
 *
 * @param array $parsed The block about to render.
 * @return array
 */
function wp_ja_restaurant_blog_post_template( array $parsed ): array {
	if ( 'core/post-template' !== ( $parsed['blockName'] ?? '' ) || 'tracy-grid' !== ( $parsed['attrs']['className'] ?? '' ) ) {
		return $parsed;
	}
	$slug = wp_ja_restaurant_blog_page_slug();
	if ( '' === $slug && ! is_search() ) {
		return $parsed;
	}
	$variant = 'gallery' === $slug ? 'gallery' : ( 'tagged-items' === $slug ? 'tag' : 'blog' );
	$classes = array( 'blog' => 'blog', 'gallery' => 'blog blog-gallery row', 'tag' => 'category tags-list media-group list-unstyled' );
	$markup  = '<!-- wp:post-template {"className":"' . $classes[ $variant ] . '"} --><!-- wp:wp-ja-restaurant/blog-item {"variant":"' . $variant . '"} /--><!-- /wp:post-template -->';
	$new     = parse_blocks( $markup );
	return $new[0] ?? $parsed;
}
add_filter( 'render_block_data', 'wp_ja_restaurant_blog_post_template' );

/**
 * Tag list rows: the source's `li.media.cat-list-row0/1.clearfix` (zebra) instead of the core post classes only.
 *
 * @param string $content The rendered post template.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_restaurant_blog_tag_rows( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'tags-list' ) ) {
		return $content;
	}
	$row = 0;
	return (string) preg_replace_callback(
		'/<li class="wp-block-post /',
		static function () use ( &$row ) {
			return '<li class="media cat-list-row' . ( $row++ % 2 ) . ' clearfix wp-block-post ';
		},
		$content
	);
}
add_filter( 'render_block_core/post-template', 'wp_ja_restaurant_blog_tag_rows', 10, 2 );

/**
 * The categories module of the sidebar (mod_articles_categories): the news categories, linked.
 *
 * @return string
 */
function wp_ja_restaurant_blog_categories_html(): string {
	$parent = get_term_by( 'slug', 'restaurant', 'category' );
	$terms  = $parent instanceof WP_Term ? get_terms( array( 'taxonomy' => 'category', 'parent' => $parent->term_id, 'orderby' => 'term_id', 'hide_empty' => false ) ) : array();
	if ( ! is_array( $terms ) || ! $terms ) {
		return '';
	}
	$items = '';
	foreach ( $terms as $term ) {
		$items .= '<li><h4><a href="' . esc_url( get_term_link( $term ) ) . '">' . esc_html( html_entity_decode( $term->name, ENT_QUOTES ) ) . '</a></h4></li>';
	}
	return '<ul class="mod-articlescategories categories-module mod-list">' . $items . '</ul>';
}

/**
 * The most read module. WordPress keeps no read counter, so the five articles of the news categories
 * with the most comments come first, then the newest (the order is the closest signal core has).
 *
 * @return string
 */
function wp_ja_restaurant_blog_mostread_html(): string {
	$parent = get_term_by( 'slug', 'restaurant', 'category' );
	$query  = new WP_Query(
		array(
			'post_type'           => 'post',
			'posts_per_page'      => 5,
			'ignore_sticky_posts' => true,
			'orderby'             => array( 'comment_count' => 'DESC', 'date' => 'DESC', 'ID' => 'ASC' ),
			'cat'                 => $parent instanceof WP_Term ? $parent->term_id : 0,
			'no_found_rows'       => true,
		)
	);
	$items = '';
	foreach ( $query->posts as $post ) {
		$items .= '<li><a href="' . esc_url( get_permalink( $post ) ) . '"><span>' . esc_html( get_the_title( $post ) ) . '</span></a></li>';
	}
	wp_reset_postdata();
	return '<ul class="mostread mod-list">' . $items . '</ul>';
}

/**
 * The "Happy customers" module of the source's search sidebar (module 112, the one the home page also draws): the
 * testimonials group of the front page's content, found by its class and rendered as the home renders it. Only the search view shows it.
 *
 * @return string
 */
function wp_ja_restaurant_blog_testimonials_html(): string {
	if ( ! is_search() ) {
		return '';
	}
	$front = (int) get_option( 'page_on_front' );
	$find  = static function ( array $blocks ) use ( &$find ): string {
		foreach ( $blocks as $b ) {
			if ( false !== strpos( (string) ( $b['attrs']['className'] ?? '' ), 'acm-testimonials' ) ) {
				return render_block( $b );
			}
			if ( ! empty( $b['innerBlocks'] ) ) {
				$out = $find( $b['innerBlocks'] );
				if ( '' !== $out ) {
					return $out;
				}
			}
		}
		return '';
	};
	$quotes = $front ? $find( parse_blocks( (string) get_post_field( 'post_content', $front ) ) ) : '';
	if ( '' === $quotes ) {
		return '';
	}
	return '<div class="t3-module module module-dark"><div class="module-inner"><h3 class="module-title"><span>' . esc_html__( 'Happy customers', 'wp-ja-restaurant' ) . '</span></h3><div class="module-ct">' . $quotes . '</div></div></div>';
}

add_action(
	'init',
	static function () {
		register_block_type(
			'wp-ja-restaurant/blog-testimonials',
			array(
				'api_version'     => 3,
				'title'           => __( 'Happy customers module', 'wp-ja-restaurant' ),
				'category'        => 'theme',
				'render_callback' => 'wp_ja_restaurant_blog_testimonials_html',
			)
		);
	}
);

/**
 * The picture of the banner module: the attachment named by option `wp_ja_restaurant_blog_banner_image`.
 *
 * @param string $content The rendered image block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_restaurant_blog_banner_image( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jr-banner-picture' ) ) {
		return $content;
	}
	// The seeded banner picture's attachment id (option written at seed time, shipped in the quickstart database).
	$id = (int) get_option( 'wp_ja_restaurant_blog_banner_image', 0 );
	$url = $id ? (string) wp_get_attachment_image_url( $id, 'large' ) : '';
	return '' === $url ? $content : (string) preg_replace( '/src="[^"]*"/', 'src="' . esc_url( $url ) . '"', $content, 1 );
}
add_filter( 'render_block_core/image', 'wp_ja_restaurant_blog_banner_image', 10, 2 );

/**
 * The sidebar column of the page layout: the sidebar part, plus the banner module on the blog page.
 *
 * @param string $slug The listing page slug.
 * @return string
 */
function wp_ja_restaurant_blog_aside( string $slug ): string {
	$html = do_blocks( '<!-- wp:pattern {"slug":"wp-ja-restaurant/part-sidebar"} /-->' );
	if ( 'blog' === $slug ) {
		$html .= do_blocks( '<!-- wp:pattern {"slug":"wp-ja-restaurant/blog-banner"} /-->' );
	}
	return $html;
}

/**
 * The seeder's page layout [sidebar column | masthead, list, subscribe] becomes the source's:
 * the masthead across the page, then the list beside the sidebar, then the subscribe band.
 *
 * @param string $content The rendered columns block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_restaurant_blog_columns( string $content, array $block ): string {
	$slug = wp_ja_restaurant_blog_page_slug();
	if ( '' === $slug || false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'tracy-page__columns' ) ) {
		return $content;
	}
	$masthead = '';
	$subscribe = '';
	$body      = '';
	foreach ( $block['innerBlocks'] as $column ) {
		if ( false === strpos( (string) ( $column['attrs']['className'] ?? '' ), 'tracy-page__main' ) ) {
			continue;
		}
		foreach ( $column['innerBlocks'] as $inner ) {
			$name = (string) ( $inner['attrs']['metadata']['name'] ?? '' );
			$html = render_block( $inner );
			if ( 'masthead.root' === $name ) {
				$masthead .= $html;
			} elseif ( 'subscribe.root' === $name ) {
				$subscribe .= $html;
			} else {
				$body .= $html;
			}
		}
	}
	return $masthead
		. '<div id="t3-mainbody" class="container t3-mainbody"><div class="row"><div id="t3-content" class="t3-content col-xs-12 col-sm-12 col-md-8">' . ( 'tagged-items' === $slug ? '<div class="com-tags-tag tag-category">' . wp_ja_restaurant_blog_tag_filter( $body ) . '</div>' : $body ) . '</div>'
		. '<div class="t3-sidebar t3-sidebar-right col-xs-12 col-sm-12 col-md-4">' . wp_ja_restaurant_blog_aside( $slug ) . '</div></div></div>'
		. $subscribe;
}
add_filter( 'render_block_core/columns', 'wp_ja_restaurant_blog_columns', 10, 2 );

/**
 * The masthead (or subscribe band) of a page, drawn in a template: the first such group of the named page's content
 * (the seeder writes the modules there), so archives and the search view show the same banner.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_restaurant_blog_masthead( string $content, array $block ): string {
	$meta = $block['attrs']['metadata'] ?? array();
	$slug = (string) ( $meta['jrMasthead'] ?? $meta['jrSlideshow'] ?? $meta['jrSubscribe'] ?? '' );
	$want = isset( $meta['jrSubscribe'] ) ? 'subscribe.root' : ( isset( $meta['jrSlideshow'] ) ? 'slideshow.root' : 'masthead.root' );
	if ( '' === $slug ) {
		return $content;
	}
	$page = get_page_by_path( $slug, OBJECT, 'page' );
	if ( ! $page instanceof WP_Post ) {
		return '';
	}
	$find = static function ( array $blocks ) use ( &$find, $want ): string {
		foreach ( $blocks as $b ) {
			if ( $want === ( $b['attrs']['metadata']['name'] ?? '' ) ) {
				return render_block( $b );
			}
			if ( ! empty( $b['innerBlocks'] ) ) {
				$out = $find( $b['innerBlocks'] );
				if ( '' !== $out ) {
					return $out;
				}
			}
		}
		return '';
	};
	$html = $find( parse_blocks( $page->post_content ) );
	if ( '' !== $html && 'slideshow.root' === $want ) {
		// The wrapper the source's album page stands the slideshow in (theme CSS lifts it under the menu band).
		return '<div class="jr-album-top">' . $html . '</div>';
	}
	return '' !== $html && 'subscribe.root' === $want ? '<div class="wrap t3-section t3-section-2">' . $html . '</div>' : $html;
}
add_filter( 'render_block_core/group', 'wp_ja_restaurant_blog_masthead', 10, 2 );

/**
 * An album (an article of the category `gallery`) has its own layout in the source: the gallery's slideshow
 * above a full-width article, no masthead and no sidebar. The block theme resolves `single-gallery.html` for it.
 *
 * @param string[] $templates The single template hierarchy.
 * @return string[]
 */
function wp_ja_restaurant_blog_album_template( array $templates ): array {
	if ( is_singular( 'post' ) && has_category( 'gallery', get_queried_object_id() ) ) {
		array_unshift( $templates, 'single-gallery' );
	}
	return $templates;
}
add_filter( 'single_template_hierarchy', 'wp_ja_restaurant_blog_album_template' );

/**
 * Pages whose lists are redrawn here: the listing pages and the search view.
 *
 * @return bool
 */
function wp_ja_restaurant_blog_is_list(): bool {
	return '' !== wp_ja_restaurant_blog_page_slug() || is_search() || is_category() || is_tag() || is_home();
}

/**
 * The pager in the source's markup (`.pagination-wrap` with the counter and the Start / Prev / Next / End list),
 * so the carried Joomla rules draw it. The seeder's pager prints symbols for those four words.
 *
 * @param string $content The rendered pagination block.
 * @return string
 */
function wp_ja_restaurant_blog_pager( string $content ): string {
	if ( ! wp_ja_restaurant_blog_is_list() || false === strpos( $content, 'tracy-pager__list' ) ) {
		return $content;
	}
	$words = array(
		'&laquo;'  => __( 'Start', 'wp-ja-restaurant' ),
		'&lsaquo;' => __( 'Prev', 'wp-ja-restaurant' ),
		'&rsaquo;' => __( 'Next', 'wp-ja-restaurant' ),
		'&raquo;'  => __( 'End', 'wp-ja-restaurant' ),
	);
	$items = '';
	if ( preg_match_all( '#<li class="tracy-pager__item([^"]*)">(.*?)</li>#s', $content, $all, PREG_SET_ORDER ) ) {
		foreach ( $all as $m ) {
			$label = trim( wp_strip_all_tags( $m[2] ) );
			foreach ( $words as $symbol => $word ) {
				if ( false !== strpos( $m[2], $symbol ) ) {
					$label = $word;
				}
			}
			$href = preg_match( '/href="([^"]*)"/', $m[2], $h ) ? $h[1] : '';
			if ( false !== strpos( $m[1], 'is-current' ) ) {
				$items .= '<li class="active"><a>' . esc_html( $label ) . '</a></li>';
			} elseif ( '' === $href ) {
				$items .= '<li class="disabled"><a>' . esc_html( $label ) . '</a></li>';
			} else {
				$items .= '<li><a title="' . esc_attr( $label ) . '" href="' . $href . '">' . esc_html( $label ) . '</a></li>';
			}
		}
	}
	$counter = preg_match( '#<p class="tracy-pager__counter">(.*?)</p>#s', $content, $c ) ? $c[1] : '';
	return '<div class="pagination-wrap"><div class="counter"> ' . $counter . '</div><ul class="pagination">' . $items . '</ul></div>';
}
add_filter( 'render_block_core/query-pagination', 'wp_ja_restaurant_blog_pager' );

/**
 * "More Articles ..." as the source prints it: a heading and an ordered list of titles.
 *
 * @param string $content The rendered query block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_restaurant_blog_more( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'tracy-more-articles' ) ) {
		return $content;
	}
	$title = preg_match( '#<h3[^>]*>(.*?)</h3>#s', $content, $t ) ? $t[1] : '';
	$items = '';
	if ( preg_match_all( '#<p class="wp-block-post-title"><a href="([^"]*)"[^>]*>(.*?)</a></p>#s', $content, $all, PREG_SET_ORDER ) ) {
		foreach ( $all as $m ) {
			$items .= '<li><a href="' . $m[1] . '">' . $m[2] . '</a></li>';
		}
	}
	if ( '' === $items ) {
		return '';
	}
	return '<div class="items-more"><section class="items-more"><h3>' . $title . '</h3><ol class="nav">' . $items . '</ol></section></div>';
}
add_filter( 'render_block_core/query', 'wp_ja_restaurant_blog_more', 10, 2 );


/**
 * The details row of an article (author, category, date) and its picture, as the source's article view prints them.
 *
 * @return string
 */
function wp_ja_restaurant_blog_article_info_html(): string {
	$id = get_the_ID();
	if ( ! $id ) {
		return '';
	}
	$term  = wp_ja_restaurant_blog_category( $id );
	$cat   = $term ? '<dd class="category-name"><i class="fa fa-folder-open"></i><a href="' . esc_url( get_term_link( $term ) ) . '"><span>' . esc_html( html_entity_decode( $term->name, ENT_QUOTES ) ) . '</span></a></dd>' : '';
	// An album's pictures are all in its slider; the source prints no separate lead picture there.
	$image = has_category( 'gallery', $id ) ? '' : get_the_post_thumbnail( $id, 'full', array( 'alt' => '' ) );
	return '<aside class="article-aside clearfix"><dl class="article-info muted"><dt class="article-info-term">' . esc_html__( 'Details', 'wp-ja-restaurant' ) . '</dt>'
		. '<dd class="createdby"><i class="fa fa-user"></i><span>' . esc_html( get_the_author_meta( 'display_name', (int) get_post_field( 'post_author', $id ) ) ) . '</span></dd>'
		. $cat . '<dd class="published"><i class="fa fa-calendar"></i><time datetime="' . esc_attr( get_the_date( 'c', $id ) ) . '">' . esc_html( get_the_date( 'j F Y', $id ) ) . '</time></dd></dl></aside>'
		. ( $image ? '<div class="pull-none item-image article-image article-image-full">' . $image . '</div>' : '' );
}

/**
 * Previous / next article links in the source's page navigation. The source offers one link where the other side has no article.
 *
 * @return string
 */
function wp_ja_restaurant_blog_pagenav_html(): string {
	$out = '';
	// The source steps through albums in listing order (Album 1 first, newest by date here), so "next" is the older one.
	$flip = has_category( 'gallery', (int) get_the_ID() );
	foreach ( array( 'previous' => __( 'Prev', 'wp-ja-restaurant' ), 'next' => __( 'Next', 'wp-ja-restaurant' ) ) as $dir => $label ) {
		$adjacent = get_adjacent_post( true, '', ( 'previous' === $dir ) !== $flip );
		if ( $adjacent instanceof WP_Post ) {
			/* translators: %s: title of the neighbouring article. */
			$hidden = sprintf( 'next' === $dir ? __( 'Next article: %s', 'wp-ja-restaurant' ) : __( 'Previous article: %s', 'wp-ja-restaurant' ), get_the_title( $adjacent ) );
			$chev   = '<span class="icon-chevron-' . ( 'next' === $dir ? 'right' : 'left' ) . '" aria-hidden="true"></span>';
			$text   = '<span aria-hidden="true">' . esc_html( $label ) . '</span>';
			$out   .= '<a class="btn btn-sm btn-secondary ' . $dir . '" href="' . esc_url( get_permalink( $adjacent ) ) . '" rel="' . $dir . '"><span class="visually-hidden">' . esc_html( $hidden ) . '</span>' . ( 'next' === $dir ? $text . ' ' . $chev : $chev . ' ' . $text ) . '</a> ';
		}
	}
	return '<nav class="pagenavigation" aria-label="' . esc_attr__( 'Page Navigation', 'wp-ja-restaurant' ) . '"><span class="pagination ms-0">' . $out . '</span></nav>';
}

/**
 * The results of the search view in the source's finder markup.
 *
 * @return string
 */
function wp_ja_restaurant_blog_search_results_html(): string {
	global $wp_query;
	$term = trim( (string) get_search_query( false ) );
	if ( '' === $term ) {
		return '';
	}
	$total = (int) $wp_query->found_posts;
	$words = '<span class="term">' . esc_html( $term ) . '</span>';
	$list  = '';
	foreach ( $wp_query->posts as $post ) {
		$cat = wp_ja_restaurant_blog_category( (int) $post->ID );
		$list .= '<li class="result__item"><p class="result__title"><a href="' . esc_url( get_permalink( $post ) ) . '" class="result__title-link"><span class="result__title-text">' . esc_html( get_the_title( $post ) ) . '</span><cite class="result__title-url">' . esc_html( get_permalink( $post ) ) . '</cite></a></p>'
			. '<p class="result__description"><time class="result__date" datetime="' . esc_attr( get_the_date( 'c', $post ) ) . '">' . esc_html( get_the_date( 'd F Y', $post ) ) . '</time> ' . esc_html( wp_trim_words( get_the_excerpt( $post ), 40, '...' ) ) . '</p>'
			. '<ul class="result__taxonomy"><li class="result__taxonomy-item result__taxonomy--Type"><span>' . esc_html__( 'Type:', 'wp-ja-restaurant' ) . '</span> ' . esc_html( 'page' === $post->post_type ? __( 'Page', 'wp-ja-restaurant' ) : __( 'Article', 'wp-ja-restaurant' ) ) . '</li>'
			. '<li class="result__taxonomy-item result__taxonomy--Author"><span>' . esc_html__( 'Author:', 'wp-ja-restaurant' ) . '</span> ' . esc_html( get_the_author_meta( 'display_name', (int) $post->post_author ) ) . '</li>'
			. ( $cat ? '<li class="result__taxonomy-item result__taxonomy--Category"><span>' . esc_html__( 'Category:', 'wp-ja-restaurant' ) . '</span> ' . esc_html( html_entity_decode( $cat->name, ENT_QUOTES ) ) . '</li>' : '' ) . '</ul></li>';
	}
	if ( '' === $list ) {
		return '<div id="search-results" class="com-finder__results"><div id="search-query-explained" class="com-finder__explained"><p role="alert">'
			. wp_kses_post( sprintf( /* translators: %s: the search term. */ __( 'Assuming %s, no results were found.', 'wp-ja-restaurant' ), '<span class="query-required">' . $words . esc_html__( ' is required', 'wp-ja-restaurant' ) . '</span>' ) )
			. ' <a href="#q">' . esc_html__( 'Search again.', 'wp-ja-restaurant' ) . '</a></p></div>'
			. '<div id="search-result-empty" class="com-finder__empty"><h2>' . esc_html__( 'No Results Found', 'wp-ja-restaurant' ) . '</h2><p>'
			. esc_html( sprintf( /* translators: %s: the search term. */ __( 'No search results could be found for query: %s.', 'wp-ja-restaurant' ), $term ) ) . '</p></div></div>';
	}
	$shown = count( $wp_query->posts );
	return '<div id="search-results" class="com-finder__results"><div id="search-query-explained" class="com-finder__explained"><p role="alert">'
		. wp_kses_post( sprintf( /* translators: %s: the search term. */ _n( 'Assuming %s, the following result was found.', 'Assuming %s, the following results were found.', $total, 'wp-ja-restaurant' ), '<span class="query-required">' . $words . esc_html__( ' is required', 'wp-ja-restaurant' ) . '</span>' ) )
		. '</p></div><ul id="search-result-list" class="js-highlight com-finder__results-list" start="1">' . $list . '</ul>'
		. '<div class="com-finder__navigation search-pagination"><div class="com-finder__pagination w-100"></div><div class="com-finder__counter search-pages-counter">'
		. wp_kses_post( sprintf( /* translators: 1: first result number, 2: last, 3: total. */ __( 'Results %1$s - %2$s of %3$s', 'wp-ja-restaurant' ), '<strong>1</strong>', '<strong>' . $shown . '</strong>', '<strong>' . $total . '</strong>' ) )
		. '</div></div></div>';
}

add_action(
	'init',
	static function () {
		register_block_type(
			'wp-ja-restaurant/blog-article-info',
			array(
				'api_version'     => 3,
				'title'           => 'Article details',
				'category'        => 'theme',
				'uses_context'    => array( 'postId' ),
				'render_callback' => 'wp_ja_restaurant_blog_article_info_html',
			)
		);
		register_block_type(
			'wp-ja-restaurant/blog-pagenav',
			array(
				'api_version'     => 3,
				'title'           => 'Article navigation',
				'category'        => 'theme',
				'uses_context'    => array( 'postId' ),
				'render_callback' => 'wp_ja_restaurant_blog_pagenav_html',
			)
		);
		register_block_type(
			'wp-ja-restaurant/blog-search-results',
			array(
				'api_version'     => 3,
				'title'           => 'Search results',
				'category'        => 'theme',
				'uses_context'    => array(),
				'render_callback' => 'wp_ja_restaurant_blog_search_results_html',
			)
		);
	}
);


/**
 * The gallery page: the seeder writes [album list, slideshow, subscribe]; the source stands the slideshow
 * above the page, the title and the album tiles in the main body, then the subscribe band.
 *
 * @param string $content The rendered post content.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_restaurant_blog_gallery_page( string $content, array $block ): string {
	if ( 'gallery' !== wp_ja_restaurant_blog_page_slug() ) {
		return $content;
	}
	$above = '';
	$list  = '';
	$below = '';
	foreach ( parse_blocks( (string) get_post_field( 'post_content', get_queried_object_id() ) ) as $b ) {
		if ( empty( $b['blockName'] ) ) {
			continue;
		}
		$html = render_block( $b );
		if ( 'core/query' === $b['blockName'] ) {
			$list .= $html;
		} elseif ( 'subscribe.root' === ( $b['attrs']['metadata']['name'] ?? '' ) ) {
			$below .= $html;
		} else {
			$above .= $html;
		}
	}
	$inner = $above
		. '<div id="t3-mainbody" class="container t3-mainbody"><div class="row"><div id="t3-content" class="t3-content col-xs-12"><div class="blog blog-gallery"><div class="page-header clearfix"><h1 class="page-title"> ' . esc_html( get_the_title( get_queried_object_id() ) ) . ' </h1></div>' . $list . '</div></div></div></div>'
		. $below;
	return (string) preg_replace_callback( '/^(\s*<div\b[^>]*>)(.*)(<\/div>\s*)$/s', static fn( array $m ): string => $m[1] . $inner . $m[3], $content );
}
add_filter( 'render_block_core/post-content', 'wp_ja_restaurant_blog_gallery_page', 10, 2 );

/**
 * The source's finder indexes articles; its answer to a term lists them, not the site's pages.
 *
 * @param WP_Query $query The query being built.
 */
function wp_ja_restaurant_blog_search_scope( WP_Query $query ): void {
	if ( ! is_admin() && $query->is_main_query() && $query->is_search() ) {
		$query->set( 'post_type', 'post' );
		$query->set( 'posts_per_page', 20 );
	}
}
add_action( 'pre_get_posts', 'wp_ja_restaurant_blog_search_scope' );


/**
 * The tag list of the source is ordered by title, not by date.
 *
 * @param array    $query The query vars of a Query Loop block.
 * @param WP_Block $block The block (unused).
 * @return array
 */
function wp_ja_restaurant_blog_tag_order( array $query, $block ): array {
	if ( 'tagged-items' === wp_ja_restaurant_blog_page_slug() ) {
		$query['orderby']        = 'title';
		$query['order']          = 'ASC';
		$query['posts_per_page'] = wp_ja_restaurant_blog_tag_limit();
		$title                   = wp_ja_restaurant_blog_tag_title_filter();
		if ( '' !== $title ) {
			$query['s']             = $title;
			$query['jr_title_only'] = true;
		}
	}
	return $query;
}
add_filter( 'query_loop_block_query_vars', 'wp_ja_restaurant_blog_tag_order', 10, 2 );

/**
 * The source's tag list page draws no tag cloud above the list.
 *
 * @param string $content The rendered tag cloud.
 * @return string
 */
function wp_ja_restaurant_blog_no_tag_cloud( string $content ): string {
	return 'tagged-items' === wp_ja_restaurant_blog_page_slug() ? '' : $content;
}
add_filter( 'render_block_core/tag-cloud', 'wp_ja_restaurant_blog_no_tag_cloud' );

/**
 * An album's pictures as the source's slider: a framed card holding one picture at a time, an arrow box at each
 * side and a numbered dot per picture (the owl carousel markup its gallery view prints; blog.js moves it).
 *
 * @param string $content The rendered gallery block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_restaurant_blog_album_slider( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jr-album' ) || ! preg_match_all( '#<img\b[^>]*>#i', $content, $imgs ) ) {
		return $content;
	}
	$items = '';
	$dots  = '';
	foreach ( $imgs[0] as $i => $img ) {
		$src   = preg_match( '/\ssrc="([^"]*)"/', $img, $m ) ? $m[1] : '';
		$alt   = preg_match( '/\salt="([^"]*)"/', $img, $m ) ? $m[1] : '';
		$items .= '<div class="owl-item"><div class="item"><div class="carousel-caption"></div><div class="item-image" itemprop="image"><img src="' . esc_url( $src ) . '" alt="' . esc_attr( $alt ) . '" itemprop="thumbnailUrl" /></div></div></div>';
		$dots  .= '<div class="owl-page' . ( 0 === $i ? ' active' : '' ) . '" role="button" tabindex="0" aria-label="' . esc_attr( sprintf( /* translators: %d: picture number. */ __( 'Go to picture %d', 'wp-ja-restaurant' ), $i + 1 ) ) . '"><span class="owl-numbers">' . ( $i + 1 ) . '</span></div>';
	}
	return '<div id="ja-gallery-detail-' . (int) get_the_ID() . '" class="ja-gallery-detail-slide"><div class="owl-carousel owl-theme jr-album-slider"><div class="owl-wrapper-outer"><div class="owl-wrapper">' . $items . '</div></div>'
		. '<div class="owl-controls clickable"><div class="owl-pagination">' . $dots . '</div><div class="owl-buttons">'
		. '<div class="owl-prev" role="button" tabindex="0" aria-label="' . esc_attr__( 'Previous picture', 'wp-ja-restaurant' ) . '"><i class="fas fa-long-arrow-alt-left" aria-hidden="true"></i></div>'
		. '<div class="owl-next" role="button" tabindex="0" aria-label="' . esc_attr__( 'Next picture', 'wp-ja-restaurant' ) . '"><i class="fas fa-long-arrow-alt-right" aria-hidden="true"></i></div></div></div></div></div>';
}
add_filter( 'render_block_core/gallery', 'wp_ja_restaurant_blog_album_slider', 10, 2 );

/**
 * The search field of the finder form echoes the term that was searched, as the source's field does.
 *
 * @param string $content The rendered HTML block.
 * @return string
 */
function wp_ja_restaurant_blog_search_echo( string $content ): string {
	if ( ! is_search() || false === strpos( $content, 'js-finder-search-query' ) ) {
		return $content;
	}
	return str_replace( 'js-finder-search-query form-control" value=""', 'js-finder-search-query form-control" value="' . esc_attr( get_search_query( false ) ) . '"', $content );
}
add_filter( 'render_block_core/html', 'wp_ja_restaurant_blog_search_echo' );

/**
 * The title typed into the tag list's filter field (the source's `filter-search`).
 *
 * @return string
 */
function wp_ja_restaurant_blog_tag_title_filter(): string {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only list filter, nothing is written.
	return isset( $_GET['filter-search'] ) ? trim( sanitize_text_field( wp_unslash( $_GET['filter-search'] ) ) ) : '';
}

/**
 * The number of rows per page chosen in the tag list's "Display #" select; the source's default is 20 and 0 means all.
 *
 * @return int
 */
function wp_ja_restaurant_blog_tag_limit(): int {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only list filter, nothing is written.
	$limit = isset( $_GET['limit'] ) ? (int) $_GET['limit'] : 20;
	return in_array( $limit, array( 5, 10, 15, 20, 25, 30, 50, 100 ), true ) ? $limit : ( 0 === $limit && isset( $_GET['limit'] ) ? -1 : 20 ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
}

/**
 * A title-only match for the tag list filter: the source's field searches the item titles, not their text.
 *
 * @param string   $search The search clause WordPress built.
 * @param WP_Query $query  The query.
 * @return string
 */
function wp_ja_restaurant_blog_title_only( string $search, WP_Query $query ): string {
	global $wpdb;
	if ( ! $query->get( 'jr_title_only' ) || '' === (string) $query->get( 's' ) ) {
		return $search;
	}
	return $wpdb->prepare( " AND {$wpdb->posts}.post_title LIKE %s", '%' . $wpdb->esc_like( (string) $query->get( 's' ) ) . '%' );
}
add_filter( 'posts_search', 'wp_ja_restaurant_blog_title_only', 10, 2 );

/**
 * The tag list page as the source draws it: its h1, then a filter row (title field with Search and Clear buttons,
 * and the "Display #" select) above the list. The form sends its fields to the same page and the list narrows to
 * the items whose title holds the text; the select sets how many rows a page shows.
 *
 * @param string $body The rendered list and pager.
 * @return string
 */
function wp_ja_restaurant_blog_tag_filter( string $body ): string {
	$page_id = get_queried_object_id();
	$text    = wp_ja_restaurant_blog_tag_title_filter();
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only list filter, nothing is written.
	$chosen  = isset( $_GET['limit'] ) ? ( 0 === (int) $_GET['limit'] ? 0 : wp_ja_restaurant_blog_tag_limit() ) : 20;
	$options = '';
	foreach ( array( 5, 10, 15, 20, 25, 30, 50, 100, 0 ) as $n ) {
		$options .= '<option value="' . $n . '"' . selected( $chosen, $n, false ) . '>' . ( 0 === $n ? esc_html__( 'All', 'wp-ja-restaurant' ) : (int) $n ) . '</option>';
	}
	$hint = esc_attr__( 'Enter Part of Title', 'wp-ja-restaurant' );
	return '<h1>' . esc_html( get_the_title( $page_id ) ) . '</h1>'
		. '<form action="' . esc_url( get_permalink( $page_id ) ) . '" method="get" name="adminForm" id="adminForm" class="form-inline js-tag-filter"><fieldset class="filters btn-toolbar"><div class="btn-group">'
		. '<label class="filter-search-lbl element-invisible visually-hidden" for="filter-search">' . esc_html__( 'Enter Part of Title', 'wp-ja-restaurant' ) . '</label>'
		. '<input type="text" name="filter-search" id="filter-search" value="' . esc_attr( $text ) . '" class="inputbox" title="' . esc_attr__( 'Enter all or part of the title to search for.', 'wp-ja-restaurant' ) . '" placeholder="' . $hint . '" />'
		. '<button type="submit" title="' . esc_attr__( 'Search', 'wp-ja-restaurant' ) . '" class="btn"><span class="fa fa-search" aria-hidden="true"></span></button>'
		. '<button type="button" title="' . esc_attr__( 'Clear', 'wp-ja-restaurant' ) . '" class="btn js-tag-filter-clear"><span class="fa fa-remove" aria-hidden="true"></span></button></div>'
		. '<div class="btn-group pull-right"><label for="limit" class="element-invisible">' . esc_html__( 'Display #', 'wp-ja-restaurant' ) . '</label><select id="limit" name="limit" class="form-select">' . $options . '</select></div>'
		. '<div class="clearfix"></div></fieldset>' . $body . '</form>';
}
