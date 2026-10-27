<?php
/**
 * tracy — one theme, 152 looks.
 *
 * The look is a style variation (styles/<id>.json, one per OpenDesign design system), applied to
 * the site's global styles by tracy_apply_inspiration(). The navigation and hero layouts are two
 * options, defaulting to what inspirations.json records for that design system, and reach the
 * page as body classes that assets/css/layout.css keys on.
 *
 * @package tracy
 */

defined( 'ABSPATH' ) || exit;

// Where new versions come from: a GitHub release of TracyHQ/claude-cowork, checked through the
// `Update URI:` header in style.css. See inc/update.php.
require_once __DIR__ . '/inc/update.php';
// Where a variation lives (theme, then uploads) and which systems the site may wear: inc/variations.php.
require_once __DIR__ . '/inc/variations.php';
// A theme stylesheet's `ver` carries its file's modification time, so a look change that rewrites the
// file reaches every browser at once instead of after its cache gives up: inc/asset-version.php.
require_once __DIR__ . '/inc/asset-version.php';
// The customer's logo for dark backgrounds (option tracy_logo_dark), the site name as text where no logo
// fits, and {site.title}/{year} in a copyright line: inc/brand-logo.php.
require_once __DIR__ . '/inc/brand-logo.php';
// The block and site editors get plain colours where a palette entry reads a design-system role
// (`var(--ds-c-bg, #f5f3ee)`): their colour pickers parse the raw value. inc/role-reads.php.
require_once __DIR__ . '/inc/role-reads.php';

const TRACY_NAVS  = array( 'top-left', 'top-centered', 'brand-centered', 'sidebar', 'overlay' );
const TRACY_HEROS = array( 'split', 'centered', 'cover', 'stack' );

/**
 * The catalogue of design systems this theme ships, from the generated inspirations.json.
 *
 * @return array<string, array{name: string, category: string, nav: string, hero: string, dark: bool}>
 */
function tracy_inspirations(): array {
	static $systems = null;
	if ( null === $systems ) {
		$decoded = wp_json_file_decode( get_theme_file_path( 'inspirations.json' ), array( 'associative' => true ) );
		$systems = is_array( $decoded ) && isset( $decoded['systems'] ) && is_array( $decoded['systems'] ) ? $decoded['systems'] : array();
		// Plus what Tracy wrote at runtime under uploads (a brand's look, ADR 0023).
		$systems = tracy_inspirations_merged( $systems );
	}
	return $systems;
}

/**
 * The design system a design page (fixture or artifact) was written for: its wrapper says so.
 * The page keeps that stylesheet when the style variation switches — apple's markup under
 * agentic's stylesheet is broken, not restyled. Bringing the page over to the new system means
 * rewriting its content, which is the seeder's job, not the theme's.
 *
 * @param string $html     The post content.
 * @param string $fallback The current inspiration, for content without a wrapper.
 * @return string A known design system id.
 */
function tracy_page_system( string $html, string $fallback ): string {
	if ( preg_match( '/<div class="tracy-(?:fixture|artifact)"[^>]*\sdata-inspiration="([a-z0-9-]+)"/', $html, $m ) && isset( tracy_inspirations()[ $m[1] ] ) ) {
		return $m[1];
	}
	return $fallback;
}

/**
 * Make the site wear one design system: write its variation into the user global styles post
 * and record the layout it comes with. Safe from WP-CLI (`wp eval`), where no user is logged in.
 *
 * @param string $id A design system id, e.g. "brutalism".
 * @return bool True when the variation was written.
 */
