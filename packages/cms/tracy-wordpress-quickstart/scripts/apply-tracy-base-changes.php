<?php
/**
 * Demo-content changes for the next cut of Tracy Base WordPress (`tracy-base/wp7`, after 1.1.5),
 * applied inside WordPress (`wp eval-file - <edits>`, piped by apply-tracy-base-changes.mjs). They make
 * the WordPress site carry the content the approved Joomla source shows, instead of carrying more and
 * hiding the rest with CSS (a customer would edit text that never shows). Every step first looks at
 * what is there and writes only what differs, so a second run changes nothing.
 *
 * Needs the theme of the same branch installed first: step 2 copies the header's mega panels from
 * the theme's parts/header.html, and the search page leans on the theme's search template.
 *
 *   1. Footer row: the fifth "Pages" column (menu "Footer — Pages") and the copyright line go; the
 *      menu itself is deleted. Its pages are reached from the header's Resources panel (step 2).
 *   2. Header row: the Service, Resources and Company panels as the source draws them, taken from
 *      the theme file: Service's fifth link and feature card, Resources' three link columns (Read &
 *      learn, Design & inspiration, Help & support) with "Talk to sales" going straight to the
 *      contact page, Company's four people cards (the media library's team portraits). The
 *      Contact button goes straight to the contact page too.
 *  2b. The one-page header (theme file parts/header-onepage.html) becomes a database template part
 *      of the same bytes, as the site header and footer are, so Tracy can rewrite its words.
 *   3. Contact form `contact`: the source's labels (Name, Email, Subject, Message, Privacy Note, each
 *      marked required), the Subject field it lacked, "Send Email", and a mail that carries the subject.
 *   4. Listing pages: no category description or picture above the grid (Blog, Team, Services),
 *      no category label in the cards, no picture or "Read more" in the Archive rows, no pictures
 *      in Topics, no first sidebar heading, no features-intro spotlight label. All Articles becomes
 *      the source's row list with its Subcategories cards; Browse by tag lists one tag's posts as
 *      title cards; Tags shows its tags as same-size chips.
 *   5. Search: the draft page /resources/search is published as the source's search form, and the
 *      redirect that sent that address to the home page goes. Results use the theme's template.
 *   6. The literal demo-copy edits of content-edits/tracy-base-wp7.json (passed as the first argument,
 *      base64 JSON): each `from` must occur `count` times in the pages its entry names, or be done.
 *
 * Existing posts are written with wp_update_post (content filters off: wp-cli runs with no user and
 * kses would strip block markup; no revision is kept, so the next cut's dump carries none). Prints
 * one JSON report.
 *
 * @package tracy-wordpress-quickstart
 */

defined( 'ABSPATH' ) || exit;

kses_remove_filters();
add_filter( 'wp_revisions_to_keep', '__return_zero' );

$report = array(
	'changed'   => array(),
	'unchanged' => array(),
);
$note   = static function ( bool $changed, string $what ) use ( &$report ): void {
	$report[ $changed ? 'changed' : 'unchanged' ][] = $what;
};
$fail   = static function ( string $why ): void {
	fwrite( STDERR, "apply-tracy-base-changes: $why\n" );
	exit( 1 );
};
// Writes a post's content when it differs; records the step either way.
$save = static function ( WP_Post $post, string $content, string $what ) use ( $note, $fail ): void {
	if ( $content === $post->post_content ) {
		$note( false, $what );
		return;
	}
	$done = wp_update_post( wp_slash( array( 'ID' => $post->ID, 'post_content' => $content ) ), true );
	if ( is_wp_error( $done ) ) {
		$fail( "$what: " . $done->get_error_message() );
	}
	clean_post_cache( $post->ID );
	$note( true, $what );
};
$page = static function ( string $path ) use ( $fail ): WP_Post {
	$found = get_page_by_path( $path, OBJECT, 'page' );
	if ( ! $found instanceof WP_Post ) {
		$fail( "no page at /$path" );
	}
	return $found;
};
$part = static function ( string $slug ) use ( $fail ): WP_Post {
	$found = get_posts(
		array(
			'post_type'   => 'wp_template_part',
			'name'        => $slug,
			'post_status' => 'any',
			'numberposts' => 1,
			'tax_query'   => array( array( 'taxonomy' => 'wp_theme', 'field' => 'name', 'terms' => 'tracy-base' ) ),
		)
	);
	if ( ! $found ) {
		$fail( "no database template part $slug for tracy-base" );
	}
	return $found[0];
};

