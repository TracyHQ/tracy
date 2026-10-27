<?php
/**
 * Title: Template body: 404
 * Slug: wp-ja-kinetic/template-404
 * Description: The body of the error page (templates/404.html) between the header and the footer: the code, the heading, the line about the request, the Back home and Contact support buttons and the quick links. A link to a page the site does not publish is left out, so a page the owner took away never leads back to this error. Its interface words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-kinetic
 * Inserter: no
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"main","className":"hx-error-body","layout":{"type":"default"}} -->
<main class="wp-block-group hx-error-body">
<!-- wp:group {"className":"hx-error-inner","layout":{"type":"default"},"metadata":{"name":"404.body"}} -->
<div class="wp-block-group hx-error-inner">
<!-- wp:paragraph {"className":"hx-error-eyebrow"} -->
<p class="hx-error-eyebrow"><?php echo esc_html__( '// 404 · TRACE NOT FOUND', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:html -->
<div class="hx-error-code" aria-hidden="true">404</div>
<!-- /wp:html -->
<!-- wp:heading {"level":1,"className":"hx-error-h1"} -->
<h1 class="wp-block-heading hx-error-h1"><?php echo esc_html__( 'This span dropped off the timeline', 'wp-ja-kinetic' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-error-sub"} -->
<p class="hx-error-sub"><?php echo esc_html__( 'The page you’re after doesn’t exist or was moved. Let’s get you back to a known-good state.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:html -->
<div class="hx-error-btns">
  <a class="hx-btn hx-btn--primary hx-btn--error-p" href="<?php echo esc_url( home_url( '/' ) ); ?>">
    <?php echo esc_html__( 'Back home', 'wp-ja-kinetic' ); ?>
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
  </a>
<?php if ( '' !== wp_ja_kinetic_live_page_url( 'company/contact' ) ) : ?>
  <a class="hx-btn hx-btn--error-s" href="<?php echo esc_url( wp_ja_kinetic_live_page_url( 'company/contact' ) ); ?>">
    <?php echo esc_html__( 'Contact support', 'wp-ja-kinetic' ); ?>
  </a>
<?php endif; ?>
</div>
<!-- /wp:html -->
<!-- wp:html -->
<div class="hx-error-quick">
  <?php echo wp_ja_kinetic_live_page_link( 'product/features', __( 'Features', 'wp-ja-kinetic' ) ); ?>
  <?php echo wp_ja_kinetic_live_page_link( 'pricing', __( 'Pricing', 'wp-ja-kinetic' ) ); ?>
  <?php echo wp_ja_kinetic_live_page_link( 'product/faq', __( 'FAQ', 'wp-ja-kinetic' ) ); ?>
  <?php echo wp_ja_kinetic_live_page_link( 'company/about', __( 'About', 'wp-ja-kinetic' ) ); ?>
</div>
<!-- /wp:html -->
</div>
<!-- /wp:group -->
</main>
<!-- /wp:group -->
