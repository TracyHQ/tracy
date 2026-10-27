<?php
/**
 * Title: Feature with picture
 * Slug: wp-ja-nova/section-feature
 * Description: A picture on one side and, on the other, a heading with a coloured word, a paragraph, a list of points (each with an icon or a check mark), and a line of proof beside a button (Joomla ACM `features-intro` style-1). The picture side follows the section's `is-left` / `is-right` class.
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: feature, split, picture, list, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-feature","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-feature">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-feature__row is-right","metadata":{"name":"features-intro.row"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-feature__row is-right">
<!-- wp:image {"sizeSlug":"full","className":"jn-feature__media","metadata":{"role":"content","name":"features-intro.intro-img"}} -->
<figure class="wp-block-image size-full jn-feature__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"jn-feature__info","layout":{"type":"default"}} -->
<div class="wp-block-group jn-feature__info">
<!-- wp:heading {"className":"jn-feature__title","metadata":{"role":"content","name":"features-intro.info-title"}} -->
<h2 class="wp-block-heading jn-feature__title"><?php esc_html_e( 'The just', 'wp-ja-nova' ); ?> <span class="jn-accent jn-accent--1"><?php esc_html_e( 'investigation', 'wp-ja-nova' ); ?></span> <?php esc_html_e( 'apparatus you need', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-feature__desc","metadata":{"role":"content","name":"features-intro.info-desc"}} -->
<p class="jn-feature__desc"><?php esc_html_e( 'A paragraph that says why this matters.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"jn-feature__list","metadata":{"name":"features-intro.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-feature__list">
<!-- wp:group {"className":"jn-feature__item","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-feature__item">
<!-- wp:image {"sizeSlug":"full","className":"jn-feature__item-icon","metadata":{"role":"content","name":"features-intro.intro.1"}} -->
<figure class="wp-block-image size-full jn-feature__item-icon"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"jn-feature__item-body","layout":{"type":"default"}} -->
<div class="wp-block-group jn-feature__item-body">
<!-- wp:heading {"level":4,"className":"jn-feature__item-title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<h4 class="wp-block-heading jn-feature__item-title"><?php esc_html_e( 'A point', 'wp-ja-nova' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-feature__item-desc","metadata":{"role":"content","name":"features-intro.desc.1"}} -->
<p class="jn-feature__item-desc"><?php esc_html_e( 'One line about it.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-feature__cta","metadata":{"name":"features-intro.cta"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-feature__cta">
<!-- wp:group {"className":"jn-feature__more","layout":{"type":"default"}} -->
<div class="wp-block-group jn-feature__more">
<!-- wp:image {"sizeSlug":"full","className":"jn-feature__more-icon","metadata":{"role":"content","name":"features-intro.info-icon"}} -->
<figure class="wp-block-image size-full jn-feature__more-icon"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"jn-feature__more-text","metadata":{"role":"content","name":"features-intro.info-cta"}} -->
<p class="jn-feature__more-text"><?php esc_html_e( 'More than 350 brands available', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"jn-actions"} -->
<div class="wp-block-buttons jn-actions">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"features-intro.button"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Contact us', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