// ---------------------------------------------------------------- 1. Footer row
$footer  = $part( 'footer' );
$content = $footer->post_content;
$pages_column = '~<!-- wp:column -->\s*<div class="wp-block-column">\s*<!-- wp:heading \{"level":3,"className":"tracy-footer__title"\} -->\s*'
	. '<h3 class="wp-block-heading tracy-footer__title">Pages</h3>\s*<!-- /wp:heading -->\s*'
	. '<!-- wp:navigation \{"ref":(\d+)[^\n]*/-->\s*</div>\s*<!-- /wp:column -->\s*~';
$content = preg_replace( $pages_column, '', $content );
$content = preg_replace( '~<!-- wp:group \{"className":"tracy-footer__copyright[^\n]*-->.*?<!-- /wp:group -->\s*~s', '', $content );
$save( $footer, $content, 'footer row: no Pages column, no copyright line' );

$pages_menu = get_posts(
	array(
		'post_type'   => 'wp_navigation',
		'title'       => 'Footer — Pages',
		'post_status' => 'any',
		'numberposts' => 1,
	)
);
if ( $pages_menu ) {
	wp_delete_post( $pages_menu[0]->ID, true );
	$note( true, 'menu "Footer — Pages" deleted' );
} else {
	$note( false, 'menu "Footer — Pages" deleted' );
}

// ---------------------------------------------------------------- 2. Header row: the three panels
// Service, Resources and Company are copied whole from the theme file, as the source draws them:
// Service with its fifth link and the feature card (the studio-workspace picture), Resources as
// three link columns with "Talk to sales" going straight to the contact page, Company with the four
// people cards (the team portraits). Every picture must already be in the media library and every
// link of Service and Company must reach a published post or page, or nothing is written (the
// Resources links include the sign-in screen and the search page step 5 publishes).
$header  = $part( 'header' );
$content = $header->post_content;
$file    = (string) file_get_contents( get_theme_file_path( 'parts/header.html' ) );
foreach ( array( 'Service' => 'services', 'Resources' => 'resources', 'Company' => 'company' ) as $label => $modifier ) {
	$panel = '~<!-- wp:tracy-base/mega-menu \\{"label":"' . $label . '"\\} -->.*?<!-- /wp:tracy-base/mega-menu -->~s';
	if ( ! preg_match( $panel, $file, $from_theme ) || ! str_contains( $from_theme[0], 'tracy-mega__columns--' . $modifier ) ) {
		$fail( "the installed theme has no $label panel of the source: install this branch's tracy-base first" );
	}
	preg_match_all( '~<img src="(/wp-content/uploads/[^"]+)"~', $from_theme[0], $pictures );
	foreach ( $pictures[1] as $src ) {
		$original = preg_replace( '~-\\d+x\\d+(\\.\\w+)$~', '$1', $src );
		if ( ! attachment_url_to_postid( home_url( $original ) ) || ! file_exists( ABSPATH . ltrim( $src, '/' ) ) ) {
			$fail( "$label panel: $src is not in the media library" );
		}
	}
	preg_match_all( '~<a href="(/[^"#]*)"~', 'Resources' === $label ? '' : $from_theme[0], $targets );
	foreach ( $targets[1] as $href ) {
		if ( ! url_to_postid( home_url( $href ) ) ) {
			$fail( "$label panel: $href reaches no published post or page" );
		}
	}
	$content = preg_replace_callback( $panel, static fn() => $from_theme[0], $content, 1, $hits );
	if ( 1 !== $hits ) {
		$fail( "the header row has no $label panel" );
	}
}
// The header's Contact button goes straight to the contact page, as the source's.
$content = str_replace( 'href="/contact">Contact</a>', 'href="/resources/contact">Contact</a>', $content );
$save( $header, $content, 'header row: Service, Resources and Company panels as the source' );

