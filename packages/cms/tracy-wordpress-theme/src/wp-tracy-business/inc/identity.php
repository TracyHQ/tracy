<?php
/**
 * wp-tracy-business — the site's identity: ONE option, read by every page.
 *
 * The header and footer template parts carry tokens (`{site.name}`, `{contact.email}`, …) instead
 * of a demo company's name, phone and mail. This file replaces them on the front end from the
 * option `tracy_site_identity`, so renaming the customer's site is one write — the seeder's,
 * through the content contract — and no template part holds a brand literal a customer can read.
 * The spec is `tasks/spec-danh-tinh-site-wordpress.md`; the Joomla twin is
 * `plg_system_tracyidentity` in `packages/cms/tracy-joomla-quickstart`.
 *
 * Three rules, each the same as the Joomla renderer's:
 *   - the token list is CLOSED: fourteen names, exactly `IdentityTokens::NAMES` of the Claude Cowork plugin.
 *     Any other `{…}` on a page is the author's and stays as it is;
 *   - a field the customer never gave renders EMPTY, never the demo value — invented data is
 *     worse than none because readers trust it;
 *   - escaping follows the token's POSITION in the HTML, decided here and not by the author: text
 *     between tags is escaped as text, a token inside a tag as an attribute value, a `social.*`
 *     token in an `href` must be an `https://` address or it is dropped, inside `<script>` it is a
 *     JSON string literal, and inside `<textarea>` nothing is touched.
 *
 * The pure half (`wp_tracy_business_identity_render`, `wp_tracy_business_identity_vars_of`) calls
 * no WordPress function, so `test/identity.test.mjs` runs it under a bare `php`; the escaping
 * matches what `esc_html` / `esc_attr` / `esc_url` do for these inputs. The WordPress half hooks
 * `template_redirect` (an output buffer over the whole page — tokens sit in template parts, blocks
 * and patterns alike, and a buffer sees them all once) and `document_title_parts`.
 *
 * @package wp-tracy-business
 */

defined( 'ABSPATH' ) || exit;

/** The option every page reads. Its writer is the Claude Cowork plugin (`content.contract apply`), not the theme. */
const WP_TRACY_BUSINESS_IDENTITY_OPTION = 'tracy_site_identity';

/**
 * Every token a page may carry, closed on purpose. Adding one means changing the theme, the
 * Claude Cowork plugin's `IdentityTokens` and the spec in one PR.
 */
const WP_TRACY_BUSINESS_IDENTITY_TOKENS = array(
	'site.name',
	'site.legalName',
	'site.slogan',
	'site.monogram',
	'contact.email',
	'contact.phone',
	'contact.tel',
	'contact.address',
	'contact.hours',
	'social.facebook',
	'social.instagram',
	'social.linkedin',
	'social.tiktok',
	'social.youtube',
);

/**
 * Option keys of the `site` group → token name. `contact.*` and `social.*` keep their own names;
 * `logo` is not a token (an `<img data-tracy-identity="site.logo">` takes it as its `src`, §6).
 */
const WP_TRACY_BUSINESS_IDENTITY_SITE_KEYS = array(
	'name'      => 'site.name',
	'legalName' => 'site.legalName',
	'slogan'    => 'site.slogan',
	'monogram'  => 'site.monogram',
	'logo'      => 'site.logo',
);

/**
 * The option's array as identity variables keyed by token name.
 *
 * Accepts both shapes the spec and the Claude Cowork plugin may write: nested groups
 * (`['contact' => ['email' => …]]`) and flat dotted keys (`['contact.email' => …]`). Only the
 * fourteen tokens plus `site.logo` come out; `contact.tel` is derived from `contact.phone` (digits
 * and a leading plus) when the option holds a phone but no dial form.
 *
 * @param mixed $option what `get_option( 'tracy_site_identity' )` returned
 * @return array<string,string> every variable that has a value; missing ones are absent
 */