function tracy_apply_inspiration( string $id ): bool {
	$meta = tracy_inspirations()[ $id ] ?? null;
	if ( null === $meta || ! preg_match( '/^[a-z0-9-]+$/', $id ) ) {
		return false;
	}
	$file = tracy_variation_file( $id );
	if ( null === $file ) {
		return false;
	}
	$variation = wp_json_file_decode( $file, array( 'associative' => true ) );
	if ( ! is_array( $variation ) ) {
		return false;
	}
	unset( $variation['$schema'], $variation['title'] );
	$variation['isGlobalStylesUserThemeJSON'] = true;

	$post_id = WP_Theme_JSON_Resolver::get_user_global_styles_post_id();
	if ( ! $post_id ) {
		$data    = WP_Theme_JSON_Resolver::get_user_data_from_wp_global_styles( wp_get_theme(), true );
		$post_id = isset( $data['ID'] ) ? (int) $data['ID'] : 0;
	}
	if ( ! $post_id ) {
		return false;
	}

	// The resolver finds the post by its wp_theme term. When the post was created without a
	// logged-in user (WP-CLI), wp_insert_post could not assign that term — the post exists but is
	// never found, and every call mints another. Set the term directly; this does not check caps.
	wp_set_object_terms( $post_id, wp_get_theme()->get_stylesheet(), 'wp_theme' );

	// Without a logged-in user the save filters run and strip everything but layout from the
	// JSON. The JSON is ours, read from the theme's own files: lift them for this one write.
	$had_post_kses   = has_filter( 'content_save_pre', 'wp_filter_post_kses' );
	$had_styles_kses = has_filter( 'content_save_pre', 'wp_filter_global_styles_post' );
	if ( $had_post_kses ) {
		remove_filter( 'content_save_pre', 'wp_filter_post_kses' );
	}
	if ( $had_styles_kses ) {
		remove_filter( 'content_save_pre', 'wp_filter_global_styles_post', 9 );
	}
	$result = wp_update_post(
		array(
			'ID'           => $post_id,
			'post_content' => wp_slash( wp_json_encode( $variation ) ),
		),
		true
	);
	if ( $had_post_kses ) {
		add_filter( 'content_save_pre', 'wp_filter_post_kses' );
	}
	if ( $had_styles_kses ) {
		add_filter( 'content_save_pre', 'wp_filter_global_styles_post', 9 );
	}
	if ( is_wp_error( $result ) || ! $result ) {
		return false;
	}

	update_option( 'tracy_inspiration', $id );
	update_option( 'tracy_nav', in_array( $meta['nav'] ?? '', TRACY_NAVS, true ) ? $meta['nav'] : 'top-left' );
	update_option( 'tracy_hero', in_array( $meta['hero'] ?? '', TRACY_HEROS, true ) ? $meta['hero'] : 'split' );
	if ( function_exists( 'wp_clean_theme_json_cache' ) ) {
		wp_clean_theme_json_cache();
	}
	return true;
}

/**
 * Which page kind of the content contract this request is.
 *
 * @return string home | listing | article | pricing | page
 */
function tracy_page_kind(): string {
	if ( is_page() && 'fixture' === get_page_template_slug() ) {
		return 'fixture';
	}
	if ( is_page() && 'artifact' === get_page_template_slug() ) {
		return 'artifact';
	}
	if ( is_front_page() ) {
		return 'home';
	}
	if ( is_home() || is_archive() || is_search() ) {
		return 'listing';
	}
	if ( is_singular( 'post' ) ) {
		return 'article';
	}
	if ( is_page() && 'pricing' === get_page_template_slug() ) {
		return 'pricing';
	}
	return 'page';
}

/**
 * The design system the site wears: named by the variation in the merged global styles
 * (`settings.custom.tracy.inspiration`, which every generated variation carries), so a pick in
 * the Site Editor counts as much as tracy_apply_inspiration(); the option is the fallback for a
 * global styles post written before the variations carried their id.
 *
 * @return string A catalog id.
 */
function tracy_site_inspiration(): string {
	$declared = wp_get_global_settings( array( 'custom', 'tracy', 'inspiration' ) );
	if ( is_string( $declared ) && isset( tracy_inspirations()[ $declared ] ) ) {
		return $declared;
	}
	$option = (string) get_option( 'tracy_inspiration', 'default' );
	return isset( tracy_inspirations()[ $option ] ) ? $option : 'default';
}

