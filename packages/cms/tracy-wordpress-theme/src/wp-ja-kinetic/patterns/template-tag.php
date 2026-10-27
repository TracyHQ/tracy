<?php
/**
 * Title: Template body: tag
 * Slug: wp-ja-kinetic/template-tag
 * Description: The body of templates/tag.html between the header and the footer. Its interface words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-kinetic
 * Inserter: no
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"main","className":"com-tags com-tags-tag tag-category","layout":{"type":"default"}} -->
<main class="wp-block-group com-tags com-tags-tag tag-category">
<!-- wp:group {"className":"com-tags__masthead kinetic-tags-masthead hx-grid-bg","layout":{"type":"default"}} -->
<div class="wp-block-group com-tags__masthead kinetic-tags-masthead hx-grid-bg">
<!-- wp:group {"className":"hx-container kinetic-tags-mast-inner","layout":{"type":"default"}} -->
<div class="wp-block-group hx-container kinetic-tags-mast-inner">
<!-- wp:group {"tagName":"nav","className":"hx-author__bc kinetic-tags-bc"} -->
<nav class="wp-block-group hx-author__bc kinetic-tags-bc" aria-label="Breadcrumb">
<!-- wp:paragraph -->
<p><a class="hx-author__bc-home" href="/"><?php echo esc_html__( 'Home', 'wp-ja-kinetic' ); ?></a><span class="hx-author__bc-trail">/ <a class="hx-author__bc-link" href="/pages/tags"><?php echo esc_html__( 'Tags', 'wp-ja-kinetic' ); ?></a> / </span></p>
<!-- /wp:paragraph -->
<!-- wp:wp-ja-kinetic/current-term-name /-->
</nav>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-eyebrow kinetic-eyebrow kinetic-tags-eyebrow"} -->
<p class="hx-eyebrow kinetic-eyebrow kinetic-tags-eyebrow"><?php echo esc_html__( 'TAGGED', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:query-title {"type":"archive","level":1,"className":"hx-h1 com-tags__title kinetic-tags-h1","showPrefix":true} /-->
<!-- wp:term-description {"className":"hx-mast-sub com-tags__sub kinetic-tags-sub"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"com-tags__list-wrap hx-section","layout":{"type":"default"}} -->
<div class="wp-block-group com-tags__list-wrap hx-section">
<!-- wp:group {"className":"hx-container","layout":{"type":"default"}} -->
<div class="wp-block-group hx-container">
<!-- wp:group {"className":"com-tags__items","layout":{"type":"default"}} -->
<div class="wp-block-group com-tags__items">
<!-- wp:query {"queryId":1,"query":{"perPage":20,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"title","inherit":true},"className":"com-tags__rows","layout":{"type":"default"}} -->
<div class="wp-block-query com-tags__rows">
<!-- wp:post-template {"layout":{"type":"default"}} -->
<!-- wp:group {"className":"hx-tagcard com-tags__row","layout":{"type":"default"}} -->
<div class="wp-block-group hx-tagcard com-tags__row">
<!-- wp:group {"className":"com-tags__row-main","layout":{"type":"default"}} -->
<div class="wp-block-group com-tags__row-main">
<!-- wp:post-terms {"term":"category","className":"com-tags__row-eyebrow"} /-->
<!-- wp:post-title {"level":0,"isLink":true,"className":"hx-blogtitle com-tags__row-title"} /-->
<!-- wp:group {"className":"com-tags__row-meta","layout":{"type":"default"}} -->
<div class="wp-block-group com-tags__row-meta">
<!-- wp:post-author-name {"className":"com-tags__row-author"} /-->
<!-- wp:paragraph {"className":"com-tags__row-dot"} -->
<p class="com-tags__row-dot" aria-hidden="true">&middot;</p>
<!-- /wp:paragraph -->
<!-- wp:post-date {"className":"com-tags__row-date"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"com-tags__row-chevron"} -->
<p class="com-tags__row-chevron" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph {"className":"alert alert-info com-tags__empty"} -->
<p class="alert alert-info com-tags__empty"><?php echo esc_html__( 'There are no articles with this tag.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"com-tags-tag__pagination w-100","layout":{"type":"default"}} -->
<div class="wp-block-group com-tags-tag__pagination w-100">
<!-- wp:wp-ja-kinetic/kinetic-pagination {"counterFirst":true,"counterClassName":"counter float-end pt-3 pe-2"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</main>
<!-- /wp:group -->
