<?php
/**
 * Title: Team — grid
 * Slug: tracy-base/section-team-grid
 * Description: Eyebrow, heading and four members, each a round portrait, a name, a role and a short bio — the Joomla ACM block `team` in `style-1` (`columns=4`; drop `lg:grid-cols-4` for `lg:grid-cols-3`). The per-member link is not carried: `link-label` and every `member-link` are empty on both source instances.
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: team, people, members, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section acm-team acm-team--grid acm-team--cols-4 py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section acm-team acm-team--grid acm-team--cols-4 py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-section__inner max-w-page mx-auto"} -->
<div class="wp-block-group tracy-section__inner max-w-page mx-auto">
<!-- wp:group {"className":"tracy-section__head max-w-[62ch] mb-8"} -->
<div class="wp-block-group tracy-section__head max-w-[62ch] mb-8">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"team.eyebrow"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'The people', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"text-2xl mb-0","metadata":{"role":"content","name":"team.heading"}} -->
<h2 class="wp-block-heading text-2xl mb-0"><?php esc_html_e( 'Different skills. A shared standard.', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-grid acm-team__grid grid gap-8 grid-cols-2 lg:grid-cols-4"} -->
<div class="wp-block-group tracy-grid acm-team__grid grid gap-8 grid-cols-2 lg:grid-cols-4">
<!-- wp:group {"className":"acm-team__member","metadata":{"name":"team.item.1"}} -->
<div class="wp-block-group acm-team__member">
<!-- wp:image {"aspectRatio":"1","scale":"cover","sizeSlug":"medium","className":"acm-team__portrait w-[8rem] rounded-pill overflow-hidden mb-3","metadata":{"role":"content","name":"team.member-portrait.1"}} -->
<figure class="wp-block-image size-medium acm-team__portrait w-[8rem] rounded-pill overflow-hidden mb-3"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Adam Hale', 'tracy-base' ); ?>" style="aspect-ratio:1;object-fit:cover"/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":3,"className":"text-lg mb-1","metadata":{"role":"content","name":"team.member-name.1"}} -->
<h3 class="wp-block-heading text-lg mb-1"><?php esc_html_e( 'Adam Hale', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"team.member-role.1"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Design Director', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"text-sm text-fg-2 mb-0","metadata":{"role":"content","name":"team.member-bio.1"}} -->
<p class="text-sm text-fg-2 mb-0"><?php esc_html_e( 'Shapes the visual direction and keeps each page focused on its audience.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-team__member","metadata":{"name":"team.item.2"}} -->
<div class="wp-block-group acm-team__member">
<!-- wp:image {"aspectRatio":"1","scale":"cover","sizeSlug":"medium","className":"acm-team__portrait w-[8rem] rounded-pill overflow-hidden mb-3","metadata":{"role":"content","name":"team.member-portrait.2"}} -->
<figure class="wp-block-image size-medium acm-team__portrait w-[8rem] rounded-pill overflow-hidden mb-3"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Peter Lang', 'tracy-base' ); ?>" style="aspect-ratio:1;object-fit:cover"/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":3,"className":"text-lg mb-1","metadata":{"role":"content","name":"team.member-name.2"}} -->
<h3 class="wp-block-heading text-lg mb-1"><?php esc_html_e( 'Peter Lang', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"team.member-role.2"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Development Lead', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"text-sm text-fg-2 mb-0","metadata":{"role":"content","name":"team.member-bio.2"}} -->
<p class="text-sm text-fg-2 mb-0"><?php esc_html_e( 'Turns the design into sections the team can maintain.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-team__member","metadata":{"name":"team.item.3"}} -->
<div class="wp-block-group acm-team__member">
<!-- wp:image {"aspectRatio":"1","scale":"cover","sizeSlug":"medium","className":"acm-team__portrait w-[8rem] rounded-pill overflow-hidden mb-3","metadata":{"role":"content","name":"team.member-portrait.3"}} -->
<figure class="wp-block-image size-medium acm-team__portrait w-[8rem] rounded-pill overflow-hidden mb-3"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Sofia Lindqvist', 'tracy-base' ); ?>" style="aspect-ratio:1;object-fit:cover"/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":3,"className":"text-lg mb-1","metadata":{"role":"content","name":"team.member-name.3"}} -->
<h3 class="wp-block-heading text-lg mb-1"><?php esc_html_e( 'Sofia Lindqvist', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"team.member-role.3"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Brand Designer', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"text-sm text-fg-2 mb-0","metadata":{"role":"content","name":"team.member-bio.3"}} -->
<p class="text-sm text-fg-2 mb-0"><?php esc_html_e( 'Connects the identity, words and images across the experience.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-team__member","metadata":{"name":"team.item.4"}} -->
<div class="wp-block-group acm-team__member">
<!-- wp:image {"aspectRatio":"1","scale":"cover","sizeSlug":"medium","className":"acm-team__portrait w-[8rem] rounded-pill overflow-hidden mb-3","metadata":{"role":"content","name":"team.member-portrait.4"}} -->
<figure class="wp-block-image size-medium acm-team__portrait w-[8rem] rounded-pill overflow-hidden mb-3"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Lucas Meyer', 'tracy-base' ); ?>" style="aspect-ratio:1;object-fit:cover"/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":3,"className":"text-lg mb-1","metadata":{"role":"content","name":"team.member-name.4"}} -->
<h3 class="wp-block-heading text-lg mb-1"><?php esc_html_e( 'Lucas Meyer', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"team.member-role.4"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Research Lead', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"text-sm text-fg-2 mb-0","metadata":{"role":"content","name":"team.member-bio.4"}} -->
<p class="text-sm text-fg-2 mb-0"><?php esc_html_e( 'Brings customer questions into the project from the start.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
