<?php
/**
 * wp-ja-kinetic — links a template writes to the site's own pages, drawn only while that page is published.
 *
 * The error page's buttons and quick links (patterns/template-404.php) and the Engineering category's
 * breadcrumb (patterns/template-category-engineering.php) lead to pages of the quickstart: Contact, Features,
 * Pricing, FAQ, About, the blog. An owner who takes one of those pages away (Tracy drafts it) would otherwise
 * keep a link that ends on the error page. Each link is resolved here, by the page's path, to the page's own
 * address, and a page that is not published draws no link at all.
 *
 * The error page's footer is the site's footer part (parts/footer.html, edited under Patterns), so its menus,
 * brand, copyright line and social links are the owner's. The source's error layout shows the newsletter band
 * as its copy and a "Subscribe" link instead of the form every other page carries; that one swap is made here,
 * on the error page only.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

/**
 * The address of the published page at `$path` (`company/contact`), or '' when the site publishes none there.
 *
 * @param string $path The page path, without slashes at either end.
 * @return string
 */
function wp_ja_kinetic_live_page_url( string $path ): string {
	static $cache = array();
	if ( ! array_key_exists( $path, $cache ) ) {
		$page           = get_page_by_path( $path, OBJECT, 'page' );
		$cache[ $path ] = ( $page instanceof WP_Post && 'publish' === $page->post_status ) ? (string) get_permalink( $page ) : '';
	}
	return $cache[ $path ];
}

/**
 * A link to the published page at `$path` labelled `$label`, or '' when the site publishes none there.
 *
 * @param string $path  The page path.
 * @param string $label The visible label, already translated.
 * @param string $class The link's class, if any.
 * @return string
 */
function wp_ja_kinetic_live_page_link( string $path, string $label, string $class = '' ): string {
	$url = wp_ja_kinetic_live_page_url( $path );
	if ( '' === $url ) {
		return '';
	}
	$attr = '' === $class ? '' : ' class="' . esc_attr( $class ) . '"';
	return '<a' . $attr . ' href="' . esc_url( $url ) . '">' . esc_html( $label ) . '</a>';
}

/**
 * On the error page, the footer's newsletter form becomes the source's "Subscribe" link to the form on the home
 * page (the source's error layout, css/template.css:20680-20750); every other page keeps the form.
 *
 * @param string $content The form as drawn.
 * @return string
 */
function wp_ja_kinetic_404_news_link( $content ): string {
	if ( ! is_404() ) {
		return (string) $content;
	}
	return '<a class="tracy-footer__news-btn" href="' . esc_url( home_url( '/#kinetic-newsletter' ) ) . '">' . esc_html__( 'Subscribe', 'wp-ja-kinetic' ) . '</a>';
}
add_filter( 'render_block_acymailing/subscription-form', 'wp_ja_kinetic_404_news_link', 20, 1 );
