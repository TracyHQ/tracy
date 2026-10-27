<?php
/**
 * wp-ja-essence — the theme's interface words that its blocks carry as attributes or markup, in the site's language.
 *
 * A block theme cannot pass a block attribute or a line of its markup through the text domain: "By " before an author,
 * "Read more ..." after an excerpt, the search label, the drawer's "Menu", the header buttons' labels and the contact form's
 * copy box are written in English in the theme's parts and patterns, and in every page the quickstart made from them. So a
 * site made in another language printed them in English (LANG-2, measured 11/10/2026 on dev g58-ess-wp-full, 1.0.11,
 * Vietnamese). They are translated here when the page is drawn, and only while they still read the theme's English: a word
 * the site's owner typed in their place is theirs and is never touched. A site in English reads them as before.
 *
 * @package wp-ja-essence
 */

defined( 'ABSPATH' ) || exit;

/**
 * The block attributes that hold the theme's words, by block: attribute → the theme's English.
 *
 * @return array<string, array<string, string>>
 */
function wp_ja_essence_attribute_words(): array {
	return array(
		'core/post-author-name' => array( 'prefix' => 'By ' ),
		'core/post-excerpt'     => array( 'moreText' => 'Read more ...' ),
		'core/read-more'        => array( 'content' => 'Read more ...' ),
		'core/search'           => array(
			'label'      => 'Search',
			'buttonText' => 'Search',
		),
	);
}

/**
 * One of the theme's English words in the site's language; any other text as it is.
 *
 * @param string $text The text a block carries.
 * @return string
 */
function wp_ja_essence_word( string $text ): string {
	switch ( $text ) {
		case 'By ':
			return __( 'By ', 'wp-ja-essence' );
		case 'Read more ...':
			return __( 'Read more ...', 'wp-ja-essence' );
		case 'Search':
			return __( 'Search', 'wp-ja-essence' );
		case 'Menu':
			return __( 'Menu', 'wp-ja-essence' );
		case 'Open the menu':
			return __( 'Open the menu', 'wp-ja-essence' );
		case 'Close the menu':
			return __( 'Close the menu', 'wp-ja-essence' );
		case 'Theme: light. Switch to dark':
			return __( 'Theme: light. Switch to dark', 'wp-ja-essence' );
		case 'Theme: dark. Switch to light':
			return __( 'Theme: dark. Switch to light', 'wp-ja-essence' );
		case 'Send a copy to yourself':
			return __( 'Send a copy to yourself', 'wp-ja-essence' );
	}
	return $text;
}

/**
 * A word as its spellings are compared: one case, one spacing, no trailing dots or ellipsis.
 *
 * @param string $text The text.
 * @return string
 */
function wp_ja_essence_spelling( string $text ): string {
	$text = preg_replace( '/(?:\s*(?:\.{2,}|…))+\s*$/u', '', $text );
	return strtolower( trim( preg_replace( '/\s+/u', ' ', $text ) ) );
}

/**
 * One of the theme's English words in the site's language, in the spelling the block carries it: "Read more", "Read more…"
 * and "Read more ..." are one word, and the translation keeps the block's own ending (no dots, an ellipsis, three dots) and
 * its trailing space. Null when the text is not that word.
 *
 * 🔒 Measured 10/10/2026 on dev g59-ess-wp-full (1.0.12, Vietnamese): the release's pages carry `moreText:"Read more"` eight
 * times, and only the exact "Read more ..." was translated, so nine pages printed "Read more".
 *
 * @param string $text    The text a block carries.
 * @param string $english The theme's English word.
 * @return string|null
 */
function wp_ja_essence_spelt_word( string $text, string $english ): ?string {
	if ( '' === trim( $text ) || wp_ja_essence_spelling( $text ) !== wp_ja_essence_spelling( $english ) ) {
		return null;
	}
	if ( $text === $english ) {
		return wp_ja_essence_word( $english );
	}
	$said = wp_ja_essence_word( $english );
	$bare = rtrim( preg_replace( '/(?:\s*(?:\.{2,}|…))+\s*$/u', '', $said ) );
	if ( preg_match( '/(\s*(?:\.{2,}|…))\s*$/u', $text, $end ) ) {
		$bare .= $end[1];
	}
	return preg_match( '/\s$/u', $text ) ? $bare . ' ' : $bare;
}

/**
 * The attributes of a block that still read the theme's English, in any spelling of it, in the site's language, before the
 * block is drawn.
 *
 * @param array $block The parsed block.
 * @return array
 */
