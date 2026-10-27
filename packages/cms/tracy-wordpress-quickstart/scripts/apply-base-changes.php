<?php
/**
 * Our base changes to Tracy Business WordPress 1.2.0, applied to a restored stand inside WordPress
 * (`wp eval-file -`, piped by apply-base-changes.mjs). Every step first looks at what is there and
 * writes only what differs, so a second run on the same stand changes nothing — and so does a run
 * on a later cut of the published `tracy-business/wp7` 1.2.0 that already carries a step.
 *
 *   1. The Contact card of every language's Contact page: the four model-written rows become rows
 *      marked with their identity field, drawn by the theme from `tracy_site_identity`.
 *   2. Form 25, the one Contact form every language embeds: neutral request types, a generic
 *      description hint, the upload accepting JPG, PNG, Word and Excel besides PDF, DWG, ZIP, and
 *      a phone mask of no country.
 *   3. The Russian Contact page embeds form 25 too, and form 303 (its Russian twin) is removed.
 *      Form 350, the unused Russian newsletter, is left alone.
 *   4. A Sitemap page (template `page-sitemap`) in every language, linked as translations.
 *   5. The `footer-legal` menu: the base (English) one and one per other language, each holding
 *      the Sitemap link of its language — the theme's footer shows the page language's menu. Each
 *      is titled with its language's "Sitemap" word, the name a screen reader reads for it.
 *   6. The database footer part, which shadows the theme's `parts/footer.html`, carries the
 *      footer's `nav.footer-legal` navigation, taken from that file.
 *   7. The database header part, which shadows the theme's `parts/header.html`: the dark-mode
 *      button's English label "Theme: automatic. Switch to light" becomes "Dark", as in that file
 *      (the theme translates it when the page is sent). Only that string is replaced.
 *   8. The news band of every language's home: its three typed cards — copies of three posts,
 *      stale the moment a post changes, "Read more" going to `#` — become the theme pattern's
 *      Query Loop of the page language's three latest posts. The band's head stays the page's.
 *   9. The demo company outside the contract: the Contact page's map, branches and social
 *      profiles, and the name, mailboxes, phones and address on the careers, investor, email,
 *      newsletter, slide and form pages, become identity tokens that hide when empty; the slide
 *      page's map picture goes; page excerpts naming the company go (the posts page's keeps its
 *      lead, with the token); the posts' author named after the company loses that name.
 *
 * Step 8 takes the news cards out of the page, so the contract profile of the version cut after
 * it must name no `home.news.item.*` slot: capture-inventory.mjs stops on a slot whose block the
 * page no longer has (the seeder's setBlockValue: "block … is not in this pattern").
 *
 * Writes go through $wpdb for existing posts (no revision, no content filter rewrites the markup)
 * and through wp_insert_post for new ones with the content filters off — wp-cli runs with no user,
 * and kses would otherwise strip the block markup of the menus. Prints one JSON report.
 *
 * @package tracy-wordpress-quickstart
 */

defined( 'ABSPATH' ) || exit;

global $wpdb;
kses_remove_filters();

$report = array(
	'changed'   => array(),
	'unchanged' => array(),
);
$note   = static function ( bool $changed, string $what ) use ( &$report ): void {
	$report[ $changed ? 'changed' : 'unchanged' ][] = $what;
};
$fail   = static function ( string $why ): void {
	fwrite( STDERR, "apply-base-changes: $why\n" );
	exit( 1 );
};
$write  = static function ( int $id, string $content ) use ( $wpdb ): void {
	$wpdb->update( $wpdb->posts, array( 'post_content' => $content ), array( 'ID' => $id ) );
	clean_post_cache( $id );
};

if ( ! function_exists( 'pll_languages_list' ) || ! class_exists( 'WPCF7_ContactForm' ) ) {
	$fail( 'Polylang and Contact Form 7 must be active on the stand' );
}

