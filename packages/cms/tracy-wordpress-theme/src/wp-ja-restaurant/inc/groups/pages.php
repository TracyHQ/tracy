<?php
/**
 * Pages group: the pages the seeder leaves as [masthead, subscribe] only (Featured Articles, All Categories), the
 * button of the About Us introduction, and the Categories module of the home news block.
 *
 * @package wp-ja-restaurant
 */

/**
 * The slug of the page being served when it is one of the two list pages drawn here, or ''.
 *
 * @return string
 */
function wp_ja_restaurant_pages_list_slug(): string {
	if ( ! is_page() ) {
		return '';
	}
	$slug = (string) get_post_field( 'post_name', get_queried_object_id() );
	return in_array( $slug, array( 'featured-articles', 'all-categories' ), true ) ? $slug : '';
}

/**
 * The source's main body around a list: `#t3-mainbody > .row > #t3-content`, as block markup.
 *
 * @param string $inner Block markup of the content column.
 * @return string
 */
function wp_ja_restaurant_pages_mainbody( string $inner ): string {
	return '<!-- wp:group {"className":"container t3-mainbody","layout":{"type":"default"}} --><div class="wp-block-group container t3-mainbody">'
		. '<!-- wp:group {"className":"row","layout":{"type":"default"}} --><div class="wp-block-group row">'
		. '<!-- wp:group {"className":"t3-content col-xs-12","layout":{"type":"default"}} --><div class="wp-block-group t3-content col-xs-12">'
		. $inner
		. '</div><!-- /wp:group --></div><!-- /wp:group --></div><!-- /wp:group -->' . "\n\n";
}

/**
 * The masthead and Subscribe band of a sibling page, re-worded: the spec carries no sections for "All Categories" (the
 * seeder stores a bare heading list), so the page borrows the frame its sibling list page was seeded with.
 *
 * @param string $slug        Slug of the page that holds the frame.
 * @param string $title       The masthead title of this page.
 * @param string $description The masthead line of this page.
 * @return string Block markup, or '' when the sibling is not there.
 */
function wp_ja_restaurant_pages_frame_of( string $slug, string $title, string $description ): string {
	$pages = get_posts(
		array(
			'post_type'   => 'page',
			'name'        => $slug,
			'numberposts' => 1,
		)
	);
	if ( ! $pages ) {
		return '';
	}
	$frame = (string) $pages[0]->post_content;
	$frame = preg_replace( '#(<h1[^>]*class="[^"]*ja-masthead-title[^"]*"[^>]*>)[^<]*(</h1>)#', '${1}' . esc_html( $title ) . '${2}', $frame, 1 ) ?? $frame;
	$frame = preg_replace( '#(<p[^>]*class="[^"]*ja-masthead-description[^"]*"[^>]*>)[^<]*(</p>)#', '${1}' . esc_html( $description ) . '${2}', $frame, 1 ) ?? $frame;
	return $frame;
}

/**
 * The list the source prints between the masthead and the Subscribe band on these two pages. The seeder writes only the
 * masthead and the band, so the list is put in front of the band when the page is rendered; its content is never stored.
 *
 * Featured Articles: a query of the sticky articles (the post template is swapped for the source's article row by the
 * blog group). All Categories: the category cards block below.
 *
 * @param string $content The page content, before blocks are rendered.
 * @return string
 */
function wp_ja_restaurant_pages_list( string $content ): string {
	$slug = wp_ja_restaurant_pages_list_slug();
	if ( '' === $slug || ! in_the_loop() || false !== strpos( $content, 'jr-pages-list' ) ) {
		return $content;
	}
	if ( 'featured-articles' === $slug ) {
		$list = '<!-- wp:group {"className":"blog-featured jr-pages-list","layout":{"type":"default"}} --><div class="wp-block-group blog-featured jr-pages-list">'
			. '<!-- wp:query {"queryId":0,"query":{"perPage":10,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"only","inherit":false}} -->'
			. '<div class="wp-block-query"><!-- wp:post-template {"className":"tracy-grid"} --><!-- wp:post-title /--><!-- /wp:post-template --></div><!-- /wp:query -->'
			. '</div><!-- /wp:group -->';
	} else {
		$list = '<!-- wp:wp-ja-restaurant/category-cards /-->';
		// The seeder files this page as a bare heading list of the same categories; the cards replace it.
		if ( false === strpos( $content, 'mod-subscribe' ) ) {
			$content = wp_ja_restaurant_pages_frame_of( 'featured-articles', 'All Categories', 'Browse the news by category' );
		}
	}
	$band = strpos( $content, '<!-- wp:group {"className":"t3-section-module mod-subscribe' );
	if ( false === $band ) {
		return $content . "\n\n" . wp_ja_restaurant_pages_mainbody( $list );
	}
	return substr( $content, 0, $band ) . wp_ja_restaurant_pages_mainbody( $list ) . substr( $content, $band );
}
add_filter( 'the_content', 'wp_ja_restaurant_pages_list', 8 );

