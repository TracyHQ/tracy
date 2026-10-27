<?php
/**
 * wp-tracy-business — what this target adds on top of the source theme: the chrome stylesheet
 * (top bar, two-row header, mega panel, footer grid, news cards, square buttons), the dark mode
 * switch, the mega menu block, the `wp-tracy-business` pattern category and the redirect rules.
 * Loaded by the generic hook at the end of functions.php (the source theme has no inc/extra.php,
 * so it is inert there).
 *
 * Functions here carry the `wp_tracy_business_` prefix; the shared `tracy_*` helpers of
 * functions.php (tracy_page_kind() and friends) are already defined when this file runs.
 *
 * @package wp-tracy-business
 */

defined( 'ABSPATH' ) || exit;

// The site's identity: one option, its tokens replaced in every page on the way out. Loaded from
// here because functions.php (a copy of the source theme's) pulls in exactly this file.
require __DIR__ . '/identity.php';

/**
 * The chrome assets. The design pages (fixture, artifact) render a design system's own markup
 * under its own stylesheet and dequeue the theme's; nothing here belongs on them either.
 */
function wp_tracy_business_enqueue_assets(): void {
	if ( in_array( tracy_page_kind(), array( 'fixture', 'artifact' ), true ) ) {
		return;
	}
	$version = wp_get_theme()->get( 'Version' );
	// The webfonts first: theme.json names Newsreader and Archivo, and without a face declared for
	// them every heading fell to Times and every label to system-ui (visual-qa 14/09, all 12 pages).
	// Served from the theme's assets/fonts; nothing is fetched from a font CDN.
	wp_enqueue_style( 'wp-tracy-business-fonts', get_theme_file_uri( 'assets/css/wp-tracy-business-fonts.css' ), array(), $version );
	wp_enqueue_style( 'wp-tracy-business', get_theme_file_uri( 'assets/css/wp-tracy-business.css' ), array( 'wp-tracy-business-fonts', 'tracy', 'tracy-layout' ), $version );
	// Extra section styles, when the pattern set ships them; the file is optional by design.
	if ( is_readable( get_theme_file_path( 'assets/css/sections-extra.css' ) ) ) {
		wp_enqueue_style( 'wp-tracy-business-sections-extra', get_theme_file_uri( 'assets/css/sections-extra.css' ), array( 'tracy-sections' ), $version );
	}
	// In the head, blocking, on purpose: it resolves the theme before the first paint, so a
	// visitor who chose dark never sees a light frame. It is a few hundred bytes.
	wp_enqueue_script( 'wp-tracy-business-dark', get_theme_file_uri( 'assets/js/wp-tracy-business-dark.js' ), array(), $version, array( 'in_footer' => false ) );
	wp_enqueue_script( 'wp-tracy-business-mega', get_theme_file_uri( 'assets/js/wp-tracy-business-mega.js' ), array(), $version, array( 'strategy' => 'defer' ) );
	// Registered, not enqueued: only a page that actually renders a switcher needs it, and the
	// filter that renders one enqueues it there.
	wp_register_script( 'wp-tracy-business-lang', get_theme_file_uri( 'assets/js/wp-tracy-business-lang.js' ), array(), $version, array( 'strategy' => 'defer' ) );
}
add_action( 'wp_enqueue_scripts', 'wp_tracy_business_enqueue_assets', 11 );

/**
 * `?theme=dark|light` decides by its FIRST value (assets/js/wp-tracy-business-dark.js). WordPress's canonical
 * redirect rebuilds the query from a parsed copy in which a repeated key keeps its LAST value, so
 * `?theme=dark&theme=light` would be sent to `?theme=light` before any script runs. Cancelled only when normalising the repeated key changes the
 * first value; any other redirect (host, scheme, port, path, fragment, other parameters) is left alone.
 *
 * @param string|false $redirect_url  The address WordPress wants to send the visitor to.
 * @param string       $requested_url The address that was asked for.
 * @return string|false
 */
function wp_tracy_business_keep_first_theme_value( $redirect_url, $requested_url ) {
	if ( ! is_string( $redirect_url ) || ! is_string( $requested_url ) ) {
		return $redirect_url;
	}
	$asked  = wp_parse_url( $requested_url );
	$wanted = wp_parse_url( $redirect_url );
	if ( ! is_array( $asked ) || ! is_array( $wanted ) ) {
		return $redirect_url;
	}
	$asked_query  = isset( $asked['query'] ) ? (string) $asked['query'] : '';
	$wanted_query = isset( $wanted['query'] ) ? (string) $wanted['query'] : '';
	unset( $asked['query'], $wanted['query'] );
	// Scheme, host, port, path or fragment differ: that redirect is not about `theme`.
	if ( $asked !== $wanted ) {
		return $redirect_url;
	}
	// Split like URLSearchParams: pairs in order, cut at the first "=", key and value decoded.
	$split = static function ( $query ) {
		$theme = array();
		$other = array();
		foreach ( explode( '&', $query ) as $pair ) {
			if ( '' === $pair ) {
				continue;
			}
			$parts = explode( '=', $pair, 2 );
			if ( 'theme' === urldecode( $parts[0] ) ) {
				$theme[] = urldecode( isset( $parts[1] ) ? $parts[1] : '' );
			} else {
				$other[] = $pair;
			}
		}
		return array( $theme, $other );
	};
	list( $asked_theme, $asked_other )   = $split( $asked_query );
	list( $wanted_theme, $wanted_other ) = $split( $wanted_query );
	if ( count( $asked_theme ) < 2 || $asked_other !== $wanted_other ) {
		return $redirect_url;
	}
	$override = static function ( $values ) {
		return ( isset( $values[0] ) && in_array( $values[0], array( 'dark', 'light' ), true ) ) ? $values[0] : '';
	};
	if ( $override( $asked_theme ) === $override( $wanted_theme ) ) {
		return $redirect_url;
	}
	return false;
}
add_filter( 'redirect_canonical', 'wp_tracy_business_keep_first_theme_value', 20, 2 );

/**
 * The theme's own translations, `languages/<locale>.l10n.php` — WordPress's PHP translation format,
 * read by load_textdomain() without a `.mo` beside it. On a front-end page Polylang has already
 * switched the locale to the page language when this runs, so every `wp-tracy-business` string
 * resolves in that language. A locale with no file stays English.
 */
function wp_tracy_business_textdomain(): void {
	load_theme_textdomain( 'wp-tracy-business', get_template_directory() . '/languages' );
}
add_action( 'after_setup_theme', 'wp_tracy_business_textdomain' );

/**
 * The fixed English words the theme prints — header, footer, sidebars, and the 404, news, article
 * and search templates — each with its translation in the page language. The words are typed in
 * block markup — the theme's files and the database rows that shadow them — where no translation
 * call can reach, so they are swapped on the rendered markup instead (below), the way the
 * navigation swaps menus. A word the site owner has rewritten no longer matches and stays as written.
 *
 * @return array<string,string> English word => the page language's.
 */
