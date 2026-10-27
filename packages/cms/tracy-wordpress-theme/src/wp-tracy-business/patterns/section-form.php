<?php
/**
 * Title: Form
 * Slug: wp-tracy-business/section-form
 * Description: Two columns: the form card (a note paragraph and the Contact Form 7 shortcode the seeder points at the seeded form) and, on the right, the map image and a bordered list of contact channels (items: title, text, link). Every spec section of type `form`. Core blocks have no form block: the fields live in the CF7 form, not in the pattern.
 * Categories: wp-tracy-business, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: form, contact form, request, map, channels
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"tagName":"section","className":"wtb-section wtb-form"} -->
<section class="wp-block-group wtb-section wtb-form">
<!-- wp:group {"className":"wtb-inner wtb-form__inner"} -->
<div class="wp-block-group wtb-inner wtb-form__inner">
<!-- wp:group {"className":"wtb-form__card"} -->
<div class="wp-block-group wtb-form__card">
<!-- wp:paragraph {"className":"wtb-form__note","metadata":{"role":"content","name":"form.intro"}} -->
<p class="wtb-form__note"><?php esc_html_e( 'Fields marked * are required. Attaching drawings lets us give you a far more accurate take-off.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:shortcode {"metadata":{"role":"content","name":"form.embed"}} -->
[contact-form-7 title="Contact"]
<!-- /wp:shortcode -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-form__aside"} -->
<div class="wp-block-group wtb-form__aside">
<!-- wp:group {"className":"wtb-form__head"} -->
<div class="wp-block-group wtb-form__head">
<!-- wp:paragraph {"className":"wtb-eyebrow","metadata":{"role":"content","name":"form.eyebrow"}} -->
<p class="wtb-eyebrow"><?php esc_html_e( 'Social profiles', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"wtb-heading","metadata":{"role":"content","name":"form.heading"}} -->
<h3 class="wp-block-heading wtb-heading"><?php esc_html_e( 'Where to follow the work', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:image {"className":"wtb-form__map","sizeSlug":"large","metadata":{"role":"content","name":"form.img"}} -->
<figure class="wp-block-image size-large wtb-form__map"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Map of the head office', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"wtb-form__list"} -->
<div class="wp-block-group wtb-form__list">
<!-- wp:group {"className":"wtb-form__row","metadata":{"name":"form.item.1"}} -->
<div class="wp-block-group wtb-form__row">
<!-- wp:paragraph {"className":"wtb-form__row-title","metadata":{"role":"content","name":"form.item.1.title"}} -->
<p class="wtb-form__row-title"><?php esc_html_e( 'Telegram', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-form__row-text","metadata":{"role":"content","name":"form.item.1.text"}} -->
<p class="wtb-form__row-text"><?php esc_html_e( 'Site progress and tender announcements', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-form__row-meta","metadata":{"role":"content","name":"form.item.1.meta"}} -->
<p class="wtb-form__row-meta"><?php esc_html_e( 't.me/northgate_ind', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-form__row-link","metadata":{"role":"content","name":"form.item.1.href"}} -->
<p class="wtb-form__row-link"><a href="#"><?php esc_html_e( 'Open ↗', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-form__row","metadata":{"name":"form.item.2"}} -->
<div class="wp-block-group wtb-form__row">
<!-- wp:paragraph {"className":"wtb-form__row-title","metadata":{"role":"content","name":"form.item.2.title"}} -->
<p class="wtb-form__row-title"><?php esc_html_e( 'VK', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-form__row-text","metadata":{"role":"content","name":"form.item.2.text"}} -->
<p class="wtb-form__row-text"><?php esc_html_e( 'Company news and life on site', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-form__row-meta","metadata":{"role":"content","name":"form.item.2.meta"}} -->
<p class="wtb-form__row-meta"><?php esc_html_e( 't.me/northgate_ind', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-form__row-link","metadata":{"role":"content","name":"form.item.2.href"}} -->
<p class="wtb-form__row-link"><a href="#"><?php esc_html_e( 'Open ↗', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-form__row","metadata":{"name":"form.item.3"}} -->
<div class="wp-block-group wtb-form__row">
<!-- wp:paragraph {"className":"wtb-form__row-title","metadata":{"role":"content","name":"form.item.3.title"}} -->
<p class="wtb-form__row-title"><?php esc_html_e( 'LinkedIn', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-form__row-text","metadata":{"role":"content","name":"form.item.3.text"}} -->
<p class="wtb-form__row-text"><?php esc_html_e( 'Corporate updates in English', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-form__row-meta","metadata":{"role":"content","name":"form.item.3.meta"}} -->
<p class="wtb-form__row-meta"><?php esc_html_e( 't.me/northgate_ind', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-form__row-link","metadata":{"role":"content","name":"form.item.3.href"}} -->
<p class="wtb-form__row-link"><a href="#"><?php esc_html_e( 'Open ↗', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-form__row","metadata":{"name":"form.item.4"}} -->
<div class="wp-block-group wtb-form__row">
<!-- wp:paragraph {"className":"wtb-form__row-title","metadata":{"role":"content","name":"form.item.4.title"}} -->
<p class="wtb-form__row-title"><?php esc_html_e( 'YouTube', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-form__row-text","metadata":{"role":"content","name":"form.item.4.text"}} -->
<p class="wtb-form__row-text"><?php esc_html_e( 'Erection footage and site time-lapses', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-form__row-meta","metadata":{"role":"content","name":"form.item.4.meta"}} -->
<p class="wtb-form__row-meta"><?php esc_html_e( 't.me/northgate_ind', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-form__row-link","metadata":{"role":"content","name":"form.item.4.href"}} -->
<p class="wtb-form__row-link"><a href="#"><?php esc_html_e( 'Open ↗', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
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
