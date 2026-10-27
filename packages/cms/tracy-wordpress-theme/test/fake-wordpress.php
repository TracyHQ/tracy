<?php
/**
 * A minimal fake WordPress for rendering the Tracy Business theme's template parts with real PHP.
 *
 * It is exactly as much WordPress as `inc/extra.php` and the parts touch: hooks, options, the
 * translation calls (reading the theme's own `languages/<locale>.l10n.php`), Polylang's current
 * language, and a block renderer that walks block markup, draws the handful of dynamic blocks the
 * parts use, and runs the `render_block` filters on every block the way core does. It knows no
 * database and no plugin, and its Query Loop, when a test asks for one, lists the world's posts
 * without reading the query's arguments: a test sets the world in the input and reads the markup
 * back.
 *
 * Input (JSON on stdin): theme (directory of the built theme), locale, lang (Polylang slug or
 * null for no Polylang), default (Polylang's default language, "en" when omitted), home (language
 * slug => that language's home URL, "/<slug>/" when omitted), options (name => value), posts
 * (pages, posts and `wp_navigation` menus: ID, post_type, post_name, post_status, post_title,
 * post_content, post_date, lang, url, and group — posts sharing a group are one another's
 * translations), loop (true: a Query Loop's post template lists the world's published `post`
 * rows; otherwise it draws its blocks once, as stored), is_404 (the request is a 404),
 * content (the post content a post-content block draws), identity (true: each rendered item
 * leaves through the identity buffer, tokens filled from the `tracy_site_identity` option), post
 * (the request's `$_POST`), render (list of { part }, { pattern } — with `inserted: true`, the
 * markup it writes into a page, not drawn — { template }, { markup }, { filter, value } — a filter
 * run on a value — { call } — a
 * theme function's return value — or { cf7 } — a form's markup drawn the way Contact Form 7 draws
 * it: { fields, form }, its hidden fields and elements), cf7_forms (the titles of the Contact Form 7
 * forms the site has; ["Newsletter"] when omitted, false for no Contact Form 7).
 * Output (JSON on stdout): the rendered markup of each item, in order.
 */

define( 'ABSPATH', '/' );
define( 'OBJECT', 'OBJECT' );

#[AllowDynamicProperties]
class WP_Post {
	public function __construct( array $fields ) {
		foreach ( $fields as $key => $value ) {
			$this->$key = $value;
		}
	}
}

$tracy_fake_in = json_decode( (string) stream_get_contents( STDIN ), true );
$_POST         = $tracy_fake_in['post'] ?? array();
$tracy_fake    = array(
	'hooks'   => array(),
	'options' => $tracy_fake_in['options'] ?? array(),
	'locale'  => $tracy_fake_in['locale'] ?? 'en_US',
	'page'    => $tracy_fake_in['locale'] ?? 'en_US',
	'lang'    => $tracy_fake_in['lang'] ?? null,
	'default' => $tracy_fake_in['default'] ?? 'en',
	'home'    => $tracy_fake_in['home'] ?? array(),
	'is_404'  => $tracy_fake_in['is_404'] ?? false,
	'content' => $tracy_fake_in['content'] ?? '',
	'loop'    => ! empty( $tracy_fake_in['loop'] ),
	'posts'   => array_map(
		static fn( array $p ): WP_Post => new WP_Post( $p + array( 'post_status' => 'publish', 'post_title' => '', 'post_content' => '', 'group' => null, 'lang' => null ) ),
		$tracy_fake_in['posts'] ?? array()
	),
	'theme'   => rtrim( (string) $tracy_fake_in['theme'], '/' ),
	'l10n'    => array(),
	'ids'     => 0,
);

// Hooks.
function add_filter( $name, $callback, $priority = 10, $args = 1 ) {
	$GLOBALS['tracy_fake']['hooks'][ $name ][ $priority ][] = array( $callback, $args );
	return true;
}
function add_action( $name, $callback, $priority = 10, $args = 1 ) {
	return add_filter( $name, $callback, $priority, $args );
}
function apply_filters( $name, $value, ...$rest ) {
	$hooks = $GLOBALS['tracy_fake']['hooks'][ $name ] ?? array();
	ksort( $hooks );
	foreach ( $hooks as $callbacks ) {
		foreach ( $callbacks as [ $callback, $args ] ) {
			$value = $callback( ...array_slice( array( $value, ...$rest ), 0, $args ) );
		}
	}
	return $value;
}
function do_action( $name, ...$args ) {
	apply_filters( $name, ...( $args ? $args : array( null ) ) );
}