// ---------------------------------------------------------------- 2b. One-page header in the database
// The one-page home's own header (About, Services, Product, Team, Contact) is a theme file. Its words
// are interface words written into a template file, which Tracy cannot translate (TCQR LANG-2 on
// 1.1.6, 16/10/2026); the site header and footer are database template parts, which Tracy rewrites.
// So the one-page header becomes one too, copied byte for byte from the installed theme's file.
$onepage = get_posts(
	array(
		'post_type'   => 'wp_template_part',
		'name'        => 'header-onepage',
		'post_status' => 'any',
		'numberposts' => 1,
		'tax_query'   => array( array( 'taxonomy' => 'wp_theme', 'field' => 'name', 'terms' => 'tracy-base' ) ),
	)
);
$onepage_file = (string) file_get_contents( get_theme_file_path( 'parts/header-onepage.html' ) );
if ( '' === trim( $onepage_file ) ) {
	$fail( "the installed theme has no parts/header-onepage.html: install this branch's tracy-base first" );
}
if ( $onepage ) {
	$save( $onepage[0], $onepage_file, 'one-page header: database template part' );
} else {
	$made = wp_insert_post(
		wp_slash(
			array(
				'post_type'    => 'wp_template_part',
				'post_name'    => 'header-onepage',
				'post_title'   => 'Header (one page)',
				'post_status'  => 'publish',
				'post_content' => $onepage_file,
			)
		),
		true
	);
	if ( is_wp_error( $made ) ) {
		$fail( 'one-page header: ' . $made->get_error_message() );
	}
	// Set the terms directly: tax_input needs a user who may assign them, and wp-cli runs with none.
	wp_set_post_terms( $made, array( 'tracy-base' ), 'wp_theme' );
	wp_set_post_terms( $made, array( 'header' ), 'wp_template_part_area' );
	$note( true, 'one-page header: database template part' );
}
// Its guid keeps the address the header part's guid carries (the release placeholder): the pack's
// address rewrite leaves guids alone, so a guid made on this site would ship the site's address.
$onepage = get_posts(
	array(
		'post_type'   => 'wp_template_part',
		'name'        => 'header-onepage',
		'post_status' => 'any',
		'numberposts' => 1,
		'tax_query'   => array( array( 'taxonomy' => 'wp_theme', 'field' => 'name', 'terms' => 'tracy-base' ) ),
	)
)[0];
$guid = preg_replace( '~/header/?$~', '/header-onepage/', $header->guid );
if ( $guid !== $header->guid && $guid !== $onepage->guid ) {
	global $wpdb;
	$wpdb->update( $wpdb->posts, array( 'guid' => $guid ), array( 'ID' => $onepage->ID ) );
	clean_post_cache( $onepage->ID );
	$note( true, 'one-page header: guid as the header part' );
} else {
	$note( false, 'one-page header: guid as the header part' );
}

// ---------------------------------------------------------------- 3. Contact form
if ( ! class_exists( 'WPCF7_ContactForm' ) ) {
	$fail( 'Contact Form 7 must be active' );
}
$form_post = get_page_by_path( 'contact', OBJECT, 'wpcf7_contact_form' );
if ( ! $form_post instanceof WP_Post ) {
	$fail( 'no Contact Form 7 form "contact"' );
}
$form = WPCF7_ContactForm::get_instance( $form_post->ID );
$star = '<span class="tracy-required" aria-hidden="true">*</span>';
$body = <<<FORM
<p class="tracy-form-note">$star Required field</p>

<label> Name $star
    [text* your-name autocomplete:name] </label>

<label> Email $star
    [email* your-email autocomplete:email] </label>

<label> Subject $star
    [text* your-subject] </label>

<label> Message $star
    [textarea* your-message] </label>

<label> Privacy Note $star
    [acceptance privacy-note] By submitting this form you agree to the Privacy Policy of this website and the storing of the submitted information. [/acceptance] </label>

[submit "Send Email"]
FORM;
$props = $form->get_properties();
$mail  = $props['mail'];
if ( '[_site_title] "Contact"' === $mail['subject'] ) {
	$mail['subject'] = '[_site_title] "[your-subject]"';
}
if ( ! str_contains( $mail['body'], 'Subject: [your-subject]' ) ) {
	$mail['body'] = preg_replace( '~^(From: \[your-name\] \[your-email\]\n)~', "$1Subject: [your-subject]\n", $mail['body'], 1 );
}
if ( $body !== $props['form'] || $mail !== $props['mail'] ) {
	$form->set_properties( array( 'form' => $body, 'mail' => $mail ) );
	$form->save();
	$note( true, 'contact form: source labels, Subject field, subject in the mail' );
} else {
	$note( false, 'contact form: source labels, Subject field, subject in the mail' );
}

