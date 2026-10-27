<?php
/**
 * Title: Menu feature
 * Slug: tracy-base/section-menu-feature
 * Description: A promotional card for a mega-menu panel: image, eyebrow, title, one line and an action — the Joomla ACM block `menu-feature`. The source makes the whole card one link; core blocks cannot wrap a group in an anchor, so the action paragraph carries the link and `sections-extra.css` stretches it over the card.
 * Categories: tracy-base, tracy
 * Viewport Width: 400
 * Inserter: yes
 * Keywords: menu, feature, promo, card, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"className":"acm-menu-feature tracy-card overflow-hidden"} -->
<div class="wp-block-group acm-menu-feature tracy-card overflow-hidden">
<!-- wp:image {"aspectRatio":"16/10","scale":"cover","sizeSlug":"medium","className":"acm-menu-feature__image tracy-card__media m-0","metadata":{"role":"content","name":"menu-feature.image"}} -->
<figure class="wp-block-image size-medium acm-menu-feature__image tracy-card__media m-0"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Illustrative studio workspace with website concepts', 'tracy-base' ); ?>" style="aspect-ratio:16/10;object-fit:cover"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"acm-menu-feature__body tracy-card__body p-6"} -->
<div class="wp-block-group acm-menu-feature__body tracy-card__body p-6">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"menu-feature.eyebrow"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'From idea to launch', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"menu-feature.title"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'Website design & build', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-sm text-fg-2 mb-3","metadata":{"role":"content","name":"menu-feature.description"}} -->
<p class="text-sm text-fg-2 mb-3"><?php esc_html_e( 'A clear plan, a considered design and a site your team can maintain.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-menu-feature__action text-sm mb-0","metadata":{"role":"content","name":"menu-feature.action"}} -->
<p class="acm-menu-feature__action text-sm mb-0"><a href="#"><?php esc_html_e( 'Explore the service', 'tracy-base' ); ?> ↗</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