// Options and site facts.
/**
 * Contact Form 7's shortcode, as the plugin answers it: a form of the world's `cf7_forms` (titles;
 * `["Newsletter"]` when omitted, none when Contact Form 7 is absent: `cf7: false`) draws the
 * newsletter form, any other title the plugin's own "not found" text.
 */
function shortcode_exists( $tag ) {
	return 'contact-form-7' === $tag && false !== ( $GLOBALS['tracy_fake_in']['cf7_forms'] ?? null );
}
function shortcode_unautop( $text ) {
	return (string) preg_replace( '~<p>\s*(\[[^\]]+\])\s*</p>~', '$1', (string) $text );
}
function do_shortcode( $text ) {
	return (string) preg_replace_callback(
		'~\[contact-form-7 title="([^"]*)"\]~',
		static function ( array $m ): string {
			if ( ! in_array( $m[1], (array) ( $GLOBALS['tracy_fake_in']['cf7_forms'] ?? array( 'Newsletter' ) ), true ) ) {
				return '[contact-form-7 404 "Not Found"]';
			}
			return '<div class="wpcf7"><form class="wpcf7-form"><input type="email" name="email-1" class="wpcf7-form-control wpcf7-email" placeholder="Work email"><input class="wpcf7-form-control wpcf7-submit" type="submit" value="Subscribe"></form></div>';
		},
		(string) $text
	);
}
function get_option( $name, $fallback = false ) {
	return array_key_exists( $name, $GLOBALS['tracy_fake']['options'] ) ? $GLOBALS['tracy_fake']['options'][ $name ] : $fallback;
}
function get_bloginfo( $what = '' ) {
	return (string) get_option( array( 'name' => 'blogname', 'description' => 'blogdescription' )[ $what ] ?? $what, '' );
}
function wp_date( $format ) {
	return gmdate( $format );
}

// Translations: the theme's PHP translation files, as load_textdomain() reads them.
function determine_locale() {
	return $GLOBALS['tracy_fake']['locale'];
}
function load_theme_textdomain( $domain, $path ) {
	$file = $path . '/' . determine_locale() . '.l10n.php';
	if ( is_readable( $file ) ) {
		$data = include $file;
		$GLOBALS['tracy_fake']['l10n'][ $domain ] = $data['messages'] ?? array();
	}
	return true;
}
function translate( $text, $domain = 'default' ) {
	return $GLOBALS['tracy_fake']['l10n'][ $domain ][ $text ] ?? $text;
}
function _x( $text, $context, $domain = 'default' ) {
	$translated = translate( $context . "\4" . $text, $domain );
	return $context . "\4" . $text === $translated ? $text : $translated;
}
function __( $text, $domain = 'default' ) {
	return translate( $text, $domain );
}
function esc_html__( $text, $domain = 'default' ) {
	return esc_html( translate( $text, $domain ) );
}
function esc_html_e( $text, $domain = 'default' ) {
	echo esc_html__( $text, $domain );
}
function esc_attr__( $text, $domain = 'default' ) {
	return esc_attr( translate( $text, $domain ) );
}
function esc_attr_e( $text, $domain = 'default' ) {
	echo esc_attr__( $text, $domain );
}
function esc_html( $text ) {
	return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8', false );
}
function esc_attr( $text ) {
	return esc_html( $text );
}
function esc_url( $url ) {
	return esc_attr( $url );
}
function wp_kses( $text, $allowed ) {
	return strip_tags( (string) $text );
}
function wp_unslash( $value ) {
	return $value;
}
function wp_strip_all_tags( $text ) {
	return trim( strip_tags( (string) $text ) );
}

// Polylang, when the test says it is active.
if ( null !== $tracy_fake['lang'] ) {
	// The page language's locale stays put while Contact Form 7 switches WordPress's.
	function pll_current_language( $field = 'slug' ) {
		return 'locale' === $field ? $GLOBALS['tracy_fake']['page'] : $GLOBALS['tracy_fake']['lang'];
	}
	function pll_default_language( $field = 'slug' ) {
		return $GLOBALS['tracy_fake']['default'];
	}
	function pll_get_post( $id, $lang = '' ) {
		$post = get_post( $id );
		if ( ! $post ) {
			return false;
		}
		if ( null === $post->group ) {
			return $post->lang === $lang ? $post->ID : false;
		}
		foreach ( $GLOBALS['tracy_fake']['posts'] as $p ) {
			if ( $p->group === $post->group && $p->lang === $lang ) {
				return $p->ID;
			}
		}
		return false;
	}
	function pll_languages_list( $args = array() ) {
		return array_keys( $GLOBALS['tracy_fake']['home'] );
	}
	function pll_home_url( $lang = '' ) {
		return $GLOBALS['tracy_fake']['home'][ $lang ] ?? '/' . $lang . '/';
	}
}