function wp_tracy_business_fixed_words(): array {
	return array(
		// Top bar.
		'Hotline:'                       => __( 'Hotline:', 'wp-tracy-business' ),
		'Dark'                           => __( 'Dark', 'wp-tracy-business' ),
		'Light'                          => __( 'Light', 'wp-tracy-business' ),
		// Header: the mega menu, search and call to action.
		'Resources'                      => __( 'Resources', 'wp-tracy-business' ),
		'Marketing kit'                  => __( 'Marketing kit', 'wp-tracy-business' ),
		'Newsletter'                     => __( 'Newsletter', 'wp-tracy-business' ),
		'Digest email template'          => __( 'Digest email template', 'wp-tracy-business' ),
		'Email'                          => __( 'Email', 'wp-tracy-business' ),
		'Transactional emails'           => __( 'Transactional emails', 'wp-tracy-business' ),
		'Form'                           => __( 'Form', 'wp-tracy-business' ),
		'Form and state library'         => __( 'Form and state library', 'wp-tracy-business' ),
		'Slide'                          => __( 'Slide', 'wp-tracy-business' ),
		'Slide and presentation library' => __( 'Slide and presentation library', 'wp-tracy-business' ),
		'Style guide'                    => __( 'Style guide', 'wp-tracy-business' ),
		'Module positions, type scale'   => __( 'Module positions, type scale', 'wp-tracy-business' ),
		'Error page'                     => __( 'Error page', 'wp-tracy-business' ),
		'Recent projects'                => __( 'Recent projects', 'wp-tracy-business' ),
		'Elektra plant, Lipetsk SEZ'     => __( 'Elektra plant, Lipetsk SEZ', 'wp-tracy-business' ),
		'62,000 m² · 2025'               => __( '62,000 m² · 2025', 'wp-tracy-business' ),
		'Vorsino IP, phase 3'            => __( 'Vorsino IP, phase 3', 'wp-tracy-business' ),
		'48 ha · 2024'                   => __( '48 ha · 2024', 'wp-tracy-business' ),
		'110 kV Obninsk-2 substation'    => __( '110 kV Obninsk-2 substation', 'wp-tracy-business' ),
		'Utilities · 2024'               => __( 'Utilities · 2024', 'wp-tracy-business' ),
		'Zavolzhye logistics building'   => __( 'Zavolzhye logistics building', 'wp-tracy-business' ),
		'24,000 m² · 2023'               => __( '24,000 m² · 2023', 'wp-tracy-business' ),
		'News & updates'                 => __( 'News & updates', 'wp-tracy-business' ),
		'No news published yet.'         => __( 'No news published yet.', 'wp-tracy-business' ),
		'All resources →'                => __( 'All resources →', 'wp-tracy-business' ),
		'Search'                         => __( 'Search', 'wp-tracy-business' ),
		'Search the site'                => __( 'Search the site', 'wp-tracy-business' ),
		'Request a quote'                => __( 'Request a quote', 'wp-tracy-business' ),
		// Footer.
		'Services'                       => __( 'Services', 'wp-tracy-business' ),
		'Industrial park infrastructure' => __( 'Industrial park infrastructure', 'wp-tracy-business' ),
		'Pre-engineered buildings'       => __( 'Pre-engineered buildings', 'wp-tracy-business' ),
		'M&E engineering'                => __( 'M&E engineering', 'wp-tracy-business' ),
		'Maintenance & retrofit'         => __( 'Maintenance & retrofit', 'wp-tracy-business' ),
		'Company'                        => __( 'Company', 'wp-tracy-business' ),
		'Contact'                        => __( 'Contact', 'wp-tracy-business' ),
		'Sitemap'                        => __( 'Sitemap', 'wp-tracy-business' ),
		// Search page.
		'Nothing matched.'               => __( 'Nothing matched.', 'wp-tracy-business' ),
		'Keyword'                        => __( 'Keyword', 'wp-tracy-business' ),
		// 404 template, and the words of the draft 404 page it draws.
		'Page not found'                 => __( 'Page not found', 'wp-tracy-business' ),
		'The page may have moved, or the address may be mistyped. Try a search, or start from the home page.' => __( 'The page may have moved, or the address may be mistyped. Try a search, or start from the home page.', 'wp-tracy-business' ),
		'← Back to home'                 => __( '← Back to home', 'wp-tracy-business' ),
		'We could not find that page'    => __( 'We could not find that page', 'wp-tracy-business' ),
		'The link may have changed or the content has been archived. Try a search, or pick one of the sections below.' => __( 'The link may have changed or the content has been archived. Try a search, or pick one of the sections below.', 'wp-tracy-business' ),
		'You may be looking for'         => __( 'You may be looking for', 'wp-tracy-business' ),
		'Capability statement 2026'      => __( 'Capability statement 2026', 'wp-tracy-business' ),
		'Completed project index'        => __( 'Completed project index', 'wp-tracy-business' ),
		'Maintenance service rates'      => __( 'Maintenance service rates', 'wp-tracy-business' ),
		'Site engineer vacancies'        => __( 'Site engineer vacancies', 'wp-tracy-business' ),
		// News index, category pages and the article.
		'News'                           => __( 'News', 'wp-tracy-business' ),
		'Updates and notes from the team.' => __( 'Updates and notes from the team.', 'wp-tracy-business' ),
		'All'                            => __( 'All', 'wp-tracy-business' ),
		'Featured ·'                     => __( 'Featured ·', 'wp-tracy-business' ),
		'Nothing here yet.'              => __( 'Nothing here yet.', 'wp-tracy-business' ),
		'Tags:'                          => __( 'Tags:', 'wp-tracy-business' ),
		'← Previous'                     => __( '← Previous', 'wp-tracy-business' ),
		'Next →'                         => __( 'Next →', 'wp-tracy-business' ),
		'Related articles'               => __( 'Related articles', 'wp-tracy-business' ),
		'Share on LinkedIn'              => __( 'Share on LinkedIn', 'wp-tracy-business' ),
		'Share on Facebook'              => __( 'Share on Facebook', 'wp-tracy-business' ),
		'Copy link'                      => __( 'Copy link', 'wp-tracy-business' ),
		// Sidebars: news, search, article.
		'Enter a keyword…'               => __( 'Enter a keyword…', 'wp-tracy-business' ),
		'Categories'                     => __( 'Categories', 'wp-tracy-business' ),
		'Latest articles'                => __( 'Latest articles', 'wp-tracy-business' ),
		'Get our industry brief every two weeks' => __( 'Get our industry brief every two weeks', 'wp-tracy-business' ),
		'Tender news, material price movements and engineering notes.' => __( 'Tender news, material price movements and engineering notes.', 'wp-tracy-business' ),
		'Work email'                     => __( 'Work email', 'wp-tracy-business' ),
		'Subscribe'                      => __( 'Subscribe', 'wp-tracy-business' ),
		'Filter by section'              => __( 'Filter by section', 'wp-tracy-business' ),
		'Pages'                          => __( 'Pages', 'wp-tracy-business' ),
		'Popular searches'               => __( 'Popular searches', 'wp-tracy-business' ),
		// The four chips are the EmDash edition's per-language terms, not word-for-word translations.
		'quote'                          => _x( 'quote', 'popular search', 'wp-tracy-business' ),
		'ISO 45001'                      => _x( 'ISO 45001', 'popular search', 'wp-tracy-business' ),
		'M&E'                            => _x( 'M&E', 'popular search', 'wp-tracy-business' ),
		'careers'                        => _x( 'careers', 'popular search', 'wp-tracy-business' ),
		'In this article'                => __( 'In this article', 'wp-tracy-business' ),
		'Downloads'                      => __( 'Downloads', 'wp-tracy-business' ),
		'Need advice on your next project?' => __( 'Need advice on your next project?', 'wp-tracy-business' ),
		'Our engineering team reviews your first set of drawings free of charge.' => __( 'Our engineering team reviews your first set of drawings free of charge.', 'wp-tracy-business' ),
		'Send a request'                 => __( 'Send a request', 'wp-tracy-business' ),
	);
}

/**
 * The locale of the page being read. Contact Form 7 draws a form in the form's own locale — the
 * shared forms are English (`en_US`) — and, where WordPress has its own files for the page
 * language, it switches the whole locale to English while it draws: determine_locale() and every
 * `wp-tracy-business` translation call then answer English inside the form. Polylang's page
 * language does not move with that switch. Without Polylang the page language is the site's.
 */
function wp_tracy_business_page_locale(): string {
	$locale = function_exists( 'pll_current_language' ) ? (string) pll_current_language( 'locale' ) : '';
	return '' !== $locale ? $locale : determine_locale();
}

/**
 * One locale's entries in the theme's own translation file, read from the file rather than through
 * a translation call, so a form drawn under Contact Form 7's locale switch still gets the page
 * language's words. Empty for a locale with no file, or for a name that is not a locale.
 *
 * @return array<string,string> English (a context and "\4" before it, when it has one) => translated.
 */
function wp_tracy_business_translations( string $locale ): array {
	static $files = array();
	if ( ! preg_match( '/^[a-z]{2,3}(?:_[A-Z]{2})?$/', $locale ) ) {
		return array();
	}
	if ( ! isset( $files[ $locale ] ) ) {
		$file              = get_theme_file_path( 'languages/' . $locale . '.l10n.php' );
		$data              = is_readable( $file ) ? include $file : array();
		$files[ $locale ] = is_array( $data['messages'] ?? null ) ? $data['messages'] : array();
	}
	return $files[ $locale ];
}

/**
 * The Contact form's fixed words in the page language. Every language's Contact page embeds the
 * one shared English form, and its words are swapped into the page language while it is drawn
 * (below): labels, buttons, the upload, hint and consent lines, the neutral request types, the
 * company placeholder and the description hint; plus the form's sent / error messages by Contact
 * Form 7 key (`mail_sent_ng` and `spam` share one sentence). The name, email and phone
 * placeholders are not here: they stay the demo's in every language.
 *
 * @return array{words: array<string,string>, messages: array<string,string>} English => translated; key => translated.
 */