/**
 * The design system the visitor asked for from the address bar, if any: `?style=<id>` on this
 * request, else the `tracy_style` cookie an earlier `?style=` left behind (a day, so following a
 * link keeps the look). `?style=` with no value forgets it. Only ids the catalog knows count.
 * Section pages follow this; a design page (fixture, artifact) keeps the system its content was
 * written for. It is a per-visitor preview, not a site setting: nothing is written to the
 * database. A site behind a page cache must vary the cache on this cookie.
 *
 * @return string|null A catalog id, or null when nothing was asked.
 */
function tracy_requested_style(): ?string {
	static $resolved  = false;
	static $requested = null;
	if ( $resolved ) {
		return $requested;
	}
	$resolved = true;
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- a read-only preview switch.
	if ( isset( $_GET['style'] ) ) {
		$query = sanitize_key( wp_unslash( (string) $_GET['style'] ) );
		if ( '' !== $query && isset( tracy_inspirations()[ $query ] ) ) {
			$requested = $query;
		}
		return $requested;
	}
	// phpcs:enable
	$cookie = isset( $_COOKIE['tracy_style'] ) ? sanitize_key( wp_unslash( (string) $_COOKIE['tracy_style'] ) ) : '';
	if ( '' !== $cookie && isset( tracy_inspirations()[ $cookie ] ) ) {
		$requested = $cookie;
	}
	return $requested;
}

/**
 * The design system this request renders: the visitor's preview if asked, else the site's.
 *
 * @return string A catalog id.
 */
function tracy_current_inspiration(): string {
	return tracy_requested_style() ?? tracy_site_inspiration();
}

