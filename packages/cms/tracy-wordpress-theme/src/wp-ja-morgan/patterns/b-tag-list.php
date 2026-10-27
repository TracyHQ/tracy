<?php
/**
 * Title: Tag list
 * Slug: wp-ja-morgan/b-tag-list
 * Description: The List of all tags page of JA Morgan: a filter bar, then every tag as a card with its picture, name, first words and hit count, three to a row.
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Inserter: no
 *
 * @package wp-ja-morgan
 */

$jm_params = wp_ja_morgan_b_filter_params();
$cards     = function_exists( 'wp_ja_morgan_b_tag_cards' ) ? wp_ja_morgan_b_filter_cards( wp_ja_morgan_b_tag_cards(), $jm_params ) : array();
$rows      = array_chunk( $cards, 3, true );
?>
<!-- wp:html -->
<div class="tag-category">
<?php echo wp_ja_morgan_b_filter_form( $jm_params ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in the builder. ?>
<div class="tag-list-results">
<?php foreach ( $rows as $row ) : ?>
<div class="cats-list row">
<?php
foreach ( $row as $slug => $card ) :
	$term = get_term_by( 'slug', $slug, 'post_tag' );
	// A tag no post carries has no term here (WordPress keeps none), so it points at the tagged-items listing like `morgan`.
	$link = ( 'morgan' === $slug || ! $term ) ? home_url( '/joomlart-content/tagged-items/' ) : get_term_link( $term );
	$name = $term ? $term->name : ucfirst( $slug );
	$img = wp_ja_morgan_b_media( $card[0] );
	?>
<div class="col-sm-4">
<div class="item">
<div class="tag-body"><div class="item-image"><?php echo $img ? '<img src="' . esc_url( $img ) . '" alt=""/>' : ''; ?></div></div>
<h3><a href="<?php echo esc_url( is_wp_error( $link ) ? '#' : $link ); ?>"><?php echo esc_html( $name ); ?></a></h3>
<div class="caption">
<div class="tag-body"><p><?php echo esc_html( $card[1] ); ?></p>...</div>
<span class="list-hits badge badge-info">Hits: <?php echo (int) $card[2]; ?></span>
</div>
</div>
</div>
<?php endforeach; ?>
</div>
<?php endforeach; ?>
</div>
<?php if ( ! $cards ) : ?><p class="alert alert-info"><?php esc_html_e( 'No tags match this filter.', 'wp-ja-morgan' ); ?></p><?php endif; ?>
</div>
<!-- /wp:html -->