function wp_ja_essence_block_words( array $block ): array {
	$words = wp_ja_essence_attribute_words()[ $block['blockName'] ?? '' ] ?? null;
	if ( ! $words ) {
		return $block;
	}
	foreach ( $words as $attribute => $english ) {
		$value = $block['attrs'][ $attribute ] ?? null;
		$said  = is_string( $value ) ? wp_ja_essence_spelt_word( $value, $english ) : null;
		if ( null !== $said ) {
			$block['attrs'][ $attribute ] = $said;
		}
	}
	return $block;
}
add_filter( 'render_block_data', 'wp_ja_essence_block_words' );

/**
 * The drawer's "Menu" heading and the header buttons' labels (`aria-label`), written in the header part's markup.
 *
 * @param string $content The rendered block.
 * @return string
 */
function wp_ja_essence_markup_words( string $content ): string {
	if ( false !== strpos( $content, 'je-drawer__menu' ) ) {
		$content = preg_replace_callback(
			'#(<p class="[^"]*\bje-drawer__menu\b[^"]*">)\s*Menu\s*(</p>)#',
			static fn( $m ) => $m[1] . esc_html( wp_ja_essence_word( 'Menu' ) ) . $m[2],
			$content
		);
	}
	if ( false !== strpos( $content, 'aria-label="' ) ) {
		$content = preg_replace_callback(
			'#aria-label="(Open the menu|Close the menu|Theme: light\. Switch to dark|Theme: dark\. Switch to light)"#',
			static fn( $m ) => 'aria-label="' . esc_attr( wp_ja_essence_word( $m[1] ) ) . '"',
			$content
		);
	}
	return $content;
}
add_filter( 'render_block_core/paragraph', 'wp_ja_essence_markup_words', 20 );
add_filter( 'render_block_core/html', 'wp_ja_essence_markup_words', 20 );

/**
 * The contact form's copy box: its label, shown in the site's language. Only the words a visitor reads change; the box's
 * value and name stay, so the mail it asks for (`wp_ja_essence_contact_copy`) is sent as before.
 *
 * @param string $html The form's fields, as Contact Form 7 draws them.
 * @return string
 */
function wp_ja_essence_form_words( string $html ): string {
	return str_replace(
		'<span class="wpcf7-list-item-label">Send a copy to yourself</span>',
		'<span class="wpcf7-list-item-label">' . esc_html( wp_ja_essence_word( 'Send a copy to yourself' ) ) . '</span>',
		$html
	);
}
add_filter( 'wpcf7_form_elements', 'wp_ja_essence_form_words' );

/**
 * The words the dark switch writes on its button as the state changes, for `assets/js/wp-ja-essence-dark.js`, which keeps
 * its English when this is not there.
 */
function wp_ja_essence_dark_words(): void {
	$words = array(
		'light' => wp_ja_essence_word( 'Theme: light. Switch to dark' ),
		'dark'  => wp_ja_essence_word( 'Theme: dark. Switch to light' ),
	);
	wp_add_inline_script( 'wp-ja-essence-dark', 'window.wpJaEssenceWords=' . wp_json_encode( $words ) . ';', 'before' );
}
add_action( 'wp_enqueue_scripts', 'wp_ja_essence_dark_words', 12 );

/**
 * A text as a CSS string: quoted, with its quotes and backslashes escaped and no character that could end the style sheet.
 *
 * @param string $text The text.
 * @return string
 */
function wp_ja_essence_css_string( string $text ): string {
	$text = preg_replace( '/[<>\\r\\n]+/', ' ', $text );
	return '"' . addcslashes( $text, '"\\' ) . '"';
}

/**
 * The words the theme's style sheets print before an author's name, as CSS variables in the site's language.
 *
 * 🔒 A STYLE SHEET CARRIES NO VISITOR WORD (LANG-2, measured 10/10/2026 on dev g59-ess-wp-full, 1.0.12, Vietnamese): the post
 * cards read "By Woodrow Ortega" because `je-detail.css` printed the word in `content:`, which no translation reaches. The
 * rules print `var(--wp-ja-essence-by)`, and the word is set here through the theme's domain.
 */
function wp_ja_essence_css_words(): void {
	$by = trim( wp_ja_essence_word( 'By ' ) );
	wp_add_inline_style( 'wp-ja-essence', ':root{--wp-ja-essence-by:' . wp_ja_essence_css_string( $by ) . ';}' );
}
add_action( 'wp_enqueue_scripts', 'wp_ja_essence_css_words', 12 );