// Remember or forget the preview before any output; the cookie carries only a catalog id.
// A previewed page is one visitor's: DONOTCACHEPAGE is the constant every page-cache plugin
// (WP Super Cache, W3 Total Cache, WP Rocket, LiteSpeed, host caches) honours, so the page is
// not stored for the next visitor; nocache_headers() tells proxies and CDNs the same.
add_action(
	'template_redirect',
	function (): void {
		$requested = tracy_requested_style();
		if ( null !== $requested ) {
			if ( ! defined( 'DONOTCACHEPAGE' ) ) {
				define( 'DONOTCACHEPAGE', true );
			}
			if ( ! headers_sent() ) {
				nocache_headers();
			}
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only preview switch.
		if ( ! isset( $_GET['style'] ) || headers_sent() ) {
			return;
		}
		$options   = array(
			'expires'  => null !== $requested ? time() + DAY_IN_SECONDS : time() - DAY_IN_SECONDS,
			'path'     => '/',
			'secure'   => is_ssl(),
			'httponly' => true,
			'samesite' => 'Lax',
		);
		setcookie( 'tracy_style', (string) $requested, $options );
	}
);

add_filter(
	'body_class',
	function ( array $classes ): array {
		$meta = tracy_inspirations()[ tracy_current_inspiration() ] ?? array();
		$nav  = (string) ( $meta['nav'] ?? get_option( 'tracy_nav', 'top-left' ) );
		$hero = (string) ( $meta['hero'] ?? get_option( 'tracy_hero', 'split' ) );
		$classes[] = 'tracy';
		$classes[] = 'tracy-nav-' . ( in_array( $nav, TRACY_NAVS, true ) ? $nav : 'top-left' );
		$classes[] = 'tracy-hero-' . ( in_array( $hero, TRACY_HEROS, true ) ? $hero : 'split' );
		$classes[] = 'tracy-page-' . tracy_page_kind();
		return $classes;
	}
);

/**
 * The motion effects this site has switched on, from the `tracy_motion` option: the stored
 * `effects` list as written, each entry an id with the library version and intensity it was
 * written for. A missing, empty or unparseable option means all off; an id the library does not
 * know passes through untouched, because the runtime ignores what it cannot name.
 *
 * Read once and shared: the assets are registered from a `wp_enqueue_scripts` callback and the
 * head marker is printed from a `wp_head` one, and both gate on the same parsed value.
 *
 * @return array<int, mixed>
 */
function tracy_motion_effects(): array {
	static $effects = null;
	if ( null === $effects ) {
		$stored  = get_option( 'tracy_motion' );
		$decoded = is_string( $stored ) ? json_decode( $stored, true ) : null;
		$effects = is_array( $decoded ) && isset( $decoded['effects'] ) && is_array( $decoded['effects'] )
			? array_values( $decoded['effects'] )
			: array();
	}
	return $effects;
}

add_action(
	'wp_enqueue_scripts',
	function (): void {
		$version = wp_get_theme()->get( 'Version' );
		$kind = tracy_page_kind();
		// The live-preview agent, on EVERY page kind — including the two design kinds that return
		// early below, which are exactly the pages someone watches while an inspiration is being
		// tried on. It is inert outside a frame (one comparison, no listener, no message), so a
		// customer's visitor pays for one deferred kilobyte and nothing else, and the side card's
		// Browser tab can repaint a stylesheet change without reloading the page out from under
		// whoever is reading it. Generated by packages/cms/tracy-cms-preview — do not edit the file.
		wp_enqueue_script( 'tracy-preview', get_theme_file_uri( 'assets/js/tracy-preview.js' ), array(), $version, array( 'strategy' => 'defer' ) );
		// The motion library, on every page kind that has an effect switched on. A design page
		// dequeues a named list of core handles below, not a sweep, so `tracy-motion` survives it
		// and needs no carve-out. The config global goes before the library tag, re-encoded from
		// the parsed option so nothing stored can break out of the script element, and the library
		// asset stays deferred — `wp_add_inline_script( ..., 'after' )` would drop that strategy.
		$motion = tracy_motion_effects();
		if ( array() !== $motion ) {
			wp_enqueue_style( 'tracy-motion', get_theme_file_uri( 'assets/css/tracy-motion.css' ), array(), $version );
			wp_enqueue_script( 'tracy-motion', get_theme_file_uri( 'assets/js/tracy-motion.js' ), array(), $version, array( 'strategy' => 'defer' ) );
			wp_add_inline_script( 'tracy-motion', 'window.TracyMotion = ' . wp_json_encode( array( 'effects' => $motion ) ) . ';', 'before' );
		}
		if ( 'fixture' === $kind || 'artifact' === $kind ) {
			// A design page — the system's own fixture, or an engine artifact — pixel for pixel as
			// the preview showed it: its fenced stylesheet and fixture-page.css, plus the motion
			// sheet enqueued above when an effect is on. Everything else (the theme's sheets, the
			// block library, the global styles) is dequeued below at priority 100, so no element
			// rule of WordPress or of the theme's own layout reaches it. The dequeue names six core
			// handles and never walks the queue, so `tracy-motion` is not among them and stays; it
			// costs the page nothing, because every rule that sheet carries sits under
			// `html.tracy-motion main section` and these two templates render no `<main>`.
			$id = tracy_page_system( (string) get_post_field( 'post_content', get_queried_object_id() ), tracy_site_inspiration() );
			$file = 'fixture' === $kind ? "assets/css/fixtures/$id.css" : null;
			if ( 'artifact' === $kind ) {
				$artifact = (string) get_post_meta( get_queried_object_id(), 'tracy_artifact', true );
				if ( in_array( $artifact, array( 'landing', 'form', 'typography' ), true ) ) {
					$file = "assets/css/artifacts/$artifact/$id.css";
				}
			}
			if ( null !== $file && preg_match( '/^[a-z0-9-]+$/', $id ) && file_exists( get_theme_file_path( $file ) ) ) {
				wp_enqueue_style( 'tracy-' . $kind, get_theme_file_uri( $file ), array(), $version );
			} elseif ( 'artifact' === $kind && isset( $artifact ) && null !== $file ) {
				// A look with no sheet of its own — a brand, made at build time under
				// uploads/tracy/styles (ADR 0023) — wears the theme-driven sheet: the same rules, its
				// varying properties read from the worn variation's variables. Those are printed here
				// (variables only, no element rule) because `global-styles` is dequeued below. Measured
				// 30/09 on `dfbrandwp1`: without it the home page rendered unstyled, `shot` 49/100.
				$generic = "assets/css/artifacts/$artifact/_theme.css";
				if ( file_exists( get_theme_file_path( $generic ) ) ) {
					wp_enqueue_style( 'tracy-' . $kind, get_theme_file_uri( $generic ), array(), $version );
					wp_add_inline_style( 'tracy-' . $kind, wp_get_global_stylesheet( array( 'variables' ) ) );
				}
			}
			wp_enqueue_style( 'tracy-fixture-page', get_theme_file_uri( 'assets/css/fixture-page.css' ), array(), $version );
			return;
		}
		wp_enqueue_style( 'tracy', get_theme_file_uri( 'assets/css/tracy.css' ), array(), $version );
		wp_enqueue_style( 'tracy-layout', get_theme_file_uri( 'assets/css/layout.css' ), array( 'tracy' ), $version );
		wp_enqueue_style( 'tracy-sections', get_theme_file_uri( 'assets/css/sections.css' ), array( 'tracy' ), $version );
		wp_enqueue_script( 'tracy', get_theme_file_uri( 'assets/js/tracy.js' ), array(), $version, array( 'in_footer' => true ) );
	}
);

// The head marker that hides what is about to animate, set synchronously so no element flashes
// visible before the deferred library runs. Priority 1 because core prints stylesheets at
// `wp_head` 8: the marker is on the root element before tracy-motion.css arrives. The partial is
// generated by packages/cms/tracy-cms-motion — do not edit it by hand.
add_action(
	'wp_head',
	function (): void {
		if ( array() !== tracy_motion_effects() ) {
			require __DIR__ . '/inc/motion-head.php';
		}
	},
	1
);

// A visitor's ?style= preview: the asked variation's variables and presets, printed after the
// site's global styles so they win, computed for this request only — nothing is cached or
// written. Same origin as global styles, later in the document, same selectors.
add_action(
	'wp_enqueue_scripts',
	function (): void {
		$requested = tracy_requested_style();
		if ( null === $requested || $requested === tracy_site_inspiration() ) {
			return;
		}
		if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
			return;
		}
		$variation = wp_json_file_decode( get_theme_file_path( "styles/$requested.json" ), array( 'associative' => true ) );
		if ( ! is_array( $variation ) ) {
			return;
		}
		unset( $variation['$schema'], $variation['title'] );
		$css = ( new WP_Theme_JSON( $variation, 'theme' ) )->get_stylesheet( array( 'variables', 'presets' ) );
		if ( '' === $css ) {
			return;
		}
		wp_register_style( 'tracy-style-preview', false, array(), wp_get_theme()->get( 'Version' ) );
		wp_enqueue_style( 'tracy-style-preview' );
		wp_add_inline_style( 'tracy-style-preview', $css );
	},
	20
);

