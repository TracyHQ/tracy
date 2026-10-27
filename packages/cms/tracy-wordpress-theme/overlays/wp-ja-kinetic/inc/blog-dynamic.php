<?php
/**
 * wp-ja-kinetic — the live parts of `/product/blog` (Itemid 221) and `/pages/engineering`
 * (Itemid 253) that a static block template cannot express: the featured-read card (needs a
 * second query that excludes the post it already shows from the paginated grid below it) and
 * every real count (`$term->count`, a live DB value — no core block renders one). Shared helpers
 * here; the dynamic blocks that use them are under `blocks/`.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

/** The WP term for the source's `field-notes-from-the-on-call` category (Itemid 221), or null off a stand that has not seeded it. */
function wp_ja_kinetic_field_notes_term(): ?WP_Term {
	static $term = null;
	static $looked_up = false;
	if ( ! $looked_up ) {
		$looked_up = true;
		$found     = get_category_by_slug( 'field-notes-from-the-on-call' );
		$term      = $found instanceof WP_Term ? $found : null;
	}
	return $term;
}

/**
 * The category term for ANY category archive being viewed right now, or null off any other
 * view. Generalizes `wp_ja_kinetic_field_notes_term()` above (which stays hardcoded — it backs
 * `blog-rail`, registered only on the dedicated blog template) so the SAME "featured read" /
 * "browse strip" / "// NN posts" behaviour the source's `category/blog.php` renders for every
 * category (not just the top one) works on the 5 child-category archives too, which route
 * through the generic `category.html` template.
 *
 * Resolved off `category_name` (the query var `parse_query()` itself sets from the rewrite rule),
 * NOT `get_queried_object()` — this is called from `wp_ja_kinetic_category_featured_post()` below,
 * which in turn runs from the `pre_get_posts`-hooked exclusion filter, where the queried object is
 * not resolved yet (measured live 2026-09-22, same constraint `wp_ja_kinetic_exclude_category_
 * descendants()` documents for `cat`). `category_name` can be a full `parent/child` path; only the
 * leaf slug names an actual term.
 */
function wp_ja_kinetic_current_category_term(): ?WP_Term {
	if ( ! is_category() ) {
		return null;
	}
	$slug = (string) get_query_var( 'category_name' );
	if ( '' === $slug ) {
		return null;
	}
	if ( false !== strpos( $slug, '/' ) ) {
		$parts = explode( '/', trim( $slug, '/' ) );
		$slug  = (string) end( $parts );
	}
	$term = get_category_by_slug( $slug );
	return $term instanceof WP_Term ? $term : null;
}

/**
 * True for the listing of one of the blog's child categories (Incident retros, Product, Tutorials,
 * Practice, Culture) — not the blog's own top list and not Engineering, which has its own layout.
 * These are the lists whose row eyebrows and equal-date order differ from the top list's: the source
 * lets the database settle both per page, so the same two articles can swap places between lists.
 *
 * @param WP_Term|null $term The category being listed; null when there is none.
 */
function wp_ja_kinetic_is_child_listing( ?WP_Term $term ): bool {
	return $term instanceof WP_Term && (int) $term->parent > 0 && 'engineering' !== $term->slug;
}

/**
 * Which way articles with the same date go in a category's list. The source's ORDER BY leaves them to
 * the database: the top list and Engineering show the older id first (135 before 165, 87 before 162),
 * the five child lists the newer one (Practice page 2: article 296 before 109, the only tie there).
 *
 * @param WP_Term|null $term The category being listed.
 * @return string 'ASC' or 'DESC'.
 */
function wp_ja_kinetic_listing_tie_order( ?WP_Term $term ): string {
	return wp_ja_kinetic_is_child_listing( $term ) ? 'DESC' : 'ASC';
}

/**
 * The topic eyebrow of an article: its first tag by assignment order, else its category's name. On a
 * child category's list it is the tag the source printed on that list (post meta
 * `wp_ja_kinetic_listing_topic`, written by the post-seed step from the source's own page query);
 * the source does not pick the same tag for an article on every list, so the top list keeps the
 * assignment-order tag.
 *
 * @param int  $post_id    The article.
 * @param bool $in_listing True where a child category's list is being drawn.
 * @return string Empty when the article has neither tag nor category.
 */