// ---------------------------------------------------------------- 1. Contact card
// The same markup as `CONTACT_CARD` in packages/cms/tracy-wordpress-theme/test/render.test.mjs,
// which the theme's render test draws: labels stay English (the theme shows them in the page
// language), values are identity tokens (inc/identity.php fills them and drops an empty row).
$card = <<<'HTML'
<!-- wp:group {"className":"wtb-contact__card"} -->
<div class="wp-block-group wtb-contact__card">
<!-- wp:group {"className":"wtb-contact__row","metadata":{"name":"contact.item.1"}} -->
<div class="wp-block-group wtb-contact__row" data-tracy-identity="contact.address">
<!-- wp:paragraph {"className":"wtb-contact__label"} -->
<p class="wtb-contact__label">Address</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-contact__value"} -->
<p class="wtb-contact__value">{contact.address}</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-contact__row","metadata":{"name":"contact.item.2"}} -->
<div class="wp-block-group wtb-contact__row" data-tracy-identity="contact.phone">
<!-- wp:paragraph {"className":"wtb-contact__label"} -->
<p class="wtb-contact__label">Hotline</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-contact__value"} -->
<p class="wtb-contact__value"><a href="tel:{contact.tel}">{contact.phone}</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-contact__row","metadata":{"name":"contact.item.3"}} -->
<div class="wp-block-group wtb-contact__row" data-tracy-identity="contact.email">
<!-- wp:paragraph {"className":"wtb-contact__label"} -->
<p class="wtb-contact__label">Email</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-contact__value"} -->
<p class="wtb-contact__value"><a href="mailto:{contact.email}">{contact.email}</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-contact__row","metadata":{"name":"contact.item.4"}} -->
<div class="wp-block-group wtb-contact__row" data-tracy-identity="contact.hours">
<!-- wp:paragraph {"className":"wtb-contact__label"} -->
<p class="wtb-contact__label">Office hours</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-contact__value"} -->
<p class="wtb-contact__value">{contact.hours}</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
HTML;

/**
 * Where the group block opened by `$opener` starts and how long it is, nested groups included;
 * null when the page has no such block or it never closes.
 */
$group_span = static function ( string $html, string $opener ): ?array {
	$start = strpos( $html, $opener );
	if ( false === $start ) {
		return null;
	}
	$depth = 0;
	$pos   = $start;
	while ( preg_match( '/<!-- (\/?)wp:group\b[^>]*?(\/?)-->/', $html, $m, PREG_OFFSET_CAPTURE, $pos ) ) {
		$pos = $m[0][1] + strlen( $m[0][0] );
		if ( '/' === $m[1][0] ) {
			--$depth;
		} elseif ( '/' !== $m[2][0] ) {
			++$depth;
		}
		if ( 0 === $depth ) {
			return array( $start, $pos - $start );
		}
	}
	return null;
};

$opener   = '<!-- wp:group {"className":"wtb-contact__card"} -->';
$contacts = $wpdb->get_results(
	$wpdb->prepare( "SELECT ID, post_content FROM {$wpdb->posts} WHERE post_type = 'page' AND post_content LIKE %s", '%' . $wpdb->esc_like( $opener ) . '%' )
);
if ( ! $contacts ) {
	$fail( 'no page carries the Contact card' );
}
foreach ( $contacts as $row ) {
	$span = $group_span( $row->post_content, $opener );
	if ( null === $span ) {
		$fail( "page {$row->ID}: the Contact card never closes" );
	}
	$same = substr( $row->post_content, $span[0], $span[1] ) === $card;
	if ( ! $same ) {
		$write( (int) $row->ID, substr_replace( $row->post_content, $card, $span[0], $span[1] ) );
	}
	$note( ! $same, "contact card on page {$row->ID}" );
}