// Posts, pages and menus: the world's list, no database.
function get_post( $id = null ) {
	if ( $id instanceof WP_Post ) {
		return $id;
	}
	foreach ( $GLOBALS['tracy_fake']['posts'] as $post ) {
		if ( null !== $id && $post->ID === (int) $id ) {
			return $post;
		}
	}
	return null;
}
function get_page_by_path( $path, $output = OBJECT, $type = 'page' ) {
	foreach ( $GLOBALS['tracy_fake']['posts'] as $post ) {
		if ( $post->post_name === $path && $post->post_type === $type ) {
			return $post;
		}
	}
	return null;
}
function get_post_status( $id ) {
	return get_post( $id )->post_status ?? false;
}
function get_permalink( $post ) {
	return get_post( $post )->url ?? false;
}
function get_the_title( $post ) {
	return (string) ( get_post( $post )->post_title ?? '' );
}
function get_posts( $args ) {
	return array_values(
		array_filter(
			$GLOBALS['tracy_fake']['posts'],
			static fn( WP_Post $p ): bool => $p->post_type === ( $args['post_type'] ?? 'post' )
				&& $p->post_status === ( $args['post_status'] ?? 'publish' )
				&& ( ! isset( $args['lang'] ) || $p->lang === $args['lang'] )
		)
	);
}
function parse_blocks( $markup ) {
	$convert = static function ( array $node ) use ( &$convert ): array {
		$inner = array_values( array_filter( $node['parts'], 'is_array' ) );
		return array( 'blockName' => $node['name'], 'attrs' => $node['attrs'], 'innerBlocks' => array_map( $convert, $inner ) );
	};
	return $convert( tracy_fake_parse( (string) $markup ) )['innerBlocks'];
}
function home_url( $path = '' ) {
	return $path;
}
function trailingslashit( $value ) {
	return untrailingslashit( $value ) . '/';
}
function untrailingslashit( $value ) {
	return rtrim( (string) $value, '/' );
}
function add_query_arg( $key, $value, $url ) {
	return $url . ( str_contains( $url, '?' ) ? '&' : '?' ) . $key . '=' . $value;
}
function wp_parse_url( $url, $component = -1 ) {
	return parse_url( (string) $url, $component );
}

// Theme paths.
function get_template_directory() {
	return $GLOBALS['tracy_fake']['theme'];
}
function get_theme_file_uri( $file = '' ) {
	return '/wp-content/themes/wp-tracy-business/' . $file;
}
function get_theme_file_path( $file = '' ) {
	return get_template_directory() . '/' . $file;
}

// Conditionals and objects the filters ask about: a plain page, nothing queried.
function is_home() {
	return false;
}
function is_404() {
	return $GLOBALS['tracy_fake']['is_404'];
}
function is_search() {
	return false;
}
function is_singular( $type = '' ) {
	return false;
}
function is_category() {
	return false;
}
function is_tag() {
	return false;
}
function is_admin() {
	return false;
}
// Scripts: the Contact form's drop zone registers one; nothing is printed here.
function wp_script_is( $handle, $status = 'enqueued' ) {
	return false;
}
function wp_register_script( ...$args ) {
}
function wp_add_inline_script( ...$args ) {
}
function wp_enqueue_script( ...$args ) {
}
function wp_get_theme() {
	return new class() {
		public function get( $header ) {
			return '1.0.0';
		}
	};
}
function add_editor_style( $file ) {
}
function wp_unique_id( $prefix = '' ) {
	return $prefix . ( ++$GLOBALS['tracy_fake']['ids'] );
}
function get_block_wrapper_attributes( $extra = array() ) {
	return 'class="' . esc_attr( $extra['class'] ?? '' ) . '"';
}
// Core's own (wp-includes/blocks.php): a pattern writes a block's attributes with it.
function serialize_block_attributes( $block_attributes ) {
	return strtr(
		(string) json_encode( $block_attributes, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ),
		array(
			'\\\\' => '\\u005c',
			'--'   => '\\u002d\\u002d',
			'<'    => '\\u003c',
			'>'    => '\\u003e',
			'&'    => '\\u0026',
			'\\"'  => '\\u0022',
		)
	);
}