function wp_ja_kinetic_post_topic( int $post_id, bool $in_listing = true ): string {
	if ( $in_listing && wp_ja_kinetic_is_child_listing( wp_ja_kinetic_current_category_term() ) ) {
		$topic = trim( (string) get_post_meta( $post_id, 'wp_ja_kinetic_listing_topic', true ) );
		if ( '' !== $topic ) {
			return $topic;
		}
	}
	$tags = wp_get_object_terms( $post_id, 'post_tag', array( 'orderby' => 'term_order' ) );
	if ( $tags && ! is_wp_error( $tags ) && isset( $tags[0] ) ) {
		return (string) $tags[0]->name;
	}
	$cats = get_the_category( $post_id );
	return $cats ? (string) $cats[0]->name : '';
}

/**
 * True on page 1 of the category archive currently being viewed — the one place the source's
 * `category/blog.php` lifts its newest post into a separate featured card (`array_shift($rows)`,
 * gated `$this->pagination->pagesCurrent <= 1`). Engineering (`category/thumbs.php`) never does
 * this lift, so it is excluded here too — its template does not call the featured block at all,
 * but the query-exclusion filter below shares this same gate.
 */
function wp_ja_kinetic_on_category_page_one(): bool {
	$term = wp_ja_kinetic_current_category_term();
	if ( ! $term || 'engineering' === $term->slug ) {
		return false;
	}
	return (int) get_query_var( 'paged' ) <= 1;
}

/**
 * The featured post: the newest published post in the category archive currently being viewed,
 * only on page 1 (source: `array_shift($rows)` where `$rows` is newest-first). Cached per request
 * so the featured block and the query-exclusion filter below agree on the same post without
 * querying twice.
 */
function wp_ja_kinetic_category_featured_post(): ?WP_Post {
	static $post      = null;
	static $looked_up = false;
	if ( $looked_up ) {
		return $post;
	}
	$looked_up = true;
	if ( ! wp_ja_kinetic_on_category_page_one() ) {
		return null;
	}
	$term = wp_ja_kinetic_current_category_term();
	if ( ! $term ) {
		return null;
	}
	$query = new WP_Query(
		array(
			'post_type'      => array( 'post', 'page' ),
			'category__in'   => array( $term->term_id ),
			'posts_per_page' => 1,
			// Same tie-break as the grid below (`wp_ja_kinetic_force_posts_per_page()`), so both agree on "newest".
			'orderby'        => array(
				'date' => 'DESC',
				'ID'   => wp_ja_kinetic_listing_tie_order( $term ),
			),
			'no_found_rows'  => true,
			'ignore_sticky_posts' => true,
		)
	);
	$post = $query->have_posts() ? $query->posts[0] : null;
	return $post;
}

/**
 * Drops the featured post from the paginated grid's RESULT ARRAY (not the query itself) — the
 * WordPress equivalent of the source's `array_shift($rows)` on a fixed 6-item array: no backfill
 * from a 7th post, and no change to the pagination math either. Runs for any category archive
 * (see `wp_ja_kinetic_category_featured_post()` above); a no-op everywhere else, including
 * engineering, where that helper already returns null.
 *
 * `the_posts`, NOT `pre_get_posts` + `post__not_in`: excluding the id from the QUERY (tried first,
 * measured live 2026-09-22) back-fills the grid with a 7th post instead of shrinking to 5 — Query
 * Loop's `posts_per_page` still asks for 6 candidates, `post__not_in` just widens the pool it
 * pulls them from. It also desyncs `found_posts`/`max_num_pages` from the source's own pagination
 * math, which counts the FULL un-shifted total at the FULL per-page size (`$this->pagination`,
 * computed off `$this->category->getNumItems()` and the menu's `num_intro_articles`, BEFORE
 * `array_shift($rows)` runs) — "Page 1 of 11" off 61 posts at 6/page, not "Page 1 of 13" off a
 * reduced 5/page. `the_posts` runs strictly AFTER `WP_Query` has already set both of those from
 * the un-shifted query, so trimming the returned array here changes only what actually renders.
 *
 * @param WP_Post[] $posts The posts this query is about to return.
 * @param WP_Query  $query The query.
 * @return WP_Post[]
 */
function wp_ja_kinetic_exclude_featured_post( array $posts, WP_Query $query ): array {
	if ( is_admin() || ! $query->is_main_query() || ! $query->is_category() ) {
		return $posts;
	}
	if ( (int) $query->get( 'paged' ) > 1 ) {
		return $posts;
	}
	$featured = wp_ja_kinetic_category_featured_post();
	if ( ! $featured ) {
		return $posts;
	}
	return array_values(
		array_filter(
			$posts,
			static function ( WP_Post $post ) use ( $featured ): bool {
				return $post->ID !== $featured->ID;
			}
		)
	);
}
add_filter( 'the_posts', 'wp_ja_kinetic_exclude_featured_post', 10, 2 );

