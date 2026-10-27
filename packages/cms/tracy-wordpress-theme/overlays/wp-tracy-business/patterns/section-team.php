<?php
/**
 * Title: Team
 * Slug: wp-tracy-business/section-team
 * Description: Ink band: heading, then four portrait cards — square image, name, orange role (item meta), one-line bio (item text). Every spec section of type `team`.
 * Categories: wp-tracy-business, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: team, leadership, people, portraits
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"tagName":"section","className":"wtb-section wtb-team"} -->
<section class="wp-block-group wtb-section wtb-team">
<!-- wp:group {"className":"wtb-inner"} -->
<div class="wp-block-group wtb-inner">
<!-- wp:group {"className":"wtb-head"} -->
<div class="wp-block-group wtb-head">
<!-- wp:paragraph {"className":"wtb-eyebrow","metadata":{"role":"content","name":"team.eyebrow"}} -->
<p class="wtb-eyebrow"><?php esc_html_e( 'People', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"wtb-heading","metadata":{"role":"content","name":"team.heading"}} -->
<h2 class="wp-block-heading wtb-heading"><?php esc_html_e( 'Leadership', 'wp-tracy-business' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-intro","metadata":{"role":"content","name":"team.intro"}} -->
<p class="wtb-intro"><?php esc_html_e( 'The people who sign for schedule, quality and safety.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-team__grid"} -->
<div class="wp-block-group wtb-team__grid">
<!-- wp:group {"className":"wtb-team__item","metadata":{"name":"team.item.1"}} -->
<div class="wp-block-group wtb-team__item">
<!-- wp:image {"className":"wtb-team__media","sizeSlug":"large","metadata":{"role":"content","name":"team.item.1.img"}} -->
<figure class="wp-block-image size-large wtb-team__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Andrey Kulagin', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":3,"className":"wtb-team__name","metadata":{"role":"content","name":"team.item.1.title"}} -->
<h3 class="wp-block-heading wtb-team__name"><?php esc_html_e( 'Andrey Kulagin', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-team__role","metadata":{"role":"content","name":"team.item.1.meta"}} -->
<p class="wtb-team__role"><?php esc_html_e( 'Chief Executive Officer', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-team__bio","metadata":{"role":"content","name":"team.item.1.text"}} -->
<p class="wtb-team__bio"><?php esc_html_e( 'With the company since 2007, started as a site manager.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-team__item","metadata":{"name":"team.item.2"}} -->
<div class="wp-block-group wtb-team__item">
<!-- wp:image {"className":"wtb-team__media","sizeSlug":"large","metadata":{"role":"content","name":"team.item.2.img"}} -->
<figure class="wp-block-image size-large wtb-team__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Sergey Trofimov', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":3,"className":"wtb-team__name","metadata":{"role":"content","name":"team.item.2.title"}} -->
<h3 class="wp-block-heading wtb-team__name"><?php esc_html_e( 'Sergey Trofimov', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-team__role","metadata":{"role":"content","name":"team.item.2.meta"}} -->
<p class="wtb-team__role"><?php esc_html_e( 'Lead Project Engineer', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-team__bio","metadata":{"role":"content","name":"team.item.2.text"}} -->
<p class="wtb-team__bio"><?php esc_html_e( 'Owns structural design and the technical solution on every project.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-team__item","metadata":{"name":"team.item.3"}} -->
<div class="wp-block-group wtb-team__item">
<!-- wp:image {"className":"wtb-team__media","sizeSlug":"large","metadata":{"role":"content","name":"team.item.3.img"}} -->
<figure class="wp-block-image size-large wtb-team__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Olga Barsukova', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":3,"className":"wtb-team__name","metadata":{"role":"content","name":"team.item.3.title"}} -->
<h3 class="wp-block-heading wtb-team__name"><?php esc_html_e( 'Olga Barsukova', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-team__role","metadata":{"role":"content","name":"team.item.3.meta"}} -->
<p class="wtb-team__role"><?php esc_html_e( 'Production Director', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-team__bio","metadata":{"role":"content","name":"team.item.3.text"}} -->
<p class="wtb-team__bio"><?php esc_html_e( 'The Vorsino plant and delivery logistics to site.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-team__item","metadata":{"name":"team.item.4"}} -->
<div class="wp-block-group wtb-team__item">
<!-- wp:image {"className":"wtb-team__media","sizeSlug":"large","metadata":{"role":"content","name":"team.item.4.img"}} -->
<figure class="wp-block-image size-large wtb-team__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Igor Meshcheryakov', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":3,"className":"wtb-team__name","metadata":{"role":"content","name":"team.item.4.title"}} -->
<h3 class="wp-block-heading wtb-team__name"><?php esc_html_e( 'Igor Meshcheryakov', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-team__role","metadata":{"role":"content","name":"team.item.4.meta"}} -->
<p class="wtb-team__role"><?php esc_html_e( 'Construction Director', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-team__bio","metadata":{"role":"content","name":"team.item.4.text"}} -->
<p class="wtb-team__bio"><?php esc_html_e( 'Erection crews, schedule and site safety.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
