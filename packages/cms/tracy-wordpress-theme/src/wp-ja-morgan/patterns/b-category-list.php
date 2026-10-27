<?php
/**
 * Title: Category list
 * Slug: wp-ja-morgan/b-category-list
 * Description: The List All Categories page of JA Morgan: each sub-category of the blog as a bordered card (picture, name with its article count, description), two to a row.
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Inserter: no
 *
 * @package wp-ja-morgan
 */

$slugs = function_exists( 'wp_ja_morgan_b_category_slugs' ) ? wp_ja_morgan_b_category_slugs() : array();
?>
<!-- wp:html -->
<div class="categories-list row">
<?php
foreach ( $slugs as $slug ) :
	$term = get_term_by( 'slug', $slug, 'category' );
	if ( ! $term ) {
		continue;
	}
	$img = wp_get_attachment_image_url( (int) get_term_meta( $term->term_id, 'thumbnail_id', true ), 'full' );
	?>
<div class="category-item col-md-6">
<div class="category-item-inner">
<?php if ( $img ) : ?>
<div class="item-img"><img src="<?php echo esc_url( $img ); ?>" alt="<?php echo esc_attr( $slug ); ?>" /></div>
<?php endif; ?>
<h3 class="page-header item-title"><a href="<?php echo esc_url( get_term_link( $term ) ); ?>"><?php echo esc_html( html_entity_decode( $term->name ) ); ?></a>
<span class="badge badge-info"><?php echo (int) $term->count; ?></span></h3>
<div class="category-desc"><?php echo wp_kses_post( $term->description ); ?></div>
</div>
</div>
<?php endforeach; ?>
</div>
<!-- /wp:html -->