function wp_tracy_business_form_words(): array {
	$in     = wp_tracy_business_translations( wp_tracy_business_page_locale() );
	$t      = static fn( string $english, string $context = '' ): string => $in[ ( '' === $context ? '' : $context . "\4" ) . $english ] ?? $english;
	$failed = $t( 'There was an error trying to send your message. Please try again later.' );
	return array(
		'words'    => array(
			'Full name *'           => $t( 'Full name *' ),
			'Company'               => $t( 'Company', 'form label' ),
			'Company name'          => $t( 'Company name' ),
			'Email *'               => $t( 'Email *' ),
			'Phone'                 => $t( 'Phone' ),
			'Request type *'        => $t( 'Request type *' ),
			'Project description *' => $t( 'Project description *' ),
			'Drag drawings here, or click to choose files' => $t( 'Drag drawings here, or click to choose files' ),
			// File-type names stay as they are in every language.
			'PDF, DWG, ZIP, JPG, PNG, Word, Excel · 25 MB max' => $t( 'PDF, DWG, ZIP, JPG, PNG, Word, Excel · 25 MB max' ),
			'I consent to the processing of personal data under Federal Law 152-FZ.' => $t( 'I consent to the processing of personal data under Federal Law 152-FZ.' ),
			'Send request'          => $t( 'Send request' ),
			'Clear form'            => $t( 'Clear form' ),
			'Quote request'         => $t( 'Quote request' ),
			'Consultation'          => $t( 'Consultation' ),
			'Support'               => $t( 'Support' ),
			'Other'                 => $t( 'Other' ),
			'Tell us what you need…' => $t( 'Tell us what you need…' ),
		),
		'messages' => array(
			'mail_sent_ok'             => $t( 'Thank you for your message. It has been sent.' ),
			'mail_sent_ng'             => $failed,
			'validation_error'         => $t( 'One or more fields have an error. Please check and try again.' ),
			'spam'                     => $failed,
			'accept_terms'             => $t( 'You must accept the terms and conditions before sending your message.' ),
			'invalid_required'         => $t( 'Please fill out this field.' ),
			'invalid_too_long'         => $t( 'This field has a too long input.' ),
			'invalid_too_short'        => $t( 'This field has a too short input.' ),
			'upload_failed'            => $t( 'There was an unknown error uploading the file.' ),
			'upload_file_type_invalid' => $t( 'You are not allowed to upload files of this type.' ),
			'upload_file_too_large'    => $t( 'The uploaded file is too large.' ),
			'upload_failed_php_error'  => $t( 'There was an error uploading the file.' ),
		),
	);
}

/**
 * The page's locale, carried in every Contact Form 7 form as a hidden field: a form is sent to
 * the REST API, where nothing else says which language the visitor was reading. The field is
 * written while the form is drawn, under Contact Form 7's locale switch, hence the page locale
 * rather than the current one.
 *
 * @param array $fields The form's hidden fields.
 * @return array
 */
function wp_tracy_business_form_locale( array $fields ): array {
	$fields['_wtb_locale'] = wp_tracy_business_page_locale();
	return $fields;
}
add_filter( 'wpcf7_form_hidden_fields', 'wp_tracy_business_form_locale' );

/**
 * A form's sent / error message in the language of the page it was sent from — the news
 * sidebar's newsletter form is one English form on every language's page. The message is looked
 * up in the theme's own translation file for that locale (the one the hidden field names, else
 * the page's); a message the owner wrote, or one already in another language, has no entry and
 * stays as written.
 *
 * @param mixed $message The message Contact Form 7 is about to show.
 * @return mixed
 */
function wp_tracy_business_form_message( $message ) {
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- read-only choice of a translation; Contact Form 7 checks the submission itself.
	$locale = isset( $_POST['_wtb_locale'] ) ? (string) wp_unslash( $_POST['_wtb_locale'] ) : wp_tracy_business_page_locale();
	if ( ! is_string( $message ) ) {
		return $message;
	}
	return wp_tracy_business_translations( $locale )[ $message ] ?? $message;
}
add_filter( 'wpcf7_display_message', 'wp_tracy_business_form_message' );

/**
 * Swaps the fixed words in rendered markup: a text node whose whole text (trimmed) is one of them,
 * and the attributes a reader hears or sees in place of text. Whole-text matches only, so "Form"
 * never rewrites "Form and state library", and a sentence that merely contains a word is left alone.
 *
 * @param string                    $html  Rendered markup.
 * @param array<string,string>|null $words English => translated; the theme's fixed words when null.
 * @return string
 */