/**
 * Scopes a category archive to that category's OWN posts only — WordPress's default
 * `category_name`/`cat` query var includes every DESCENDANT category's posts too (`WP_Tax_Query`
 * sets `include_children => true` for those shortcuts), which the source never does: each
 * Joomla category page queries `a.catid = $catId` alone (`category/blog.php`,
 * `category/thumbs.php`'s own fallback query). Measured live: `/category/field-notes-from-the-
 * on-call/` returned 240 posts (`cat=77` including all 6 children) against the source's 61
 * (`catid = 22` only).
 *
 * Adds `category__in` as an EXTRA, exact-match tax query rather than replacing `cat`/
 * `category_name` — `WP_Query` combines separate category shortcuts with `relation => AND`, so
 * the two clauses intersect down to exactly this one category, with no reordering risk against
 * the filters above/below that still read `cat`/`category_name` off the same query.
 *
 * `cat` itself is NOT resolved yet at this point on this stand's plain-permalink setup — only
 * `category_name` (the slug, set straight from the rewrite rule) is reliable here, same
 * constraint `wp_ja_kinetic_exclude_featured_post()`'s docblock already documents; measured
 * live 2026-09-22, `$query->get('cat')` returned empty while `category_name` carried the real
 * slug on the exact same request. A `category_name` path can be a full `parent/child` chain;
 * only the LEAF slug names an actual term.
 *
 * @param WP_Query $query The query WordPress is about to run.
 */
function wp_ja_kinetic_exclude_category_descendants( WP_Query $query ): void {
	if ( is_admin() || ! $query->is_main_query() || ! $query->is_category() ) {
		return;
	}
	$term = wp_ja_kinetic_current_category_term();
	if ( ! $term ) {
		return;
	}
	$query->set( 'category__in', array( $term->term_id ) );
}
add_action( 'pre_get_posts', 'wp_ja_kinetic_exclude_category_descendants' );

/**
 * Forces the real per-page count on views whose `wp:query` block uses `inherit: true` — core's
 * own inherited-query rendering (`wp-includes/blocks/post-template.php`) reuses `$wp_query`
 * as-is and never reads the block's own `query.perPage` attribute for an inherited query
 * (verified live: setting `perPage` in the block markup on these templates had no effect,
 * `max_num_pages` stayed keyed to the site's Reading-settings `posts_per_page` instead), so the
 * count has to be set here instead, the same way `wp_ja_kinetic_exclude_featured_post()` above
 * already has to reach the main query on `pre_get_posts` rather than through block markup. The
 * same reason the block's `order`/`orderBy` attributes are ignored too — the tag-archive branch
 * below sets those explicitly.
 *
 * - Every category archive: 6, source's own `num_intro_articles` menu-item override, the same
 *   value on `product/blog` (Itemid 221), `pages/engineering` (Itemid 253) AND every plain
 *   category route the 5 child categories use (measured live: `/product/blog/30-incident-
 *   retros` renders "Page 1 of 5" off 29 posts — `ceil(29/6) = 5`).
 * - Tag archives: 20 (`TagModel.php:211`, Joomla's global `list_limit` default), title ascending
 *   (`TagModel.php:228,237` — the view's own default sort, not the date-desc every other listing
 *   here uses).
 * - Author archives: `num_intro_articles` off the GLOBAL com_content options (4) — the dedicated
 *   `pages/author` menu item (Itemid 254) carries no per-item override, unlike blog/engineering
 *   above (measured live in `#__extensions` params for `com_content`). The source's custom
 *   author view never paginates past that first page either (`author_posts.php` loops whatever
 *   `list.limit` handed it, no pager markup at all), so `wp-ja-kinetic/kinetic-pagination` still
 *   never has a second page to render here.
 *
 * @param WP_Query $query The query WordPress is about to run.
 */
function wp_ja_kinetic_force_posts_per_page( WP_Query $query ): void {
	if ( is_admin() || ! $query->is_main_query() ) {
		return;
	}
	if ( $query->is_category() ) {
		$query->set( 'posts_per_page', 6 );
		// The category's articles, posts and pages alike: the source has one article type, and an
		// article with its own menu item (`/pages/kineticql`, a Page here) is a row of its blog list.
		$query->set( 'post_type', array( 'post', 'page' ) );
		// Same-date posts in the source's own order: its ORDER BY (`CategoryModel::
		// _buildContentOrderBy()`, "a.created DESC, a.created") leaves equal dates to the DB's
		// row order, which renders them oldest id first on the top list (measured on `/product/blog`:
		// 135 before 165, 87 before 162) and newest id first on a child list (Practice: 296 before
		// 109). Core's plain `ORDER BY post_date DESC` returned 165's post first.
		$tie_term = wp_ja_kinetic_current_category_term();
		$query->set( 'orderby', array( 'date' => 'DESC', 'ID' => wp_ja_kinetic_listing_tie_order( $tie_term ) ) );
		return;
	}
	if ( $query->is_tag() ) {
		$query->set( 'posts_per_page', 20 );
		$query->set( 'orderby', 'title' );
		$query->set( 'order', 'ASC' );
		return;
	}
	if ( $query->is_author() ) {
		$query->set( 'posts_per_page', 4 );
	}
}
add_action( 'pre_get_posts', 'wp_ja_kinetic_force_posts_per_page' );

