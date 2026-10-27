<?php
/**
 * Title: Theme switch (error page)
 * Slug: wp-ja-nova/theme-toggle-404
 * Description: The light / dark switch at the corner of the error page (templates/404.html). Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-nova
 * Inserter: no
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:html -->
<button type="button" class="jn-theme-toggle jn-404__toggle" data-tracy-theme-toggle aria-pressed="false" aria-label="<?php echo esc_attr__( 'Theme: automatic. Switch to light', 'wp-ja-nova' ); ?>"><svg class="jn-theme-toggle__moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><svg class="jn-theme-toggle__sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></button>
<!-- /wp:html -->
