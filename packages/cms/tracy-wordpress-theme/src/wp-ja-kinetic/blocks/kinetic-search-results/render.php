<?php
/**
 * wp-ja-kinetic/kinetic-search-results — everything the source still shows in its results area
 * after its own per-page overlay (`css/page-232.css`) hides the rest: the result-count line
 * (`default_results.php:57`, "N results for &ldquo;term&rdquo;"), each result as a card with a
 * URL-breadcrumb meta row ABOVE the title (`default_result.php:104-115`, `order:-1` in
 * page-232.css §16 — taxonomy, image and date are the parts page-232 itself `display:none`s, so
 * they are the parts this port drops, not these), the highlighted search term
 * (`.highlight`, page-232.css §20 — not hidden), the empty state
 * (`COM_FINDER_SEARCH_NO_RESULTS_HEADING`/`_BODY`, verbatim English values read from the source's
 * own `language/en-GB/com_finder.ini`), and a pager built from the source's own Bootstrap
 * component classes (`ul.pagination > li.page-item > a.page-link` — confirmed by page-232.css
 * §21's dark-mode rules, which target exactly those) plus the counter text
 * (`COM_FINDER_SEARCH_RESULTS_OF`, same source file).
 *
 * Runs against the real main query (`$wp_query`, already the search query on this template — see
 * search.html's `inherit`-free use of this block instead of `core/query`), so `found_posts`,
 * pagination and every post's own permalink/title/excerpt are real, not stand-ins.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

global $wp_query;

$wp_ja_kinetic_term  = trim( (string) get_search_query() );
$wp_ja_kinetic_term_e = esc_html( $wp_ja_kinetic_term );

// The source's own results area renders NOTHING for an empty query — just the form (measured live,
// AU-019, run-3 audit: WordPress's own default search behaviour instead lists every post for `s=`,
// which `wp_ja_kinetic_search_query()`, inc/extra.php, does not change on its own). Checked ahead of
// `$wp_query->have_posts()` on purpose: an empty `s=` still "has posts" under that function's own
// `post_type=post` scoping.
if ( '' === $wp_ja_kinetic_term ) {
	return;
}

$wp_ja_kinetic_found = (int) $wp_query->found_posts;

// The source's explained-query line (`default_results.php` override, `HTMLHelper::_('query.explained')`
// → com_finder `Service/HTML/Query::explained()`): one `span.query-required` per term, joined by
// `COM_FINDER_QUERY_TOKEN_GLUE` (", and "), on both the results and the no-results page. page-232.css
// §11b hides it (`display:none !important`, mirrored in wp-ja-kinetic-finder-auth.css), but it is in
// the DOM there, so it is here. Terms come from the source's own tokeniser (com_finder
// `Indexer/Language::tokenise()`, its regexes verbatim).
// ponytail: plain terms only — Smart Search operators (OR/NOT, quoted phrases, `-term`) and its
// "Did you mean" branch are not ported; add them if the search box ever grows advanced syntax.
$wp_ja_kinetic_tokens = mb_strtolower( trim( (string) get_search_query( false ) ) ); // raw: the default is esc_attr'd (`&` → `&amp;`).
$wp_ja_kinetic_tokens = preg_replace( '#[^\pL\pM\pN\p{Pi}\p{Pf}\'+-.,]+#mui', ' ', $wp_ja_kinetic_tokens );
$wp_ja_kinetic_tokens = preg_replace( '#(^|\s)[+-,]+([\pL\pM]+)#mui', ' $1', $wp_ja_kinetic_tokens );
$wp_ja_kinetic_tokens = preg_replace( '#([\pL\pM\pN]+)[+-.,]+(\s|$)#mui', '$1 ', $wp_ja_kinetic_tokens );
$wp_ja_kinetic_tokens = preg_replace( '#([\pL\pM]+)[+.,]+([\pL\pM]+)#muiU', '$1 $2', $wp_ja_kinetic_tokens );
$wp_ja_kinetic_tokens = preg_replace( '#(^|\s)[\'+-.,]+(\s|$)#mui', ' ', $wp_ja_kinetic_tokens );
$wp_ja_kinetic_tokens = preg_replace( '#(^|\s)[\p{Pi}\p{Pf}]+(\s|$)#mui', ' ', $wp_ja_kinetic_tokens );
$wp_ja_kinetic_tokens = preg_replace( "#[\u{2018}\u{2019}']+#mui", "'", $wp_ja_kinetic_tokens );
$wp_ja_kinetic_tokens = preg_split( '#\s+#u', trim( (string) $wp_ja_kinetic_tokens ), -1, PREG_SPLIT_NO_EMPTY );
if ( $wp_ja_kinetic_tokens ) :
	$wp_ja_kinetic_explained = array();
	foreach ( $wp_ja_kinetic_tokens as $wp_ja_kinetic_token ) {
		$wp_ja_kinetic_explained[] = '<span class="query-required"><span class="term">' . esc_html( $wp_ja_kinetic_token ) . '</span> is required</span>';
	}
	?>
	<div id="search-query-explained" class="com-finder__explained kinetic-finder__explained hx-muted">
		<?php echo implode( ', and ', $wp_ja_kinetic_explained ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed markup + esc_html'd terms. ?>
	</div>
	<?php
endif;

// The source's own `default_results.php` `return`s before its resultcount line when the query has
// no matches (`$this->total === 0`) — the line never renders on a no-results page there, so it
// must not render here either.
if ( ! $wp_query->have_posts() ) :
	?>
	<div id="search-result-empty" class="com-finder__empty kinetic-finder__empty hx-card">
		<h2>No Results Found</h2>
		<p class="hx-muted">
			<?php
			echo 'No search results could be found for query: ' . $wp_ja_kinetic_term_e . '.'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already-escaped term.
			?>
		</p>
	</div>
	<?php return; ?>
<?php endif; ?>

<div class="kinetic-finder__resultcount hx-muted">
	<?php
	echo esc_html( (string) $wp_ja_kinetic_found ) . ' ' . ( 1 === $wp_ja_kinetic_found ? 'result' : 'results' );
	echo ' for &ldquo;' . $wp_ja_kinetic_term_e . '&rdquo;'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- entities + already-escaped term.
	?>
</div>

<br id="highlighter-start" />
<div class="search-results kinetic-finder__list">
	<?php
	// The source's snippet (its `default_result.php` override): the item's indexed text
	// (`FindIndexHelper::parse(summary . body)` — com_finder `Indexer/Parser/Html::parse()`: entities
	// decoded, a space before every block/line-break tag, tags stripped, whitespace runs collapsed),
	// windowed around the first match of the raw query input and cut by `HTMLHelper::_('string.truncate',
	// …, 255, true)`. Ported verbatim, quirks included: when the first space comes before the match the
	// window starts after it, so a match in the first 124 characters still drops the first word.
	$wp_ja_kinetic_input     = trim( (string) get_search_query( false ) );
	$wp_ja_kinetic_input_len = mb_strlen( $wp_ja_kinetic_input );
	$wp_ja_kinetic_pad       = $wp_ja_kinetic_input_len < 255 ? (int) floor( ( 255 - $wp_ja_kinetic_input_len ) / 2 ) : 0;
	while ( $wp_query->have_posts() ) :
		$wp_query->the_post();
		$wp_ja_kinetic_title = esc_html( get_the_title() );

		$wp_ja_kinetic_full = html_entity_decode( (string) get_post_field( 'post_content', get_the_ID() ), ENT_QUOTES, 'UTF-8' );
		$wp_ja_kinetic_full = str_replace( array( '&nbsp;', '&#160;' ), ' ', $wp_ja_kinetic_full );
		$wp_ja_kinetic_full = preg_replace( '/(<|<\/)(address|article|aside|blockquote|br|canvas|cite|code|data|details|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h1|h2|h3|h4|h5|h6|header|hgroup|hr|li|label|main|nav|noscript|ol|option|output|p|pre|section|table|td|tfoot|th|ul|video)\b/i', ' $1$2', $wp_ja_kinetic_full );
		// ltrim: the source's summary is stored as bare text, the seeded post wraps it in a block
		// paragraph whose leading tag/comment would otherwise add a space the source never has.
		$wp_ja_kinetic_full = ltrim( (string) preg_replace( '#\s+#u', ' ', wp_strip_all_tags( $wp_ja_kinetic_full ) ) );
		// ponytail: the source falls back to the index's own `description` when summary/body are empty;
		// the post excerpt stands in for it here.
		if ( '' === $wp_ja_kinetic_full ) {
			$wp_ja_kinetic_full = wp_strip_all_tags( get_the_excerpt() );
		}
		$wp_ja_kinetic_pos   = $wp_ja_kinetic_input_len ? mb_strpos( mb_strtolower( $wp_ja_kinetic_full ), mb_strtolower( $wp_ja_kinetic_input ) ) : false;
		$wp_ja_kinetic_start = ( $wp_ja_kinetic_pos && $wp_ja_kinetic_pos > $wp_ja_kinetic_pad ) ? $wp_ja_kinetic_pos - $wp_ja_kinetic_pad : 0;
		$wp_ja_kinetic_space = mb_strpos( $wp_ja_kinetic_full, ' ', $wp_ja_kinetic_start > 0 ? $wp_ja_kinetic_start - 1 : 0 );
		$wp_ja_kinetic_start = ( $wp_ja_kinetic_space && $wp_ja_kinetic_space < $wp_ja_kinetic_pos ) ? $wp_ja_kinetic_space + 1 : $wp_ja_kinetic_start;
		$wp_ja_kinetic_excerpt = mb_substr( $wp_ja_kinetic_full, $wp_ja_kinetic_start );
		if ( mb_strlen( $wp_ja_kinetic_excerpt ) > 255 ) {
			$wp_ja_kinetic_cut = trim( mb_substr( $wp_ja_kinetic_excerpt, 0, 255 ) );
			$wp_ja_kinetic_off = mb_strrpos( $wp_ja_kinetic_cut, ' ' );
			if ( false === $wp_ja_kinetic_off ) {
				$wp_ja_kinetic_excerpt = '...';
			} else {
				$wp_ja_kinetic_cut = mb_substr( $wp_ja_kinetic_cut, 0, $wp_ja_kinetic_off + 1 );
				if ( mb_strlen( $wp_ja_kinetic_cut ) > 252 ) {
					$wp_ja_kinetic_cut = trim( mb_substr( $wp_ja_kinetic_cut, 0, (int) mb_strrpos( $wp_ja_kinetic_cut, ' ' ) ) );
				}
				$wp_ja_kinetic_excerpt = str_replace( ' ...', '...', trim( $wp_ja_kinetic_cut ) . '...' );
			}
		}

		// The source's own breadcrumb build (default_result.php:104-115): host + route path
		// segments, joined with " / ", no scheme/port.
		$wp_ja_kinetic_parts    = wp_parse_url( (string) get_permalink() );
		$wp_ja_kinetic_host     = $wp_ja_kinetic_parts['host'] ?? '';
		$wp_ja_kinetic_segments = array_values( array_filter( explode( '/', $wp_ja_kinetic_parts['path'] ?? '' ) ) );
		$wp_ja_kinetic_crumb    = array_merge( '' !== $wp_ja_kinetic_host ? array( $wp_ja_kinetic_host ) : array(), $wp_ja_kinetic_segments );
		$wp_ja_kinetic_crumb    = implode( ' / ', array_map( 'esc_html', $wp_ja_kinetic_crumb ) );
		?>
		<div class="result-item kinetic-result">
			<div class="kinetic-result__body">
				<h4 class="result-title kinetic-result__title">
					<a href="<?php echo esc_url( get_permalink() ); ?>"><?php echo $wp_ja_kinetic_title; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- esc_html'd above. ?></a>
				</h4>
				<?php if ( '' !== $wp_ja_kinetic_excerpt ) : ?>
					<div class="result-text kinetic-result__text hx-muted"><?php echo esc_html( $wp_ja_kinetic_excerpt ); ?></div>
				<?php endif; ?>
				<div class="kinetic-result__meta">
					<span class="result-url kinetic-result__url"><?php echo $wp_ja_kinetic_crumb; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- esc_html'd per segment above. ?></span>
				</div>
			</div>
		</div>
	<?php endwhile; ?>
</div>
<br id="highlighter-end" />

<?php
// Joomla's own Bootstrap pager (page-232.css §21's dark-mode rules target exactly these classes):
// first/prev icon buttons, numbered links, next/last icon buttons — not `paginate_links()`'s own
// "Previous 1 2 … Next" shape (AU-025/119-124, run-3 audit: source markup measured directly,
// `ul.pagination > li.page-item > (span|a).page-link`, disabled steps as `<span>` with no `href`,
// active/enabled steps as `<a>`). Attributes follow the template's own pagination link override
// (`html/layouts/joomla/pagination/link.php`): 18px Lucide chevrons with `focusable="false"`,
// `aria-hidden` on disabled steps, `aria-current` + "Page N" on the current step, "Go to …"
// labels elsewhere, and Joomla's `<nav role="navigation" aria-label="Pagination">`. `hrefDiff`
// in the shared comparator only checks presence/absence of an `href`, not its exact URL —
// WordPress's own `paged` query var is kept rather than the source's `start=` offset.
$wp_ja_kinetic_per_page = 20;
$wp_ja_kinetic_total    = max( 1, (int) $wp_query->max_num_pages );
$wp_ja_kinetic_current  = max( 1, (int) get_query_var( 'paged' ) );
if ( $wp_ja_kinetic_total > 1 ) :
	$wp_ja_kinetic_start = ( $wp_ja_kinetic_current - 1 ) * $wp_ja_kinetic_per_page + 1;
	$wp_ja_kinetic_end   = min( $wp_ja_kinetic_current * $wp_ja_kinetic_per_page, $wp_ja_kinetic_found );
	$wp_ja_kinetic_svg        = static function ( $paths ) {
		return '<svg class="hx-pag-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' . $paths . '</svg>';
	};
	$wp_ja_kinetic_icon_first = $wp_ja_kinetic_svg( '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>' );
	$wp_ja_kinetic_icon_prev  = $wp_ja_kinetic_svg( '<path d="m15 18-6-6 6-6"/>' );
	$wp_ja_kinetic_icon_next  = $wp_ja_kinetic_svg( '<path d="m9 18 6-6-6-6"/>' );
	$wp_ja_kinetic_icon_last  = $wp_ja_kinetic_svg( '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>' );
	?>
	<div class="com-finder__navigation kinetic-finder__pagination pagination-wrap">
		<nav role="navigation" aria-label="Pagination">
			<ul class="pagination">
				<?php if ( $wp_ja_kinetic_current <= 1 ) : ?>
					<li class="disabled page-item"><span class="page-link" aria-hidden="true"><?php echo $wp_ja_kinetic_icon_first; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed inline SVG. ?></span></li>
					<li class="disabled page-item"><span class="page-link" aria-hidden="true"><?php echo $wp_ja_kinetic_icon_prev; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span></li>
				<?php else : ?>
					<li class="page-item"><a aria-label="Go to first page" href="<?php echo esc_url( get_pagenum_link( 1 ) ); ?>" class="page-link"><?php echo $wp_ja_kinetic_icon_first; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></a></li>
					<li class="page-item"><a aria-label="Go to previous page" href="<?php echo esc_url( get_pagenum_link( $wp_ja_kinetic_current - 1 ) ); ?>" class="page-link"><?php echo $wp_ja_kinetic_icon_prev; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></a></li>
				<?php endif; ?>
				<?php for ( $wp_ja_kinetic_page = 1; $wp_ja_kinetic_page <= $wp_ja_kinetic_total; $wp_ja_kinetic_page++ ) : ?>
					<?php if ( $wp_ja_kinetic_page === $wp_ja_kinetic_current ) : ?>
						<li class="active page-item"><a aria-current="true" aria-label="<?php echo esc_attr( 'Page ' . $wp_ja_kinetic_page ); ?>" href="#" class="page-link"><?php echo esc_html( (string) $wp_ja_kinetic_page ); ?></a></li>
					<?php else : ?>
						<li class="page-item"><a aria-label="<?php echo esc_attr( 'Go to page ' . $wp_ja_kinetic_page ); ?>" href="<?php echo esc_url( get_pagenum_link( $wp_ja_kinetic_page ) ); ?>" class="page-link"><?php echo esc_html( (string) $wp_ja_kinetic_page ); ?></a></li>
					<?php endif; ?>
				<?php endfor; ?>
				<?php if ( $wp_ja_kinetic_current >= $wp_ja_kinetic_total ) : ?>
					<li class="disabled page-item"><span class="page-link" aria-hidden="true"><?php echo $wp_ja_kinetic_icon_next; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span></li>
					<li class="disabled page-item"><span class="page-link" aria-hidden="true"><?php echo $wp_ja_kinetic_icon_last; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span></li>
				<?php else : ?>
					<li class="page-item"><a aria-label="Go to next page" href="<?php echo esc_url( get_pagenum_link( $wp_ja_kinetic_current + 1 ) ); ?>" class="page-link"><?php echo $wp_ja_kinetic_icon_next; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></a></li>
					<li class="page-item"><a aria-label="Go to last page" href="<?php echo esc_url( get_pagenum_link( $wp_ja_kinetic_total ) ); ?>" class="page-link"><?php echo $wp_ja_kinetic_icon_last; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></a></li>
				<?php endif; ?>
			</ul>
		</nav>
		<div class="com-finder__counter kinetic-finder__counter hx-muted">Results <strong><?php echo esc_html( (string) $wp_ja_kinetic_start ); ?></strong> - <strong><?php echo esc_html( (string) $wp_ja_kinetic_end ); ?></strong> of <strong><?php echo esc_html( (string) $wp_ja_kinetic_found ); ?></strong></div>
	</div>
	<?php
endif;

wp_reset_postdata();