/**
 * Every category term id in the source's nested-set (`lft`) order: parents before their
 * children, siblings by `term_id` — the same native stand-in for Joomla's admin category order
 * that `blocks/categories-index/render.php` already uses (WordPress has no category order of
 * its own). On this stand that reproduces the source's `lft` exactly: uncategorised (lft 1),
 * blog (11) then its six children (12–22), legal (25).
 *
 * @return int[]
 */
function wp_ja_kinetic_category_tree_order(): array {
	$children = array();
	foreach ( get_terms( array( 'taxonomy' => 'category', 'hide_empty' => false, 'orderby' => 'term_id', 'order' => 'ASC' ) ) as $term ) {
		$children[ (int) $term->parent ][] = (int) $term->term_id;
	}
	$order = array();
	$walk  = static function ( int $parent ) use ( &$walk, &$order, $children ): void {
		foreach ( $children[ $parent ] ?? array() as $id ) {
			$order[] = $id;
			$walk( $id );
		}
	};
	$walk( 0 );
	return $order;
}

/**
 * Author archive order, as the source's author view sorts it (`AuthorModel::_buildContentOrderBy()`
 * with the global com_content options `orderby_pri` "order", `orderby_sec` "rdate", `order_date`
 * "published"): `c.lft, a.publish_up DESC, a.created` — the article's category position in the
 * category tree first, then newest first. Core only knows `post_date DESC`, which put a newer
 * Tutorials post before the older Field Notes posts the source lists. `post_date` carries the
 * source's `publish_up`; `ID ASC` settles equal dates the way the category branch above does.
 *
 * @param string   $orderby The ORDER BY clause WordPress built.
 * @param WP_Query $query   The query being run.
 * @return string
 */
function wp_ja_kinetic_author_archive_orderby( string $orderby, WP_Query $query ): string {
	if ( is_admin() || ! $query->is_main_query() || ! $query->is_author() ) {
		return $orderby;
	}
	$ids = implode( ',', wp_ja_kinetic_category_tree_order() );
	if ( '' === $ids ) {
		return $orderby;
	}
	global $wpdb;
	return "(SELECT MIN(FIELD(tt.term_id, {$ids})) FROM {$wpdb->term_relationships} tr"
		. " JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id AND tt.taxonomy = 'category'"
		. " WHERE tr.object_id = {$wpdb->posts}.ID) ASC, {$wpdb->posts}.post_date DESC, {$wpdb->posts}.ID ASC";
}
add_filter( 'posts_orderby', 'wp_ja_kinetic_author_archive_orderby', 10, 2 );

/**
 * Author row excerpt, after `inc/tag-parity.php` (priority 20) renamed its root to the source's
 * `<p class="hx-aupost__e">` (`author/author_posts.php:33`): `core/post-excerpt` nests its own
 * `<p class="wp-block-post-excerpt__excerpt">`, which the HTML parser splits into an empty row
 * excerpt plus two stray `<p>`s. Unwrap it, as `wp_ja_kinetic_blog_row_leaves()` does for blog rows.
 *
 * @param string $block_content The block's rendered HTML.
 * @param array  $block         The parsed block, incl. its attributes.
 * @return string
 */
function wp_ja_kinetic_author_row_excerpt( string $block_content, array $block ): string {
	if ( 'core/post-excerpt' !== ( $block['blockName'] ?? '' ) || 'hx-aupost__e' !== ( $block['attrs']['className'] ?? '' ) ) {
		return $block_content;
	}
	return wp_ja_kinetic_tag_parity_collapse_inner_p( $block_content );
}
add_filter( 'render_block', 'wp_ja_kinetic_author_row_excerpt', 21, 2 );

/**
 * Reading-time estimate in whole minutes, ~200 wpm — the same formula as the source's
 * `kinetic_readtime()` / `kinetic_blog_readtime()` (`article/default.php`, `category/blog.php`).
 *
 * @param string $html Post content HTML.
 * @return int
 */
function wp_ja_kinetic_readtime( string $html ): int {
	$words = str_word_count( wp_strip_all_tags( $html ) );
	return max( 1, (int) ceil( $words / 200 ) );
}