function wp_tracy_business_identity_vars_of( $option ): array {
	if ( ! is_array( $option ) ) {
		return array();
	}
	$flat = array();
	foreach ( $option as $key => $value ) {
		if ( is_array( $value ) ) {
			foreach ( $value as $sub => $leaf ) {
				if ( is_scalar( $leaf ) ) {
					$flat[ $key . '.' . $sub ] = trim( (string) $leaf );
				}
			}
		} elseif ( is_scalar( $value ) ) {
			$flat[ (string) $key ] = trim( (string) $value );
		}
	}
	$vars = array();
	foreach ( WP_TRACY_BUSINESS_IDENTITY_SITE_KEYS as $key => $name ) {
		$value = $flat[ $name ] ?? $flat[ $key ] ?? '';
		if ( '' !== $value ) {
			$vars[ $name ] = $value;
		}
	}
	foreach ( WP_TRACY_BUSINESS_IDENTITY_TOKENS as $name ) {
		if ( 0 === strpos( $name, 'site.' ) ) {
			continue;
		}
		$value = $flat[ $name ] ?? '';
		if ( '' !== $value ) {
			$vars[ $name ] = $value;
		}
	}
	if ( empty( $vars['contact.tel'] ) && ! empty( $vars['contact.phone'] ) ) {
		$vars['contact.tel'] = (string) preg_replace( '/[^0-9+]/', '', $vars['contact.phone'] );
	}
	if ( isset( $vars['contact.tel'] ) ) {
		// The dial form is digits and one leading plus, whatever the customer typed.
		$tel = (string) preg_replace( '/[^0-9+]/', '', $vars['contact.tel'] );
		$tel = ( '' !== $tel && '+' === $tel[0] ? '+' : '' ) . str_replace( '+', '', $tel );
		if ( '' === $tel ) {
			unset( $vars['contact.tel'] );
		} else {
			$vars['contact.tel'] = $tel;
		}
	}
	return $vars;
}

/**
 * Replace identity tokens in a rendered page.
 *
 * @param string               $html the page as WordPress is about to send it
 * @param array<string,string> $vars identity variables keyed by token name, as
 *                                   `wp_tracy_business_identity_vars_of()` returns them
 * @param string               $base the site's root path for the logo's `src` (`/`, or `/sub/`
 *                                   when WordPress lives in a directory)
 */