// ---------------------------------------------------------------- 4. Listing pages
// The main listing query of a page (queryId 2) and its markup, located by its own delimiters.
$main_query = '~<!-- wp:query (\{"queryId":2,[^\n]*\}) -->.*?<!-- /wp:query -->~s';

// Blog, Team, Services: the category's description and picture printed above the grid go.
foreach ( array( 'resources/blog', 'company/team', 'services' ) as $path ) {
	$post = $page( $path );
	$at   = strpos( $post->post_content, '<!-- wp:query {"queryId"' );
	if ( false === $at ) {
		$fail( "/$path has no listing query" );
	}
	$head = substr( $post->post_content, 0, $at );
	$head = preg_replace( '~<!-- wp:paragraph -->\s*<p>[^<]*</p>\s*<!-- /wp:paragraph -->\s*~', '', $head );
	$head = preg_replace( '~<!-- wp:group \{"layout":\{"type":"constrained"\},"className":"rounded-1 overflow-hidden mb-4"\} -->\s*<div class="wp-block-group rounded-1 overflow-hidden mb-4">\s*<!-- wp:image [^\n]*-->\s*<figure [^\n]*</figure>\s*<!-- /wp:image -->\s*</div>\s*<!-- /wp:group -->\s*~', '', $head );
	$save( $post, $head . substr( $post->post_content, $at ), "/$path: no category description or picture" );
}

// Every page: no category label in a card, no first sidebar heading, no spotlight label.
$labels = get_posts( array( 'post_type' => 'page', 'post_status' => array( 'publish', 'draft' ), 'numberposts' => -1, 'orderby' => 'ID', 'order' => 'ASC' ) );
foreach ( $labels as $post ) {
	$content = str_replace( "<!-- wp:post-terms {\"term\":\"category\",\"className\":\"tracy-eyebrow\"} /-->\n", '', $post->post_content );
	$content = preg_replace( '~(<div class="wp-block-column tracy-page__sidebar"[^>]*>\n)<!-- wp:heading \{"className":"tracy-eyebrow"\} -->\s*<h2 class="wp-block-heading tracy-eyebrow">[^<]*</h2>\s*<!-- /wp:heading -->\n~', '$1', $content );
	$content = preg_replace( '~<!-- wp:paragraph \{[^\n]*"name":"features-intro\.spotlight-label"[^\n]*-->\s*<p[^>]*>[^<]*</p>\s*<!-- /wp:paragraph -->\n~', '', $content );
	if ( $content !== $post->post_content ) {
		$save( $post, $content, "/{$post->post_name}: no card label, sidebar heading or spotlight label" );
	}
}

// Archive: one post per row, no picture and no "Read more".
$archive = $page( 'resources/archive' );
$content = str_replace(
	array( "<!-- wp:post-featured-image {\"isLink\":true,\"aspectRatio\":\"4/3\",\"className\":\"tracy-card__media\"} /-->\n", ',"moreText":"Read more"' ),
	'',
	$archive->post_content
);
$save( $archive, $content, '/resources/archive: rows without picture or Read more' );

// Topics: the category pictures go (the source's topic cards carry none).
$topics  = $page( 'resources/all-categories' );
$content = preg_replace( '~<!-- wp:group \{"layout":\{"type":"constrained"\},"className":"rounded-1 overflow-hidden mb-4"\} -->\s*<div class="wp-block-group rounded-1 overflow-hidden mb-4">\s*<!-- wp:image [^\n]*-->\s*<figure [^\n]*</figure>\s*<!-- /wp:image -->\s*</div>\s*<!-- /wp:group -->\s*~', '', $topics->post_content );
$save( $topics, $content, '/resources/all-categories: no pictures' );