function wp_tracy_business_translate_markup( string $html, ?array $words = null ): string {
	$words = array_filter( $words ?? wp_tracy_business_fixed_words(), static fn( string $to, string $from ): bool => $to !== $from, ARRAY_FILTER_USE_BOTH );
	if ( ! $words ) {
		return $html;
	}
	$lookup = static function ( string $raw ) use ( $words ): ?string {
		$word = trim( html_entity_decode( $raw, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
		return $words[ $word ] ?? null;
	};
	$html = (string) preg_replace_callback(
		'/>(\s*)([^<]*?)(\s*)</',
		static function ( array $m ) use ( $lookup ): string {
			$to = '' === $m[2] ? null : $lookup( $m[2] );
			return null === $to ? $m[0] : '>' . $m[1] . esc_html( $to ) . $m[3] . '<';
		},
		$html
	);
	$attribute = static function ( array $m ) use ( $lookup ): string {
		$to = $lookup( $m[2] );
		return null === $to ? $m[0] : $m[1] . esc_attr( $to ) . $m[3];
	};
	$html      = (string) preg_replace_callback( '/(\s(?:aria-label|placeholder|title|data-text-dark|data-text-light)=")([^"]*)(")/', $attribute, $html );
	// A submit button's label is its value (the newsletter form's "Subscribe"); no other value is a word.
	return (string) preg_replace_callback( '/(<input\b(?=[^>]*\btype="submit")[^>]*?\svalue=")([^"]*)(")/', $attribute, $html );
}

// The header and footer (and the sidebars — template parts too) are swapped once, rendered whole;
// the search page's "Nothing matched." sits in the template itself, not in a part.
add_filter( 'render_block_core/template-part', 'wp_tracy_business_translate_markup' );
add_filter( 'render_block_core/query-no-results', 'wp_tracy_business_translate_markup' );

/**
 * The Contact form's words in the page language. The form sits in the Contact page's own content,
 * which the theme never swaps; Contact Form 7 hands over the form alone, so only its words move —
 * a radio's submitted value stays English, only the label beside it changes.
 *
 * @param string $elements The rendered form.
 * @return string
 */
function wp_tracy_business_form_elements( string $elements ): string {
	return wp_tracy_business_translate_markup( $elements, wp_tracy_business_form_words()['words'] );
}
add_filter( 'wpcf7_form_elements', 'wp_tracy_business_form_elements' );

/**
 * The news sidebar's subscribe form. It is a `core/shortcode` block named `news.subscribe.form`
 * inside the `sidebar-news` pattern, and WordPress runs shortcodes over a template and over a
 * post's content, never over a pattern rendered inside a template part: the card printed
 * `[contact-form-7 title="Newsletter"]` as text on /news and on every category page (15/10/2026).
 * The block runs its own shortcode. When Contact Form 7 is missing or has no form of that title
 * the block renders nothing and the card it sits in is left out (wp_tracy_business_subscribe_card):
 * a subscribe call with no field to subscribe in is a dead end.
 *
 * @param string $content The rendered block (the shortcode text, through wpautop).
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_tracy_business_subscribe_form( string $content, array $block ): string {
	if ( 'news.subscribe.form' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) {
		return $content;
	}
	$html = shortcode_exists( 'contact-form-7' ) ? do_shortcode( shortcode_unautop( $content ) ) : '';
	if ( ! str_contains( $html, 'wpcf7' ) ) {
		wp_tracy_business_subscribe_missing( true );
		return '';
	}
	return $html;
}
add_filter( 'render_block_core/shortcode', 'wp_tracy_business_subscribe_form', 10, 2 );

/**
 * Whether the subscribe form of the card being drawn rendered nothing. Read and reset by the card.
 *
 * @param bool|null $set true when the form is missing; null to read and reset.
 */
function wp_tracy_business_subscribe_missing( ?bool $set = null ): bool {
	static $missing = false;
	if ( null !== $set ) {
		$missing = $set;
		return $missing;
	}
	$was     = $missing;
	$missing = false;
	return $was;
}

/**
 * The subscribe card (`tracy-aside__subscribe`) is left out when its form rendered nothing.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_tracy_business_subscribe_card( string $content, array $block ): string {
	if ( ! preg_match( '/(^|\s)tracy-aside__subscribe(\s|$)/', (string) ( $block['attrs']['className'] ?? '' ) ) ) {
		return $content;
	}
	return wp_tracy_business_subscribe_missing() ? '' : $content;
}
add_filter( 'render_block_core/group', 'wp_tracy_business_subscribe_card', 10, 2 );

/**
 * The Contact card's four labels in the page language. The card sits in the Contact page's own
 * content: each row carries the identity field it shows (`data-tracy-identity`) and its value as
 * identity tokens, so `inc/identity.php` fills it from the one store the header and footer read
 * and drops a row whose field is empty, and the card when all four are. Its labels are the theme's words.
 *
 * @param string $content The rendered paragraph.
 * @return string
 */
function wp_tracy_business_contact_labels( string $content ): string {
	if ( ! str_contains( $content, 'wtb-contact__label' ) ) {
		return $content;
	}
	return wp_tracy_business_translate_markup(
		$content,
		array(
			'Address'      => __( 'Address', 'wp-tracy-business' ),
			'Hotline'      => __( 'Hotline', 'wp-tracy-business' ),
			'Email'        => _x( 'Email', 'contact label', 'wp-tracy-business' ),
			'Office hours' => __( 'Office hours', 'wp-tracy-business' ),
		)
	);
}
add_filter( 'render_block_core/paragraph', 'wp_tracy_business_contact_labels' );

/**
 * How deep the render is inside a post's own content (`core/post-content`): 0 while drawing the
 * templates. `$step` moves it — +1 as a post-content block starts, -1 once it is drawn.
 */
function wp_tracy_business_in_content( int $step = 0 ): int {
	static $depth = 0;
	$depth = max( 0, $depth + $step );
	return $depth;
}
add_filter(
	'render_block_data',
	static function ( array $parsed ): array {
		if ( 'core/post-content' === ( $parsed['blockName'] ?? '' ) ) {
			wp_tracy_business_in_content( 1 );
		}
		return $parsed;
	}
);
add_filter(
	'render_block_core/post-content',
	static function ( string $content ): string {
		wp_tracy_business_in_content( -1 );
		return $content;
	},
	0
);

/**
 * The fixed words the templates themselves print — the 404, news, article and search pages:
 * headings, lines, buttons, the search form, a term list's prefix, the previous / next labels,
 * the share buttons. Swapped block by block, but never inside a post's own content: a customer's
 * page that says "News" is the customer's word, not the theme's. The draft 404 page is drawn by
 * the theme (below), not as post content, so its words are the theme's to swap as well.
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_tracy_business_template_words( string $content, array $block ): string {
	static $kinds = array( 'core/heading', 'core/paragraph', 'core/button', 'core/search', 'core/post-terms', 'core/post-navigation-link', 'core/html' );
	if ( wp_tracy_business_in_content() > 0 || ! in_array( $block['blockName'] ?? '', $kinds, true ) ) {
		return $content;
	}
	return wp_tracy_business_translate_markup( $content );
}
add_filter( 'render_block', 'wp_tracy_business_template_words', 10, 2 );

/**
 * The search sidebar's "Popular searches" chips: each one searches the word it shows — after the
 * swap above, the page language's word — in the page language's site.
 *
 * @param string $content The rendered paragraph.
 * @return string
 */
function wp_tracy_business_popular_searches( string $content ): string {
	if ( ! str_contains( $content, 'href="/?s=' ) ) {
		return $content;
	}
	$home = function_exists( 'pll_home_url' ) ? (string) pll_home_url( wp_tracy_business_lang() ) : home_url( '/' );
	return (string) preg_replace_callback(
		'/href="\/\?s=[^"]*"([^>]*)>([^<]*)</',
		static fn( array $m ): string => 'href="' . esc_url( add_query_arg( 's', rawurlencode( html_entity_decode( trim( $m[2] ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ), $home ) ) . '"' . $m[1] . '>' . $m[2] . '<',
		$content
	);
}
add_filter( 'render_block_core/paragraph', 'wp_tracy_business_popular_searches' );

/**
 * A root-relative link typed into the header or footer (`/contact/`, `/news/`) as the same page in
 * the page language. The typed path names a page in whichever language it was written for;
 * Polylang's translation of that page in the page language is where the link goes. A page with no
 * translation keeps its own address — a page in another language beats a dead end — and a path
 * that is no published page (the kit's `/404/`, whose page is a draft on purpose) stays the same
 * path under the page language's home, so it still answers in that language. No Polylang: as typed.
 *
 * @param string $href A root-relative link, query and fragment allowed.
 * @return string
 */
function wp_tracy_business_localize_href( string $href ): string {
	static $done = array();
	if ( ! function_exists( 'pll_get_post' ) || ! function_exists( 'pll_home_url' ) || ! preg_match( '~^/(?!/)~', $href ) ) {
		return $href;
	}
	$lang = wp_tracy_business_lang();
	if ( isset( $done[ $lang ][ $href ] ) ) {
		return $done[ $lang ][ $href ];
	}
	$rest = (string) strpbrk( $href, '?#' );
	$path = trim( substr( $href, 0, strlen( $href ) - strlen( $rest ) ), '/' );
	$to   = null;
	$page = '' === $path ? null : get_page_by_path( $path );
	// A path that already names a language (`/en/contact/`, typed by the owner) is left as typed.
	if ( ! $page && function_exists( 'pll_languages_list' ) && in_array( strtok( $path, '/' ), (array) pll_languages_list( array( 'fields' => 'slug' ) ), true ) ) {
		$to = substr( $href, 0, strlen( $href ) - strlen( $rest ) );
	}
	if ( $page instanceof WP_Post ) {
		$id = (int) pll_get_post( $page->ID, $lang );
		if ( $id && 'publish' === get_post_status( $id ) ) {
			$to = get_permalink( $id );
		} elseif ( ! $id && 'publish' === $page->post_status ) {
			$to = get_permalink( $page );
		}
	}
	if ( ! is_string( $to ) || '' === $to ) {
		$to = trailingslashit( (string) pll_home_url( $lang ) ) . ( '' === $path ? '' : $path . '/' );
	}
	$done[ $lang ][ $href ] = $to . $rest;
	return $done[ $lang ][ $href ];
}

/**
 * Every root-relative link of the header and footer, rendered whole (the theme's part files and
 * the database rows that shadow them alike), sent to the page language's copy of its page.
 *
 * @param string $content The rendered template part.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_tracy_business_localize_links( string $content, array $block ): string {
	if ( ! function_exists( 'pll_get_post' ) || ! in_array( $block['attrs']['slug'] ?? '', array( 'header', 'footer' ), true ) ) {
		return $content;
	}
	return (string) preg_replace_callback(
		'/(\shref=")(\/(?!\/)[^"]*)(")/',
		static fn( array $m ): string => $m[1] . esc_url( wp_tracy_business_localize_href( html_entity_decode( $m[2], ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) ) . $m[3],
		$content
	);
}
add_filter( 'render_block_core/template-part', 'wp_tracy_business_localize_links', 10, 2 );

/** The page language's slug: Polylang's, "en" without it. */
function wp_tracy_business_lang(): string {
	$lang = function_exists( 'pll_current_language' ) ? (string) pll_current_language( 'slug' ) : '';
	return '' !== $lang ? $lang : 'en';
}

/** Puts `$html` inside a rendered block's outer element, in place of what it held. */
function wp_tracy_business_fill( string $content, string $html ): string {
	return (string) preg_replace_callback(
		'/^(\s*<([a-z][a-z0-9]*)\b[^>]*>).*(<\/\2>\s*)$/s',
		static fn( array $m ): string => $m[1] . $html . $m[3],
		$content
	);
}

/** The mega menu block and the pattern category the overlay's patterns file under. */
function wp_tracy_business_register(): void {
	// Guarded: register_block_type() given a path that does not exist treats it as a block NAME
	// and logs a notice on every request; a theme copied without its blocks/ directory (a
	// half-built zip, measured 13/09 on tracy-base) would otherwise be noisy instead of merely
	// lacking the block.
	if ( is_readable( get_theme_file_path( 'blocks/mega-menu/block.json' ) ) ) {
		register_block_type( get_theme_file_path( 'blocks/mega-menu' ) );
	}
	register_block_pattern_category( 'wp-tracy-business', array( 'label' => __( 'Tracy Business', 'wp-tracy-business' ) ) );
}
add_action( 'init', 'wp_tracy_business_register' );

/**
 * The header is a bar under a top bar, as the Northgate source's is, and the heroes are split
 * sections that carry their own colour. theme.config.json already says nav `top-left` and hero
 * `split`, and functions.php reads the same pair back from the options tracy_apply_inspiration()
 * wrote — but an option edited by hand, or a site whose inspiration was applied before this
 * target existed, would put another geometry on the body. The body classes are the only switch,
 * so both are pinned here, after the source theme's filter.
 *
 * @param string[] $classes The body classes, with the source theme's already added.
 * @return string[]
 */
function wp_tracy_business_body_class( array $classes ): array {
	$navs      = array_map( static fn( string $nav ): string => 'tracy-nav-' . $nav, TRACY_NAVS );
	$heros     = array_map( static fn( string $hero ): string => 'tracy-hero-' . $hero, TRACY_HEROS );
	$classes   = array_values( array_diff( $classes, $navs, $heros ) );
	$classes[] = 'tracy-nav-top-left';
	$classes[] = 'tracy-hero-split';
	return $classes;
}
add_filter( 'body_class', 'wp_tracy_business_body_class', 11 );

/**
 * front-page.html is a section stack for the static page the seeder makes the front page. Until
 * that page exists — a fresh install, `show_on_front` still `posts` — WordPress would still pick
 * front-page.html for the front page and render an empty <main> (measured 14/09: the home came
 * back 200 with no visible main). With posts on the front the home template is the right one, so
 * the front-page rung of the hierarchy is dropped for that case only.
 *
 * @param string[] $templates The front-page template hierarchy.
 * @return string[]
 */
function wp_tracy_business_front_page_hierarchy( array $templates ): array {
	return is_home() ? array() : $templates;
}
add_filter( 'frontpage_template_hierarchy', 'wp_tracy_business_front_page_hierarchy' );

/** The chrome stylesheet in the editor too, so the mega panel and footer columns look the same there. */
function wp_tracy_business_editor_styles(): void {
	add_editor_style( 'assets/css/wp-tracy-business-fonts.css' );
	add_editor_style( 'assets/css/wp-tracy-business.css' );
}
add_action( 'after_setup_theme', 'wp_tracy_business_editor_styles', 11 );

/**
 * Redirects the seeder recorded in the `wp_tracy_business_redirects` option — the source's
 * routes this port renames or folds (spec/redirects.json). Exact path match only, query string
 * carried over, and never for a request WordPress already resolved: a stale rule must not shadow
 * a page the owner later creates at that path. The rules live in the database, not in the theme,
 * so the site owner can edit them with a single option and the theme ships no site-specific paths.
 */
function wp_tracy_business_redirects(): void {
	if ( is_admin() || ! is_404() ) {
		return;
	}
	$rules = get_option( 'wp_tracy_business_redirects' );
	if ( is_string( $rules ) ) {
		$rules = json_decode( $rules, true );
	}
	if ( ! is_array( $rules ) || ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return;
	}
	$uri   = wp_unslash( $_SERVER['REQUEST_URI'] );
	$path  = untrailingslashit( (string) wp_parse_url( $uri, PHP_URL_PATH ) );
	$query = (string) wp_parse_url( $uri, PHP_URL_QUERY );
	foreach ( $rules as $rule ) {
		$from = isset( $rule['from'] ) ? untrailingslashit( (string) $rule['from'] ) : '';
		if ( '' === $from || $from !== $path || empty( $rule['to'] ) ) {
			continue;
		}
		$to = home_url( trailingslashit( (string) $rule['to'] ) );
		if ( '' !== $query ) {
			$to .= '?' . $query;
		}
		wp_safe_redirect( $to, (int) ( $rule['status'] ?? 301 ) );
		exit;
	}
}
add_action( 'template_redirect', 'wp_tracy_business_redirects' );

/**
 * The posts page's own title and lead on the blog index.
 *
 * home.html is one template for every language, so a heading typed into it is one language for
 * all of them. The blocks named `home.title` and `home.lead` take their text from the page set
 * as "Posts page" instead — its title, and its excerpt (or the first paragraph of its content).
 * Polylang maps that page per language, so the Russian index shows the Russian title without a
 * second template. The template text stays as the fallback when no posts page is set.
 */
function wp_tracy_business_home_head( string $content, array $block ): string {
	if ( ! is_home() ) {
		return $content;
	}
	$name = $block['attrs']['metadata']['name'] ?? '';
	if ( 'home.title' !== $name && 'home.lead' !== $name ) {
		return $content;
	}
	$page = get_post( (int) get_option( 'page_for_posts' ) );
	if ( ! $page ) {
		return $content;
	}
	if ( 'home.title' === $name ) {
		// The seeder files the page under its menu word ("News") and keeps the source's h1 in
		// `tracy_page_heading` — the heading the page prints is that, the crumb is the title.
		$heading = (string) get_post_meta( $page->ID, 'tracy_page_heading', true );
		$text    = '' !== trim( $heading ) ? $heading : get_the_title( $page );
	} else {
		$text = has_excerpt( $page ) ? get_the_excerpt( $page ) : '';
		if ( '' === $text && preg_match( '/<p[^>]*>(.*?)<\/p>/s', $page->post_content, $m ) ) {
			$text = wp_strip_all_tags( $m[1] );
		}
	}
	if ( '' === trim( (string) $text ) ) {
		return $content;
	}
	$safe = esc_html( $text );
	return (string) preg_replace_callback(
		'/^(\s*<(h[1-6]|p)\b[^>]*>).*(<\/\2>\s*)$/s',
		static fn( array $m ): string => $m[1] . $safe . $m[3],
		$content
	);
}
add_filter( 'render_block_core/heading', 'wp_tracy_business_home_head', 10, 2 );
add_filter( 'render_block_core/paragraph', 'wp_tracy_business_home_head', 10, 2 );

/**
 * The news band's "View all" button (`news.cta.1`, patterns/section-news.php) goes to the page
 * language's posts page while its link is still the pattern's `#`. The pattern is written into a
 * page before anyone knows where that site keeps its news; Settings → Reading knows, and Polylang
 * maps that page per language. A link the owner typed is theirs and stays. With no published
 * posts page (the posts are the front page, or none is set) the button is left as it is.
 *
 * @param string $content The rendered button.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_tracy_business_news_all( string $content, array $block ): string {
	if ( 'news.cta.1' !== ( $block['attrs']['metadata']['name'] ?? '' ) || ! preg_match( '/\shref="#?"/', $content ) ) {
		return $content;
	}
	$page = (int) get_option( 'page_for_posts' );
	if ( $page && function_exists( 'pll_get_post' ) ) {
		$page = (int) pll_get_post( $page, wp_tracy_business_lang() ) ?: $page;
	}
	if ( ! $page || 'publish' !== get_post_status( $page ) ) {
		return $content;
	}
	$url = esc_url( (string) get_permalink( $page ) );
	return (string) preg_replace_callback( '/(\shref=")#?(")/', static fn( array $m ): string => $m[1] . $url . $m[2], $content, 1 );
}
add_filter( 'render_block_core/button', 'wp_tracy_business_news_all', 10, 2 );

/**
 * The news band (patterns/section-news.php) is a query of the page language's latest posts. While
 * it has none to list — a new site whose demo posts were hidden, a language nobody has written in
 * yet — the band is left out whole: a heading over an empty row reads as a broken page, and cards
 * the theme made up would be news the company never published. The band is back with the first
 * published post. A band of typed cards (a page seeded before the band became a query) has no
 * query, and is drawn as it stands.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_tracy_business_news_band( string $content, array $block ): string {
	$classes = explode( ' ', (string) ( $block['attrs']['className'] ?? '' ) );
	if ( ! in_array( 'wtb-news', $classes, true ) || ! str_contains( $content, 'wp-block-query' ) ) {
		return $content;
	}
	return preg_match( '/<li\b[^>]*\sclass="(?:[^"]*\s)?wp-block-post[\s"]/', $content ) ? $content : '';
}
add_filter( 'render_block_core/group', 'wp_tracy_business_news_band', 10, 2 );

/**
 * The page language's menu of a kind: the published `wp_navigation` whose slug is the kind plus
 * `-<lang>` (`tracy-ru`, `tracy-en`), else the kind's own (`tracy`, the base menu). Polylang does
 * not give `wp_navigation` posts a language, so the slug is the only thing that says it.
 *
 * @param string $type The menu kind: `tracy`, `topbar`, `footer-company`, `footer-contact`, `footer-legal`.
 * @return WP_Post|null
 */
function wp_tracy_business_menu( string $type ): ?WP_Post {
	foreach ( array( $type . '-' . wp_tracy_business_lang(), $type ) as $slug ) {
		$menu = get_page_by_path( $slug, OBJECT, 'wp_navigation' );
		if ( $menu instanceof WP_Post && 'publish' === $menu->post_status ) {
			return $menu;
		}
	}
	return null;
}

/**
 * One header and one footer for every language: a navigation block named `nav.<menutype>` shows
 * the page language's menu of that kind — every language its own, English included, so the swap
 * holds whichever language the site serves at its root (the default is the customer's first
 * language, not English). The kind comes from the block's name, not from the menu it saved, so a
 * part saved with no menu, or with another language's, still shows the right one. No Polylang, or
 * no menu of that kind: the block renders as saved.
 */
function wp_tracy_business_localize_navigation( array $parsed ): array {
	if ( 'core/navigation' !== ( $parsed['blockName'] ?? '' ) || ! function_exists( 'pll_current_language' ) ) {
		return $parsed;
	}
	$name = (string) ( $parsed['attrs']['metadata']['name'] ?? '' );
	$menu = str_starts_with( $name, 'nav.' ) ? wp_tracy_business_menu( substr( $name, 4 ) ) : null;
	if ( $menu ) {
		$parsed['attrs']['ref'] = $menu->ID;
	}
	return $parsed;
}
add_filter( 'render_block_data', 'wp_tracy_business_localize_navigation' );

/**
 * A menu's links, in order, submenus flattened: label and address of each navigation link (a
 * page link by the page's own permalink), and the home link. A root-relative custom link goes to
 * the page language's copy, as the header's typed links do.
 *
 * @param WP_Post $menu A `wp_navigation` post.
 * @return array<int,array{0:string,1:string}> label, URL.
 */
function wp_tracy_business_menu_links( WP_Post $menu ): array {
	$links = array();
	$walk  = static function ( array $blocks ) use ( &$walk, &$links ): void {
		foreach ( $blocks as $b ) {
			$name  = $b['blockName'] ?? '';
			$attrs = $b['attrs'] ?? array();
			$label = trim( wp_strip_all_tags( html_entity_decode( (string) ( $attrs['label'] ?? '' ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) );
			$url   = '';
			if ( 'core/navigation-link' === $name || 'core/navigation-submenu' === $name ) {
				$url = ! empty( $attrs['id'] ) && 'post-type' === ( $attrs['kind'] ?? '' ) ? get_permalink( (int) $attrs['id'] ) : (string) ( $attrs['url'] ?? '' );
				$url = is_string( $url ) ? wp_tracy_business_localize_href( $url ) : '';
			} elseif ( 'core/home-link' === $name ) {
				$url = function_exists( 'pll_home_url' ) ? (string) pll_home_url( wp_tracy_business_lang() ) : home_url( '/' );
			}
			if ( '' !== $label && '' !== $url ) {
				$links[] = array( $label, $url );
			}
			$walk( $b['innerBlocks'] ?? array() );
		}
	};
	$walk( parse_blocks( (string) $menu->post_content ) );
	return $links;
}

/**
 * The Sitemap page (template `page-sitemap`): the group named `sitemap.groups` is filled with the
 * site in the page language, composed the way the EmDash edition's Sitemap is — from the menus,
 * then the pages, then the news:
 *
 *   Company   the header, top bar and footer menus of the page language, in that order
 *   Pages     every other published page of that language
 *   News      its published posts, newest first
 *
 * A page listed once is not listed again, and a group left empty is not drawn.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_tracy_business_sitemap( string $content, array $block ): string {
	if ( 'sitemap.groups' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) {
		return $content;
	}
	$query = static function ( array $args ): array {
		// Polylang reads `lang` off the query; without Polylang there is one language and no filter.
		if ( function_exists( 'pll_current_language' ) ) {
			$args['lang'] = wp_tracy_business_lang();
		}
		$links = array();
		foreach ( get_posts( $args + array( 'post_status' => 'publish', 'suppress_filters' => false ) ) as $post ) {
			$links[] = array( get_the_title( $post ), (string) get_permalink( $post ) );
		}
		return $links;
	};
	$menus = array();
	foreach ( array( 'tracy', 'topbar', 'footer-company', 'footer-contact' ) as $type ) {
		$menu  = wp_tracy_business_menu( $type );
		$menus = $menu ? array_merge( $menus, wp_tracy_business_menu_links( $menu ) ) : $menus;
	}
	$groups = array(
		array( __( 'Company', 'wp-tracy-business' ), $menus ),
		array( __( 'Pages', 'wp-tracy-business' ), $query( array( 'post_type' => 'page', 'numberposts' => -1, 'orderby' => array( 'menu_order' => 'ASC', 'title' => 'ASC' ) ) ) ),
		array( __( 'News', 'wp-tracy-business' ), $query( array( 'post_type' => 'post', 'numberposts' => 500, 'orderby' => 'date', 'order' => 'DESC' ) ) ),
	);
	$seen = array();
	$html = '';
	foreach ( $groups as [ $title, $links ] ) {
		$items = '';
		foreach ( $links as [ $label, $url ] ) {
			$key = wp_tracy_business_path( $url );
			if ( '' === trim( $label ) || isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$items       .= '<li><a href="' . esc_url( $url ) . '">' . esc_html( $label ) . '</a></li>';
		}
		if ( '' !== $items ) {
			$html .= '<div class="tracy-sitemap__group"><p class="tracy-sitemap__title">' . esc_html( $title ) . '</p><ul class="tracy-sitemap__list">' . $items . '</ul></div>';
		}
	}
	return '' === $html ? $content : wp_tracy_business_fill( $content, $html );
}
add_filter( 'render_block_core/group', 'wp_tracy_business_sitemap', 10, 2 );

/**
 * The 404 page's own words. The seeder keeps the source's "not found" page as a draft (so the
 * path answers 404) and records it in the `wp_tracy_business_404_page` option; the template's
 * group named `404.body` renders that page's content — Polylang's translation of it when the
 * request is in another language — and the template's generic text stays as the fallback.
 */
function wp_tracy_business_404_body( string $content, array $block ): string {
	if ( ! is_404() || '404.body' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) {
		return $content;
	}
	$id = (int) get_option( 'wp_tracy_business_404_page' );
	if ( ! $id ) {
		return $content;
	}
	if ( function_exists( 'pll_get_post' ) && function_exists( 'pll_current_language' ) ) {
		$translated = pll_get_post( $id, (string) pll_current_language( 'slug' ) );
		if ( $translated ) {
			$id = (int) $translated;
		}
	}
	$page = get_post( $id );
	if ( ! $page || '' === trim( $page->post_content ) ) {
		return $content;
	}
	$inner = (string) apply_filters( 'the_content', $page->post_content );
	// The template's search form is the one control the seeded page has no block for: it stays,
	// under the hero's text (before its actions row), where the source puts it.
	if ( preg_match( '/<form\b[^>]*wp-block-search\b.*?<\/form>/s', $content, $search ) ) {
		$placed = preg_replace( '/<div class="wp-block-buttons wtb-actions/', $search[0] . '$0', $inner, 1 );
		$inner  = ( is_string( $placed ) && $placed !== $inner ) ? $placed : $inner . $search[0];
	}
	return (string) preg_replace_callback(
		'/^(\s*<div\b[^>]*>)(.*)(<\/div>\s*)$/s',
		static fn( array $m ): string => $m[1] . $inner . $m[3],
		$content
	);
}
add_filter( 'render_block_core/group', 'wp_tracy_business_404_body', 10, 2 );

/**
 * The header's current item on the pages WordPress does not mark itself.
 *
 * The navigation block sets `current-menu-item` only on the page being read. The source
 * underlines "News" while an article or the news index is open, and "Resources" (the mega
 * trigger, a block of its own outside the navigation list) while any page of its panel is open.
 * Both are read off the rendered markup: a navigation link whose href is the posts page while a
 * post is open gets `current-menu-ancestor` (the class the chrome already styles); the mega block
 * gets `is-current` when the request's path is one of its panel's links, and that link itself
 * gets `aria-current="page"` — the standard mark for "the page you are on", the same one the
 * search filters carry, so a reader or a script can tell a self-link from the rest of the panel
 * (review/mega-hover.mjs clicks the panel's first link and expects the URL to change; on
 * /newsletter/ that first link IS the page, measured 15/09).
 *
 * @param string $content The rendered block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_tracy_business_current_item( string $content, array $block ): string {
	$name = $block['blockName'] ?? '';
	if ( 'core/navigation-link' === $name ) {
		if ( ! ( is_singular( 'post' ) || is_home() || is_category() || is_tag() ) || str_contains( $content, 'current-menu-' ) ) {
			return $content;
		}
		$posts_page = (int) get_option( 'page_for_posts' );
		$targets    = array_filter( array( $posts_page ? get_permalink( $posts_page ) : '', get_post_type_archive_link( 'post' ) ) );
		foreach ( $targets as $target ) {
			$path = wp_tracy_business_path( (string) $target );
			if ( '' !== $path && preg_match( '/href="([^"]*)"/', $content, $m ) && wp_tracy_business_path( html_entity_decode( $m[1] ) ) === $path ) {
				return (string) preg_replace( '/class="wp-block-navigation-item\b/', 'class="wp-block-navigation-item current-menu-ancestor', $content, 1 );
			}
		}
		return $content;
	}
	if ( 'wp-tracy-business/mega-menu' === $name && isset( $_SERVER['REQUEST_URI'] ) ) {
		// A 404 belongs to no section: the kit's "404 page" is listed in the panel, so its path
		// would otherwise light the trigger while the visitor is told the page does not exist.
		if ( is_404() ) {
			return $content;
		}
		$here = wp_tracy_business_path( (string) wp_unslash( $_SERVER['REQUEST_URI'] ) );
		// Only the panel's own lists (the kit, the projects) say what belongs under the trigger;
		// its news column lists whatever posts are latest, and "News" is the navigation's item.
		if ( '' === $here || '/' === $here || ! preg_match_all( '/<ul\b[^>]*tracy-mega__links[^>]*>.*?<\/ul>/s', $content, $lists ) ) {
			return $content;
		}
		$matched = false;
		$content = (string) preg_replace_callback(
			'/<ul\b[^>]*tracy-mega__links[^>]*>.*?<\/ul>/s',
			static function ( array $list ) use ( $here, &$matched ): string {
				return (string) preg_replace_callback(
					'/<a\s+href="([^"]*)"(?![^>]*\baria-current=)/',
					static function ( array $a ) use ( $here, &$matched ): string {
						// Compared where the link will lead once the header sends it to the page language.
						if ( wp_tracy_business_path( wp_tracy_business_localize_href( html_entity_decode( $a[1] ) ) ) !== $here ) {
							return $a[0];
						}
						$matched = true;
						return $a[0] . ' aria-current="page"';
					},
					$list[0]
				);
			},
			$content
		);
		if ( $matched ) {
			return (string) preg_replace( '/class="([^"]*\btracy-mega\b[^"]*)"/', 'class="$1 is-current"', $content, 1 );
		}
	}
	return $content;
}
add_filter( 'render_block', 'wp_tracy_business_current_item', 10, 2 );

/** A URL or request URI as its path, no trailing slash, no query — "/news" for both `/news/?x` and `https://host/news/`. */
function wp_tracy_business_path( string $url ): string {
	$path = (string) wp_parse_url( $url, PHP_URL_PATH );
	$path = untrailingslashit( $path );
	return '' === $path ? '/' : $path;
}

/**
 * The article's table of contents: the sidebar part's group named `single.toc` holds an empty
 * list named `single.toc.list`; here it is filled with one link per `<h2 id>` of the post being
 * read (the spec-pack keeps the source's ids, so a jump lands on the source's anchor). A post
 * with no such heading gets no card at all — an empty "In this article" is worse than none.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_tracy_business_toc( string $content, array $block ): string {
	if ( 'single.toc' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) {
		return $content;
	}
	$post = get_post();
	if ( ! $post || ! preg_match_all( '/<h2\b[^>]*\bid="([^"]+)"[^>]*>(.*?)<\/h2>/is', (string) $post->post_content, $m, PREG_SET_ORDER ) ) {
		return '';
	}
	$items = '';
	foreach ( $m as $h ) {
		$text = trim( wp_strip_all_tags( $h[2] ) );
		if ( '' === $text ) {
			continue;
		}
		// The first entry is the section being read when the page opens (the source marks it so);
		// the stylesheet paints aria-current orange and bold.
		$current = '' === $items ? ' aria-current="location"' : '';
		$items  .= '<li><a href="#' . esc_attr( $h[1] ) . '"' . $current . '>' . esc_html( $text ) . '</a></li>';
	}
	if ( '' === $items ) {
		return '';
	}
	$filled = preg_replace( '/(<ul\b[^>]*tracy-aside__toc-list[^>]*>)\s*(<\/ul>)/', '$1' . $items . '$2', $content, 1 );
	return is_string( $filled ) ? $filled : $content;
}
add_filter( 'render_block_core/group', 'wp_tracy_business_toc', 10, 2 );

/**
 * The article's Downloads card: the sidebar part's group named `single.downloads` holds an empty
 * list named `single.downloads.list`; here it is filled with one link per document attached to
 * the post being read — the file's title, then its type and size the way the source prints
 * them ("Anchor bolt checklist · XLSX"). Pictures are not downloads. A post with no document
 * gets no card at all, for the same reason the table of contents vanishes when it would be empty.
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_tracy_business_downloads( string $content, array $block ): string {
	if ( 'single.downloads' !== ( $block['attrs']['metadata']['name'] ?? '' ) ) {
		return $content;
	}
	$post = get_post();
	if ( ! $post ) {
		return '';
	}
	$items = '';
	foreach ( get_attached_media( '', $post ) as $file ) {
		$mime = (string) $file->post_mime_type;
		if ( preg_match( '/^(image|video|audio)\//', $mime ) ) {
			continue;
		}
		$url = wp_get_attachment_url( $file->ID );
		if ( ! $url ) {
			continue;
		}
		$path = get_attached_file( $file->ID );
		$size = $path && is_readable( $path ) ? size_format( (int) filesize( $path ), 1 ) : '';
		$ext  = strtoupper( (string) pathinfo( (string) wp_parse_url( $url, PHP_URL_PATH ), PATHINFO_EXTENSION ) );
		$kind = implode( ' · ', array_filter( array( $ext, $size ) ) );
		$name = get_the_title( $file );
		$name = '' !== $name ? $name : basename( (string) $path );
		$items .= '<li><a href="' . esc_url( $url ) . '"><span class="tracy-aside__file">' . esc_html( $name ) . '</span>'
			. ( '' !== $kind ? '<span class="tracy-aside__filetype">' . esc_html( $kind ) . '</span>' : '' ) . '</a></li>';
	}
	if ( '' === $items ) {
		return '';
	}
	$filled = preg_replace( '/(<ul\b[^>]*tracy-aside__downloads-list[^>]*>)\s*(<\/ul>)/', '$1' . $items . '$2', $content, 1 );
	return is_string( $filled ) ? $filled : $content;
}
add_filter( 'render_block_core/group', 'wp_tracy_business_downloads', 10, 2 );

/**
 * Reading time as the source's byline prints it — "7 min read" — instead of the core block's
 * "1–2 minutes" range. One figure: the post's words at 200 a minute, never below one.
 *
 * @param string $content The rendered block.
 * @return string
 */
function wp_tracy_business_time_to_read( string $content ): string {
	$post = get_post();
	if ( ! $post ) {
		return $content;
	}
	// Unicode words: str_word_count() sees only Latin letters and would read a Russian post as empty.
	$words   = (int) preg_match_all( '/\\p{L}[\\p{L}\\p{N}\'’-]*/u', wp_strip_all_tags( strip_shortcodes( (string) $post->post_content ) ) );
	$minutes = max( 1, (int) round( $words / 200 ) );
	/* translators: %d: reading time in minutes. */
	$text = sprintf( __( '%d min read', 'wp-tracy-business' ), $minutes );
	$replaced = preg_replace( '/>([^<]*)<\/div>\s*$/', '>' . esc_html( $text ) . '</div>', $content, 1 );
	return is_string( $replaced ) ? $replaced : $content;
}
add_filter( 'render_block_core/post-time-to-read', 'wp_tracy_business_time_to_read', 10, 1 );

/**
 * The search sidebar's section filters: the part carries `/?s=` links with a `post_type`; here
 * each gets the current query's words, its count for that section, and `aria-current` when it
 * is the section being shown. A count is one extra query per link (three on a results page).
 *
 * @param string $content The rendered group.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_tracy_business_search_filters( string $content, array $block ): string {
	if ( 'search.filters' !== ( $block['attrs']['metadata']['name'] ?? '' ) || ! is_search() ) {
		return $content;
	}
	$term    = get_search_query( false );
	$current = get_query_var( 'post_type' );
	// A plain search carries post_type "any": that is the "All" link (the part writes no type for it).
	$current = is_string( $current ) && 'any' !== $current ? $current : '';
	return (string) preg_replace_callback(
		'/<a\s+href="\/\?s=(?:&amp;|&)?(?:post_type=([a-z_]+))?"([^>]*)>(.*?)<\/a>/s',
		static function ( array $m ) use ( $term, $current ): string {
			$type  = $m[1] ?? '';
			$args  = array( 's' => $term, 'posts_per_page' => 1, 'fields' => 'ids', 'no_found_rows' => false );
			$args['post_type'] = '' !== $type ? $type : 'any';
			$count = ( new WP_Query( $args ) )->found_posts;
			$href  = add_query_arg( array_filter( array( 's' => $term, 'post_type' => $type ), 'strlen' ), home_url( '/' ) );
			$attrs = $m[2] . ( $type === $current ? ' aria-current="page"' : '' );
			return '<a href="' . esc_url( $href ) . '"' . $attrs . '>' . $m[3] . '</a><span class="tracy-aside__count">' . (int) $count . '</span>';
		},
		$content
	);
}
add_filter( 'render_block_core/group', 'wp_tracy_business_search_filters', 10, 2 );

/**
 * "Related articles" under a post (single.html, query id 2) never lists the post being read.
 *
 * @param array    $query The query vars the block built.
 * @param WP_Block $block The query block.
 * @return array
 */
function wp_tracy_business_related_query( array $query, WP_Block $block ): array {
	if ( 2 === (int) ( $block->context['queryId'] ?? 0 ) && is_singular( 'post' ) ) {
		$query['post__not_in'] = array_merge( (array) ( $query['post__not_in'] ?? array() ), array( get_the_ID() ) );
	}
	return $query;
}
add_filter( 'query_loop_block_query_vars', 'wp_tracy_business_related_query', 10, 2 );

/**
 * The drop zone's file control.
 *
 * The seeder writes the source's upload box as a `<label class="wtb-form__file">` holding two
 * lines of the theme's own type — "Drag drawings here, or click to choose files" and the format
 * hint — with Contact Form 7's `[file]` tag inside it. CF7 renders that tag as a native
 * `<input type="file">`, and every browser draws its own grey "Choose File" button next to the
 * words "No file chosen": a control in the UA's font, size and border sitting in the middle of a
 * box the style guide never drew (§4 has orange, forest, outline and text-link buttons, nothing
 * like it), and a SECOND trigger for the picker the whole box already opens, because a label
 * wrapping an input activates it. The source has no such control: `Contact.html` draws the box
 * with the two lines and nothing else.
 *
 * So the native control is clipped with the utility the theme already defines for controls that
 * must stay reachable by keyboard while off canvas (`.screen-reader-text`,
 * assets/css/wp-tracy-business.css) — not hidden, which would take the picker with it — and the
 * names of the chosen files are printed underneath in the hint's own type. Without that readout
 * the box would answer a click with nothing at all, which is worse than the control it replaces.
 *
 * @param string $elements The rendered form.
 * @return string
 */
function wp_tracy_business_drop_zone( string $elements ): string {
	if ( ! str_contains( $elements, 'wtb-form__file' ) ) {
		return $elements;
	}
	$changed = (string) preg_replace_callback(
		'#<label class="wtb-form__file"[^>]*>.*?</label>#s',
		static function ( array $m ): string {
			$box = (string) preg_replace(
				'#(<input\b[^>]*\bclass=")([^"]*\bwpcf7-file\b[^"]*)(")#',
				'$1$2 screen-reader-text$3',
				$m[0],
				1
			);
			if ( ! str_contains( $box, 'screen-reader-text' ) ) {
				return $m[0];
			}
			return (string) preg_replace(
				'#</label>$#',
				'<span class="wtb-form__hint wtb-form__chosen" aria-live="polite"></span></label>',
				$box,
				1
			);
		},
		$elements
	);
	if ( $changed === $elements ) {
		return $elements;
	}
	// Registered here rather than with the chrome assets: the form is on one page of the site, and
	// the script is dead weight on the other thirty-three.
	$handle = 'wp-tracy-business-form';
	if ( ! wp_script_is( $handle, 'registered' ) ) {
		wp_register_script( $handle, false, array(), wp_get_theme()->get( 'Version' ), true );
		wp_add_inline_script( $handle, wp_tracy_business_drop_zone_script() );
	}
	wp_enqueue_script( $handle );
	return $changed;
}
add_filter( 'wpcf7_form_elements', 'wp_tracy_business_drop_zone' );

/**
 * The readout behind the clipped file control: the chosen names, and nothing when there are none.
 * Delegated from the document so it also covers a form Contact Form 7 replaces after a send.
 *
 * @return string
 */
function wp_tracy_business_drop_zone_script(): string {
	return <<<'JS'
( function () {
	var selector = '.wtb-form__file input[type="file"]';
	function paint( input ) {
		var box = input.closest( '.wtb-form__file' );
		var out = box && box.querySelector( '.wtb-form__chosen' );
		if ( ! out ) {
			return;
		}
		out.textContent = Array.prototype.map.call( input.files || [], function ( file ) {
			return file.name;
		} ).join( ', ' );
	}
	document.addEventListener( 'change', function ( event ) {
		if ( event.target.matches && event.target.matches( selector ) ) {
			paint( event.target );
		}
	} );
	// "Clear form" empties the input without firing `change`, and so does a successful send.
	function repaint( event ) {
		var form = event.target.closest ? event.target.closest( 'form' ) : null;
		if ( ! form ) {
			return;
		}
		window.setTimeout( function () {
			form.querySelectorAll( selector ).forEach( paint );
		}, 0 );
	}
	document.addEventListener( 'reset', repaint, true );
	document.addEventListener( 'wpcf7mailsent', repaint );
}() );
JS;
}

/**
 * The language switcher, in the theme's own markup.
 *
 * Polylang's block renders a flat list. That reads fine while a site has two languages and stops
 * reading at all once it has forty-three: the row grows past the top bar, and no amount of
 * restyling turns a list into something a reader can search. The Joomla edition of this site
 * answered it first (`template-patches/tracy_business/html/mod_languages/tb.php`, 21/09/2026) and
 * this is the same decision, ported:
 *
 *   ≤ 8 languages   the anchored dropdown — a bilingual site sees no change at all
 *   > 8 languages   a modal <dialog> at EVERY width, a grid of `auto-fill` 190px columns, with a
 *                   filter box
 *
 * `showModal()` renders in the TOP LAYER, outside every containing block, overflow and z-index on
 * the page. The Joomla pass built the middle road first — a wide panel anchored inside chrome it
 * did not own — and produced four separate clipping defects in one afternoon. The whole class of
 * them disappears with the top layer, so the wide shape is never anchored.
 *
 * A filter, not the markup in `parts/header.html`: the header is a template part the site owns in
 * the database, so a site seeded before this existed still gets the new switcher.
 */
function wp_tracy_business_language_switcher( string $html, array $block ): string {
	if ( 'polylang/language-switcher' !== ( $block['blockName'] ?? '' ) ) {
		return $html;
	}
	if ( ! function_exists( 'pll_the_languages' ) ) {
		return $html;
	}
	$list = pll_the_languages( array( 'raw' => 1, 'hide_if_no_translation' => 0, 'echo' => 0 ) );
	if ( ! is_array( $list ) || count( $list ) < 2 ) {
		return $html;
	}
	$active = null;
	foreach ( $list as $l ) {
		if ( ! empty( $l['current_lang'] ) ) {
			$active = $l;
		}
	}
	if ( null === $active ) {
		return $html;
	}

	// The shape follows the LIST LENGTH, decided once here so the stylesheet and the script
	// cannot disagree about it.
	$modal  = count( $list ) > 8;
	$id     = 'tracy-lang-' . substr( md5( (string) get_the_ID() . wp_json_encode( array_column( $list, 'slug' ) ) ), 0, 8 );
	$label  = __( 'Language', 'wp-tracy-business' );
	$filter = __( 'Filter languages', 'wp-tracy-business' );
	$none   = __( 'No matching languages', 'wp-tracy-business' );

	// `pll_the_languages( raw )` hands back the flag as a URL, not as markup — printed straight
	// it renders as the address itself in the middle of the row (measured 22/09/2026).
	$flag = static function ( array $l ): string {
		$src = (string) ( $l['flag'] ?? '' );
		if ( '' === $src ) {
			return '';
		}
		if ( ! preg_match( '~^(https?:|/|data:)~', $src ) ) {
			return '<span class="tracy-lang__flag" aria-hidden="true">' . $src . '</span>';
		}
		return '<span class="tracy-lang__flag" aria-hidden="true"><img src="' . esc_url( $src )
			. '" alt="" width="16" height="11" loading="lazy" decoding="async"></span>';
	};

	$out  = '<div class="tracy-lang' . ( $modal ? ' tracy-lang--modal' : '' ) . '" data-tracy-lang>';
	$out .= '<button type="button" class="tracy-lang__toggle" aria-haspopup="dialog" aria-expanded="false"'
		. ' aria-controls="' . esc_attr( $id ) . '" aria-label="' . esc_attr( $label . ': ' . $active['name'] ) . '">'
		. $flag( $active )
		// Two labels, one shown at a time. "Português (Brasil)" is 18 characters for a secondary
		// control and pushes the bar onto a second row on a phone; below 768px the stylesheet
		// swaps in the code. Both stay in the DOM, so the accessible name never moves with the
		// viewport — which is why the button carries its own aria-label as well.
		. '<span class="tracy-lang__name">' . esc_html( $active['name'] ) . '</span>'
		. '<span class="tracy-lang__code" aria-hidden="true">' . esc_html( strtoupper( $active['slug'] ) ) . '</span>'
		. '<span class="tracy-lang__caret" aria-hidden="true">&#9660;</span>'
		. '</button>';
	$out .= '<dialog class="tracy-lang__panel" id="' . esc_attr( $id ) . '" aria-label="' . esc_attr( $label ) . '">';
	if ( $modal ) {
		$out .= '<div class="tracy-lang__search"><input type="search" class="tracy-lang__search-input"'
			. ' autocomplete="off" placeholder="' . esc_attr( $filter ) . '" aria-label="' . esc_attr( $filter ) . '"'
			. ' aria-controls="' . esc_attr( $id ) . '-list"></div>';
	}
	$out .= '<ul class="tracy-lang__menu" id="' . esc_attr( $id ) . '-list">';
	foreach ( $list as $l ) {
		// Everything the filter matches on, lower-cased once here: the native name, the English
		// name, the locale and the slug — so "deu", "german" and "de" all find German. Matching on
		// the rendered text alone would mean a reader of the Thai page cannot find German by
		// typing "de", which is what a reader reaches for when the list is long.
		$needle = strtolower( $l['name'] . ' ' . $l['locale'] . ' ' . $l['slug'] );
		$cls    = 'tracy-lang__item' . ( ! empty( $l['current_lang'] ) ? ' is-active' : '' )
			. ( ! empty( $l['no_translation'] ) ? ' is-untranslated' : '' );
		$out   .= '<li class="' . esc_attr( $cls ) . '" data-tracy-lang-find="' . esc_attr( $needle ) . '">';
		$out   .= '<a href="' . esc_url( $l['url'] ) . '" lang="' . esc_attr( $l['slug'] ) . '" hreflang="' . esc_attr( $l['slug'] ) . '"'
			. ( ! empty( $l['current_lang'] ) ? ' aria-current="true"' : '' ) . '>'
			. $flag( $l )
			. '<span class="tracy-lang__name">' . esc_html( $l['name'] ) . '</span>'
			. ( ! empty( $l['current_lang'] ) ? '<span class="tracy-lang__check" aria-hidden="true">&#10003;</span>' : '' )
			. '</a></li>';
	}
	$out .= '</ul>';
	if ( $modal ) {
		$out .= '<p class="tracy-lang__empty" hidden>' . esc_html( $none ) . '</p>';
	}
	$out .= '</dialog></div>';

	wp_enqueue_script( 'wp-tracy-business-lang' );
	return $out;
}
add_filter( 'render_block', 'wp_tracy_business_language_switcher', 10, 2 );
