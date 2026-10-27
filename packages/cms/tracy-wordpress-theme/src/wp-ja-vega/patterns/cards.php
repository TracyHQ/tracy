<?php
/**
 * Title: Cards
 * Slug: tracy/cards
 * Categories: query
 * Block Types: core/query
 * Description: The listing: a query loop of cards — image, a meta line (author, category, date), name (title), excerpt. Used by the blog and archive templates and by the seeded listing pages.
 *
 * JA Vega (M4c): the source's article cards open their text with "By <author> – <category> –
 * <date>" (M6: in the markup after the title, shown first — the source's `.article-aside`, order -1) (Joomla article info, 14 px); portfolio cards show the category alone, as a chip. The
 * meta line carries all three and the stylesheet shows what each listing shows. M6 (G62): the author's
 * picture (core/avatar, 24 px, round) opens the byline, as the source's `.createdby .author-img`.
 * G9: a portfolio card lists Client / Date / Type under its text: post meta jv_client, jv_date,
 * jv_type bound to the value paragraphs (source `.list-portfolio-info`).
 * The pager prints arrows without words and every page number, as the source's Joomla pagination
 * (core attributes showLabel / paginationArrow / midSize, editable in the block toolbar; M4d F12).
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:query {"queryId":1,"query":{"perPage":6,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"tracy-query","layout":{"type":"default"}} -->
<div class="wp-block-query tracy-query">
<!-- wp:post-template {"className":"tracy-grid","layout":{"type":"grid","columnCount":3}} -->
<!-- wp:group {"className":"tracy-card","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-card">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"4/3","className":"tracy-card__media"} /-->
<!-- wp:group {"className":"tracy-card__body","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-card__body">
<!-- wp:post-title {"level":3,"isLink":true,"className":"tracy-card__title"} /-->
<!-- wp:group {"className":"tracy-card__meta","layout":{"type":"flex","flexWrap":"wrap"}} -->
<div class="wp-block-group tracy-card__meta">
<!-- wp:avatar {"size":24,"className":"tracy-card__avatar"} /-->
<!-- wp:post-author-name {"className":"tracy-card__author"} /-->
<!-- wp:post-terms {"term":"category","className":"tracy-eyebrow"} /-->
<!-- wp:post-date {"className":"tracy-card__date"} /-->
</div>
<!-- /wp:group -->
<!-- wp:post-excerpt {"excerptLength":24,"className":"tracy-card__text"} /-->
<!-- wp:group {"className":"jv-portfolio-info","layout":{"type":"default"}} -->
<div class="wp-block-group jv-portfolio-info">
<!-- wp:group {"className":"jv-portfolio-info__row","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group jv-portfolio-info__row">
<!-- wp:paragraph {"className":"jv-portfolio-info__label"} -->
<p class="jv-portfolio-info__label"><?php esc_html_e( 'Client:', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jv-portfolio-info__value","metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"jv_client"}}}}} -->
<p class="jv-portfolio-info__value"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-portfolio-info__row","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group jv-portfolio-info__row">
<!-- wp:paragraph {"className":"jv-portfolio-info__label"} -->
<p class="jv-portfolio-info__label"><?php esc_html_e( 'Date:', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jv-portfolio-info__value","metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"jv_date"}}}}} -->
<p class="jv-portfolio-info__value"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-portfolio-info__row","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group jv-portfolio-info__row">
<!-- wp:paragraph {"className":"jv-portfolio-info__label"} -->
<p class="jv-portfolio-info__label"><?php esc_html_e( 'Type:', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jv-portfolio-info__value","metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"jv_type"}}}}} -->
<p class="jv-portfolio-info__value"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph {"className":"tracy-muted"} -->
<p class="tracy-muted">Nothing here yet.</p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
<!-- wp:query-pagination {"paginationArrow":"chevron","showLabel":false,"className":"tracy-pagination","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers {"midSize":4} /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
