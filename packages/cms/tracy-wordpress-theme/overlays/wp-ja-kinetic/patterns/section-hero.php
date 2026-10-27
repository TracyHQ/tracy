<?php
/**
 * Title: Hero
 * Slug: wp-ja-kinetic/section-hero
 * Description: Full-bleed grid-and-glow band: mono eyebrow, display heading, intro, a primary button and a terminal-style ghost button, a trust line, and the terminal panel image on the right (one image per design direction, the active one revealed by CSS). Every spec section of type `hero`.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: hero, masthead, landing, terminal, kinetic
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"className":"ja-acm acm-hero style-1"} -->
<div class="wp-block-group ja-acm acm-hero style-1">
<!-- wp:group {"className":"hx-container hx-pad acm-hero-inner"} -->
<div class="wp-block-group hx-container hx-pad acm-hero-inner">
<!-- wp:group {"className":"hx-hero-grid"} -->
<div class="wp-block-group hx-hero-grid">
<!-- wp:group {"className":"acm-hero-copy"} -->
<div class="wp-block-group acm-hero-copy">
<!-- wp:paragraph {"className":"hx-eyebrow","metadata":{"role":"content","name":"hero.eyebrow"}} -->
<p class="hx-eyebrow"><?php esc_html_e( '// observability, reimagined', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1,"className":"hx-h1","metadata":{"role":"content","name":"hero.title"}} -->
<h1 class="wp-block-heading hx-h1"><?php esc_html_e( 'Ship fast. Sleep through the night.', 'wp-ja-kinetic' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-sub","metadata":{"role":"content","name":"hero.sub"}} -->
<p class="hx-sub"><?php esc_html_e( 'Kinetic unifies metrics, logs and traces into one on-call workflow — so you find the failing span before your users do.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"hx-btnrow"} -->
<div class="wp-block-buttons hx-btnrow">
<!-- wp:button {"className":"hx-btn hx-btn--primary","metadata":{"role":"content","name":"hero.cta1"}} -->
<div class="wp-block-button hx-btn hx-btn--primary"><a class="wp-block-button__link wp-element-button" href="/pages/register"><?php esc_html_e( 'Start free', 'wp-ja-kinetic' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"hx-btn hx-btn--ghost","metadata":{"role":"content","name":"hero.cta2"}} -->
<div class="wp-block-button hx-btn hx-btn--ghost"><a class="wp-block-button__link wp-element-button" href="/pages/register"><?php esc_html_e( 'kinetic init', 'wp-ja-kinetic' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
<!-- wp:group {"className":"hx-trust"} -->
<div class="wp-block-group hx-trust">
<!-- wp:paragraph {"className":"acm-hero-trust","metadata":{"role":"content","name":"hero.trust"}} -->
<p class="acm-hero-trust"><?php esc_html_e( 'Trusted by 2,000+ on-call teams', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-hero-visual"} -->
<div class="wp-block-group acm-hero-visual">
<!-- wp:image {"sizeSlug":"large","className":"hx-panelimg is-terminal","metadata":{"role":"content","name":"hero.image_terminal"}} -->
<figure class="wp-block-image size-large hx-panelimg is-terminal"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/hero-terminal-panel-terminal.webp' ) ); ?>" alt="<?php esc_attr_e( 'Ship fast. Sleep through the night.', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:image {"sizeSlug":"large","className":"hx-panelimg is-blueprint","metadata":{"role":"content","name":"hero.image_blueprint"}} -->
<figure class="wp-block-image size-large hx-panelimg is-blueprint"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/hero-terminal-panel-blueprint.webp' ) ); ?>" alt="<?php esc_attr_e( 'Ship fast. Sleep through the night.', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:image {"sizeSlug":"large","className":"hx-panelimg is-signal","metadata":{"role":"content","name":"hero.image_signal"}} -->
<figure class="wp-block-image size-large hx-panelimg is-signal"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/hero-terminal-panel-signal.webp' ) ); ?>" alt="<?php esc_attr_e( 'Ship fast. Sleep through the night.', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