/**
 * The dynamic blocks the parts use, drawn the way core draws them in the parts that matter here
 * (the words and attributes a visitor sees); the rest render nothing.
 */
function tracy_fake_dynamic( string $name, array $attrs, string $inner ): ?string {
	switch ( $name ) {
		case 'core/site-title':
			return '<p class="wp-block-site-title">' . esc_html( get_bloginfo( 'name' ) ) . '</p>';
		case 'core/site-tagline':
			return '<p class="wp-block-site-tagline">' . esc_html( get_bloginfo( 'description' ) ) . '</p>';
		case 'core/search':
			return '<form role="search" class="wp-block-search"><label class="screen-reader-text">' . esc_html( $attrs['label'] ?? 'Search' ) . '</label>'
				. '<input type="search" name="s" placeholder="' . esc_attr( $attrs['placeholder'] ?? '' ) . '">'
				. '<button type="submit" aria-label="' . esc_attr( $attrs['buttonText'] ?? 'Search' ) . '"></button></form>';
		case 'wp-tracy-business/mega-menu':
			$attributes = $attrs;
			$content    = $inner;
			ob_start();
			include get_theme_file_path( 'blocks/mega-menu/render.php' );
			return (string) ob_get_clean();
		case 'core/navigation':
			// The menu the block points at, listed the way core lists one: a link per item.
			$menu = empty( $attrs['ref'] ) ? null : get_post( $attrs['ref'] );
			if ( ! $menu ) {
				return '';
			}
			$links = '';
			foreach ( parse_blocks( $menu->post_content ) as $item ) {
				$a      = $item['attrs'];
				$url    = ! empty( $a['id'] ) ? get_permalink( $a['id'] ) : ( $a['url'] ?? '' );
				$links .= '<li><a class="wp-block-navigation-item__content" href="' . esc_url( $url ) . '">' . esc_html( $a['label'] ?? '' ) . '</a></li>';
			}
			return '<nav class="' . esc_attr( trim( 'wp-block-navigation ' . ( $attrs['className'] ?? '' ) ) ) . '"><ul>' . $links . '</ul></nav>';
		case 'core/post-content':
			// The post's own blocks, drawn inside the block the way `the_content` draws them.
			return '<div class="entry-content">' . tracy_fake_render( tracy_fake_parse( $GLOBALS['tracy_fake']['content'] ) ) . '</div>';
		case 'core/post-terms':
			return '<div class="taxonomy-category wp-block-post-terms">' . ( isset( $attrs['prefix'] ) ? '<span class="wp-block-post-terms__prefix">' . esc_html( $attrs['prefix'] ) . '</span>' : '' ) . '<a href="/category/site/" rel="tag">Site</a></div>';
		case 'core/post-navigation-link':
			return '<div class="post-navigation-link-' . esc_attr( $attrs['type'] ) . '"><span class="post-navigation-link__label">' . esc_html( $attrs['label'] ?? '' ) . '</span> <a href="/a-post/">A post</a></div>';
		case 'core/shortcode':
			// As core: the shortcode block only wraps its text (wpautop); no shortcode runs here, and a
			// pattern inside a template part is drawn with no `do_shortcode` pass at all.
			return '<p>' . trim( $inner ) . '</p>';
		case 'core/post-title':
			// Inside a Query Loop, the loop's post (below); anywhere else the fake has no post.
			$post = $GLOBALS['tracy_fake']['loop_post'] ?? null;
			if ( ! $post ) {
				return '';
			}
			$level = (int) ( $attrs['level'] ?? 2 );
			$title = esc_html( $post->post_title );
			$title = empty( $attrs['isLink'] ) ? $title : '<a href="' . esc_url( $post->url ?? '' ) . '" target="_self">' . $title . '</a>';
			return '<h' . $level . ' class="' . esc_attr( trim( 'wp-block-post-title ' . ( $attrs['className'] ?? '' ) ) ) . '">' . $title . '</h' . $level . '>';
		case 'core/read-more':
			$post = $GLOBALS['tracy_fake']['loop_post'] ?? null;
			if ( ! $post ) {
				return '';
			}
			return '<a class="wp-block-read-more" href="' . esc_url( $post->url ?? '' ) . '" target="_self">' . ( $attrs['content'] ?? 'Read more' ) . '<span class="screen-reader-text">: ' . esc_html( $post->post_title ) . '</span></a>';
		case 'core/site-logo':
		case 'core/post-date':
		case 'polylang/language-switcher':
			return '';
	}
	return null;
}