// The query footer every listing keeps: the empty line and the pagination.
$query_tail = <<<'HTML'
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph {"className":"tracy-muted"} -->
<p class="tracy-muted">Nothing here yet.</p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
<!-- wp:query-pagination {"className":"tracy-pagination","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
HTML;

// All Articles: the source's row list (one title per ruled row), then its Subcategories cards.
$list = $page( 'resources/category-list' );
if ( str_contains( $list->post_content, 'tracy-rowlist' ) ) {
	$note( false, '/resources/category-list: row list and subcategory cards' );
} else {
	if ( ! preg_match( $main_query, $list->post_content, $q ) ) {
		$fail( '/resources/category-list has no listing query' );
	}
	$attrs                    = json_decode( $q[1], true );
	$attrs['query']['perPage'] = 20;
	$attrs['className']        = 'tracy-rowlist';
	$rows                      = '<!-- wp:query ' . wp_json_encode( $attrs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . " -->\n"
		. "<div class=\"wp-block-query tracy-rowlist\">\n"
		. "<!-- wp:post-template {\"className\":\"tracy-rowlist__rows\",\"layout\":{\"type\":\"default\"}} -->\n"
		. "<!-- wp:post-title {\"level\":3,\"isLink\":true,\"className\":\"tracy-rowlist__title\"} /-->\n"
		. $query_tail;
	// The subcategory headings and lines under the page heading become the cards after the list.
	$head = substr( $list->post_content, 0, strpos( $list->post_content, $q[0] ) );
	preg_match_all( '~<!-- wp:heading \{"level":3\} -->\s*<h3 class="wp-block-heading">(<a href="[^"]*">[^<]*</a>)</h3>\s*<!-- /wp:heading -->\s*<!-- wp:paragraph -->\s*<p>([^<]*)</p>\s*<!-- /wp:paragraph -->~', $head, $subs, PREG_SET_ORDER );
	if ( 2 !== count( $subs ) || ! preg_match( '~^<!-- wp:heading \{"className":"tracy-eyebrow"\} -->\s*<h2[^\n]*</h2>\s*<!-- /wp:heading -->\n~', $head, $title ) ) {
		$fail( '/resources/category-list is not the seeded page (heading, description, two subcategories)' );
	}
	$cards = "<!-- wp:heading {\"level\":3,\"className\":\"tracy-subcats__title\"} -->\n<h3 class=\"wp-block-heading tracy-subcats__title\">Subcategories</h3>\n<!-- /wp:heading -->\n"
		. "<!-- wp:group {\"className\":\"tracy-subcats\",\"layout\":{\"type\":\"default\"}} -->\n<div class=\"wp-block-group tracy-subcats\">\n";
	foreach ( $subs as $sub ) {
		$cards .= "<!-- wp:group {\"className\":\"tracy-subcat\",\"layout\":{\"type\":\"default\"}} -->\n<div class=\"wp-block-group tracy-subcat\">\n"
			. "<!-- wp:heading {\"level\":3,\"className\":\"tracy-subcat__title\"} -->\n<h3 class=\"wp-block-heading tracy-subcat__title\">{$sub[1]}</h3>\n<!-- /wp:heading -->\n"
			. "<!-- wp:paragraph {\"className\":\"tracy-subcat__text\"} -->\n<p class=\"tracy-subcat__text\">{$sub[2]}</p>\n<!-- /wp:paragraph -->\n"
			. "</div>\n<!-- /wp:group -->\n";
	}
	$cards .= "</div>\n<!-- /wp:group -->\n";
	$tail = substr( $list->post_content, strpos( $list->post_content, $q[0] ) + strlen( $q[0] ) );
	$save( $list, $title[0] . $rows . "\n" . $cards . ltrim( $tail ), '/resources/category-list: row list and subcategory cards' );
}

// Browse by tag: one tag's posts (the only tag the demo has), each a title card; no tag cloud here.
$tagged = $page( 'resources/single-tag' );
$tag    = get_term_by( 'slug', 'archived', 'post_tag' );
if ( ! $tag ) {
	$fail( 'no post tag "archived"' );
}
if ( str_contains( $tagged->post_content, 'tracy-tagitems' ) ) {
	$note( false, '/resources/single-tag: one tag\'s posts as title cards' );
} else {
	if ( ! preg_match( $main_query, $tagged->post_content, $q ) ) {
		$fail( '/resources/single-tag has no listing query' );
	}
	$attrs                              = json_decode( $q[1], true );
	$attrs['query']['taxQuery']         = array( 'post_tag' => array( (int) $tag->term_id ) );
	$attrs['className']                 = 'tracy-tagitems';
	$items                              = '<!-- wp:query ' . wp_json_encode( $attrs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . " -->\n"
		. "<div class=\"wp-block-query tracy-tagitems\">\n"
		. "<!-- wp:post-template {\"className\":\"tracy-tagitems__grid\",\"layout\":{\"type\":\"default\"}} -->\n"
		. "<!-- wp:group {\"className\":\"tracy-tagitem\",\"layout\":{\"type\":\"default\"}} -->\n<div class=\"wp-block-group tracy-tagitem\">\n"
		. "<!-- wp:post-title {\"level\":2,\"isLink\":true,\"className\":\"tracy-tagitem__title\"} /-->\n"
		. "</div>\n<!-- /wp:group -->\n"
		. $query_tail;
	$content = str_replace( array( $q[0], "<!-- wp:tag-cloud /-->\n" ), array( $items, '' ), $tagged->post_content );
	$save( $tagged, $content, '/resources/single-tag: one tag\'s posts as title cards' );
}

// Tags: every tag the same size, drawn as the source's chips by the theme.
$tags    = $page( 'resources/tags' );
$content = str_replace( '<!-- wp:tag-cloud /-->', '<!-- wp:tag-cloud {"smallestFontSize":"14px","largestFontSize":"14px","className":"tracy-chips"} /-->', $tags->post_content );
$save( $tags, $content, '/resources/tags: same-size tag chips' );

// ---------------------------------------------------------------- 5. Search page and its redirect
$search      = $page( 'resources/search' );
$search_form = '<!-- wp:search {"label":"Search Terms:","showLabel":true,"buttonText":"Search","className":"tracy-search-form"} /-->' . "\n";
$save( $search, $search_form, '/resources/search: the search form' );
if ( 'publish' !== $search->post_status || 'page-no-sidebar' !== get_page_template_slug( $search ) ) {
	wp_update_post( array( 'ID' => $search->ID, 'post_status' => 'publish', 'page_template' => 'page-no-sidebar' ) );
	$note( true, '/resources/search published' );
} else {
	$note( false, '/resources/search published' );
}
$rules = get_option( 'tracy_base_redirects' );
if ( is_string( $rules ) ) {
	$rules = json_decode( $rules, true );
}
if ( is_array( $rules ) ) {
	$kept = array_values( array_filter( $rules, static fn( $rule ) => '/resources/search' !== ( $rule['from'] ?? '' ) ) );
	if ( count( $kept ) !== count( $rules ) ) {
		update_option( 'tracy_base_redirects', $kept );
		$note( true, 'redirect /resources/search removed' );
	} else {
		$note( false, 'redirect /resources/search removed' );
	}
}

// ---------------------------------------------------------------- 6. Literal demo-copy edits
$edits = json_decode( base64_decode( (string) ( $args[0] ?? '' ) ), true );
if ( ! is_array( $edits['edits'] ?? null ) ) {
	$fail( 'pass the content edits file as the first argument (base64 JSON)' );
}
foreach ( $edits['edits'] as $edit ) {
	$ids = array();
	foreach ( $edit['pages'] ?? array( $edit['entity'] ) as $label ) {
		if ( preg_match( '~^page-(\d+)~', $label, $m ) ) {
			$ids[] = (int) $m[1];
		}
	}
	$posts = array_map( 'get_post', $ids );
	$from  = array_sum( array_map( static fn( $p ) => substr_count( $p->post_content, $edit['from'] ), $posts ) );
	$to    = array_sum( array_map( static fn( $p ) => substr_count( $p->post_content, $edit['to'] ), $posts ) );
	$what  = "edit \"{$edit['to']}\"";
	if ( 0 === $from && $to > 0 ) {
		$note( false, $what );
		continue;
	}
	if ( $from !== (int) $edit['count'] ) {
		$fail( "\"{$edit['from']}\" occurs $from times in " . implode( ', ', $ids ) . ", the edit expects {$edit['count']}" );
	}
	foreach ( $posts as $post ) {
		if ( str_contains( $post->post_content, $edit['from'] ) ) {
			$save( get_post( $post->ID ), str_replace( $edit['from'], $edit['to'], get_post( $post->ID )->post_content ), "$what in page {$post->ID}" );
		}
	}
}

echo wp_json_encode( $report );