/**
 * Swaps in the author's real portrait when one has been seeded, matching the source: every
 * author card/aside reads an uploaded file, `images/people/<slug>.jpg`
 * (`author_helper.php::kinetic_au_photo()`), falling back to computed initials only when that
 * file is missing. WordPress core has no per-user "photo" field — this theme reads it from a
 * user meta key it defines for that purpose, `wp_ja_kinetic_user_photo` (a full attachment URL;
 * `posts.contract.json` §authors.photo — the seeder must write it from the source's portrait
 * file). Unset, `get_avatar()` falls through to its normal gravatar/default-image behaviour,
 * same as today.
 *
 * `pre_get_avatar_data` (not `get_avatar`, the string filter below) is the one hook that can
 * change the image SOURCE — `get_avatar` only ever gets to reshape the `<img>` markup gravatar
 * already decided on.
 *
 * @param array<string, mixed> $args        Arguments passed to `get_avatar_data()`, `url` key mutable.
 * @param mixed                $id_or_email User/post/comment identifier `get_avatar()` was called with.
 * @return array<string, mixed>
 */
function wp_ja_kinetic_avatar_real_photo( array $args, $id_or_email ): array {
	$user = false;
	if ( $id_or_email instanceof WP_User ) {
		$user = $id_or_email;
	} elseif ( $id_or_email instanceof WP_Post ) {
		$user = get_user_by( 'id', (int) $id_or_email->post_author );
	} elseif ( is_numeric( $id_or_email ) ) {
		$user = get_user_by( 'id', (int) $id_or_email );
	} elseif ( is_string( $id_or_email ) ) {
		$user = get_user_by( 'email', $id_or_email );
	}
	if ( ! $user instanceof WP_User ) {
		return $args;
	}
	$photo = trim( (string) get_the_author_meta( 'wp_ja_kinetic_user_photo', $user->ID ) );
	if ( '' === $photo ) {
		return $args;
	}
	$args['url']         = $photo;
	$args['found_avatar'] = true;
	return $args;
}
add_filter( 'pre_get_avatar_data', 'wp_ja_kinetic_avatar_real_photo', 10, 2 );

/**
 * Marks every avatar image decorative (`aria-hidden="true"`), matching the source: its
 * computed-initials avatar is always `aria-hidden="true"` (`.hx-auav`, `single-article.css`)
 * because the author's name is printed as real text right next to it every time. The single-
 * article template's `wp:avatar` core block renders a bare `<img>` with no block-markup way to
 * add attributes; `get_avatar` is the one filter every avatar path funnels through, including
 * this theme's own `get_avatar()` calls in `author-identity`/`authors-directory` (already wrapped
 * in an `aria-hidden` container there, so the attribute lands twice — harmless, screen readers
 * skip a doubly-hidden node the same as a singly-hidden one).
 *
 * @param string $html The `<img>` markup `get_avatar()` built.
 * @return string
 */
function wp_ja_kinetic_avatar_aria_hidden( string $html ): string {
	if ( '' === $html || false !== strpos( $html, 'aria-hidden' ) ) {
		return $html;
	}
	return (string) preg_replace( '/<img /', '<img aria-hidden="true" ', $html, 1 );
}
add_filter( 'get_avatar', 'wp_ja_kinetic_avatar_aria_hidden' );

/**
 * Author masthead subtitle fallback chain (source `author.php:50-53`): tagline → bio → job
 * title. WordPress has no core "tagline" field; this theme defines one via user meta
 * `wp_ja_kinetic_user_tagline` (`posts.contract.json` §authors.tagline). The core
 * `post-author-biography` block reads `description` through exactly this filter, so hooking
 * it here reaches the masthead's fallback without a custom block.
 *
 * @param string $description The bio `get_the_author_meta( 'description' )` returned.
 * @param int    $user_id     The author whose archive is being viewed.
 * @return string
 */
function wp_ja_kinetic_author_masthead_sub( string $description, int $user_id ): string {
	if ( ! is_author() ) {
		return $description;
	}
	$tagline = trim( (string) get_the_author_meta( 'wp_ja_kinetic_user_tagline', $user_id ) );
	if ( '' !== $tagline ) {
		return $tagline;
	}
	if ( '' !== trim( $description ) ) {
		return $description;
	}
	return trim( (string) get_the_author_meta( 'wp_ja_kinetic_job_title', $user_id ) );
}
add_filter( 'get_the_author_description', 'wp_ja_kinetic_author_masthead_sub', 10, 2 );

