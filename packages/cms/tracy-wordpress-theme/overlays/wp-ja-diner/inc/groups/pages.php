<?php
/**
 * Pages group: the button of the About Us introduction, the Categories module of the home news block and the
 * plain article pages (Offline page, Error page). The listing pages are drawn by the blog group.
 *
 * @package wp-ja-diner
 */

/**
 * About Us introduction: the seeder splits the text field's `<p>` and `<a class="btn ...">` into two paragraphs and drops
 * the link's classes, so a paragraph holding only a link is printed as the source's button again.
 *
 * @param string $content The rendered group block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_diner_pages_intro_button( string $content, array $block ): string {
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
add_filter( 'render_block_core/group', 'wp_ja_diner_pages_intro_button', 10, 2 );

/**
 * The Categories module of the home news block lists the four news categories (the children of "Restaurant"), as the
 * source's does, not every category of the site.
 *
 * @param string $content The rendered categories block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_diner_pages_categories_module( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'mod-articlescategories' ) || ! function_exists( 'wp_ja_diner_blog_categories_html' ) ) {
		return $content;
	}
	$html = wp_ja_diner_blog_categories_html();
	return '' !== $html ? $html : $content;
}
add_filter( 'render_block_core/categories', 'wp_ja_diner_pages_categories_module', 10, 2 );

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
function wp_ja_diner_pages_article_fixes( string $content ): string {
	if ( ! is_page() || ! in_the_loop() ) {
		return $content;
	}
	$slug = (string) get_post_field( 'post_name', get_queried_object_id() );
	if ( 'typography' === $slug ) {
		// The seeder gives the page the masthead module's default words; the source titles it with the page's own and prints no line.
		$content = preg_replace( '#(<h1[^>]*class="[^"]*ja-masthead-title[^"]*"[^>]*>)[^<]*(</h1>)#', '${1}Typography${2}', $content, 1 ) ?? $content;
		$content = preg_replace( '#<!-- wp:paragraph \{"className":"ja-masthead-description".*?<!-- /wp:paragraph -->\s*#s', '', $content, 1 ) ?? $content;
	}
	if ( 'offline-page' === $slug || 'erro-page' === $slug ) {
		$title   = 'offline-page' === $slug ? 'Offline page' : '404 page';
		// The source's demo sentence names its CMS ("JA Joomla Template"); a WordPress site names its own product.
		$content = str_replace( 'JA Joomla Template', 'JA Diner Template', $content );
		$content = preg_replace( '#(<h1[^>]*class="[^"]*ja-masthead-title[^"]*"[^>]*>)[^<]*(</h1>)#', '${1}' . $title . '${2}', $content, 1 ) ?? $content;
		$content = preg_replace( '#<!-- wp:paragraph \{"className":"ja-masthead-description".*?<!-- /wp:paragraph -->\s*#s', '', $content, 1 ) ?? $content;
		$content = preg_replace(
			'#<!-- wp:group \{"layout":\{"type":"constrained"\},"className":"single-content"\} -->.*?</div>\s*<!-- /wp:group -->\s*(?=<!-- wp:group \{"className":"t3-section-module)#s',
			'<!-- wp:group {"className":"container t3-mainbody","layout":{"type":"default"}} --><div class="wp-block-group container t3-mainbody"><!-- wp:group {"className":"row","layout":{"type":"default"}} --><div class="wp-block-group row"><!-- wp:group {"className":"t3-content col-xs-12","layout":{"type":"default"}} --><div class="wp-block-group t3-content col-xs-12">$0</div><!-- /wp:group --></div><!-- /wp:group --></div><!-- /wp:group -->' . "\n\n",
			$content,
			1
		) ?? $content;
	}
	return $content;
}
add_filter( 'the_content', 'wp_ja_diner_pages_article_fixes', 8 );

/**
 * A quote's author line: the source prints `<small>Author in <cite>Title</cite></small>` straight under the quote's
 * paragraphs; the converter leaves a paragraph around a bare `<small>` and drops the cite.
 *
 * @param string $content The rendered quote block.
 * @return string
 */
function wp_ja_diner_pages_quote_author( string $content ): string {
	return (string) preg_replace_callback(
		'#<p(?:\s[^>]*)?><small>([^<]*?)(?: in ([^<]+))?</small></p>#',
		static function ( array $m ): string {
			$cite = isset( $m[2] ) && '' !== $m[2] ? ' in <cite title="' . esc_attr( $m[2] ) . '">' . $m[2] . '</cite>' : '';
			return '<small>' . $m[1] . $cite . '</small>';
		},
		$content
	);
}
add_filter( 'render_block_core/quote', 'wp_ja_diner_pages_quote_author' );