/**
 * The picture of a category card: the attachment kept in the term's `jr_category_image` meta, else the picture of
 * the category's newest article.
 *
 * @param WP_Term $term The category.
 * @return string An img element, or ''.
 */
function wp_ja_restaurant_pages_category_image( WP_Term $term ): string {
	$id = (int) get_term_meta( $term->term_id, 'jr_category_image', true );
	if ( ! $id ) {
		$posts = get_posts(
			array(
				'category'    => $term->term_id,
				'numberposts' => 1,
				'orderby'     => 'date',
				'order'       => 'DESC',
				'fields'      => 'ids',
			)
		);
		$id    = $posts ? (int) get_post_thumbnail_id( (int) $posts[0] ) : 0;
	}
	return $id ? wp_get_attachment_image( $id, 'large', false, array( 'alt' => '' ) ) : '';
}

/**
 * The category cards of "All Categories", in the markup of the source's categories list: one card per child of the
 * "Restaurant" category (name, article count, description and picture all come from the terms).
 *
 * @return string
 */
function wp_ja_restaurant_pages_category_cards(): string {
	$parent = get_term_by( 'slug', 'restaurant', 'category' );
	$terms  = $parent instanceof WP_Term ? get_terms(
		array(
			'taxonomy'   => 'category',
			'parent'     => $parent->term_id,
			'orderby'    => 'term_id',
			'hide_empty' => false,
		)
	) : array();
	if ( ! is_array( $terms ) || ! $terms ) {
		return '';
	}
	$last  = count( $terms ) - 1;
	$cards = '';
	foreach ( array_values( $terms ) as $i => $term ) {
		$image = wp_ja_restaurant_pages_category_image( $term );
		$desc  = trim( wp_strip_all_tags( $term->description ) );
		/* translators: %d: number of articles in a category. */
		$count  = sprintf( __( 'Article Count: %d', 'wp-ja-restaurant' ), (int) $term->count );
		$cards .= '<div class="category-item col-sm-6' . ( 0 === $i ? ' first' : '' ) . ( $i === $last ? ' last' : '' ) . '"><div class="category-inner">'
			. ( $image ? '<div class="description-image">' . $image . '</div>' : '' )
			. '<h3 class="item-title"><a href="' . esc_url( get_term_link( $term ) ) . '">' . esc_html( html_entity_decode( $term->name, ENT_QUOTES ) ) . '</a>'
			. ' <span class="badge badge-info">' . esc_html( $count ) . '</span></h3>'
			. ( '' !== $desc ? '<div class="category-desc">' . esc_html( $desc ) . '</div>' : '' )
			. '</div></div>';
	}
	return '<div class="categories-list row jr-pages-list">' . $cards . '</div>';
}

add_action(
	'init',
	static function () {
		register_block_type(
			'wp-ja-restaurant/category-cards',
			array(
				'api_version'     => 3,
				'title'           => __( 'Category cards', 'wp-ja-restaurant' ),
				'category'        => 'theme',
				'render_callback' => 'wp_ja_restaurant_pages_category_cards',
			)
		);
	}
);

