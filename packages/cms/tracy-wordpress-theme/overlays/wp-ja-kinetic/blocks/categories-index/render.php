<?php
/**
 * wp-ja-kinetic/categories-index — the source's "All Categories" index
 * (`html/com_content/categories/default.php`, `.hx-cats`): every category with at least one
 * published post, an icon, its post count, name and description.
 *
 * The icon is a Joomla custom category field (a Lucide icon name) with no WordPress core
 * equivalent. Three-step lookup, in order (`posts.contract.json` §categoryIcon):
 *   1. term meta `wp_ja_kinetic_icon` on the category — an icon NAME (e.g. `grid`), not raw SVG:
 *      this block only ever echoes SVG path data from its own fixed set below, never term meta
 *      content directly, so a bad/unknown value here cannot inject markup.
 *   2. `wp_ja_kinetic_category_icon_paths()`'s slug map, for the six categories measured on the
 *      running source 2026-09-22 (path data copied verbatim, `aria-hidden`/`stroke-width` and all)
 *      — a reasonable default for those exact categories when no term meta is set.
 *   3. the source's own generic glyph for an unknown icon name
 *      (`acm/features-ledger/tmpl/style-1.php`'s `kinetic_fl_lucide()` fallback) — not a guess,
 *      the source's own fallback.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

/**
 * Icon name → the inner markup of its Lucide icon (everything between <svg ...> and </svg>),
 * copied verbatim from the running source. The known set a term meta value is checked against.
 *
 * @return array<string, string>
 */
function wp_ja_kinetic_category_icon_paths(): array {
	return array(
		'grid'           => '<path d="M12 20v2"/><path d="M12 2v2"/><path d="M17 20v2"/><path d="M17 2v2"/><path d="M2 12h2"/><path d="M2 17h2"/><path d="M2 7h2"/><path d="M20 12h2"/><path d="M20 17h2"/><path d="M20 7h2"/><path d="M7 20v2"/><path d="M7 2v2"/><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
		'heart-pulse'    => '<path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z"/><path d="M21 12h1"/><path d="M18.5 4.5 18 5"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="m4.929 4.929.707.707"/><path d="M12 12v6"/>',
		'package'        => '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
		'graduation-cap' => '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
		'target'         => '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>',
		'users'          => '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
	);
}

/**
 * Category slug → icon name, for the six categories measured on the running source 2026-09-22 —
 * step 2 of the lookup in the file header. Not used at all once a category carries its own
 * `wp_ja_kinetic_icon` term meta.
 *
 * @return array<string, string>
 */
function wp_ja_kinetic_category_default_icons(): array {
	return array(
		'engineering'     => 'grid',
		'incident-retros' => 'heart-pulse',
		'product'         => 'package',
		'tutorials'       => 'graduation-cap',
		'practice'        => 'target',
		'culture'         => 'users',
	);
}

$wp_ja_kinetic_icons        = wp_ja_kinetic_category_icon_paths();
$wp_ja_kinetic_default_icon = wp_ja_kinetic_category_default_icons();
$wp_ja_kinetic_fallback     = '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/>';
// Source `com_content/categories/default.php:61` — `$items[$this->parent->id]`, ONLY the
// direct children of the blog's parent category (`field-notes-from-the-on-call`), never the
// parent itself. `get_categories(['hide_empty'=>true])` with no `parent` filter returns every
// category flat, including that parent — measured live: WP listed 7 (6 children + the parent),
// the source lists exactly the 6 children (Engineering, Incident retros, Product, Tutorials,
// Practice, Culture, in the source's own admin-configured category order — WordPress's `term_id`
// insertion order is used here as the closest native equivalent; no plugin-free WP mechanism
// carries an arbitrary admin-dragged category order).
$wp_ja_kinetic_parent = wp_ja_kinetic_field_notes_term();
if ( $wp_ja_kinetic_parent ) {
	$wp_ja_kinetic_categories = get_categories(
		array(
			'hide_empty' => true,
			'parent'     => $wp_ja_kinetic_parent->term_id,
			'orderby'    => 'id',
			'order'      => 'ASC',
		)
	);
} else {
	// No field-notes-from-the-on-call term seeded yet — fall back to every category rather
	// than rendering an empty page, same reasoning as `wp_ja_kinetic_field_notes_term()`'s own
	// callers elsewhere in this theme.
	$wp_ja_kinetic_categories = get_categories( array( 'hide_empty' => true ) );
}
if ( ! $wp_ja_kinetic_categories ) {
	return;
}
?>
<div class="com-content-categories hx-cats hx-content">
	<header class="hx-cats-mast hx-grid-bg">
		<div class="hx-container hx-pad">
			<span class="hx-cats-pill"><span class="hx-cats-pill__dot" aria-hidden="true"></span><?php esc_html_e( 'BLOG', 'wp-ja-kinetic' ); ?></span>
			<h1 class="hx-cats-title"><?php esc_html_e( 'All Categories', 'wp-ja-kinetic' ); ?></h1>
			<p class="hx-cats-sub"><?php esc_html_e( 'Browse every topic we write about, from incident retros to product tutorials.', 'wp-ja-kinetic' ); ?></p>
		</div>
	</header>
	<section class="hx-cats-body">
		<div class="hx-container hx-pad">
			<div class="hx-cats-grid">
				<?php foreach ( $wp_ja_kinetic_categories as $wp_ja_kinetic_cat ) : ?>
					<?php
					$wp_ja_kinetic_icon_name = get_term_meta( $wp_ja_kinetic_cat->term_id, 'wp_ja_kinetic_icon', true );
					if ( ! is_string( $wp_ja_kinetic_icon_name ) || ! isset( $wp_ja_kinetic_icons[ $wp_ja_kinetic_icon_name ] ) ) {
						$wp_ja_kinetic_icon_name = $wp_ja_kinetic_default_icon[ $wp_ja_kinetic_cat->slug ] ?? '';
					}
					$wp_ja_kinetic_icon = $wp_ja_kinetic_icons[ $wp_ja_kinetic_icon_name ] ?? $wp_ja_kinetic_fallback;
					?>
					<a class="hx-cat-card" href="<?php echo esc_url( get_category_link( $wp_ja_kinetic_cat ) ); ?>">
						<span class="hx-cat-hd">
							<span class="hx-cat-tile"><svg class="hx-cat-ic" xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><?php echo $wp_ja_kinetic_icon; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed, verbatim-source SVG path data, not user input. ?></svg></span>
							<span class="hx-cat-count"><?php echo esc_html( (string) $wp_ja_kinetic_cat->count ); ?> <?php esc_html_e( 'posts', 'wp-ja-kinetic' ); ?></span>
						</span>
						<span class="hx-cat-name"><?php echo esc_html( $wp_ja_kinetic_cat->name ); ?></span>
						<?php if ( '' !== $wp_ja_kinetic_cat->description ) : ?>
							<span class="hx-cat-desc"><?php echo esc_html( $wp_ja_kinetic_cat->description ); ?></span>
						<?php endif; ?>
					</a>
				<?php endforeach; ?>
			</div>
		</div>
	</section>
</div>
