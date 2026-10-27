<?php
/**
 * Title: Service cards
 * Slug: wp-ja-nova/section-cards
 * Description: A section title with a coloured word, a grid of cards (an icon in a tinted disc, a title and a line, the whole card a link), and a closing line with a button (Joomla ACM features-intro style-2).
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: cards, services, grid, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-cards","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-cards">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-sec__head","layout":{"type":"default"}} -->
<div class="wp-block-group jn-sec__head">
<!-- wp:heading {"className":"jn-sec__title","metadata":{"role":"content","name":"features-intro.main-section"}} -->
<h2 class="wp-block-heading jn-sec__title"><?php esc_html_e( 'A section title', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
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
<!-- wp:group {"className":"jn-sec__foot","metadata":{"name":"features-intro.foot"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-sec__foot">
<!-- wp:paragraph {"className":"jn-sec__bottom-desc","metadata":{"role":"content","name":"features-intro.bottom-desc"}} -->
<p class="jn-sec__bottom-desc"><?php esc_html_e( 'A closing line under the section.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"jn-actions jn-actions--center"} -->
<div class="wp-block-buttons jn-actions jn-actions--center">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"features-intro.title-btn"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'View all', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