function wp_tracy_business_identity_render( string $html, array $vars, string $base = '/' ): string {
	$as_text   = array();
	$as_attr   = array();
	$as_script = array();
	foreach ( WP_TRACY_BUSINESS_IDENTITY_TOKENS as $name ) {
		$value = (string) ( $vars[ $name ] ?? '' );
		$token = '{' . $name . '}';
		// The customer typed this; on the page it is text, never markup — in text and in an
		// attribute value alike (esc_html and esc_attr agree on these characters).
		$as_text[ $token ] = htmlspecialchars( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		// In a tag a social link is a URL: only an https address may reach an href; a
		// `javascript:` or a bare word is dropped rather than printed (the esc_url rule, stricter).
		$as_attr[ $token ] = 0 === strpos( $name, 'social.' ) && ! preg_match( '~^https://[^\s"\'<>]+$~', $value )
			? ''
			: $as_text[ $token ];
		// Inside a script a token sits in a string literal (JSON-LD above all), where HTML
		// entities would be read verbatim. JSON_HEX_TAG keeps `</script>` from ending it.
		$json                = json_encode( $value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG );
		$as_script[ $token ] = substr( (string) $json, 1, -1 );
	}

	$html = wp_tracy_business_identity_drop_empty( $html, $vars );

	$parts = preg_split(
		'~(<script\b[^>]*>.*?</script\s*>|<textarea\b[^>]*>.*?</textarea\s*>)~is',
		$html,
		-1,
		PREG_SPLIT_DELIM_CAPTURE
	);
	if ( false === $parts ) {
		return $html;
	}
	foreach ( $parts as $i => $part ) {
		if ( 0 === $i % 2 ) {
			$parts[ $i ] = wp_tracy_business_identity_render_markup( $part, $as_text, $as_attr, $vars, $base );
		} elseif ( 0 === stripos( $part, '<script' ) ) {
			$parts[ $i ] = strtr( $part, $as_script );
		}
		// A textarea is text being edited: replacing there would save the name over the token.
	}
	return implode( '', $parts );
}

/**
 * Tokens in markup that is neither script nor textarea: text between tags is escaped as text,
 * a token inside a tag as an attribute value. Tags are matched, never parsed — a token is never
 * part of a tag name, so the split is exact for what a token can touch.
 *
 * @param array<string,string> $as_text token → text-escaped value
 * @param array<string,string> $as_attr token → attribute-escaped value
 * @param array<string,string> $vars    the raw variables, for the logo `src`
 */
function wp_tracy_business_identity_render_markup( string $html, array $as_text, array $as_attr, array $vars, string $base ): string {
	$pieces = preg_split( '~(<[a-zA-Z!/][^>]*>)~', $html, -1, PREG_SPLIT_DELIM_CAPTURE );
	if ( false === $pieces ) {
		return strtr( $html, $as_text );
	}
	foreach ( $pieces as $i => $piece ) {
		if ( 0 === $i % 2 ) {
			$pieces[ $i ] = strtr( $piece, $as_text );
			continue;
		}
		if ( preg_match( '~^<img\b[^>]*\sdata-tracy-identity="(site\.logo|site\.logoDark)"~i', $piece, $which ) ) {
			$piece = wp_tracy_business_identity_logo_tag( $piece, (string) ( $vars[ $which[1] ] ?? '' ), $base );
		}
		$pieces[ $i ] = strtr( $piece, $as_attr );
	}
	return implode( '', $pieces );
}

/**
 * The logo `<img>`: its `src` is the site's own media path, printed as a site-relative URL; with
 * no logo the element is hidden, and the monogram mark beside it shows instead (the stylesheet
 * keys on `[hidden]`). The path is not a token — it is filled by the element's field name.
 */
function wp_tracy_business_identity_logo_tag( string $tag, string $logo, string $base ): string {
	if ( '' === $logo || preg_match( '~^(?:[a-z]+:|//)~i', $logo ) ) {
		// Empty, or not a path under this site: no logo. A URL to somewhere else is not accepted.
		$tag = preg_replace( '~\s+hidden(?:="[^"]*")?(?=[\s/>])~i', '', $tag );
		return preg_replace( '~^<img\b~i', '<img hidden', (string) $tag );
	}
	$src = htmlspecialchars( rtrim( $base, '/' ) . '/' . ltrim( $logo, '/' ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	$tag = preg_replace( '~\s+hidden(?:="[^"]*")?(?=[\s/>])~i', '', $tag );
	if ( preg_match( '~\ssrc="[^"]*"~i', (string) $tag ) ) {
		return (string) preg_replace( '~\ssrc="[^"]*"~i', ' src="' . $src . '"', (string) $tag, 1 );
	}
	return (string) preg_replace( '~^<img\b~i', '<img src="' . $src . '"', (string) $tag );
}

/**
 * Elements that hide themselves: one carrying `data-tracy-identity="<field>"` is left out of the
 * page when that field is empty — a social button, a hotline line, the hours — so a customer
 * without a TikTok account has no dead TikTok button. The `<img>` logo is the exception (hidden,
 * not removed, so the mark beside it can key on it). A button wrapper left empty by that goes
 * too, and so does the buttons row when every button went, and the Contact card when every row went.
 *
 * Elements are matched to their own closing tag without nesting the same tag name: the parts
 * carry the attribute on `<p>`, `<a>` and `<span>`, none of which nests itself there.
 *
 * @param array<string,string> $vars
 */
function wp_tracy_business_identity_drop_empty( string $html, array $vars ): string {
	$html = preg_replace_callback(
		'~<(?!img\b)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\sdata-tracy-identity="([a-zA-Z.]+)"[^>]*>.*?</\1\s*>~s',
		static function ( array $m ) use ( $vars ): string {
			return '' === trim( (string) ( $vars[ $m[2] ] ?? '' ) ) ? '' : $m[0];
		},
		$html
	);
	$html = (string) preg_replace( '~<div class="wp-block-button\b[^"]*">\s*</div>~', '', (string) $html );
	$html = (string) preg_replace( '~<div class="wp-block-buttons\b[^"]*">\s*</div>~', '', $html );
	// the Contact card whose four rows all went: an empty ink block on the page (/contact of a site with
	// no contact details, 15/10/2026); the hero then takes one column (sections.css keys on the card)
	return (string) preg_replace( '~<div class="wp-block-group wtb-contact__card\b[^"]*">\s*</div>~', '', $html );
}

/**
 * The logo for the dark header, as the site-relative media path the logo `<img>` takes: the attachment
 * option `tracy_logo_dark` names (Tracy's dark-logo convention, inc/brand-logo.php; written by the
 * site build), or '' when there is none — the dark header then shows the monogram beside the name.
 */
function wp_tracy_business_identity_dark_logo(): string {
	$id = (int) get_option( 'tracy_logo_dark', 0 );
	if ( $id <= 0 || ! function_exists( 'wp_attachment_is_image' ) || ! wp_attachment_is_image( $id ) ) {
		return '';
	}
	$file = (string) get_post_meta( $id, '_wp_attached_file', true );
	return '' === $file ? '' : 'wp-content/uploads/' . ltrim( $file, '/' );
}

/**
 * The identity of this request, read once.
 *
 * @return array<string,string>
 */
/**
 * The brand mark from a name: up to three initials, the first two words and the last, skipping the
 * words a mark skips. The same rule as the seeder's `initialsOf` (`chrome-slots.mjs`) and the EmDash
 * template's, so one customer wears one mark on every CMS.
 */
function wp_tracy_business_identity_initials( string $name ): string {
	$stop  = array( 'and', 'the', 'of', '&', 'co', 'ltd', 'llc', 'jsc', 'inc', 'gmbh', 'và', 'công', 'ty' );
	$words = array();
	foreach ( preg_split( '/\s+/u', trim( $name ) ) ?: array() as $word ) {
		if ( '' !== $word && ! in_array( mb_strtolower( $word, 'UTF-8' ), $stop, true ) ) {
			$words[] = $word;
		}
	}
	$first = static function ( string $word, int $count = 1 ): string {
		return mb_strtoupper( mb_substr( $word, 0, $count, 'UTF-8' ), 'UTF-8' );
	};
	if ( 0 === count( $words ) ) {
		return $first( trim( $name ), 2 );
	}
	if ( 1 === count( $words ) ) {
		return $first( $words[0], 2 );
	}
	$letters = array_map( $first, $words );
	if ( count( $letters ) <= 3 ) {
		return implode( '', $letters );
	}
	return $letters[0] . $letters[1] . $letters[ count( $letters ) - 1 ];
}

/**
 * The identity with the site's own facts standing in for what the option lacks: the site title for
 * the name, its initials for the mark, the uploaded site logo for the logo. A release database
 * carries no identity option (tracy-business/wp7 1.3.5 and 1.3.6 measured 13/10/2026), and a site that
 * never went through the brand step rendered an empty 40 px square where its mark should be. Demo
 * literals never stand in: an empty site title gives an empty mark, and the stylesheet hides it.
 *
 *  array<string,string> $vars what the option gave (`wp_tracy_business_identity_vars_of`)
 *  string               $blogname the site title (`get_bloginfo( 'name' )`)
 *  string               $logo the site logo as a media path, or ''
 *  array<string,string>
 */
function wp_tracy_business_identity_with_defaults( array $vars, string $blogname, string $logo ): array {
	$blogname = trim( $blogname );
	if ( empty( $vars['site.name'] ) && '' !== $blogname ) {
		$vars['site.name'] = $blogname;
	}
	if ( empty( $vars['site.monogram'] ) && ! empty( $vars['site.name'] ) ) {
		$vars['site.monogram'] = wp_tracy_business_identity_initials( $vars['site.name'] );
	}
	if ( empty( $vars['site.logo'] ) && '' !== $logo ) {
		$vars['site.logo'] = $logo;
	}
	return $vars;
}

/** The uploaded site logo (`site_logo`, else `custom_logo`) as a media path, or ''. */
function wp_tracy_business_identity_site_logo(): string {
	$id = (int) get_option( 'site_logo', 0 );
	if ( $id <= 0 && function_exists( 'get_theme_mod' ) ) {
		$id = (int) get_theme_mod( 'custom_logo', 0 );
	}
	if ( $id <= 0 || ! function_exists( 'wp_attachment_is_image' ) || ! wp_attachment_is_image( $id ) ) {
		return '';
	}
	$file = (string) get_post_meta( $id, '_wp_attached_file', true );
	return '' === $file ? '' : 'wp-content/uploads/' . ltrim( $file, '/' );
}

function wp_tracy_business_identity(): array {
	static $vars = null;
	if ( null === $vars ) {
		$vars = wp_tracy_business_identity_vars_of( get_option( WP_TRACY_BUSINESS_IDENTITY_OPTION ) );
		$vars = wp_tracy_business_identity_with_defaults(
			$vars,
			function_exists( 'get_bloginfo' ) ? (string) get_bloginfo( 'name' ) : '',
			wp_tracy_business_identity_site_logo()
		);
		$dark = wp_tracy_business_identity_dark_logo();
		if ( '' !== $dark ) {
			$vars['site.logoDark'] = $dark;
		}
	}
	return $vars;
}

/**
 * Whether this request renders a page a visitor reads: not admin, REST, a feed, an embed, the
 * robots file or the customizer preview. Everything else is the site as the customer's visitors
 * see it — the only place a token may be replaced.
 */
function wp_tracy_business_identity_renders(): bool {
	if ( is_admin() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
		return false;
	}
	if ( is_feed() || is_embed() || is_robots() || is_trackback() || is_customize_preview() ) {
		return false;
	}
	return true;
}

/**
 * Start the buffer that replaces tokens on the way out; WordPress flushes every buffer at
 * shutdown (`wp_ob_end_flush_all`), which runs the callback over the finished page.
 */
function wp_tracy_business_identity_buffer(): void {
	if ( ! wp_tracy_business_identity_renders() ) {
		return;
	}
	$vars = wp_tracy_business_identity();
	$base = wp_make_link_relative( home_url( '/' ) );
	ob_start(
		static function ( string $html ) use ( $vars, $base ): string {
			return wp_tracy_business_identity_render( $html, $vars, '' === $base ? '/' : $base );
		}
	);
}
add_action( 'template_redirect', 'wp_tracy_business_identity_buffer' );

/**
 * `<title>`: the site name part from the identity's `name`, and the front page's tagline from its
 * `slogan`, when present. `blogname` stays what WordPress prints elsewhere — admin bar, mails,
 * feeds — and the rule that keeps it equal to `name` is the Claude Cowork plugin's write rule, not a filter.
 *
 * @param array<string,string> $parts
 * @return array<string,string>
 */
function wp_tracy_business_identity_title( array $parts ): array {
	$vars = wp_tracy_business_identity();
	if ( ! empty( $vars['site.name'] ) ) {
		if ( isset( $parts['site'] ) ) {
			$parts['site'] = $vars['site.name'];
		}
		if ( is_front_page() && isset( $parts['title'] ) ) {
			$parts['title'] = $vars['site.name'];
		}
	}
	if ( is_front_page() && isset( $parts['tagline'] ) && ! empty( $vars['site.slogan'] ) ) {
		$parts['tagline'] = $vars['site.slogan'];
	}
	return $parts;
}
add_filter( 'document_title_parts', 'wp_tracy_business_identity_title', 20 );
