<?php
/**
 * Title: Service cards (inside an article)
 * Slug: wp-ja-nova/section-cards-inline
 * Description: The grid of service cards an article carries in its body (an icon in a tinted disc, a title and a line, the whole card a link), without a section title or closing line (Joomla ACM features-intro style-2 loaded with loadmoduleid).
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: cards, services, grid, acm, inline
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"className":"jn-cards jn-cards--inline","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-cards jn-cards--inline">
<!-- wp:group {"className":"jn-cards__grid acm-features-intro--cols-3","metadata":{"name":"features-intro.grid"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-cards__grid acm-features-intro--cols-3">
<!-- wp:group {"className":"jn-card","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-card">
<!-- wp:image {"sizeSlug":"full","className":"jn-card__icon","metadata":{"role":"content","name":"features-intro.img-icon.1"}} -->
<figure class="wp-block-image size-full jn-card__icon"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":4,"className":"jn-card__title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<h4 class="wp-block-heading jn-card__title"><a href="#"><?php esc_html_e( 'A service', 'wp-ja-nova' ); ?></a></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-card__desc","metadata":{"role":"content","name":"features-intro.description.1"}} -->
<p class="jn-card__desc"><?php esc_html_e( 'One or two lines about it.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
