<?php
/**
 * Title: Team grid
 * Slug: wp-ja-kinetic/section-teams
 * Description: A card grid of people: avatar or initials chip, name, role, a short bio and social links, under an eyebrow and heading. Every spec section of type `teams`.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: team, people, members, staff, roster, avatars
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"section","className":"ja-acm acm-teams style-1"} -->
<section class="wp-block-group ja-acm acm-teams style-1">
<!-- wp:group {"className":"hx-section"} -->
<div class="wp-block-group hx-section">
<!-- wp:group {"className":"hx-container hx-pad"} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-team-head"} -->
<div class="wp-block-group hx-team-head">
<!-- wp:paragraph {"className":"hx-eyebrow","metadata":{"role":"content","name":"teams.eyebrow"}} -->
<p class="hx-eyebrow"><?php esc_html_e( '(04) / THE TEAM', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"hx-h2","metadata":{"role":"content","name":"teams.title"}} -->
<h2 class="wp-block-heading hx-h2"><?php esc_html_e( 'The people behind Kinetic', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-team-sub","metadata":{"role":"content","name":"teams.sub"}} -->
<p class="hx-team-sub"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-cols hx-cols-4","metadata":{"name":"teams.columns"}} -->
<div class="wp-block-group hx-cols hx-cols-4">
<!-- wp:group {"className":"hx-card hx-team-card","metadata":{"name":"teams.item.1"}} -->
<div class="wp-block-group hx-card hx-team-card">
<!-- wp:image {"className":"hx-team-avatar","metadata":{"role":"content","name":"teams.avatar.1"}} -->
<figure class="wp-block-image hx-team-avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Dana Whitfield', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"hx-team-id"} -->
<div class="wp-block-group hx-team-id">
<!-- wp:heading {"level":3,"className":"hx-team-name","metadata":{"role":"content","name":"teams.name.1"}} -->
<h3 class="wp-block-heading hx-team-name"><?php esc_html_e( 'Dana Whitfield', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-team-role","metadata":{"role":"content","name":"teams.role.1"}} -->
<p class="hx-team-role"><?php esc_html_e( 'Co-founder & CEO', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-team-bio","metadata":{"role":"content","name":"teams.bio.1"}} -->
<p class="hx-team-bio"></p>
<!-- /wp:paragraph -->
<!-- wp:social-links {"className":"hx-team-social is-style-logos-only","metadata":{"role":"content","name":"teams.socials.1"}} -->
<ul class="wp-block-social-links is-style-logos-only hx-team-social"><!-- wp:social-link {"url":"https://github.com","service":"github","className":"hx-team-social-link"} /--><!-- wp:social-link {"url":"https://linkedin.com","service":"linkedin","className":"hx-team-social-link"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card hx-team-card","metadata":{"name":"teams.item.2"}} -->
<div class="wp-block-group hx-card hx-team-card">
<!-- wp:image {"className":"hx-team-avatar","metadata":{"role":"content","name":"teams.avatar.2"}} -->
<figure class="wp-block-image hx-team-avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Arjun Mehta', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"hx-team-id"} -->
<div class="wp-block-group hx-team-id">
<!-- wp:heading {"level":3,"className":"hx-team-name","metadata":{"role":"content","name":"teams.name.2"}} -->
<h3 class="wp-block-heading hx-team-name"><?php esc_html_e( 'Arjun Mehta', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-team-role","metadata":{"role":"content","name":"teams.role.2"}} -->
<p class="hx-team-role"><?php esc_html_e( 'Co-founder & CTO', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-team-bio","metadata":{"role":"content","name":"teams.bio.2"}} -->
<p class="hx-team-bio"></p>
<!-- /wp:paragraph -->
<!-- wp:social-links {"className":"hx-team-social is-style-logos-only","metadata":{"role":"content","name":"teams.socials.2"}} -->
<ul class="wp-block-social-links is-style-logos-only hx-team-social"><!-- wp:social-link {"url":"https://github.com","service":"github","className":"hx-team-social-link"} /--><!-- wp:social-link {"url":"https://x.com","service":"x","className":"hx-team-social-link"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card hx-team-card","metadata":{"name":"teams.item.3"}} -->
<div class="wp-block-group hx-card hx-team-card">
<!-- wp:image {"className":"hx-team-avatar","metadata":{"role":"content","name":"teams.avatar.3"}} -->
<figure class="wp-block-image hx-team-avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Lena Park', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"hx-team-id"} -->
<div class="wp-block-group hx-team-id">
<!-- wp:heading {"level":3,"className":"hx-team-name","metadata":{"role":"content","name":"teams.name.3"}} -->
<h3 class="wp-block-heading hx-team-name"><?php esc_html_e( 'Lena Park', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-team-role","metadata":{"role":"content","name":"teams.role.3"}} -->
<p class="hx-team-role"><?php esc_html_e( 'VP Engineering', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-team-bio","metadata":{"role":"content","name":"teams.bio.3"}} -->
<p class="hx-team-bio"></p>
<!-- /wp:paragraph -->
<!-- wp:social-links {"className":"hx-team-social is-style-logos-only","metadata":{"role":"content","name":"teams.socials.3"}} -->
<ul class="wp-block-social-links is-style-logos-only hx-team-social"><!-- wp:social-link {"url":"https://x.com","service":"x","className":"hx-team-social-link"} /--><!-- wp:social-link {"url":"https://linkedin.com","service":"linkedin","className":"hx-team-social-link"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card hx-team-card","metadata":{"name":"teams.item.4"}} -->
<div class="wp-block-group hx-card hx-team-card">
<!-- wp:image {"className":"hx-team-avatar","metadata":{"role":"content","name":"teams.avatar.4"}} -->
<figure class="wp-block-image hx-team-avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Tomás Rivera', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"hx-team-id"} -->
<div class="wp-block-group hx-team-id">
<!-- wp:heading {"level":3,"className":"hx-team-name","metadata":{"role":"content","name":"teams.name.4"}} -->
<h3 class="wp-block-heading hx-team-name"><?php esc_html_e( 'Tomás Rivera', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-team-role","metadata":{"role":"content","name":"teams.role.4"}} -->
<p class="hx-team-role"><?php esc_html_e( 'Head of Product', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-team-bio","metadata":{"role":"content","name":"teams.bio.4"}} -->
<p class="hx-team-bio"></p>
<!-- /wp:paragraph -->
<!-- wp:social-links {"className":"hx-team-social is-style-logos-only","metadata":{"role":"content","name":"teams.socials.4"}} -->
<ul class="wp-block-social-links is-style-logos-only hx-team-social"><!-- wp:social-link {"url":"https://github.com","service":"github","className":"hx-team-social-link"} /--><!-- wp:social-link {"url":"https://x.com","service":"x","className":"hx-team-social-link"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card hx-team-card","metadata":{"name":"teams.item.5"}} -->
<div class="wp-block-group hx-card hx-team-card">
<!-- wp:image {"className":"hx-team-avatar","metadata":{"role":"content","name":"teams.avatar.5"}} -->
<figure class="wp-block-image hx-team-avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Marcus Lee', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"hx-team-id"} -->
<div class="wp-block-group hx-team-id">
<!-- wp:heading {"level":3,"className":"hx-team-name","metadata":{"role":"content","name":"teams.name.5"}} -->
<h3 class="wp-block-heading hx-team-name"><?php esc_html_e( 'Marcus Lee', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-team-role","metadata":{"role":"content","name":"teams.role.5"}} -->
<p class="hx-team-role"><?php esc_html_e( 'Staff Engineer', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-team-bio","metadata":{"role":"content","name":"teams.bio.5"}} -->
<p class="hx-team-bio"></p>
<!-- /wp:paragraph -->
<!-- wp:social-links {"className":"hx-team-social is-style-logos-only","metadata":{"role":"content","name":"teams.socials.5"}} -->
<ul class="wp-block-social-links is-style-logos-only hx-team-social"><!-- wp:social-link {"url":"https://github.com","service":"github","className":"hx-team-social-link"} /--><!-- wp:social-link {"url":"https://linkedin.com","service":"linkedin","className":"hx-team-social-link"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card hx-team-card","metadata":{"name":"teams.item.6"}} -->
<div class="wp-block-group hx-card hx-team-card">
<!-- wp:image {"className":"hx-team-avatar","metadata":{"role":"content","name":"teams.avatar.6"}} -->
<figure class="wp-block-image hx-team-avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Sofia Alvarez', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"hx-team-id"} -->
<div class="wp-block-group hx-team-id">
<!-- wp:heading {"level":3,"className":"hx-team-name","metadata":{"role":"content","name":"teams.name.6"}} -->
<h3 class="wp-block-heading hx-team-name"><?php esc_html_e( 'Sofia Alvarez', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-team-role","metadata":{"role":"content","name":"teams.role.6"}} -->
<p class="hx-team-role"><?php esc_html_e( 'Platform Eng Lead', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-team-bio","metadata":{"role":"content","name":"teams.bio.6"}} -->
<p class="hx-team-bio"></p>
<!-- /wp:paragraph -->
<!-- wp:social-links {"className":"hx-team-social is-style-logos-only","metadata":{"role":"content","name":"teams.socials.6"}} -->
<ul class="wp-block-social-links is-style-logos-only hx-team-social"><!-- wp:social-link {"url":"https://x.com","service":"x","className":"hx-team-social-link"} /--><!-- wp:social-link {"url":"https://github.com","service":"github","className":"hx-team-social-link"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card hx-team-card","metadata":{"name":"teams.item.7"}} -->
<div class="wp-block-group hx-card hx-team-card">
<!-- wp:image {"className":"hx-team-avatar","metadata":{"role":"content","name":"teams.avatar.7"}} -->
<figure class="wp-block-image hx-team-avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Priya Raman', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"hx-team-id"} -->
<div class="wp-block-group hx-team-id">
<!-- wp:heading {"level":3,"className":"hx-team-name","metadata":{"role":"content","name":"teams.name.7"}} -->
<h3 class="wp-block-heading hx-team-name"><?php esc_html_e( 'Priya Raman', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-team-role","metadata":{"role":"content","name":"teams.role.7"}} -->
<p class="hx-team-role"><?php esc_html_e( 'Head of SRE', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-team-bio","metadata":{"role":"content","name":"teams.bio.7"}} -->
<p class="hx-team-bio"></p>
<!-- /wp:paragraph -->
<!-- wp:social-links {"className":"hx-team-social is-style-logos-only","metadata":{"role":"content","name":"teams.socials.7"}} -->
<ul class="wp-block-social-links is-style-logos-only hx-team-social"><!-- wp:social-link {"url":"https://linkedin.com","service":"linkedin","className":"hx-team-social-link"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card hx-team-card","metadata":{"name":"teams.item.8"}} -->
<div class="wp-block-group hx-card hx-team-card">
<!-- wp:paragraph {"className":"hx-team-chip","metadata":{"role":"content","name":"teams.initials.8"}} -->
<p class="hx-team-chip"><?php esc_html_e( 'JK', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-team-id"} -->
<div class="wp-block-group hx-team-id">
<!-- wp:heading {"level":3,"className":"hx-team-name","metadata":{"role":"content","name":"teams.name.8"}} -->
<h3 class="wp-block-heading hx-team-name"><?php esc_html_e( 'Jordan Kim', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-team-role","metadata":{"role":"content","name":"teams.role.8"}} -->
<p class="hx-team-role"><?php esc_html_e( 'Senior SRE', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-team-bio","metadata":{"role":"content","name":"teams.bio.8"}} -->
<p class="hx-team-bio"></p>
<!-- /wp:paragraph -->
<!-- wp:social-links {"className":"hx-team-social is-style-logos-only","metadata":{"role":"content","name":"teams.socials.8"}} -->
<ul class="wp-block-social-links is-style-logos-only hx-team-social"><!-- wp:social-link {"url":"https://github.com","service":"github","className":"hx-team-social-link"} /--></ul>
<!-- /wp:social-links -->
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