// ---------------------------------------------------------------- 2. Form 25
$form25 = WPCF7_ContactForm::get_instance( 25 );
if ( ! $form25 ) {
	$fail( 'form 25 is missing' );
}
$edits = array(
	'"Construction quote" "Site survey" "Maintenance" "Partnership / supplier"' => '"Quote request" "Consultation" "Support" "Other"',
	'placeholder "Location, floor area, expected start date…"'                 => 'placeholder "Tell us what you need…"',
	'filetypes:pdf|dwg|zip '                                                     => 'filetypes:pdf|dwg|zip|jpg|png|doc|docx|xls|xlsx ',
	'PDF, DWG, ZIP · 25 MB max'                                                  => 'PDF, DWG, ZIP, JPG, PNG, Word, Excel · 25 MB max',
	'[tel phone placeholder "+7 (___) ___-__-__"]'                               => '[tel phone placeholder "+__ (___) ___-____"]',
);
$props = $form25->get_properties();
$form  = (string) $props['form'];
foreach ( $edits as $from => $to ) {
	if ( str_contains( $form, $to ) ) {
		continue;
	}
	if ( ! str_contains( $form, $from ) ) {
		$fail( "form 25 carries neither the demo's nor our words for: $to" );
	}
	$form = str_replace( $from, $to, $form );
}
$changed = $form !== $props['form'];
if ( $changed ) {
	$props['form'] = $form;
	$form25->set_properties( $props );
	$form25->save();
}
$note( $changed, 'form 25' );

// ---------------------------------------------------------------- 3. Russian Contact page, form 303
$shortcode = '[contact-form-7 id="25" title="' . $form25->title() . '"]';
$on_303    = $wpdb->get_results( "SELECT ID, post_content FROM {$wpdb->posts} WHERE post_type = 'page' AND post_content LIKE '%[contact-form-7 id=\"303\"%'" );
foreach ( $on_303 as $row ) {
	$write( (int) $row->ID, (string) preg_replace( '/\[contact-form-7 id="303"[^\]]*\]/', $shortcode, $row->post_content ) );
	$note( true, "page {$row->ID} embeds form 25" );
}
$form303 = get_post( 303 );
if ( $form303 && 'wpcf7_contact_form' === $form303->post_type ) {
	wp_delete_post( 303, true );
	$note( true, 'form 303 removed' );
} else {
	$note( false, 'form 303 absent' );
}