/**
 * The tag archive's H1 prefix (`com_tags/tag/default.php:46`: `Tagged: {$tagTitleHtml}`) —
 * core's own archive-title default for a tag is `__( 'Tag: %s' )`. `wp:query-title` with
 * `showPrefix: true` calls `get_the_archive_title()`, which runs this filter, so the source's
 * own wording is reached without a custom block.
 *
 * @param string $title Core's default archive title, incl. its own prefix.
 * @return string
 */
function wp_ja_kinetic_tag_archive_title( string $title ): string {
	if ( ! is_tag() ) {
		return $title;
	}
	return sprintf(
		/* translators: %s: the tag name. */
		__( 'Tagged: %s', 'wp-ja-kinetic' ),
		single_tag_title( '', false )
	);
}
add_filter( 'get_the_archive_title', 'wp_ja_kinetic_tag_archive_title' );

/**
 * Reproduces the source's literal breadcrumb truncation on the single-article view
 * (`article/default.php:110-114`: `mb_substr($hxCrumb, 0, 31) . '…'` when the title is over 32
 * characters) — byte-identical to the source's own cut point, not a CSS ellipsis approximation.
 * Runs as a `render_block` filter targeting the `.hx-bc-current` element specifically
 * (`single.html`'s `wp:post-title` instance standing in for the source's bare
 * `<span class="hx-bc-current">`), so it never touches the Home/category segments.
 *
 * @param string $block_content The block's rendered HTML.
 * @param array  $block         The parsed block, incl. its attributes.
 * @return string
 */
function wp_ja_kinetic_truncate_article_breadcrumb( string $block_content, array $block ): string {
	if ( 'core/post-title' !== ( $block['blockName'] ?? '' ) || false === strpos( $block_content, 'hx-bc-current' ) ) {
		return $block_content;
	}
	return (string) preg_replace_callback(
		'/>([^<]+)</',
		static function ( array $m ): string {
			$text = html_entity_decode( trim( $m[1] ), ENT_QUOTES, 'UTF-8' );
			if ( mb_strlen( $text ) > 32 ) {
				$text = mb_substr( $text, 0, 31 ) . '…';
			}
			return '>' . esc_html( $text ) . '<';
		},
		$block_content
	);
}
add_filter( 'render_block', 'wp_ja_kinetic_truncate_article_breadcrumb', 10, 2 );

/**
 * Character-based truncation matching the source's excerpt cut — every listing/archive excerpt
 * on the source calls `HTMLHelper::_('string.truncate', $text, $length, true, false)`
 * (`Joomla\CMS\HTML\Helpers\StringHelper::truncate()`, the `noSplit=true, allowHtml=false`
 * branch only, read live from `vendor` — no local copy exists in this repo): cut at `$length`
 * UTF-8 characters, back up to the last whole word, then append a literal three-dot "..." — NOT
 * WordPress's own `wp_trim_words()` (word-count based, single-character "…" by default), which
 * is why `core/post-excerpt`'s `excerptLength` attribute (word-based) is never set on this
 * theme's listing templates and this function re-truncates the block's output instead (see
 * `wp_ja_kinetic_truncate_post_excerpt()` below). Ported line-for-line from that method's
 * allowHtml=false path since PHP core has no character-safe, word-boundary equivalent. Verified
 * live 2026-09-23 against the source's own rendered output for article 165 ("What I Wish Someone
 * Told Me…", introtext 153 chars, length 130): both this function and the source cut to
 * "…enough to act on what the...".
 *
 * @param string $text   Plain text (already stripped of tags and trimmed by the caller).
 * @param int    $length Max character length.
 * @return string
 */
function wp_ja_kinetic_joomla_truncate( string $text, int $length ): string {
	if ( $length > 0 && mb_strlen( $text ) > $length ) {
		$tmp    = trim( mb_substr( $text, 0, $length ) );
		$offset = mb_strrpos( $tmp, ' ' );
		if ( false === $offset ) {
			return '...';
		}
		$tmp = mb_substr( $tmp, 0, $offset + 1 );
		if ( mb_strlen( $tmp ) > $length - 3 ) {
			$again = mb_strrpos( $tmp, ' ' );
			if ( false !== $again ) {
				$tmp = trim( mb_substr( $tmp, 0, $again ) );
			}
		}
		$text = trim( $tmp ) . '...';
	}
	// Joomla's own last step, on the whole text, truncated or not (`HTML\Helpers\StringHelper::truncate()`,
	// "Clean up any internal spaces"): a space before any "..." in the text goes too — the source prints
	// "A 'summarize... by' clause" for an intro that reads "summarize ... by".
	return str_replace( array( ' </', ' ...' ), array( '</', '...' ), $text );
}