// The fixture's words are the design system's own (or the customer's, poured by slot): no
// texturize — `--*` must not become an en dash, a straight quote must not curl — or the page
// stops matching the preview pixel for pixel.
add_action(
	'wp',
	function (): void {
		if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
			add_filter( 'run_wptexturize', '__return_false' );
		}
	}
);

/**
 * A design page (fixture, artifact) loads only its own sheets: the core and global styles go.
 *
 * On a block theme WordPress prints Customizer › Additional CSS (the `custom_css` post) inside the
 * `global-styles` inline sheet and takes `wp_custom_css_cb` off `wp_head` (WordPress 7.1.3,
 * `wp_enqueue_global_styles`), so dequeuing `global-styles` silently dropped the site's Additional
 * CSS from every design page — the seeded home page among them (TracyHQ/tch#1710). It is the site
 * owner's CSS, not WordPress's element rules, so it is handed back to WordPress's own printer: a
 * `<style id="wp-custom-css">` at `wp_head` 101, after every sheet of the page.
 */
function tracy_design_page_styles(): void {
	if ( ! in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return;
	}
	foreach ( array( 'wp-block-library', 'wp-block-library-theme', 'global-styles', 'classic-theme-styles', 'core-block-supports', 'wp-emoji-styles' ) as $handle ) {
		wp_dequeue_style( $handle );
	}
	add_action( 'wp_head', 'wp_custom_css_cb', 101 );
}
add_action( 'wp_enqueue_scripts', 'tracy_design_page_styles', 100 );