/**
 * core/post-template the way a Query Loop draws it: one list item per published post of the page
 * language (every post without Polylang), newest `post_date` first, the template's blocks drawn
 * once for each post with that post as the loop's. The query's own arguments (how many, which
 * order) are not read: the fake has no database, and a test lists no more posts than it wants.
 */
function tracy_fake_loop( array $node ): string {
	$lang  = $GLOBALS['tracy_fake']['lang'];
	$posts = array_values(
		array_filter(
			$GLOBALS['tracy_fake']['posts'],
			static fn( WP_Post $p ): bool => 'post' === $p->post_type && 'publish' === $p->post_status && ( null === $lang || $p->lang === $lang )
		)
	);
	usort( $posts, static fn( WP_Post $a, WP_Post $b ): int => strcmp( (string) ( $b->post_date ?? '' ), (string) ( $a->post_date ?? '' ) ) );
	if ( ! $posts ) {
		return '';
	}
	$items = '';
	foreach ( $posts as $post ) {
		$GLOBALS['tracy_fake']['loop_post'] = $post;
		$inner                              = '';
		foreach ( $node['parts'] as $part ) {
			$inner .= is_array( $part ) ? tracy_fake_render( $part ) : $part;
		}
		$items .= '<li class="wp-block-post post-' . $post->ID . ' post type-post">' . $inner . '</li>';
	}
	$GLOBALS['tracy_fake']['loop_post'] = null;
	$block                              = apply_filters( 'render_block_data', array( 'blockName' => $node['name'], 'attrs' => $node['attrs'] ) );
	$content                            = '<ul class="' . esc_attr( trim( 'wp-block-post-template ' . ( $node['attrs']['className'] ?? '' ) ) ) . '">' . $items . '</ul>';
	$content                            = apply_filters( 'render_block', $content, $block );
	return apply_filters( 'render_block_' . $node['name'], $content, $block );
}

/** Parses block markup into a tree of { name, attrs, parts } where parts mix HTML and child blocks. */
function tracy_fake_parse( string $markup ): array {
	preg_match_all( '/<!--\s+(\/)?wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)\s+(\{.*?\}\s+)?(\/)?-->/s', $markup, $tokens, PREG_SET_ORDER | PREG_OFFSET_CAPTURE );
	$root  = array( 'name' => null, 'attrs' => array(), 'parts' => array() );
	$stack = array( &$root );
	$at    = 0;
	foreach ( $tokens as $t ) {
		$top            = &$stack[ count( $stack ) - 1 ];
		$top['parts'][] = substr( $markup, $at, $t[0][1] - $at );
		$at             = $t[0][1] + strlen( $t[0][0] );
		$name           = str_contains( $t[2][0], '/' ) ? $t[2][0] : 'core/' . $t[2][0];
		if ( '/' === ( $t[1][0] ?? '' ) ) {
			array_pop( $stack );
			continue;
		}
		$block          = array( 'name' => $name, 'attrs' => json_decode( trim( $t[3][0] ?? '' ) ?: '{}', true ), 'parts' => array() );
		$top['parts'][] = &$block;
		if ( '/' !== ( $t[4][0] ?? '' ) ) {
			$stack[] = &$block;
		}
		unset( $block, $top );
	}
	$stack[ count( $stack ) - 1 ]['parts'][] = substr( $markup, $at );
	return $root;
}