/**
 * `esc_html()`, but with the trailing three-dot truncation marker protected from `wptexturize()`
 * — `get_the_block_template_html()` (`wp-includes/block-template.php`) runs `wptexturize()` on
 * the WHOLE assembled page after every block has rendered (not through any filterable per-field
 * hook `remove_filter( 'the_excerpt', 'wptexturize' )` in `inc/item-ids.php` can reach), which
 * turns a literal `...` into a single U+2026 `…` character — the source never does this (plain
 * Joomla output, confirmed byte-for-byte via the running source, audit row L-30). `wptexturize()`
 * matches literal ASCII text, so a numeric character reference for each period (`&#46;`, decodes
 * to the same visible/`textContent` "." in every browser) is never seen by its regex and comes
 * out the other side unchanged — the same reason `esc_html()`'s own apostrophe entity already
 * survives it untouched (verified live 2026-09-23: `wouldn&#039;t` stayed straight, not curly).
 *
 * @param string $text Plain text, possibly ending in the literal `...` `wp_ja_kinetic_joomla_
 *                      truncate()` appends.
 * @return string
 */
function wp_ja_kinetic_esc_html_no_texturize( string $text ): string {
	return str_replace( '...', '&#46;&#46;&#46;', esc_html( $text ) );
}

/**
 * `core/post-excerpt` className => the source excerpt truncation length that template's row uses
 * (audit rows L-30 blog/child-category rows, L-49 engineering cards, L-55-adjacent author rows —
 * the featured-card excerpt at 180 is a separate call site, `blocks/field-notes-featured/
 * render.php`, not a `core/post-excerpt` block).
 *
 * @return array<string, int>
 */
function wp_ja_kinetic_excerpt_truncate_lengths(): array {
	return array(
		'hx-blogexcerpt'     => 130, // category/blog_item.php:49 — blog + the 5 child-category rows.
		'hxcat-row__excerpt' => 120, // category/thumbs_item.php:46 — engineering cards.
		'hx-aupost__e'       => 110, // author/author_posts.php:33 — author archive rows.
	);
}

/**
 * Re-cuts `core/post-excerpt`'s rendered text to the source's character-based truncation instead
 * of core's word-based `excerptLength` attribute (none of this theme's listing templates set
 * that attribute, so `get_the_excerpt()` reaches this filter unmodified — full manual excerpt,
 * per `posts.contract.json` §authors is not it, see the top-level excerpt seeding note there).
 * Targets the block by `className` (`wp_ja_kinetic_excerpt_truncate_lengths()`); every other
 * `core/post-excerpt` instance on the site (none currently) passes through untouched.
 *
 * @param string $block_content The block's rendered HTML.
 * @param array  $block         The parsed block, incl. its attributes.
 * @return string
 */
function wp_ja_kinetic_truncate_post_excerpt( string $block_content, array $block ): string {
	if ( 'core/post-excerpt' !== ( $block['blockName'] ?? '' ) ) {
		return $block_content;
	}
	$class  = (string) ( $block['attrs']['className'] ?? '' );
	$length = wp_ja_kinetic_excerpt_truncate_lengths()[ $class ] ?? null;
	if ( null === $length ) {
		return $block_content;
	}
	return (string) preg_replace_callback(
		'#(<p class="wp-block-post-excerpt__excerpt">)(.*?)(</p>)#s',
		static function ( array $m ) use ( $length ): string {
			$text = trim( wp_strip_all_tags( html_entity_decode( $m[2], ENT_QUOTES, 'UTF-8' ) ) );
			if ( '' === $text ) {
				return $m[0];
			}
			return $m[1] . wp_ja_kinetic_esc_html_no_texturize( wp_ja_kinetic_joomla_truncate( $text, $length ) ) . $m[3];
		},
		$block_content
	);
}
add_filter( 'render_block', 'wp_ja_kinetic_truncate_post_excerpt', 10, 2 );

/**
 * Blog row leaves, after `inc/tag-parity.php` (priority 20) renamed their roots. The source
 * (`category/blog_item.php`) prints the text straight inside each leaf —
 * `<time class="hx-blogdate" datetime="…"><span class="hx-blogdate__d">08</span>…`,
 * `<span class="hx-blogdatetxt">Jul 8 2026</span>`, `<p class="hx-blogexcerpt">…</p>` — while
 * `core/post-date` nests its own `<time>` and `core/post-excerpt` its own `<p>` (a `<p>` inside
 * the renamed `<p>` is split by the HTML parser into an empty row excerpt plus two stray `<p>`s).
 * Unwrap both, and carry the `datetime` onto the row's `time.hx-blogdate`.
 *
 * @param string $block_content The block's rendered HTML.
 * @param array  $block         The parsed block, incl. its attributes.
 * @return string
 */