add_action(
	'after_setup_theme',
	function (): void {
		add_editor_style( array( 'assets/css/tracy.css', 'assets/css/sections.css' ) );
		register_block_pattern_category( 'tracy', array( 'label' => 'Tracy sections' ) );
	}
);

/**
 * The contact form. WordPress has no contact component and, as of 7.1, no core form block that
 * submits (only `search` and `post-comments-form`), so where Joomla lets a template override
 * `com_contact` and keeps the sending, the theme has to do the sending itself. It does it the
 * WordPress way: the form posts to `admin-post.php`, the theme answers on `admin_post_nopriv_*`,
 * `wp_mail()` sends to the recipient the site was given, and the visitor comes back to the page
 * they were on with `?contact=sent` (or `failed`, or `invalid`).
 *
 * The markup is the section library's, so both CMS show the same form; the theme only fills in
 * what a live form needs — the action, the nonce, a honeypot, the page to return to — into any
 * form carrying the class `tracy-form--contact`, wherever it appears (a pattern, a seeded page, a
 * page the customer wrote).
 *
 * The marker is a class and not a data attribute on purpose: kses keeps `data-*` only on elements
 * whose allowed list carries `data-*`, and `form`'s does not. Measured 07/09 — a seeded page came
 * back from `wp post create` with `data-tracy-form` gone from the form tag while the same
 * attribute survived on a div, so a form marked that way is silently never wired.
 */
const TRACY_CONTACT_ACTION = 'tracy_contact';

/** What the page says after a send, when it comes back with `?contact=…`. */
function tracy_contact_notice(): string {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a status word, not an action.
	$state = isset( $_GET['contact'] ) ? sanitize_key( wp_unslash( (string) $_GET['contact'] ) ) : '';
	$says  = array(
		'sent'    => array( 'ok', __( 'Thank you — your message is on its way.', 'tracy' ) ),
		'failed'  => array( 'bad', __( 'The message could not be sent. Please try again, or write to us directly.', 'tracy' ) ),
		'invalid' => array( 'bad', __( 'Please fill in your name, a valid email address and a message.', 'tracy' ) ),
	);
	if ( ! isset( $says[ $state ] ) ) {
		return '';
	}
	return sprintf(
		'<p class="tracy-form__note tracy-form__note--%s" role="status">%s</p>',
		esc_attr( $says[ $state ][0] ),
		esc_html( $says[ $state ][1] )
	);
}

/** Make every `tracy-form--contact` in the content a live form. */
function tracy_wire_contact_form( string $html ): string {
	if ( ! str_contains( $html, 'tracy-form--contact' ) ) {
		return $html;
	}
	// `render_block` wires the block, then `the_content` sees the whole post — including what was
	// just wired. Without this the page carries two action fields, two honeypots and two nonces.
	if ( str_contains( $html, 'value="' . TRACY_CONTACT_ACTION . '"' ) ) {
		return $html;
	}
	$action = esc_url( admin_url( 'admin-post.php' ) );
	$html   = preg_replace_callback(
		'/<form\b[^>]*\btracy-form--contact\b[^>]*>/',
		static function ( array $m ) use ( $action ): string {
			return str_replace( 'action="#"', 'action="' . $action . '"', $m[0] );
		},
		$html
	);
	$hidden = sprintf(
		'<input type="hidden" name="action" value="%s">%s<p class="tracy-hp" aria-hidden="true" style="position:absolute;left:-9999px"><label>Leave this empty<input type="text" name="tracy_hp" tabindex="-1" autocomplete="off"></label></p><input type="hidden" name="tracy_return" value="%s">%s',
		esc_attr( TRACY_CONTACT_ACTION ),
		wp_nonce_field( TRACY_CONTACT_ACTION, '_tracy_nonce', true, false ),
		esc_url( get_permalink() ? get_permalink() : home_url( '/' ) ),
		tracy_contact_notice()
	);
	// The hidden fields go last, just inside the form.
	$at  = strpos( $html, 'tracy-form--contact' );
	$end = false === $at ? false : strpos( $html, '</form>', $at );
	return false === $end ? $html : substr_replace( $html, $hidden, $end, 0 );
}
add_filter( 'the_content', 'tracy_wire_contact_form', 20 );
add_filter(
	'render_block',
	function ( string $content, array $block ): string {
		return isset( $block['blockName'] ) && 'core/html' === $block['blockName']
			? tracy_wire_contact_form( $content )
			: $content;
	},
	20,
	2
);

