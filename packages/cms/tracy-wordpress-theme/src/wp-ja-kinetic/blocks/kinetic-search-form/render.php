<?php
/**
 * wp-ja-kinetic/kinetic-search-form — the source's Smart Search field
 * (html/com_finder/search/default_form.php), posting to WordPress's own search instead of
 * com_finder's indexer. `name="s"` is WordPress's real search query var; the source's own
 * `id="q"` and every class stay, since those are what the block's CSS and the finder's own JS
 * hook name (`js-finder-search-query`) select. The advanced-search filters are markup only: they
 * filter Joomla's indexed taxonomy, which WordPress core search has no equivalent index for.
 *
 * The Advanced Search toggle + fieldset (`__advtoggle`/`__advanced`/`#advancedSearch`) is kept in
 * markup for the same reason as the login/register password toggle (kinetic-auth-login/render.php's
 * own doc comment): the source's own page-232.css §8c hides it too ("kept in markup for functional
 * fallback but not shown"), it is not a WordPress limit — the tips copy is the source's own,
 * verbatim from the running source's `#com-finder__tips` (`html/com_finder/search/default_form.php`
 * ships the same fixed English copy regardless of the index, so no live search index is needed to
 * reproduce it).
 *
 * The filter list (`#finder-filter-window`) is the source's `HTMLHelper::_('filter.select')` output
 * once its Smart Search index is populated (empty only while the index is): one `.filter-branch`
 * with a `.control-group` + `select#tax-<branch>.form-select.advancedSelect[name="t[]"]` per
 * taxonomy branch, "Search All" first. Category and Author come from WordPress's own terms and
 * post authors (depth marked with one `-` per level, as the source prints it); Type and Language
 * are the source site's configuration (its four enabled Smart Search content plugins, and content
 * language `*`, printed "All"). No select carries `disabled`, as on the source: the source's
 * finder.js disables each empty filter select at submit time so it is not sent, and
 * assets/js/wp-ja-kinetic-auth-finder.js does the same here.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

// The source's form posts back to its own search page, root-relative, carrying the current query
// (`/index.php/pages/search?q=…`, bare path when there is none); WordPress's search page is `/?s=…`.
// `#search-form` is the id of the template's `.com-finder__form` wrapper on the source, not the form's.
$kinetic_search_query  = get_search_query( false );
$kinetic_search_action = '' === $kinetic_search_query ? home_url( '/' ) : add_query_arg( 's', rawurlencode( $kinetic_search_query ), home_url( '/' ) );

// Filter branches: slug => [ label, [ value => option text ] ].
$kinetic_search_categories = array();
$kinetic_search_terms      = array();
foreach ( get_terms( array( 'taxonomy' => 'category', 'hide_empty' => false, 'orderby' => 'name' ) ) as $kinetic_search_term ) {
	$kinetic_search_terms[ $kinetic_search_term->parent ][] = $kinetic_search_term;
}
$kinetic_search_walk = static function ( $parent, $depth ) use ( &$kinetic_search_walk, &$kinetic_search_categories, $kinetic_search_terms ) {
	foreach ( $kinetic_search_terms[ $parent ] ?? array() as $term ) {
		$kinetic_search_categories[ $term->term_id ] = str_repeat( '-', $depth ) . $term->name;
		$kinetic_search_walk( $term->term_id, $depth + 1 );
	}
};
$kinetic_search_walk( 0, 0 );
$kinetic_search_authors = array();
foreach ( get_users( array( 'has_published_posts' => array( 'post' ), 'orderby' => 'display_name', 'order' => 'ASC', 'fields' => array( 'ID', 'display_name' ) ) ) as $kinetic_search_user ) {
	$kinetic_search_authors[ $kinetic_search_user->ID ] = $kinetic_search_user->display_name;
}
$kinetic_search_branches = array(
	'type'     => array( 'Type', array( 'article' => 'Articles', 'category' => 'Categories', 'contact' => 'Contacts', 'tag' => 'Tags' ) ),
	'language' => array( 'Language', array( '*' => 'All' ) ),
	'category' => array( 'Category', $kinetic_search_categories ),
	'author'   => array( 'Author', $kinetic_search_authors ),
);
?>
<form action="<?php echo esc_url( wp_make_link_relative( $kinetic_search_action ) ); ?>" method="get" class="js-finder-searchform kinetic-finder__searchform">
	<fieldset class="com-finder__search word">
		<legend class="visually-hidden">Search Form</legend>
		<label for="q" class="visually-hidden">Search Terms:</label>
		<div class="kinetic-finder__field">
			<span class="kinetic-finder__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg></span>
			<input type="text" name="s" id="q" class="js-finder-search-query kinetic-finder__input" value="<?php echo esc_attr( get_search_query() ); ?>" placeholder="Search Terms:">
			<button type="submit" class="hx-btn hx-btn--primary kinetic-finder__submit">Search</button>
			<button class="hx-btn hx-btn--ghost kinetic-finder__advtoggle" type="button" data-bs-toggle="collapse" data-bs-target="#advancedSearch" aria-expanded="false">
				<span class="icon-options" aria-hidden="true"></span>
				Advanced Search
			</button>
		</div>
	</fieldset>

	<fieldset id="advancedSearch" class="com-finder__advanced js-finder-advanced kinetic-finder__advanced collapse">
		<legend class="visually-hidden">Advanced Search</legend>
		<div class="com-finder__tips hx-card kinetic-finder__tips">
			<p>Here are a few examples of how you can use the search feature:</p>
			<p>Entering <strong>this and that</strong> into the search form will return results containing both &quot;this&quot; and &quot;that&quot;.</p>
			<p>Entering <strong>this not that</strong> into the search form will return results containing &quot;this&quot; and not &quot;that&quot;.</p>
			<p>Entering <strong>this or that</strong> into the search form will return results containing either &quot;this&quot; or &quot;that&quot;.</p>
			<p>Search results can also be filtered using a variety of criteria. Select one or more filters below to get started.</p>
		</div>
		<div id="finder-filter-window" class="com-finder__filter kinetic-finder__filter">
			<div class="filter-branch">
			<?php foreach ( $kinetic_search_branches as $kinetic_search_slug => list( $kinetic_search_label, $kinetic_search_options ) ) : ?>
				<div class="control-group">
					<div class="control-label"><label for="tax-<?php echo esc_attr( $kinetic_search_slug ); ?>">Search by <?php echo esc_html( $kinetic_search_label ); ?></label></div>
					<div class="controls"><select id="tax-<?php echo esc_attr( $kinetic_search_slug ); ?>" name="t[]" class="form-select advancedSelect">
						<option value="" selected="selected">Search All</option>
						<?php foreach ( $kinetic_search_options as $kinetic_search_value => $kinetic_search_text ) : ?>
						<option value="<?php echo esc_attr( (string) $kinetic_search_value ); ?>"><?php echo esc_html( $kinetic_search_text ); ?></option>
						<?php endforeach; ?>
					</select></div>
				</div>
			<?php endforeach; ?>
			</div>
		</div>
	</fieldset>
</form>
