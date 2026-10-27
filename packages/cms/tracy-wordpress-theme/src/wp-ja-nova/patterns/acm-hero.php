<?php
/**
 * Title: Hero
 * Slug: wp-ja-nova/section-hero
 * Description: The JA Nova home hero (Joomla ACM `hero` style-1): a centred headline with up to two coloured words, a lead, a call to action, over a decor picture that frames the copy.
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: hero, header, banner, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-hero","metadata":{"name":"hero.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-hero">
<!-- wp:image {"sizeSlug":"full","className":"jn-hero__decor","metadata":{"role":"content","name":"hero.image-decor"}} -->
<figure class="wp-block-image size-full jn-hero__decor"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"jn-hero__content","layout":{"type":"default"}} -->
<div class="wp-block-group jn-hero__content">
<!-- wp:heading {"level":1,"className":"jn-hero__title","metadata":{"role":"content","name":"hero.title"}} -->
<h1 class="wp-block-heading jn-hero__title"><span class="jn-accent jn-accent--1"><?php esc_html_e( 'We make', 'wp-ja-nova' ); ?></span> <?php esc_html_e( 'world-class work that helps you', 'wp-ja-nova' ); ?> <span class="jn-accent jn-accent--2"><?php esc_html_e( 'grow faster', 'wp-ja-nova' ); ?></span></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-hero__desc","metadata":{"role":"content","name":"hero.desc"}} -->
<p class="jn-hero__desc"><?php esc_html_e( 'A lead of two lines that says what the company does.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"jn-actions jn-actions--center"} -->
<div class="wp-block-buttons jn-actions jn-actions--center">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"hero.button"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Get started', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"is-style-outline tracy-btn tracy-btn--ghost","metadata":{"role":"content","name":"hero.button-2"}} -->
<div class="wp-block-button is-style-outline tracy-btn tracy-btn--ghost"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Learn more', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