add_action( 'admin_post_nopriv_' . TRACY_CONTACT_ACTION, 'tracy_contact_submit' );
add_action( 'admin_post_' . TRACY_CONTACT_ACTION, 'tracy_contact_submit' );

/** Validate, send with wp_mail, and go back to the page the form was on. */
function tracy_contact_submit(): void {
	$back = isset( $_POST['tracy_return'] ) ? esc_url_raw( wp_unslash( (string) $_POST['tracy_return'] ) ) : home_url( '/' );
	$go   = static function ( string $state ) use ( $back ): void {
		wp_safe_redirect( add_query_arg( 'contact', $state, $back ) . '#contact-form' );
		exit;
	};
	if ( ! isset( $_POST['_tracy_nonce'] ) || ! wp_verify_nonce( sanitize_key( wp_unslash( (string) $_POST['_tracy_nonce'] ) ), TRACY_CONTACT_ACTION ) ) {
		$go( 'invalid' );
	}
	// A bot fills every field it finds; a person never sees this one.
	if ( ! empty( $_POST['tracy_hp'] ) ) {
		$go( 'sent' );
	}
	$name    = isset( $_POST['contact_name'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['contact_name'] ) ) : '';
	$email   = isset( $_POST['contact_email'] ) ? sanitize_email( wp_unslash( (string) $_POST['contact_email'] ) ) : '';
	$subject = isset( $_POST['contact_subject'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['contact_subject'] ) ) : '';
	$message = isset( $_POST['contact_message'] ) ? sanitize_textarea_field( wp_unslash( (string) $_POST['contact_message'] ) ) : '';
	if ( '' === $name || ! is_email( $email ) || '' === $message ) {
		$go( 'invalid' );
	}
	/**
	 * Where the message goes: the address the customer gave when the site was built (the seeder
	 * writes it into `tracy_contact_to`), or the one a `tracy_contact_to` filter names. There is no
	 * fallback to the site's admin address: on a site Tracy built that is Tracy's own mailbox, not
	 * the customer's, so a form with no recipient says the message could not be sent.
	 */
	$to = get_option( 'tracy_contact_to' );
	$to = apply_filters( 'tracy_contact_to', is_string( $to ) && is_email( $to ) ? $to : '' );
	if ( ! is_string( $to ) || ! is_email( $to ) ) {
		$go( 'failed' );
	}
	try {
		$sent = wp_mail(
			$to,
			sprintf(
				/* translators: 1: the site's name, 2: the subject the visitor wrote */
				__( '[%1$s] %2$s', 'tracy' ),
				get_bloginfo( 'name' ),
				'' !== $subject ? $subject : __( 'Message from the contact form', 'tracy' )
			),
			sprintf( "%s\n\n— %s <%s>", $message, $name, $email ),
			array( 'Reply-To: ' . $name . ' <' . $email . '>' )
		);
	} catch ( \Throwable $e ) {
		// A mailer that throws has not sent anything.
		$sent = false;
	}
	$go( $sent ? 'sent' : 'failed' );
}

// A theme built from this one as a second target (overlays/<slug>/, see scripts/build.mjs) adds
// what is its own — chrome, blocks, pattern categories — in inc/extra.php. This source theme
// ships no such file, so the hook is inert here and the generated copy needs no edit to pick it
// up: the file's presence is the switch.
$tracy_extra = get_theme_file_path( 'inc/extra.php' );
if ( is_readable( $tracy_extra ) ) {
	require $tracy_extra;
}
unset( $tracy_extra );
