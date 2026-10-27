<?php
/**
 * Title: Team carousel
 * Slug: wp-ja-nova/section-teams
 * Description: A heading with a coloured phrase beside two arrow buttons, then team members in a carousel (portrait, name, role), and a button under it (Joomla ACM teams style-1).
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: team, people, carousel, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-teams","metadata":{"name":"teams.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-teams">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"tracy-motion-carousel tracy-motion-carousel--nav jn-teams__carousel","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-carousel tracy-motion-carousel--nav jn-teams__carousel">
<!-- wp:paragraph {"className":"jn-teams__desc","metadata":{"role":"content","name":"teams.team-desc"}} -->
<p class="jn-teams__desc"><?php esc_html_e( 'This is why our team is so famous!', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"tracy-motion-track jn-teams__track","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track jn-teams__track">
<!-- wp:group {"className":"tracy-motion-slide jn-teams__item","metadata":{"name":"teams.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-slide jn-teams__item">
<!-- wp:image {"sizeSlug":"full","linkDestination":"custom","className":"jn-teams__img","metadata":{"role":"content","name":"teams.img.1"}} -->
<figure class="wp-block-image size-full jn-teams__img"><a href="#"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></a></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":4,"className":"jn-teams__name","metadata":{"role":"content","name":"teams.title.1"}} -->
<h4 class="wp-block-heading jn-teams__name"><a href="#"><?php esc_html_e( 'A name', 'wp-ja-nova' ); ?></a></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-teams__role","metadata":{"role":"content","name":"teams.team-position.1"}} -->
<p class="jn-teams__role"><?php esc_html_e( 'A role', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-sec__foot","metadata":{"name":"teams.foot"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-sec__foot">
<!-- wp:buttons {"className":"jn-actions jn-actions--center"} -->
<div class="wp-block-buttons jn-actions jn-actions--center">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"teams.title-btn"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Join our team', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