/**
 * About Us introduction: the seeder splits the text field's `<p>` and `<a class="btn ...">` into two paragraphs and drops
 * the link's classes, so a paragraph holding only a link is printed as the source's button again.
 *
 * @param string $content The rendered group block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_restaurant_pages_intro_button( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'features-text' ) ) {
		return $content;
	}
	return preg_replace_callback(
		'#<p(?:\s[^>]*)?>\s*<a\s([^>]*href="[^"]*"[^>]*)>([^<]*)</a>\s*</p>#',
		static function ( array $m ): string {
			return false === strpos( $m[1], 'class=' ) ? '<a class="btn btn-lg btn-primary" ' . $m[1] . '>' . $m[2] . '</a>' : $m[0];
		},
		$content
	) ?? $content;
}
add_filter( 'render_block_core/group', 'wp_ja_restaurant_pages_intro_button', 10, 2 );

/**
 * The Categories module of the home news block lists the four news categories (the children of "Restaurant"), as the
 * source's does, not every category of the site.
 *
 * @param string $content The rendered categories block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_restaurant_pages_categories_module( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'mod-articlescategories' ) || ! function_exists( 'wp_ja_restaurant_blog_categories_html' ) ) {
		return $content;
	}
	$html = wp_ja_restaurant_blog_categories_html();
	return '' !== $html ? $html : $content;
}
add_filter( 'render_block_core/categories', 'wp_ja_restaurant_pages_categories_module', 10, 2 );

/**
 * Seeded content of the plain article pages whose converter output differs from the source's article (workarounds kept
 * here because the spec and the converter are not this group's files; see the group's requests):
 *  - Offline page / Error page: the masthead carries the module's default words, the source keeps the page's own title
 *    and no line; the article sits straight in the page content, the source holds it in `#t3-mainbody > .row > #t3-content`.
 *  - Our History: the module "Cooking for Brooklyn" is stored twice (a raw HTML block in the body and the Text banner
 *    section); the source prints it once. The icons of the three "at a glance" lines lost their classes.
 *
 * @param string $content The page content, before blocks are rendered.
 * @return string
 */
function wp_ja_restaurant_pages_article_fixes( string $content ): string {
	if ( ! is_page() || ! in_the_loop() ) {
		return $content;
	}
	$slug = (string) get_post_field( 'post_name', get_queried_object_id() );
	if ( 'offline-page' === $slug || 'erro-page' === $slug ) {
		$title   = 'offline-page' === $slug ? 'Offline page' : '404 page';
		// The source's demo sentence names its CMS ("JA Joomla Template"); a WordPress site names its own product.
		$content = str_replace( 'JA Joomla Template', 'JA Restaurant Template', $content );
		$content = preg_replace( '#(<h1[^>]*class="[^"]*ja-masthead-title[^"]*"[^>]*>)[^<]*(</h1>)#', '${1}' . $title . '${2}', $content, 1 ) ?? $content;
		$content = preg_replace( '#<!-- wp:paragraph \{"className":"ja-masthead-description".*?<!-- /wp:paragraph -->\s*#s', '', $content, 1 ) ?? $content;
		$content = preg_replace(
			'#<!-- wp:group \{"layout":\{"type":"constrained"\},"className":"single-content"\} -->.*?</div>\s*<!-- /wp:group -->\s*(?=<!-- wp:group \{"className":"t3-section-module)#s',
			'<!-- wp:group {"className":"container t3-mainbody","layout":{"type":"default"}} --><div class="wp-block-group container t3-mainbody"><!-- wp:group {"className":"row","layout":{"type":"default"}} --><div class="wp-block-group row"><!-- wp:group {"className":"t3-content col-xs-12","layout":{"type":"default"}} --><div class="wp-block-group t3-content col-xs-12">$0</div><!-- /wp:group --></div><!-- /wp:group --></div><!-- /wp:group -->' . "\n\n",
			$content,
			1
		) ?? $content;
	}
	if ( 'our-history' === $slug && false !== strpos( $content, 'acm-text-banner-' ) ) {
		$content = preg_replace( '#<!-- wp:html -->\s*<div class="container text-center">\s*<h1 class="text-lead">.*?<!-- /wp:html -->\s*#s', '', $content, 1 ) ?? $content;
		$icons   = array( 'fas fa-utensils', 'fas fa-map-marker', 'fas fa-history' );
		$content = preg_replace_callback(
			'#<p><i></i>#',
			static function () use ( &$icons ): string {
				return '<p><i class="' . ( array_shift( $icons ) ?? 'fas fa-history' ) . '"></i>';
			},
			$content
		) ?? $content;
	}
	return $content;
}
add_filter( 'the_content', 'wp_ja_restaurant_pages_article_fixes', 8 );