function tracy_fake_render( array $node ): string {
	if ( 'core/post-template' === $node['name'] && $GLOBALS['tracy_fake']['loop'] ) {
		return tracy_fake_loop( $node );
	}
	// Core resolves a theme pattern block (`<!-- wp:pattern {"slug":…} /-->`) in a template or part
	// before drawing it: the pattern file's PHP runs and its block markup takes the block's place.
	if ( 'core/pattern' === $node['name'] ) {
		$file = tracy_fake_pattern_file( (string) ( $node['attrs']['slug'] ?? '' ) );
		if ( null === $file ) {
			return '';
		}
		ob_start();
		include $file;
		return tracy_fake_render( tracy_fake_parse( (string) ob_get_clean() ) );
	}
	$inner = '';
	foreach ( $node['parts'] as $part ) {
		$inner .= is_array( $part ) ? tracy_fake_render( $part ) : $part;
	}
	if ( null === $node['name'] ) {
		return $inner;
	}
	// Core runs `render_block_data` on the parsed block before drawing it (the menu swap lives there).
	$block   = apply_filters( 'render_block_data', array( 'blockName' => $node['name'], 'attrs' => $node['attrs'] ) );
	$content = tracy_fake_dynamic( $node['name'], $block['attrs'], $inner ) ?? $inner;
	$content = apply_filters( 'render_block', $content, $block );
	return apply_filters( 'render_block_' . $node['name'], $content, $block );
}

/** The theme pattern file whose `Slug:` header is `$slug`, or null when the theme ships none. */
function tracy_fake_pattern_file( string $slug ): ?string {
	foreach ( glob( get_theme_file_path( 'patterns/*.php' ) ) ?: array() as $file ) {
		if ( preg_match( '/^\s*\*\s*Slug:\s*(\S+)\s*$/m', (string) file_get_contents( $file ), $m ) && $m[1] === $slug ) {
			return $file;
		}
	}
	return null;
}

/** A template part as core renders one: its file's blocks, then the part block's own filters. */
function tracy_fake_part( string $slug ): string {
	$part = array(
		'name'  => 'core/template-part',
		'attrs' => array( 'slug' => $slug ),
		'parts' => array( tracy_fake_parse( (string) file_get_contents( get_theme_file_path( "parts/$slug.html" ) ) ) ),
	);
	return tracy_fake_render( $part );
}

// Core draws a post's blocks in `the_content`; the 404 body filter relies on it.
add_filter( 'the_content', static fn( $content ) => tracy_fake_render( tracy_fake_parse( (string) $content ) ) );
require get_theme_file_path( 'inc/extra.php' );
do_action( 'after_setup_theme' );

$tracy_fake_out = array();
foreach ( $tracy_fake_in['render'] as $item ) {
	if ( isset( $item['call'] ) ) {
		$tracy_fake_out[] = call_user_func( $item['call'] );
		continue;
	}
	if ( isset( $item['filter'] ) ) {
		$tracy_fake_out[] = apply_filters( $item['filter'], $item['value'] );
		continue;
	}
	if ( isset( $item['cf7'] ) ) {
		// Contact Form 7 draws a form in the form's locale, `en_US`: where WordPress has the page
		// language's own files it switches to it for the drawing, and the theme's translations reload
		// in English (none), then it switches back.
		[ $locale, $l10n ]             = array( $tracy_fake['locale'], $tracy_fake['l10n'] );
		$tracy_fake['locale']          = 'en_US';
		$tracy_fake['l10n']            = array();
		$tracy_fake_out[]              = array(
			'fields' => apply_filters( 'wpcf7_form_hidden_fields', array() ),
			'form'   => apply_filters( 'wpcf7_form_elements', $item['cf7'] ),
		);
		[ $tracy_fake['locale'], $tracy_fake['l10n'] ] = array( $locale, $l10n );
		continue;
	}
	if ( isset( $item['pattern'] ) ) {
		// A pattern's PHP runs when it is inserted; its output is block markup, rendered as stored.
		ob_start();
		include get_theme_file_path( "patterns/{$item['pattern']}.php" );
		$item['markup'] = (string) ob_get_clean();
		// `inserted`: the block markup the pattern writes into a page, before anything draws it.
		if ( ! empty( $item['inserted'] ) ) {
			$tracy_fake_out[] = $item['markup'];
			continue;
		}
	}
	if ( isset( $item['template'] ) ) {
		$item['markup'] = (string) file_get_contents( get_theme_file_path( "templates/{$item['template']}.html" ) );
	}
	$html = isset( $item['part'] ) ? tracy_fake_part( $item['part'] ) : tracy_fake_render( tracy_fake_parse( $item['markup'] ) );
	// The page on its way out, as the identity buffer started at `template_redirect` leaves it.
	$tracy_fake_out[] = empty( $tracy_fake_in['identity'] ) ? $html : wp_tracy_business_identity_render( $html, wp_tracy_business_identity() );
}
echo json_encode( $tracy_fake_out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