function wp_ja_kinetic_blog_row_leaves( string $block_content, array $block ): string {
	$name  = (string) ( $block['blockName'] ?? '' );
	$class = (string) ( $block['attrs']['className'] ?? '' );
	if ( 'core/post-date' === $name && in_array( $class, array( 'hx-blogdate__d', 'hx-blogdate__m', 'hx-blogdatetxt' ), true ) ) {
		return (string) preg_replace( '#<time\b[^>]*>(.*?)</time>#s', '$1', $block_content );
	}
	if ( 'core/post-excerpt' === $name && 'hx-blogexcerpt' === $class ) {
		return wp_ja_kinetic_tag_parity_collapse_inner_p( $block_content );
	}
	if ( 'core/group' === $name && 'hx-blogdate' === $class ) {
		return (string) preg_replace( '#^(\s*<time\b)#', '$1 datetime="' . esc_attr( (string) get_the_date( 'c' ) ) . '"', $block_content, 1 );
	}
	return $block_content;
}
add_filter( 'render_block', 'wp_ja_kinetic_blog_row_leaves', 21, 2 );

/**
 * Lucide chevron path data for `wp-ja-kinetic/kinetic-pagination` — kept here rather than in
 * the block's own `render.php` because that file is `require`d fresh on every render and a
 * top-level array-returning function would be safe to redeclare-guard but a plain array
 * constant living in the one file loaded once (`functions.php`) is simpler still.
 *
 * @return array<string, string> Icon key => inner `<path>` markup.
 */
function wp_ja_kinetic_pagination_icon_paths(): array {
	return array(
		'first' => '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
		'prev'  => '<path d="m15 18-6-6 6-6"/>',
		'next'  => '<path d="m9 18 6-6-6-6"/>',
		'last'  => '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
	);
}

/**
 * One `<li class="page-item">` around a rail-end icon link (first/prev/next/last), matching
 * the source's Joomla pagination markup (`Pagination::getPagesLinks()`, icon override at
 * `html/layouts/joomla/pagination/link.php`).
 *
 * @param int|false $page  Target page number, or false when this end is disabled (edge of
 *                         the range — the source's own disabled state carries no href).
 * @param string    $icon  Key into `wp_ja_kinetic_pagination_icon_paths()`.
 * @param string    $label `aria-label` for the link; unused when disabled.
 * @return string
 */
function wp_ja_kinetic_pagination_icon( $page, string $icon, string $label ): string {
	$paths  = wp_ja_kinetic_pagination_icon_paths();
	$markup = '<svg class="hx-pag-ico" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ( $paths[ $icon ] ?? '' ) . '</svg>';
	if ( false === $page ) {
		return '<li class="disabled page-item"><span class="page-link" aria-hidden="true">' . $markup . '</span></li>';
	}
	return '<li class="page-item"><a aria-label="' . esc_attr( $label ) . '" href="' . esc_url( wp_ja_kinetic_pagenum_link( $page, 0 ) ) . '" class="page-link">' . $markup . '</a></li>';
}

/**
 * The page numbers the pager lists — Joomla core's fixed 10-page sliding window
 * (`libraries/src/Pagination/Pagination.php:183-199`, `$displayedPages = 10`), no "…":
 * start at `current - 5` (floored at 1); if that window would run past the last page, pin it
 * to the last 10 instead. Measured live on the source's `/product/blog` (11 pages): page 1 and
 * page 2 list 1–10, page 11 lists 2–11.
 *
 * @param int $current Current page.
 * @param int $max     Total pages.
 * @return int[]
 */
function wp_ja_kinetic_pagination_targets( int $current, int $max ): array {
	$displayed = 10;
	$start     = max( 1, $current - intdiv( $displayed, 2 ) );
	if ( $start + $displayed > $max ) {
		return range( max( 1, $max - $displayed + 1 ), $max );
	}
	return range( $start, $start + $displayed - 1 );
}

/**
 * The "Page X of Y" counter markup for `wp-ja-kinetic/kinetic-pagination`.
 *
 * @param string $class   The `class` attribute to use.
 * @param int    $current Current page.
 * @param int    $max     Total pages.
 * @return string
 */
function wp_ja_kinetic_pagination_counter( string $class, int $current, int $max ): string {
	return '<p class="' . esc_attr( $class ) . '">' . esc_html(
		sprintf(
			/* translators: 1: current page, 2: total pages. */
			__( 'Page %1$d of %2$d', 'wp-ja-kinetic' ),
			$current,
			$max
		)
	) . '</p>';
}