// ---------------------------------------------------------------- 4. Sitemap pages
$languages = (array) pll_languages_list( array( 'fields' => 'slug' ) );
$default   = (string) pll_default_language( 'slug' );
$author    = (int) get_post_field( 'post_author', (int) pll_get_post( (int) $contacts[0]->ID, $default ) );
$sitemaps  = array();
$titles    = array();
foreach ( $languages as $lang ) {
	$locale = (string) PLL()->model->get_language( $lang )->locale;
	$file   = get_theme_file_path( "languages/$locale.l10n.php" );
	$l10n   = is_readable( $file ) ? include $file : array();
	$title  = (string) ( $l10n['messages']['Sitemap'] ?? 'Sitemap' );
	$titles[ $lang ] = $title;
	$found  = get_posts(
		array(
			'post_type'        => 'page',
			'post_status'      => 'any',
			'lang'             => $lang,
			'meta_key'         => '_wp_page_template',
			'meta_value'       => 'page-sitemap',
			'numberposts'      => 1,
			'suppress_filters' => false,
		)
	);
	if ( $found ) {
		$sitemaps[ $lang ] = $found[0];
		$note( false, "sitemap page ($lang)" );
		continue;
	}
	$id = wp_insert_post(
		array(
			'post_type'    => 'page',
			'post_status'  => 'publish',
			'post_title'   => $title,
			'post_name'    => $lang === $default ? 'sitemap' : "sitemap-$lang",
			'post_content' => '',
			'post_author'  => $author,
			'page_template' => 'page-sitemap',
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		$fail( "sitemap page ($lang): " . $id->get_error_message() );
	}
	pll_set_post_language( $id, $lang );
	$sitemaps[ $lang ] = get_post( $id );
	$note( true, "sitemap page ($lang)" );
}
$group = array_map( static fn( WP_Post $p ): int => $p->ID, $sitemaps );
$was   = array_filter( (array) pll_get_post_translations( reset( $group ) ) );
ksort( $was );
ksort( $group );
if ( $was !== $group ) {
	pll_save_post_translations( $group );
}
$note( $was !== $group, 'sitemap translations linked' );

// ---------------------------------------------------------------- 5. footer-legal menus
foreach ( $sitemaps as $lang => $page ) {
	$slug    = $lang === $default ? 'footer-legal' : "footer-legal-$lang";
	$content = '<!-- wp:navigation-link ' . wp_json_encode(
		array(
			'label' => $page->post_title,
			'type'  => 'page',
			'id'    => $page->ID,
			'url'   => (string) get_permalink( $page ),
			'kind'  => 'post-type',
		),
		JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
	) . ' /-->';
	$menu    = get_page_by_path( $slug, OBJECT, 'wp_navigation' );
	if ( $menu instanceof WP_Post ) {
		$retitle = $menu->post_title !== $titles[ $lang ];
		if ( $retitle ) {
			$wpdb->update( $wpdb->posts, array( 'post_title' => $titles[ $lang ] ), array( 'ID' => $menu->ID ) );
			clean_post_cache( $menu->ID );
		}
		$note( $retitle, "menu $slug" );
		continue;
	}
	$id = wp_insert_post(
		array(
			'post_type'    => 'wp_navigation',
			'post_status'  => 'publish',
			'post_title'   => $titles[ $lang ],
			'post_name'    => $slug,
			'post_content' => $content,
			'post_author'  => $author,
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		$fail( "menu $slug: " . $id->get_error_message() );
	}
	$note( true, "menu $slug" );
}

// ---------------------------------------------------------------- 6. Database footer part
$nav = '';
foreach ( file( get_theme_file_path( 'parts/footer.html' ), FILE_IGNORE_NEW_LINES ) as $line ) {
	if ( str_contains( $line, '"name":"nav.footer-legal"' ) ) {
		$nav = $line;
	}
}
if ( '' === $nav ) {
	$fail( "the theme's parts/footer.html has no nav.footer-legal navigation" );
}
$parts = get_posts(
	array(
		'post_type'   => 'wp_template_part',
		'post_status' => 'any',
		'name'        => 'footer',
		'numberposts' => -1,
		'tax_query'   => array( array( 'taxonomy' => 'wp_theme', 'field' => 'name', 'terms' => get_stylesheet() ) ),
	)
);
if ( ! $parts ) {
	$note( false, 'no database footer part (the theme file is drawn)' );
}
$meta = '<div class="wp-block-group tracy-footer__meta">';
foreach ( $parts as $part ) {
	$has = str_contains( $part->post_content, '"name":"nav.footer-legal"' );
	if ( ! $has ) {
		if ( ! str_contains( $part->post_content, $meta ) ) {
			$fail( "footer part {$part->ID} has no tracy-footer__meta group to hold the Sitemap link" );
		}
		$write( $part->ID, str_replace( $meta, $meta . "\n" . $nav, $part->post_content ) );
	}
	$note( ! $has, "footer part {$part->ID}" );
}

// ---------------------------------------------------------------- 7. Database header part
$old    = 'aria-label="Theme: automatic. Switch to light"';
$new    = 'aria-label="Dark"';
$heads  = get_posts(
	array(
		'post_type'   => 'wp_template_part',
		'post_status' => 'any',
		'name'        => 'header',
		'numberposts' => -1,
		'tax_query'   => array( array( 'taxonomy' => 'wp_theme', 'field' => 'name', 'terms' => get_stylesheet() ) ),
	)
);
if ( ! $heads ) {
	$note( false, 'no database header part (the theme file is drawn)' );
}
foreach ( $heads as $part ) {
	if ( ! str_contains( $part->post_content, $old ) && ! str_contains( $part->post_content, $new ) ) {
		$fail( "header part {$part->ID} has neither the old dark-mode label nor \"Dark\"" );
	}
}
foreach ( $heads as $part ) {
	$has = str_contains( $part->post_content, $old );
	if ( $has ) {
		$write( $part->ID, str_replace( $old, $new, $part->post_content ) );
	}
	$note( $has, "header part {$part->ID}" );
}

// ---------------------------------------------------------------- 8. The news band
// Every page carrying the news band as three typed cards (each language's home) gets the theme
// pattern's Query Loop in their place: the page language's three latest posts, drawn from the
// posts, so a post edited or added shows on the home page. The loop is the installed theme's own
// `wp-tracy-business/section-news`, not a copy kept here. The band's head (eyebrow, heading,
// intro, "View all") is the page's and stays; "View all" keeps its `#`, which the theme sends to
// the page language's posts page. The read-more word is the page's card link word, or the page
// language's translation of it while the page still reads the shipped English "Read more →".
$pattern = WP_Block_Patterns_Registry::get_instance()->get_registered( 'wp-tracy-business/section-news' );
$source  = (string) ( $pattern['content'] ?? '' );
$from    = strpos( $source, '<!-- wp:query ' );
$to      = strpos( $source, '<!-- /wp:query -->' );
if ( false === $from || false === $to ) {
	$fail( "the theme's section-news pattern has no Query Loop" );
}
$loop  = substr( $source, $from, $to + strlen( '<!-- /wp:query -->' ) - $from );
$grid  = '<!-- wp:group {"className":"wtb-news__grid"} -->';
$bands = $wpdb->get_results(
	$wpdb->prepare( "SELECT ID, post_content FROM {$wpdb->posts} WHERE post_type = 'page' AND post_content LIKE %s", '%' . $wpdb->esc_like( '"className":"wtb-section wtb-news"' ) . '%' )
);
if ( ! $bands ) {
	$note( false, 'no page carries the news band' );
}
foreach ( $bands as $row ) {
	$span = $group_span( $row->post_content, $grid );
	if ( null === $span ) {
		if ( ! str_contains( $row->post_content, 'wtb-news__query' ) ) {
			$fail( "page {$row->ID}: a news band with neither typed cards nor a Query Loop" );
		}
		$note( false, "news band on page {$row->ID}" );
		continue;
	}
	$cards = substr( $row->post_content, $span[0], $span[1] );
	$word  = preg_match( '/<p class="wtb-card__link"><a\b[^>]*>([^<]+)<\/a><\/p>/', $cards, $m ) ? html_entity_decode( $m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8' ) : 'Read more →';
	if ( 'Read more →' === $word ) {
		$locale = (string) pll_get_post_language( (int) $row->ID, 'locale' );
		$file   = get_theme_file_path( "languages/$locale.l10n.php" );
		$l10n   = '' !== $locale && is_readable( $file ) ? include $file : array();
		$word   = (string) ( $l10n['messages'][ $word ] ?? $word );
	}
	$count = 0;
	$query = (string) preg_replace_callback(
		'/<!-- wp:read-more \{.*?\} \/-->/',
		static fn(): string => '<!-- wp:read-more ' . serialize_block_attributes( array( 'content' => $word ) ) . ' /-->',
		$loop,
		1,
		$count
	);
	if ( 1 !== $count ) {
		$fail( "the theme's section-news pattern has no read-more link" );
	}
	$write( (int) $row->ID, substr_replace( $row->post_content, $query, $span[0], $span[1] ) );
	$note( true, "news band on page {$row->ID}" );
}

// ---------------------------------------------------------------- 9. The demo company outside the contract
// Pages carry the demo company's name and contact channels in HTML blocks no contract slot
// names, so a sealed site could never change them: the Contact page's branches, map and social
// profiles, and the addresses, phones and brand of the careers, investor, email, newsletter,
// slide and form showcase pages. Each becomes what the header and footer already are: identity
// tokens the theme fills from `tracy_site_identity` (inc/identity.php), with an element marked
// `data-tracy-identity` dropped when its field is empty. Elements are found by their
// `data-dc-tpl` number, the same in every language's copy of a page.
$brand = '/Northgate|NORTHGATE|Норткейт/u';

/**
 * Where the element opened by `<tag data-dc-tpl="N"` starts and how long it is, nested elements
 * of the same tag included; null when the page has no such element or it never closes.
 */
$element_span = static function ( string $html, string $tpl, int $from = 0 ): ?array {
	if ( ! preg_match( '/<([a-z][a-z0-9]*)\s[^>]*?data-dc-tpl="' . preg_quote( $tpl, '/' ) . '"[^>]*>/', $html, $m, PREG_OFFSET_CAPTURE, $from ) ) {
		return null;
	}
	$tag   = $m[1][0];
	$start = $m[0][1];
	if ( in_array( $tag, array( 'input', 'img', 'br', 'hr' ), true ) ) {
		return array( $start, strlen( $m[0][0] ), $m[0][0], $tag ); // a void element is its tag
	}
	$depth = 0;
	$pos   = $start;
	while ( preg_match( '/<(\/?)' . $tag . '\b[^>]*>/', $html, $t, PREG_OFFSET_CAPTURE, $pos ) ) {
		$pos    = $t[0][1] + strlen( $t[0][0] );
		$depth += '/' === $t[1][0] ? -1 : 1;
		if ( 0 === $depth ) {
			return array( $start, $pos - $start, $m[0][0], $tag );
		}
	}
	return null;
};

/**
 * Rewrite every element numbered `$tpl` in `$html` with `$rewrite( outer html, opening tag )`.
 * Returns the page and how many elements were found.
 */
$rewrite_elements = static function ( string $html, string $tpl, callable $rewrite ) use ( $element_span ): array {
	$found = 0;
	$pos   = 0;
	while ( null !== ( $span = $element_span( $html, $tpl, $pos ) ) ) {
		++$found;
		$outer = substr( $html, $span[0], $span[1] );
		$new   = (string) $rewrite( $outer, $span[2], $span[3] );
		$html  = substr_replace( $html, $new, $span[0], $span[1] );
		$pos   = $span[0] + strlen( $new );
	}
	return array( $html, $found );
};

// The element's opening tag, its (new) inner html, and its closing tag.
$wrap = static fn( string $open, string $tag, string $inner ): string => $open . $inner . '</' . $tag . '>';
// Add `text-transform: uppercase` to an opening tag's style once: the demo typed its wordmark in
// capitals, a customer's name arrives as typed.
$upper = static function ( string $open ): string {
	return str_contains( $open, 'text-transform: uppercase' ) ? $open : (string) preg_replace( '/ style="/', ' style="text-transform: uppercase; ', $open, 1 );
};

$socials = array(
	'social.facebook'  => 'Facebook',
	'social.instagram' => 'Instagram',
	'social.linkedin'  => 'LinkedIn',
	'social.tiktok'    => 'TikTok',
	'social.youtube'   => 'YouTube',
);
$link    = '';
foreach ( $socials as $field => $label ) {
	$link .= "\n                <a data-dc-tpl=\"472\" href=\"{{$field}}\" data-tracy-identity=\"$field\" class=\"scp3\" style=\"display: block; background: var(--wp--custom--tracy--brand--header); padding: 15px 16px;\" target=\"_blank\" rel=\"noopener\">"
		. "\n                  <span data-dc-tpl=\"473\" style=\"display: flex; justify-content: space-between; gap: 10px; align-items: baseline;\">"
		. "\n                    <span data-dc-tpl=\"474\" style=\"font-size: 15.5px; font-weight: 600; color: var(--wp--preset--color--fg);\">$label</span>"
		. "\n                    <span data-dc-tpl=\"475\" style=\"font-size: 12px; color: var(--wp--preset--color--warn); font-weight: 600;\">↗</span>"
		. "\n                  </span>"
		. "\n                  <span data-dc-tpl=\"478\" style=\"display: block; font-size: 12px; color: rgb(168, 164, 155); margin-top: 6px; overflow-wrap: anywhere;\">{{$field}}</span>"
		. "\n                </a>";
}

// Element number => how it is rewritten. Each rewrite gives the same result when run on its own
// output, so a second run finds every page already as wanted.
$spots = array(
	// Contact: the side column. The map (a picture of the demo's site) and the branches (three
	// demo offices; the identity has one address, shown in the Contact card above) go; the social
	// profiles become the identity's five networks. The column hides itself when no network is
	// given, and the form then takes the row: the rule needs `!important`, since the column's own
	// inline `display: flex` outranks any stylesheet rule (1.3.1 shipped without it).
	// The rule sits in the page itself so the theme and its presentation lock stay as released.
	'443'  => static function ( string $outer, string $open, string $tag ) use ( $element_span, $link ): string {
		$heading = null;
		if ( null !== ( $h = $element_span( $outer, '468' ) ) ) {
			$heading = trim( html_entity_decode( wp_strip_all_tags( substr( $outer, $h[0], $h[1] ) ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
		}
		if ( null === $heading || '' === $heading ) {
			return $outer; // not the demo's column: leave it
		}
		$open = str_contains( $open, 'wtb-contact__aside' ) ? $open : (string) preg_replace( '/^<div /', '<div class="wtb-contact__aside" ', $open );
		return $open
			. "\n          <style>.wtb-contact__aside:not(:has(a)){display:none !important}</style>"
			. "\n          <div data-dc-tpl=\"467\" style=\"border: 1px solid var(--wp--preset--color--border); padding: 24px;\">"
			. "\n            <div data-dc-tpl=\"468\" style=\"font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; margin-bottom: 16px;\"><span class=\"sc-interp\">" . esc_html( $heading ) . '</span></div>'
			. "\n            <div data-dc-tpl=\"470\" style=\"display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1px; background: var(--wp--preset--color--border); border: 1px solid var(--wp--preset--color--border);\">"
			. $link
			. "\n            </div>\n          </div>\n        </div>";
	},
	// Careers and investor relations: the demo's HR and IR mailboxes, the IR phone.
	'1276' => static fn( string $o, string $open, string $tag ): string => $wrap( $open, $tag, '<span class="sc-interp" data-tracy-identity="contact.email">{contact.email}</span>' ),
	'1350' => static fn( string $o, string $open, string $tag ): string => $wrap( $open, $tag, '<span class="sc-interp" data-tracy-identity="contact.email">{contact.email}</span>' ),
	'1351' => static fn( string $o, string $open, string $tag ): string => $wrap( $open, $tag, '<span class="sc-interp" data-tracy-identity="contact.phone">{contact.phone}</span>' ),
	// Email showcase: the sender line (its word "From:" is the page language's), the wordmark,
	// and the footer line of company, address and phone.
	'709'  => static function ( string $outer, string $open, string $tag ) use ( $wrap, $brand ): string {
		$inner = substr( $outer, strlen( $open ), -strlen( "</$tag>" ) );
		$inner = (string) preg_replace( $brand, '{site.name}', $inner );
		$inner = (string) preg_replace( '/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/', '{contact.email}', $inner );
		$inner = (string) preg_replace( '/<span class="sc-interp">/', '<span class="sc-interp" data-tracy-identity="contact.email">', $inner, 1 );
		return $wrap( $open, $tag, $inner );
	},
	'715'  => static fn( string $o, string $open, string $tag ): string => $wrap( $upper( $open ), $tag, '{site.name}' ),
	'725'  => static fn( string $o, string $open, string $tag ): string => $wrap( $open, $tag, '<span class="sc-interp">{site.name}<span data-tracy-identity="contact.address"> · {contact.address}</span><span data-tracy-identity="contact.phone"> · {contact.phone}</span></span>' ),
	// Slide showcase: the wordmark and the sales line.
	'831'  => static fn( string $o, string $open, string $tag ): string => $wrap( $upper( $open ), $tag, '{site.name}' ),
	'902'  => static fn( string $o, string $open, string $tag ): string => $wrap( $open, $tag, '<span data-tracy-identity="contact.email">{contact.email}</span><span data-tracy-identity="contact.phone"> · {contact.phone}</span>' ),
	// Newsletter showcase: the masthead, the lead story and the footer name the sender.
	'661'  => static fn( string $outer, string $open, string $tag ): string => $upper( $open ) . (string) preg_replace( $brand, '{site.name}', substr( $outer, strlen( $open ) ) ),
	'666'  => static fn( string $outer, string $open, string $tag ): string => $open . (string) preg_replace( $brand, '{site.name}', substr( $outer, strlen( $open ) ) ),
	'675'  => static fn( string $outer, string $open, string $tag ): string => $open . (string) preg_replace( $brand, '{site.name}', substr( $outer, strlen( $open ) ) ),
	// Slide showcase: the map behind the contacts slide is a picture of the demo's own site.
	'897'  => static fn(): string => '',
	// Form showcase: the phone mask of one country.
	'803'  => static fn( string $outer ): string => str_replace( 'placeholder="+7 (___) ___-__-__"', 'placeholder="+__ (___) ___-____"', $outer ),
);

$pages = $wpdb->get_results( "SELECT ID, post_content FROM {$wpdb->posts} WHERE post_type = 'page' AND post_content LIKE '%data-dc-tpl=%'" );
$seen  = array_fill_keys( array_keys( $spots ), 0 );
$after = array();
foreach ( $pages as $row ) {
	$html = (string) $row->post_content;
	foreach ( $spots as $tpl => $rewrite ) {
		list( $html, $found ) = $rewrite_elements( $html, (string) $tpl, $rewrite );
		$seen[ $tpl ]        += $found;
	}
	$after[ (int) $row->ID ] = $html;
}
// Every element is looked for before anything is written: a later cut that lost one stops here
// with the stand untouched, rather than half changed.
foreach ( $seen as $tpl => $count ) {
	// A removed element is absent after the first run: that is the wanted state, not a lost one.
	if ( 0 === $count && '897' !== (string) $tpl ) {
		$fail( "no page carries element data-dc-tpl=\"$tpl\"" );
	}
}
foreach ( $pages as $row ) {
	$changed = $after[ (int) $row->ID ] !== $row->post_content;
	if ( $changed ) {
		$write( (int) $row->ID, $after[ (int) $row->ID ] );
	}
	$note( $changed, "demo company on page {$row->ID}" );
}

// Page excerpts naming the demo company. Search results print them, and they stay the demo's
// words after the page's own text is rewritten: they go, and the excerpt is made from the page.
// The posts page is the exception — its excerpt is the News page's lead (inc/extra.php), so its
// company name becomes the identity token instead.
$posts_pages = array_map( 'intval', (array) pll_get_post_translations( (int) get_option( 'page_for_posts' ) ) );
$excerpts    = $wpdb->get_results( "SELECT ID, post_excerpt FROM {$wpdb->posts} WHERE post_type = 'page' AND post_excerpt <> ''" );
foreach ( $excerpts as $row ) {
	if ( ! preg_match( $brand, $row->post_excerpt ) ) {
		continue;
	}
	$new = in_array( (int) $row->ID, $posts_pages, true ) ? (string) preg_replace( $brand, '{site.name}', $row->post_excerpt ) : '';
	$wpdb->update( $wpdb->posts, array( 'post_excerpt' => $new ), array( 'ID' => $row->ID ) );
	clean_post_cache( (int) $row->ID );
	$note( true, "excerpt of page {$row->ID}" );
}

// The byline of the demo posts: an author named after the demo company. The name keeps its
// other words ("Northgate Editorial" becomes "Editorial"); a name that was only the company falls
// back to the login.
foreach ( get_users( array( 'fields' => array( 'ID', 'display_name', 'user_login' ) ) ) as $user ) {
	if ( ! preg_match( $brand, $user->display_name ) ) {
		$note( false, "author {$user->ID}" );
		continue;
	}
	$name = trim( (string) preg_replace( '/\s+/', ' ', (string) preg_replace( $brand, '', $user->display_name ) ) );
	$wpdb->update( $wpdb->users, array( 'display_name' => '' !== $name ? $name : $user->user_login ), array( 'ID' => $user->ID ) );
	clean_user_cache( (int) $user->ID );
	$note( true, "author {$user->ID}" );
}

echo wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n";
